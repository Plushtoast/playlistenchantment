const { mergeObject } = foundry.utils
const { PlaylistDirectory } = foundry.applications.sidebar.tabs;

export class EnchantedPlaylist extends PlaylistDirectory {

    /*static get defaultOptions() {
        const options = super.defaultOptions;
        options.template = "modules/playlistenchantment/templates/playlists-directory.hbs";

        return options;
    }*/
   static _entryPartial = "modules/playlistenchantment/templates/playlist/playlist-partial.hbs";

    static PARTS = {
        header: super.PARTS.header,
        controls: {
            template: "modules/playlistenchantment/templates/playlist/controls.hbs"
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

        const enchantment = game.settings.get("playlistenchantment", "settings");
        const normalizeModifier = foundry.audio.AudioHelper.volumeToInput(enchantment.normalizeModifier)
        mergeObject(data, {
            enchantment,
            normalizeModifier,
            normalizeTooltip: foundry.audio.AudioHelper.volumeToPercentage(normalizeModifier),
            fadeTooltip: this.fadeTooltip(enchantment.fadeModifier),
        })

        return data;
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        this.activateListeners($(this.element));
    }

    activateListeners(html) {
        //super.activateListeners(html);

        html.find(".enchantment-volume-slider").change(this._onEnchantmentVolume.bind(this));
        html.find('.enchanment-checkbox').change(this._onEnchantmentCheckbox.bind(this));
        html.find('.enchantmentcontrol').click(this._onEnchantmentControl.bind(this));
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
        const playlist = game.playlists.get(ev.currentTarget.dataset.playlistId)
        const sound = playlist.sounds.get(ev.currentTarget.dataset.soundId)
        playlist.playSound(sound)
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
            volume = slider.value
            tooltip = this.fadeTooltip(slider.value);
        }
        slider.setAttribute("data-tooltip", tooltip);
        game.tooltip.activate(slider, { text: tooltip });
        return this.updatePlaylistEnchantment({ [ev.currentTarget.name]: volume });
    }

    _onEnchantmentControl(ev) {
        const action = ev.currentTarget.dataset.action;

        switch (action) {
            case 'play':
                this._enchantStartAll(ev);
                break;
            case 'stop':
                this._enchantStopAll();
                break;
            case 'playlist-forward':
            case 'playlist-backward':
                this._enchantAllSkip(action);
                break;
        }
    }

    static async hotbarPlaylist(playlistId) {
        this.crossFade(playlistId)
    }

    static async crossFade(playlistId) {
        const settings = game.settings.get("playlistenchantment", "settings")
        const fadeModifier = settings.fadeModifier

        const thing = await fromUuid(playlistId);
        let playlist
        let sound
        if (thing instanceof Playlist) {
            playlist = thing
        } else if (thing instanceof PlaylistSound) {
            sound = thing
            playlist = sound.parent
        } else if (thing instanceof Folder) {
            const playlists = thing.contents
            playlist = playlists[Math.floor(Math.random() * playlists.length)]
        }
        else {
            return
        }

        const fadeIn = async (playlist, fadeModifier, initialSoundDoc) => {
            if (initialSoundDoc) {
                await playlist.playSound(initialSoundDoc)
            } else {
                await playlist.playAll()
            }

            const soundDoc = initialSoundDoc || playlist.sounds.find(s => s.playing)
            if (settings.normalize) {
                soundDoc.updateSource({ volume: settings.normalizeModifier || 0.5 })
            }
            const volume = soundDoc.volume || 0.5

            soundDoc.sound.fade(volume, { duration: fadeModifier, from: 0 });
        }

        const fadeOut = (playlist, fadeModifier, stopPlay = true) => {
            if (!playlist.playing) return;

            const playingSound = playlist.sounds.find(s => s.playing).sound;
            if (!playingSound) return

            const currVol = playingSound.volume
            playingSound.fade(0, { duration: fadeModifier, from: currVol })
            if (stopPlay)
                setTimeout(() => playlist.stopAll(), fadeModifier);

            return;
        }

        if (!playlist) {
            ui.notifications.error("Can't start Playlist - not found");
            return;
        }

        if (!sound && ui.playlists.playing.find(x => x.id == playlist.id)) return

        for (const pl of ui.playlists.playing) {
            fadeOut(pl, fadeModifier, pl.id != playlist.id)
        }
        fadeIn(playlist, fadeModifier, sound)
    }

