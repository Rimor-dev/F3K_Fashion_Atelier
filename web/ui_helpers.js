/**
 * F3K Fashion Atelier — UI helpers.
 */

import { app } from "../../scripts/app.js";

/* ============================================================
   Виджет + properties
   ============================================================ */

export function getWidget(node, name) {
    return node.widgets?.find(w => w.name === name);
}

export function setWidgetValue(node, name, value) {
    const w = getWidget(node, name);
    if (w) {
        w.value = value;
        if (w._state && typeof w._state === "object") {
            w._state.value = value;
        }
        const idx = node.widgets?.findIndex(x => x.name === name);
        if (idx !== undefined && idx >= 0) {
            if (!node.widgets_values) node.widgets_values = [];
            node.widgets_values[idx] = value;
        }
    }
    node.properties = node.properties || {};
    node.properties[`f3k_${name}`] = value;
}

export function getJSON(node, name, fallback = {}) {
    const propKey = `f3k_${name}`;
    if (node.properties && node.properties[propKey] !== undefined) {
        try {
            const raw = node.properties[propKey];
            const parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
            if (parsed && typeof parsed === "object") return parsed;
        } catch (e) {}
    }
    return { ...fallback };
}

export function setJSON(node, name, obj) {
    const json = JSON.stringify(obj);
    node.properties = node.properties || {};
    node.properties[`f3k_${name}`] = json;

    const w = getWidget(node, name);
    if (w) {
        w.value = json;
        if (w._state && typeof w._state === "object") {
            w._state.value = json;
        }
        const idx = node.widgets?.findIndex(x => x.name === name);
        if (idx !== undefined && idx >= 0) {
            if (!node.widgets_values) node.widgets_values = [];
            node.widgets_values[idx] = json;
        }
    }
    node.graph?.change?.();
}

/* ============================================================
   Дебаунс
   ============================================================ */

export function debounce(fn, ms = 250) {
    let t = null;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
}

/* ============================================================
   Секция
   ============================================================ */

export function createSection(parent, title, badge = "") {
    const sec = document.createElement("div");
    sec.className = "f3k-section";

    const head = document.createElement("div");
    head.className = "f3k-section-title";
    head.textContent = title;

    if (badge) {
        const b = document.createElement("span");
        b.className = "f3k-badge";
        b.textContent = badge;
        head.appendChild(b);
    }

    sec.appendChild(head);

    const body = document.createElement("div");
    body.style.cssText = "display:flex;flex-direction:column;gap:6px;width:100%;";
    sec.appendChild(body);
    sec._body = body;

    parent.appendChild(sec);
    return sec;
}

/* ============================================================
   Кнопка
   ============================================================ */

export function createButton(parent, text, onClick, opts = {}) {
    const btn = document.createElement("button");
    btn.className = "f3k-btn" + (opts.wide ? " wide" : "") + (opts.danger ? " danger" : "");
    btn.textContent = text;
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        onClick?.(btn);
    });
    parent.appendChild(btn);
    return btn;
}

export function createButtonRow(parent, buttons) {
    const row = document.createElement("div");
    row.className = "f3k-btn-row";
    parent.appendChild(row);
    const out = [];
    for (const b of buttons) {
        const btn = createButton(row, b.text, b.onClick, b.opts || {});
        out.push(btn);
    }
    return out;
}

/* ============================================================
   Поля
   ============================================================ */

export function createField(parent, label, control) {
    const row = document.createElement("div");
    row.className = "f3k-field";
    const lbl = document.createElement("span");
    lbl.className = "f3k-field-label";
    lbl.textContent = label;
    row.appendChild(lbl);
    const wrap = document.createElement("div");
    wrap.className = "f3k-field-control";
    wrap.appendChild(control);
    row.appendChild(wrap);
    parent.appendChild(row);
    return row;
}

