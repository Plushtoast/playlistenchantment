import { MODULE, Settings } from "../settings.js";

export class Permissions {
    static DJ_FLAG = "dj";

    static canControl(playlist) {
        return playlist?.isOwner === true;
    }

    static canEdit(playlist) {
        return playlist?.isOwner === true;
    }

    static canCreatePlaylist() {
        return game.user.can("PLAYLIST_CREATE");
    }

    static canUpload() {
        return game.user.can("FILES_UPLOAD");
    }

    static canBrowseFiles() {
        return game.user.can("FILES_BROWSE");
    }

    static canRelay() {
        return game.user.hasPermission("QUERY_USER") && !!game.users.activeGM;
    }

    static canQueue() {
        if (!Settings.get("queueEnabled")) return false;
        if (game.user.isGM) return true;
        if (!Settings.get("playerQueue")) return false;
        return this.canRelay();
    }

    static isDJ(playlist, user = game.user) {
        if (!playlist || user.isGM) return false;
        return playlist.testUserPermission(user, "OWNER");
    }

    static djUsers(playlist) {
        if (!playlist) return [];
        return game.users.filter((user) => !user.isGM && playlist.testUserPermission(user, "OWNER"));
    }

    static hasDJs(playlist) {
        return this.djUsers(playlist).length > 0;
    }

    static async grantDJ(playlist, userIds) {
        if (!game.user.isGM) return;
        const ownership = foundry.utils.deepClone(playlist.ownership ?? {});
        const granted = new Set(playlist.getFlag(MODULE, this.DJ_FLAG)?.grantedTo ?? []);
        for (const userId of userIds) {
            ownership[userId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
            granted.add(userId);
        }
        await playlist.update({
            ownership,
            [`flags.${MODULE}.${this.DJ_FLAG}`]: { grantedTo: [...granted], grantedBy: game.userId },
        });
        const names = userIds.map((id) => game.users.get(id)?.name).filter(Boolean).join(", ");
        ui.notifications.info(game.i18n.format("PLAYLISTENCHANTMENT.DJ.granted", { users: names, playlist: playlist.name }));
    }

    static async revokeDJ(playlist, userId) {
        if (!game.user.isGM) return;
        const granted = (playlist.getFlag(MODULE, this.DJ_FLAG)?.grantedTo ?? []).filter((id) => id !== userId);
        await playlist.update({
            [`ownership.-=${userId}`]: null,
            [`flags.${MODULE}.${this.DJ_FLAG}`]: { grantedTo: granted, grantedBy: game.userId },
        });
        ui.notifications.info(
            game.i18n.format("PLAYLISTENCHANTMENT.DJ.revoked", {
                user: game.users.get(userId)?.name ?? userId,
                playlist: playlist.name,
            })
        );
    }

    static async revokeAllDJ(playlist) {
        for (const user of this.djUsers(playlist)) await this.revokeDJ(playlist, user.id);
    }

    static controllablePlaylists() {
        return game.playlists.filter((playlist) => this.canControl(playlist));
    }
}
