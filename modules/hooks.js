import { MODULE } from "./settings.js";
import { AudioChannels } from "./core/audiochannels.js";
import { Announcer } from "./core/announceservice.js";
import { FadeService } from "./core/fadeservice.js";
import { Librarian } from "./core/librarian.js";
import { Permissions } from "./core/permissionservice.js";
import { QueueService } from "./core/queueservice.js";
import { SoundboardService } from "./core/soundboardservice.js";
import { Tags } from "./core/tagservice.js";
import { Theme } from "./core/theme.js";
import { TrackIndex } from "./core/trackindex.js";
import { CombatPlaylistManager } from "./apps/combatplaylists.js";
import { EnchantedPlaylist } from "./apps/enchantedplaylist.js";
import { EnchantmentPopup } from "./apps/enchantmentpopup.js";
import { SoundPreview } from "./apps/soundpreview.js";
import { DJDialog } from "./apps/djdialog.js";
import { Studio } from "./apps/studio/studio.js";

const { getProperty } = foundry.utils;

export function setupHooks() {
    registerHotbarHooks();
    registerCanvasHooks();
    registerContextMenus();
    registerDocumentHooks();
    registerAppearanceHooks();
    CombatPlaylistManager.registerHooks();
}

/* -------------------------------------------- */
/*  Appearance                                  */
/* -------------------------------------------- */

function registerAppearanceHooks() {
    Hooks.on("renderApplicationV2", (_app, element) => Theme.apply(element));
}

/* -------------------------------------------- */
/*  Canvas                                      */
/* -------------------------------------------- */

function registerCanvasHooks() {
    Hooks.on("dropCanvasData", (_canvas, data) => {
        if (data.type !== "PlaylistSound") return;
        if (!game.user.can("SCENE_CONFIGURE")) return;
        if (canvas.activeLayer !== canvas.sounds) canvas.sounds.activate();
    });
}

/* -------------------------------------------- */
/*  Hotbar                                      */
/* -------------------------------------------- */

function registerHotbarHooks() {
    Hooks.on("hotbarDrop", (bar, data, slot) => {
        if (data.type === EnchantedPlaylist.STUDIO_DRAG_TYPE) {
            buildStudioMacro(slot);
            return false;
        }
        if (data.type === Studio.TAG_DRAG_TYPE) {
            buildTagMacro(data.tag, slot);
            return false;
        }
        if (["PlaylistSound", "Playlist"].includes(data.type)) {
            buildPlaylistMacro(data.uuid, slot);
            return false;
        }
        if (data.type === "Folder") {
            const folder = fromUuidSync(data.uuid);
            if (folder?.type === "Playlist") {
                buildPlaylistMacro(data.uuid, slot);
                return false;
            }
        }
    });

    Hooks.on("renderHotbar", (bar, html) => {
        const macros = $(html).find(".slot.full");
        macros.mouseenter((ev) => onHoverMacros(ev));
        macros.mouseleave((ev) => onUnhoverMacros(ev));
        macros.mousedown((ev) => onUnhoverMacros(ev));
    });
}

async function togglePin(header) {
    await Librarian.togglePin(playlistFromElement(header));
    Studio.refresh();
}

function buildStudioMacro(slot) {
    const command = `game.modules.get("${MODULE}").api.Studio.toggle()`;
    createHotBarMacro(command, _loc("PLAYLISTENCHANTMENT.STUDIO.title"), "icons/svg/sound.svg", slot, "Studio");
}

function buildTagMacro(tag, slot) {
    const command = `game.modules.get("${MODULE}").api.Librarian.playRandomTagged("${tag}")`;
    const name = _loc("PLAYLISTENCHANTMENT.LIBRARY.tagMacro", { tag: Tags.get(tag).label });
    createHotBarMacro(command, name, "icons/svg/sound.svg", slot, "Tag");
}