export function createInput(value, onChange, opts = {}) {
    const input = document.createElement("input");
    input.className = "f3k-input";
    input.type = opts.type || "text";
    input.value = value ?? "";
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.min !== undefined) input.min = opts.min;
    if (opts.max !== undefined) input.max = opts.max;
    if (opts.step !== undefined) input.step = opts.step;
    input.addEventListener("mousedown", e => e.stopPropagation());
    input.addEventListener("click", e => e.stopPropagation());
    input.addEventListener("input", () => onChange?.(input.value));
    input.addEventListener("change", () => onChange?.(input.value));
    return input;
}

export function createSelect(options, value, onChange) {
    const sel = document.createElement("select");
    sel.className = "f3k-select";
    for (const opt of options) {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        if (opt === value) o.selected = true;
        sel.appendChild(o);
    }
    sel.addEventListener("mousedown", e => e.stopPropagation());
    sel.addEventListener("click", e => e.stopPropagation());
    sel.addEventListener("change", () => onChange?.(sel.value));
    return sel;
}

export function createTextarea(value, onChange, opts = {}) {
    const ta = document.createElement("textarea");
    ta.className = "f3k-textarea";
    ta.value = value ?? "";
    if (opts.placeholder) ta.placeholder = opts.placeholder;
    ta.addEventListener("mousedown", e => e.stopPropagation());
    ta.addEventListener("click", e => e.stopPropagation());
    ta.addEventListener("input", () => onChange?.(ta.value));
    return ta;
}

/* ============================================================
   Switch
   ============================================================ */

export function createSwitch(parent, label, initial, onChange) {
    const row = document.createElement("div");
    row.className = "f3k-switch-row";
    const lbl = document.createElement("span");
    lbl.className = "f3k-switch-label";
    lbl.textContent = label;
    const sw = document.createElement("div");
    sw.className = "f3k-switch" + (initial ? " on" : "");
    const knob = document.createElement("div");
    knob.className = "f3k-switch-knob";
    sw.appendChild(knob);
    let value = !!initial;
    row.addEventListener("click", (e) => {
        e.stopPropagation();
        value = !value;
        sw.classList.toggle("on", value);
        onChange?.(value);
    });
    row.appendChild(lbl);
    row.appendChild(sw);
    parent.appendChild(row);
    return {
        setValue: (v) => { value = !!v; sw.classList.toggle("on", value); },
        getValue: () => value,
        row,
    };
}

/* ============================================================
   Цифровое табло (int)
   ============================================================ */

export function createDigitalInt(parent, label, initial, onChange, opts = {}) {
    const min = opts.min ?? -9999;
    const max = opts.max ?? 9999;
    const step = opts.step ?? 1;
    let value = Number(initial) || 0;

    const row = document.createElement("div");
    row.className = "f3k-field";
    if (label) {
        const lbl = document.createElement("span");
        lbl.className = "f3k-field-label";
        lbl.textContent = label;
        row.appendChild(lbl);
    }
    const wrap = document.createElement("div");
    wrap.className = "f3k-display-row";
    const minus = document.createElement("button");
    minus.className = "f3k-display-arrow";
    minus.textContent = "−";
    const display = document.createElement("div");
    display.className = "f3k-display";
    const plus = document.createElement("button");
    plus.className = "f3k-display-arrow";
    plus.textContent = "+";

    function render() { display.textContent = String(value).padStart(4, "0"); }
    function clamp(v) { return Math.max(min, Math.min(max, v)); }
    function commit() { render(); onChange?.(value); }

    minus.addEventListener("click", (e) => { e.stopPropagation(); value = clamp(value - step); commit(); });
    plus.addEventListener("click", (e) => { e.stopPropagation(); value = clamp(value + step); commit(); });

    display.addEventListener("click", (e) => {
        e.stopPropagation();
        const input = document.createElement("input");
        input.className = "f3k-input";
        input.type = "text";
        input.value = String(value);
        input.style.cssText = "min-width:70px;text-align:center;";
        input.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") {
                const v = parseInt(input.value, 10);
                if (!isNaN(v)) value = clamp(v);
                input.replaceWith(display);
                commit();
            }
            if (ev.key === "Escape") input.replaceWith(display);
        });
        input.addEventListener("blur", () => {
            const v = parseInt(input.value, 10);
            if (!isNaN(v)) value = clamp(v);
            input.replaceWith(display);
            commit();
        });
        display.replaceWith(input);
        input.focus();
        input.select();
    });

    wrap.appendChild(minus);
    wrap.appendChild(display);
    wrap.appendChild(plus);
    row.appendChild(wrap);
    parent.appendChild(row);
    render();

    return {
        getValue: () => value,
        setValue: (v) => { value = clamp(Number(v) || 0); render(); },
    };
}

