import { Settings } from "../settings.js";
import { AudioChannels } from "./audiochannels.js";
import { Relay } from "./relay.js";

// Never persist duck level in PlaylistSound.volume; fade local Sound instances instead.
export class DuckingService {
    static #active = new Set();

    static #saved = new Map();

    static #timers = new Map();

    static register() {
        Relay.onBroadcast("duck", ({ key, ttl }) => this.#begin(key, ttl));
        Relay.onBroadcast("unduck", ({ key }) => this.#end(key));
    }

    static get isDucking() {
        return this.#active.size > 0;
    }

    // ttl is a safety net so a missed release cannot stick.
    static duck(key, { ttl } = {}) {
        Relay.broadcast("duck", { key, ttl });
    }

    static release(key) {
        Relay.broadcast("unduck", { key });
    }

    static releaseAll() {
        for (const key of [...this.#active]) this.release(key);
    }

    static #begin(key, ttl) {
        this.#active.add(key);
        this.#apply();
        if (!ttl) return;
        clearTimeout(this.#timers.get(key));
        this.#timers.set(key, setTimeout(() => this.#end(key), ttl));
    }

    static #end(key) {
        clearTimeout(this.#timers.get(key));
        this.#timers.delete(key);
        this.#active.delete(key);
        if (!this.#active.size) this.#restore();
    }

    static #apply() {
        const level = Number(Settings.get("duckLevel") ?? 0.3);
        const duration = Number(Settings.get("duckFade") ?? 300);
        for (const sound of this.#musicSounds()) {
            const instance = sound.sound;
            if (!this.#saved.has(sound.id)) this.#saved.set(sound.id, instance.volume ?? sound.volume ?? 0.5);
            const base = this.#saved.get(sound.id);
            instance.fade(Math.max(0, base * level), { duration });
        }
    }

    static #restore() {
        const duration = Number(Settings.get("duckFade") ?? 300);
        for (const [soundId, volume] of this.#saved) {
            const sound = this.#findSound(soundId);
            if (sound?.sound?.playing) sound.sound.fade(volume, { duration });
        }
        this.#saved.clear();
    }

    static #musicSounds() {
        const sounds = [];
        for (const playlist of game.playlists.playing) {
            if (!AudioChannels.isPlaylistPlayback(playlist)) continue;
            for (const sound of playlist.sounds) {
                if (!sound.playing || !sound.sound?.playing) continue;
                if (AudioChannels.of(playlist, sound) !== "music") continue;
                sounds.push(sound);
            }
        }
        return sounds;
    }

    static #findSound(soundId) {
        for (const playlist of game.playlists) {
            const sound = playlist.sounds.get(soundId);
            if (sound) return sound;
        }
        return null;
    }
}
