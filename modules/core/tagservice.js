import { Settings } from "../settings.js";

export class Tags {
    static SETTING = "tagLibrary";

    static DEFAULTS = [
        { tag: "combat", color: "#c0392b" },
        { tag: "boss", color: "#7b241c" },
        { tag: "tension", color: "#d35400" },
        { tag: "ambient", color: "#2e86c1" },
        { tag: "tavern", color: "#b9770e" },
        { tag: "city", color: "#7d3c98" },
        { tag: "wilderness", color: "#1e8449" },
        { tag: "dungeon", color: "#4d5656" },
        { tag: "travel", color: "#148f77" },
        { tag: "ritual", color: "#6c3483" },
        { tag: "sad", color: "#34495e" },
        { tag: "victory", color: "#c9a227" },
    ];

    /* -------------------------------------------- */
    /*  Library                                     */
    /* -------------------------------------------- */

    static stored() {
        const saved = Settings.get(this.SETTING);
        const entries = Array.isArray(saved) && saved.length ? saved : this.DEFAULTS;
        return entries.map((entry) => ({
            tag: this.normalize(entry.tag),
            color: entry.color ?? "",
            label: entry.label ?? "",
        }));
    }

    static library() {
        return (this.#cache ??= this.stored().map((entry) => this.#entry(entry)));
    }

    static #cache = null;
    static #index = null;

    static invalidate() {
        this.#cache = null;
        this.#index = null;
    }

    static async saveLibrary(entries) {
        const cleaned = [];
        const seen = new Set();
        for (const entry of entries ?? []) {
            const tag = this.normalize(entry.tag);
            if (!tag || seen.has(tag)) continue;
            seen.add(tag);
            cleaned.push({ tag, color: this.#validColor(entry.color) || this.#derivedColor(tag), label: entry.label || "" });
        }
        await Settings.set(this.SETTING, cleaned);
        this.invalidate();
        return cleaned;
    }

    static async resetLibrary() {
        await Settings.set(this.SETTING, []);
        this.invalidate();
    }

    static normalize(tag) {
        return String(tag ?? "")
            .trim()
            .toLowerCase()
            .replace(/[,#]/g, "");
    }

    /* -------------------------------------------- */
    /*  Presentation                                */
    /* -------------------------------------------- */

    static get(tag) {
        const key = this.normalize(tag);
        this.#index ??= new Map(this.library().map((entry) => [entry.tag, entry]));
        return this.#index.get(key) ?? this.#entry({ tag: key });
    }

    static decorate(tags = []) {
        return tags.map((tag) => this.get(tag));
    }

    static suggestions(inUse = []) {
        const entries = this.library();
        const known = new Set(entries.map((entry) => entry.tag));
        for (const tag of inUse) {
            const key = this.normalize(tag);
            if (key && !known.has(key)) {
                known.add(key);
                entries.push(this.#entry({ tag: key }));
            }
        }
        return entries;
    }

    static #entry({ tag, color, label }) {
        const key = this.normalize(tag);
        const background = this.#validColor(color) || this.#derivedColor(key);
        return {
            tag: key,
            // The resolved label is what the UI shows; the raw one is what the editor round-trips,
            // so a default tag does not silently freeze its translated name into the world data.
            label: label || this.defaultLabel(key),
            rawLabel: label || "",
            color: background,
            foreground: this.contrastColor(background),
        };
    }

    static defaultLabel(tag) {
        const key = `PLAYLISTENCHANTMENT.TAGS.${tag}`;
        const localized = game.i18n.localize(key);
        return localized === key ? tag : localized;
    }

    /* -------------------------------------------- */
    /*  Colour                                      */
    /* -------------------------------------------- */

    static #validColor(color) {
        return /^#[0-9a-f]{6}$/i.test(String(color ?? "")) ? String(color).toLowerCase() : "";
    }

    static #derivedColor(tag) {
        let hash = 0;
        for (const character of tag) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
        const hue = hash % 360;
        return foundry.utils.Color.fromHSV([hue / 360, 0.55, 0.62]).css;
    }

    static contrastColor(background) {
        const luminance = this.#relativeLuminance(background);
        const onDark = (1.05) / (luminance + 0.05);
        const onLight = (luminance + 0.05) / 0.05;
        return onDark >= onLight ? "#ffffff" : "#12100e";
    }

    static #relativeLuminance(color) {
        const rgb = foundry.utils.Color.from(color).rgb;
        const [r, g, b] = rgb.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
}
