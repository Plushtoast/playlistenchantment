import { Librarian } from "../../core/librarian.js";
import { PlaybackService } from "../../core/playbackservice.js";
import { QueueService } from "../../core/queueservice.js";

/**
 * Compact-player track search popover.
 * Clicking the now-playing title in compact mode opens it; Escape or an outside click closes it.
 */
export class StudioPicker {
    #studio;
    #open = false;
    #query = "";
    #focus = false;
    #bound = false;

    constructor(studio) {
        this.#studio = studio;
    }

    get open() {
        return this.#open;
    }

    bind() {
        if (this.#bound) return;
        document.addEventListener("pointerdown", this.#onDocumentPointerDown, true);
        this.#bound = true;
    }

    unbind() {
        document.removeEventListener("pointerdown", this.#onDocumentPointerDown, true);
        this.#bound = false;
    }

    end() {
        this.#open = false;
        this.#query = "";
        this.#focus = false;
    }

    destroy() {
        this.unbind();
        this.end();
    }

    handleEscape(event) {
        if (!this.#open) return false;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.close();
        return true;
    }

    prepare(mapTrack) {
        if (!this.#studio.isCompact || !this.#open) return { open: false, query: "", tracks: [] };

        const query = this.#query;
        const current = PlaybackService.currentTrack();
        const playlist = QueueService.originPlaylist(current);
        const tracks = query
            ? Librarian.searchAll({ query, boards: false, channels: ["music"] })
            : Librarian.tracksOf(playlist);

        return {
            open: true,
            query,
            tracks: tracks.map((sound) => mapTrack(sound, { showSource: !!query })),
        };
    }

    toggle() {
        if (this.#open) return this.close();
        this.#open = true;
        this.#query = "";
        this.#focus = true;
        return this.#refresh();
    }

    close() {
        if (!this.#open) return;
        this.end();
        return this.#refresh();
    }

    onSearch(value) {
        this.#debouncedSearch(value);
    }

    async play(target) {
        const sound = this.#soundFrom(target);
        if (sound) await PlaybackService.playOrCrossFade(sound.parent, sound);
        return this.close();
    }

    #onDocumentPointerDown = (event) => {
        if (!this.#open) return;
        if (this.#studio.element?.contains(event.target)) return;
        this.close();
    };

    async #refresh() {
        const focus = this.#focus;
        this.#focus = false;
        await this.#studio.render({ parts: ["transport"] });
        this.#studio.fitCompact();
        if (focus) this.#focusSearch();
    }

    #focusSearch() {
        const search = this.#studio.element?.querySelector(".pe-picker-search");
        if (!search) return;
        search.focus();
        const end = search.value.length;
        search.setSelectionRange(end, end);
    }

    #debouncedSearch = foundry.utils.debounce((value) => {
        this.#query = value.trim();
        this.#focus = true;
        this.#refresh();
    }, 250);

    #soundFrom(element) {
        const node = element.closest("[data-sound-id]");
        if (!node) return null;
        const playlist = game.playlists.get(node.dataset.playlistId);
        return playlist?.sounds.get(node.dataset.soundId) ?? null;
    }
}