/* ============================================================
   Слайдер
   ============================================================ */

export function createSlider(parent, label, initial, min, max, step, onChange, opts = {}) {
    let value = Number(initial);
    if (isNaN(value)) value = min;

    const wrapper = document.createElement("div");
    wrapper.className = "f3k-slider-row";
    const header = document.createElement("div");
    header.className = "f3k-slider-header";
    const lbl = document.createElement("span");
    lbl.textContent = label;
    const val = document.createElement("span");
    val.className = "f3k-slider-value";
    header.appendChild(lbl);
    header.appendChild(val);

    const track = document.createElement("div");
    track.className = "f3k-slider-track";
    const fill = document.createElement("div");
    fill.className = "f3k-slider-fill";
    const thumb = document.createElement("div");
    thumb.className = "f3k-slider-thumb";
    track.appendChild(fill);
    track.appendChild(thumb);
    wrapper.appendChild(header);
    wrapper.appendChild(track);

    if (opts.labels) {
        const labelsRow = document.createElement("div");
        labelsRow.className = "f3k-slider-labels";
        for (const t of opts.labels) {
            const s = document.createElement("span");
            s.textContent = t;
            labelsRow.appendChild(s);
        }
        wrapper.appendChild(labelsRow);
    }
    parent.appendChild(wrapper);

    const range = max - min;
    function updateVisual() {
        const pct = range === 0 ? 0 : (value - min) / range;
        fill.style.width = (pct * 100) + "%";
        thumb.style.left = (pct * 100) + "%";
        val.textContent = Number.isInteger(step) ? String(Math.round(value)) : value.toFixed(2);
    }
    function setValue(v, fromUser = false) {
        let n = Number(v);
        if (isNaN(n)) n = min;
        n = Math.max(min, Math.min(max, n));
        value = n;
        updateVisual();
        if (fromUser) onChange?.(value);
    }
    function valueFromX(clientX) {
        const rect = track.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const pct = rect.width === 0 ? 0 : x / rect.width;
        const raw = min + pct * range;
        const stepped = Math.round(raw / step) * step;
        return Math.max(min, Math.min(max, stepped));
    }

    let dragging = false;
    track.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        dragging = true;
        track.setPointerCapture?.(e.pointerId);
        setValue(valueFromX(e.clientX), true);
    });
    track.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        setValue(valueFromX(e.clientX), true);
    });
    track.addEventListener("pointerup", (e) => {
        dragging = false;
        track.releasePointerCapture?.(e.pointerId);
    });
    track.addEventListener("pointercancel", () => { dragging = false; });
    track.addEventListener("dblclick", () => setValue(opts.resetTo ?? min, true));

    updateVisual();

    return {
        getValue: () => value,
        setValue: (v) => setValue(v, false),
    };
}

/* ============================================================
   Палитра — preview-прямоугольник + HSL picker в body
   ============================================================ */

