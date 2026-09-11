import { Settings } from "../../settings.js";
import { Permissions } from "../../core/permissionservice.js";
import { PlaybackService } from "../../core/playbackservice.js";

/**
 * Live transport times, seek slider, and buffering icons.
 * Patches the bar in place so dragging the seek thumb is not interrupted.
 */
export class StudioTicker {
    #studio;
    #timer = null;

    constructor(studio) {
        this.#studio = studio;
    }

    static progress(sound) {
        const duration = sound?.sound?.duration;
        const elapsed = sound?.playing ? sound.sound?.currentTime ?? 0 : sound?.pausedTime ?? 0;
        return {
            elapsed: PlaybackService.formatTimestamp(elapsed),
            duration: PlaybackService.formatTimestamp(duration),
            progress: duration ? Math.min(100, (elapsed / duration) * 100) : 0,
            seekMax: Math.floor(duration ?? 0),
            seekValue: Math.floor(elapsed),
            canSeek: Number.isFinite(duration) && duration > 0 && Permissions.canControl(sound.parent),
            isPlaying: !!sound?.playing,
            rawElapsed: elapsed,
            rawDuration: duration,
        };
    }

    start() {
        this.stop();
        this.#timer = setInterval(() => this.#tick(), 500);
    }

    stop() {
        if (this.#timer) clearInterval(this.#timer);
        this.#timer = null;
    }

    destroy() {
        this.stop();
    }

    async onSeek(target) {
        const sound = this.#soundFrom(target);
        if (!sound) return;
        await this.#warnAboutSeek();
        return PlaybackService.seek(sound, Number(target.value));
    }

    // Ticker must not full re-render during slider use; only touch text and widths.
    #tick() {
        const studio = this.#studio;
        if (!studio.rendered) return;
        const current = PlaybackService.currentTrack();
        const bar = studio.element.querySelector(".pe-transport");
        if (!bar) return;

        if (!current) {
            if (bar.dataset.soundId) studio.onExternalChange(studio.pickerOpen ? ["rail"] : ["transport", "rail"]);
            bar.classList.add("pe-transport-idle");
            this.#syncLoadingIcons();
            return;
        }
        bar.classList.remove("pe-transport-idle");

        const times = StudioTicker.progress(current);
        const elapsedLabel = bar.querySelector(".pe-time-elapsed");
        if (elapsedLabel) elapsedLabel.textContent = times.elapsed;
        const durationLabel = bar.querySelector(".pe-time-duration");
        if (durationLabel) durationLabel.textContent = times.duration;

        const fill = bar.querySelector(".pe-progress-fill");
        if (fill && times.rawDuration) fill.style.width = `${times.progress}%`;

        const seek = bar.querySelector(".pe-seek");
        if (seek && times.rawDuration && document.activeElement !== seek) {
            seek.max = times.seekMax;
            seek.value = times.seekValue;
        }

        if (bar.dataset.soundId !== current.id || bar.dataset.playing !== String(current.playing)) {
            studio.onExternalChange(studio.pickerOpen ? ["rail"] : ["transport", "rail"]);
        }
        this.#syncLoadingIcons();
    }

    #syncLoadingIcons() {
        for (const button of this.#studio.element.querySelectorAll(".pe-track-cover")) {
            const sound = this.#soundFrom(button);
            const icon = button.querySelector("i");
            if (!sound || !icon) continue;
            const loading = PlaybackService.isBuffering(sound);
            icon.className = `fa-solid ${loading ? "fa-spinner fa-spin" : sound.playing ? "fa-volume-high" : "fa-play"}`;
        }
    }

    /** Seeking restarts the track on every client. */
    async #warnAboutSeek() {
        if (Settings.get("seekWarningAck")) return;
        ui.notifications.info(_loc("PLAYLISTENCHANTMENT.STUDIO.seekWarning"), { permanent: false });
        await Settings.set("seekWarningAck", true);
    }

    #soundFrom(element) {
        const node = element.closest("[data-sound-id]");
        if (!node) return null;
        const playlist = game.playlists.get(node.dataset.playlistId);
        return playlist?.sounds.get(node.dataset.soundId) ?? null;
    }
}
