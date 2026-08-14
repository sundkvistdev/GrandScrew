/*
 * XmlVisualizer.js
 *
 * A small browser-side XML tree visualizer for the PoorXmlParser / XmlNode
 * structure from the previous example.
 *
 * Usage:
 *
 *   const root = Xml.parse(xmlText);
 *   const visualizer = new XmlVisualizer(document.getElementById("xml"));
 *   visualizer.show(root);
 *
 * Or:
 *
 *   visualizer.showXml(xmlText);
 *
 * The visualizer creates a simple expandable tree:
 *
 *   ▼ PoliceMod:Config [version="2.6"]
 *     ▼ SceneConfig [id="scene_cfg0"]
 *       AllowAutoAdjust = "true"
 *       MaxAliveCops = "40"
 *
 * It expects nodes shaped approximately like:
 *
 *   {
 *       name: "...",
 *       attributes: {...},
 *       children: [...],
 *       text: "..."
 *   }
 */

export default class XmlVisualizer {
    constructor(target, options = {}) {
        if (!(target instanceof HTMLElement)) {
            throw new TypeError("XmlVisualizer target must be an HTMLElement.");
        }

        this.target = target;

        this.options = {
            showText: true,
            showAttributes: true,
            startExpanded: true,
            indent: 18,
            ...options
        };

        this.element = null;
    }

    clear() {
        this.target.innerHTML = "";
        this.element = null;
    }

    show(root) {
        if (!root || typeof root.name !== "string") {
            throw new TypeError("Invalid XML root node.");
        }

        this.clear();

        this.element = document.createElement("div");
        this.element.className = "xml-visualizer";

        this.injectStyle();

        const tree = this.createNode(root, 0);

        this.element.appendChild(tree);
        this.target.appendChild(this.element);

        return this.element;
    }

    showXml(xmlText) {
        if (typeof Xml === "undefined" || typeof Xml.parse !== "function") {
            throw new Error(
                "Xml.parse() is not available. Load the XML parser first."
            );
        }

        const root = Xml.parse(xmlText);
        return this.show(root);
    }

    createNode(node, depth) {
        const wrapper = document.createElement("div");
        wrapper.className = "xml-node";

        wrapper.style.marginLeft =
            (depth * this.options.indent) + "px";

        const hasChildren = Array.isArray(node.children) &&
            node.children.length > 0;

        const hasText =
            typeof node.text === "string" &&
            node.text.trim().length > 0;

        const header = document.createElement("div");
        header.className = "xml-node-header";

        /*
         * Expand/collapse button.
         */
        const toggle = document.createElement("button");

        toggle.type = "button";
        toggle.className = "xml-toggle";

        if (hasChildren) {
            toggle.textContent =
                this.options.startExpanded ? "▼" : "▶";
        } else {
            toggle.textContent = "•";
            toggle.disabled = true;
        }

        header.appendChild(toggle);

        /*
         * Element name.
         */
        const name = document.createElement("span");
        name.className = "xml-name";
        name.textContent = "<" + node.name + ">";

        header.appendChild(name);

        /*
         * Attributes.
         */
        if (
            this.options.showAttributes &&
            node.attributes &&
            typeof node.attributes === "object"
        ) {
            for (const attributeName of Object.keys(node.attributes)) {
                const attribute = document.createElement("span");

                attribute.className = "xml-attribute";

                attribute.textContent =
                    " " +
                    attributeName +
                    "=\"" +
                    String(node.attributes[attributeName]) +
                    "\"";

                header.appendChild(attribute);
            }
        }

        wrapper.appendChild(header);

        /*
         * Children container.
         */
        const content = document.createElement("div");
        content.className = "xml-node-content";

        if (!this.options.startExpanded && hasChildren) {
            content.style.display = "none";
        }

        /*
         * Text node.
         */
        if (this.options.showText && hasText) {
            const text = document.createElement("div");

            text.className = "xml-text";
            text.textContent =
                "\"" +
                node.text.trim() +
                "\"";

            content.appendChild(text);
        }

        /*
         * Child elements.
         */
        if (hasChildren) {
            for (const child of node.children) {
                content.appendChild(
                    this.createNode(child, depth + 1)
                );
            }
        }

        wrapper.appendChild(content);

        /*
         * Toggle expansion.
         */
        if (hasChildren) {
            let expanded = this.options.startExpanded;

            toggle.addEventListener("click", () => {
                expanded = !expanded;

                content.style.display =
                    expanded ? "" : "none";

                toggle.textContent =
                    expanded ? "▼" : "▶";
            });
        }

        return wrapper;
    }

    injectStyle() {
        /*
         * Don't inject the same stylesheet repeatedly.
         */
        if (document.getElementById("xml-visualizer-style")) {
            return;
        }

        const style = document.createElement("style");

        style.id = "xml-visualizer-style";

        style.textContent = `
            .xml-visualizer {
                box-sizing: border-box;
                width: 100%;
                font-family:
                    Consolas,
                    "Courier New",
                    monospace;
                font-size: 14px;
                line-height: 1.5;
                color: #222;
                background: #fff;
                border: 1px solid #ccc;
                padding: 8px;
                overflow: auto;
            }

            .xml-node {
                box-sizing: border-box;
            }

            .xml-node-header {
                display: flex;
                align-items: center;
                min-height: 22px;
                white-space: nowrap;
            }

            .xml-toggle {
                width: 22px;
                height: 22px;
                padding: 0;
                margin: 0 2px 0 0;
                border: 0;
                background: transparent;
                font-family: inherit;
                font-size: 12px;
                cursor: pointer;
            }

            .xml-toggle:disabled {
                cursor: default;
                opacity: 0.5;
            }

            .xml-name {
                font-weight: bold;
            }

            .xml-attribute {
                margin-left: 3px;
                color: #666;
            }

            .xml-text {
                margin-left: 24px;
                color: #555;
                white-space: pre-wrap;
                word-break: break-word;
            }

            .xml-node-content {
                box-sizing: border-box;
            }

            .xml-node-header:hover {
                background: #f0f0f0;
            }
        `;

        document.head.appendChild(style);
    }
}