/**
 * F3K Fashion Atelier — Module В: Prompt constructor.
 * - Multi-select
 * - Full state persist via __itemsState (Python ignores it, UI restores everything)
 *
 * FIX: saveNow merge-ит __slotCommands из актуального prompt_config,
 *      чтобы не затирать их при rebuild.
 */

import {
    createSection,
    createTextarea,
    createPalette,
    createMultiSelect,
    getJSON,
    setJSON,
    debounce,
} from "./ui_helpers.js";

let LIBRARY_CACHE = null;
let LIBRARY_LOADING = null;
const LIBRARY_URL = "/f3k_atelier/library";

async function loadLibrary() {
    if (LIBRARY_CACHE) return LIBRARY_CACHE;
    if (LIBRARY_LOADING) return LIBRARY_LOADING;
    LIBRARY_LOADING = (async () => {
        try {
            const resp = await fetch(LIBRARY_URL, { cache: "no-store" });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            LIBRARY_CACHE = await resp.json();
            return LIBRARY_CACHE;
        } catch (e) {
            console.warn("[F3K Atelier] library load failed:", e);
            LIBRARY_CACHE = { blocks: {} };
            return LIBRARY_CACHE;
        }
    })();
    return LIBRARY_LOADING;
}

function getOrCreateItemState(state, blockId, item) {
    if (!state[blockId]) state[blockId] = { items: {} };
    if (!state[blockId].items) state[blockId].items = {};
    if (!state[blockId].items[item.id]) {
        state[blockId].items[item.id] = {
            on: false,
            value: item.options?.[0] || "",
            color: "#4a90d9",
            multi: false,
            multiValues: [],
        };
    }
    return state[blockId].items[item.id];
}

function buildBlock(container, blockId, block, state, onSave) {
    const sec = document.createElement("div");
    sec.className = "f3k-section";
    sec.style.background = "#0e0e0e";
    sec.style.marginBottom = "4px";

    const head = document.createElement("div");
    head.className = "f3k-section-title";
    head.textContent = (block.icon ? block.icon + " " : "") + (block.title || blockId);
    sec.appendChild(head);

    const items = block.items || [];

    for (const item of items) {
        const itemType = item.type || "combo";
        const itemState = getOrCreateItemState(state, blockId, item);

        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:6px;padding:2px 0;";

        const lbl = document.createElement("span");
        lbl.className = "f3k-field-label";
        lbl.style.minWidth = "80px";
        lbl.textContent = item.label || item.id;
        row.appendChild(lbl);

        const sw = document.createElement("div");
        sw.className = "f3k-switch" + (itemState.on ? " on" : "");
        const knob = document.createElement("div");
        knob.className = "f3k-switch-knob";
        sw.appendChild(knob);
        sw.addEventListener("click", (e) => {
            e.stopPropagation();
            itemState.on = !itemState.on;
            sw.classList.toggle("on", itemState.on);
            onSave();
        });
        row.appendChild(sw);
        sec.appendChild(row);

        if (itemType === "textarea") {
            const ta = createTextarea(itemState.value || "", (v) => {
                itemState.value = v;
                onSave();
            }, { placeholder: item.placeholder || "instruction..." });
            sec.appendChild(ta);
        } else if (itemType === "color") {
            const ctrlRow = document.createElement("div");
            ctrlRow.style.cssText = "display:flex;gap:6px;align-items:center;width:100%;";

            createMultiSelect(ctrlRow, {
                options: item.options || [],
                value: itemState.multi ? itemState.multiValues : itemState.value,
                multi: itemState.multi,
                onChange: (v, multi) => {
                    itemState.multi = multi;
                    if (multi) {
                        itemState.multiValues = v;
                        itemState.value = v[0] || "";
                    } else {
                        itemState.value = v;
                        itemState.multiValues = [];
                    }
                    onSave();
                },
            });

            createPalette(ctrlRow, itemState.color, (c) => {
                itemState.color = c;
                onSave();
            });
            sec.appendChild(ctrlRow);
        } else {
            createMultiSelect(sec, {
                options: item.options || [],
                value: itemState.multi ? itemState.multiValues : itemState.value,
                multi: itemState.multi,
                onChange: (v, multi) => {
                    itemState.multi = multi;
                    if (multi) {
                        itemState.multiValues = v;
                        itemState.value = v[0] || "";
                    } else {
                        itemState.value = v;
                        itemState.multiValues = [];
                    }
                    onSave();
                },
            });
        }
    }

    container.appendChild(sec);
    return sec;
}

function buildSlotCommandsBlock(container, node) {
    const cfg = getJSON(node, "prompt_config", {});
    const cmds = Array.isArray(cfg.__slotCommands) ? cfg.__slotCommands : [];
    if (cmds.length === 0) return;

    const sec = document.createElement("div");
    sec.className = "f3k-section";
    sec.style.background = "#0e0e0e";
    sec.style.marginBottom = "4px";

    const head = document.createElement("div");
    head.className = "f3k-section-title";
    head.textContent = "🔗 Slot commands (auto)";
    sec.appendChild(head);

    for (const c of cmds) {
        const row = document.createElement("div");
        row.style.cssText = "font-size:10px;color:#888;padding:2px 0;border-bottom:1px solid #1a1a1a;";
        row.textContent = c.text;
        sec.appendChild(row);
    }

    container.appendChild(sec);
}

