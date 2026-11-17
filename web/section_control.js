/**
 * F3K Fashion Atelier — Module B: Control.
 * Widget is source of truth via setJSON/getJSON.
 */

import {
    createSection,
    createSlider,
    createDigitalInt,
    createSwitch,
    getJSON,
    setJSON,
    debounce,
} from "./ui_helpers.js";

const DEFAULTS = {
    steps: 8,
    aggression: 1.0,
    seed: 0,
    scale_by: 1.0,
    upsampler: false,
    upsampler_seed: 0,
};

const STEPS_OPTIONS = [4, 8, 16];

export function buildControlSection(parent, node, onChange) {
    const sec = createSection(parent, "B · Control", "sigmas");

    const initial = { ...DEFAULTS, ...getJSON(node, "control_config", DEFAULTS) };
    const state = { ...initial };

    const saveNow = () => {
        setJSON(node, "control_config", state);
        node.graph?.change?.();
        onChange?.();
    };
    const scheduleSave = debounce(saveNow, 250);

    // Steps
    const stepsRow = document.createElement("div");
    stepsRow.className = "f3k-btn-row";
    sec._body.appendChild(stepsRow);

    const stepButtons = {};
    for (const s of STEPS_OPTIONS) {
        const btn = document.createElement("button");
        btn.className = "f3k-btn" + (state.steps === s ? " active" : "");
        btn.textContent = `${s} steps`;
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            state.steps = s;
            for (const [n, b] of Object.entries(stepButtons)) {
                b.classList.toggle("active", Number(n) === s);
            }
            scheduleSave();
        });
        stepsRow.appendChild(btn);
        stepButtons[s] = btn;
    }

    // Aggression
    const aggrSlider = createSlider(
        sec._body,
        "Aggression",
        state.aggression,
        1.0, 3.0, 0.01,
        (v) => { state.aggression = v; scheduleSave(); },
        { labels: ["BASE", "HARD"], resetTo: 1.0 }
    );

    // Seed
    const seedRow = document.createElement("div");
    seedRow.style.cssText = "display:flex;gap:6px;width:100%;align-items:center;";
    sec._body.appendChild(seedRow);

    const seedWidget = createDigitalInt(
        seedRow, "Seed", state.seed,
        (v) => { state.seed = v; scheduleSave(); },
        { min: 0, max: 999999999, step: 1 }
    );

    const seedBtn = document.createElement("button");
    seedBtn.className = "f3k-btn";
    seedBtn.textContent = "🎲";
    seedBtn.title = "Random seed";
    seedBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const v = Math.floor(Math.random() * 1e9);
        state.seed = v;
        seedWidget.setValue(v);
        scheduleSave();
    });
    seedRow.appendChild(seedBtn);

    // Latent scale
    const scaleSlider = createSlider(
        sec._body,
        "Latent scale ×",
        state.scale_by,
        1.0, 3.0, 0.05,
        (v) => {
            state.scale_by = v;
            updateSizeLabel();
            scheduleSave();
        },
        { labels: ["1×", "3×"], resetTo: 1.0 }
    );

    // === Размеры под слайдером ===
    const sizeLabel = document.createElement("div");
    sizeLabel.style.cssText = "font-size:10px;color:#888;text-align:center;margin-top:-2px;margin-bottom:2px;font-family:monospace;";
    sizeLabel.textContent = "— × —";
    sec._body.appendChild(sizeLabel);

    function getFirstActiveSlotSize() {
        const cards = node._f3kRefs?.slots?.cards;
        if (!cards) return null;
        const order = [
            "model", "clothing_main", "clothing_extra", "shoes", "headwear",
            "eyewear", "jewelry_piercing", "jewelry_wearable", "accessories", "pose_ref"
        ];
        for (const id of order) {
            const card = cards[id];
            if (card?.state?.active && card?.state?.name) {
                const img = card.card?.querySelector("img");
                if (img && img.naturalWidth && img.naturalHeight) {
                    return { w: img.naturalWidth, h: img.naturalHeight };
                }
            }
        }
        return null;
    }

    function updateSizeLabel() {
        const size = getFirstActiveSlotSize();
        if (!size) {
            sizeLabel.textContent = "— × — (no active slot)";
            return;
        }
        const scale = state.scale_by || 1.0;
        const w = Math.max(64, Math.floor((size.w * scale) / 64) * 64);
        const h = Math.max(64, Math.floor((size.h * scale) / 64) * 64);
        sizeLabel.textContent = `${w} × ${h}`;
    }

    // Upsampler
    const upSwitch = createSwitch(
        sec._body,
        "VLM Upsampler (Qwen3.5-9B)",
        state.upsampler,
        (v) => { state.upsampler = v; scheduleSave(); }
    );

    // Периодическое обновление размеров (img грузится асинхронно)
    const sizeInterval = setInterval(updateSizeLabel, 800);

    // Restore
    node._f3kRestoreControl = () => {
        const cfg = { ...DEFAULTS, ...getJSON(node, "control_config", DEFAULTS) };
        Object.assign(state, cfg);

        for (const [n, b] of Object.entries(stepButtons)) {
            b.classList.toggle("active", Number(n) === state.steps);
        }
        aggrSlider.setValue(state.aggression);
        scaleSlider.setValue(state.scale_by);
        seedWidget.setValue(state.seed);
        upSwitch.setValue(state.upsampler);
        updateSizeLabel();
    };

    const origOnRemoved = node.onRemoved;
    node.onRemoved = function () {
        clearInterval(sizeInterval);
        if (origOnRemoved) origOnRemoved.apply(this, arguments);
    };

    // Первый вызов после инициализации
    setTimeout(updateSizeLabel, 300);

    return { section: sec, state, save: saveNow };
}