async function buildPlaylistMacro(uuid, slot) {
    const playlist = await fromUuid(uuid);
    const command = `CONFIG.ui.playlists.hotbarPlaylist("${uuid}")`;
    createHotBarMacro(command, playlist.name, "icons/svg/sound.svg", slot, "Playlist");
}

function createHotBarMacro(command, name, img, slot, type) {
    const existing = game.macros.contents.find((m) => m.name === name && m.command === command);
    if (existing) {
        game.user.assignHotbarMacro(existing, slot);
        return false;
    }
    foundry.documents.Macro.create(
        {
            name,
            type: "script",
            img,
            command,
            flags: { enchantedplaylist: { type } },
        },
        { displaySheet: false }
    ).then((macro) => game.user.assignHotbarMacro(macro, slot));
    return false;
}

function onHoverMacros(ev) {
    const slot = ev.currentTarget.dataset.slot;
    const macroId = game.user.hotbar[slot];
    if (!macroId) return;
    const macro = game.macros.get(macroId);
    if (!macro) return;
    if (!getProperty(macro, "flags.enchantedplaylist.type")) return;
    showHotbarSoundMenu(ev, macroId);
}

async function showHotbarSoundMenu(ev, macroId) {
    $(".enchantment-popup").remove();

    const target = ev.currentTarget;
    const rect = target.getBoundingClientRect();
    const popup = new EnchantmentPopup(target, macroId);
    ui.enchantmentPopup = popup;
    await popup.render(true);

    const element = $(popup.element);
    popup.setPosition({ left: rect.x - 135 + rect.width / 2, top: rect.y - element.height() });

    $(target)
        .off("mouseleave")
        .on("mouseleave", () => onUnhoverMacros(popup));
    element.on("mouseleave", () => onUnhoverMacros(popup));

    game.tooltip.deactivate();
}

function onUnhoverMacros(popup) {
    setTimeout(() => {
        if (popup?.element && !$(popup.element).is(":hover")) popup.close({ animate: false });
    }, 100);
}

/* -------------------------------------------- */
/*  Context menus                               */
/* -------------------------------------------- */

function registerContextMenus() {
    Hooks.on("getPlaylistSoundContextOptions", (app, options) => {
        options.push(
            {
                label: "PLAYLISTENCHANTMENT.Prehear",
                icon: "fa-solid fa-headphones",
                visible: (li) => !!soundFromElement(li),
                onClick: (_event, li) => SoundPreview.open(soundFromElement(li)),
            },
            {
                label: "PLAYLISTENCHANTMENT.QUEUE.add",
                icon: "fa-solid fa-list-ol",
                visible: (li) => QueueService.enabled && Permissions.canQueue() && !!soundFromElement(li),
                onClick: (_event, li) => QueueService.enqueue(soundFromElement(li)),
            },
            {
                label: "PLAYLISTENCHANTMENT.STUDIO.openHere",
                icon: "fa-solid fa-wand-magic-sparkles",
                visible: (li) => !!soundFromElement(li),
                onClick: (_event, li) => Studio.open({ playlist: soundFromElement(li)?.parent }),
            }
        );
    });

    Hooks.on("getPlaylistContextOptions", (app, options) => {
        options.push(
            {
                label: "PLAYLISTENCHANTMENT.STUDIO.openHere",
                icon: "fa-solid fa-wand-magic-sparkles",
                visible: (header) => !!playlistFromElement(header),
                onClick: (_event, header) => Studio.open({ playlist: playlistFromElement(header) }),
            },
            {
                label: "PLAYLISTENCHANTMENT.LIBRARY.pin",
                icon: "fa-solid fa-thumbtack",
                visible: (header) => {
                    const playlist = playlistFromElement(header);
                    return !!playlist && !Librarian.isPinned(playlist);
                },
                onClick: (_event, header) => togglePin(header),
            },
            {
                label: "PLAYLISTENCHANTMENT.LIBRARY.unpin",
                icon: "fa-solid fa-thumbtack-slash",
                visible: (header) => Librarian.isPinned(playlistFromElement(header)),
                onClick: (_event, header) => togglePin(header),
            },
            {
                label: "PLAYLISTENCHANTMENT.DJ.manage",
                icon: "fa-solid fa-headphones",
                visible: () => game.user.isGM,
                onClick: (_event, header) => new DJDialog(playlistFromElement(header)).render(true),
            },
            {
                label: "PLAYLISTENCHANTMENT.BOARD.convert",
                icon: "fa-solid fa-grip",
                visible: (header) => {
                    const playlist = playlistFromElement(header);
                    return !!playlist?.isOwner && !SoundboardService.isBoard(playlist);
                },
                onClick: (_event, header) => SoundboardService.convert(playlistFromElement(header), true),
            }
        );
    });
}

