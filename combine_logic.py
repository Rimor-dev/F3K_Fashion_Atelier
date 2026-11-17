"""
F3K Fashion Atelier — internal logic.

Pose removed from slot collection.
build_empty_latent reads downscale from VAE (Flux 3 → 16, fallback 8).
"""

import base64
import io as pyio
import json
import math
import os
import re

import numpy as np
import torch
from PIL import Image

import folder_paths
import node_helpers
import comfy.utils
import comfy.sample
import comfy.model_management

try:
    from server import PromptServer
except ImportError:
    PromptServer = None


# ============================================================
# ПУТИ
# ============================================================
_PACKAGE_DIR = os.path.dirname(os.path.abspath(__file__))
_ASSETS_DIR  = os.path.join(_PACKAGE_DIR, "assets")
_PROMPTS_DIR = os.path.join(_ASSETS_DIR, "prompts")

UP_SYSTEM_PROMPT_PATH = os.path.join(_PROMPTS_DIR, "system_prompt_upsampler.txt")
UP_USER_PROMPT_PATH   = os.path.join(_PROMPTS_DIR, "user_prompt_upsampler.txt")


# ============================================================
# СИГМЫ
# ============================================================
SIGMAS = {
    4: {
        "soft": [1.0, 0.9984, 0.9918, 0.9650, 0.0],
        "base": [1.0, 0.9962, 0.9785, 0.8642, 0.0],
        "hard": [1.0, 0.9915, 0.9550, 0.7320, 0.0],
    },
    8: {
        "soft": [1.0, 0.9998, 0.9988, 0.9950, 0.9835,
                 0.9500, 0.8650, 0.6350, 0.0],
        "base": [1.0, 0.9995, 0.9974, 0.9899, 0.9669,
                 0.9048, 0.7509, 0.4043, 0.0],
        "hard": [1.0, 0.9970, 0.9845, 0.9420, 0.8540,
                 0.6900, 0.3800, 0.0800, 0.0],
    },
    16: {
        "soft": [1.0000, 0.9999, 0.9998, 0.9997, 0.9995,
                 0.9992, 0.9987, 0.9978, 0.9963, 0.9936,
                 0.9888, 0.9801, 0.9640, 0.9345, 0.8785,
                 0.7600, 0.0],
        "base": [1.0000, 0.9999, 0.9998, 0.9996, 0.9993,
                 0.9988, 0.9979, 0.9963, 0.9936, 0.9885,
                 0.9788, 0.9600, 0.9230, 0.8550, 0.7300,
                 0.5000, 0.0],
        "hard": [1.0000, 0.9998, 0.9995, 0.9988, 0.9975,
                 0.9950, 0.9900, 0.9800, 0.9600, 0.9250,
                 0.8650, 0.7700, 0.6300, 0.4500, 0.2500,
                 0.0800, 0.0],
    },
}


def interpolate_sigmas(steps: int, aggression: float) -> torch.Tensor:
    if steps not in SIGMAS:
        steps = 8
    prof = SIGMAS[steps]
    soft = np.array(prof["soft"], dtype=np.float32)
    base = np.array(prof["base"], dtype=np.float32)
    hard = np.array(prof["hard"], dtype=np.float32)
    if aggression <= 1.0:
        t = max(0.0, min(1.0, (aggression - 0.1) / 0.9))
        out = soft + (base - soft) * t
    else:
        t = max(0.0, min(1.0, (aggression - 1.0) / 2.0))
        out = base + (hard - base) * t
    return torch.from_numpy(out).float()


# ============================================================
# ПРОМПТ-КОНСТРУКТОР
# ============================================================
def build_json_block(json_key: str, items: list) -> str:
    if not items:
        return ""
    lines = [f'"{json_key}": {{']
    valid = []
    for key, values in items:
        if not values:
            continue
        if isinstance(values, str):
            values = [values]
        combined = "".join(values)
        valid.append((key, combined))
    for i, (key, val) in enumerate(valid):
        safe = val.replace('"', '\\"')
        comma = "," if i < len(valid) - 1 else ""
        lines.append(f'  "{key}": "{safe}"{comma}')
    lines.append("}")
    return "\n".join(lines)


def collect_prompt_blocks(prompt_config: str) -> tuple:
    try:
        cfg = json.loads(prompt_config) if prompt_config else {}
    except Exception:
        cfg = {}

    slot_cmds = []
    for c in cfg.get("__slotCommands", []):
        if isinstance(c, dict) and c.get("text"):
            slot_cmds.append((int(c.get("order", 0)), c["text"]))
    slot_cmds.sort(key=lambda x: x[0])
    slot_cmds = [t for _, t in slot_cmds]

    blocks = []
    for blk in cfg.get("blocks", []):
        if not blk.get("active", False):
            continue
        key = blk.get("json_key") or blk.get("id") or "block"
        items = blk.get("items", [])
        if not items:
            continue
        body = build_json_block(key, items)
        if body:
            blocks.append((key, body))

    return slot_cmds, blocks


