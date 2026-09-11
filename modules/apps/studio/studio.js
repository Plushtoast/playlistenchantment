import { MODULE, Settings } from "../../settings.js";
import { AudioChannels } from "../../core/audiochannels.js";
import { DuckingService } from "../../core/duckingservice.js";
import { Librarian } from "../../core/librarian.js";
import { Permissions } from "../../core/permissionservice.js";
import { PlaybackService } from "../../core/playbackservice.js";
import { QueueService } from "../../core/queueservice.js";
import { SoundboardService } from "../../core/soundboardservice.js";
import { Tags } from "../../core/tagservice.js";
import { Theme } from "../../core/theme.js";
import { TrackIndex } from "../../core/trackindex.js";
import { TrackMeta } from "../../core/trackmeta.js";
import { PadEditor } from "../padeditor.js";
import { DJDialog } from "../djdialog.js";
import { SoundPreview } from "../soundpreview.js";
import { UploadDialog } from "../uploaddialog.js";
import { StudioLayout } from "./layout.js";
import { StudioPicker } from "./compact-picker.js";
import { StudioSettings } from "./settings-pane.js";
import { StudioTagger } from "./tagger.js";
import { StudioTicker } from "./ticker.js";

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
    static TAG_DRAG_TYPE = StudioTagger.MIME;

    #state = {
        view: "library",
        playlistId: null,
        boardId: null,
        collapsedFolders: [],
        compact: false,
        expandedSize: null,
        browserWidth: StudioLayout.BROWSER_WIDTH_DEFAULT,
        browserCollapsed: false,
        railCollapsed: false,
    };
    #query = "";
    #tags = new Set();
    #channels = new Set();
    #tagger = new StudioTagger(this);
    #settings = new StudioSettings(this);
    #ticker = new StudioTicker(this);
    #picker = new StudioPicker(this);
    #layout = new StudioLayout(this);
    #dragging = false;
    #refreshQueued = false;
    #listenersBound = false;
    #contextMenusBound = false;
    #mixerOpen = false;
    #pendingRevealSoundId = null;

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
        return foundry.applications.instances.get(this.DEFAULT_OPTIONS.id) ?? null;
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
        studio.render({ force: true, position: studio.#layout.openPosition() });
        return studio;
    }

    static toggle() {
        const existing = this.instance;
        if (existing?.rendered) return existing.close();
        return this.open();
    }

    get layoutState() {
        return this.#state;
    }

    saveState() {
        const snapshot = foundry.utils.duplicate(this.#state);
        delete snapshot.collapsedFolders;
        Settings.set("studioState", snapshot);
        Settings.set("collapsedFolders", [...(this.#state.collapsedFolders ?? [])]);
    }

    fitCompact() {
        this.#layout.fitCompact();
    }

    showPlaylist(playlist, sound = null) {
        if (!playlist) return this;
        const alreadyShowing = this.#isShowingPlaylist(playlist) && !this.#query && !this.#tags.size && !this.#channels.size;
        this.#clearQuery();
        this.#select(playlist);
        this.saveState();
        if (alreadyShowing && this.rendered) {
            this.#scrollSoundIntoView(sound);
            return this;
        }
        this.#pendingRevealSoundId = sound?.id ?? null;
        if (this.rendered) this.render({ parts: ["header", "browser", "content"] });
        return this;
    }

    #isShowingPlaylist(playlist) {
        if (!this.rendered || this.isSettingsView) return false;
        if (SoundboardService.isBoard(playlist)) return this.isBoardView && this.#state.boardId === playlist.id;
        return !this.isBoardView && this.#state.playlistId === playlist.id;
    }

    #scrollSoundIntoView(sound) {
        const id = typeof sound === "string" ? sound : sound?.id;
        if (!id) return;
        const row = this.element?.querySelector(`.pe-content-body [data-sound-id="${id}"]`);
        row?.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    showView(view) {
        this.#state.view = view;
        if (view !== "library") this.#tagger.end();
        if (view !== "settings") this.#settings.end();
        this.saveState();
        if (this.rendered) this.render();
        return this;
    }

    #select(playlist) {
        const isBoard = SoundboardService.isBoard(playlist);
        this.#state.view = isBoard ? "boards" : "library";
        if (isBoard) {
            this.#tagger.end();
            this.#settings.end();
            this.#state.boardId = playlist.id;
        } else {
            this.#settings.end();
            this.#state.playlistId = playlist.id;
        }
    }

    static refresh = foundry.utils.debounce((parts) => {
        Studio.instance?.onExternalChange(parts);
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

    get pickerOpen() {
        return this.#picker.open;
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
                if (this.isSettingsView) return this.#settings.prepare(context);
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
            context.heading = _loc("PLAYLISTENCHANTMENT.STUDIO.searchResults");
            context.empty = !context.tracks.length;
            return context;
        }
        if (!playlist) {
            context.placeholder = _loc("PLAYLISTENCHANTMENT.STUDIO.selectPlaylist");
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
            context.heading = _loc("PLAYLISTENCHANTMENT.STUDIO.searchResults");
            context.columns = SoundboardService.boardConfig(this.selectedBoard).columns;
            context.pads = Librarian.searchAll({ ...filter, boards: true }).map((sound) => this.#padContext(sound));
            context.empty = !context.pads.length;
            return context;
        }

        const board = this.selectedBoard;
        if (!board) {
            context.placeholder = _loc("PLAYLISTENCHANTMENT.STUDIO.selectBoard");
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
            const times = StudioTicker.progress(current);
            context.track = this.#trackContext(current, { showSource: true });
            context.elapsed = times.elapsed;
            context.duration = times.duration;
            context.progress = times.progress;
            context.seekMax = times.seekMax;
            context.seekValue = times.seekValue;
            context.canSeek = times.canSeek;
            context.isPlaying = times.isPlaying;
        }
        context.picker = this.#picker.prepare((sound, options) => this.#trackContext(sound, options));
        return context;
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
                ? _loc("PLAYLISTENCHANTMENT.LIBRARY.usedIn", {
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
            volume: foundry.audio.AudioHelper.volumeToInput(config.volume),
            canControl: Permissions.canControl(sound.parent),
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
        this.#layout.applyClasses(frame);
        return frame;
    }

    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);
        this.#bindListeners();
        this.#bindContextMenus();
        this.#ticker.start();
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        Theme.apply(this.element);
        this.#tagger.sync(this.element);
        this.#layout.sync();
        this.#bindContextMenus();
        this.#flushRevealScroll();
    }

    #flushRevealScroll() {
        const id = this.#pendingRevealSoundId;
        if (!id) return;
        this.#pendingRevealSoundId = null;
        requestAnimationFrame(() => this.#scrollSoundIntoView(id));
    }

    _onPosition(position) {
        super._onPosition(position);
        this.#layout.onPosition(position);
    }

    _onClose(options) {
        super._onClose(options);
        this.#ticker.destroy();
        this.#unbindPickerListeners();
        this.#picker.destroy();
        this.#tagger.destroy();
        this.#settings.destroy();
        this.#layout.destroy();
        this.#dragging = false;
        this.#listenersBound = false;
        this.saveState();
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
        root.addEventListener("dragstart", (event) => this.#onDragStart(event));
        root.addEventListener("dragover", (event) => this.#onDragOver(event));
        root.addEventListener("dragleave", (event) => this.#onDragLeave(event));
        root.addEventListener("dragend", (event) => this.#onDragEnd(event));
        root.addEventListener("drop", (event) => this.#onDrop(event));
        document.addEventListener("keydown", this.#onDocumentKeydown, true);
        this.#layout.bind(root);
        this.#tagger.bind(root);
        this.#picker.bind();

        this.#listenersBound = true;
    }

    #unbindPickerListeners() {
        document.removeEventListener("keydown", this.#onDocumentKeydown, true);
        this.#tagger.unbind(this.element);
        this.#layout.unbind(this.element);
    }

    #onDocumentKeydown = (event) => {
        if (event.code !== "Escape") return;
        if (this.#picker.handleEscape(event)) return;
        this.#tagger.handleEscape(event);
    };

    #onInput(event) {
        const target = event.target;
        if (target.matches(".pe-search")) {
            this.#debouncedSearch(target.value);
        }
        if (target.matches(".pe-picker-search")) {
            this.#picker.onSearch(target.value);
        }
        if (target.matches(".pe-volume")) this.#onVolumeInput(target);
    }

    #onVolumeInput(slider) {
        const sound = this.#soundFrom(slider);
        if (!sound) return;
        const { inputToVolume, volumeToPercentage } = foundry.audio.AudioHelper;
        const volume = inputToVolume(slider.value);
        const tooltip = volumeToPercentage(slider.value);
        slider.dataset.tooltip = tooltip;
        slider.ariaValueText = volumeToPercentage(slider.value, { label: true });
        game.tooltip?.activate(slider, { text: tooltip });
        PlaybackService.setVolume(sound, volume);
        if (SoundboardService.isBoard(sound.parent)) SoundboardService.persistVolume(sound, volume);
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
            return this.#settings.onChange(target);
        }

        if (target.matches(".pe-seek")) {
            return this.#ticker.onSeek(target);
        }
    }

    #onDoubleClick(event) {
        const row = event.target.closest(".pe-track");
        if (!row) return;
        const sound = this.#soundFrom(row);
        if (sound) PlaybackService.playOrCrossFade(sound.parent, sound);
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

    /* -------------------------------------------- */
    /*  Drag and drop                               */
    /* -------------------------------------------- */

    #onDragStart(event) {
        if (event.target.closest("input, .pe-volume")) {
            event.preventDefault();
            return;
        }

        this.#dragging = true;
        if (this.#tagger.onDragStart(event)) return;

        const row = event.target.closest("[data-sound-id]");
        if (!row) return;
        const sound = this.#soundFrom(row);
        if (!sound) return;
        event.dataTransfer.setData("text/plain", JSON.stringify(sound.toDragData()));
        event.dataTransfer.effectAllowed = "copy";
    }

    #onDragEnd(event) {
        this.#dragging = false;
        this.#tagger.onDragEnd(event);
        this.element?.classList.remove("pe-file-hover");
        this.flushDeferredRefresh();
    }

    #onDragOver(event) {
        if (this.#tagger.onDragOver(event)) return;

        if (this.#isFileDrag(event)) {
            event.preventDefault();
            this.element.classList.add("pe-file-hover");
        }

        const target = event.target.closest(".pe-drop-target");
        if (!target) return;
        event.preventDefault();
        target.classList.add("pe-drop-hover");
    }

    #isFileDrag(event) {
        return [...(event.dataTransfer?.types ?? [])].includes("Files") && Permissions.canUpload();
    }

    #onDragLeave(event) {
        this.#tagger.onDragLeave(event);
        if (!this.element.contains(event.relatedTarget)) this.element.classList.remove("pe-file-hover");
        const target = event.target.closest(".pe-drop-target");
        if (!target || target.contains(event.relatedTarget)) return;
        target.classList.remove("pe-drop-hover");
    }

    async #onDrop(event) {
        this.element.classList.remove("pe-file-hover");
        const target = event.target.closest(".pe-drop-target");
        target?.classList.remove("pe-drop-hover");
        if (await this.#tagger.onDrop(event)) return;

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
        this.saveState();
        this.render({ parts: ["header", "browser", "content"] });
    }

    static _onToggleFolder(_event, target) {
        const id = target.closest("[data-folder-id]")?.dataset.folderId;
        if (!id) return;
        const collapsed = new Set(this.#state.collapsedFolders ?? []);
        if (collapsed.has(id)) collapsed.delete(id);
        else collapsed.add(id);
        this.#state.collapsedFolders = [...collapsed];
        this.saveState();
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
        this.saveState();
        this.render({ parts: ["browser"] });
    }

    static _onToggleBrowser() {
        return this.#layout.toggleBrowser();
    }

    static _onToggleRail() {
        return this.#layout.toggleRail();
    }

    static async _onTogglePin(event, target) {
        event.stopPropagation();
        const folderId = target.dataset.folderId;
        const pinned = folderId ? game.folders.get(folderId) : this.#playlistFrom(target);
        if (!pinned) return;
        await Librarian.togglePin(pinned);
        this.render({ parts: ["browser"] });
    }

    static _onToggleTag(event, target) {
        const tag = target.dataset.tag;
        if (!tag) return;
        if (this.#tagger.painting || this.#tagger.recentlyDragged()) return;
        if (this.#tags.has(tag)) this.#tags.delete(tag);
        else this.#tags.add(tag);
        this.render({ parts: ["header", "browser", "content"] });
    }

    onExternalChange(parts) {
        if (!this.rendered) return;
        if (this.#dragging || this.#tagger.busy) {
            this.#refreshQueued = true;
            return;
        }
        this.render(parts ? { parts } : {});
    }

    flushDeferredRefresh() {
        if (!this.#refreshQueued || this.#tagger.busy || !this.rendered) return;
        this.#refreshQueued = false;
        this.render();
    }

    static _onToggleChannel(_event, target) {
        const channel = target.dataset.channel;
        if (this.#channels.has(channel)) this.#channels.delete(channel);
        else this.#channels.add(channel);
        this.render({ parts: ["header", "browser", "content"] });
    }

    static async _onToggleCompact() {
        this.#picker.end();
        if (!this.isCompact) this.#mixerOpen = false;
        return this.#layout.toggleCompact();
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

    /* -------------------------------------------- */
    /*  Actions - playback                          */
    /* -------------------------------------------- */

    static _onRevealPlaylist(_event, target) {
        if (this.isCompact) return this.#picker.toggle();
        const sound = this.#soundFrom(target);
        const playlist = QueueService.originPlaylist(sound) ?? this.#playlistFrom(target);
        if (!playlist || QueueService.isQueue(playlist)) return;
        this.showPlaylist(playlist, sound);
    }

    static async _onPlayPickerTrack(_event, target) {
        return this.#picker.play(target);
    }

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
        this.fitCompact();
    }

    static async _onUntag(event, target) {
        return this.#tagger.untag(event, target);
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
            window: { title: "PLAYLISTENCHANTMENT.LIBRARY.removeTrack" },
            content: `<p>${_loc("PLAYLISTENCHANTMENT.LIBRARY.removeTrackHint", { track: sound.name })}</p>`,
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

    static _onAddTag() {
        return this.#settings.addTag();
    }

    static _onRemoveTag(_event, target) {
        return this.#settings.removeTag(target);
    }

    static _onResetTags() {
        return this.#settings.resetTags();
    }

    static _onCaptureHotkey() {
        return this.#settings.captureHotkey();
    }

    static _onSaveHotkey() {
        return this.#settings.saveHotkey();
    }

    static _onClearHotkey() {
        return this.#settings.clearHotkey();
    }

    static _onBrowseUploadFolder() {
        return this.#settings.browseUploadFolder();
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
        const label = _loc(labelKey);
        return foundry.applications.api.DialogV2.prompt({
            window: { title: labelKey },
            content: `<input type="text" name="name" value="${label}" autofocus />`,
            ok: {
                label: "PLAYLISTENCHANTMENT.create",
                callback: (_event, button) => button.form.elements.name.value.trim(),
            },
            rejectClose: false,
        });
    }
}