function soundFromElement(element) {
    const node = element?.closest?.("[data-sound-id]") ?? element;
    const { playlistId, soundId } = node?.dataset ?? {};
    return game.playlists.get(playlistId)?.sounds.get(soundId) ?? null;
}

function playlistFromElement(element) {
    const node = element?.closest?.("[data-entry-id], [data-playlist-id]") ?? element;
    const id = node?.dataset?.entryId ?? node?.dataset?.playlistId;
    return game.playlists.get(id) ?? null;
}

/* -------------------------------------------- */
/*  Documents                                   */
/* -------------------------------------------- */

function registerDocumentHooks() {
    Hooks.on("updateSetting", (setting) => {
        if (setting.key !== `${MODULE}.${Tags.SETTING}`) return;
        Tags.invalidate();
        Studio.refresh();
    });

    Hooks.on("preUpdatePlaylist", (playlist, changes) => {
        if (!AudioChannels.isPlaylistPlayback(playlist)) return;
        if (!("sounds" in changes)) return;

        const settings = AudioChannels.get(AudioChannels.playbackChannelOf(playlist));
        if (settings.fade) changes.fade = settings.fadeModifier || 0;
        if (settings.normalize) {
            const sound = changes.sounds.find((s) => s.playing);
            if (sound) sound.volume = settings.normalizeModifier || 0;
        }
        // Core stopAll omits pausedTime, which would leave a stale pause in Currently Playing.
        if (changes.playing === false) {
            for (const sound of changes.sounds) {
                if (sound.playing === false && !("pausedTime" in sound)) sound.pausedTime = null;
            }
        }
    });

    Hooks.on("updatePlaylist", (playlist, changes, _options, userId) => {
        Announcer.onPlayerAction(playlist, changes, userId);
        if (game.userId === userId && playbackStarted(playlist, changes)) {
            FadeService.exclusiveFadeOthers(playlist);
        }
        QueueService.onPlaylistChange(playlist, changes);
        Studio.refresh();
    });

    Hooks.on("updatePlaylistSound", (sound, changes, _options, userId) => {
        Announcer.onPlayerAction(sound, changes, userId);

        if (changes.playing === true) {
            if (game.userId === userId) FadeService.exclusiveFadeOthers(sound.parent, sound);
            Announcer.onTrackStart(sound);
            QueueService.evaluate();
        } else if (changes.playing === false) {
            Announcer.onTrackStop(sound);
        }
        QueueService.onSoundChange(sound, changes);
        Studio.refresh();
    });

    for (const hook of ["createPlaylistSound", "deletePlaylistSound", "createPlaylist", "deletePlaylist"]) {
        Hooks.on(hook, () => {
            TrackIndex.invalidate();
            Studio.refresh();
        });
    }

    for (const hook of ["createFolder", "updateFolder", "deleteFolder"]) {
        Hooks.on(hook, (folder) => {
            if (folder.type === "Playlist") Studio.refresh();
        });
    }

    Hooks.on("renderPlaylistDirectory", () => {
        ui.enchantmentPopup?.render();
    });
}

function playbackStarted(playlist, changes) {
    if (!AudioChannels.isPlaylistPlayback(playlist)) return false;
    if (changes.playing === true) return true;
    return Array.isArray(changes.sounds) && changes.sounds.some((s) => s.playing === true);
}