export async function buildPromptSection(parent, node, onChange) {
    const sec = createSection(parent, "C · Prompt", "library");
    sec._body.innerHTML = '<div class="f3k-hint">Loading library...</div>';

    const lib = await loadLibrary();
    sec._body.innerHTML = "";

    const container = document.createElement("div");
    container.style.cssText = "display:flex;flex-direction:column;gap:4px;width:100%;";
    sec._body.appendChild(container);

    let state = {};

    const hydrateState = () => {
        const initial = getJSON(node, "prompt_config", {});
        state = { __manual: initial.__manual || "" };

        // 1. Новый формат: __itemsState — полный снимок
        const itemsState = initial.__itemsState || null;
        if (itemsState && typeof itemsState === "object") {
            for (const [blockId, items] of Object.entries(itemsState)) {
                if (!items || typeof items !== "object") continue;
                if (!state[blockId]) state[blockId] = { items: {} };
                if (!state[blockId].items) state[blockId].items = {};
                for (const [itemId, st] of Object.entries(items)) {
                    state[blockId].items[itemId] = {
                        on: !!st.on,
                        value: st.value || "",
                        color: st.color || "#4a90d9",
                        multi: !!st.multi,
                        multiValues: Array.isArray(st.multiValues) ? [...st.multiValues] : [],
                    };
                }
            }
            return;
        }

        // 2. Старый формат: только активные items в blocks
        for (const b of initial.blocks || []) {
            const blockId = b.id;
            if (!blockId) continue;
            if (!state[blockId]) state[blockId] = { items: {} };
            if (!state[blockId].items) state[blockId].items = {};
            for (const [itemId, values] of b.items || []) {
                const arr = Array.isArray(values) ? values : [values];
                const isMulti = arr.length > 1;
                state[blockId].items[itemId] = {
                    on: true,
                    value: arr[0] || "",
                    multi: isMulti,
                    multiValues: isMulti ? [...arr] : [],
                    color: "#4a90d9",
                };
            }
        }
    };

    const rebuild = () => {
        container.innerHTML = "";
        buildSlotCommandsBlock(container, node);

        const blockKeys = Object.keys(lib.blocks || {}).sort((a, b) => {
            const oa = lib.blocks[a].order || 99;
            const ob = lib.blocks[b].order || 99;
            return oa - ob;
        });

        for (const blockId of blockKeys) {
            const block = lib.blocks[blockId];
            buildBlock(container, blockId, block, state, scheduleSave);
        }

        const manualSec = document.createElement("div");
        manualSec.className = "f3k-section";
        manualSec.style.background = "#0e0e0e";
        const manualHead = document.createElement("div");
        manualHead.className = "f3k-section-title";
        manualHead.textContent = "✏️ Manual instruction";
        manualSec.appendChild(manualHead);
        const manualTa = createTextarea(
            state.__manual || "",
            (v) => { state.__manual = v; scheduleSave(); },
            { placeholder: "additional instructions (consistency, etc.)" }
        );
        manualSec.appendChild(manualTa);
        container.appendChild(manualSec);
    };

    const saveNow = () => {
        // 1. blocks — только активные (для Python)
        const blocks = [];
        // 2. __itemsState — всё (для UI)
        const itemsState = {};
        const blocksMap = lib.blocks || {};

        for (const blockId of Object.keys(blocksMap)) {
            const block = blocksMap[blockId];
            const bState = state[blockId];
            if (!bState || !bState.items) continue;

            const blockSnapshot = {};
            for (const item of block.items || []) {
                const st = bState.items[item.id];
                if (!st) continue;
                blockSnapshot[item.id] = {
                    on: !!st.on,
                    value: st.value || "",
                    color: st.color || "#4a90d9",
                    multi: !!st.multi,
                    multiValues: Array.isArray(st.multiValues) ? [...st.multiValues] : [],
                };
            }
            if (Object.keys(blockSnapshot).length > 0) {
                itemsState[blockId] = blockSnapshot;
            }

            const activeItems = [];
            for (const item of block.items || []) {
                const st = bState.items[item.id];
                if (!st || !st.on) continue;
                const itemType = item.type || "combo";

                if (itemType === "color") {
                    const color = st.color || "#4a90d9";
                    if (st.multi && st.multiValues?.length > 0) {
                        const vals = st.multiValues
                            .map(v => v.replace("{color}", color))
                            .filter(Boolean);
                        if (vals.length > 0) activeItems.push([item.id, vals]);
                    } else {
                        const v = (st.value || "").replace("{color}", color);
                        if (v) activeItems.push([item.id, [v]]);
                    }
                } else {
                    if (st.multi && st.multiValues?.length > 0) {
                        const vals = st.multiValues.filter(Boolean);
                        if (vals.length > 0) activeItems.push([item.id, vals]);
                    } else {
                        if (st.value) activeItems.push([item.id, [st.value]]);
                    }
                }
            }

            if (activeItems.length > 0) {
                blocks.push({
                    id: blockId,
                    json_key: block.json_key || blockId,
                    title: block.title || blockId,
                    active: true,
                    items: activeItems,
                });
            }
        }

        // MERGE: берём актуальные __slotCommands (могли обновиться из section_slots)
        const cfg = getJSON(node, "prompt_config", {});
        const slotCmds = Array.isArray(cfg.__slotCommands) ? cfg.__slotCommands : [];

        setJSON(node, "prompt_config", {
            blocks,
            __slotCommands: slotCmds,
            __manual: state.__manual || "",
            __itemsState: itemsState,
        });
        node.graph?.change?.();
        onChange?.();
    };
    const scheduleSave = debounce(saveNow, 300);

    hydrateState();
    rebuild();

    node._f3kRestorePrompt = () => {
        hydrateState();
        rebuild();
    };

    return { section: sec, state, save: saveNow, rebuild };
}