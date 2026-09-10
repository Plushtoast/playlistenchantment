import { MODULE, Settings } from "../settings.js";
import { AudioChannels } from "./audiochannels.js";
import { Conductor } from "./conductor.js";
import { FadeService } from "./fadeservice.js";
import { Permissions } from "./permissionservice.js";
import { PlaybackService } from "./playbackservice.js";
import { Relay } from "./relay.js";
import { TrackMeta } from "./trackmeta.js";

export class QueueService {
    static FLAG = "queue";

    static #armedFor = null;

    static #reaping = new Set();
    static #originalOnSoundEnd = null;

    static register() {
        Relay.onRequest("enqueue", async (data, user) => this.#handleRequest(data, user));
        Relay.onRequest("dequeue", async ({ soundId }) => this.remove(soundId));
        this.#patchSoundEnd();
    }

    // Queue must not wrap; Foundry's end handler would restart the first leftover track.
    static #patchSoundEnd() {
        const proto = foundry.documents.Playlist.prototype;
        if (this.#originalOnSoundEnd) return;
        this.#originalOnSoundEnd = proto._onSoundEnd;
        const original = this.#originalOnSoundEnd;
        proto._onSoundEnd = async function (sound) {
            if (QueueService.isQueue(this)) return QueueService.onEntryEnded(sound, { automatic: true });
            return original.call(this, sound);
        };
    }

    /* -------------------------------------------- */
    /*  Lookup                                      */
    /* -------------------------------------------- */

    static get playlist() {
        return game.playlists.find((p) => p.getFlag(MODULE, this.FLAG)?.isQueue) ?? null;
    }

    static isQueue(playlist) {
        return !!playlist?.getFlag(MODULE, this.FLAG)?.isQueue;
    }

    static originSound(sound) {
        if (!sound || !this.isQueue(sound.parent)) return sound ?? null;
        const origin = sound.getFlag(MODULE, this.FLAG)?.origin;
        if (!origin) return sound;
        return fromUuidSync(origin) ?? sound;
    }

    static originPlaylist(sound) {
        const original = this.originSound(sound);
        const playlist = original?.parent;
        if (!playlist || this.isQueue(playlist)) return null;
        return playlist;
    }

    static get enabled() {
        return Settings.get("queueEnabled") === true;
    }

    static entries() {
        const queue = this.playlist;
        if (!queue) return [];
        return [...queue.sounds].sort((a, b) => a.sort - b.sort);
    }

    static get isPlaying() {
        return this.playlist?.playing === true;
    }

    static async ensure() {
        const existing = this.playlist;
        if (existing) return existing;
        if (!game.user.isGM) return null;
        return foundry.documents.Playlist.create({
            name: game.i18n.localize("PLAYLISTENCHANTMENT.QUEUE.playlistName"),
            description: game.i18n.localize("PLAYLISTENCHANTMENT.QUEUE.playlistDescription"),
            mode: CONST.PLAYLIST_MODES.SEQUENTIAL,
            channel: "music",
            playing: false,
            [`flags.${MODULE}.${this.FLAG}`]: { isQueue: true },
        });
    }

    /* -------------------------------------------- */
    /*  Mutating the queue                          */
    /* -------------------------------------------- */

    // Players without queue ownership ask the GM.
    static async enqueue(sound, { next = false } = {}) {
        if (!this.enabled) return null;
        if (!sound) return null;

        const queue = this.playlist;
        if (!queue || !queue.isOwner) {
            if (!Permissions.canQueue()) {
                ui.notifications.warn(game.i18n.localize("PLAYLISTENCHANTMENT.QUEUE.notAllowed"));
                return null;
            }
            const response = await Relay.requestGM("enqueue", { uuid: sound.uuid, next });
            if (response?.ok === false) ui.notifications.error(response.error);
            return response;
        }
        return this.#insert(queue, sound, { next, requestedBy: game.userId });
    }

    static async #handleRequest({ uuid, next }, user) {
        if (!Settings.get("playerQueue") && !user?.isGM) {
            throw new Error(game.i18n.localize("PLAYLISTENCHANTMENT.QUEUE.notAllowed"));
        }
        const sound = await fromUuid(uuid);
        if (!sound) throw new Error("Track not found");
        const queue = await this.ensure();
        const entry = await this.#insert(queue, sound, { next, requestedBy: user?.id });
        ui.notifications.info(
            game.i18n.format("PLAYLISTENCHANTMENT.QUEUE.playerAdded", {
                user: user?.name ?? "?",
                track: sound.name,
            })
        );
        return entry?.id ?? null;
    }

