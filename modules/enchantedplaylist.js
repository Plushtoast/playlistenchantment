export class EnchantedPlaylist extends PlaylistDirectory {
    //static entryPartial = "templates/sidebar/partials/playlist-partial.html";

    static get defaultOptions() {
        const options = super.defaultOptions;
        options.template = "modules/playlistenchantment/templates/playlists-directory.html";

        return options;
    }

    async getData(options = {}) {
        const data = await super.getData(options);

        const enchantment = game.settings.get("playlistenchantment", "settings");

        mergeObject(data, {
            enchantment,
            normalizeModifier: AudioHelper.volumeToInput(enchantment.normalizeModifier),
            normalizeTooltip: PlaylistDirectory.volumeToTooltip(enchantment.normalizeModifier),
            fadeTooltip: this.fadeTooltip(enchantment.fadeModifier),
        })

        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find(".enchantment-volume-slider").change(this._onEnchantmentVolume.bind(this));
        html.find('.enchanment-checkbox').change(this._onEnchantmentCheckbox.bind(this));
        html.find('.enchantmentcontrol').click(this._onEnchantmentControl.bind(this));
        html.find('.sound').dblclick(this._onEnchantmentSound.bind(this));
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
        if(ev.currentTarget.dataset.volume) {
            volume = AudioHelper.inputToVolume(slider.value);
            tooltip = PlaylistDirectory.volumeToTooltip(volume);
            
        } else if(ev.currentTarget.dataset.unit) {
            volume = slider.value
            tooltip = this.fadeTooltip(slider.value);            
        }
        slider.setAttribute("data-tooltip", tooltip);
        game.tooltip.activate(slider, {text: tooltip});
        return this.updatePlaylistEnchantment({ [ev.currentTarget.name]: volume});
    }

    _onEnchantmentControl(ev) {
        const action = ev.currentTarget.dataset.action;

        switch(action) {
            case 'play':
                this._enchantStartAll();
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
        if(thing instanceof Playlist) {
            playlist = thing
        } else if(thing instanceof PlaylistSound) {
            sound = thing
            playlist = sound.parent
        } else if(thing instanceof Folder) {
            const playlists = thing.contents
            playlist = playlists[Math.floor(Math.random() * playlists.length)]
        }
        else {
            return
        }
        
        const fadeIn = async(playlist, fadeModifier, initialSoundDoc) => {
            if(initialSoundDoc) {
                await playlist.playSound(initialSoundDoc)
            } else {
                await playlist.playAll()
            }

            const soundDoc = initialSoundDoc || playlist.sounds.find(s => s.playing)
            if(settings.normalize) {
                soundDoc.updateSource({volume: settings.normalizeModifier || 0.5})
            }
            const volume = soundDoc.effectiveVolume || 0.5
            
            soundDoc.sound.fade(volume, { duration: fadeModifier, from: 0});            
        }
            
        const fadeOut = (playlist, fadeModifier, stopPlay = true) => {
            if (!playlist.playing) return;

            const playingSound = playlist.sounds.find(s => s.playing).sound;
            if (!playingSound) return

            const currVol = playingSound.volume            
            playingSound.fade(0, { duration: fadeModifier, from: currVol})
            if(stopPlay)
                setTimeout(() => playlist.stopAll(), fadeModifier);

            return;
        }        
        
        if (!playlist) {
            ui.notifications.error("Can't start Playlist - not found");
            return;
        }

        if (!sound && ui.playlists._playingPlaylists.find(x => x.id == playlist.id)) return
        
        for(const pl of ui.playlists._playingPlaylists) {
            fadeOut(pl, fadeModifier, pl.id != playlist.id)
        }        
        fadeIn(playlist, fadeModifier, sound)        
    }

    async _enchantStartAll() {
        for(const sound of this._playingSounds) {
            const playlist = sound.parent;

            if(playlist.mode >= 0)
                playlist.playSound(sound)
        }
    }

    async _enchantAllSkip(action) {
        for(const playlist of this._playingPlaylists) {
            if(playlist.mode >= 0)
                playlist.playNext(undefined, {direction: action === "playlist-forward" ? 1 : -1});
        }
    }

    async _enchantStopAll() {
        for(const sound of this._playingSounds) {
            sound.update({playing: false, pausedTime: sound.sound.currentTime})  
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
}