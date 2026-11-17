"""
F3K Fashion Atelier — combine node.
Prompt broadcast BEFORE encoding/sampling.
Preview via custom guider (built from denoised x0, not from noisy x).
Custom sigmas are actually used (guider.sample with explicit sigmas).
JSON/Linear switch reads from exec_config.
"""

import json
import logging
import base64
import io as pyio
from PIL import Image, ImageOps
from comfy_api.latest import io

import comfy.sample
import comfy.samplers
import comfy.model_management
import comfy.utils
import latent_preview

try:
    from server import PromptServer
except ImportError:
    PromptServer = None

from . import combine_logic as L


class F3K_FashionAtelier(io.ComfyNode):

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="F3K_FashionAtelier",
            display_name="👗 F3K Fashion Atelier",
            category="F3K/atelier",
            description="Fashion atelier combine node for Flux 3 Klein.",

            inputs=[
                io.Model.Input("model", display_name="MODEL"),
                io.Clip.Input("clip",   display_name="CLIP (Klein)"),
                io.Clip.Input("clip_upsampler", display_name="CLIP (Upsampler Qwen3.5-9B)",
                              optional=True),
                io.Vae.Input("vae",     display_name="VAE"),
                io.Image.Input("pose_image", display_name="Pose (stickman)", optional=True),

                io.String.Input("node_id_hidden", default="0",
                                socketless=True, extra_dict={"hidden": True}),
                io.String.Input("slots_config",   default="{}",
                                socketless=True, extra_dict={"hidden": True}),
                io.String.Input("control_config", default="{}",
                                socketless=True, extra_dict={"hidden": True}),
                io.String.Input("prompt_config",  default="{}",
                                socketless=True, extra_dict={"hidden": True}),
                io.String.Input("exec_config",    default="{}",
                                socketless=True, extra_dict={"hidden": True}),
                io.String.Input("output_config",  default="{}",
                                socketless=True, extra_dict={"hidden": True}),
            ],

            outputs=[
                io.Image.Output(display_name="IMAGE"),
                io.String.Output(display_name="PROMPT"),
            ],
        )

    @classmethod
    def execute(cls, model, clip, vae,
                clip_upsampler=None,
                pose_image=None,
                node_id_hidden="0",
                slots_config="{}", control_config="{}",
                prompt_config="{}",
                exec_config="{}", output_config="{}",
                unique_id=None,
                **kwargs) -> io.NodeOutput:

        # ---------- resolve node id ----------
        node_id_str = None
        if node_id_hidden is not None and str(node_id_hidden) not in ("", "0", "None"):
            node_id_str = str(node_id_hidden)
        elif unique_id is not None:
            node_id_str = str(unique_id)

        ctrl = L.parse_control_config(control_config)
        steps = int(ctrl["steps"])
        aggression = float(ctrl["aggression"])
        seed = int(ctrl["seed"])
        scale_by = float(ctrl["scale_by"])
        use_upsampler = bool(ctrl["upsampler"])

        # ---------- exec_config: формат промпта ----------
        try:
            exec_cfg = json.loads(exec_config) if exec_config else {}
        except Exception:
            exec_cfg = {}
        prompt_format = exec_cfg.get("format", "json")  # "json" | "linear"

        # ---------- Slots ----------
        slot_images, slot_labels = L.collect_slot_images(slots_config)
        print(f"[F3K] slots active: {slot_labels}")

        if pose_image is not None:
            slot_images.append(pose_image)
            slot_labels.append("pose")
            print("[F3K] pose image connected")

        # ---------- Build prompt (оба варианта) ----------
        linear_prompt = L.assemble_prompt_linear(prompt_config)
        json_prompt = L.assemble_prompt_json(prompt_config)

        # ---------- Upsampler или переключатель ----------
        if use_upsampler and clip_upsampler is not None and slot_images:
            try:
                final_prompt = L.run_upsampler(
                    clip_upsampler, linear_prompt, slot_images,
                    seed=int(ctrl.get("upsampler_seed", seed)),
                )
            except Exception as e:
                print(f"[F3K] upsampler failed: {e}")
                final_prompt = linear_prompt
        else:
            if prompt_format == "linear":
                final_prompt = linear_prompt
            else:
                final_prompt = json_prompt

        print(f"[F3K] prompt format: {prompt_format} "
              f"(upsampler={use_upsampler}) "
              f"prompt_len={len(final_prompt)}")

        # ============================================================
        # SEND PROMPT TO UI BEFORE ENCODING/SAMPLING
        # ============================================================
        if PromptServer is not None and node_id_str is not None:
            try:
                sid = getattr(PromptServer.instance, "client_id", None)
                PromptServer.instance.send_sync(
                    "f3k_atelier_prompt",
                    {"node_id": node_id_str, "prompt": final_prompt},
                    sid,
                )
                print(f"[F3K] prompt broadcast ({len(final_prompt)} chars) node_id={node_id_str}")
            except Exception as e:
                print(f"[F3K] prompt send failed: {e}")

        # ---------- Conditioning ----------
        tokens = clip.tokenize(final_prompt)
        positive = clip.encode_from_tokens_scheduled(tokens)
        positive = L.apply_reference_latents(positive, vae, slot_images)
        negative = clip.encode_from_tokens_scheduled(clip.tokenize(""))

        # ---------- Latent ----------
        latent, out_w, out_h = L.build_empty_latent(slot_images, vae, scale_by)
        print(f"[F3K] latent: {out_w}×{out_h} "
              f"(scale_by={scale_by}, channels={latent['samples'].shape[1]})")

        # ---------- Sigmas ----------
        sigmas = L.interpolate_sigmas(steps, aggression)
        print(f"[F3K] sigmas: {[round(float(s),4) for s in sigmas.tolist()]}")

        # ---------- Preview helper ----------
        previewer = None
        try:
            previewer = latent_preview.get_previewer(
                model.load_device, model.model.latent_format
            )
        except Exception as e:
            print(f"[F3K] previewer init failed: {e}")

        node_id_for_preview = node_id_str
        total_steps = max(int(sigmas.shape[-1]) - 1, 1)

        class F3KGuider(comfy.samplers.CFGGuider):
            def __init__(self, model_patcher):
                super().__init__(model_patcher)
                self._step = 0
                self._total = total_steps

            def predict_noise(self, x, timestep, model_options={}, seed=None):
                try:
                    step_idx = int(self._step)
                except Exception:
                    step_idx = 0
                self._step = min(self._step + 1, self._total)

                # denoised / x0 — то, что даёт читаемую картинку на шаге.
                # Именно этот тензор штатный prepare_callback в ComfyUI
                # кладёт в аргумент x0 callback'а (см. preview_node.py Rimor).
                denoised = comfy.samplers.sampling_function(
                    self.inner_model, x, timestep,
                    self.conds.get("negative", None),
                    self.conds.get("positive", None),
                    self.cfg,
                    model_options=model_options,
                    seed=seed,
                )

                if previewer is not None and node_id_for_preview is not None and PromptServer is not None:
                    try:
                        out = previewer.decode_latent_to_preview(denoised)
                        if isinstance(out, Image.Image):
                            if out.mode != "RGB":
                                out = out.convert("RGB")
                            max_res = 1024
                            if out.width > max_res or out.height > max_res:
                                out = ImageOps.contain(out, (max_res, max_res), Image.LANCZOS)
                            buf = pyio.BytesIO()
                            out.save(buf, format="JPEG", quality=80)
                            img_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
                            sid = getattr(PromptServer.instance, "client_id", None)
                            PromptServer.instance.send_sync(
                                "f3k_atelier_preview",
                                {
                                    "node_id": node_id_for_preview,
                                    "image": img_b64,
                                    "w": out.width,
                                    "h": out.height,
                                    "step": step_idx + 1,
                                    "total": self._total,
                                },
                                sid,
                            )
                    except Exception as e:
                        print(f"[F3K preview] failed: {e}")

                return denoised

        guider = F3KGuider(model)
        guider.set_conds(positive, negative)
        guider.cfg = 1.0

        noise = comfy.sample.prepare_noise(latent["samples"], seed, None)

        # ---------- Sampler object (не строка!) ----------
        sampler_obj = comfy.samplers.sampler_object("euler")

        # ---------- Sample with explicit sigmas ----------
        samples = guider.sample(
            noise,
            latent["samples"],
            sampler_obj,
            sigmas,
            denoise_mask=latent.get("noise_mask", None),
            callback=None,
            disable_pbar=not comfy.utils.PROGRESS_BAR_ENABLED,
            seed=seed,
        )
        samples = samples.to(comfy.model_management.intermediate_device())

        # ---------- Decode ----------
        decoded = vae.decode(samples)
        if len(decoded.shape) == 5:
            decoded = decoded.reshape(-1, decoded.shape[-3],
                                      decoded.shape[-2], decoded.shape[-1])

        # ---------- Output ----------
        out_cfg = L.parse_output_config(output_config)
        saved_path = L.save_output_image(decoded, final_prompt, out_cfg)
        if saved_path:
            print(f"[F3K] saved: {saved_path}")

        # Return both as image output AND as ui.text (fallback for onExecuted)
        return {
            "ui": {"text": (final_prompt,)},
            "result": (decoded, final_prompt),
        }

    sample = execute