import { Settings } from "../settings.js";

export class AudioChannels {
    static CHANNELS = {
        music: { id: "music", icon: "fa-fw fa-solid fa-music", css: "channel-music", label: "AUDIO.CHANNELS.MUSIC.label" },
        environment: { id: "environment", icon: "fa-fw fa-solid fa-tree", css: "channel-environment", label: "AUDIO.CHANNELS.ENVIRONMENT.label" },
        interface: { id: "interface", icon: "fa-fw fa-solid fa-computer-mouse", css: "channel-interface", label: "AUDIO.CHANNELS.INTERFACE.label" },
    };

    static SETTING_DEFAULTS = {
        music: { fade: true, fadeModifier: 500, normalize: false, normalizeModifier: 0.5 },
        environment: { fade: false, fadeModifier: 500, normalize: false, normalizeModifier: 0.5 },
        interface: { fade: false, fadeModifier: 500, normalize: false, normalizeModifier: 0.5 },
    };

    /* -------------------------------------------- */
    /*  Classification                              */
    /* -------------------------------------------- */

    static of(playlist, sound) {
        return sound?.channel || playlist?.channel || "music";
    }

    static playbackChannelOf(playlist, sound) {
        if (sound) return this.of(playlist, sound);
        const playing = playlist?.sounds.find((s) => s.playing);
        return this.of(playlist, playing);
    }

    static isPlaylistPlayback(playlist) {
        return !!playlist && playlist.mode >= CONST.PLAYLIST_MODES.SEQUENTIAL;
    }

    static isMusicPlayback(playlist, sound) {
        return this.isPlaylistPlayback(playlist) && this.of(playlist, sound) === "music";
    }

    static isSoundboard(playlist) {
        return !!playlist && playlist.mode === CONST.PLAYLIST_MODES.DISABLED;
    }

    static display(playlist, sound) {
        return this.CHANNELS[this.of(playlist, sound)] ?? this.CHANNELS.music;
    }

    /* -------------------------------------------- */
    /*  Filtering                                   */
    /* -------------------------------------------- */

    static channelsOf(playlist) {
        const channels = new Set();
        for (const sound of playlist?.sounds ?? []) channels.add(this.of(playlist, sound));
        if (!channels.size) channels.add(this.of(playlist));
        return channels;
    }

    static matches(playlist, sound, channels = []) {
        if (!channels.length) return true;
        return channels.includes(this.of(playlist, sound));
    }

    static playlistMatches(playlist, channels = []) {
        if (!channels.length) return true;
        const own = this.channelsOf(playlist);
        return channels.some((channel) => own.has(channel));
    }

    static filterContext(active = []) {
        return Object.values(this.CHANNELS).map((channel) => ({
            ...channel,
            active: active.includes(channel.id),
        }));
    }

    /* -------------------------------------------- */
    /*  Settings                                    */
    /* -------------------------------------------- */

