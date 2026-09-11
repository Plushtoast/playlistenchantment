import { Settings } from "../../settings.js";

/**
 * Window chrome: compact drag, browser-pane resize, and collapsed/expanded pane classes.
 */
export class StudioLayout {
    static COMPACT_WIDTH = 460;
    static BROWSER_WIDTH_DEFAULT = 250;
    static BROWSER_WIDTH_MIN = 180;
    static CONTENT_WIDTH_MIN = 280;
    static RAIL_WIDTH = 300;
    static PANE_COLLAPSED_WIDTH = 36;

    #studio;
    #ignoreClick = false;
    #bound = false;
    #savePosition = foundry.utils.debounce((position) => Settings.set("studioPosition", position), 500);

    constructor(studio) {
        this.#studio = studio;
    }

    bind(root) {
        if (this.#bound || !root) return;
        root.addEventListener("pointerdown", this.#onPointerDown);
        root.addEventListener("click", this.#onClickCapture, true);
        this.#bound = true;
    }

    unbind(root) {
        root?.removeEventListener("pointerdown", this.#onPointerDown);
        root?.removeEventListener("click", this.#onClickCapture, true);
        this.#bound = false;
    }

    destroy() {
        this.unbind(this.#studio.element);
        this.#ignoreClick = false;
    }

    openPosition() {
        const saved = Settings.get("studioPosition") ?? {};
        const position = foundry.utils.isEmpty(saved) ? {} : { ...saved };
        if (this.#studio.isCompact) {
            position.width = StudioLayout.COMPACT_WIDTH;
            position.height = "auto";
        }
        return position;
    }

    onPosition(position) {
        this.#applyBrowserWidth();
        this.#savePosition({
            top: position.top,
            left: position.left,
            width: position.width,
            height: position.height,
        });
    }

    applyClasses(element = this.#studio.element) {
        if (!element) return;
        const studio = this.#studio;
        const state = studio.layoutState;
        element.classList.toggle("pe-compact", studio.isCompact);
        element.classList.toggle("pe-view-settings", studio.isSettingsView);
        element.classList.toggle("pe-browser-collapsed", state.browserCollapsed === true);
        element.classList.toggle("pe-rail-collapsed", state.railCollapsed === true);
    }

    sync(element = this.#studio.element) {
        this.applyClasses(element);
        this.#applyBrowserWidth();
    }

    fitCompact() {
        if (this.#studio.isCompact) this.#studio.setPosition({ height: "auto" });
    }

    toggleBrowser() {
        const state = this.#studio.layoutState;
        state.browserCollapsed = !state.browserCollapsed;
        this.#studio.saveState();
        this.sync();
        this.#studio.render({ parts: ["browser"] });
    }

    toggleRail() {
        const state = this.#studio.layoutState;
        state.railCollapsed = !state.railCollapsed;
        this.#studio.saveState();
        this.sync();
        this.#studio.render({ parts: ["rail"] });
    }

    async toggleCompact() {
        const studio = this.#studio;
        const state = studio.layoutState;
        const compact = !studio.isCompact;
        if (compact) {
            state.expandedSize = { width: studio.position.width, height: studio.position.height };
        }
        state.compact = compact;
        studio.saveState();

        await studio.render();
        const size = compact
            ? { width: StudioLayout.COMPACT_WIDTH, height: "auto" }
            : state.expandedSize ?? studio.constructor.DEFAULT_OPTIONS.position;
        studio.setPosition(size);
    }

    #onClickCapture = (event) => {
        if (!this.#ignoreClick) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.#ignoreClick = false;
    };

    #onPointerDown = (event) => {
        if (this.#studio.isCompact) return this.#beginCompactDrag(event);
        if (this.#studio.layoutState.browserCollapsed) return;
        const handle = event.target.closest(".pe-browser-resize");
        if (!handle || this.#studio.isSettingsView) return;
        event.preventDefault();
        this.#beginBrowserResize(event, handle);
    };

    #beginCompactDrag(event) {
        if (event.button !== 0) return;
        if (event.target.closest("button, input, label, a, .pe-track-picker, .pe-progress")) return;
        const bar = event.target.closest(".pe-transport");
        if (!bar) return;

        const studio = this.#studio;
        const startX = event.clientX;
        const startY = event.clientY;
        const { top, left } = studio.position;
        let dragging = false;

        const onMove = (moveEvent) => {
            if (moveEvent.pointerId !== event.pointerId) return;
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            if (!dragging) {
                if (Math.hypot(dx, dy) < 5) return;
                dragging = true;
                this.#ignoreClick = true;
                bar.setPointerCapture(event.pointerId);
                studio.element.classList.add("pe-compact-dragging");
            }
            studio.setPosition({
                left: left + dx,
                top: top + dy,
            });
        };
        const onUp = (upEvent) => {
            if (upEvent.pointerId !== event.pointerId) return;
            bar.removeEventListener("pointermove", onMove);
            bar.removeEventListener("pointerup", onUp);
            bar.removeEventListener("pointercancel", onUp);
            studio.element.classList.remove("pe-compact-dragging");
        };
        bar.addEventListener("pointermove", onMove);
        bar.addEventListener("pointerup", onUp);
        bar.addEventListener("pointercancel", onUp);
    }

    #beginBrowserResize(event, handle) {
        const studio = this.#studio;
        const content = studio.element.querySelector(".window-content");
        if (!content) return;
        const startX = event.clientX;
        const startWidth = studio.layoutState.browserWidth ?? StudioLayout.BROWSER_WIDTH_DEFAULT;
        studio.element.classList.add("pe-resizing");
        handle.setPointerCapture(event.pointerId);

        const onMove = (moveEvent) => {
            if (moveEvent.pointerId !== event.pointerId) return;
            const width = this.#clampBrowserWidth(startWidth + (moveEvent.clientX - startX), content);
            studio.layoutState.browserWidth = width;
            content.style.setProperty("--pe-browser-width", `${width}px`);
        };
        const onUp = (upEvent) => {
            if (upEvent.pointerId !== event.pointerId) return;
            handle.removeEventListener("pointermove", onMove);
            handle.removeEventListener("pointerup", onUp);
            handle.removeEventListener("pointercancel", onUp);
            studio.element.classList.remove("pe-resizing");
            studio.saveState();
        };
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onUp);
    }

    #railOccupiedWidth() {
        if (this.#studio.isSettingsView || this.#studio.isCompact) return 0;
        return this.#studio.layoutState.railCollapsed ? StudioLayout.PANE_COLLAPSED_WIDTH : StudioLayout.RAIL_WIDTH;
    }

    #clampBrowserWidth(width, content = this.#studio.element?.querySelector(".window-content")) {
        const stored = Math.max(StudioLayout.BROWSER_WIDTH_MIN, Math.round(width));
        const measured = content?.clientWidth ?? 0;
        const rail = this.#railOccupiedWidth();
        const minLayout = StudioLayout.BROWSER_WIDTH_MIN + StudioLayout.CONTENT_WIDTH_MIN + rail;
        if (measured < minLayout) return stored;
        const available = measured - StudioLayout.CONTENT_WIDTH_MIN - rail;
        const max = Math.max(StudioLayout.BROWSER_WIDTH_MIN, available);
        return Math.round(Math.clamp(stored, StudioLayout.BROWSER_WIDTH_MIN, max));
    }

    #applyBrowserWidth() {
        const studio = this.#studio;
        const content = studio.element?.querySelector(".window-content");
        if (!content || studio.isCompact || studio.isSettingsView) return;
        const stored = studio.layoutState.browserWidth ?? StudioLayout.BROWSER_WIDTH_DEFAULT;
        const width = studio.layoutState.browserCollapsed ? stored : this.#clampBrowserWidth(stored, content);
        content.style.setProperty("--pe-browser-width", `${width}px`);
    }
}
