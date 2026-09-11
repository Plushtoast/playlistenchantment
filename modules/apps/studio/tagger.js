import { Permissions } from "../../core/permissionservice.js";
import { Tags } from "../../core/tagservice.js";
import { TrackMeta } from "../../core/trackmeta.js";

/**
 * Tag drag, Shift-paint, cursor ghost, and playlist-list auto-scroll.
 * HTML5 drag ends on drop, so the ghost is a custom overlay — not Foundry's setDragImage.
 */
export class StudioTagger {
    static MIME = "playlistenchantment/tag";

    #studio;
    #paintTag = null;
    #shiftDrop = false;
    #dragging = false;
    #dragEndedAt = 0;
    #ghost = null;
    #followBound = false;
    #blankCanvas = null;
    #scrollBody = null;
    #scrollVelocity = 0;
    #scrollFrame = 0;
    #hover = null;
    #bound = false;

    constructor(studio) {
        this.#studio = studio;
    }

    get painting() {
        return !!this.#paintTag;
    }

    get busy() {
        return this.#dragging || !!this.#paintTag;
    }

    recentlyDragged() {
        return this.#dragging || Date.now() - this.#dragEndedAt < 400;
    }

    #onBlur = () => this.#endPaint();

    #onKeyup = (event) => {
        if (event.key === "Shift" || event.code === "ShiftLeft" || event.code === "ShiftRight") this.#endPaint();
    };

    bind(root) {
        if (this.#bound || !root) return;
        root.addEventListener("pointerdown", this.#onPaintPointerDown, true);
        document.addEventListener("keyup", this.#onKeyup, true);
        window.addEventListener("blur", this.#onBlur);
        this.#bound = true;
    }

    unbind(root) {
        this.end();
        root?.removeEventListener("pointerdown", this.#onPaintPointerDown, true);
        document.removeEventListener("keyup", this.#onKeyup, true);
        window.removeEventListener("blur", this.#onBlur);
        this.#bound = false;
    }

    sync(element) {
        element?.classList.toggle("pe-stamping", this.painting);
    }

    end() {
        this.#endPaint();
    }

    destroy() {
        this.unbind(this.#studio.element);
        this.#dragging = false;
        this.#removeGhost();
    }

    handleEscape(event) {
        if (!this.#paintTag) return false;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.#endPaint();
        return true;
    }

    onDragStart(event) {
        const chip = event.target.closest(".pe-tag[data-tag]");
        if (!chip) return false;
        this.#dragging = true;
        this.#startTagDrag(event, chip.dataset.tag);
        return true;
    }

    onDragOver(event) {
        this.#autoScroll(event.clientY);
        if (this.#ghost) this.#positionGhost(event.clientX, event.clientY);
        if (!this.#isTagDrag(event)) return false;

        this.#shiftDrop = this.#isShiftHeld(event);
        const row = event.target.closest("[data-sound-id], [data-playlist-id], [data-folder-id]");
        this.#highlight(row && this.#taggableFrom(row) ? row : null);
        if (row) event.preventDefault();
        return true;
    }

    onDragLeave(event) {
        const root = this.#studio.element;
        if (!root?.contains(event.relatedTarget)) {
            this.#highlight(null);
            this.#stopAutoScroll();
        }
    }

    onDragEnd(event) {
        this.#dragging = false;
        this.#shiftDrop = false;
        this.#dragEndedAt = Date.now();
        this.#stopAutoScroll();
        if (this.#paintTag) {
            if (event.clientX || event.clientY) this.#positionGhost(event.clientX, event.clientY);
            this.#bindFollow();
        } else this.#removeGhost();
        this.#highlight(null);
    }

    async onDrop(event) {
        this.#highlight(null);
        const tag = event.dataTransfer.getData(StudioTagger.MIME);
        if (!tag) return false;
        event.preventDefault();
        const tagged = this.#taggableFrom(event.target);
        if (!tagged) return true;
        if (this.#isShiftHeld(event) || this.#shiftDrop) this.#beginPaint(tag, event.clientX, event.clientY);
        else this.#endPaint();
        await this.#toggleOn(tagged, tag, event.target.closest(".pe-track"));
        return true;
    }

    async untag(event, target) {
        event.stopPropagation();
        const tagged = this.#taggableFrom(target);
        if (tagged) await TrackMeta.removeTag(tagged, target.dataset.tag);
    }

    /* -------------------------------------------- */
    /*  Paint                                       */
    /* -------------------------------------------- */

    #onPaintPointerDown = (event) => {
        if (event.button !== 0) return;
        if (!this.#paintTag || !this.#isShiftHeld(event)) return;
        if (event.target.closest("button, input, [data-action]")) return;
        const row = event.target.closest(".pe-track");
        if (!row) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.#applyPaintToRow(row);
    };

    #beginPaint(tag, x, y) {
        this.#paintTag = tag;
        this.#studio.element?.classList.add("pe-stamping");
        if (!this.#ghost) {
            const source = this.#studio.element?.querySelector(`.pe-tag[data-tag="${CSS.escape(tag)}"]`);
            this.#ghost = this.#createGhost(source, tag);
            document.body.appendChild(this.#ghost);
        }
        this.#positionGhost(x, y);
        this.#bindFollow();
    }

    #endPaint() {
        if (!this.#paintTag) return;
        this.#paintTag = null;
        this.#studio.element?.classList.remove("pe-stamping");
        this.#removeGhost();
        this.#studio.flushDeferredRefresh();
    }

    async #applyPaintToRow(row) {
        const tag = this.#paintTag;
        const sound = this.#soundFrom(row);
        if (!tag || !sound || !Permissions.canEdit(sound.parent)) return;
        await this.#toggleOn(sound, tag, row);
    }

    async #toggleOn(tagged, tag, row) {
        const result = await TrackMeta.toggleTag(tagged, tag);
        if (tagged.documentName !== "PlaylistSound") return result;
        if (result === "removed") this.#unpaintChip(row, tag);
        else if (result === "added") this.#paintChip(row, tag);
        return result;
    }

    /* -------------------------------------------- */
    /*  Ghost                                       */
    /* -------------------------------------------- */

    #startTagDrag(event, tag) {
        event.dataTransfer.setData(StudioTagger.MIME, tag);
        event.dataTransfer.setData("text/plain", JSON.stringify({ type: StudioTagger.MIME, tag }));
        event.dataTransfer.effectAllowed = "copy";
        const source = event.target.closest(".pe-tag");
        if (!source) return;
        this.#removeGhost();
        this.#ghost = this.#createGhost(source, tag);
        document.body.appendChild(this.#ghost);
        event.dataTransfer.setDragImage(this.#blankDragImage(), 0, 0);
        this.#positionGhost(event.clientX, event.clientY);
        this.#bindFollow();
    }

    #blankDragImage() {
        if (this.#blankCanvas?.isConnected) return this.#blankCanvas;
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        canvas.style.cssText = "position:absolute;left:-1000px;top:-1000px;width:1px;height:1px;pointer-events:none";
        document.body.appendChild(canvas);
        this.#blankCanvas = canvas;
        return canvas;
    }

    #createGhost(source, tag) {
        const entry = Tags.get(tag || source?.dataset.tag);
        const ghost = source ? source.cloneNode(true) : document.createElement("div");
        if (source) {
            ghost.removeAttribute("data-action");
            ghost.removeAttribute("data-tooltip");
            ghost.removeAttribute("draggable");
            ghost.classList.remove("active");
            ghost.querySelector(".pe-tag-play")?.remove();
        } else {
            ghost.textContent = entry.label;
            ghost.style.setProperty("--pe-tag-color", entry.color);
            ghost.style.setProperty("--pe-tag-foreground", entry.foreground);
        }
        ghost.classList.add("pe-tag", "pe-tag-ghost");
        ghost.style.position = "fixed";
        ghost.style.top = "0";
        ghost.style.left = "0";
        ghost.style.margin = "0";
        ghost.style.pointerEvents = "none";
        ghost.style.zIndex = "10000";
        ghost.style.willChange = "transform";
        ghost.style.transform = "translate3d(-9999px, -9999px, 0)";
        return ghost;
    }

    #positionGhost(x, y) {
        if (!this.#ghost || x == null || y == null) return;
        this.#ghost.style.transform = `translate3d(${x + 12}px, ${y + 8}px, 0)`;
    }

    #bindFollow() {
        if (this.#followBound) return;
        document.addEventListener("pointermove", this.#onFollow, { passive: true });
        document.addEventListener("dragover", this.#onFollow, true);
        this.#followBound = true;
    }

    #unbindFollow() {
        if (!this.#followBound) return;
        document.removeEventListener("pointermove", this.#onFollow);
        document.removeEventListener("dragover", this.#onFollow, true);
        this.#followBound = false;
    }

    #onFollow = (event) => {
        if (!this.#dragging && !this.#paintTag) return;
        this.#positionGhost(event.clientX, event.clientY);
        this.#autoScroll(event.clientY);
    };

    #removeGhost() {
        this.#unbindFollow();
        this.#stopAutoScroll();
        this.#ghost?.remove();
        this.#ghost = null;
    }

    /* -------------------------------------------- */
    /*  Auto-scroll                                 */
    /* -------------------------------------------- */

    #autoScroll(clientY) {
        const body = this.#studio.element?.querySelector(".pe-content-body");
        if (!body) return this.#stopAutoScroll();
        const rect = body.getBoundingClientRect();
        const edge = Math.min(56, Math.max(24, rect.height / 5));
        let intensity = 0;
        if (clientY >= rect.top - 24 && clientY < rect.top + edge) intensity = -((rect.top + edge - clientY) / edge);
        else if (clientY <= rect.bottom + 24 && clientY > rect.bottom - edge) intensity = (clientY - (rect.bottom - edge)) / edge;
        intensity = Math.max(-1, Math.min(1, intensity));
        const atTop = intensity < 0 && body.scrollTop <= 0;
        const atBottom = intensity > 0 && body.scrollTop >= body.scrollHeight - body.clientHeight - 1;
        if (!intensity || atTop || atBottom) return this.#stopAutoScroll();
        this.#scrollBody = body;
        this.#scrollVelocity = intensity * Math.abs(intensity) * 16;
        this.#startAutoScroll();
    }

    #startAutoScroll() {
        if (this.#scrollFrame) return;
        const tick = () => {
            if (!this.#scrollVelocity || !this.#scrollBody) {
                this.#scrollFrame = 0;
                return;
            }
            this.#scrollBody.scrollTop += this.#scrollVelocity;
            this.#scrollFrame = requestAnimationFrame(tick);
        };
        this.#scrollFrame = requestAnimationFrame(tick);
    }

    #stopAutoScroll() {
        this.#scrollVelocity = 0;
        this.#scrollBody = null;
        if (this.#scrollFrame) cancelAnimationFrame(this.#scrollFrame);
        this.#scrollFrame = 0;
    }

    /* -------------------------------------------- */
    /*  Chips                                       */
    /* -------------------------------------------- */

    #paintChip(row, tag) {
        if (!row) return;
        const entry = Tags.get(tag);
        const sub = row.querySelector(".pe-track-sub");
        if (!sub || !entry?.tag) return;
        let chips = sub.querySelector(".pe-chips");
        if (!chips) {
            chips = document.createElement("div");
            chips.className = "pe-chips pe-chips-sm";
            const source = sub.querySelector(".pe-track-source");
            source ? source.after(chips) : sub.prepend(chips);
        }
        if (chips.querySelector(`[data-tag="${entry.tag}"]`)) return;
        const chip = document.createElement("span");
        chip.className = "pe-chip";
        chip.dataset.tag = entry.tag;
        chip.style.setProperty("--pe-tag-color", entry.color);
        chip.style.setProperty("--pe-tag-foreground", entry.foreground);
        const label = document.createElement("span");
        label.className = "pe-chip-label";
        label.textContent = entry.label;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "pe-chip-remove";
        remove.dataset.action = "untag";
        remove.dataset.tag = entry.tag;
        remove.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        chip.append(label, remove);
        chips.append(chip);
    }

    #unpaintChip(row, tag) {
        if (!row) return;
        const key = Tags.get(tag).tag;
        const chip = row.querySelector(`.pe-chip[data-tag="${CSS.escape(key)}"]`);
        if (!chip) return;
        const chips = chip.parentElement;
        chip.remove();
        if (chips && !chips.querySelector(".pe-chip")) chips.remove();
    }

    /* -------------------------------------------- */
    /*  Lookups                                     */
    /* -------------------------------------------- */

    #isTagDrag(event) {
        return [...(event.dataTransfer?.types ?? [])].includes(StudioTagger.MIME);
    }

    #isShiftHeld(event) {
        return event.shiftKey || game.keyboard?.isModifierActive("SHIFT");
    }

    #highlight(row) {
        if (this.#hover === row) return;
        this.#hover?.classList.remove("pe-tag-hover");
        row?.classList.add("pe-tag-hover");
        this.#hover = row;
    }

    #soundFrom(element) {
        const node = element.closest("[data-sound-id]");
        if (!node) return null;
        const playlist = game.playlists.get(node.dataset.playlistId);
        return playlist?.sounds.get(node.dataset.soundId) ?? null;
    }

    #playlistFrom(element) {
        const node = element.closest("[data-playlist-id]");
        return game.playlists.get(node?.dataset.playlistId) ?? null;
    }

    #folderFrom(element) {
        const id = element.closest("[data-folder-id]")?.dataset.folderId;
        return game.folders.get(id) ?? null;
    }

    #taggableFrom(element) {
        const sound = this.#soundFrom(element);
        if (sound) return Permissions.canEdit(sound.parent) ? sound : null;
        const playlist = this.#playlistFrom(element);
        if (playlist) return Permissions.canEdit(playlist) ? playlist : null;
        const folder = this.#folderFrom(element);
        if (folder?.type === "Playlist" && folder.canUserModify(game.user, "update")) return folder;
        return null;
    }
}
