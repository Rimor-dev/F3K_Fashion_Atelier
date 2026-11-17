/**
 * F3K Fashion Atelier — Models slots (MODEL / CLIP / VAE / Upsampler CLIP).
 *
 * Informational block: shows which source node is connected.
 * Updates on every connection change.
 */

import { createSection, createField, createInput } from "./ui_helpers.js";

export function buildModelsSection(parent, node, onChange) {
    const sec = createSection(parent, "⚙ Models", "connected ports");

    function addRow(label, portName) {
        const input = createInput("", () => {}, {
            placeholder: "(connect port)",
        });
        input.disabled = true;
        input.style.opacity = "0.7";

        const row = createField(sec._body, label, input);
        return { row, input, portName };
    }

    const modelRow = addRow("MODEL", "model");
    const clipRow  = addRow("CLIP",  "clip");
    const clipUpRow = addRow("CLIP UP", "clip_upsampler");
    const vaeRow   = addRow("VAE",   "vae");

    function refresh() {
        const inputs = node.inputs || [];
        for (const [row, portName] of [
            [modelRow, "model"],
            [clipRow, "clip"],
            [clipUpRow, "clip_upsampler"],
            [vaeRow, "vae"],
        ]) {
            const input = inputs.find(i => i.name === portName);
            const connected = !!input?.link;
            if (connected) {
                const linkId = input.link;
                const link = node.graph?.links?.[linkId];
                const srcNode = link ? node.graph.getNodeById(link.origin_id) : null;
                const label = srcNode?.title || srcNode?.type || "connected";
                row.input.value = label;
                row.input.style.color = "var(--f3k-text-accent, #4a90d9)";
            } else {
                row.input.value = "(connect port)";
                row.input.style.color = "var(--f3k-text-dim, #888)";
            }
        }
    }

    const origOnConnectionsChange = node.onConnectionsChange;
    node.onConnectionsChange = function () {
        if (origOnConnectionsChange) origOnConnectionsChange.apply(this, arguments);
        refresh();
        onChange?.();
    };

    setTimeout(refresh, 50);
    node._f3kRestoreModels = refresh;

    return {
        section: sec,
        refresh,
    };
}