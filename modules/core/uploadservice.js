import { Settings } from "../settings.js";
import { Permissions } from "./permissionservice.js";
import { TrackIndex } from "./trackindex.js";

// Foundry cannot move, rename or delete files after upload.
export class UploadService {
    static isForge() {
        return typeof ForgeVTT !== "undefined" && ForgeVTT && ForgeVTT.usingTheForge;
    }

    static get picker() {
        return this.isForge() ? ForgeVTT_FilePicker : foundry.applications.apps.FilePicker.implementation;
    }

    static get source() {
        return this.isForge() ? "forgevtt" : "data";
    }

    static get root() {
        return Settings.get("soundUploadFolder") || "modules/playlistenchantment/storage";
    }

    static get defaultTarget() {
        const remembered = Settings.get("lastUploadFolder");
        if (remembered && remembered.startsWith(this.root)) return remembered;
        return this.root;
    }

    static async rememberTarget(path) {
        return Settings.set("lastUploadFolder", path ?? "");
    }

    /* -------------------------------------------- */
    /*  Browsing                                    */
    /* -------------------------------------------- */

    static async browse(target) {
        const path = target || this.root;
        try {
            return await this.picker.browse(this.source, path);
        } catch (error) {
            console.warn(`playlistenchantment | cannot browse ${path}`, error);
            return { target: path, dirs: [], files: [] };
        }
    }

    static async subfolders(target) {
        const result = await this.browse(target);
        return (result.dirs ?? []).map((dir) => ({
            path: dir,
            name: decodeURIComponent(dir.split("/").filter(Boolean).pop() ?? dir),
        }));
    }

    static async audioFiles(target) {
        const result = await this.browse(target);
        return (result.files ?? []).filter((file) => this.isAudio(file));
    }

    static isAudio(name) {
        const extension = String(name).split(".").pop()?.toLowerCase();
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
        const path = `${parent.replace(/\/$/, "")}/${folder}`;
        try {
            await this.picker.createDirectory(this.source, path);
        } catch (error) {
            // Foundry throws when the directory already exists, which is a perfectly fine outcome.
            if (!/EEXIST|already exists/i.test(error.message)) throw error;
        }
        return path;
    }

    /* -------------------------------------------- */
    /*  Uploading                                   */
    /* -------------------------------------------- */

    static async upload(files, target, playlist, { onProgress } = {}) {
        if (!Permissions.canUpload()) {
            ui.notifications.warn(game.i18n.localize("PLAYLISTENCHANTMENT.UPLOAD.noPermission"));
            return [];
        }
        const destination = target || this.defaultTarget;
        const existing = new Set((await this.audioFiles(destination)).map((file) => TrackIndex.key(file)));
        const sounds = [];
        let index = 0;

        for (const file of files) {
            index += 1;
            onProgress?.({ file, index, total: files.length });

            const candidate = `${destination.replace(/\/$/, "")}/${file.name}`;
            let path = candidate;

            if (existing.has(TrackIndex.key(candidate))) {
                ui.notifications.info(game.i18n.format("PLAYLISTENCHANTMENT.UPLOAD.reused", { file: file.name }));
            } else {
                const notification = ui.notifications.info(
                    game.i18n.format("PLAYLISTENCHANTMENT.uploading", { item: file.name }),
                    { permanent: true }
                );
                try {
                    const response = await this.picker.upload(this.source, destination, file);
                    path = response?.path ?? candidate;
                } finally {
                    ui.notifications.remove(notification);
                }
            }

            sounds.push({ name: this.trackName(file.name), path });
        }

        await this.rememberTarget(destination);
        if (playlist && sounds.length) {
            await playlist.createEmbeddedDocuments("PlaylistSound", sounds);
        }
        ui.notifications.info(game.i18n.localize("PLAYLISTENCHANTMENT.uploadDone"));
        return sounds;
    }

    static trackName(fileName) {
        return String(fileName).split(".").slice(0, -1).join(".") || fileName;
    }

    static filterAudioFiles(fileList) {
        return Array.from(fileList ?? []).filter((file) => this.isAudio(file.name));
    }
}
