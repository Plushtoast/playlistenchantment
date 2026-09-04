import { Settings } from "../settings.js";
import { AudioChannels } from "../core/audiochannels.js";
import { PlaybackService } from "../core/playbackservice.js";
import { QueueService } from "../core/queueservice.js";
import { TrackMeta } from "../core/trackmeta.js";
import { UploadService } from "../core/uploadservice.js";
import { UploadDialog } from "./uploaddialog.js";
import { Studio } from "./studio/studio.js";

const { mergeObject } = foundry.utils;
const { PlaylistDirectory } = foundry.applications.sidebar.tabs;

export class EnchantedPlaylist extends PlaylistDirectory {
    static DEFAULT_OPTIONS = {
        actions: {
            playlistPlay: this._enchantPlaylistPlay,
            soundPlay: this._enchantSoundPlay,
            enchPlaylistBackward: this._enchantAllSkip,
            enchPlaylistForward: this._enchantAllSkip,
            enchPlay: this._enchantStartAll,
            enchStop: this._enchantStopAll,
            loopPlaylists: this._loopPlaylists,
            configureCombatPlaylists: this._configureCombatPlaylists,
            toggleChannelExpand: this._toggleChannelExpand,
            openStudio: this._openStudio,
        },
    };

    static _entryPartial = "modules/playlistenchantment/templates/playlist/playlist-partial.hbs";

    static STUDIO_DRAG_TYPE = "playlistenchantment.studio";

    static _channelExpanded = { music: false, environment: false, interface: false };

    static PARTS = {
        header: super.PARTS.header,
        controls: {
            template: "modules/playlistenchantment/templates/playlist/controls.hbs",
            templates: ["modules/playlistenchantment/templates/playlist/channel-controls.hbs"],
        },
        directory: super.PARTS.directory,
        playing: {
            template: "modules/playlistenchantment/templates/playlist/playing.hbs",
            templates: ["modules/playlistenchantment/templates/playlist/sound-partial.hbs"],
        },
        footer: super.PARTS.footer,
    };

    async _prepareContext(_options) {
        const data = await super._prepareContext(_options);
        mergeObject(data, {
            enchantment: Settings.world,
        });
        return data;
    }

