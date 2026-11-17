import { app } from "../../scripts/app.js";
import { ensureStyles, getJSON, setJSON, debounce } from "./ui_helpers.js";
import { buildSlotsSection } from "./section_slots.js";
import { buildModelsSection } from "./section_models.js";
import { buildControlSection } from "./section_control.js";
import { buildPromptSection } from "./section_prompt.js";
import { buildExecSection } from "./section_exec.js";
import { buildOutputSection } from "./section_output.js";

const EXT_NAME = "F3K.FashionAtelier";
const { api } = window.comfyAPI.api;

const HIDDEN_WIDGETS = [
    "node_id_hidden", "slots_config", "control_config",
    "prompt_config", "exec_config", "output_config",
];

function syncWidgetsValues(node) {
    const vals = [];
    for (const w of node.widgets || []) {
        if (w.name === "f3k_atelier_panel") continue;
        vals.push(w.value ?? "");
    }
    node.widgets_values = vals;
    console.log("[F3K] widgets_values synced:", vals.length, "items");
}

function setHiddenWidget(node, name, value) {
    const w = node.widgets?.find(x => x.name === name);
    if (!w) return;
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

app.registerExtension({
    name: EXT_NAME,

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeType.comfyClass !== "F3K_FashionAtelier") return;
        ensureStyles();

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;

        nodeType.prototype.onNodeCreated = function () {
            const result = origOnNodeCreated?.apply(this, arguments);
            const node = this;

            // ---- node_id_hidden (in rAF, как в Rimor-нодах) ----
            node._f3kNodeId = String(node.id);
            requestAnimationFrame(() => {
                const idWidget = node.widgets?.find(x => x.name === "node_id_hidden");
                if (!idWidget) return;
                if (!node.widgets_values) node.widgets_values = [];
                const idx = node.widgets.findIndex(x => x.name === "node_id_hidden");
                node.widgets_values[idx] = String(node.id);
                idWidget.value = String(node.id);
                if (idWidget._state && typeof idWidget._state === "object") {
                    idWidget._state.value = String(node.id);
                }
            });

            // ---- hide service widgets ----
            if (node.widgets) {
                for (const w of node.widgets) {
                    if (HIDDEN_WIDGETS.includes(w.name)) {
                        w.hidden = true;
                        w.computeSize = () => [0, -4];
                    }
                }
            }

            // ---- size ----
            const MIN_W = 1100, MIN_H = 720;
            const origComputeSize = node.computeSize?.bind(node);
            node.computeSize = function (width) {
                let s = origComputeSize ? origComputeSize(width) : [width || this.size[0], MIN_H];
                return [Math.max(s[0], MIN_W), Math.max(s[1], MIN_H)];
            };
            node.size[0] = Math.max(node.size[0], MIN_W);
            node.size[1] = Math.max(node.size[1], MIN_H);

            // ---- root + columns ----
            const root = document.createElement("div");
            root.style.cssText = `display:flex;flex-direction:row;gap:8px;width:100%;height:100%;padding:6px;box-sizing:border-box;background:var(--f3k-bg,#0a0a0a);border-radius:var(--f3k-radius,6px);font-family:monospace;overflow:hidden;`;

            function makeColumn(f) {
                const col = document.createElement("div");
                col.style.cssText = `display:flex;flex-direction:column;gap:6px;flex:${f};min-width:0;height:100%;overflow-y:auto;overflow-x:hidden;`;
                root.appendChild(col);
                return col;
            }

            const col1 = makeColumn(1.0);
            const col2 = makeColumn(1.2);
            const col3 = makeColumn(1.0);

            const onChange = () => {
                syncWidgetsValues(node);
                node.graph?.change?.();
            };

            // ---- MOUNT PANEL FIRST ----
            try {
                node.addDOMWidget(
                    "f3k_atelier_panel",
                    "panel",
                    root,
                    { serialize: false, hideOnZoom: false }
                );
            } catch (e) {
                console.error("[F3K] addDOMWidget failed:", e);
                return result;
            }

            node._f3kRefs = {};

            // ---- SECTIONS ----
            try { node._f3kRefs.models = buildModelsSection(col1, node, onChange); } catch (e) { console.warn("[F3K] models:", e); }
            try { node._f3kRefs.slots = buildSlotsSection(col1, node, onChange); } catch (e) { console.warn("[F3K] slots:", e); }
            try { node._f3kRefs.control = buildControlSection(col1, node, onChange); } catch (e) { console.warn("[F3K] control:", e); }
            try { node._f3kRefs.output = buildOutputSection(col3, node, onChange); } catch (e) { console.warn("[F3K] output:", e); }
            try { node._f3kRefs.exec = buildExecSection(col3, node, onChange); } catch (e) { console.warn("[F3K] exec:", e); }

            // Prompt — async
            buildPromptSection(col2, node, onChange)
                .then((promptUI) => {
                    node._f3kRefs.prompt = promptUI;
                    try { node._f3kRestorePrompt?.(); } catch (e) {}
                })
                .catch((e) => console.warn("[F3K] prompt:", e));

            // ---- onConfigure ----
            const origOnConfigure = node.onConfigure;
            node.onConfigure = function (info) {
                if (origOnConfigure) origOnConfigure.apply(this, arguments);

                // переустановим node_id_hidden на всякий случай
                requestAnimationFrame(() => {
                    setHiddenWidget(node, "node_id_hidden", String(node.id));
                });

                const restore = () => {
                    try {
                        node._f3kRestoreModels?.();
                        node._f3kRestoreSlots?.();
                        node._f3kRestoreControl?.();
                        node._f3kRestoreExec?.();
                        node._f3kRestoreOutput?.();
                        node._f3kRestorePrompt?.();
                    } catch (e) {
                        console.warn("[F3K] restore:", e);
                    }
                    syncWidgetsValues(node);
                };

                requestAnimationFrame(() => {
                    restore();
                    setTimeout(restore, 50);
                    setTimeout(restore, 200);
                });
            };

            // ---- onExecuted: fallback prompt ----
            const origOnExecuted = node.onExecuted;
            node.onExecuted = function (message) {
                if (origOnExecuted) origOnExecuted.apply(this, arguments);
                if (message?.text) {
                    const txt = Array.isArray(message.text) ? message.text[0] : message.text;
                    if (txt && node._f3kPromptHandler) {
                        node._f3kPromptHandler({ node_id: String(node.id), prompt: txt });
                    }
                }
            };

            // ---- initial sync ----
            requestAnimationFrame(() => syncWidgetsValues(node));

            return result;
        };
    },
});