export function createPalette(parent, initial, onChange, opts = {}) {
    let selected = initial || "#4a90d9";

    const preview = document.createElement("div");
    preview.style.cssText = `
        width: 44px; height: 22px;
        border-radius: 4px;
        border: 2px solid var(--f3k-input-border, #333);
        background: ${selected};
        cursor: pointer;
        flex-shrink: 0;
        transition: border-color 0.15s;
        box-sizing: border-box;
    `;
    preview.title = selected;
    preview.addEventListener("mouseenter", () => {
        preview.style.borderColor = "var(--f3k-accent, #4a90d9)";
    });
    preview.addEventListener("mouseleave", () => {
        preview.style.borderColor = "var(--f3k-input-border, #333)";
    });
    parent.appendChild(preview);

    const picker = document.createElement("div");
    picker.style.cssText = `
        display: none;
        position: fixed;
        z-index: 999999;
        background: #141414;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        padding: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.8);
        flex-direction: column;
        gap: 6px;
        width: 216px;
        box-sizing: border-box;
        font-family: monospace;
    `;
    document.body.appendChild(picker);

    const svBox = document.createElement("div");
    svBox.style.cssText = `
        width: 200px; height: 140px;
        position: relative; cursor: crosshair;
        border-radius: 4px; overflow: hidden;
        background: hsl(0, 100%, 50%);
    `;
    const svOverlay = document.createElement("div");
    svOverlay.style.cssText = `
        position: absolute; inset: 0;
        background: linear-gradient(to top, #000, transparent),
                    linear-gradient(to right, #fff, transparent);
        pointer-events: none;
    `;
    svBox.appendChild(svOverlay);
    const svMarker = document.createElement("div");
    svMarker.style.cssText = `
        position: absolute;
        width: 12px; height: 12px;
        border: 2px solid #fff;
        border-radius: 50%;
        box-shadow: 0 0 0 1px #000;
        transform: translate(-50%, -50%);
        pointer-events: none;
        box-sizing: border-box;
    `;
    svBox.appendChild(svMarker);
    picker.appendChild(svBox);

    const hueBar = document.createElement("div");
    hueBar.style.cssText = `
        width: 200px; height: 14px;
        position: relative; cursor: pointer;
        border-radius: 3px;
        background: linear-gradient(to right,
            #ff0000 0%, #ffff00 17%, #00ff00 33%,
            #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%);
    `;
    const hueMarker = document.createElement("div");
    hueMarker.style.cssText = `
        position: absolute;
        top: -2px;
        width: 8px; height: 18px;
        background: #fff;
        border: 2px solid #000;
        border-radius: 3px;
        transform: translateX(-50%);
        pointer-events: none;
        box-sizing: border-box;
    `;
    hueBar.appendChild(hueMarker);
    picker.appendChild(hueBar);

    const bottomRow = document.createElement("div");
    bottomRow.style.cssText = "display:flex;gap:4px;align-items:center;";

    const hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.value = selected;
    hexInput.style.cssText = `
        flex: 1;
        background: #0d0d0d;
        color: #4a90d9;
        border: 1px solid #333;
        border-radius: 3px;
        padding: 3px 6px;
        font-family: monospace;
        font-size: 11px;
        text-align: center;
        outline: none;
        box-sizing: border-box;
        height: 22px;
    `;
    hexInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); applyHex(); }
    });
    bottomRow.appendChild(hexInput);

    const okBtn = document.createElement("button");
    okBtn.textContent = "OK";
    okBtn.style.cssText = `
        background: #141414;
        color: #4a90d9;
        border: 1px solid #4a90d9;
        border-radius: 3px;
        font-family: monospace;
        font-size: 11px;
        font-weight: bold;
        height: 22px;
        padding: 0 10px;
        cursor: pointer;
    `;
    okBtn.addEventListener("click", (e) => { e.stopPropagation(); applyHex(); });
    bottomRow.appendChild(okBtn);
    picker.appendChild(bottomRow);

    let h = 0, s = 1, v = 1;

    function hexToHsv(hex) {
        const m = (hex || "").replace("#", "");
        if (m.length !== 6) return null;
        const r = parseInt(m.slice(0, 2), 16) / 255;
        const g = parseInt(m.slice(2, 4), 16) / 255;
        const b = parseInt(m.slice(4, 6), 16) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const d = max - min;
        let hh = 0;
        if (d !== 0) {
            if (max === r) hh = ((g - b) / d) % 6;
            else if (max === g) hh = (b - r) / d + 2;
            else hh = (r - g) / d + 4;
            hh *= 60;
            if (hh < 0) hh += 360;
        }
        return { h: hh, s: max === 0 ? 0 : d / max, v: max };
    }

    function hsvToHex(hh, ss, vv) {
        const c = vv * ss;
        const hp = hh / 60;
        const x = c * (1 - Math.abs((hp % 2) - 1));
        let r1 = 0, g1 = 0, b1 = 0;
        if (hp >= 0 && hp < 1) { r1 = c; g1 = x; b1 = 0; }
        else if (hp >= 1 && hp < 2) { r1 = x; g1 = c; b1 = 0; }
        else if (hp >= 2 && hp < 3) { r1 = 0; g1 = c; b1 = x; }
        else if (hp >= 3 && hp < 4) { r1 = 0; g1 = x; b1 = c; }
        else if (hp >= 4 && hp < 5) { r1 = x; g1 = 0; b1 = c; }
        else if (hp >= 5 && hp < 6) { r1 = c; g1 = 0; b1 = x; }
        const m = vv - c;
        const r = Math.round((r1 + m) * 255);
        const g = Math.round((g1 + m) * 255);
        const b = Math.round((b1 + m) * 255);
        const toHex = (n) => n.toString(16).padStart(2, "0");
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
    }

    function updateFromHsv() {
        svBox.style.background = `hsl(${h}, 100%, 50%)`;
        svMarker.style.left = `${s * 100}%`;
        svMarker.style.top = `${(1 - v) * 100}%`;
        hueMarker.style.left = `${(h / 360) * 100}%`;
        const hex = hsvToHex(h, s, v);
        hexInput.value = hex;
        preview.style.background = hex;
        preview.title = hex;
    }

    function initFromHex(hex) {
        const hsv = hexToHsv(hex);
        if (hsv) { h = hsv.h; s = hsv.s; v = hsv.v; updateFromHsv(); }
    }

    function applyHex() {
        const raw = hexInput.value.trim();
        const hex = raw.startsWith("#") ? raw : "#" + raw;
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
            const upper = hex.toUpperCase();
            selected = upper;
            preview.style.background = upper;
            preview.title = upper;
            onChange?.(upper);
            picker.style.display = "none";
        } else {
            hexInput.value = selected;
        }
    }

    let svDragging = false;
    function svFromEvent(ev) {
        const rect = svBox.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height, ev.clientY - rect.top));
        s = x / rect.width;
        v = 1 - y / rect.height;
        updateFromHsv();
    }
    svBox.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        svDragging = true;
        svFromEvent(e);
    });
    window.addEventListener("mousemove", (e) => { if (svDragging) svFromEvent(e); });
    window.addEventListener("mouseup", () => { svDragging = false; });

    let hueDragging = false;
    function hueFromEvent(ev) {
        const rect = hueBar.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
        h = (x / rect.width) * 360;
        updateFromHsv();
    }
    hueBar.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        hueDragging = true;
        hueFromEvent(e);
    });
    window.addEventListener("mousemove", (e) => { if (hueDragging) hueFromEvent(e); });
    window.addEventListener("mouseup", () => { hueDragging = false; });

    function openPicker() {
        picker.style.display = "flex";
        const r = preview.getBoundingClientRect();
        let left = r.left;
        let top = r.bottom + 4;
        if (left + 216 > window.innerWidth) left = window.innerWidth - 224;
        if (top + 220 > window.innerHeight) top = r.top - 224;
        picker.style.left = `${left}px`;
        picker.style.top = `${top}px`;
        initFromHex(selected);
        setTimeout(() => {
            document.addEventListener("mousedown", onOutsideClick, true);
        }, 0);
    }

    function closePicker() {
        picker.style.display = "none";
        document.removeEventListener("mousedown", onOutsideClick, true);
    }

    function onOutsideClick(e) {
        if (picker.contains(e.target) || preview.contains(e.target)) return;
        closePicker();
    }

    preview.addEventListener("click", (e) => {
        e.stopPropagation();
        if (picker.style.display === "flex") closePicker();
        else openPicker();
    });

    initFromHex(selected);

    return {
        getValue: () => selected,
        setValue: (v) => {
            selected = v || "#4a90d9";
            preview.style.background = selected;
            preview.title = selected;
            initFromHex(selected);
        },
    };
}

