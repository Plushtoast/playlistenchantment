import { Settings } from "../settings.js";
import { FileLocation } from "./filelocation.js";
import { Permissions } from "./permissionservice.js";

// Foundry cannot move, rename or delete files after upload.
export class UploadService {
    static isForge() {
        return typeof ForgeVTT !== "undefined" && ForgeVTT && ForgeVTT.usingTheForge;
    }

    static get picker() {
        return this.isForge() ? ForgeVTT_FilePicker : foundry.applications.apps.FilePicker.implementation;
    }

    static get location() {
        return FileLocation.parse(Settings.get("soundUploadFolder") || FileLocation.DEFAULT_ROOT);
    }

    static get source() {
        return this.location.source;
    }

    static get root() {
        return String(this.location);
    }

    static get defaultTarget() {
        const root = this.location;
        const remembered = Settings.get("lastUploadFolder");
        if (!remembered) return root;
        const location = FileLocation.parse(remembered);
        return root.contains(location) ? location : root;
    }

    static async rememberTarget(location) {
        return Settings.set("lastUploadFolder", location ? String(location) : "");
    }

    /* -------------------------------------------- */
    /*  Browsing                                    */
    /* -------------------------------------------- */

    static async browse(target) {
        const location = target ? FileLocation.parse(target) : this.location;
        try {
            const result = await this.picker.browse(location.source, location.target, location.browseOptions);
            return { location, dirs: result.dirs ?? [], files: result.files ?? [] };
        } catch (error) {
            console.warn(`playlistenchantment | cannot browse ${location}`, error);
            return { location, dirs: [], files: [] };
        }
    }

    static async subfolders(target) {
        const { location, dirs } = await this.browse(target);
        return dirs.map((dir) => {
            const child = new FileLocation(location.source, dir, location.bucket);
            return { path: String(child), name: child.name };
        });
    }

    static async audioFiles(target) {
        const { files } = await this.browse(target);
        return files.filter((file) => this.isAudio(file));
    }

    static isAudio(name) {
        const clean = String(name).split("?")[0].split("#")[0];
        const extension = clean.split(".").pop()?.toLowerCase();
        return Object.keys(CONST.AUDIO_FILE_EXTENSIONS).includes(extension);
    }

    /* -------------------------------------------- */
    /*  Creating folders                            */
    /* -------------------------------------------- */

    static sanitizeFolderName(name) {
        return String(name)
            .trim()
            .replace(/[\\/:*?"<>|]/g, "")
            .replace(/\s+/g, " ")
            .slice(0, 64);
    }

    static async createDirectory(parent, name) {
        const folder = this.sanitizeFolderName(name);
        if (!folder) throw new Error(game.i18n.localize("PLAYLISTENCHANTMENT.UPLOAD.invalidFolder"));
        const location = FileLocation.parse(parent).join(folder);
        try {
            await this.picker.createDirectory(location.source, location.target, location.browseOptions);
        } catch (error) {
            // Foundry throws when the directory already exists, which is a perfectly fine outcome.
            if (!/EEXIST|already exists/i.test(error.message)) throw error;
        }
        return location;
    }

    /* -------------------------------------------- */
    /*  Uploading                                   */
    /* -------------------------------------------- */

    static async upload(files, target, playlist, { onProgress } = {}) {
        if (!Permissions.canUpload()) {
            ui.notifications.warn(game.i18n.localize("PLAYLISTENCHANTMENT.UPLOAD.noPermission"));
            return [];
        }
        const destination = target ? FileLocation.parse(target) : this.defaultTarget;
        const existing = new Set(
            (await this.audioFiles(destination)).map((file) => FileLocation.parse(file).compareKey())
        );
        const sounds = [];
        const failed = [];
        let index = 0;

        for (const file of files) {
            index += 1;
            onProgress?.({ file, index, total: files.length });

            const candidate = destination.join(file.name);
            let path = String(candidate);

            if (existing.has(candidate.compareKey())) {
                ui.notifications.info(game.i18n.format("PLAYLISTENCHANTMENT.UPLOAD.reused", { file: file.name }));
            } else {
                const notification = ui.notifications.info(
                    game.i18n.format("PLAYLISTENCHANTMENT.uploading", { item: file.name }),
                    { permanent: true }
                );
                let response;
                try {
                    response = await this.picker.upload(
                        destination.source,
                        destination.target,
                        file,
                        destination.browseOptions,
                        { notify: false }
                    );
                } finally {
                    ui.notifications.remove(notification);
                }

                if (!response?.path) {
                    failed.push(file.name);
                    ui.notifications.error(
                        game.i18n.format("PLAYLISTENCHANTMENT.UPLOAD.failed", { file: file.name })
                    );
                    continue;
                }
                path = response.path;
            }

            sounds.push({ name: this.trackName(file.name), path });
        }

        await this.rememberTarget(destination);
        if (playlist && sounds.length) {
            await playlist.createEmbeddedDocuments("PlaylistSound", sounds);
        }
        if (!failed.length) ui.notifications.info(game.i18n.localize("PLAYLISTENCHANTMENT.uploadDone"));
        return sounds;
    }

    static trackName(fileName) {
        return String(fileName).split(".").slice(0, -1).join(".") || fileName;
    }

    static filterAudioFiles(fileList) {
        return Array.from(fileList ?? []).filter((file) => this.isAudio(file.name));
    }
}
