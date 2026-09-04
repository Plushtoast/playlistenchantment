export class TrackIndex {
    static #index = null;

    static key(path) {
        if (!path) return "";
        let decoded = String(path);
        try {
            decoded = decodeURIComponent(decoded);
        } catch (_error) {
            // Malformed escape sequences: fall back to the raw path.
        }
        return decoded.trim().toLowerCase();
    }

    static get index() {
        return this.#index ?? this.build();
    }

    static build() {
        const map = new Map();
        for (const playlist of game.playlists) {
            for (const sound of playlist.sounds) {
                const key = this.key(sound.path);
                if (!key) continue;
                if (!map.has(key)) map.set(key, []);
                map.get(key).push({ playlistId: playlist.id, soundId: sound.id });
            }
        }
        this.#index = map;
        return map;
    }

    static invalidate() {
        this.#index = null;
    }

    static occurrences(path) {
        const refs = this.index.get(this.key(path)) ?? [];
        return refs
            .map(({ playlistId, soundId }) => game.playlists.get(playlistId)?.sounds.get(soundId))
            .filter(Boolean);
    }

    static siblings(sound) {
        if (!sound?.path) return [];
        return this.occurrences(sound.path).filter((other) => other.id !== sound.id);
    }

    static count(path) {
        return this.occurrences(path).length;
    }

    static playlistsFor(path) {
        const seen = new Map();
        for (const sound of this.occurrences(path)) {
            if (sound.parent) seen.set(sound.parent.id, sound.parent);
        }
        return [...seen.values()];
    }
}