def assemble_prompt_json(prompt_config: str) -> str:
    slot_cmds, blocks = collect_prompt_blocks(prompt_config)
    if not blocks and not slot_cmds:
        return "{}"
    if not blocks:
        return "\n".join(slot_cmds)
    parts = []
    if slot_cmds:
        parts.append("\n".join(slot_cmds))
    parts.append("{\n" + ",\n".join(b for _, b in blocks) + "\n}")
    return "\n".join(parts)


def assemble_prompt_linear(prompt_config: str) -> str:
    slot_cmds, blocks = collect_prompt_blocks(prompt_config)
    lines = []
    if slot_cmds:
        lines.extend(slot_cmds)
    for key, body in blocks:
        try:
            inner = body[body.find("{") + 1: body.rfind("}")]
            pairs = []
            for line in inner.split("\n"):
                line = line.strip().rstrip(",")
                if '":' not in line:
                    continue
                k, v = line.split('":', 1)
                k = k.strip().strip('"').replace("_", " ").title()
                v = v.strip().strip(",").strip()
                if v.startswith('"') and v.endswith('"'):
                    v = v[1:-1]
                if v:
                    pairs.append(f"{k}: {v}")
            if pairs:
                lines.append(key.replace("_", " ").title() + ": " + " ".join(pairs))
        except Exception:
            continue
    return "\n".join(lines)


# ============================================================
# АПСЕМПЛЕР
# ============================================================
def read_text(path: str, default: str = "") -> str:
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return default


def load_upsampler_prompts():
    system = read_text(UP_SYSTEM_PROMPT_PATH, "")
    user = read_text(
        UP_USER_PROMPT_PATH,
        "Reference images follow in order (the first image, the second image, ...).\n"
        "User request: {a}\n"
        "Output the caption.",
    )
    return system, user


def run_upsampler(clip, short_prompt: str, images: list, seed: int = 0,
                  max_length: int = 3584, temperature: float = 1.0,
                  top_k: int = 1, top_p: float = 0.95, min_p: float = 0.0,
                  repetition_penalty: float = 1.0, presence_penalty: float = 0.0):
    if not images:
        return short_prompt
    system, user_tpl = load_upsampler_prompts()
    user_prompt = user_tpl.replace("{a}", short_prompt)
    tokens = clip.tokenize(
        user_prompt,
        images=images,
        system_prompt=system,
        skip_template=False,
        thinking=False,
    )
    ids = clip.generate(
        tokens,
        do_sample=True,
        max_length=max_length,
        temperature=temperature,
        top_k=top_k,
        top_p=top_p,
        min_p=min_p,
        repetition_penalty=repetition_penalty,
        presence_penalty=presence_penalty,
        seed=seed,
        mtp=False,
    )
    text = clip.decode(ids)
    reasoning, sep, final = text.partition("</think>")
    return (final if sep else text).strip() or short_prompt


# ============================================================
# СЛОТЫ
# ============================================================
def _decode_b64_image(b64: str) -> torch.Tensor:
    if "," in b64 and b64.strip().startswith("data:"):
        b64 = b64.split(",", 1)[1]
    raw = base64.b64decode(b64)
    img = Image.open(pyio.BytesIO(raw)).convert("RGB")
    arr = np.array(img).astype(np.float32) / 255.0
    return torch.from_numpy(arr).unsqueeze(0)


def _load_image_from_path(path: str) -> torch.Tensor:
    img = Image.open(path).convert("RGB")
    arr = np.array(img).astype(np.float32) / 255.0
    return torch.from_numpy(arr).unsqueeze(0)


def _resolve_slot_image(entry: dict):
    src = entry.get("source", "file")
    if src == "b64":
        b64 = entry.get("data", "")
        if b64:
            return _decode_b64_image(b64)
        return None
    if src == "file":
        name = entry.get("name", "")
        if not name:
            return None
        try:
            path = folder_paths.get_annotated_filepath(name)
            if os.path.exists(path):
                return _load_image_from_path(path)
        except Exception:
            pass
        alt = os.path.join(_ASSETS_DIR, "slots", name)
        if os.path.exists(alt):
            return _load_image_from_path(alt)
    return None


SLOT_ORDER = [
    "model",
    "clothing_main",
    "clothing_extra",
    "shoes",
    "headwear",
    "eyewear",
    "jewelry_piercing",
    "jewelry_wearable",
    "accessories",
    "pose_ref",
]


