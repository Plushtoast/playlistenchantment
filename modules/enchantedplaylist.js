const { mergeObject } = foundry.utils
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
        }
    }

   static _entryPartial = "modules/playlistenchantment/templates/playlist/playlist-partial.hbs";

    static _channelExpanded = { music: false, environment: false, interface: false };

    static PARTS = {
        header: super.PARTS.header,
        controls: {
            template: "modules/playlistenchantment/templates/playlist/controls.hbs",
            templates: ["modules/playlistenchantment/templates/playlist/channel-controls.hbs"]
        },
        directory: super.PARTS.directory,
        playing: {
            template: "modules/playlistenchantment/templates/playlist/playing.hbs",
            templates: ["modules/playlistenchantment/templates/playlist/sound-partial.hbs"]
        },
        footer: super.PARTS.footer
    };

    async _prepareContext(_options) {
        const data = await super._prepareContext(_options);
        mergeObject(data, {
            enchantment: game.settings.get("playlistenchantment", "settings"),
        });
        return data;
    }

    async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        if (partId === "controls") {
            context.channelControls = EnchantedPlaylist.channelControlsContext(EnchantedPlaylist._channelExpanded, context.controls);
        }
        return context;
    }

    _preparePlaylistContext(root, playlist) {
        const context = super._preparePlaylistContext(root, playlist);
        context.channel = EnchantedPlaylist.channelDisplay(playlist);
        context.css = [context.css, context.channel.css].filter(Boolean).join(" ");
        for (const sound of context.sounds) {
            sound.channel = EnchantedPlaylist.channelDisplay(playlist, playlist.sounds.get(sound.id));
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
    }

    activateListeners(html) {
        //super.activateListeners(html);

        html.find(".enchantment-volume-slider").change(this._onEnchantmentVolume.bind(this));
        html.find('.enchanment-checkbox').change(this._onEnchantmentCheckbox.bind(this));
        html.find('.sound').dblclick(this._onEnchantmentSound.bind(this));
        html.find('.sound .soundName').hover(ev => {
            if (ev.currentTarget.scrollWidth > ev.currentTarget.clientWidth) {
                ev.currentTarget.classList.add('marquee');
            }
        }, ev => {
            ev.currentTarget.classList.remove('marquee');
        })
    }

    _onEnchantmentSound(ev) {
        const { playlistId, soundId } = ev.currentTarget.dataset;
        const playlist = game.playlists.get(playlistId);
        const sound = playlist?.sounds.get(soundId);
        if (!sound) return;
        return EnchantedPlaylist.playOrCrossFade(playlist, sound);
    }

    static async _enchantPlaylistPlay(_ev, target) {
        const playlist = game.playlists.get(target.closest("[data-entry-id]")?.dataset.entryId);
        if (!playlist) return;
        return EnchantedPlaylist.playOrCrossFade(playlist);
    }

    static async _enchantSoundPlay(_ev, target) {
        const { playlistId, soundId } = target.closest(".sound")?.dataset ?? {};
        const playlist = game.playlists.get(playlistId);
        const sound = playlist?.sounds.get(soundId);
        if (!sound) return;
        return EnchantedPlaylist.playOrCrossFade(playlist, sound);
    }

    fadeTooltip(value) {
        return game.i18n.format('PLAYLISTENCHANTMENT.FadeTooltip', { value })
    }

    _onEnchantmentVolume(ev) {
        ev.preventDefault();
        const slider = ev.currentTarget;
        let volume
        let tooltip
        if (ev.currentTarget.dataset.volume) {
            volume = foundry.audio.AudioHelper.inputToVolume(slider.value);
            tooltip = foundry.audio.AudioHelper.volumeToPercentage(volume);

        } else if (ev.currentTarget.dataset.unit) {
            volume = Number(slider.value)
            tooltip = this.fadeTooltip(slider.value);
        }
        slider.setAttribute("data-tooltip", tooltip);
        game.tooltip.activate(slider, { text: tooltip });
        const channel = slider.dataset.channel;
        const setting = slider.dataset.setting;
        if (channel && setting) return this.updateChannelSettings(channel, { [setting]: volume });
        return this.updatePlaylistEnchantment({ [ev.currentTarget.name]: volume });
    }

    static async hotbarPlaylist(uuid) {
        return EnchantedPlaylist.crossFade(uuid);
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

    static skipExclusiveFade = false;

    static CHANNEL_SETTING_DEFAULTS = {
        music: { fade: true, fadeModifier: 500, normalize: false, normalizeModifier: 0.5 },
        environment: { fade: false, fadeModifier: 500, normalize: false, normalizeModifier: 0.5 },
        interface: { fade: false, fadeModifier: 500, normalize: false, normalizeModifier: 0.5 },
    };

    static getAllChannelSettings() {
        const settings = game.settings.get("playlistenchantment", "settings");
        const saved = settings.channelSettings ?? {};
        const oldFade = settings.channelFade ?? {};
        return {
            music: this._resolveChannelSettings("music", saved.music, settings, {
                fade: oldFade.music !== false,
                normalize: !!settings.normalize,
            }),
            environment: this._resolveChannelSettings("environment", saved.environment, settings),
            interface: this._resolveChannelSettings("interface", saved.interface, settings),
        };
    }

    static _resolveChannelSettings(id, saved = {}, global = {}, fallback = {}) {
        const defaults = this.CHANNEL_SETTING_DEFAULTS[id] ?? this.CHANNEL_SETTING_DEFAULTS.music;
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

    static getChannelSettings(channel = "music") {
        return this.getAllChannelSettings()[channel] ?? this.getAllChannelSettings().music;
    }

    static getFadeSettings(channel = "music") {
        return this.getChannelSettings(channel);
    }

    static getChannelFade() {
        const all = this.getAllChannelSettings();
        return {
            music: all.music.fade === true,
            environment: all.environment.fade === true,
            interface: all.interface.fade === true,
        };
    }

    static channelControlsContext(expanded = {}, controls = {}) {
        const all = this.getAllChannelSettings();
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

    static _channelFadeEnabled(channel) {
        return this.getChannelSettings(channel).fade === true;
    }

    static async fadeIn(playlist, fadeModifier, initialSoundDoc) {
        const channel = this._playbackChannel(playlist, initialSoundDoc);
        const settings = this.getChannelSettings(channel);
        const duration = fadeModifier ?? settings.fadeModifier;
        const previousSkip = this.skipExclusiveFade;
        this.skipExclusiveFade = true;
        try {
            if (initialSoundDoc) {
                await playlist.playSound(initialSoundDoc);
            } else {
                await playlist.playAll();
            }
        } finally {
            this.skipExclusiveFade = previousSkip;
        }

        const soundDoc = initialSoundDoc || playlist.sounds.find(s => s.playing);
        if (!soundDoc) return;

        if (!soundDoc.sound) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (!soundDoc.sound) return;

        if (settings.normalize) {
            soundDoc.updateSource({ volume: settings.normalizeModifier || 0.5 });
        }
        const volume = soundDoc.volume || 0.5;

        soundDoc.sound.fade(volume, { duration, from: 0 });
    }

    static fadeOut(playlist, fadeModifier, stopPlay = true) {
        if (!playlist?.playing) return;

        const playingSound = playlist.sounds.find(s => s.playing)?.sound;
        if (playingSound) {
            playingSound.fade(0, { duration: fadeModifier, from: playingSound.volume });
        }
        if (stopPlay) {
            if (fadeModifier > 0) setTimeout(() => playlist.stopAll(), fadeModifier);
            else playlist.stopAll();
        }
    }

    /**
     * Fade out other playlists on the same audio channel so only `incoming` remains.
     * Soundboards and other channels are left alone. No-op if that channel's fade toggle is off.
     */
    static exclusiveFadeOthers(incoming, sound) {
        if (!incoming || this.skipExclusiveFade) return;
        if (!this._shouldExclusiveFade(incoming, sound)) return;
        const channel = this._playbackChannel(incoming, sound);
        const { fadeModifier } = this.getChannelSettings(channel);
        for (const pl of game.playlists.playing) {
            if (pl.id === incoming.id) continue;
            if (!pl.isOwner) continue;
            if (!this._isPlaylistPlayback(pl)) continue;
            if (this._playbackChannel(pl) !== channel) continue;
            this.fadeOut(pl, fadeModifier, true);
        }
    }

    static async playOrCrossFade(playlist, sound) {
        if (!playlist) return;
        if (!this._shouldExclusiveFade(playlist, sound)) {
            return sound ? playlist.playSound(sound) : playlist.playAll();
        }
        return this.crossFade(sound?.uuid ?? playlist.uuid);
    }

    static async crossFade(playlistId) {
        const thing = await fromUuid(playlistId);
        let playlist;
        let sound;
        switch (thing?.documentName) {
            case "Playlist":
                playlist = thing;
                break;
            case "PlaylistSound":
                sound = thing;
                playlist = sound.parent;
                break;
            case "Folder": {
                const playlists = thing.contents.filter(p => this._isCombatEligiblePlaylist(p));
                playlist = playlists[Math.floor(Math.random() * playlists.length)];
                break;
            }
            default:
                return;
        }

        if (!playlist) {
            ui.notifications.error("Can't start Playlist - not found");
            return;
        }

        const currentlyPlaying = game.playlists.playing;
        if (!sound && currentlyPlaying.some(x => x.id == playlist.id)) return

        if (this._shouldExclusiveFade(playlist, sound)) {
            const channel = this._playbackChannel(playlist, sound);
            const { fadeModifier } = this.getChannelSettings(channel);
            for (const pl of currentlyPlaying) {
                if (!this._isPlaylistPlayback(pl)) continue;
                if (this._playbackChannel(pl) !== channel) continue;
                this.fadeOut(pl, fadeModifier, pl.id != playlist.id)
            }
        }
        await this.fadeIn(playlist, undefined, sound)
    }

    static _audioChannel(playlist, sound) {
        return sound?.channel || playlist?.channel || "music";
    }

    static _playbackChannel(playlist, sound) {
        if (sound) return this._audioChannel(playlist, sound);
        const playing = playlist?.sounds.find(s => s.playing);
        return this._audioChannel(playlist, playing);
    }

    static CHANNELS = {
        music: { id: "music", icon: "fa-fw fa-solid fa-music", css: "channel-music", label: "AUDIO.CHANNELS.MUSIC.label" },
        environment: { id: "environment", icon: "fa-fw fa-solid fa-tree", css: "channel-environment", label: "AUDIO.CHANNELS.ENVIRONMENT.label" },
        interface: { id: "interface", icon: "fa-fw fa-solid fa-computer-mouse", css: "channel-interface", label: "AUDIO.CHANNELS.INTERFACE.label" },
    };

    static channelDisplay(playlist, sound) {
        const id = this._audioChannel(playlist, sound);
        return this.CHANNELS[id] ?? this.CHANNELS.music;
    }

    /** Sequential/shuffle/simultaneous playlists only (no soundboards). */
    static _isPlaylistPlayback(playlist) {
        return !!playlist && playlist.mode >= CONST.PLAYLIST_MODES.SEQUENTIAL;
    }

    static _shouldExclusiveFade(playlist, sound) {
        if (!this._isPlaylistPlayback(playlist)) return false;
        return this._channelFadeEnabled(this._playbackChannel(playlist, sound));
    }

    /** Music-channel sequential/shuffle/simultaneous playlists only (no soundboards / environment / interface). */
    static _isMusicPlayback(playlist, sound) {
        return this._isPlaylistPlayback(playlist)
            && this._audioChannel(playlist, sound) === "music";
    }

    static _isCombatEligiblePlaylist(playlist) {
        return this._isMusicPlayback(playlist);
    }

    static async _toggleChannelExpand(ev, target) {
        ev.stopPropagation();
        const channel = target.dataset.channel;
        if (!EnchantedPlaylist.CHANNELS[channel]) return;
        const state = EnchantedPlaylist._channelExpanded;
        state[channel] = !state[channel];
        for (const el of document.querySelectorAll(`.channel-volume[data-channel="${channel}"]`)) {
            el.classList.toggle("expanded", state[channel]);
        }
    }

    static async _configureCombatPlaylists(_ev, _target) {
        const { CombatPlaylistConfig } = await import("./combatplaylists.js");
        new CombatPlaylistConfig().render(true);
    }

    updateTimestamps() {
        super.updateTimestamps();

        for (let sound of this._playing.sounds) {
            const li = document.querySelector(`.enchantmentplaylisttooltip .sound[data-sound-id="${sound.id}"]`);
            if (!li) continue;

            const current = li.querySelector("span.current");
            const ct = sound.playing ? sound.sound.currentTime : sound.pausedTime;
            if (current) current.textContent = this.constructor.formatTimestamp(ct);
            const max = li.querySelector("span.duration");
            if (max) max.textContent = this.constructor.formatTimestamp(sound.sound.duration);

            const play = li.querySelector(".pause");
            if (play?.classList.contains("fa-spinner")) {
                play.classList.remove("fa-spin");
                play.classList.replace("fa-spinner", "fa-pause");
            }
        }
    }

    static async _enchantStartAll(ev, target) {
        const macroId = target.closest?.("[data-macro-id]")?.dataset.macroId;
        if (macroId) return EnchantedPlaylist.playHotbarMacro(macroId);

        const previousSkip = EnchantedPlaylist.skipExclusiveFade;
        EnchantedPlaylist.skipExclusiveFade = true;
        try {
            for (const sound of ui.playlists._playing.sounds) {
                const playlist = sound.parent;
                if (EnchantedPlaylist._isMusicPlayback(playlist, sound))
                    playlist.playSound(sound);
            }
        } finally {
            EnchantedPlaylist.skipExclusiveFade = previousSkip;
        }
    }

    static async _enchantAllSkip(ev, target) {
        const action = target.dataset.action;
        for (const playlist of game.playlists.playing) {
            if (EnchantedPlaylist._isMusicPlayback(playlist)) {
                playlist.playNext(null, { direction: action === "enchPlaylistForward" ? 1 : -1 });
            }
                
        }
    }

    static async _loopPlaylists(ev, target) {
        const settings = game.settings.get("playlistenchantment", "settings");
        settings.playListLoopEnabled = !settings.playListLoopEnabled;
        await game.settings.set("playlistenchantment", "settings", settings);
        ui.playlists.render();
    }

    static async _enchantStopAll(_ev, _target) {
        const playlists = new Set(
            ui.playlists._playing.sounds
                .filter(sound => EnchantedPlaylist._isMusicPlayback(sound.parent, sound) && sound.parent?.isOwner)
                .map(sound => sound.parent)
        );
        await Promise.all([...playlists].map(playlist => playlist.stopAll()));
    }

    async updateChannelSettings(channel, data) {
        const channelSettings = EnchantedPlaylist.getAllChannelSettings();
        Object.assign(channelSettings[channel], data);
        return this.updatePlaylistEnchantment({ channelSettings });
    }

    async updatePlaylistEnchantment(data) {
        const settings = game.settings.get("playlistenchantment", "settings");
        mergeObject(settings, data);
        return await game.settings.set("playlistenchantment", "settings", settings);
    }

    _onEnchantmentCheckbox(event) {
        const { channel, setting } = event.currentTarget.dataset;
        if (channel && setting) {
            return this.updateChannelSettings(channel, { [setting]: event.currentTarget.checked });
        }
        const data = { [event.currentTarget.name]: event.currentTarget.checked }
        return this.updatePlaylistEnchantment(data);
    }

    async _onDrop(event) {
        event.preventDefault();
        const files = event.dataTransfer.files;
        if (files && files.length > 0) {
            const filteredFiles = Array.from(files).filter(file => Object.keys(CONST.AUDIO_FILE_EXTENSIONS).includes(file.name.split('.').pop()));
            if (filteredFiles.length) await this.handleAudioFilesUpload(event, filteredFiles);
            return;
        }
        return super._onDrop(event);
    }

    isForge() {
        return typeof ForgeVTT !== 'undefined' && ForgeVTT && ForgeVTT.usingTheForge;
    }

    findFilePicker() {
        return this.isForge() ? ForgeVTT_FilePicker : foundry.applications.apps.FilePicker.implementation;
    }

    file_container() {
        return this.isForge() ? 'forgevtt' : 'data';
    }

    static defaultUploadPlaylistName = "Playlistenchantment - Uploads";

    async handleAudioFilesUpload(event, files) {
        const path = game.settings.get("playlistenchantment", "soundUploadFolder");
        const filepicker = this.findFilePicker();
        const sounds = [];
        for (const file of files) {
            const id = ui.notifications.info(game.i18n.format('PLAYLISTENCHANTMENT.uploading', { item: file.name }), { permanent: true });
            const response = await filepicker.upload(this.file_container(), path, file);
            ui.notifications.remove(id);
            const nameWithoutExtension = file.name.split('.').slice(0, -1).join('.');
            sounds.push({ name: nameWithoutExtension, path: response.path });
        }
        const droppedPlaylistId = this.getPlaylistIdFromElement(event.target?.closest?.(".playlist"));
        let playlist = game.playlists.get(droppedPlaylistId);
        if (!playlist) playlist = game.playlists.find((playlist) => playlist.name === EnchantedPlaylist.defaultUploadPlaylistName);
        if (!playlist) {
            playlist = await Playlist.create({
                name: EnchantedPlaylist.defaultUploadPlaylistName,
                description: "Files uploaded by drag and drop",
                playing: false,
            });
        }
        playlist.createEmbeddedDocuments("PlaylistSound", sounds);
        ui.notifications.info(game.i18n.localize('PLAYLISTENCHANTMENT.uploadDone'));
    }

    getPlaylistIdFromElement(el) {
        if (el == null) return false;

        const playlist = el.classList.contains("playlist") ? el : el.closest(".playlist")
        if (!playlist) {
            ui.notifications.error(game.i18n.localize("PLAYLISTENCHANTMENT.errorNoPlaylist"));
            return false;
        }
        return playlist.dataset.entryId;
    }
}