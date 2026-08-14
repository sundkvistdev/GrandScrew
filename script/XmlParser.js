/*
 * PoorXml.js
 *
 * A deliberately small XML parser.
 *
 * It handles:
 *   - Elements
 *   - Attributes
 *   - Nested elements
 *   - Text
 *   - Self-closing elements
 *   - XML comments
 *   - XML declarations
 *
 * It does NOT properly handle:
 *   - Namespaces
 *   - CDATA
 *   - Entities beyond a few basic ones
 *   - DOCTYPE
 *   - Mixed-content edge cases
 *   - Every possible XML quoting/escaping horror
 *
 * Example:
 *
 * const xml = `
 * <PoliceMod:Config version="2.6">
 *   <SceneConfig id="scene_cfg0">
 *     <AllowAutoAdjust>true</AllowAutoAdjust>
 *   </SceneConfig>
 * </PoliceMod:Config>
 * `;
 *
 * const parser = new PoorXmlParser();
 * const root = parser.parse(xml);
 *
 * console.log(root.name);
 * console.log(root.attributes.version);
 * console.log(root.children[0].name);
 */

export default class XmlParser {
    parse(xml) {
        if (typeof xml !== "string") {
            throw new TypeError("XML input must be a string.");
        }

        let source = xml;
        let position = 0;

        const stack = [];
        let root = null;

        function error(message) {
            throw new Error(
                "XML parse error at position " +
                position +
                ": " +
                message
            );
        }

        function skipWhitespace() {
            while (
                position < source.length &&
                /\s/.test(source[position])
            ) {
                position++;
            }
        }

        function startsWith(value) {
            return source.substring(position, position + value.length) === value;
        }

        function readUntil(value) {
            const start = position;
            const end = source.indexOf(value, position);

            if (end === -1) {
                error("Expected '" + value + "'.");
            }

            position = end + value.length;
            return source.substring(start, end);
        }

        function decodeEntities(value) {
            return value
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, "\"")
                .replace(/&apos;/g, "'")
                .replace(/&amp;/g, "&");
        }

        function parseName() {
            const start = position;

            while (
                position < source.length &&
                !/[\s/>=]/.test(source[position])
            ) {
                position++;
            }

            if (start === position) {
                error("Expected a name.");
            }

            return source.substring(start, position);
        }

        function parseAttributes() {
            const attributes = {};

            while (position < source.length) {
                skipWhitespace();

                if (startsWith("/>") || source[position] === ">") {
                    break;
                }

                const name = parseName();

                skipWhitespace();

                if (source[position] !== "=") {
                    error("Expected '=' after attribute '" + name + "'.");
                }

                position++;
                skipWhitespace();

                const quote = source[position];

                if (quote !== "\"" && quote !== "'") {
                    error("Attribute '" + name + "' must use quotes.");
                }

                position++;

                const start = position;
                const end = source.indexOf(quote, position);

                if (end === -1) {
                    error("Unterminated attribute '" + name + "'.");
                }

                const value = source.substring(start, end);

                attributes[name] = decodeEntities(value);
                position = end + 1;
            }

            return attributes;
        }

        function parseElement() {
            if (source[position] !== "<") {
                error("Expected '<'.");
            }

            position++;

            if (source[position] === "/") {
                error("Unexpected closing tag.");
            }

            const name = parseName();
            const attributes = parseAttributes();

            const node = new XmlNode(name, attributes);

            if (startsWith("/>")) {
                position += 2;
                return node;
            }

            if (source[position] !== ">") {
                error("Expected '>' after element.");
            }

            position++;

            while (position < source.length) {
                if (startsWith("<!--")) {
                    position += 4;

                    const end = source.indexOf("-->", position);

                    if (end === -1) {
                        error("Unterminated comment.");
                    }

                    position = end + 3;
                    continue;
                }

                if (startsWith("</")) {
                    position += 2;

                    const closingName = parseName();

                    skipWhitespace();

                    if (source[position] !== ">") {
                        error("Expected '>' after closing tag.");
                    }

                    position++;

                    if (closingName !== name) {
                        error(
                            "Mismatched closing tag. Expected </" +
                            name +
                            "> but found </" +
                            closingName +
                            ">."
                        );
                    }

                    return node;
                }

                if (source[position] === "<") {
                    const child = parseElement();

                    child.parent = node;
                    node.children.push(child);

                    continue;
                }

                const start = position;
                const nextTag = source.indexOf("<", position);

                if (nextTag === -1) {
                    error("Unexpected end of document.");
                }

                const text = source.substring(start, nextTag);

                node.text += decodeEntities(text);
                position = nextTag;
            }

            error("Unterminated element <" + name + ">.");
        }

        while (position < source.length) {
            skipWhitespace();

            if (position >= source.length) {
                break;
            }

            /*
             * Ignore <?xml ... ?> and similar processing instructions.
             */
            if (startsWith("<?")) {
                position += 2;

                const end = source.indexOf("?>", position);

                if (end === -1) {
                    error("Unterminated processing instruction.");
                }

                position = end + 2;
                continue;
            }

            /*
             * Ignore comments outside the root too.
             */
            if (startsWith("<!--")) {
                position += 4;

                const end = source.indexOf("-->", position);

                if (end === -1) {
                    error("Unterminated comment.");
                }

                position = end + 3;
                continue;
            }

            if (source[position] !== "<") {
                error("Unexpected text outside root element.");
            }

            if (root !== null) {
                error("Multiple root elements are not supported.");
            }

            root = parseElement();

            skipWhitespace();

            if (position < source.length) {
                if (!startsWith("<!--") && !startsWith("<?")) {
                    error("Unexpected data after root element.");
                }
            }
        }

        if (root === null) {
            throw new Error("XML document has no root element.");
        }

        return root;
    }
}

class XmlNode {
    constructor(name, attributes = {}) {
        this.name = name;
        this.attributes = attributes;
        this.children = [];
        this.text = "";
        this.parent = null;
    }

    getAttribute(name, fallback = null) {
        if (Object.prototype.hasOwnProperty.call(this.attributes, name)) {
            return this.attributes[name];
        }

        return fallback;
    }

    child(name) {
        for (const child of this.children) {
            if (child.name === name) {
                return child;
            }
        }

        return null;
    }

    childrenNamed(name) {
        const result = [];

        for (const child of this.children) {
            if (child.name === name) {
                result.push(child);
            }
        }

        return result;
    }

    value(defaultValue = null) {
        const value = this.text.trim();

        if (value.length === 0) {
            return defaultValue;
        }

        return value;
    }
}


// Example:
//
// const root = Xml.parse(`
//     <PoliceMod:Config version="2.6">
//         <SceneConfig id="scene_cfg0">
//             <AllowAutoAdjust>true</AllowAutoAdjust>
//             <MaxAliveCops>40</MaxAliveCops>
//         </SceneConfig>
//
//         <Regions>
//             <Region id="CITY">
//                 <Layer>1</Layer>
//                 <Rect>0 -1300 1800 1000</Rect>
//             </Region>
//         </Regions>
//     </PoliceMod:Config>
// `);
//
// console.log(root.name);
// console.log(root.getAttribute("version"));
//
// const scene = root.child("SceneConfig");
// console.log(scene.getAttribute("id"));
// console.log(scene.child("MaxAliveCops").value());
//
// const regions = root.child("Regions").childrenNamed("Region");