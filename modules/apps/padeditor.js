import { SoundboardService } from "../core/soundboardservice.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PadEditor extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: ["playlistenchantment", "pe-dialog", "pe-pad-editor"],
        tag: "form",
        window: { title: "PLAYLISTENCHANTMENT.PAD.title", icon: "fa-solid fa-sliders" },
        position: { width: 420 },
        form: { handler: PadEditor._onSubmit, closeOnSubmit: true },
        actions: {
            editArtwork: PadEditor._onEditArtwork,
        },
    };

    static PARTS = {
        form: { root: true, template: "modules/playlistenchantment/templates/dialogs/padeditor.hbs" },
    };

    constructor(sound, options = {}) {
        super({ id: `pe-pad-editor-${sound.id}`, ...options });
        this.sound = sound;
    }

    get title() {
        return game.i18n.format("PLAYLISTENCHANTMENT.PAD.titleFor", { name: this.sound.name });
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const config = SoundboardService.padConfig(this.sound);

        context.sound = this.sound;
        context.config = config;
        context.volumeInput = foundry.audio.AudioHelper.volumeToInput(config.volume);
        context.chokeGroups = this.#existingChokeGroups();
        context.buttons = [{ type: "submit", icon: "fa-solid fa-floppy-disk", label: "PLAYLISTENCHANTMENT.save" }];
        return context;
    }

    #existingChokeGroups() {
        const groups = new Set();
        for (const sound of this.sound.parent?.sounds ?? []) {
            const group = SoundboardService.padConfig(sound).chokeGroup;
            if (group) groups.add(group);
        }
        return [...groups].sort();
    }

    static _onEditArtwork() {
        this.sound.sheet.render({ force: true });
    }

    static async _onSubmit(_event, _form, formData) {
        const data = formData.object;
        await SoundboardService.setPadConfig(this.sound, {
            loop: !!data.loop,
            volume: foundry.audio.AudioHelper.inputToVolume(data.volume),
            duck: !!data.duck,
            chokeGroup: String(data.chokeGroup ?? "").trim(),
            playerUsable: !!data.playerUsable,
        });
    }
}
