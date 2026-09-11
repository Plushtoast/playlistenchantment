import { AudioChannels } from "../core/audiochannels.js";

export class SoundPreview extends foundry.applications.api.HandlebarsApplicationMixin(
    foundry.applications.api.ApplicationV2
) {
    static PARTS = {
        main: { template: "modules/playlistenchantment/templates/soundpreview.hbs" },
    };

    static DEFAULT_OPTIONS = {
        classes: ["playlistenchantment", "pe-preview"],
        window: { title: "PLAYLISTENCHANTMENT.Prehear" },
        actions: {
            stopSound: SoundPreview._stopSound,
        },
    };

    constructor(sound, source) {
        super();
        this.sound = sound;
        this.source = source;
        this.sound.addEventListener("stop", () => this.close());
        this.sound.addEventListener("end", () => this.close());
    }

    static async open(soundDocument) {
        const settings = AudioChannels.get(AudioChannels.of(soundDocument.parent, soundDocument));
        const volume = settings.normalize ? settings.normalizeModifier : soundDocument.volume || 0.5;

        ui.notifications.info(_loc("PLAYLISTENCHANTMENT.prehearing", { track: soundDocument.name }));
        const instance = await foundry.audio.AudioHelper.play({ src: soundDocument.path, volume, loop: false }, false);
        return new SoundPreview(instance, soundDocument).render(true);
    }

    async _prepareContext(options) {
        const data = await super._prepareContext(options);
        data.sound = this.sound;
        data.source = this.source;
        return data;
    }

    static _stopSound() {
        this.close();
    }

    async close(options) {
        this.sound.stop();
        return super.close(options);
    }
}