    _updateTimestamps() {
        super._updateTimestamps();

        for (let sound of this._playing.sounds) {
            const li = $('.enchantmentplaylisttooltip')[0]?.querySelector(`.sound[data-sound-id="${sound.id}"]`);
            if (!li) continue;

            // Update current and max playback time
            const current = li.querySelector("span.current");
            const ct = sound.playing ? sound.sound.currentTime : sound.pausedTime;
            if (current) current.textContent = this._formatTimestamp(ct);
            const max = li.querySelector("span.duration");
            if (max) max.textContent = this._formatTimestamp(sound.sound.duration);

            // Remove the loading spinner
            const play = li.querySelector("a.pause");
            if (play.classList.contains("fa-spinner")) {
                play.classList.remove("fa-spin");
                play.classList.replace("fa-spinner", "fa-pause");
            }
        }
    }

    async _enchantStartAll(ev) {
        for (const sound of this._playing.sounds) {
            const playlist = sound.parent;

            if (playlist.mode >= 0)
                playlist.playSound(sound)
        }

        if (this._playing.sounds.length === 0) {
            const macroId = $(ev.currentTarget).closest('[data-macro-id]')[0]?.dataset.macroId
            if (macroId) {
                const macro = game.macros.get(macroId)
                macro?.execute()
            }
        }
    }

    async _enchantAllSkip(action) {
        for (const playlist of this.playing) {
            if (playlist.mode >= 0)
                playlist.playNext(undefined, { direction: action === "playlist-forward" ? 1 : -1 });
        }
    }

    async _enchantStopAll() {
        for (const sound of this._playing.sounds) {
            sound.update({ playing: false, pausedTime: sound.sound.currentTime })
        }
    }

    async updatePlaylistEnchantment(data) {
        const settings = game.settings.get("playlistenchantment", "settings");
        mergeObject(settings, data);
        return await game.settings.set("playlistenchantment", "settings", settings);
    }

    _onEnchantmentCheckbox(event) {
        const data = { [event.currentTarget.name]: event.currentTarget.checked }
        return this.updatePlaylistEnchantment(data);
    }

    async _onDrop(event) {
        event.preventDefault();
        const files = event.dataTransfer.files;
        if (files && files.length > 0) {
            const filteredFiles = Array.from(files).filter(file => Object.keys(CONST.AUDIO_FILE_EXTENSIONS).includes(file.name.split('.').pop()));
            await this.handleAudioFilesUpload(event, filteredFiles);
        } else {
            super._onDrop(event);
        }
    }

    isForge() {
        return typeof ForgeVTT !== 'undefined' && ForgeVTT && ForgeVTT.usingTheForge;
    }

    findFilePicker() {
        return this.isForge() ? ForgeVTT_FilePicker : foundry.applications.apps.FilePicker.implementation;
    }

    static defaultUploadPlaylistName = "Playlistenchantment - Uploads";

    async handleAudioFilesUpload(event, files) {
        const path = game.settings.get("playlistenchantment", "soundUploadFolder");
        const filepicker = this.findFilePicker();
        const sounds = [];
        for (const file of files) {
            const id = ui.notifications.info(game.i18n.format('PLAYLISTENCHANTMENT.uploading', { item: file.name }), { permanent: true });
            const response = await filepicker.upload('data', path, file);
            ui.notifications.remove(id);
            const nameWithoutExtension = file.name.split('.').slice(0, -1).join('.');
            sounds.push({ name: nameWithoutExtension, path: response.path });
        }
        const droppedPlaylistId = this.getPlaylistIdFromElement(event.srcElement.closest(".playlist"));
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