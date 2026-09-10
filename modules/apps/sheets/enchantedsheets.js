import { MODULE } from "../../settings.js";
import { Tags } from "../../core/tagservice.js";
import { TrackIndex } from "../../core/trackindex.js";
import { TrackMeta } from "../../core/trackmeta.js";

const FLAG_PATH = `flags.${MODULE}.${TrackMeta.KEY}`;

export const EnchantmentSheetMixin = (Base) =>
    class EnchantedDocumentSheet extends Base {
        static DEFAULT_OPTIONS = {
            classes: ["playlistenchantment", "pe-sheet"],
            actions: {
                pickCover: EnchantedDocumentSheet._onPickCover,
                clearCover: EnchantedDocumentSheet._onClearCover,
                toggleSheetTag: EnchantedDocumentSheet._onToggleSheetTag,
            },
        };

        static TABS = {
            sheet: {
                tabs: [
                    { id: "data", icon: "fa-solid fa-sliders" },
                    { id: "enchantment", icon: "fa-solid fa-wand-magic-sparkles" },
                ],
                initial: "data",
                labelPrefix: "PLAYLISTENCHANTMENT.EDITOR.TABS",
            },
        };

        async _preparePartContext(partId, context, options) {
            context = await super._preparePartContext(partId, context, options);
            if (partId === "enchantment") {
                const meta = TrackMeta.read(this.document);
                const isSound = this.document.documentName === "PlaylistSound";
                const copies = isSound ? TrackIndex.count(this.document.path) : 0;
                const active = new Set(meta.tags);

                context.flagPath = FLAG_PATH;
                context.meta = meta;
                context.color = meta.color || "#4a90d9";
                context.hasColor = !!meta.color;
                context.tagString = meta.tags.join(", ");
                context.tagChoices = Tags.suggestions(TrackMeta.allTags()).map((tag) => ({
                    ...tag,
                    active: active.has(tag.tag),
                }));
                context.isSound = isSound;
                context.propagates = copies > 1;
                context.propagateHint = game.i18n.format("PLAYLISTENCHANTMENT.EDITOR.propagates", { count: copies - 1 });
                context.inheritHint = game.i18n.localize("PLAYLISTENCHANTMENT.EDITOR.inheritHint");
            }
            if (partId in (context.tabs ?? {})) context.tab = context.tabs[partId];
            return context;
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        _processFormData(event, form, formData) {
            const data = super._processFormData(event, form, formData);
            const meta = foundry.utils.getProperty(data, FLAG_PATH);
            if (meta) foundry.utils.setProperty(data, FLAG_PATH, TrackMeta.fromForm(meta));
            if (this.document.documentName === "Folder") {
                const tags = foundry.utils.getProperty(data, FLAG_PATH)?.tags ?? [];
                if (tags.length) data.color = Tags.get(tags[0]).color || data.color || null;
            }
            return data;
        }

        /** @inheritDoc */
        async _processSubmitData(event, form, submitData, options) {
            await super._processSubmitData(event, form, submitData, options);
            if (this.document.documentName !== "PlaylistSound") return;
            if (!foundry.utils.getProperty(submitData, FLAG_PATH)) return;
            return TrackMeta.propagate(this.document, TrackMeta.read(this.document));
        }

        /* -------------------------------------------- */

        get #coverInput() {
            return this.element.querySelector(`[name="${FLAG_PATH}.cover"]`);
        }

        static async _onPickCover() {
            const input = this.#coverInput;
            const picker = new foundry.applications.apps.FilePicker.implementation({
                type: "image",
                current: input?.value ?? "",
                callback: (path) => {
                    if (input) input.value = path;
                    const preview = this.element.querySelector(".pe-cover-preview");
                    if (preview) preview.style.backgroundImage = `url("${path}")`;
                },
            });
            return picker.browse();
        }

        static _onClearCover() {
            const input = this.#coverInput;
            if (input) input.value = "";
            const preview = this.element.querySelector(".pe-cover-preview");
            if (preview) preview.style.backgroundImage = "";
        }

        static _onToggleSheetTag(_event, target) {
            const input = this.element.querySelector(`[name="${FLAG_PATH}.tags"]`);
            if (!input) return;
            const tag = target.dataset.tag;
            const tags = TrackMeta.parseTags(input.value);
            const index = tags.indexOf(tag);
            if (index >= 0) tags.splice(index, 1);
            else tags.push(tag);
            input.value = tags.join(", ");
            target.classList.toggle("active", index < 0);
        }
    };

const ENCHANTMENT_TAB = {
    template: "modules/playlistenchantment/templates/sheets/sound-enchantment.hbs",
    templates: ["modules/playlistenchantment/templates/sheets/enchantment.hbs"],
    scrollable: [""],
};

export class EnchantedPlaylistConfig extends EnchantmentSheetMixin(foundry.applications.sheets.PlaylistConfig) {
    static PARTS = {
        tabs: { template: "templates/generic/tab-navigation.hbs" },
        data: {
            template: "modules/playlistenchantment/templates/sheets/playlist-data.hbs",
            scrollable: [""],
        },
        enchantment: ENCHANTMENT_TAB,
        footer: { template: "templates/generic/form-footer.hbs" },
    };
}

export class EnchantedSoundConfig extends EnchantmentSheetMixin(foundry.applications.sheets.PlaylistSoundConfig) {
    static PARTS = {
        tabs: { template: "templates/generic/tab-navigation.hbs" },
        data: {
            template: "modules/playlistenchantment/templates/sheets/sound-data.hbs",
            scrollable: [""],
        },
        enchantment: ENCHANTMENT_TAB,
        footer: { template: "templates/generic/form-footer.hbs" },
    };
}

export class EnchantedFolderConfig extends EnchantmentSheetMixin(foundry.applications.sheets.FolderConfig) {
    static PARTS = {
        tabs: { template: "templates/generic/tab-navigation.hbs" },
        data: {
            template: "modules/playlistenchantment/templates/sheets/folder-data.hbs",
            scrollable: [""],
        },
        enchantment: ENCHANTMENT_TAB,
        footer: { template: "templates/generic/form-footer.hbs" },
    };
}
