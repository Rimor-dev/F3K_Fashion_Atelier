/**
 * F3K Fashion Atelier — Module Д: Execution.
 * Preview event source: combine_node.py's guider.predict_noise.
 * Prompt event source: combine_node.py send_sync + ui.text fallback.
 */

import { app } from "../../scripts/app.js";
import { createSection, getJSON, setJSON } from "./ui_helpers.js";

const { api } = window.comfyAPI.api;

const EVENT_PREVIEW = "f3k_atelier_preview";
const EVENT_PROMPT  = "f3k_atelier_prompt";

if (!window.__f3kExecSubscribed) {
    window.__f3kExecSubscribed = true;

    api.addEventListener(EVENT_PREVIEW, (e) => {
        const data = e.detail;
        if (!data || data.node_id == null) return;
        const nodeId = parseInt(data.node_id, 10);
        if (isNaN(nodeId)) return;
        const node = app.graph?.getNodeById?.(nodeId);
        if (node?._f3kPreviewHandler) {
            node._f3kPreviewHandler(data);
        }
    });

    api.addEventListener(EVENT_PROMPT, (e) => {
        const data = e.detail;
        if (!data || data.node_id == null) return;
        const nodeId = parseInt(data.node_id, 10);
        if (isNaN(nodeId)) return;
        const node = app.graph?.getNodeById?.(nodeId);
        if (node?._f3kPromptHandler) {
            node._f3kPromptHandler(data);
        }
    });
}

export function buildExecSection(parent, node, onChange) {
    const sec = createSection(parent, "D · Execute", "preview + prompt");

    const previewBox = document.createElement("div");
    previewBox.className = "f3k-preview-box";
    previewBox.style.cssText = `
        width: 100%; min-height: 220px;
        display: flex; align-items: center; justify-content: center;
        padding: 0; background: #050505;
        overflow: hidden; position: relative;
    `;

    const previewImg = document.createElement("img");
    previewImg.style.cssText = `
        max-width: 100%; max-height: 220px;
        object-fit: contain; display: none;
    `;
    previewBox.appendChild(previewImg);

    const placeholder = document.createElement("span");
    placeholder.style.cssText = `
        color: var(--f3k-text-dim, #888); font-size: 11px; position: absolute;
    `;
    placeholder.textContent = "Waiting for sampler...";
    previewBox.appendChild(placeholder);

    sec._body.appendChild(previewBox);

    const progressText = document.createElement("div");
    progressText.className = "f3k-hint";
    progressText.style.textAlign = "center";
    progressText.textContent = "Idle";
    sec._body.appendChild(progressText);

    const state = { ...getJSON(node, "exec_config", { format: "json" }) };
    const saveNow = () => {
        setJSON(node, "exec_config", state);
        onChange?.();
    };

    const formatRow = document.createElement("div");
    formatRow.className = "f3k-btn-row";
    sec._body.appendChild(formatRow);

    const btnJson = document.createElement("button");
    btnJson.className = "f3k-btn" + (state.format === "json" ? " active" : "");
    btnJson.textContent = "JSON";
    btnJson.addEventListener("click", (e) => {
        e.stopPropagation();
        state.format = "json";
        btnJson.classList.add("active");
        btnLinear.classList.remove("active");
        saveNow();
    });
    formatRow.appendChild(btnJson);

    const btnLinear = document.createElement("button");
    btnLinear.className = "f3k-btn" + (state.format === "linear" ? " active" : "");
    btnLinear.textContent = "Linear";
    btnLinear.addEventListener("click", (e) => {
        e.stopPropagation();
        state.format = "linear";
        btnLinear.classList.add("active");
        btnJson.classList.remove("active");
        saveNow();
    });
    formatRow.appendChild(btnLinear);

    const promptHeader = document.createElement("div");
    promptHeader.className = "f3k-field-label";
    promptHeader.textContent = "Final prompt";
    promptHeader.style.marginTop = "6px";
    sec._body.appendChild(promptHeader);

    const promptBox = document.createElement("div");
    promptBox.className = "f3k-preview-box";
    promptBox.style.minHeight = "80px";
    promptBox.textContent = "// prompt will appear here";
    sec._body.appendChild(promptBox);

    node._f3kPreviewHandler = (data) => {
        if (data.image) {
            previewImg.src = `data:image/jpeg;base64,${data.image}`;
            previewImg.style.display = "block";
            placeholder.style.display = "none";
        }
        if (data.step !== undefined && data.total !== undefined) {
            progressText.textContent = `Step ${data.step} / ${data.total}`;
        }
    };

    node._f3kPromptHandler = (data) => {
        if (data.prompt) {
            promptBox.textContent = data.prompt;
            progressText.textContent = "Encoding...";
        }
    };

    const origOnRemoved = node.onRemoved;
    node.onRemoved = function () {
        node._f3kPreviewHandler = null;
        node._f3kPromptHandler = null;
        if (origOnRemoved) origOnRemoved.apply(this, arguments);
    };

    node._f3kRestoreExec = () => {
        const cfg = { ...getJSON(node, "exec_config", { format: "json" }) };
        Object.assign(state, cfg);
        btnJson.classList.toggle("active", state.format === "json");
        btnLinear.classList.toggle("active", state.format === "linear");
    };

    return { section: sec, state, save: saveNow };
}