    static all() {
        const settings = Settings.world;
        const saved = settings.channelSettings ?? {};
        const legacyFade = settings.channelFade ?? {};
        return {
            music: this.#resolve("music", saved.music, settings, {
                fade: legacyFade.music !== false,
                normalize: !!settings.normalize,
            }),
            environment: this.#resolve("environment", saved.environment, settings),
            interface: this.#resolve("interface", saved.interface, settings),
        };
    }

    static #resolve(id, saved = {}, global = {}, fallback = {}) {
        const defaults = this.SETTING_DEFAULTS[id] ?? this.SETTING_DEFAULTS.music;
        const inheritGlobal = id === "music";
        const fadeModifier = Number(saved.fadeModifier ?? (inheritGlobal ? global.fadeModifier : defaults.fadeModifier));
        const normalizeModifier = Number(saved.normalizeModifier ?? (inheritGlobal ? global.normalizeModifier : defaults.normalizeModifier));
        return {
            fade: typeof saved.fade === "boolean" ? saved.fade : fallback.fade ?? defaults.fade,
            fadeModifier: Number.isFinite(fadeModifier) ? fadeModifier : defaults.fadeModifier,
            normalize: typeof saved.normalize === "boolean" ? saved.normalize : fallback.normalize ?? defaults.normalize,
            normalizeModifier: Number.isFinite(normalizeModifier) ? normalizeModifier : defaults.normalizeModifier,
        };
    }

    static get(channel = "music") {
        const all = this.all();
        return all[channel] ?? all.music;
    }

    static fadeEnabled(channel) {
        return this.get(channel).fade === true;
    }

    static fadeState() {
        const all = this.all();
        return {
            music: all.music.fade === true,
            environment: all.environment.fade === true,
            interface: all.interface.fade === true,
        };
    }

    static async update(channel, data) {
        const channelSettings = this.all();
        Object.assign(channelSettings[channel], data);
        return Settings.updateWorld({ channelSettings });
    }

    /* -------------------------------------------- */
    /*  Global volume                               */
    /* -------------------------------------------- */

    static VOLUME_SETTINGS = {
        music: "globalPlaylistVolume",
        environment: "globalAmbientVolume",
        interface: "globalInterfaceVolume",
    };

    static globalVolume(channel) {
        const key = this.VOLUME_SETTINGS[channel];
        return key ? game.settings.get("core", key) : 1;
    }

    static async setGlobalVolume(channel, volume) {
        const key = this.VOLUME_SETTINGS[channel];
        if (!key) return;
        return game.settings.set("core", key, Math.clamp(volume, 0, 1));
    }

    /* -------------------------------------------- */
    /*  Presentation                                */
    /* -------------------------------------------- */

    static mixerContext() {
        const all = this.all();
        const helper = foundry.audio.AudioHelper;
        return Object.entries(this.CHANNELS).map(([id, channel]) => {
            const settings = all[id];
            const volume = helper.volumeToInput(this.globalVolume(id));
            const normalizeInput = helper.volumeToInput(settings.normalizeModifier);
            return {
                ...channel,
                volume,
                volumePercent: helper.volumeToPercentage(volume),
                fade: settings.fade,
                fadeModifier: settings.fadeModifier,
                fadeTooltip: game.i18n.format("PLAYLISTENCHANTMENT.FadeTooltip", { value: settings.fadeModifier }),
                normalize: settings.normalize,
                normalizeModifier: normalizeInput,
                normalizePercent: helper.volumeToPercentage(normalizeInput),
                normalizeTooltip: helper.volumeToPercentage(normalizeInput),
            };
        });
    }

    static controlsContext(expanded = {}, controls = {}) {
        const all = this.all();
        const audioTooltips = {
            music: "AUDIO.CHANNELS.MUSIC.tooltip",
            environment: "AUDIO.CHANNELS.ENVIRONMENT.tooltip",
            interface: "AUDIO.CHANNELS.INTERFACE.tooltip",
        };
        return Object.entries(this.CHANNELS).map(([id, channel]) => {
            const settings = all[id];
            const normalizeInput = foundry.audio.AudioHelper.volumeToInput(settings.normalizeModifier);
            const channelName = game.i18n.localize(channel.label);
            return {
                channel: { ...channel, audioTooltip: audioTooltips[id] },
                expanded: !!expanded[id],
                volume: controls[id],
                fade: settings.fade,
                fadeModifier: settings.fadeModifier,
                fadeTooltip: game.i18n.format("PLAYLISTENCHANTMENT.FadeTooltip", { value: settings.fadeModifier }),
                fadeEnabledTooltip: game.i18n.format(
                    settings.fade ? "PLAYLISTENCHANTMENT.ChannelFadeOn" : "PLAYLISTENCHANTMENT.ChannelFadeOff",
                    { channel: channelName }
                ),
                normalize: settings.normalize,
                normalizeModifier: normalizeInput,
                normalizeTooltip: foundry.audio.AudioHelper.volumeToPercentage(normalizeInput),
            };
        });
    }
}
