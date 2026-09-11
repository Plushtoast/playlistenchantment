import { MODULE, Settings } from "../settings.js";
import { AudioChannels } from "./audiochannels.js";
import { Permissions } from "./permissionservice.js";
import { PlaybackService } from "./playbackservice.js";
import { QueueService } from "./queueservice.js";
import { SoundboardService } from "./soundboardservice.js";
import { TrackIndex } from "./trackindex.js";
import { TrackMeta } from "./trackmeta.js";

export class Librarian {
    /* -------------------------------------------- */
    /*  Tracks                                      */
    /* -------------------------------------------- */

    static async copyTrack(sound, playlist, { sort, allowDuplicate = false } = {}) {
        if (!sound || !playlist) return null;
        if (!Permissions.canEdit(playlist)) {
            ui.notifications.warn(_loc("PLAYLISTENCHANTMENT.errorNoPermission"));
            return null;
        }
        if (!allowDuplicate && this.contains(playlist, sound.path)) {
            ui.notifications.warn(_loc("PLAYLISTENCHANTMENT.LIBRARY.duplicate", { track: sound.name }));
            return null;
        }

        const data = {
            name: sound.name,
            description: sound.description,
            path: sound.path,
            channel: sound.channel,
            volume: sound.volume,
            fade: sound.fade,
            repeat: sound.repeat,
        };
        const meta = sound.getFlag(MODULE, TrackMeta.KEY);
        if (meta) data.flags = { [MODULE]: { [TrackMeta.KEY]: meta } };
        if (sort !== undefined) data.sort = sort;

        const [created] = await playlist.createEmbeddedDocuments("PlaylistSound", [data]);
        return created;
    }

    static async copyTracks(sounds, playlist) {
        const created = [];
        for (const sound of sounds) {
            const copy = await this.copyTrack(sound, playlist);
            if (copy) created.push(copy);
        }
        if (created.length) {
            ui.notifications.info(
                _loc("PLAYLISTENCHANTMENT.LIBRARY.copied", { count: created.length, playlist: playlist.name })
            );
        }
        return created;
    }

    static contains(playlist, path) {
        const key = TrackIndex.key(path);
        return playlist.sounds.some((sound) => TrackIndex.key(sound.path) === key);
    }

    static async reorder(sound, targetSound) {
        const playlist = sound.parent;
        if (!Permissions.canEdit(playlist)) return;
        if (playlist.sorting !== CONST.PLAYLIST_SORT_MODES.MANUAL) {
            await playlist.update({ sorting: CONST.PLAYLIST_SORT_MODES.MANUAL });
        }
        return sound.sortRelative({
            target: targetSound,
            siblings: playlist.sounds.filter((s) => s.id !== sound.id),
        });
    }

    static async removeTrack(sound) {
        if (!Permissions.canEdit(sound?.parent)) return;
        return sound.delete();
    }

    /* -------------------------------------------- */
    /*  Playlists                                   */
    /* -------------------------------------------- */

    static async createPlaylist({ name, folder = null, mode = CONST.PLAYLIST_MODES.SEQUENTIAL, channel = "music" } = {}) {
        if (!Permissions.canCreatePlaylist()) {
            ui.notifications.warn(_loc("PLAYLISTENCHANTMENT.errorNoPermission"));
            return null;
        }
        return foundry.documents.Playlist.create({
            name: name || _loc("PLAYLISTENCHANTMENT.LIBRARY.newPlaylist"),
            folder,
            mode,
            channel,
        });
    }

    static async rename(document, name) {
        if (!name || !Permissions.canEdit(document.documentName === "Playlist" ? document : document.parent)) return;
        return document.update({ name });
    }

    static async deletePlaylist(playlist) {
        if (!Permissions.canEdit(playlist)) return;
        return playlist.deleteDialog();
    }

    /* -------------------------------------------- */
    /*  Folders                                     */
    /* -------------------------------------------- */