/* ============================================================
   Карточка слота
   ============================================================ */

export function createSlotCard(parent, opts) {
    const { label, slotId, initial = {}, onChange } = opts;
    const state = {
        active: !!initial.active,
        source: "file",
        name: initial.name || "",
    };

    const card = document.createElement("div");
    card.className = "f3k-slot-card";

    const header = document.createElement("div");
    header.className = "f3k-slot-header";
    const lbl = document.createElement("span");
    lbl.className = "f3k-slot-label";
    lbl.textContent = label;
    const switchEl = document.createElement("div");
    switchEl.className = "f3k-switch" + (state.active ? " on" : "");
    const knob = document.createElement("div");
    knob.className = "f3k-switch-knob";
    switchEl.appendChild(knob);
    header.appendChild(lbl);
    header.appendChild(switchEl);

    const preview = document.createElement("div");
    preview.className = "f3k-slot-preview";
    preview.textContent = "+";

    const img = document.createElement("img");
    img.style.display = "none";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain";
    preview.appendChild(img);

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";

    function render() {
        switchEl.classList.toggle("on", state.active);
        if (state.name) {
            img.src = `/f3k_atelier/slot_file?name=${encodeURIComponent(state.name)}&t=${Date.now()}`;
            img.style.display = "block";
            preview.textContent = "";
            preview.appendChild(img);
        } else {
            preview.textContent = "+";
            img.style.display = "none";
            img.src = "";
        }
    }

    function emit() {
        onChange?.({
            active: state.active,
            source: state.source,
            name: state.name,
        });
    }

    switchEl.addEventListener("click", (e) => {
        e.stopPropagation();
        state.active = !state.active;
        render();
        emit();
    });

    preview.addEventListener("click", (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        const form = new FormData();
        form.append("file", file, file.name);

        try {
            const resp = await fetch("/f3k_atelier/slot_upload", {
                method: "POST",
                body: form,
            });
            const data = await resp.json();
            if (data.status === "ok" && data.name) {
                state.name = data.name;
                state.source = "file";
                render();
                emit();
            } else {
                console.warn("[F3K] slot upload failed:", data);
            }
        } catch (err) {
            console.warn("[F3K] slot upload error:", err);
        }
        fileInput.value = "";
    });

    card.appendChild(header);
    card.appendChild(preview);
    card.appendChild(fileInput);
    parent.appendChild(card);
    render();

    return {
        state,
        card,
        setValue: (v) => {
            state.active = !!v.active;
            state.source = "file";
            state.name = v.name || "";
            render();
        },
    };
}


