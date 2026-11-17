/**
 * F3K Fashion Atelier — Module A: Image slots.
 * Uploads go to /f3k_atelier/slot_upload. Widget stores only { active, source, name }.
 *
 * FIX:
 *  - updatePromptSlotCommands uses merge (не перетирает blocks / __itemsState).
 *  - Синхронно вызывает prompt.save() -> blocks + __slotCommands гарантированно
 *    попадают в prompt_config до запуска.
 *  - После save() вызывает prompt.rebuild() -> секция "Slot commands (auto)"
 *    перерисовывается в UI со свежим списком.
 */

import {
    createSection,
    createSlotCard,
    getJSON,
    setJSON,
    debounce,
} from "./ui_helpers.js";

const SLOT_DEFS = [
    { id: "model",             label: "Model (person)",        cmd: "Use the subject from image {n} as the main character." },
    { id: "clothing_main",     label: "Main clothing",         cmd: "Dress the subject in the clothing from image {n}." },
    { id: "clothing_extra",    label: "Extra clothing",        cmd: "Add the extra garments from image {n}." },
    { id: "shoes",             label: "Shoes",                 cmd: "Put the shoes from image {n} on the subject." },
    { id: "headwear",          label: "Headwear",              cmd: "Add the headwear from image {n}." },
    { id: "eyewear",           label: "Eyewear",               cmd: "Put the eyewear from image {n} on the subject's face." },
    { id: "jewelry_piercing",  label: "Piercing / earrings",   cmd: "Add the piercings and earrings from image {n}." },
    { id: "jewelry_wearable",  label: "Wearable jewelry",      cmd: "Add the jewelry from image {n}." },
    { id: "accessories",       label: "Accessories",           cmd: "Add the accessories from image {n}." },
    { id: "pose_ref",          label: "Pose reference",        cmd: "Match the pose of the person in image {n}, preserving their body position and gesture." },
];

function updatePromptSlotCommands(node, slotId, active, order, command) {
    // 1) MERGE: читаем текущий prompt_config целиком (blocks, __itemsState, __manual)
    const cfg = getJSON(node, "prompt_config", { blocks: [] });
    const existing = Array.isArray(cfg.__slotCommands) ? cfg.__slotCommands : [];
    const filtered = existing.filter(c => c.slotId !== slotId);

    if (active) {
        filtered.push({ slotId, text: command, order });
    }
    cfg.__slotCommands = filtered.sort((a, b) => a.order - b.order);

    // 2) Пишем обновлённый cfg (не теряем blocks/__itemsState/__manual)
    setJSON(node, "prompt_config", cfg);

    // 3) Порядок ВАЖЕН: сначала save() (пересобирает blocks + пишет в prompt_config),
    //    потом rebuild() (читает свежий prompt_config и рендерит Slot commands).
    try {
        if (node._f3kRefs?.prompt?.save) {
            node._f3kRefs.prompt.save();
        }
        if (node._f3kRefs?.prompt?.rebuild) {
            node._f3kRefs.prompt.rebuild();
        }
    } catch (e) {
        console.warn("[F3K] updatePromptSlotCommands save/rebuild failed:", e);
    }
}

export function buildSlotsSection(parent, node, onChange) {
    const sec = createSection(parent, "A · Slots", "10 slots");

    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:6px;width:100%;";
    sec._body.appendChild(grid);

    const initial = getJSON(node, "slots_config", { slots: {} });
    const slotsState = initial.slots || {};
    const cards = {};

    const saveNow = () => {
        const slots = {};
        for (const def of SLOT_DEFS) {
            if (cards[def.id]) slots[def.id] = cards[def.id].state;
        }
        setJSON(node, "slots_config", { slots });
        node.graph?.change?.();
        onChange?.();
    };
    const scheduleSave = debounce(saveNow, 300);

    for (let i = 0; i < SLOT_DEFS.length; i++) {
        const def = SLOT_DEFS[i];
        const init = slotsState[def.id] || { active: false };

        const card = createSlotCard(grid, {
            label: def.label,
            slotId: def.id,
            initial: init,
            onChange: (newState) => {
                card.state = { ...newState };
                scheduleSave();
                const order = i + 1;
                const command = def.cmd.replace("{n}", String(order));
                updatePromptSlotCommands(node, def.id, newState.active, order, command);
            },
        });
        cards[def.id] = card;
    }

    node._f3kRestoreSlots = () => {
        const cfg = getJSON(node, "slots_config", { slots: {} });
        const s = cfg.slots || {};
        for (const def of SLOT_DEFS) {
            if (s[def.id] && cards[def.id]) {
                cards[def.id].setValue(s[def.id]);
            }
        }
        try { node._f3kRefs?.prompt?.rebuild?.(); } catch (e) {}
    };

    return { section: sec, cards, save: saveNow };
}