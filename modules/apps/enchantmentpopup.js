import { PlaybackService } from "../core/playbackservice.js";
import { EnchantedPlaylist } from "./enchantedplaylist.js";

export class EnchantmentPopup extends foundry.applications.api.HandlebarsApplicationMixin(
    foundry.applications.api.ApplicationV2
) {
    static PARTS = {
        main: {
            root: true,
            template: "modules/playlistenchantment/templates/currentplayling.hbs",
        },
    };

    static DEFAULT_OPTIONS = {
        id: "enchantment-popup",
        window: {
            frame: false,
        },
        classes: ["enchantmentplaylisttooltip", "playlists-sidebar"],
        actions: {
            enchPlay: this._playAssignedMacro,
        },
    };

    constructor(callingTarget, macroId) {
        super();
        this.macroId = macroId;
        this.callingTarget = callingTarget;
    }

    async _prepareContext(_options) {
        const data = await super._prepareContext(_options);
        const playingSounds = [];

        for (const con of ui.playlists._playing.context) {
            const entry = foundry.utils.duplicate(con);
            const sound = ui.playlists._playing.sounds.find((ps) => ps._id === entry.id);
            const lvolume = foundry.audio.AudioHelper.volumeToInput(entry.volume);
            entry.pause = {
                ...entry.pause,
                icon: `fa-solid ${sound.playing && !sound.sound?.loaded ? "fa-spinner fa-spin" : "fa-pause"}`,
            };
            entry.lvolume = lvolume;
            entry.volumeTooltip = foundry.audio.AudioHelper.volumeToPercentage(lvolume);
            entry.currentTime = PlaybackService.formatTimestamp(sound.playing ? sound.sound.currentTime : entry.pausedTime);
            entry.durationTime = PlaybackService.formatTimestamp(sound.sound.duration);
            entry.volume = con.volume;
            playingSounds.push(entry);
        }

        foundry.utils.mergeObject(data, {
            macroId: this.macroId,
            name: this.callingTarget.dataset.tooltipText || this.callingTarget.dataset.tooltip,
            isGM: game.user.isGM,
            playingSounds,
            showPlaying: game.playlists.playing.length > 0,
        });
        return data;
    }

    static async _playAssignedMacro() {
        return EnchantedPlaylist.playHotbarMacro(this.macroId);
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        this.element.dataset.macroId = this.macroId;

        const template = $(this.element);
        ui.playlists.activateListeners(template);
        template.find("[data-action]").on("click", async (ev) => {
            const target = ev.currentTarget;
            const action = target.dataset.action;

            if (action === "enchPlay") {
                ev.preventDefault();
                ev.stopImmediatePropagation();
                await EnchantmentPopup._playAssignedMacro.call(this);
                return;
            }

            const { playlistId, soundId } = target.closest(".sound")?.dataset ?? {};
            const playlist = game.playlists.get(playlistId);
            const sound = playlist?.sounds.get(soundId);

            switch (action) {
                case "soundRepeat":
                    await PlaybackService.toggleRepeat(sound);
                    break;
                case "soundPause":
                    await PlaybackService.pause(sound);
                    break;
                case "soundPlay":
                    await PlaybackService.playOrCrossFade(playlist, sound);
                    break;
                case "soundStop":
                    await PlaybackService.stopSound(sound);
                    break;
                default: {
                    let handler = ui.playlists.options.actions[action];
                    if (!handler) break;
                    let buttons = [0];
                    if (typeof handler === "object") {
                        buttons = handler.buttons;
                        handler = handler.handler;
                    }
                    if (buttons.includes(ev.button)) await handler?.call(ui.playlists, ev, target);
                }
            }
        });

        template.find(".sound-volume").on("input", (ev) => {
            ui.playlists._onSoundVolume(ev.currentTarget);
            setTimeout(() => ui.playlists.render(), 120);
        });
    }
}