    static async createFolder({ name, parent = null } = {}) {
        if (!game.user.can("FOLDER_CREATE")) {
            ui.notifications.warn(_loc("PLAYLISTENCHANTMENT.errorNoPermission"));
            return null;
        }
        return foundry.documents.Folder.create({
            name: name || _loc("PLAYLISTENCHANTMENT.LIBRARY.newFolder"),
            type: "Playlist",
            folder: parent,
        });
    }

    /* -------------------------------------------- */
    /*  Playing by tag                              */
    /* -------------------------------------------- */

    static async playRandomTagged(tag) {
        const matches = this.searchAll({ tags: [tag], boards: false }, 500);
        if (!matches.length) {
            ui.notifications.warn(_loc("PLAYLISTENCHANTMENT.LIBRARY.noTagMatch", { tag }));
            return null;
        }
        const sound = matches[Math.floor(Math.random() * matches.length)];
        await PlaybackService.playOrCrossFade(sound.parent, sound);
        return sound;
    }

    /* -------------------------------------------- */
    /*  Browsing                                    */
    /* -------------------------------------------- */

    static browsablePlaylists({ boards = false } = {}) {
        if (boards) return SoundboardService.visibleBoards();
        return game.playlists.filter((playlist) => {
            if (QueueService.isQueue(playlist)) return false;
            if (SoundboardService.isBoard(playlist)) return false;
            return playlist.isOwner || playlist.playing;
        });
    }

    /* -------------------------------------------- */
    /*  Pinning                                     */
    /* -------------------------------------------- */

    // Pins per-user client-side; players can pin playlists they do not own.
    static pinnedIds(kind = "playlist") {
        return Settings.get(kind === "folder" ? "pinnedFolders" : "pinnedPlaylists") ?? [];
    }

    static isPinned(document) {
        return this.pinnedIds(this.#pinKind(document)).includes(document?.id);
    }

    static async togglePin(document) {
        if (!document) return;
        const kind = this.#pinKind(document);
        const collection = kind === "folder" ? game.folders : game.playlists;
        const pinned = this.pinnedIds(kind).filter((id) => collection.has(id));
        const index = pinned.indexOf(document.id);
        if (index >= 0) pinned.splice(index, 1);
        else pinned.push(document.id);
        return Settings.set(kind === "folder" ? "pinnedFolders" : "pinnedPlaylists", pinned);
    }

    static #pinKind(document) {
        return document?.documentName === "Folder" ? "folder" : "playlist";
    }

    static tree({ boards = false, filter, query = "", tags = [], channels = [] } = {}) {
        const playlists = this.#searchPlaylists(boards)
            .filter((playlist) => !filter || filter(playlist))
            .filter((playlist) => this.playlistMatchesFilter(playlist, { query, tags, channels }));

        const byName = (a, b) => a.name.localeCompare(b.name);
        const byFolder = new Map();
        const loose = [];

        for (const playlist of playlists) {
            if (playlist.folder) {
                if (!byFolder.has(playlist.folder.id)) byFolder.set(playlist.folder.id, []);
                byFolder.get(playlist.folder.id).push(playlist);
            } else loose.push(playlist);
        }

        const folders = this.#folderNodes(null, byFolder, byName);
        const pinnedPlaylists = this.pinnedIds("playlist");
        const pinnedFolders = this.pinnedIds("folder");

        return {
            pinned: {
                folders: this.#collectFolders(folders).filter((node) => pinnedFolders.includes(node.id)),
                playlists: playlists.filter((playlist) => pinnedPlaylists.includes(playlist.id)).sort(byName),
            },
            folders,
            loose: loose.sort(byName),
        };
    }