    static async #insert(queue, sound, { next = false, requestedBy } = {}) {
        const entries = this.entries();
        const playingIndex = entries.findIndex((entry) => entry.playing);
        const sort = next && entries.length ? this.#sortAfter(entries, Math.max(playingIndex, 0)) : this.#sortLast(entries);

        const flags = {
            [this.FLAG]: {
                ephemeral: true,
                addedBy: requestedBy ?? game.userId,
                addedAt: Date.now(),
                origin: sound.uuid,
            },
        };
        const meta = sound.getFlag(MODULE, TrackMeta.KEY);
        if (meta) flags[TrackMeta.KEY] = meta;

        const [created] = await queue.createEmbeddedDocuments("PlaylistSound", [
            {
                name: sound.name,
                path: sound.path,
                volume: sound.volume,
                channel: "",
                repeat: false,
                sort,
                flags: { [MODULE]: flags },
            },
        ]);

        this.evaluate();
        return created;
    }

    static #sortLast(entries) {
        return entries.length ? entries[entries.length - 1].sort + CONST.SORT_INTEGER_DENSITY : CONST.SORT_INTEGER_DENSITY;
    }

    static #sortAfter(entries, index) {
        const current = entries[index];
        const following = entries[index + 1];
        if (!current) return CONST.SORT_INTEGER_DENSITY;
        if (!following) return current.sort + CONST.SORT_INTEGER_DENSITY;
        return Math.floor((current.sort + following.sort) / 2);
    }

    static async remove(soundId) {
        const queue = this.playlist;
        const entry = queue?.sounds.get(soundId);
        if (!entry) return;
        if (!queue.isOwner) return Relay.requestGM("dequeue", { soundId });
        await queue.deleteEmbeddedDocuments("PlaylistSound", [soundId]);
        if (!queue.sounds.size) await this.drained();
    }

    static async clear() {
        const queue = this.playlist;
        if (!queue?.isOwner) return;
        const ids = queue.sounds.map((s) => s.id);
        if (ids.length) await queue.deleteEmbeddedDocuments("PlaylistSound", ids);
        await this.drained();
    }

    static finishedEntries() {
        const entries = this.entries();
        const playingIndex = entries.findIndex((entry) => entry.playing);
        return entries.filter((entry, index) => {
            if (entry.playing) return false;
            if (entry.pausedTime != null) return false;
            if (this.#flag(entry).played) return true;
            return playingIndex > 0 && index < playingIndex;
        });
    }

    static async clearPlayed() {
        const queue = this.playlist;
        if (!queue?.isOwner) return;
        const ids = this.finishedEntries().map((entry) => entry.id);
        if (!ids.length) return;
        await queue.deleteEmbeddedDocuments("PlaylistSound", ids);
        if (!queue.sounds.size) await this.drained();
    }

    static async reorder(soundId, beforeId) {
        const queue = this.playlist;
        if (!queue?.isOwner) return;
        const entry = queue.sounds.get(soundId);
        const target = beforeId ? queue.sounds.get(beforeId) : null;
        if (!entry) return;
        return entry.sortRelative({ target, siblings: queue.sounds.filter((s) => s.id !== soundId) });
    }

    /* -------------------------------------------- */
    /*  Playback                                    */
    /* -------------------------------------------- */

    static async play(entry) {
        const queue = this.playlist;
        if (!queue?.isOwner) return;
        const target = entry ?? this.entries()[0];
        if (!target) return;
        this.#rememberResumeTarget(queue);
        return PlaybackService.playOrCrossFade(queue, target);
    }

    static async stop() {
        const queue = this.playlist;
        if (!queue?.isOwner) return;
        return queue.stopAll();
    }

    static async skip() {
        const current = this.entries().find((entry) => entry.playing);
        if (!current) return this.play();
        return this.onEntryEnded(current);
    }

    static #nextAfter(entry) {
        const entries = this.entries();
        const index = entries.findIndex((candidate) => candidate.id === entry.id);
        return entries[index + 1] ?? null;
    }

    static evaluate() {
        if (!this.enabled) return;
        const queue = this.playlist;
        if (!queue || !queue.sounds.size) return;
        if (!Conductor.isConductor(queue)) return;
        if (queue.playing) return;

        const current = PlaybackService.playingSounds("music").find((sound) => sound.playing && !this.isQueue(sound.parent));
        if (!current) {
            this.#armedFor = null;
            return void this.play();
        }
        if (!Settings.get("queueTakeover")) return;
        this.#armTakeover(current);
    }

    static #armTakeover(sound) {
        if (this.#armedFor === sound.id) return;
        const instance = sound.sound;
        if (!instance) return;
        this.#armedFor = sound.id;
        instance.addEventListener(
            "end",
            () => {
                if (this.#armedFor !== sound.id) return;
                this.#armedFor = null;
                if (!Conductor.isConductor(this.playlist)) return;
                if (!this.entries().length) return;
                this.play();
            },
            { once: true }
        );
    }

    static #rememberResumeTarget(queue) {
        if (queue.getFlag(MODULE, this.FLAG)?.resumeTo) return;
        const playing = PlaybackService.playingSounds("music").find(
            (sound) => sound.playing && !this.isQueue(sound.parent) && AudioChannels.isMusicPlayback(sound.parent, sound)
        );
        if (!playing) return;
        queue.setFlag(MODULE, this.FLAG, { isQueue: true, resumeTo: playing.parent.id });
    }

    static onSoundChange(sound, changes) {
        if (!sound || !this.isQueue(sound.parent)) return;
        if (changes.playing === true) return this.#markPlayed(sound);
        if (changes.playing === false) return this.#reapLeftover(sound, changes);
    }

    static onPlaylistChange(playlist, changes) {
        if (!this.isQueue(playlist) || !Array.isArray(changes.sounds)) return;
        for (const change of changes.sounds) {
            const sound = playlist.sounds.get(change._id);
            if (sound) this.onSoundChange(sound, change);
        }
    }

    static #flag(entry) {
        return entry?.getFlag(MODULE, this.FLAG) ?? {};
    }

    static #markPlayed(sound) {
        const flag = this.#flag(sound);
        if (!flag.ephemeral || flag.played) return;
        if (!Conductor.isConductor(sound.parent) || !sound.isOwner) return;
        sound.setFlag(MODULE, this.FLAG, { ...flag, played: true });
    }

    static #reapLeftover(sound, changes) {
        if (!Conductor.isConductor(sound.parent)) return;
        if (!sound.parent?.playing) return;
        const pausedTime = "pausedTime" in changes ? changes.pausedTime : sound.pausedTime;
        if (pausedTime != null) return;
        if (!this.#flag(sound).ephemeral || !this.#flag(sound).played) return;
        if (this.#reaping.has(sound.id)) return;
        this.remove(sound.id);
    }

    static async onEntryEnded(entry, { automatic = false } = {}) {
        const queue = this.playlist;
        if (!queue?.isOwner) return;
        if (automatic && !Conductor.isConductor(queue)) return;
        if (!this.#flag(entry).ephemeral) return;
        if (this.#reaping.has(entry.id)) return;
        this.#reaping.add(entry.id);
        try {
            const next = this.#nextAfter(entry);
            await this.remove(entry.id);
            if (next) return this.play(next);
            if (!queue.sounds.size) return this.drained();
        } finally {
            this.#reaping.delete(entry.id);
        }
    }

    static async drained() {
        const queue = this.playlist;
        if (!queue?.isOwner) return;
        const resumeTo = queue.getFlag(MODULE, this.FLAG)?.resumeTo;
        if (queue.playing) await queue.stopAll();
        await queue.setFlag(MODULE, this.FLAG, { isQueue: true, resumeTo: null });
        if (!resumeTo) return;
        const playlist = game.playlists.get(resumeTo);
        if (playlist && AudioChannels.isMusicPlayback(playlist)) await FadeService.fadeIn(playlist);
    }
}