def collect_slot_images(slots_config: str):
    try:
        cfg = json.loads(slots_config) if slots_config else {}
    except Exception:
        cfg = {}
    slots = cfg.get("slots", {})
    images = []
    labels = []
    for slot_id in SLOT_ORDER:
        entry = slots.get(slot_id)
        if not entry or not entry.get("active", False):
            continue
        img = _resolve_slot_image(entry)
        if img is not None:
            images.append(img)
            labels.append(slot_id)
    return images, labels


# ============================================================
# LATENT
# ============================================================
def _round_to_64(x: int) -> int:
    return max(64, (int(x) // 64) * 64)


def _round_to_8(x: int) -> int:
    return max(8, (int(x) // 8) * 8)


def _get_vae_downscale(vae) -> int:
    """Реальный spacial-downscale VAE (Flux 3 VAE → 16, FLUX.1 VAE → 8)."""
    if vae is None:
        return 8
    try:
        d = int(vae.spacial_compression_decode())
    except Exception:
        try:
            d = int(getattr(vae, "downscale_ratio", 8))
        except Exception:
            d = 8
    return d if d > 0 else 8


def apply_reference_latents(positive, vae, images):
    if not images or vae is None:
        return positive
    ref_latents = []
    for img in images:
        try:
            lat = vae.encode(img[:, :, :, :3])
            ref_latents.append(lat)
        except Exception as e:
            print(f"[F3K Atelier] reference encode failed: {e}")
    if not ref_latents:
        return positive
    return node_helpers.conditioning_set_values(
        positive, {"reference_latents": ref_latents}, append=True
    )


def build_empty_latent(ref_images, vae, scale_by: float = 1.0):
    """
    Строит пустой латент того же spatial-размера, что и первая ref-картинка.
    Downscale берётся из VAE (Flux 3 → 16), а не хардкодится.
    """
    downscale = _get_vae_downscale(vae)

    if not ref_images or vae is None:
        w = _round_to_64(1024 * float(scale_by))
        h = _round_to_64(1024 * float(scale_by))
        from nodes import EmptyLatentImage
        return EmptyLatentImage().generate(w, h)[0], w, h

    ref = ref_images[0]
    h = int(ref.shape[1])
    w = int(ref.shape[2])
    w = _round_to_64(w * float(scale_by))
    h = _round_to_64(h * float(scale_by))

    base_lat = vae.encode(ref[:, :, :, :3]) * 0.0
    th = max(1, h // downscale)
    tw = max(1, w // downscale)
    if base_lat.shape[2] != th or base_lat.shape[3] != tw:
        base_lat = torch.nn.functional.interpolate(
            base_lat, size=(th, tw), mode="bilinear", align_corners=False
        )

    return {"samples": base_lat, "downscale_ratio_spacial": downscale}, w, h


# ============================================================
# КОНФИГИ
# ============================================================
def parse_control_config(control_config: str) -> dict:
    defaults = {
        "steps": 8,
        "aggression": 1.0,
        "seed": 0,
        "cfg": 1.0,
        "sampler": "euler",
        "scheduler": "normal",
        "scale_by": 1.0,
        "upsampler": False,
        "upsampler_seed": 0,
    }
    try:
        cfg = json.loads(control_config) if control_config else {}
    except Exception:
        cfg = {}
    out = dict(defaults)
    for k in defaults:
        if k in cfg and cfg[k] is not None:
            out[k] = cfg[k]
    return out


def parse_output_config(output_config: str) -> dict:
    defaults = {
        "autosave": True,
        "dir": "F3K_Atelier",
        "prefix": "f3k",
        "format": "png",
        "save_prompt": True,
    }
    try:
        cfg = json.loads(output_config) if output_config else {}
    except Exception:
        cfg = {}
    out = dict(defaults)
    for k in defaults:
        if k in cfg and cfg[k] is not None:
            out[k] = cfg[k]
    return out


def save_output_image(image_tensor, prompt_text: str, out_cfg: dict):
    if image_tensor is None or not out_cfg.get("autosave", False):
        return None
    try:
        out_dir = os.path.join(folder_paths.get_output_directory(),
                               out_cfg.get("dir", "F3K_Atelier"))
        os.makedirs(out_dir, exist_ok=True)
        arr = (image_tensor[0].cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
        img = Image.fromarray(arr)
        ext = out_cfg.get("format", "png").lower()
        idx = 1
        while True:
            name = f"{out_cfg.get('prefix', 'f3k')}_{idx:04d}.{ext}"
            path = os.path.join(out_dir, name)
            if not os.path.exists(path):
                break
            idx += 1
        img.save(path)
        if out_cfg.get("save_prompt", True) and prompt_text:
            with open(os.path.splitext(path)[0] + ".txt", "w",
                      encoding="utf-8") as f:
                f.write(prompt_text)
        return path
    except Exception as e:
        print(f"[F3K Atelier] save_output failed: {e}")
        return None