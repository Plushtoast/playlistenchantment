const normalize = (value) => String(value ?? "").replace(/^\/+/, "").replace(/\/+$/, "");

const decode = (value) => {
    try {
        return decodeURIComponent(value);
    } catch (error) {
        return value;
    }
};

/**
 * Compatibility layer representing a Foundry storage location as a source, optional bucket
 * and key. S3 URLs parse into that form and render back through toString; ordinary Foundry
 * user data paths pass through as plain paths. Provides join, parent, containment,
 * comparison and per-source browse options.
 */
export class FileLocation {
    static DEFAULT_ROOT = "modules/playlistenchantment/storage";

    static parse(path) {
        if (path instanceof FileLocation) return path;
        const raw = String(path ?? "");
        let match = null;
        try {
            match = foundry.applications.apps.FilePicker.implementation.matchS3URL(raw);
        } catch (error) {
            match = null;
        }
        if (match?.groups) return new FileLocation("s3", match.groups.key, match.groups.bucket);
        const forge = typeof ForgeVTT !== "undefined" && ForgeVTT?.usingTheForge;
        return new FileLocation(forge ? "forgevtt" : "data", raw);
    }

    static #s3Url(bucket, target) {
        const endpoint = game?.data?.files?.s3?.endpoint;
        if (!endpoint || !bucket) return null;
        return `${endpoint.protocol}//${bucket}.${endpoint.host}/${normalize(target)}`;
    }

    #source;
    #target;
    #bucket;

    constructor(source, target, bucket = null) {
        this.#source = source;
        this.#target = normalize(target);
        this.#bucket = bucket ?? null;
        Object.freeze(this);
    }

    get source() {
        return this.#source;
    }

    get target() {
        return this.#target;
    }

    get bucket() {
        return this.#bucket;
    }

    get #isS3() {
        return this.#source === "s3";
    }

    get browseOptions() {
        return this.#isS3 ? { bucket: this.#bucket } : {};
    }

    get name() {
        const segments = this.#target.split("/");
        return decode(segments[segments.length - 1] ?? "");
    }

    toString() {
        if (!this.#isS3) return this.#target;
        return FileLocation.#s3Url(this.#bucket, this.#target) ?? this.#target;
    }

    join(name) {
        const segment = normalize(name);
        if (!segment) return this;
        const target = this.#target ? `${this.#target}/${segment}` : segment;
        return new FileLocation(this.#source, target, this.#bucket);
    }

    parent() {
        if (!this.#target) return new FileLocation(this.#source, "", this.#bucket);
        const segments = this.#target.split("/");
        segments.pop();
        return new FileLocation(this.#source, segments.join("/"), this.#bucket);
    }

    contains(other) {
        const location = FileLocation.parse(other);
        if (location.source !== this.#source) return false;
        if (location.bucket !== this.#bucket) return false;
        if (!this.#target) return true;
        if (location.target === this.#target) return true;
        return location.target.startsWith(`${this.#target}/`);
    }

    equals(other) {
        if (!other) return false;
        const location = FileLocation.parse(other);
        return (
            location.source === this.#source &&
            location.bucket === this.#bucket &&
            location.target === this.#target
        );
    }

    compareKey() {
        const key = decode(this.toString()).trim();
        return this.#isS3 ? key : key.toLowerCase();
    }
}

export function installPickerOverride() {
    CONFIG.ux.FilePicker = class extends CONFIG.ux.FilePicker {
        async _prepareContext(options) {
            const context = await super._prepareContext(options);
            if (context.isFolderPicker && this.activeSource === "s3") {
                const location = new FileLocation("s3", this.source.target, this.source.bucket);
                const url = String(location);
                if (url !== location.target) context.selected = url;
            }
            return context;
        }
    };
}
