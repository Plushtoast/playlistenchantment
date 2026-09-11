import { Settings } from "../../settings.js";
import { AudioChannels } from "../../core/audiochannels.js";
import { FileLocation } from "../../core/filelocation.js";
import { Tags } from "../../core/tagservice.js";
import { Theme } from "../../core/theme.js";
import { CombatPlaylistManager } from "../combatplaylists.js";

/**
 * Settings pane: appearance, studio hotkey, channel defaults, combat playlists, tag library, upload folder.
 * Mixer sliders in the transport bar reuse the same channel-setting writes.
 */
export class StudioSettings {
    #studio;
    #capturing = false;
    #pending = null;

    constructor(studio) {
        this.#studio = studio;
    }

    prepare(context) {
        context.heading = _loc("PLAYLISTENCHANTMENT.STUDIOSETTINGS.title");
        context.enchantmentStyle = Theme.useEnchantedStyle;
        const binding = this.#capturing ? this.#pending : Settings.studioBinding();
        context.hotkey = Settings.humanizeBinding(binding);
        context.capturing = this.#capturing;
        context.hotkeyConflict = Settings.conflictMessage(binding);
        if (!game.user.isGM) return context;

        context.channels = AudioChannels.mixerContext();
        context.autoCombatSwitch = CombatPlaylistManager.autoCombatSwitch;
        context.combatPlaylists = CombatPlaylistManager.options();
        context.tagLibrary = Tags.library();
        context.uploadFolder = Settings.get("soundUploadFolder");
        return context;
    }

    end() {
        window.removeEventListener("keydown", this.#onCaptureKey, true);
        this.#capturing = false;
        this.#pending = null;
    }

    destroy() {
        this.end();
    }

    async onChange(target) {
        const part = target.closest(".pe-mixer") ? "transport" : "content";

        if (target.matches('[name="enchantmentStyle"]')) {
            return Theme.setEnchantedStyle(target.checked);
        }

        if (target.matches(".pe-setting-volume")) {
            const volume = foundry.audio.AudioHelper.inputToVolume(target.value);
            await AudioChannels.setGlobalVolume(target.dataset.channel, volume);
            return this.#studio.render({ parts: [part] });
        }

        if (target.matches(".pe-setting-toggle")) {
            await AudioChannels.update(target.dataset.channel, { [target.dataset.setting]: target.checked });
            return this.#studio.render({ parts: [part] });
        }

        if (target.matches(".pe-setting-range")) {
            const raw = Number(target.value);
            const setting = target.dataset.setting;
            const value = setting === "normalizeModifier" ? foundry.audio.AudioHelper.inputToVolume(raw) : raw;
            await AudioChannels.update(target.dataset.channel, { [setting]: value });
            return this.#studio.render({ parts: [part] });
        }

        if (target.matches('[name="autoCombatSwitch"]')) {
            return CombatPlaylistManager.setEnabled(target.checked);
        }

        if (target.matches('[name="combatPlaylists"]')) {
            const checked = this.#studio.element.querySelectorAll('[name="combatPlaylists"]:checked');
            return CombatPlaylistManager.setPlaylists([...checked].map((input) => input.value));
        }

        if (target.matches('[name="soundUploadFolder"]')) {
            const value = target.value.trim();
            return Settings.set("soundUploadFolder", value ? String(FileLocation.parse(value)) : "");
        }

        if (target.closest(".pe-tag-row")) {
            await this.#saveTagRows();
            return this.#studio.render({ parts: ["header", "content"] });
        }
    }

    async addTag() {
        const library = Tags.stored();
        const base = Tags.normalize(_loc("PLAYLISTENCHANTMENT.STUDIOSETTINGS.tagNew"));
        let tag = base;
        let suffix = 2;
        while (library.some((entry) => entry.tag === tag)) tag = `${base}-${suffix++}`;
        library.push({ tag, color: "#4a90d9", label: "" });
        await Tags.saveLibrary(library);
        return this.#studio.render({ parts: ["header", "content"] });
    }

    async removeTag(target) {
        const index = Number(target.closest("[data-tag-index]")?.dataset.tagIndex);
        if (!Number.isInteger(index)) return;
        const library = Tags.stored();
        library.splice(index, 1);
        await Tags.saveLibrary(library);
        return this.#studio.render({ parts: ["header", "content"] });
    }

    async resetTags() {
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: "PLAYLISTENCHANTMENT.STUDIOSETTINGS.tagReset" },
            content: `<p>${_loc("PLAYLISTENCHANTMENT.STUDIOSETTINGS.tagResetHint")}</p>`,
        });
        if (!confirmed) return;
        await Tags.resetLibrary();
        return this.#studio.render({ parts: ["header", "content"] });
    }

    captureHotkey() {
        if (this.#capturing) return this.#stopHotkeyCapture();
        this.#pending = Settings.studioBinding();
        this.#capturing = true;
        window.addEventListener("keydown", this.#onCaptureKey, true);
        this.#studio.render({ parts: ["content"] }).then(() => {
            if (!this.#capturing) return;
            this.#studio.element.querySelector(".pe-keybinding .binding-input input")?.focus();
            if (this.#pending) this.#syncCapture(this.#pending);
        });
    }

    #onCaptureKey = (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.code === "Escape") return this.#stopHotkeyCapture();
        const binding = Settings.bindingFromEvent(event);
        if (!binding) return;
        this.#pending = binding;
        this.#syncCapture(binding);
    };

    async saveHotkey() {
        if (!this.#capturing) return;
        await Settings.setStudioBinding(this.#pending);
        this.#stopHotkeyCapture();
    }

    async clearHotkey() {
        await Settings.setStudioBinding(null);
        if (this.#capturing) this.#stopHotkeyCapture();
        else return this.#studio.render({ parts: ["content"] });
    }

    async browseUploadFolder() {
        const input = this.#studio.element.querySelector('[name="soundUploadFolder"]');
        const picker = new foundry.applications.apps.FilePicker.implementation({
            type: "folder",
            current: input?.value ?? "",
            callback: async (path) => {
                if (input) input.value = path;
                await Settings.set("soundUploadFolder", path);
            },
        });
        return picker.browse();
    }

    #stopHotkeyCapture() {
        this.end();
        if (this.#studio.rendered) this.#studio.render({ parts: ["content"] });
    }

    #syncCapture(binding) {
        const row = this.#studio.element?.querySelector(".pe-keybinding .editing");
        const input = row?.querySelector(".binding-input input");
        const icon = row?.querySelector(".binding-input i");
        if (!input || !icon) return;

        input.value = Settings.humanizeBinding(binding);
        const conflict = Settings.conflictMessage(binding);
        if (conflict) {
            icon.className = "conflict fa-duotone fa-triangle-exclamation";
            input.dataset.tooltip = "";
            input.ariaLabel = conflict;
        } else {
            icon.className = "fa-regular fa-keyboard";
            delete input.dataset.tooltip;
            input.ariaLabel = _loc("KEYBINDINGS.BoundKey");
        }
    }

    async #saveTagRows() {
        const rows = this.#studio.element.querySelectorAll(".pe-tag-row");
        const library = [...rows].map((row) => ({
            tag: row.querySelector(".pe-tag-name")?.value ?? "",
            color: row.querySelector(".pe-tag-color")?.value ?? "",
            label: row.querySelector(".pe-tag-label")?.value.trim() ?? "",
        }));
        return Tags.saveLibrary(library);
    }
}