    static #folderNodes(parentId, byFolder, byName) {
        return game.folders
            .filter((folder) => folder.type === "Playlist" && (folder.folder?.id ?? null) === parentId)
            .sort((a, b) => a.sort - b.sort || byName(a, b))
            .map((folder) => {
                const contents = (byFolder.get(folder.id) ?? []).sort(byName);
                const children = this.#folderNodes(folder.id, byFolder, byName);
                return {
                    id: folder.id,
                    uuid: folder.uuid,
                    name: folder.name,
                    color: folder.color?.css ?? "",
                    tags: TrackMeta.read(folder).tags,
                    pinned: this.pinnedIds("folder").includes(folder.id),
                    canEdit: folder.canUserModify(game.user, "update"),
                    playing: contents.some((playlist) => playlist.playing) || children.some((child) => child.playing),
                    count: contents.length + children.reduce((total, child) => total + child.count, 0),
                    playlists: contents,
                    children,
                };
            })
            .filter((node) => node.count > 0);
    }

    static #collectFolders(nodes) {
        return nodes.flatMap((node) => [node, ...this.#collectFolders(node.children)]);
    }

    static playlistMatchesFilter(playlist, { query = "", tags = [], channels = [] } = {}) {
        if (!playlist) return false;
        if (!query && !tags.length) return AudioChannels.playlistMatches(playlist, channels);

        const sounds = SoundboardService.isBoard(playlist)
            ? SoundboardService.visiblePads(playlist)
            : [...playlist.sounds];
        if (sounds.some((sound) => this.soundMatchesFilter(playlist, sound, { query, tags, channels }))) return true;

        const nameHit = !query || playlist.name.toLowerCase().includes(query.toLowerCase());
        const ownTags = TrackMeta.read(playlist).tags;
        const folderTags = TrackMeta.read(playlist.folder).tags;
        const tagHit = !tags.length || tags.every((tag) => ownTags.includes(tag) || folderTags.includes(tag));
        return nameHit && tagHit && AudioChannels.matches(playlist, null, channels);
    }

    static soundMatchesFilter(playlist, sound, { query = "", tags = [], channels = [] } = {}) {
        if (!AudioChannels.matches(playlist, sound, channels)) return false;
        if (TrackMeta.matches(sound, { query, tags })) return true;
        if (!tags.length) return false;
        const folderTags = TrackMeta.read(playlist.folder).tags;
        if (!tags.every((tag) => folderTags.includes(tag))) return false;
        return TrackMeta.matches(sound, { query, tags: [] });
    }

    static tracksOf(playlist, { query = "", tags = [], channels = [] } = {}) {
        if (!playlist) return [];
        const sounds = [...playlist.sounds].filter((sound) => this.soundMatchesFilter(playlist, sound, { query, tags, channels }));
        if (playlist.sorting === CONST.PLAYLIST_SORT_MODES.ALPHABETICAL) {
            return sounds.sort((a, b) => a.name.localeCompare(b.name));
        }
        return sounds.sort((a, b) => a.sort - b.sort);
    }

    static searchAll({ query = "", tags = [], channels = [], boards } = {}, limit = 200) {
        const results = [];
        const playlists = this.#searchPlaylists(boards);
        for (const playlist of playlists) {
            const sounds = SoundboardService.isBoard(playlist)
                ? SoundboardService.visiblePads(playlist)
                : playlist.sounds;
            for (const sound of sounds) {
                if (!this.soundMatchesFilter(playlist, sound, { query, tags, channels })) continue;
                results.push(sound);
                if (results.length >= limit) return results;
            }
        }
        return results;
    }

    static #searchPlaylists(boards) {
        if (boards === true) return this.browsablePlaylists({ boards: true });
        if (boards === false) return this.browsablePlaylists({ boards: false });
        return [...this.browsablePlaylists({ boards: false }), ...this.browsablePlaylists({ boards: true })];
    }

    static channelOptions(selected) {
        return Object.values(AudioChannels.CHANNELS).map((channel) => ({
            value: channel.id,
            label: _loc(channel.label),
            selected: channel.id === selected,
        }));
    }
}