    async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        if (partId === "controls") {
            context.channelControls = AudioChannels.controlsContext(EnchantedPlaylist._channelExpanded, context.controls);
        }
        return context;
    }

    _preparePlaylistContext(root, playlist) {
        const context = super._preparePlaylistContext(root, playlist);
        const meta = TrackMeta.read(playlist);
        context.channel = AudioChannels.display(playlist);
        context.cover = meta.cover;
        context.accent = meta.color;
        context.isQueue = QueueService.isQueue(playlist);
        context.css = [context.css, context.channel.css, context.isQueue ? "pe-queue-playlist" : ""]
            .filter(Boolean)
            .join(" ");
        for (const sound of context.sounds) {
            const document = playlist.sounds.get(sound.id);
            sound.channel = AudioChannels.display(playlist, document);
            sound.cover = TrackMeta.coverFor(document);
        }
        return context;
    }

    _initializeApplicationOptions(options) {
        const applicationOptions = super._initializeApplicationOptions(options);
        if (applicationOptions.window?.frame && !applicationOptions.classes.includes("playlists-sidebar")) {
            applicationOptions.classes.push("playlists-sidebar");
        }
        return applicationOptions;
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        this.activateListeners($(this.element));
        this.#bindStudioDrag();
    }

    #bindStudioDrag() {
        const button = this.element.querySelector(".pe-studio-button");
        button?.addEventListener("dragstart", (event) => {
            event.dataTransfer.setData("text/plain", JSON.stringify({ type: EnchantedPlaylist.STUDIO_DRAG_TYPE }));
            event.dataTransfer.effectAllowed = "copy";
        });
    }

    activateListeners(html) {
        html.find(".enchantment-volume-slider").change(this._onEnchantmentVolume.bind(this));
        html.find(".enchanment-checkbox").change(this._onEnchantmentCheckbox.bind(this));
        html.find(".sound").dblclick(this._onEnchantmentSound.bind(this));
        html.find(".sound .soundName").hover(
            (ev) => {
                if (ev.currentTarget.scrollWidth > ev.currentTarget.clientWidth) {
                    ev.currentTarget.classList.add("marquee");
                }
            },
            (ev) => {
                ev.currentTarget.classList.remove("marquee");
            }
        );
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    _onEnchantmentSound(ev) {
        const { playlistId, soundId } = ev.currentTarget.dataset;
        const playlist = game.playlists.get(playlistId);
        const sound = playlist?.sounds.get(soundId);
        if (!sound) return;
        return PlaybackService.playOrCrossFade(playlist, sound);
    }

    static async _enchantPlaylistPlay(_ev, target) {
        const playlist = game.playlists.get(target.closest("[data-entry-id]")?.dataset.entryId);
        if (!playlist) return;
        return PlaybackService.playOrCrossFade(playlist);
    }

    static async _enchantSoundPlay(_ev, target) {
        const { playlistId, soundId } = target.closest(".sound")?.dataset ?? {};
        const playlist = game.playlists.get(playlistId);
        const sound = playlist?.sounds.get(soundId);
        if (!sound) return;
        return PlaybackService.playOrCrossFade(playlist, sound);
    }

    static _openStudio() {
        return Studio.toggle();
    }

    static async _enchantStartAll(ev, target) {
        const macroId = target.closest?.("[data-macro-id]")?.dataset.macroId;
        if (macroId) return EnchantedPlaylist.playHotbarMacro(macroId);
        return PlaybackService.startAll();
    }

    static async _enchantAllSkip(_ev, target) {
        const direction = target.dataset.action === "enchPlaylistForward" ? 1 : -1;
        return PlaybackService.skip(direction);
    }

    static async _enchantStopAll() {
        return PlaybackService.stopAllMusic();
    }

    static async _loopPlaylists() {
        await Settings.updateWorld({ playListLoopEnabled: !Settings.world.playListLoopEnabled });
        ui.playlists.render();
    }

    static _configureCombatPlaylists() {
        return Studio.open({ view: "settings" });
    }

    static async _toggleChannelExpand(ev, target) {
        ev.stopPropagation();
        const channel = target.dataset.channel;
        if (!AudioChannels.CHANNELS[channel]) return;
        const state = EnchantedPlaylist._channelExpanded;
        state[channel] = !state[channel];
        for (const el of document.querySelectorAll(`.channel-volume[data-channel="${channel}"]`)) {
            el.classList.toggle("expanded", state[channel]);
        }
    }

    /* -------------------------------------------- */
    /*  Inputs                                      */
    /* -------------------------------------------- */

    fadeTooltip(value) {
        return game.i18n.format("PLAYLISTENCHANTMENT.FadeTooltip", { value });
    }

    _onEnchantmentVolume(ev) {
        ev.preventDefault();
        const slider = ev.currentTarget;
        let volume;
        let tooltip;
        if (slider.dataset.volume) {
            volume = foundry.audio.AudioHelper.inputToVolume(slider.value);
            tooltip = foundry.audio.AudioHelper.volumeToPercentage(volume);
        } else if (slider.dataset.unit) {
            volume = Number(slider.value);
            tooltip = this.fadeTooltip(slider.value);
        }
        slider.setAttribute("data-tooltip", tooltip);
        game.tooltip.activate(slider, { text: tooltip });

        const { channel, setting } = slider.dataset;
        if (channel && setting) return AudioChannels.update(channel, { [setting]: volume });
        return Settings.updateWorld({ [slider.name]: volume });
    }

    _onEnchantmentCheckbox(event) {
        const { channel, setting } = event.currentTarget.dataset;
        if (channel && setting) {
            return AudioChannels.update(channel, { [setting]: event.currentTarget.checked });
        }
        return Settings.updateWorld({ [event.currentTarget.name]: event.currentTarget.checked });
    }

    /* -------------------------------------------- */
    /*  Uploads                                     */
    /* -------------------------------------------- */

    async _onDrop(event) {
        const files = UploadService.filterAudioFiles(event.dataTransfer?.files);
        if (files.length) {
            event.preventDefault();
            return this.#handleAudioDrop(event, files);
        }
        return super._onDrop(event);
    }

    // Foundry cannot move uploaded files; open dialog when no upload folder chosen yet.
    async #handleAudioDrop(event, files) {
        const playlist = this.#dropTargetPlaylist(event) ?? (await this.#defaultUploadPlaylist());
        if (!Settings.get("lastUploadFolder")) {
            return UploadDialog.show({ files, playlist });
        }
        return UploadService.upload(files, UploadService.defaultTarget, playlist);
    }

    #dropTargetPlaylist(event) {
        const element = event.target?.closest?.(".playlist");
        return game.playlists.get(element?.dataset.entryId) ?? null;
    }

    static defaultUploadPlaylistName = "Playlistenchantment - Uploads";

    async #defaultUploadPlaylist() {
        const existing = game.playlists.find((playlist) => playlist.name === EnchantedPlaylist.defaultUploadPlaylistName);
        if (existing) return existing;
        return foundry.documents.Playlist.create({
            name: EnchantedPlaylist.defaultUploadPlaylistName,
            description: "Files uploaded by drag and drop",
            playing: false,
        });
    }

    /* -------------------------------------------- */
    /*  Currently playing timestamps                */
    /* -------------------------------------------- */

    updateTimestamps() {
        super.updateTimestamps();

        for (const sound of this._playing.sounds) {
            const li = document.querySelector(`.enchantmentplaylisttooltip .sound[data-sound-id="${sound.id}"]`);
            if (!li) continue;

            const current = li.querySelector("span.current");
            const ct = sound.playing ? sound.sound?.currentTime : sound.pausedTime;
            if (current) current.textContent = this.constructor.formatTimestamp(ct);
            const max = li.querySelector("span.duration");
            if (max) max.textContent = this.constructor.formatTimestamp(sound.sound?.duration);

            const play = li.querySelector(".pause");
            if (play?.classList.contains("fa-spinner")) {
                play.classList.remove("fa-spin");
                play.classList.replace("fa-spinner", "fa-pause");
            }
        }
    }

    /* -------------------------------------------- */
    /*  Hotbar macro API                            */
    /* -------------------------------------------- */

    static async hotbarPlaylist(uuid) {
        return PlaybackService.crossFade(uuid);
    }

    static uuidFromHotbarMacro(macro) {
        return macro?.command?.match(/hotbarPlaylist\(\s*["'`]([^"'`]+)["'`]\s*\)/)?.[1];
    }

    static async playHotbarMacro(macroId) {
        const macro = game.macros.get(macroId);
        const uuid = this.uuidFromHotbarMacro(macro);
        if (uuid) return this.hotbarPlaylist(uuid);
        return macro?.execute();
    }
}
