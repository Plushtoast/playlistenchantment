import { MODULE, Settings } from "../settings.js";
import { AudioChannels } from "./audiochannels.js";
import { Conductor } from "./conductor.js";
import { QueueService } from "./queueservice.js";
import { TrackMeta } from "./trackmeta.js";

export class Announcer {
    static #lastAnnounced = null;

    static onPlayerAction(document, changes, userId) {
        if (!game.user.isGM) return;
        if (!Settings.get("notifyGm")) return;
        if (userId === game.userId) return;

        const user = game.users.get(userId);
        if (!user || user.isGM) return;

        const playlist = document.documentName === "Playlist" ? document : document.parent;
        const label = document.documentName === "Playlist" ? document.name : `${document.name} (${playlist?.name})`;
        const action = this.#describe(document, changes);
        if (!action) return;

        ui.notifications.info(
            _loc("PLAYLISTENCHANTMENT.NOTIFY.playerAction", { user: user.name, action, target: label })
        );
    }

    static #describe(document, changes) {
        if (changes.playing === true) return _loc("PLAYLISTENCHANTMENT.NOTIFY.started");
        if (changes.playing === false) return _loc("PLAYLISTENCHANTMENT.NOTIFY.stopped");
        if ("volume" in changes) return _loc("PLAYLISTENCHANTMENT.NOTIFY.volume");
        return null;
    }

    static onTrackStop(sound) {
        if (this.#lastAnnounced === sound.id) this.#lastAnnounced = null;
    }

    static onTrackStart(sound) {
        if (!AudioChannels.isMusicPlayback(sound.parent, sound)) return;
        if (this.#lastAnnounced === sound.id) return;
        this.#lastAnnounced = sound.id;

        if (Settings.get("announceTracks")) {
            ui.notifications.info(
                _loc("PLAYLISTENCHANTMENT.NOTIFY.nowPlaying", { track: sound.name }),
                { console: false }
            );
        }

        // Only one client posts to chat, otherwise every connected client would create a message.
        if (!Settings.get("announceChat")) return;
        if (!Conductor.isConductor(sound.parent)) return;
        this.#postChat(sound);
    }

    static async #postChat(sound) {
        const cover = TrackMeta.coverFor(sound);
        const source = QueueService.isQueue(sound.parent)
            ? _loc("PLAYLISTENCHANTMENT.QUEUE.fromQueue")
            : sound.parent.name;
        const content = `
            <div class="playlistenchantment-announce">
                ${cover ? `<img src="${cover}" alt="" />` : ""}
                <div class="announce-body">
                    <span class="announce-label">${_loc("PLAYLISTENCHANTMENT.NOTIFY.nowPlayingLabel")}</span>
                    <strong class="announce-track">${foundry.utils.escapeHTML(sound.name)}</strong>
                    <span class="announce-source">${foundry.utils.escapeHTML(source ?? "")}</span>
                </div>
            </div>`;

        return foundry.documents.ChatMessage.create({
            content,
            speaker: { alias: _loc("PLAYLISTENCHANTMENT.NOTIFY.speaker") },
            flags: { [MODULE]: { announcement: true } },
        });
    }
}
