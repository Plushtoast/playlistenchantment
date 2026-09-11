import { AudioChannels } from "./audiochannels.js";
import { FadeService } from "./fadeservice.js";

export class PlaybackService {
    static canControl(playlist) {
        return playlist?.isOwner === true;
    }

    /* -------------------------------------------- */
    /*  Starting playback                           */
    /* -------------------------------------------- */

    static async playOrCrossFade(playlist, sound) {
        if (!playlist) return;
        if (!this.canControl(playlist)) return this.#denied();
        if (!FadeService.shouldExclusiveFade(playlist, sound)) {
            return sound ? playlist.playSound(sound) : playlist.playAll();
        }
        return this.crossFade(sound?.uuid ?? playlist.uuid);
    }

    // Hotbar macros pass a uuid, not a document.
    static async crossFade(uuid) {
        const target = await fromUuid(uuid);
        let playlist;
        let sound;

        switch (target?.documentName) {
            case "Playlist":
                playlist = target;
                break;
            case "PlaylistSound":
                sound = target;
                playlist = sound.parent;
                break;
            case "Folder": {
                const playlists = target.contents.filter((p) => AudioChannels.isMusicPlayback(p));
                playlist = playlists[Math.floor(Math.random() * playlists.length)];
                break;
            }
            default:
                return;
        }

        if (!playlist) {
            ui.notifications.error(_loc("PLAYLISTENCHANTMENT.errorPlaylistMissing"));
            return;
        }
        if (!this.canControl(playlist)) return this.#denied();

        const currentlyPlaying = game.playlists.playing;
        if (!sound && currentlyPlaying.some((p) => p.id === playlist.id)) return;

        if (FadeService.shouldExclusiveFade(playlist, sound)) {
            const channel = AudioChannels.playbackChannelOf(playlist, sound);
            const { fadeModifier } = AudioChannels.get(channel);
            for (const other of currentlyPlaying) {
                if (!AudioChannels.isPlaylistPlayback(other)) continue;
                if (AudioChannels.playbackChannelOf(other) !== channel) continue;
                FadeService.fadeOut(other, fadeModifier, other.id !== playlist.id);
            }
        }
        await FadeService.fadeIn(playlist, undefined, sound);
    }

    /* -------------------------------------------- */
    /*  Transport                                   */
    /* -------------------------------------------- */

    static async pause(sound) {
        if (!sound || !this.canControl(sound.parent)) return this.#denied();
        const at = sound.sound?.currentTime ?? sound.pausedTime ?? 0;
        return sound.update({ playing: false, pausedTime: at });
    }

    static async resume(sound) {
        if (!sound) return;
        return this.playOrCrossFade(sound.parent, sound);
    }

    static async toggle(sound) {
        if (!sound) return;
        return sound.playing ? this.pause(sound) : this.resume(sound);
    }

    static async stop(playlist) {
        if (!playlist || !this.canControl(playlist)) return this.#denied();
        return playlist.stopAll();
    }

    static async stopSound(sound) {
        if (!sound || !this.canControl(sound.parent)) return this.#denied();
        return sound.parent.stopSound(sound);
    }

    // Foundry has no in-place seek; stop and restart at the offset (every client hears a gap).
    static async seek(sound, seconds) {
        if (!sound || !this.canControl(sound.parent)) return this.#denied();
        const target = Math.max(0, Math.min(seconds, sound.sound?.duration ?? seconds));
        const wasPlaying = sound.playing;
        await sound.update({ playing: false, pausedTime: target });
        if (!wasPlaying) return;
        return FadeService.withoutExclusive(() => sound.parent.playSound(sound));
    }

    // Match Foundry's sidebar: apply locally, fade the live instance, debounce the document write.
    static setVolume(sound, volume) {
        if (!sound || !this.canControl(sound.parent)) return;
        if (volume === sound.volume) return;

        sound.updateSource({ volume });
        sound.sound?.fade(volume, { duration: foundry.documents.PlaylistSound.VOLUME_DEBOUNCE_MS });
        if (sound.isOwner) sound.debounceVolume(volume);
    }

