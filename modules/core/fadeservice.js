import { AudioChannels } from "./audiochannels.js";

export class FadeService {
    static skipExclusive = false;

    static async withoutExclusive(fn) {
        const previous = this.skipExclusive;
        this.skipExclusive = true;
        try {
            return await fn();
        } finally {
            this.skipExclusive = previous;
        }
    }

    static async fadeIn(playlist, fadeModifier, initialSoundDoc) {
        const channel = AudioChannels.playbackChannelOf(playlist, initialSoundDoc);
        const settings = AudioChannels.get(channel);
        const duration = fadeModifier ?? settings.fadeModifier;

        await this.withoutExclusive(async () => {
            if (initialSoundDoc) await playlist.playSound(initialSoundDoc);
            else await playlist.playAll();
        });

        const soundDoc = initialSoundDoc || playlist.sounds.find((s) => s.playing);
        if (!soundDoc) return;

        if (!soundDoc.sound) await new Promise((resolve) => setTimeout(resolve, 50));
        if (!soundDoc.sound) return;

        if (settings.normalize) {
            soundDoc.updateSource({ volume: settings.normalizeModifier || 0.5 });
        }
        const volume = soundDoc.volume || 0.5;
        soundDoc.sound.fade(volume, { duration, from: 0 });
    }

    static fadeOut(playlist, fadeModifier, stopPlay = true) {
        if (!playlist?.playing) return;

        const playingSound = playlist.sounds.find((s) => s.playing)?.sound;
        if (playingSound) {
            playingSound.fade(0, { duration: fadeModifier, from: playingSound.volume });
        }
        if (stopPlay) {
            if (fadeModifier > 0) setTimeout(() => playlist.stopAll(), fadeModifier);
            else playlist.stopAll();
        }
    }

    static shouldExclusiveFade(playlist, sound) {
        if (!AudioChannels.isPlaylistPlayback(playlist)) return false;
        return AudioChannels.fadeEnabled(AudioChannels.playbackChannelOf(playlist, sound));
    }

    static exclusiveFadeOthers(incoming, sound) {
        if (!incoming || this.skipExclusive) return;
        if (!this.shouldExclusiveFade(incoming, sound)) return;

        const channel = AudioChannels.playbackChannelOf(incoming, sound);
        const { fadeModifier } = AudioChannels.get(channel);
        for (const playlist of game.playlists.playing) {
            if (playlist.id === incoming.id) continue;
            if (!playlist.isOwner) continue;
            if (!AudioChannels.isPlaylistPlayback(playlist)) continue;
            if (AudioChannels.playbackChannelOf(playlist) !== channel) continue;
            this.fadeOut(playlist, fadeModifier, true);
        }
    }
}
