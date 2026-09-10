import { Settings } from "../settings.js";
import { AudioChannels } from "../core/audiochannels.js";
import { FadeService } from "../core/fadeservice.js";

export class CombatPlaylistManager {
    static previousPlaying = [];
    static combatSwitchActive = false;

    static registerHooks() {
        Hooks.on("createCombat", this._onCreateCombat.bind(this));
        Hooks.on("combatStart", this._onCombatStart.bind(this));
        Hooks.on("deleteCombat", this._onDeleteCombat.bind(this));
    }

    static get autoCombatSwitch() {
        return Settings.world.autoCombatSwitch ?? false;
    }

    static get combatPlaylists() {
        return Settings.world.combatPlaylists ?? [];
    }

    static isMusicPlaylist(playlist) {
        return AudioChannels.isMusicPlayback(playlist);
    }

    static getAvailableCombatPlaylists() {
        return this.combatPlaylists.filter((id) => this.isMusicPlaylist(game.playlists.get(id)));
    }

    static async _onCreateCombat(_combat, _options, _userId) {
        if (!game.user.isActiveGM) return;
        await this._switchToCombatMusic();
    }

    static async _onCombatStart(_combat, _updateData) {
        if (!game.user.isActiveGM) return;
        if (this.combatSwitchActive) return;
        await this._switchToCombatMusic();
    }

    static captureMusicState() {
        return game.playlists
            .filter((p) => this.isMusicPlaylist(p) && p.playing)
            .map((p) => {
                const sound = p.sounds.find((s) => s.playing);
                return {
                    playlistId: p.id,
                    soundId: sound?.id ?? null,
                    pausedTime: sound?.sound?.currentTime ?? sound?.pausedTime ?? null,
                };
            });
    }

    static async restoreMusicState(saved) {
        if (!saved?.length) return;

        const { fadeModifier } = AudioChannels.get("music");
        for (const entry of saved) {
            const playlist = game.playlists.get(entry.playlistId);
            if (!this.isMusicPlaylist(playlist)) continue;

            const sound = entry.soundId ? playlist.sounds.get(entry.soundId) : null;
            if (sound && entry.pausedTime != null) {
                await sound.update({ pausedTime: entry.pausedTime });
            }
            await FadeService.fadeIn(playlist, fadeModifier, sound);
        }
    }

    static async _switchToCombatMusic() {
        if (!this.autoCombatSwitch) return;
        if (this.combatSwitchActive) return;

        const playlistIds = this.getAvailableCombatPlaylists();
        if (!playlistIds.length) return;

        this.previousPlaying = this.captureMusicState();
        this.combatSwitchActive = true;

        const randomId = playlistIds[Math.floor(Math.random() * playlistIds.length)];
        const playlist = game.playlists.get(randomId);
        if (!playlist) {
            this.combatSwitchActive = false;
            this.previousPlaying = [];
            return;
        }

        this.#stopOtherMusic(playlist);
        if (!playlist.playing) await FadeService.fadeIn(playlist);
    }

    static #stopOtherMusic(keep) {
        const { fadeModifier } = AudioChannels.get("music");
        for (const other of game.playlists.playing) {
            if (other.id === keep.id) continue;
            if (!this.isMusicPlaylist(other)) continue;
            FadeService.fadeOut(other, fadeModifier, true);
        }
    }

    static async _onDeleteCombat(_combat, _options, _userId) {
        if (!game.user.isActiveGM) return;
        if (!this.combatSwitchActive) return;

        const saved = this.previousPlaying;
        this.previousPlaying = [];
        this.combatSwitchActive = false;

        const { fadeModifier } = AudioChannels.get("music");

        for (const playlist of game.playlists) {
            if (this.isMusicPlaylist(playlist) && playlist.playing) {
                FadeService.fadeOut(playlist, fadeModifier, true);
            }
        }

        if (!saved?.length) return;

        await new Promise((resolve) => setTimeout(resolve, fadeModifier));
        await this.restoreMusicState(saved);
    }

    static options() {
        const selected = this.combatPlaylists;
        return game.playlists
            .filter((playlist) => this.isMusicPlaylist(playlist))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((playlist) => ({
                id: playlist.id,
                name: playlist.name,
                folder: playlist.folder?.name ?? "",
                checked: selected.includes(playlist.id),
            }));
    }

    static async setPlaylists(ids) {
        return Settings.updateWorld({ combatPlaylists: ids });
    }

    static async setEnabled(enabled) {
        return Settings.updateWorld({ autoCombatSwitch: !!enabled });
    }
}