    static async toggleRepeat(sound) {
        if (!sound || !this.canControl(sound.parent)) return this.#denied();
        return sound.update({ repeat: !sound.repeat });
    }

    /* -------------------------------------------- */
    /*  Playlist mode                               */
    /* -------------------------------------------- */

    static MODES = [
        { mode: CONST.PLAYLIST_MODES.SEQUENTIAL, icon: "fa-solid fa-arrow-down-1-9", label: "PLAYLIST.ModeSequential" },
        { mode: CONST.PLAYLIST_MODES.SHUFFLE, icon: "fa-solid fa-shuffle", label: "PLAYLIST.ModeShuffle" },
        { mode: CONST.PLAYLIST_MODES.SIMULTANEOUS, icon: "fa-solid fa-layer-group", label: "PLAYLIST.ModeSimultaneous" },
    ];

    static modeOptions(playlist) {
        return this.MODES.map((entry) => ({ ...entry, active: playlist?.mode === entry.mode }));
    }

    static async setMode(playlist, mode) {
        if (!playlist || !this.canControl(playlist)) return this.#denied();
        return playlist.update({ mode: Number(mode) });
    }

    /* -------------------------------------------- */
    /*  Bulk controls                               */
    /* -------------------------------------------- */

    static async startAll() {
        return FadeService.withoutExclusive(async () => {
            for (const sound of ui.playlists?._playing?.sounds ?? []) {
                const playlist = sound.parent;
                if (AudioChannels.isMusicPlayback(playlist, sound) && this.canControl(playlist)) {
                    await playlist.playSound(sound);
                }
            }
        });
    }

    static async stopAllMusic() {
        const playlists = new Set(
            (ui.playlists?._playing?.sounds ?? [])
                .filter((sound) => AudioChannels.isMusicPlayback(sound.parent, sound) && sound.parent?.isOwner)
                .map((sound) => sound.parent)
        );
        await Promise.all([...playlists].map((playlist) => playlist.stopAll()));
    }

    static async skip(direction = 1) {
        for (const playlist of game.playlists.playing) {
            if (!AudioChannels.isMusicPlayback(playlist)) continue;
            if (!this.canControl(playlist)) continue;
            await playlist.playNext(null, { direction });
        }
    }

    /* -------------------------------------------- */
    /*  Queries                                     */
    /* -------------------------------------------- */

    static playingSounds(channel) {
        const sounds = [];
        for (const playlist of game.playlists.playing) {
            for (const sound of playlist.sounds) {
                if (!sound.playing && !sound.pausedTime) continue;
                if (channel && AudioChannels.of(playlist, sound) !== channel) continue;
                sounds.push(sound);
            }
        }
        return sounds;
    }

    static currentTrack() {
        const playing = this.playingSounds("music").filter((s) => s.playing);
        if (playing.length) return playing[0];
        return this.playingSounds("music")[0] ?? null;
    }

    static isBuffering(sound) {
        if (!sound?.playing) return false;
        const audio = sound.sound;
        if (!audio) return true;
        if (audio.loaded || audio.playing) return false;
        if (Number(audio.currentTime) > 0) return false;
        return true;
    }

    static formatTimestamp(seconds) {
        const directory = ui.playlists?.constructor;
        if (directory?.formatTimestamp) return directory.formatTimestamp(seconds);
        if (!Number.isFinite(seconds)) return "--:--";
        const total = Math.max(0, Math.round(seconds));
        const minutes = Math.floor(total / 60);
        const remainder = `${total % 60}`.padStart(2, "0");
        return `${minutes}:${remainder}`;
    }

    static #denied() {
        ui.notifications.warn(_loc("PLAYLISTENCHANTMENT.errorNoPermission"));
        return null;
    }
}
