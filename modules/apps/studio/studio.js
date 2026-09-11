import { MODULE, Settings } from "../../settings.js";
import { AudioChannels } from "../../core/audiochannels.js";
import { DuckingService } from "../../core/duckingservice.js";
import { FileLocation } from "../../core/filelocation.js";
import { Librarian } from "../../core/librarian.js";
import { Permissions } from "../../core/permissionservice.js";
import { PlaybackService } from "../../core/playbackservice.js";
import { QueueService } from "../../core/queueservice.js";
import { SoundboardService } from "../../core/soundboardservice.js";
import { Tags } from "../../core/tagservice.js";
import { Theme } from "../../core/theme.js";
import { TrackIndex } from "../../core/trackindex.js";
import { TrackMeta } from "../../core/trackmeta.js";
import { CombatPlaylistManager } from "../combatplaylists.js";
import { PadEditor } from "../padeditor.js";
import { DJDialog } from "../djdialog.js";
import { SoundPreview } from "../soundpreview.js";
import { UploadDialog } from "../uploaddialog.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const TEMPLATES = "modules/playlistenchantment/templates/studio";

export class Studio extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "playlistenchantment-studio",
        classes: ["playlistenchantment", "pe-studio"],
        window: {
            title: "PLAYLISTENCHANTMENT.STUDIO.title",
            icon: "fa-solid fa-compact-disc",
            resizable: true,
        },
        position: { width: 1120, height: 700 },
        actions: {
            setView: Studio._onSetView,
            selectPlaylist: Studio._onSelectPlaylist,
            toggleFolder: Studio._onToggleFolder,
            collapseFolders: Studio._onCollapseFolders,
            toggleBrowser: Studio._onToggleBrowser,
            toggleRail: Studio._onToggleRail,
            togglePin: Studio._onTogglePin,
            toggleTag: Studio._onToggleTag,
            toggleChannel: Studio._onToggleChannel,
            clearFilters: Studio._onClearFilters,
            toggleCompact: Studio._onToggleCompact,
            untag: Studio._onUntag,
            playTag: Studio._onPlayTag,
            createInFolder: Studio._onCreateInFolder,
            revealPlaylist: Studio._onRevealPlaylist,
            playPickerTrack: Studio._onPlayPickerTrack,

            playPlaylist: Studio._onPlayPlaylist,
            playTrack: Studio._onPlayTrack,
            toggleTrack: Studio._onToggleTrack,
            stopPlaylist: Studio._onStopPlaylist,
            toggleRepeat: Studio._onToggleRepeat,
            transportToggle: Studio._onTransportToggle,
            transportNext: Studio._onTransportNext,
            transportPrev: Studio._onTransportPrev,
            transportStop: Studio._onTransportStop,
            toggleDuck: Studio._onToggleDuck,

            enqueue: Studio._onEnqueue,
            queuePlayNext: Studio._onQueuePlayNext,
            queueRemove: Studio._onQueueRemove,
            queueClear: Studio._onQueueClear,
            queueClearPlayed: Studio._onQueueClearPlayed,
            queueSkip: Studio._onQueueSkip,
            queuePlay: Studio._onQueuePlay,

            editTrack: Studio._onEditTrack,
            editPlaylist: Studio._onEditPlaylist,
            previewTrack: Studio._onPreviewTrack,
            removeTrack: Studio._onRemoveTrack,
            newPlaylist: Studio._onNewPlaylist,
            newFolder: Studio._onNewFolder,
            deletePlaylist: Studio._onDeletePlaylist,
            openUpload: Studio._onOpenUpload,
            manageDJ: Studio._onManageDJ,
            setMode: Studio._onSetMode,
            toggleMixer: Studio._onToggleMixer,

            addTag: Studio._onAddTag,
            removeTag: Studio._onRemoveTag,
            resetTags: Studio._onResetTags,
            browseUploadFolder: Studio._onBrowseUploadFolder,
            captureHotkey: Studio._onCaptureHotkey,
            saveHotkey: Studio._onSaveHotkey,
            clearHotkey: Studio._onClearHotkey,

            newBoard: Studio._onNewBoard,
            firePad: Studio._onFirePad,
            stopPad: Studio._onStopPad,
            editPad: Studio._onEditPad,
            stopBoard: Studio._onStopBoard,
        },
    };

    static PARTS = {
        header: { template: `${TEMPLATES}/header.hbs` },
        browser: {
            template: `${TEMPLATES}/browser.hbs`,
            templates: [`${TEMPLATES}/folder.hbs`, `${TEMPLATES}/entry.hbs`, `${TEMPLATES}/chips.hbs`],
            scrollable: [".pe-browser-body"],
        },
        content: {
            template: `${TEMPLATES}/content.hbs`,
            templates: [`${TEMPLATES}/track.hbs`, `${TEMPLATES}/pad.hbs`, `${TEMPLATES}/settings.hbs`, `${TEMPLATES}/pips.hbs`, `${TEMPLATES}/chips.hbs`],
            scrollable: [".pe-content-body"],
        },
        rail: {
            template: `${TEMPLATES}/rail.hbs`,
            templates: [`${TEMPLATES}/pips.hbs`],
            scrollable: [".pe-queue-list"],
        },
        transport: {
            template: `${TEMPLATES}/transport.hbs`,
            templates: [`${TEMPLATES}/pips.hbs`],
        },
    };

    /* -------------------------------------------- */
    /*  Instance state                              */
    /* -------------------------------------------- */

    /** Tag drag mime cannot be read while in flight; types can, for dragover highlighting. */
    static TAG_DRAG_TYPE = "playlistenchantment/tag";

    static COMPACT_WIDTH = 460;

    static BROWSER_WIDTH_DEFAULT = 250;
    static BROWSER_WIDTH_MIN = 180;
    static CONTENT_WIDTH_MIN = 280;
    static RAIL_WIDTH = 300;
    static PANE_COLLAPSED_WIDTH = 36;

    #state = {
        view: "library",
        playlistId: null,
        boardId: null,
        collapsedFolders: [],
        compact: false,
        expandedSize: null,
        browserWidth: Studio.BROWSER_WIDTH_DEFAULT,
        browserCollapsed: false,
        railCollapsed: false,
    };
    #query = "";
    #tags = new Set();
    #channels = new Set();
    #ticker = null;
    #listenersBound = false;
    #contextMenusBound = false;
    #tagHover = null;
    #mixerOpen = false;
    #capturingHotkey = false;
    #pendingHotkey = null;
    #stopHotkeyCapture = null;
    #pickerOpen = false;
    #pickerQuery = "";
    #pickerFocus = false;
    #ignoreClick = false;
    #savePosition = foundry.utils.debounce((position) => Settings.set("studioPosition", position), 500);

    constructor(options = {}) {
        super(options);
        this.#state = { ...this.#state, ...(Settings.get("studioState") ?? {}) };
        const stored = Settings.get("collapsedFolders");
        if (Array.isArray(stored) && stored.length) this.#state.collapsedFolders = [...stored];
        else if (this.#state.collapsedFolders?.length) {
            Settings.set("collapsedFolders", [...this.#state.collapsedFolders]);
        } else {
            this.#state.collapsedFolders = Array.isArray(stored) ? [...stored] : [];
        }
    }

    /* -------------------------------------------- */
    /*  Singleton access                            */
    /* -------------------------------------------- */

    static get instance() {
        return foundry.applications.instances.get("playlistenchantment-studio") ?? null;
    }

    static open({ playlist, view } = {}) {
        const existing = this.instance;
        if (existing) {
            existing.bringToFront();
            if (playlist) existing.showPlaylist(playlist);
            else if (view) existing.showView(view);
            return existing;
        }
        const studio = new this();
        if (playlist) studio.#select(playlist);
        else if (view) studio.#state.view = view;
        studio.render({ force: true, position: studio.#openPosition() });
        return studio;
    }

    static toggle() {
        const existing = this.instance;
        if (existing?.rendered) return existing.close();
        return this.open();
    }

    #openPosition() {
        const saved = Settings.get("studioPosition") ?? {};
        const position = foundry.utils.isEmpty(saved) ? {} : { ...saved };
        if (this.isCompact) {
            position.width = Studio.COMPACT_WIDTH;
            position.height = "auto";
        }
        return position;
    }

    showPlaylist(playlist) {
        if (!playlist) return this;
        this.#clearQuery();
        this.#select(playlist);
        this.#saveState();
        if (this.rendered) this.render({ parts: ["header", "browser", "content"] });
        return this;
    }

    showView(view) {
        this.#state.view = view;
        this.#saveState();
        if (this.rendered) this.render();
        return this;
    }

    #select(playlist) {
        const isBoard = SoundboardService.isBoard(playlist);
        this.#state.view = isBoard ? "boards" : "library";
        if (isBoard) this.#state.boardId = playlist.id;
        else this.#state.playlistId = playlist.id;
    }

    static refresh = foundry.utils.debounce((parts) => {
        const studio = Studio.instance;
        if (!studio?.rendered) return;
        studio.render(parts ? { parts } : {});
    }, 100);

    /* -------------------------------------------- */
    /*  Context                                     */
    /* -------------------------------------------- */

    get isBoardView() {
        return this.#state.view === "boards";
    }

    get isSettingsView() {
        return this.#state.view === "settings";
    }

    get isCompact() {
        return this.#state.compact === true;
    }

    get selectedPlaylist() {
        return game.playlists.get(this.#state.playlistId) ?? null;
    }

    get selectedBoard() {
        return game.playlists.get(this.#state.boardId) ?? null;
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.isGM = game.user.isGM;
        context.view = this.#state.view;
        context.isBoardView = this.isBoardView;
        context.isSettingsView = this.isSettingsView;
        context.isCompact = this.isCompact;
        context.query = this.#query;
        context.canCreate = Permissions.canCreatePlaylist();
        context.canUpload = Permissions.canUpload();
        context.browserCollapsed = this.#state.browserCollapsed === true;
        context.railCollapsed = this.#state.railCollapsed === true;
        return context;
    }

    async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        switch (partId) {
            case "header":
                return this.#prepareHeader(context);
            case "browser":
                return this.#prepareBrowser(context);
            case "content":
                if (this.isSettingsView) return this.#prepareSettings(context);
                return this.isBoardView ? this.#prepareBoard(context) : this.#prepareTracks(context);
            case "rail":
                return this.#prepareRail(context);
            case "transport":
                return this.#prepareTransport(context);
            default:
                return context;
        }
    }

    #prepareHeader(context) {
        const active = this.#tags;
        context.tags = Tags.suggestions(TrackMeta.allTags()).map((entry) => ({ ...entry, active: active.has(entry.tag) }));
        context.channels = AudioChannels.filterContext([...this.#channels]);
        context.hasFilters = !!this.#query || active.size > 0 || this.#channels.size > 0;
        context.query = this.element?.querySelector(".pe-search")?.value ?? this.#query;
        return context;
    }

    get #filter() {
        return { query: this.#query, tags: [...this.#tags], channels: [...this.#channels] };
    }

    get #isTextSearch() {
        return !!this.#query || this.#tags.size > 0;
    }

    #prepareBrowser(context) {
        const searching = this.#isTextSearch;
        const tree = Librarian.tree({
            boards: this.isBoardView ? true : searching ? "all" : false,
            ...this.#filter,
        });
        const selectedId = this.isBoardView ? this.#state.boardId : this.#state.playlistId;
        const collapsed = new Set(this.#state.collapsedFolders ?? []);
        const mapPlaylist = (playlist) => this.#playlistContext(playlist, selectedId);
        context.canCreateFolder = game.user.can("FOLDER_CREATE");
        const mapFolder = (folder) => {
            const tags = Tags.decorate(folder.tags).map((tag) => ({ ...tag, removable: folder.canEdit }));
            const paint = Tags.paint(tags);
            const color = folder.color || paint.tagFill || "";
            return {
                ...folder,
                tags,
                color,
                foreground: color ? Tags.contrastColor(color) : "",
                collapsed: collapsed.has(folder.id),
                canCreateHere: context.canCreate || context.canCreateFolder,
                playlists: folder.playlists.map(mapPlaylist),
                children: folder.children.map(mapFolder),
            };
        };

        context.pinned = {
            folders: tree.pinned.folders.map(mapFolder),
            playlists: tree.pinned.playlists.map(mapPlaylist),
        };
        context.hasPinned = !!(context.pinned.folders.length || context.pinned.playlists.length);
        context.folders = tree.folders.map(mapFolder);
        context.loose = tree.loose.map(mapPlaylist);
        context.empty = !context.hasPinned && !context.folders.length && !context.loose.length;
        const folderIds = this.#folderIds([...tree.folders, ...tree.pinned.folders]);
        context.hasFolders = folderIds.length > 0;
        context.foldersCollapsed = folderIds.length > 0 && folderIds.every((id) => collapsed.has(id));
        return context;
    }

    #prepareTracks(context) {
        const playlist = this.selectedPlaylist;
        const filter = this.#filter;
        const searching = this.#isTextSearch;

        if (searching) {
            context.searchResults = true;
            context.tracks = Librarian.searchAll(filter).map((sound) => this.#trackContext(sound, { showSource: true }));
            context.heading = game.i18n.localize("PLAYLISTENCHANTMENT.STUDIO.searchResults");
            context.empty = !context.tracks.length;
            return context;
        }
        if (!playlist) {
            context.placeholder = game.i18n.localize("PLAYLISTENCHANTMENT.STUDIO.selectPlaylist");
            context.tracks = [];
            return context;
        }

        context.playlist = this.#playlistContext(playlist, playlist.id);
        context.heading = playlist.name;
        context.tracks = Librarian.tracksOf(playlist, filter).map((sound) => this.#trackContext(sound));
        context.canEdit = Permissions.canEdit(playlist);
        context.canControl = Permissions.canControl(playlist);
        context.modes = PlaybackService.modeOptions(playlist);
        context.empty = !context.tracks.length;
        return context;
    }

    #prepareBoard(context) {
        const filter = this.#filter;
        const searching = this.#isTextSearch;
        if (searching) {
            context.searchResults = true;
            context.heading = game.i18n.localize("PLAYLISTENCHANTMENT.STUDIO.searchResults");
            context.columns = SoundboardService.boardConfig(this.selectedBoard).columns;
            context.pads = Librarian.searchAll({ ...filter, boards: true }).map((sound) => this.#padContext(sound));
            context.empty = !context.pads.length;
            return context;
        }

        const board = this.selectedBoard;
        if (!board) {
            context.placeholder = game.i18n.localize("PLAYLISTENCHANTMENT.STUDIO.selectBoard");
            context.pads = [];
            return context;
        }
        const config = SoundboardService.boardConfig(board);
        context.board = this.#playlistContext(board, board.id);
        context.heading = board.name;
        context.columns = config.columns;
        context.canEdit = Permissions.canEdit(board);
        context.pads = SoundboardService.visiblePads(board)
            .filter((sound) => Librarian.soundMatchesFilter(board, sound, filter))
            .map((sound) => this.#padContext(sound));
        context.empty = !context.pads.length;
        return context;
    }

    #prepareSettings(context) {
        context.heading = game.i18n.localize("PLAYLISTENCHANTMENT.STUDIOSETTINGS.title");
        context.enchantmentStyle = Theme.useEnchantedStyle;
        const binding = this.#capturingHotkey ? this.#pendingHotkey : Settings.studioBinding();
        context.hotkey = Settings.humanizeBinding(binding);
        context.capturing = this.#capturingHotkey;
        context.hotkeyConflict = Settings.conflictMessage(binding);
        if (!game.user.isGM) return context;

        context.channels = AudioChannels.mixerContext();
        context.autoCombatSwitch = CombatPlaylistManager.autoCombatSwitch;
        context.combatPlaylists = CombatPlaylistManager.options();
        context.tagLibrary = Tags.library();
        context.uploadFolder = Settings.get("soundUploadFolder");
        return context;
    }

    #prepareRail(context) {
        context.playing = PlaybackService.playingSounds()
            .filter((sound) => sound.playing)
            .map((sound) => this.#trackContext(sound, { showSource: true }));

        context.queue = {
            enabled: QueueService.enabled,
            canAdd: Permissions.canQueue(),
            canControl: QueueService.playlist?.isOwner === true,
            isPlaying: QueueService.isPlaying,
            entries: QueueService.entries().map((entry, index) => ({
                ...this.#trackContext(entry),
                position: index + 1,
                addedBy: game.users.get(entry.getFlag(MODULE, QueueService.FLAG)?.addedBy)?.name ?? "",
            })),
        };
        context.queue.empty = !context.queue.entries.length;
        context.queue.hasPlayed = QueueService.finishedEntries().length > 0;
        return context;
    }

    #prepareTransport(context) {
        const current = PlaybackService.currentTrack();
        context.hasTrack = !!current;
        context.isDucking = DuckingService.isDucking;
        context.mixer = {
            open: this.#mixerOpen,
            canConfigure: game.user.isGM,
            channels: AudioChannels.mixerContext(),
        };

        if (current) {
            const duration = current.sound?.duration;
            const elapsed = current.playing ? current.sound?.currentTime ?? 0 : current.pausedTime ?? 0;
            context.track = this.#trackContext(current, { showSource: true });
            context.elapsed = PlaybackService.formatTimestamp(elapsed);
            context.duration = PlaybackService.formatTimestamp(duration);
            context.progress = duration ? Math.min(100, (elapsed / duration) * 100) : 0;
            context.seekMax = Math.floor(duration ?? 0);
            context.seekValue = Math.floor(elapsed);
            context.canSeek = Number.isFinite(duration) && duration > 0 && Permissions.canControl(current.parent);
            context.isPlaying = current.playing;
        }
        context.picker = this.#preparePicker();
        return context;
    }

    #preparePicker() {
        if (!this.isCompact || !this.#pickerOpen) return { open: false, query: "", tracks: [] };

        const query = this.#pickerQuery;
        const current = PlaybackService.currentTrack();
        const playlist = QueueService.originPlaylist(current);
        const tracks = query
            ? Librarian.searchAll({ query, boards: false, channels: ["music"] })
            : Librarian.tracksOf(playlist);

        return {
            open: true,
            query,
            tracks: tracks.map((sound) => this.#trackContext(sound, { showSource: !!query })),
        };
    }

    /* -------------------------------------------- */
    /*  Context helpers                             */
    /* -------------------------------------------- */

    #playlistContext(playlist, selectedId) {
        const meta = TrackMeta.read(playlist);
        const djs = Permissions.djUsers(playlist);
        const tags = Tags.decorate(meta.tags).map((tag) => ({ ...tag, removable: Permissions.canEdit(playlist) }));
        const paint = Tags.paint(tags);
        const color = meta.color;
        return {
            id: playlist.id,
            name: playlist.name,
            cover: meta.cover,
            color,
            tags,
            tagFill: paint.tagFill,
            itemStyle: [paint.itemStyle, color ? `--pe-accent: ${color}` : ""].filter(Boolean).join("; "),
            canEdit: Permissions.canEdit(playlist),
            pinned: Librarian.isPinned(playlist),
            playing: playlist.playing,
            selected: playlist.id === selectedId,
            isOwner: playlist.isOwner,
            trackCount: playlist.sounds.size,
            channel: AudioChannels.display(playlist),
            djs: djs.map((user) => ({ id: user.id, name: user.name, color: user.color?.css ?? user.color })),
            hasDJs: djs.length > 0,
            isBoard: SoundboardService.isBoard(playlist),
        };
    }

    #trackContext(sound, { showSource = false } = {}) {
        const playlist = sound.parent;
        const duration = sound.sound?.duration;
        const elapsed = sound.playing ? sound.sound?.currentTime ?? 0 : sound.pausedTime ?? 0;
        const usedIn = TrackIndex.count(sound.path);
        const ownTags = TrackMeta.read(sound).tags;
        const canEdit = Permissions.canEdit(playlist);
        const tags = Tags.decorate(TrackMeta.tagsFor(sound)).map((tag) => ({
            ...tag,
            inherited: !ownTags.includes(tag.tag),
            removable: canEdit && ownTags.includes(tag.tag),
        }));
        const paint = Tags.paint(tags);
        const color = TrackMeta.colorFor(sound);
        return {
            id: sound.id,
            uuid: sound.uuid,
            playlistId: playlist?.id,
            name: sound.name,
            cover: TrackMeta.coverFor(sound),
            color,
            tags,
            extraTags: paint.extraTags,
            tagFill: paint.tagFill,
            itemStyle: [paint.itemStyle, color ? `--pe-accent: ${color}` : ""].filter(Boolean).join("; "),
            playing: sound.playing,
            paused: !sound.playing && !!sound.pausedTime,
            loading: PlaybackService.isBuffering(sound),
            repeat: sound.repeat,
            volume: foundry.audio.AudioHelper.volumeToInput(sound.volume),
            duration: PlaybackService.formatTimestamp(duration),
            elapsed: PlaybackService.formatTimestamp(elapsed),
            channel: AudioChannels.display(playlist, sound),
            source: showSource ? playlist?.name : "",
            usedIn,
            sharedCopies: usedIn > 1,
            usedInTooltip: usedIn > 1
                ? game.i18n.format("PLAYLISTENCHANTMENT.LIBRARY.usedIn", {
                      playlists: TrackIndex.playlistsFor(sound.path).map((p) => p.name).join(", "),
                  })
                : "",
            canControl: Permissions.canControl(playlist),
            canEdit: Permissions.canEdit(playlist),
        };
    }

    #padContext(sound) {
        const config = SoundboardService.padConfig(sound);
        const meta = TrackMeta.read(sound);
        const ownTags = meta.tags;
        const tags = Tags.decorate(TrackMeta.tagsFor(sound)).map((tag) => ({ ...tag, inherited: !ownTags.includes(tag.tag) }));
        const paint = Tags.paint(tags);
        const color = meta.color || TrackMeta.read(sound.parent).color;
        return {
            id: sound.id,
            uuid: sound.uuid,
            playlistId: sound.parent?.id,
            name: sound.name,
            cover: meta.cover || TrackMeta.read(sound.parent).cover,
            color,
            tags,
            extraTags: paint.extraTags,
            tagFill: paint.tagFill,
            itemStyle: [paint.itemStyle, color ? `--pe-accent: ${color}` : ""].filter(Boolean).join("; "),
            playing: sound.playing,
            loop: config.loop,
            duck: config.duck,
            chokeGroup: config.chokeGroup,
            playerUsable: config.playerUsable,
            canEdit: Permissions.canEdit(sound.parent),
        };
    }

    #folderIds(nodes, ids = []) {
        for (const node of nodes ?? []) {
            ids.push(node.id);
            this.#folderIds(node.children, ids);
        }
        return ids;
    }

    /* -------------------------------------------- */
    /*  Lifecycle                                   */
    /* -------------------------------------------- */

    async _renderFrame(options) {
        const frame = await super._renderFrame(options);
        this.#applyPaneClasses(frame);
        return frame;
    }

    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);
        this.#bindListeners();
        this.#bindContextMenus();
        this.#startTicker();
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        Theme.apply(this.element);
        this.#applyPaneClasses();
        this.#applyBrowserWidth();
        this.#bindContextMenus();
    }

    _onPosition(position) {
        super._onPosition(position);
        this.#applyBrowserWidth();
        this.#savePosition({
            top: position.top,
            left: position.left,
            width: position.width,
            height: position.height,
        });
    }

    _onClose(options) {
        super._onClose(options);
        this.#stopTicker();
        this.#stopHotkeyCapture?.();
        this.#unbindPickerListeners();
        this.#pickerOpen = false;
        this.#pickerQuery = "";
        this.#listenersBound = false;
        this.#saveState();
    }

    #startTicker() {
        this.#stopTicker();
        this.#ticker = setInterval(() => this.#tick(), 500);
    }

    #stopTicker() {
        if (this.#ticker) clearInterval(this.#ticker);
        this.#ticker = null;
    }

    // Ticker must not full re-render during slider use; only touch text and widths.
    #tick() {
        if (!this.rendered) return;
        const current = PlaybackService.currentTrack();
        const bar = this.element.querySelector(".pe-transport");
        if (!bar) return;

        if (!current) {
            if (bar.dataset.soundId) this.render({ parts: this.#pickerOpen ? ["rail"] : ["transport", "rail"] });
            bar.classList.add("pe-transport-idle");
            this.#syncLoadingIcons();
            return;
        }
        bar.classList.remove("pe-transport-idle");

        const duration = current.sound?.duration;
        const elapsed = current.playing ? current.sound?.currentTime ?? 0 : current.pausedTime ?? 0;

        const elapsedLabel = bar.querySelector(".pe-time-elapsed");
        if (elapsedLabel) elapsedLabel.textContent = PlaybackService.formatTimestamp(elapsed);
        const durationLabel = bar.querySelector(".pe-time-duration");
        if (durationLabel) durationLabel.textContent = PlaybackService.formatTimestamp(duration);

        const fill = bar.querySelector(".pe-progress-fill");
        if (fill && duration) fill.style.width = `${Math.min(100, (elapsed / duration) * 100)}%`;

        const seek = bar.querySelector(".pe-seek");
        if (seek && duration && document.activeElement !== seek) {
            seek.max = Math.floor(duration);
            seek.value = Math.floor(elapsed);
        }

        if (bar.dataset.soundId !== current.id || bar.dataset.playing !== String(current.playing)) {
            this.render({ parts: this.#pickerOpen ? ["rail"] : ["transport", "rail"] });
        }
        this.#syncLoadingIcons();
    }

    #syncLoadingIcons() {
        for (const button of this.element.querySelectorAll(".pe-track-cover")) {
            const sound = this.#soundFrom(button);
            const icon = button.querySelector("i");
            if (!sound || !icon) continue;
            const loading = PlaybackService.isBuffering(sound);
            icon.className = `fa-solid ${loading ? "fa-spinner fa-spin" : sound.playing ? "fa-volume-high" : "fa-play"}`;
        }
    }

    /* -------------------------------------------- */
    /*  Listeners                                   */
    /* -------------------------------------------- */

    // Bind listeners once on root because parts re-render.
    #bindListeners() {
        if (this.#listenersBound) return;
        const root = this.element;

        root.addEventListener("input", (event) => this.#onInput(event));
        root.addEventListener("change", (event) => this.#onChange(event));
        root.addEventListener("dblclick", (event) => this.#onDoubleClick(event));
        root.addEventListener("pointerdown", (event) => this.#onPointerDown(event));
        root.addEventListener("click", this.#onClickCapture, true);
        root.addEventListener("dragstart", (event) => this.#onDragStart(event));
        root.addEventListener("dragover", (event) => this.#onDragOver(event));
        root.addEventListener("dragleave", (event) => this.#onDragLeave(event));
        root.addEventListener("drop", (event) => this.#onDrop(event));
        document.addEventListener("pointerdown", this.#onDocumentPointerDown, true);
        document.addEventListener("keydown", this.#onDocumentKeydown, true);

        this.#listenersBound = true;
    }

    #unbindPickerListeners() {
        document.removeEventListener("pointerdown", this.#onDocumentPointerDown, true);
        document.removeEventListener("keydown", this.#onDocumentKeydown, true);
        this.element?.removeEventListener("click", this.#onClickCapture, true);
    }

    #onClickCapture = (event) => {
        if (!this.#ignoreClick) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.#ignoreClick = false;
    };

    #onDocumentPointerDown = (event) => {
        if (!this.#pickerOpen) return;
        if (this.element?.contains(event.target)) return;
        this.#closePicker();
    };

    #onDocumentKeydown = (event) => {
        if (event.code !== "Escape" || !this.#pickerOpen) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.#closePicker();
    };

    #onInput(event) {
        const target = event.target;
        if (target.matches(".pe-search")) {
            this.#debouncedSearch(target.value);
        }
        if (target.matches(".pe-picker-search")) {
            this.#debouncedPickerSearch(target.value);
        }
    }

    #debouncedSearch = foundry.utils.debounce((value) => {
        this.#query = value.trim();
        this.render({ parts: ["browser", "content"] });
        this.element?.querySelector('[data-action="clearFilters"]')?.toggleAttribute(
            "disabled",
            !this.#query && !this.#tags.size && !this.#channels.size
        );
    }, 250);

    async #onChange(event) {
        const target = event.target;

        if (target.closest(".pe-mixer") || (this.isSettingsView && target.closest(".pe-settings"))) {
            return this.#onSettingsChange(target);
        }

        if (target.matches(".pe-seek")) {
            const sound = this.#soundFrom(target);
            if (!sound) return;
            await this.#warnAboutSeek();
            return PlaybackService.seek(sound, Number(target.value));
        }

        if (target.matches(".pe-volume")) {
            const sound = this.#soundFrom(target);
            if (!sound) return;
            return PlaybackService.setVolume(sound, foundry.audio.AudioHelper.inputToVolume(target.value));
        }
    }

    #onDoubleClick(event) {
        const row = event.target.closest(".pe-track");
        if (!row) return;
        const sound = this.#soundFrom(row);
        if (sound) PlaybackService.playOrCrossFade(sound.parent, sound);
    }

    #onPointerDown(event) {
        if (this.isCompact) return this.#beginCompactDrag(event);
        if (this.#state.browserCollapsed) return;
        const handle = event.target.closest(".pe-browser-resize");
        if (!handle || this.isSettingsView) return;
        event.preventDefault();
        this.#beginBrowserResize(event, handle);
    }

    #beginCompactDrag(event) {
        if (event.button !== 0) return;
        if (event.target.closest("button, input, label, a, .pe-track-picker, .pe-progress")) return;
        const bar = event.target.closest(".pe-transport");
        if (!bar) return;

        const startX = event.clientX;
        const startY = event.clientY;
        const { top, left } = this.position;
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
                this.element.classList.add("pe-compact-dragging");
            }
            this.setPosition({
                left: left + dx,
                top: top + dy,
            });
        };
        const onUp = (upEvent) => {
            if (upEvent.pointerId !== event.pointerId) return;
            bar.removeEventListener("pointermove", onMove);
            bar.removeEventListener("pointerup", onUp);
            bar.removeEventListener("pointercancel", onUp);
            this.element.classList.remove("pe-compact-dragging");
        };
        bar.addEventListener("pointermove", onMove);
        bar.addEventListener("pointerup", onUp);
        bar.addEventListener("pointercancel", onUp);
    }

    #beginBrowserResize(event, handle) {
        const content = this.element.querySelector(".window-content");
        if (!content) return;
        const startX = event.clientX;
        const startWidth = this.#state.browserWidth ?? Studio.BROWSER_WIDTH_DEFAULT;
        this.element.classList.add("pe-resizing");
        handle.setPointerCapture(event.pointerId);

        const onMove = (moveEvent) => {
            if (moveEvent.pointerId !== event.pointerId) return;
            const width = this.#clampBrowserWidth(startWidth + (moveEvent.clientX - startX), content);
            this.#state.browserWidth = width;
            content.style.setProperty("--pe-browser-width", `${width}px`);
        };
        const onUp = (upEvent) => {
            if (upEvent.pointerId !== event.pointerId) return;
            handle.removeEventListener("pointermove", onMove);
            handle.removeEventListener("pointerup", onUp);
            handle.removeEventListener("pointercancel", onUp);
            this.element.classList.remove("pe-resizing");
            this.#saveState();
        };
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onUp);
    }

    #railOccupiedWidth() {
        if (this.isSettingsView || this.isCompact) return 0;
        return this.#state.railCollapsed ? Studio.PANE_COLLAPSED_WIDTH : Studio.RAIL_WIDTH;
    }

    #clampBrowserWidth(width, content = this.element?.querySelector(".window-content")) {
        const stored = Math.max(Studio.BROWSER_WIDTH_MIN, Math.round(width));
        const measured = content?.clientWidth ?? 0;
        const rail = this.#railOccupiedWidth();
        const minLayout = Studio.BROWSER_WIDTH_MIN + Studio.CONTENT_WIDTH_MIN + rail;
        if (measured < minLayout) return stored;
        const available = measured - Studio.CONTENT_WIDTH_MIN - rail;
        const max = Math.max(Studio.BROWSER_WIDTH_MIN, available);
        return Math.round(Math.clamp(stored, Studio.BROWSER_WIDTH_MIN, max));
    }

    #applyBrowserWidth() {
        const content = this.element?.querySelector(".window-content");
        if (!content || this.isCompact || this.isSettingsView) return;
        const stored = this.#state.browserWidth ?? Studio.BROWSER_WIDTH_DEFAULT;
        const width = this.#state.browserCollapsed ? stored : this.#clampBrowserWidth(stored, content);
        content.style.setProperty("--pe-browser-width", `${width}px`);
    }

    #applyPaneClasses(element = this.element) {
        if (!element) return;
        element.classList.toggle("pe-compact", this.isCompact);
        element.classList.toggle("pe-view-settings", this.isSettingsView);
        element.classList.toggle("pe-browser-collapsed", this.#state.browserCollapsed === true);
        element.classList.toggle("pe-rail-collapsed", this.#state.railCollapsed === true);
    }

    #bindContextMenus() {
        if (this.#contextMenusBound) return;
        const directory = ui.playlists;
        if (!directory) return;
        this._createContextMenu(
            () => directory._getEntryContextOptions.call(directory),
            ".pe-entry",
            { fixed: true, hookName: "getPlaylistContextOptions", parentClassHooks: false }
        );
        this._createContextMenu(
            () => directory._getSoundContextOptions.call(directory),
            ".pe-track, .pe-playing-item",
            { fixed: true, hookName: "getPlaylistSoundContextOptions", parentClassHooks: false }
        );
        this._createContextMenu(
            () => directory._getFolderContextOptions.call(directory),
            ".pe-folder-name",
            { fixed: true, hookName: "getFolderContextOptions", parentClassHooks: false }
        );
        this.#contextMenusBound = true;
    }

    /** Seeking restarts the track on every client. */
    async #warnAboutSeek() {
        if (Settings.get("seekWarningAck")) return;
        ui.notifications.info(game.i18n.localize("PLAYLISTENCHANTMENT.STUDIO.seekWarning"), { permanent: false });
        await Settings.set("seekWarningAck", true);
    }

    /* -------------------------------------------- */
    /*  Drag and drop                               */
    /* -------------------------------------------- */

    #onDragStart(event) {
        const chip = event.target.closest(".pe-tag[data-tag]");
        if (chip) return this.#startTagDrag(event, chip.dataset.tag);

        const row = event.target.closest("[data-sound-id]");
        if (!row) return;
        const sound = this.#soundFrom(row);
        if (!sound) return;
        event.dataTransfer.setData("text/plain", JSON.stringify(sound.toDragData()));
        event.dataTransfer.effectAllowed = "copy";
    }

    #startTagDrag(event, tag) {
        event.dataTransfer.setData(Studio.TAG_DRAG_TYPE, tag);
        event.dataTransfer.setData("text/plain", JSON.stringify({ type: Studio.TAG_DRAG_TYPE, tag }));
        event.dataTransfer.effectAllowed = "copy";
    }

    #isTagDrag(event) {
        return [...(event.dataTransfer?.types ?? [])].includes(Studio.TAG_DRAG_TYPE);
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

    #onDragOver(event) {
        if (this.#isFileDrag(event)) {
            event.preventDefault();
            this.element.classList.add("pe-file-hover");
        }

        if (this.#isTagDrag(event)) {
            const row = event.target.closest("[data-sound-id], [data-playlist-id], [data-folder-id]");
            this.#highlightTagTarget(row && this.#taggableFrom(row) ? row : null);
            if (row) event.preventDefault();
            return;
        }

        const target = event.target.closest(".pe-drop-target");
        if (!target) return;
        event.preventDefault();
        target.classList.add("pe-drop-hover");
    }

    #highlightTagTarget(row) {
        if (this.#tagHover === row) return;
        this.#tagHover?.classList.remove("pe-tag-hover");
        row?.classList.add("pe-tag-hover");
        this.#tagHover = row;
    }

    #isFileDrag(event) {
        return [...(event.dataTransfer?.types ?? [])].includes("Files") && Permissions.canUpload();
    }

    #onDragLeave(event) {
        if (!this.element.contains(event.relatedTarget)) {
            this.element.classList.remove("pe-file-hover");
            this.#highlightTagTarget(null);
        }
        const target = event.target.closest(".pe-drop-target");
        if (!target || target.contains(event.relatedTarget)) return;
        target.classList.remove("pe-drop-hover");
    }

    async #onDrop(event) {
        this.element.classList.remove("pe-file-hover");
        this.#highlightTagTarget(null);
        const target = event.target.closest(".pe-drop-target");
        target?.classList.remove("pe-drop-hover");

        const tag = event.dataTransfer.getData(Studio.TAG_DRAG_TYPE);
        if (tag) {
            event.preventDefault();
            return TrackMeta.addTag(this.#taggableFrom(event.target), tag);
        }

        const files = UploadDialog.audioFilesFrom(event.dataTransfer);
        if (files.length) {
            event.preventDefault();
            const playlist = game.playlists.get(target?.dataset.playlistId) ?? this.selectedPlaylist;
            return UploadDialog.show({ files, playlist });
        }

        if (!target) return;
        event.preventDefault();

        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
        if (data?.type !== "PlaylistSound") return;
        const sound = await fromUuid(data.uuid);
        if (!sound) return;

        if (target.classList.contains("pe-queue-drop")) {
            if (!QueueService.isQueue(sound.parent)) return QueueService.enqueue(sound);
            const over = event.target.closest(".pe-queue-item");
            if (over?.dataset.soundId === sound.id) return;
            return QueueService.reorder(sound.id, over?.dataset.soundId);
        }

        const playlistId = target.dataset.playlistId;
        const playlist = game.playlists.get(playlistId);
        if (!playlist) return;

        if (playlist.id === sound.parent?.id) {
            const over = event.target.closest(".pe-track");
            const neighbour = over ? playlist.sounds.get(over.dataset.soundId) : null;
            if (neighbour && neighbour.id !== sound.id) return Librarian.reorder(sound, neighbour);
            return;
        }
        return Librarian.copyTrack(sound, playlist);
    }

    /* -------------------------------------------- */
    /*  Element helpers                             */
    /* -------------------------------------------- */

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

    /* -------------------------------------------- */
    /*  Actions - navigation                        */
    /* -------------------------------------------- */

    static _onSetView(_event, target) {
        const view = target.dataset.view;
        return this.showView(["boards", "settings"].includes(view) ? view : "library");
    }

    static _onSelectPlaylist(_event, target) {
        const playlist = this.#playlistFrom(target);
        if (!playlist) return;
        this.#clearQuery();
        this.#select(playlist);
        this.#saveState();
        this.render({ parts: ["header", "browser", "content"] });
    }

    static _onToggleFolder(_event, target) {
        const id = target.closest("[data-folder-id]")?.dataset.folderId;
        if (!id) return;
        const collapsed = new Set(this.#state.collapsedFolders ?? []);
        if (collapsed.has(id)) collapsed.delete(id);
        else collapsed.add(id);
        this.#state.collapsedFolders = [...collapsed];
        this.#saveState();
        this.render({ parts: ["browser"] });
    }

    static _onCollapseFolders() {
        const ids = [...this.element.querySelectorAll(".pe-browser-body [data-folder-id]")].map((el) => el.dataset.folderId);
        if (!ids.length) return;
        const collapsed = new Set(this.#state.collapsedFolders ?? []);
        const expand = ids.every((id) => collapsed.has(id));
        for (const id of ids) {
            if (expand) collapsed.delete(id);
            else collapsed.add(id);
        }
        this.#state.collapsedFolders = [...collapsed];
        this.#saveState();
        this.render({ parts: ["browser"] });
    }

    static _onToggleBrowser() {
        this.#state.browserCollapsed = !this.#state.browserCollapsed;
        this.#saveState();
        this.#applyPaneClasses();
        this.render({ parts: ["browser"] });
    }

    static _onToggleRail() {
        this.#state.railCollapsed = !this.#state.railCollapsed;
        this.#saveState();
        this.#applyPaneClasses();
        this.render({ parts: ["rail"] });
    }

    static async _onTogglePin(event, target) {
        event.stopPropagation();
        const folderId = target.dataset.folderId;
        const pinned = folderId ? game.folders.get(folderId) : this.#playlistFrom(target);
        if (!pinned) return;
        await Librarian.togglePin(pinned);
        this.render({ parts: ["browser"] });
    }

    static _onToggleTag(_event, target) {
        const tag = target.dataset.tag;
        if (this.#tags.has(tag)) this.#tags.delete(tag);
        else this.#tags.add(tag);
        this.render({ parts: ["header", "browser", "content"] });
    }

    static _onToggleChannel(_event, target) {
        const channel = target.dataset.channel;
        if (this.#channels.has(channel)) this.#channels.delete(channel);
        else this.#channels.add(channel);
        this.render({ parts: ["header", "browser", "content"] });
    }

    static async _onToggleCompact() {
        const compact = !this.isCompact;
        this.#pickerOpen = false;
        this.#pickerQuery = "";
        if (compact) {
            this.#state.expandedSize = { width: this.position.width, height: this.position.height };
            this.#mixerOpen = false;
        }
        this.#state.compact = compact;
        this.#saveState();

        await this.render();
        const size = compact
            ? { width: Studio.COMPACT_WIDTH, height: "auto" }
            : this.#state.expandedSize ?? Studio.DEFAULT_OPTIONS.position;
        this.setPosition(size);
    }

    static _onClearFilters() {
        this.#clearQuery();
        this.#tags.clear();
        this.#channels.clear();
        this.render({ parts: ["header", "browser", "content"] });
    }

    #clearQuery() {
        this.#query = "";
        const search = this.element?.querySelector(".pe-search");
        if (search) search.value = "";
    }

    #saveState() {
        const snapshot = foundry.utils.duplicate(this.#state);
        delete snapshot.collapsedFolders;
        Settings.set("studioState", snapshot);
        Settings.set("collapsedFolders", [...(this.#state.collapsedFolders ?? [])]);
    }

    /* -------------------------------------------- */
    /*  Actions - playback                          */
    /* -------------------------------------------- */

    static _onRevealPlaylist(_event, target) {
        if (this.isCompact) return this.#togglePicker();
        const sound = this.#soundFrom(target);
        const playlist = QueueService.originPlaylist(sound) ?? this.#playlistFrom(target);
        if (!playlist || QueueService.isQueue(playlist)) return;
        this.showPlaylist(playlist);
    }

    static async _onPlayPickerTrack(_event, target) {
        const sound = this.#soundFrom(target);
        if (sound) await PlaybackService.playOrCrossFade(sound.parent, sound);
        return this.#closePicker();
    }

    #togglePicker() {
        if (this.#pickerOpen) return this.#closePicker();
        this.#pickerOpen = true;
        this.#pickerQuery = "";
        this.#pickerFocus = true;
        return this.#renderTransport();
    }

    #closePicker() {
        if (!this.#pickerOpen) return;
        this.#pickerOpen = false;
        this.#pickerQuery = "";
        this.#pickerFocus = false;
        return this.#renderTransport();
    }

    async #renderTransport() {
        const focus = this.#pickerFocus;
        this.#pickerFocus = false;
        await this.render({ parts: ["transport"] });
        if (this.isCompact) this.setPosition({ height: "auto" });
        if (focus) this.#focusPickerSearch();
    }

    #focusPickerSearch() {
        const search = this.element?.querySelector(".pe-picker-search");
        if (!search) return;
        search.focus();
        const end = search.value.length;
        search.setSelectionRange(end, end);
    }

    #debouncedPickerSearch = foundry.utils.debounce((value) => {
        this.#pickerQuery = value.trim();
        this.#pickerFocus = true;
        this.#renderTransport();
    }, 250);

    static async _onPlayPlaylist(_event, target) {
        const playlist = this.#playlistFrom(target);
        if (playlist) await PlaybackService.playOrCrossFade(playlist);
    }

    static async _onPlayTrack(_event, target) {
        const sound = this.#soundFrom(target);
        if (sound) await PlaybackService.playOrCrossFade(sound.parent, sound);
    }

    static async _onToggleTrack(_event, target) {
        const sound = this.#soundFrom(target);
        if (sound) await PlaybackService.toggle(sound);
    }

    static async _onStopPlaylist(_event, target) {
        const playlist = this.#playlistFrom(target);
        if (playlist) await PlaybackService.stop(playlist);
    }

    static async _onToggleRepeat(_event, target) {
        const sound = this.#soundFrom(target);
        if (sound) await PlaybackService.toggleRepeat(sound);
    }

    static async _onTransportToggle() {
        const current = PlaybackService.currentTrack();
        if (current) return PlaybackService.toggle(current);
        return PlaybackService.startAll();
    }

    static async _onTransportNext() {
        if (QueueService.isPlaying) return QueueService.skip();
        return PlaybackService.skip(1);
    }

    static async _onTransportPrev() {
        return PlaybackService.skip(-1);
    }

    static async _onTransportStop() {
        return PlaybackService.stopAllMusic();
    }

    static _onToggleDuck() {
        if (DuckingService.isDucking) DuckingService.releaseAll();
        else DuckingService.duck("manual", { ttl: 60000 });
        this.render({ parts: ["transport"] });
    }

    /* -------------------------------------------- */
    /*  Actions - queue                             */
    /* -------------------------------------------- */

    static async _onEnqueue(_event, target) {
        const sound = this.#soundFrom(target);
        if (sound) await QueueService.enqueue(sound);
    }

    static async _onQueuePlayNext(_event, target) {
        const sound = this.#soundFrom(target);
        if (sound) await QueueService.enqueue(sound, { next: true });
    }

    static async _onQueueRemove(_event, target) {
        const id = target.closest("[data-sound-id]")?.dataset.soundId;
        if (id) await QueueService.remove(id);
    }

    static async _onQueueClear() {
        await QueueService.clear();
    }

    static async _onQueueClearPlayed() {
        await QueueService.clearPlayed();
    }

    static async _onQueueSkip() {
        await QueueService.skip();
    }

    static async _onQueuePlay(_event, target) {
        const id = target.closest("[data-sound-id]")?.dataset.soundId;
        const entry = id ? QueueService.playlist?.sounds.get(id) : null;
        await QueueService.play(entry ?? undefined);
    }

    /* -------------------------------------------- */
    /*  Actions - library management                */
    /* -------------------------------------------- */

    static _onEditTrack(_event, target) {
        this.#soundFrom(target)?.sheet.render({ force: true });
    }

    static _onEditPlaylist(_event, target) {
        this.#playlistFrom(target)?.sheet.render({ force: true });
    }

    static async _onPreviewTrack(_event, target) {
        const sound = this.#soundFrom(target);
        if (sound) await SoundPreview.open(sound);
    }

    static async _onSetMode(_event, target) {
        const playlist = this.#playlistFrom(target) ?? this.selectedPlaylist;
        if (playlist) await PlaybackService.setMode(playlist, target.dataset.mode);
    }

    static async _onToggleMixer() {
        this.#mixerOpen = !this.#mixerOpen;
        await this.render({ parts: ["transport"] });
        if (this.isCompact) this.setPosition({ height: "auto" });
    }

    static async _onUntag(event, target) {
        event.stopPropagation();
        const tagged = this.#taggableFrom(target);
        if (tagged) await TrackMeta.removeTag(tagged, target.dataset.tag);
    }

    static async _onPlayTag(event, target) {
        event.stopPropagation();
        const tag = target.dataset.tag;
        if (!tag) return;
        this.#tags.add(tag);
        this.render({ parts: ["header", "browser", "content"] });
        await Librarian.playRandomTagged(tag);
    }

    static async _onCreateInFolder(event, target) {
        event.preventDefault();
        event.stopPropagation();
        const folderId = this.#folderIdFrom(target);
        const items = [];
        if (Permissions.canCreatePlaylist()) {
            items.push({
                label: "PLAYLISTENCHANTMENT.LIBRARY.newPlaylistHere",
                icon: "fa-solid fa-music",
                onClick: () => this.#createNamedPlaylist(folderId),
            });
        }
        if (game.user.can("FOLDER_CREATE")) {
            items.push({
                label: "PLAYLISTENCHANTMENT.LIBRARY.newSubfolder",
                icon: "fa-solid fa-folder",
                onClick: () => this.#createNamedFolder(folderId),
            });
        }
        if (!items.length) return;
        const menu = new foundry.applications.ux.ContextMenu(this.element, "", items, {
            jQuery: false,
            fixed: true,
            eventName: "none",
        });
        ui.context?.close();
        await menu.render(target, { animate: true, event });
        ui.context = menu;
    }

    static async _onRemoveTrack(_event, target) {
        const sound = this.#soundFrom(target);
        if (!sound) return;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize("PLAYLISTENCHANTMENT.LIBRARY.removeTrack") },
            content: `<p>${game.i18n.format("PLAYLISTENCHANTMENT.LIBRARY.removeTrackHint", { track: sound.name })}</p>`,
        });
        if (confirmed) await sound.delete();
    }

    static async _onNewPlaylist(event, target) {
        event.stopPropagation();
        return this.#createNamedPlaylist(this.#folderIdFrom(target));
    }

    static async _onNewFolder(event, target) {
        event.stopPropagation();
        return this.#createNamedFolder(this.#folderIdFrom(target));
    }

    async #createNamedPlaylist(folder) {
        const name = await this.#promptName("PLAYLISTENCHANTMENT.LIBRARY.newPlaylist");
        if (!name) return;
        const playlist = await Librarian.createPlaylist({ name, folder });
        if (playlist) {
            this.#state.playlistId = playlist.id;
            this.render();
        }
    }

    async #createNamedFolder(parent) {
        const name = await this.#promptName(parent ? "PLAYLISTENCHANTMENT.LIBRARY.newSubfolder" : "PLAYLISTENCHANTMENT.LIBRARY.newFolder");
        if (!name) return;
        await Librarian.createFolder({ name, parent });
        this.render({ parts: ["browser"] });
    }

    #folderIdFrom(target) {
        return target?.dataset.folderId ?? null;
    }

    static async _onDeletePlaylist(_event, target) {
        const playlist = this.#playlistFrom(target);
        if (playlist) await Librarian.deletePlaylist(playlist);
    }

    static async _onOpenUpload(_event, target) {
        const playlist = this.#playlistFrom(target) ?? this.selectedPlaylist;
        UploadDialog.show({ playlist });
    }

    static async _onManageDJ(_event, target) {
        const playlist = this.#playlistFrom(target) ?? this.selectedPlaylist;
        if (playlist) new DJDialog(playlist).render(true);
    }

    /* -------------------------------------------- */
    /*  Actions - settings                          */
    /* -------------------------------------------- */

    static async _onAddTag() {
        const library = Tags.stored();
        const base = Tags.normalize(game.i18n.localize("PLAYLISTENCHANTMENT.STUDIOSETTINGS.tagNew"));
        let tag = base;
        let suffix = 2;
        while (library.some((entry) => entry.tag === tag)) tag = `${base}-${suffix++}`;
        library.push({ tag, color: "#4a90d9", label: "" });
        await Tags.saveLibrary(library);
        this.render({ parts: ["header", "content"] });
    }

    static async _onRemoveTag(_event, target) {
        const index = Number(target.closest("[data-tag-index]")?.dataset.tagIndex);
        if (!Number.isInteger(index)) return;
        const library = Tags.stored();
        library.splice(index, 1);
        await Tags.saveLibrary(library);
        this.render({ parts: ["header", "content"] });
    }

    static async _onResetTags() {
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize("PLAYLISTENCHANTMENT.STUDIOSETTINGS.tagReset") },
            content: `<p>${game.i18n.localize("PLAYLISTENCHANTMENT.STUDIOSETTINGS.tagResetHint")}</p>`,
        });
        if (!confirmed) return;
        await Tags.resetLibrary();
        this.render({ parts: ["header", "content"] });
    }

    static _onCaptureHotkey() {
        if (this.#capturingHotkey) return this.#stopHotkeyCapture();
        this.#pendingHotkey = Settings.studioBinding();
        this.#capturingHotkey = true;
        this.render({ parts: ["content"] }).then(() => {
            if (!this.#capturingHotkey) return;
            this.element.querySelector(".pe-keybinding .binding-input input")?.focus();
            if (this.#pendingHotkey) this.#syncHotkeyCapture(this.#pendingHotkey);
        });

        const onKey = (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.code === "Escape") return this.#stopHotkeyCapture();
            const binding = Settings.bindingFromEvent(event);
            if (!binding) return;
            this.#pendingHotkey = binding;
            this.#syncHotkeyCapture(binding);
        };

        window.addEventListener("keydown", onKey, true);
        this.#stopHotkeyCapture = () => {
            window.removeEventListener("keydown", onKey, true);
            this.#stopHotkeyCapture = null;
            this.#capturingHotkey = false;
            this.#pendingHotkey = null;
            if (this.rendered) this.render({ parts: ["content"] });
        };
    }

    #syncHotkeyCapture(binding) {
        const row = this.element?.querySelector(".pe-keybinding .editing");
        const input = row?.querySelector(".binding-input input");
        const icon = row?.querySelector(".binding-input i");
        if (!input || !icon) return;

        input.value = Settings.humanizeBinding(binding);
        const conflict = Settings.conflictMessage(binding);
        if (conflict) {
            icon.className = "conflict fa-duotone fa-triangle-exclamation";
            input.dataset.tooltip = "";
            input.ariaLabel = conflict;
        } else {
            icon.className = "fa-regular fa-keyboard";
            delete input.dataset.tooltip;
            input.ariaLabel = game.i18n.localize("KEYBINDINGS.BoundKey");
        }
    }

    static async _onSaveHotkey() {
        if (!this.#capturingHotkey) return;
        await Settings.setStudioBinding(this.#pendingHotkey);
        this.#stopHotkeyCapture();
    }

    static async _onClearHotkey() {
        await Settings.setStudioBinding(null);
        if (this.#capturingHotkey) this.#stopHotkeyCapture();
        else this.render({ parts: ["content"] });
    }

    static async _onBrowseUploadFolder() {
        const input = this.element.querySelector('[name="soundUploadFolder"]');
        const picker = new foundry.applications.apps.FilePicker.implementation({
            type: "folder",
            current: input?.value ?? "",
            callback: async (path) => {
                if (input) input.value = path;
                await Settings.set("soundUploadFolder", path);
            },
        });
        return picker.browse();
    }

    async #onSettingsChange(target) {
        const part = target.closest(".pe-mixer") ? "transport" : "content";

        if (target.matches('[name="enchantmentStyle"]')) {
            return Theme.setEnchantedStyle(target.checked);
        }

        if (target.matches(".pe-setting-volume")) {
            const volume = foundry.audio.AudioHelper.inputToVolume(target.value);
            await AudioChannels.setGlobalVolume(target.dataset.channel, volume);
            return this.render({ parts: [part] });
        }

        if (target.matches(".pe-setting-toggle")) {
            await AudioChannels.update(target.dataset.channel, { [target.dataset.setting]: target.checked });
            return this.render({ parts: [part] });
        }

        if (target.matches(".pe-setting-range")) {
            const raw = Number(target.value);
            const setting = target.dataset.setting;
            const value = setting === "normalizeModifier" ? foundry.audio.AudioHelper.inputToVolume(raw) : raw;
            await AudioChannels.update(target.dataset.channel, { [setting]: value });
            return this.render({ parts: [part] });
        }

        if (target.matches('[name="autoCombatSwitch"]')) {
            return CombatPlaylistManager.setEnabled(target.checked);
        }

        if (target.matches('[name="combatPlaylists"]')) {
            const checked = this.element.querySelectorAll('[name="combatPlaylists"]:checked');
            return CombatPlaylistManager.setPlaylists([...checked].map((input) => input.value));
        }

        if (target.matches('[name="soundUploadFolder"]')) {
            const value = target.value.trim();
            return Settings.set("soundUploadFolder", value ? String(FileLocation.parse(value)) : "");
        }

        if (target.closest(".pe-tag-row")) {
            await this.#saveTagRows();
            return this.render({ parts: ["header", "content"] });
        }
    }

    async #saveTagRows() {
        const rows = this.element.querySelectorAll(".pe-tag-row");
        const library = [...rows].map((row) => ({
            tag: row.querySelector(".pe-tag-name")?.value ?? "",
            color: row.querySelector(".pe-tag-color")?.value ?? "",
            label: row.querySelector(".pe-tag-label")?.value.trim() ?? "",
        }));
        return Tags.saveLibrary(library);
    }

    /* -------------------------------------------- */
    /*  Actions - soundboard                        */
    /* -------------------------------------------- */

    static async _onNewBoard() {
        const name = await this.#promptName("PLAYLISTENCHANTMENT.BOARD.newBoard");
        if (!name) return;
        const board = await SoundboardService.createBoard(name);
        if (board) {
            this.#state.view = "boards";
            this.#state.boardId = board.id;
            this.render();
        }
    }

    static async _onFirePad(_event, target) {
        const sound = this.#soundFrom(target);
        if (sound) await SoundboardService.fire(sound);
    }

    static async _onStopPad(_event, target) {
        const sound = this.#soundFrom(target);
        if (sound) await SoundboardService.stopPad(sound);
    }

    static async _onEditPad(_event, target) {
        const sound = this.#soundFrom(target);
        if (sound) new PadEditor(sound).render(true);
    }

    static async _onStopBoard(_event, target) {
        const board = this.#playlistFrom(target) ?? this.selectedBoard;
        if (board) await SoundboardService.stopBoard(board);
    }

    /* -------------------------------------------- */

    async #promptName(labelKey) {
        const label = game.i18n.localize(labelKey);
        return foundry.applications.api.DialogV2.prompt({
            window: { title: label },
            content: `<input type="text" name="name" value="${label}" autofocus />`,
            ok: {
                label: game.i18n.localize("PLAYLISTENCHANTMENT.create"),
                callback: (_event, button) => button.form.elements.name.value.trim(),
            },
            rejectClose: false,
        });
    }
}
