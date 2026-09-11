import { MODULE } from "../settings.js";

export class Relay {
    static SOCKET = `module.${MODULE}`;
    static QUERY = `${MODULE}.request`;

    static #handlers = new Map();
    static #requests = new Map();

    static register() {
        game.socket.on(this.SOCKET, (payload) => this.#onSocket(payload));
        CONFIG.queries[this.QUERY] = (data) => this.#onQuery(data);
    }

    static onBroadcast(action, handler) {
        this.#handlers.set(action, handler);
    }

    static onRequest(action, handler) {
        this.#requests.set(action, handler);
    }

    static broadcast(action, data = {}) {
        const payload = { action, data, userId: game.userId };
        game.socket.emit(this.SOCKET, payload);
        this.#onSocket(payload);
    }

    static async requestGM(action, data = {}) {
        const gm = game.users.activeGM;
        if (!gm) throw new Error(_loc("PLAYLISTENCHANTMENT.errorNoGM"));
        if (gm.isSelf) return this.#onQuery({ action, data, userId: game.userId });
        return gm.query(this.QUERY, { action, data, userId: game.userId });
    }

    static #onSocket(payload) {
        const handler = this.#handlers.get(payload?.action);
        if (handler) handler(payload.data ?? {}, payload.userId);
    }

    static async #onQuery({ action, data, userId } = {}) {
        const handler = this.#requests.get(action);
        if (!handler) return { ok: false, error: `Unknown request: ${action}` };
        try {
            const result = await handler(data ?? {}, game.users.get(userId));
            return { ok: true, result };
        } catch (error) {
            console.error(`${MODULE} | request ${action} failed`, error);
            return { ok: false, error: error.message };
        }
    }
}
