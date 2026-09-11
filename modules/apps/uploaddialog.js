import { FileLocation } from "../core/filelocation.js";
import { Librarian } from "../core/librarian.js";
import { Permissions } from "../core/permissionservice.js";
import { UploadService } from "../core/uploadservice.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// Foundry cannot move or rename files after upload; pick the destination first.
export class UploadDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "pe-upload-dialog",
        classes: ["playlistenchantment", "pe-dialog", "pe-upload-dialog"],
        window: { title: "PLAYLISTENCHANTMENT.UPLOAD.title", icon: "fa-solid fa-cloud-arrow-up" },
        position: { width: 560, height: 560 },
        actions: {
            openFolder: UploadDialog._onOpenFolder,
            goUp: UploadDialog._onGoUp,
            newFolder: UploadDialog._onNewFolder,
            pickFiles: UploadDialog._onPickFiles,
            removeFile: UploadDialog._onRemoveFile,
            startUpload: UploadDialog._onStartUpload,
        },
    };

    static PARTS = {
        main: {
            root: true,
            template: "modules/playlistenchantment/templates/dialogs/uploaddialog.hbs",
            scrollable: [".pe-folder-list"],
        },
    };

    #target = UploadService.defaultTarget;
    #files = [];
    #folders = [];
    #playlist = null;
    #uploading = false;

    constructor({ files = [], playlist = null } = {}, options = {}) {
        super(options);
        this.#files = files;
        this.#playlist = playlist;
    }

    static show({ files = [], playlist = null } = {}) {
        if (!Permissions.canUpload()) {
            ui.notifications.warn(_loc("PLAYLISTENCHANTMENT.UPLOAD.noPermission"));
            return null;
        }
        const existing = foundry.applications.instances.get(this.DEFAULT_OPTIONS.id);
        if (existing) {
            existing.addFiles(files);
            existing.bringToFront();
            return existing;
        }
        const dialog = new this({ files, playlist });
        dialog.render(true);
        return dialog;
    }

    static audioFilesFrom(dataTransfer) {
        return UploadService.filterAudioFiles(dataTransfer?.files);
    }

    addFiles(files) {
        this.#files = [...this.#files, ...files];
        this.render();
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        this.#folders = await UploadService.subfolders(this.#target);

        context.target = String(this.#target);
        context.root = UploadService.root;
        context.atRoot = UploadService.location.equals(this.#target);
        context.folders = this.#folders;
        context.files = this.#files.map((file, index) => ({
            index,
            name: file.name,
            size: this.#formatSize(file.size),
            destination: String(this.#target.join(file.name)),
        }));
        context.hasFiles = !!this.#files.length;
        context.uploading = this.#uploading;
        context.playlists = Librarian.browsablePlaylists({ boards: false })
            .filter((playlist) => Permissions.canEdit(playlist))
            .map((playlist) => ({
                id: playlist.id,
                name: playlist.name,
                selected: playlist.id === this.#playlist?.id,
            }));
        context.warning = _loc("PLAYLISTENCHANTMENT.UPLOAD.cannotMove");
        return context;
    }

    #formatSize(bytes) {
        if (!Number.isFinite(bytes)) return "";
        const mb = bytes / (1024 * 1024);
        return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }

    static _onOpenFolder(_event, target) {
        const location = FileLocation.parse(target.dataset.path);
        if (!UploadService.location.contains(location)) return;
        this.#target = location;
        this.render();
    }

    static _onGoUp() {
        const root = UploadService.location;
        if (root.equals(this.#target)) return;
        const parent = this.#target.parent();
        this.#target = root.contains(parent) ? parent : root;
        this.render();
    }

    static async _onNewFolder() {
        const name = await foundry.applications.api.DialogV2.prompt({
            window: { title: "PLAYLISTENCHANTMENT.UPLOAD.newFolder" },
            content: `<p>${_loc("PLAYLISTENCHANTMENT.UPLOAD.newFolderIn", { path: String(this.#target) })}</p>
                      <input type="text" name="name" autofocus />`,
            ok: {
                label: "PLAYLISTENCHANTMENT.create",
                callback: (_event, button) => button.form.elements.name.value,
            },
            rejectClose: false,
        });
        if (!name) return;
        try {
            this.#target = await UploadService.createDirectory(this.#target, name);
            this.render();
        } catch (error) {
            ui.notifications.error(error.message);
        }
    }

    static async _onPickFiles() {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.accept = Object.keys(CONST.AUDIO_FILE_EXTENSIONS).map((extension) => `.${extension}`).join(",");
        input.addEventListener("change", () => this.addFiles(UploadService.filterAudioFiles(input.files)));
        input.click();
    }

    static _onRemoveFile(_event, target) {
        const index = Number(target.dataset.index);
        this.#files = this.#files.filter((_file, position) => position !== index);
        this.render();
    }

    static async _onStartUpload() {
        if (!this.#files.length || this.#uploading) return;
        const select = this.element.querySelector('[name="playlist"]');
        const playlist = game.playlists.get(select?.value) ?? this.#playlist;

        this.#uploading = true;
        this.render();
        try {
            await UploadService.upload(this.#files, this.#target, playlist);
            this.#files = [];
        } finally {
            this.#uploading = false;
        }
        await this.close();
    }
}
