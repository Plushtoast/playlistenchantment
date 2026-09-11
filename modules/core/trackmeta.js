import { MODULE } from "../settings.js";
import { TrackIndex } from "./trackindex.js";
import { Tags } from "./tagservice.js";

export class TrackMeta {
    static KEY = "meta";
    static VERSION = 1;
    static DEFAULTS = { cover: "", color: "", tags: [] };

    /** Guards against the propagation writes triggering another propagation. */
    static #propagating = false;

    static get isPropagating() {
        return this.#propagating;
    }

    static read(document) {
        const stored = document?.getFlag(MODULE, this.KEY) ?? {};
        return {
            cover: stored.cover ?? "",
            color: stored.color ?? "",
            tags: Array.isArray(stored.tags) ? stored.tags : [],
        };
    }

    static hasMeta(document) {
        const meta = this.read(document);
        return !!(meta.cover || meta.color || meta.tags.length);
    }

    static coverFor(sound) {
        return this.read(sound).cover || this.read(sound?.parent).cover || "";
    }

    static colorFor(sound) {
        return this.read(sound).color || this.read(sound?.parent).color || "";
    }

    static tagsFor(sound) {
        const own = this.read(sound).tags;
        return own.length ? own : this.read(sound?.parent).tags;
    }

    static async write(document, data, { propagate = true } = {}) {
        if (!document) return;
        const meta = this.#normalize({ ...this.read(document), ...data });
        if (document.documentName === "Folder") {
            const color = meta.tags.length ? Tags.get(meta.tags[0]).color : "";
            await document.update({
                color: color || null,
                [`flags.${MODULE}.${this.KEY}`]: { ...meta, v: this.VERSION },
            });
            return meta;
        }
        await document.setFlag(MODULE, this.KEY, { ...meta, v: this.VERSION });
        if (propagate && document.documentName === "PlaylistSound") {
            await this.propagate(document, meta);
        }
        return meta;
    }

    static async propagate(sound, meta) {
        if (this.#propagating) return;
        const siblings = TrackIndex.siblings(sound).filter((other) => other.parent?.isOwner);
        if (!siblings.length) return;

        const byPlaylist = new Map();
        for (const sibling of siblings) {
            if (!byPlaylist.has(sibling.parent.id)) byPlaylist.set(sibling.parent.id, []);
            byPlaylist.get(sibling.parent.id).push({
                _id: sibling.id,
                [`flags.${MODULE}.${this.KEY}`]: { ...meta, v: this.VERSION },
            });
        }

        this.#propagating = true;
        try {
            for (const [playlistId, updates] of byPlaylist) {
                const playlist = game.playlists.get(playlistId);
                await playlist?.updateEmbeddedDocuments("PlaylistSound", updates, { render: false });
            }
        } finally {
            this.#propagating = false;
        }
    }

    static async addTag(document, tag) {
        const [normalized] = this.parseTags(tag);
        if (!normalized || !document) return;
        const tags = this.read(document).tags;
        if (tags.includes(normalized)) return;
        return this.write(document, { tags: [...tags, normalized] });
    }

    static async toggleTag(document, tag) {
        const [normalized] = this.parseTags(tag);
        if (!normalized || !document) return null;
        const own = this.read(document).tags;
        if (own.includes(normalized)) {
            await this.write(document, { tags: own.filter((entry) => entry !== normalized) });
            return "removed";
        }
        if (document.documentName === "PlaylistSound" && !own.length) {
            const inherited = this.read(document.parent).tags;
            if (inherited.includes(normalized)) {
                await this.write(document, { tags: inherited.filter((entry) => entry !== normalized) });
                return "removed";
            }
        }
        await this.write(document, { tags: [...own, normalized] });
        return "added";
    }

    static async removeTag(document, tag) {
        const [normalized] = this.parseTags(tag);
        const tags = this.read(document).tags;
        if (!normalized || !tags.includes(normalized)) return;
        return this.write(document, { tags: tags.filter((entry) => entry !== normalized) });
    }

    static async inherit(targetSound, sourceSound) {
        const meta = this.read(sourceSound);
        if (!this.hasMeta(sourceSound)) return;
        return this.write(targetSound, meta, { propagate: false });
    }

    static fromForm({ cover, color, useColor, tags } = {}) {
        return { ...this.#normalize({ cover, color: useColor ? color : "", tags }), v: this.VERSION };
    }

    static parseTags(value) {
        const seen = new Set();
        const tags = [];
        for (const raw of Array.isArray(value) ? value : String(value ?? "").split(",")) {
            const tag = String(raw).trim().toLowerCase();
            if (!tag || seen.has(tag)) continue;
            seen.add(tag);
            tags.push(tag);
        }
        return tags;
    }

    static #normalize(meta) {
        return {
            cover: meta.cover ? String(meta.cover) : "",
            color: meta.color ? String(meta.color) : "",
            tags: this.parseTags(meta.tags),
        };
    }

    static allTags() {
        const tags = new Set();
        for (const playlist of game.playlists) {
            for (const tag of this.read(playlist).tags) tags.add(tag);
            for (const sound of playlist.sounds) {
                for (const tag of this.read(sound).tags) tags.add(tag);
            }
        }
        for (const folder of game.folders) {
            if (folder.type !== "Playlist") continue;
            for (const tag of this.read(folder).tags) tags.add(tag);
        }
        return [...tags].sort();
    }

    static matchesPlaylist(playlist, { query = "", tags = [] } = {}) {
        if (!query && !tags.length) return true;
        if (!playlist) return false;

        const own = this.read(playlist).tags;
        const nameMatches = !query || playlist.name.toLowerCase().includes(query.toLowerCase());
        const tagsMatch = !tags.length || tags.every((tag) => own.includes(tag));
        if (nameMatches && tagsMatch) return true;

        return playlist.sounds.some((sound) => this.matches(sound, { query, tags }));
    }

    static matches(sound, { query = "", tags = [] } = {}) {
        if (query) {
            const haystack = `${sound.name} ${sound.parent?.name ?? ""} ${this.tagsFor(sound).join(" ")}`.toLowerCase();
            if (!haystack.includes(query.toLowerCase())) return false;
        }
        if (tags.length) {
            const own = this.tagsFor(sound);
            if (!tags.every((tag) => own.includes(tag))) return false;
        }
        return true;
    }
}
