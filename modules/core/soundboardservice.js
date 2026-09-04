import { MODULE, Settings } from "../settings.js";
import { AudioChannels } from "./audiochannels.js";
import { DuckingService } from "./duckingservice.js";
import { Permissions } from "./permissionservice.js";
import { Relay } from "./relay.js";

export class SoundboardService {
    static BOARD_FLAG = "board";
    static PAD_FLAG = "pad";

    static PAD_DEFAULTS = {
        loop: false,
        volume: 0.8,
        duck: false,
        chokeGroup: "",
        playerUsable: false,
    };

    static register() {
        Relay.onRequest("firePad", async ({ uuid }, user) => this.#handleRequest(uuid, user));
    }

    /* -------------------------------------------- */
    /*  Boards                                      */
    /* -------------------------------------------- */

    static isBoard(playlist) {
        if (!AudioChannels.isSoundboard(playlist)) return false;
        return playlist.getFlag(MODULE, this.BOARD_FLAG)?.enabled !== false;
    }

    static boards() {
        return game.playlists.filter((playlist) => this.isBoard(playlist));
    }

    static boardConfig(playlist) {
        const stored = playlist?.getFlag(MODULE, this.BOARD_FLAG) ?? {};
        return { enabled: stored.enabled !== false, columns: Number(stored.columns) || 4 };
    }

    static async setBoardConfig(playlist, data) {
        return playlist.setFlag(MODULE, this.BOARD_FLAG, { ...this.boardConfig(playlist), ...data });
    }

    static async createBoard(name) {
        if (!Permissions.canCreatePlaylist()) return null;
        return foundry.documents.Playlist.create({
            name: name || game.i18n.localize("PLAYLISTENCHANTMENT.BOARD.newBoard"),
            mode: CONST.PLAYLIST_MODES.DISABLED,
            channel: "interface",
            [`flags.${MODULE}.${this.BOARD_FLAG}`]: { enabled: true, columns: 4 },
        });
    }

    static async convert(playlist, enabled = true) {
        if (!Permissions.canEdit(playlist)) return;
        return playlist.update({
            mode: enabled ? CONST.PLAYLIST_MODES.DISABLED : CONST.PLAYLIST_MODES.SEQUENTIAL,
            [`flags.${MODULE}.${this.BOARD_FLAG}`]: { ...this.boardConfig(playlist), enabled },
        });
    }

    /* -------------------------------------------- */
    /*  Pads                                        */
    /* -------------------------------------------- */

    static padConfig(sound) {
        return { ...this.PAD_DEFAULTS, ...(sound?.getFlag(MODULE, this.PAD_FLAG) ?? {}) };
    }

    static async setPadConfig(sound, data) {
        if (!Permissions.canEdit(sound?.parent)) return;
        const config = { ...this.padConfig(sound), ...data };
        await sound.setFlag(MODULE, this.PAD_FLAG, config);
        if ("loop" in data || "volume" in data) {
            await sound.update({ repeat: config.loop, volume: config.volume });
        }
        return config;
    }

    static canFire(sound) {
        if (!sound) return false;
        if (Permissions.canControl(sound.parent)) return true;
        return this.padConfig(sound).playerUsable && Permissions.canRelay();
    }

    // GM re-checks player-usable pad so permission cannot be granted by a manipulated client.
    static async fire(sound) {
        if (!sound) return;
        if (!Permissions.canControl(sound.parent)) {
            if (!this.canFire(sound)) {
                ui.notifications.warn(game.i18n.localize("PLAYLISTENCHANTMENT.errorNoPermission"));
                return;
            }
            const response = await Relay.requestGM("firePad", { uuid: sound.uuid });
            if (response?.ok === false) ui.notifications.error(response.error);
            return;
        }
        return this.#play(sound);
    }

    static async #handleRequest(uuid, user) {
        const sound = await fromUuid(uuid);
        if (!sound) throw new Error("Pad not found");
        if (!this.padConfig(sound).playerUsable) {
            throw new Error(game.i18n.localize("PLAYLISTENCHANTMENT.errorNoPermission"));
        }
        await this.#play(sound);
        if (Settings.get("notifyGm")) {
            ui.notifications.info(
                game.i18n.format("PLAYLISTENCHANTMENT.BOARD.playerFired", {
                    user: user?.name ?? "?",
                    pad: sound.name,
                })
            );
        }
        return true;
    }

    static async #play(sound) {
        const board = sound.parent;
        const config = this.padConfig(sound);

        await this.#choke(board, sound, config);
        await sound.update({ repeat: config.loop, volume: config.volume });
        await board.playSound(sound);

        if (config.duck) this.#duckFor(sound, config);
    }

    static async #choke(board, sound, config) {
        if (!config.chokeGroup) return;
        const rivals = board.sounds.filter(
            (other) => other.id !== sound.id && other.playing && this.padConfig(other).chokeGroup === config.chokeGroup
        );
        for (const rival of rivals) await board.stopSound(rival);
    }

    static #duckFor(sound, config) {
        const key = `pad-${sound.id}`;
        const release = () => DuckingService.release(key);
        const duration = sound.sound?.duration;
        const ttl = config.loop ? null : Math.round(((duration || 10) + 1) * 1000);

        DuckingService.duck(key, { ttl });
        if (sound.sound) {
            sound.sound.addEventListener("end", release, { once: true });
            sound.sound.addEventListener("stop", release, { once: true });
        }
    }

    static async stopPad(sound) {
        if (!sound) return;
        DuckingService.release(`pad-${sound.id}`);
        if (!Permissions.canControl(sound.parent)) return;
        return sound.parent.stopSound(sound);
    }

    static async stopBoard(board) {
        if (!Permissions.canControl(board)) return;
        for (const sound of board.sounds) DuckingService.release(`pad-${sound.id}`);
        return board.stopAll();
    }

    static visibleBoards() {
        return this.boards().filter((board) => {
            if (Permissions.canControl(board)) return true;
            return board.sounds.some((sound) => this.padConfig(sound).playerUsable);
        });
    }

    static visiblePads(board) {
        const owned = Permissions.canControl(board);
        return [...board.sounds]
            .filter((sound) => owned || this.padConfig(sound).playerUsable)
            .sort((a, b) => a.sort - b.sort);
    }
}