/* ============================================================
   Multi-select (паттерн Mr.Klein): single ↔ multi toggle
   ============================================================ */

/**
 * @param {HTMLElement} parent  контейнер для вставки
 * @param {Object} opts
 *   - options: string[]
 *   - value: string (single) | string[] (multi)
 *   - multi: boolean (начальный режим)
 *   - onChange: (value: string | string[], multi: boolean) => void
 * @returns {Object} { getValue, setValue, getMulti, setMulti }
 */
export function createMultiSelect(parent, opts) {
    const options = opts.options || [];
    let isMulti = !!opts.multi;
    let singleValue = typeof opts.value === "string" ? opts.value : (options[0] || "");
    let multiValues = Array.isArray(opts.value) ? [...opts.value] : (singleValue ? [singleValue] : []);

    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:6px;align-items:flex-start;width:100%;";

    const main = document.createElement("div");
    main.style.cssText = "flex:1;min-width:0;position:relative;";
    row.appendChild(main);

    const plusBtn = document.createElement("button");
    plusBtn.type = "button";
    plusBtn.style.cssText = `
        width: 24px; height: 22px;
        background: #141414;
        color: #4a90d9;
        border: 1px solid #4a90d9;
        border-radius: 4px;
        font-family: monospace;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        flex-shrink: 0;
        padding: 0;
        transition: all 0.15s;
        margin-top: 1px;
    `;
    row.appendChild(plusBtn);

    function updatePlusVisual() {
        if (isMulti) {
            plusBtn.style.background = "#4a90d9";
            plusBtn.style.color = "#000";
            plusBtn.textContent = "×";
            plusBtn.title = "Switch to single select";
        } else {
            plusBtn.style.background = "#141414";
            plusBtn.style.color = "#4a90d9";
            plusBtn.textContent = "+";
            plusBtn.title = "Switch to multi select";
        }
    }

    function render() {
        main.innerHTML = "";
        if (isMulti) {
            const box = document.createElement("div");
            box.style.cssText = `
                background: #0d0d0d;
                border: 1px solid #3a3a3a;
                border-radius: 4px;
                padding: 4px;
                max-height: 220px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 2px;
                box-sizing: border-box;
            `;

            for (const opt of options) {
                const isSel = multiValues.includes(opt);
                const r = document.createElement("div");
                r.textContent = opt;
                r.style.cssText = `
                    padding: 4px 8px;
                    font-size: 11px;
                    font-family: monospace;
                    border-radius: 3px;
                    cursor: pointer;
                    user-select: none;
                    background: ${isSel ? "#1a4d2e" : "transparent"};
                    color: ${isSel ? "#23EE96" : "#e6e6e6"};
                    border-left: 3px solid ${isSel ? "#23EE96" : "transparent"};
                    transition: background 0.1s;
                    line-height: 1.3;
                `;
                r.addEventListener("mouseenter", () => {
                    if (!multiValues.includes(opt)) r.style.background = "#2a2a2a";
                });
                r.addEventListener("mouseleave", () => {
                    if (!multiValues.includes(opt)) r.style.background = "transparent";
                });
                r.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (multiValues.includes(opt)) {
                        multiValues = multiValues.filter(v => v !== opt);
                    } else {
                        multiValues.push(opt);
                    }
                    render();
                    opts.onChange?.(multiValues.slice(), true);
                });
                box.appendChild(r);
            }
            main.appendChild(box);
        } else {
            const sel = document.createElement("select");
            sel.style.cssText = `
                width: 100%;
                height: 22px;
                background: #0d0d0d;
                color: #4a90d9;
                border: 1px solid #333;
                border-radius: 4px;
                padding: 0 6px;
                font-family: monospace;
                font-size: 11px;
                outline: none;
                box-sizing: border-box;
                text-align: center;
                text-align-last: center;
            `;
            for (const opt of options) {
                const o = document.createElement("option");
                o.value = opt;
                o.textContent = opt;
                if (opt === singleValue) o.selected = true;
                sel.appendChild(o);
            }
            sel.addEventListener("mousedown", e => e.stopPropagation());
            sel.addEventListener("click", e => e.stopPropagation());
            sel.addEventListener("change", () => {
                singleValue = sel.value;
                opts.onChange?.(singleValue, false);
            });
            main.appendChild(sel);
        }
    }

    plusBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isMulti) {
            // multi → single: взять первое выбранное
            singleValue = multiValues[0] || options[0] || "";
            multiValues = singleValue ? [singleValue] : [];
            isMulti = false;
        } else {
            // single → multi: начать с текущего
            multiValues = singleValue ? [singleValue] : [];
            isMulti = true;
        }
        updatePlusVisual();
        render();
        opts.onChange?.(isMulti ? multiValues.slice() : singleValue, isMulti);
    });

    updatePlusVisual();
    render();
    parent.appendChild(row);

    return {
        getValue: () => isMulti ? multiValues.slice() : singleValue,
        setValue: (v) => {
            if (Array.isArray(v)) {
                multiValues = [...v];
                if (multiValues.length > 0) singleValue = multiValues[0];
            } else {
                singleValue = v || "";
                multiValues = singleValue ? [singleValue] : [];
            }
            render();
        },
        getMulti: () => isMulti,
        setMulti: (m) => {
            isMulti = !!m;
            updatePlusVisual();
            render();
        },
    };
}


/* ============================================================
   CSS
   ============================================================ */

export function ensureStyles() {
    if (document.getElementById("f3k-styles")) return;
    const link = document.createElement("link");
    link.id = "f3k-styles";
    link.rel = "stylesheet";
    link.href = "/extensions/F3K_Fashion_Atelier/styles.css";
    document.head.appendChild(link);
}