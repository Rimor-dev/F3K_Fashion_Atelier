/**
 * F3K Fashion Atelier — Module Е: Output + autosave.
 */

import {
    createSection,
    createField,
    createInput,
    createSelect,
    createSwitch,
    getJSON,
    setJSON,
    debounce,
} from "./ui_helpers.js";

const DEFAULTS = {
    autosave: true,
    dir: "F3K_Atelier",
    prefix: "f3k",
    format: "png",
    save_prompt: true,
};

export function buildOutputSection(parent, node, onChange) {
    const sec = createSection(parent, "E · Output", "autosave");

    const state = { ...DEFAULTS, ...getJSON(node, "output_config", DEFAULTS) };

    const saveNow = () => {
        setJSON(node, "output_config", state);
        onChange?.();
    };
    const scheduleSave = debounce(saveNow, 250);

    const autosaveSw = createSwitch(
        sec._body, "Autosave to output/",
        state.autosave,
        (v) => { state.autosave = v; scheduleSave(); }
    );

    const dirInput = createInput(state.dir, (v) => { state.dir = v; scheduleSave(); },
        { placeholder: "F3K_Atelier" });
    createField(sec._body, "Directory", dirInput);

    const prefixInput = createInput(state.prefix, (v) => { state.prefix = v; scheduleSave(); },
        { placeholder: "f3k" });
    createField(sec._body, "Prefix", prefixInput);

    const formatSel = createSelect(["png", "jpg"], state.format,
        (v) => { state.format = v; scheduleSave(); });
    createField(sec._body, "Format", formatSel);

    const savePromptSw = createSwitch(
        sec._body, "Save prompt as .txt",
        state.save_prompt,
        (v) => { state.save_prompt = v; scheduleSave(); }
    );

    node._f3kRestoreOutput = () => {
        const cfg = { ...DEFAULTS, ...getJSON(node, "output_config", DEFAULTS) };
        Object.assign(state, cfg);
        autosaveSw.setValue(state.autosave);
        savePromptSw.setValue(state.save_prompt);
        dirInput.value = state.dir;
        prefixInput.value = state.prefix;
        formatSel.value = state.format;
    };

    return { section: sec, state, save: saveNow };
}