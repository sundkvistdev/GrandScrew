/**
 * DlcManager.js
 *
 * Manages Downloadable Content (DLC) packs for GrandFuck.
 * Communicates with the Python backend via a custom protocol
 * over HTTP GET requests.
 *
 * Protocol version: dlc/1.0
 * Base endpoint   : /api/dlc?action=<action>&...
 */

import XmlParser from "./XmlParser.js";

const API_BASE = "/api/dlc";
const PROTOCOL_VERSION = "dlc/1.0";

/**
 * Represents a single loaded DLC pack.
 */
export class DLCPack {
    constructor(id, src, manifest = null) {
        this.id = id;
        this.src = src;
        this.manifest = manifest;   // { Name, Author, Version }
        this.files = new Map();     // path → { raw, parsed(XmlNode) }
        this.loaded = false;
    }
}

export default class DlcManager {
    constructor() {
        this.parser = new XmlParser();
        this.packs = new Map();     // id → DLCPack
        this.initialized = false;
    }

    // ------------------------------------------------------------------
    // Low-level protocol helpers
    // ------------------------------------------------------------------

    async _fetch(action, params = {}) {
        const qs = new URLSearchParams({ action, ...params });
        const url = `${API_BASE}?${qs}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`DlcManager fetch failed: ${response.status} ${response.statusText}`);
        }
        const envelope = await response.json();
        if (envelope.protocol && envelope.protocol !== PROTOCOL_VERSION) {
            console.warn(`[DlcManager] Protocol mismatch: expected ${PROTOCOL_VERSION}, got ${envelope.protocol}`);
        }
        if (!envelope.ok) {
            throw new Error(`DlcManager protocol error: ${envelope.error || "unknown"}`);
        }
        return envelope.data;
    }

    // ------------------------------------------------------------------
    // High-level API
    // ------------------------------------------------------------------

    /**
     * Initialise the manager by querying the backend for the master DLC list.
     * Populates this.packs with skeleton DLCPack objects (manifest not yet loaded).
     */
    async initialize() {
        const data = await this._fetch("list");
        this.packs.clear();
        for (const entry of data.dlcs || []) {
            const id = entry.id || entry.src;
            this.packs.set(id, new DLCPack(id, entry.src));
        }
        this.initialized = true;
        console.log(`[DlcManager] Initialised with ${this.packs.size} DLC(s).`);
        return this;
    }

    /**
     * Return an array of all registered DLC ids.
     */
    listIds() {
        return Array.from(this.packs.keys());
    }

    /**
     * Return an array of all skeleton / loaded packs.
     */
    listPacks() {
        return Array.from(this.packs.values());
    }

    /**
     * Load the manifest (Name, Author, Version) for a DLC pack.
     * @param {string} id  DLC identifier.
     */
    async loadManifest(id) {
        const pack = this.packs.get(id);
        if (!pack) {
            throw new Error(`DlcManager: unknown DLC id "${id}"`);
        }
        const manifest = await this._fetch("manifest", { path: pack.src });
        pack.manifest = manifest;
        return manifest;
    }

    /**
     * Load a file (raw XML + parsed tree) through the custom protocol.
     * The file is cached inside the pack it belongs to, or in a shared cache
     * if no pack owns it.
     *
     * @param {string} path   Relative path, e.g. "POLICE.xml" or "dlc0/index.xml"
     * @param {string} [packId]  Optional owner pack id for caching.
     */
    async loadFile(path, packId = null) {
        const data = await this._fetch("load", { path });
        const parsed = this.parser.parse(data.raw);
        const entry = { raw: data.raw, parsed };

        if (packId && this.packs.has(packId)) {
            this.packs.get(packId).files.set(path, entry);
        }
        return entry;
    }

    /**
     * Convenience: resolve a DLC id to its source path via the backend.
     */
    async resolveId(id) {
        const data = await this._fetch("resolve", { id });
        return data.src;
    }

    /**
     * Full-load a DLC pack: manifest + any files you choose.
     * After this, pack.loaded === true.
     *
     * @param {string} id
     * @param {string[]} [extraFiles]  Additional file paths to load after manifest.
     */
    async loadPack(id, extraFiles = []) {
        await this.loadManifest(id);
        const pack = this.packs.get(id);

        for (const filePath of extraFiles) {
            await this.loadFile(filePath, id);
        }

        pack.loaded = true;
        console.log(`[DlcManager] Pack "${id}" loaded.`, pack.manifest);
        return pack;
    }

    /**
     * Get a cached file from a loaded pack.
     * @returns {{raw: string, parsed: XmlNode} | undefined}
     */
    getFile(packId, path) {
        const pack = this.packs.get(packId);
        if (!pack) return undefined;
        return pack.files.get(path);
    }

    /**
     * Quick status check against the backend.
     */
    async checkStatus() {
        const response = await fetch("/api/status");
        return response.json();
    }
}
