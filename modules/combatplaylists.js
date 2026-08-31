import { EnchantedPlaylist } from "./enchantedplaylist.js";

export class CombatPlaylistManager {
    static previousPlaying = [];
    static combatSwitchActive = false;

    static registerHooks() {
        Hooks.on("createCombat", this._onCreateCombat.bind(this));
        Hooks.on("combatStart", this._onCombatStart.bind(this));
        Hooks.on("deleteCombat", this._onDeleteCombat.bind(this));
    }

    static getSettings() {
        return game.settings.get("playlistenchantment", "settings");
    }

    static get autoCombatSwitch() {
        return this.getSettings().autoCombatSwitch ?? false;
    }

    static get combatPlaylists() {
        return this.getSettings().combatPlaylists ?? [];
    }

    static isMusicPlaylist(playlist) {
        return !!playlist
            && playlist.mode >= CONST.PLAYLIST_MODES.SEQUENTIAL
            && (playlist.channel || "music") === "music";
    }

    static getAvailableCombatPlaylists() {
        return this.combatPlaylists.filter((id) => {
            const playlist = game.playlists.get(id);
            return this.isMusicPlaylist(playlist);
        });
    }

    static async _onCreateCombat(combat, options, userId) {
        if (!game.user.isActiveGM) return;
        await this._switchToCombatMusic();
    }

    static async _onCombatStart(combat, updateData) {
        if (!game.user.isActiveGM) return;
        if (this.combatSwitchActive) return;
        await this._switchToCombatMusic();
    }

    static captureMusicState() {
        return game.playlists
            .filter((p) => this.isMusicPlaylist(p) && p.playing)
            .map((p) => {
                const sound = p.sounds.find((s) => s.playing);
                return {
                    playlistId: p.id,
                    soundId: sound?.id ?? null,
                    pausedTime: sound?.sound?.currentTime ?? sound?.pausedTime ?? null,
                };
            });
    }

    static async restoreMusicState(saved) {
        if (!saved?.length) return;

        const { fadeModifier } = EnchantedPlaylist.getFadeSettings();
        for (const entry of saved) {
            const playlist = game.playlists.get(entry.playlistId);
            if (!this.isMusicPlaylist(playlist)) continue;

            const sound = entry.soundId ? playlist.sounds.get(entry.soundId) : null;
            if (sound && entry.pausedTime != null) {
                await sound.update({ pausedTime: entry.pausedTime });
            }
            await EnchantedPlaylist.fadeIn(playlist, fadeModifier, sound);
        }
    }

    static async _switchToCombatMusic() {
        if (!this.autoCombatSwitch) return;
        if (this.combatSwitchActive) return;

        const playlistIds = this.getAvailableCombatPlaylists();
        if (playlistIds.length === 0) return;

        this.previousPlaying = this.captureMusicState();
        this.combatSwitchActive = true;

        const randomId = playlistIds[Math.floor(Math.random() * playlistIds.length)];
        const playlist = game.playlists.get(randomId);
        await EnchantedPlaylist.crossFade(playlist.uuid);
    }

    static async _onDeleteCombat(combat, options, userId) {
        if (!game.user.isActiveGM) return;
        if (!this.combatSwitchActive) return;

        const saved = this.previousPlaying;
        this.previousPlaying = [];
        this.combatSwitchActive = false;

        const { fadeModifier } = EnchantedPlaylist.getFadeSettings();

        for (const playlist of game.playlists) {
            if (this.isMusicPlaylist(playlist) && playlist.playing) {
                EnchantedPlaylist.fadeOut(playlist, fadeModifier, true);
            }
        }

        if (!saved?.length) return;

        await new Promise((resolve) => setTimeout(resolve, fadeModifier));
        await this.restoreMusicState(saved);
    }

    static prepareCombatTree(selected) {
        const prepareNode = (node) => {
            const entries = (node.entries ?? [])
                .filter((playlist) => CombatPlaylistManager.isMusicPlaylist(playlist))
                .map((playlist) => ({
                    id: playlist.id,
                    name: playlist.name,
                    checked: selected.includes(playlist.id),
                }));

            const children = (node.children ?? [])
                .map((child) => prepareNode(child))
                .filter((child) => child.hasContent);

            return {
                folder: node.folder,
                depth: node.depth,
                entries,
                children,
                hasContent: entries.length > 0 || children.length > 0,
            };
        };

        return prepareNode(game.playlists.tree);
    }
}

export class CombatPlaylistConfig extends foundry.applications.api.HandlebarsApplicationMixin(
    foundry.applications.api.ApplicationV2
) {
    static DEFAULT_OPTIONS = {
        id: "combat-playlist-config",
        classes: ["playlistenchantment-combat-config", "playlists-sidebar", "directory"],
        window: {
            title: "PLAYLISTENCHANTMENT.CombatConfigTitle",
        },
        actions: {
            save: this._onSave,
            toggleFolder: this._onToggleFolder,
        },
    };

    static PARTS = {
        main: {
            template: "modules/playlistenchantment/templates/combatplaylists/config.hbs",
            templates: [
                "modules/playlistenchantment/templates/combatplaylists/folder-partial.hbs",
                "modules/playlistenchantment/templates/combatplaylists/entry-partial.hbs",
            ],
            scrollable: [""],
        },
    };

    async _prepareContext(_options) {
        const data = await super._prepareContext(_options);
        const selected = game.settings.get("playlistenchantment", "settings").combatPlaylists ?? [];
        data.tree = CombatPlaylistManager.prepareCombatTree(selected);
        return data;
    }

    static _onToggleFolder(_event, target) {
        const folder = target.closest(".directory-item.folder");
        if (!folder) return;

        folder.classList.toggle("expanded");
        const expanded = folder.classList.contains("expanded");
        const { uuid } = folder.dataset;

        if (expanded) game.folders._expanded[uuid] = true;
        else delete game.folders._expanded[uuid];

        if (!expanded) {
            for (const subfolder of folder.querySelectorAll(".directory-item.folder")) {
                subfolder.classList.remove("expanded");
                delete game.folders._expanded[subfolder.dataset.uuid];
            }
        }
    }

    static async _onSave(_event, _target) {
        const form = this.element.querySelector("form");
        const combatPlaylists = Array.from(form.querySelectorAll('input[name="combatPlaylists"]:checked'))
            .map((input) => input.value);

        const settings = foundry.utils.mergeObject(
            game.settings.get("playlistenchantment", "settings"),
            { combatPlaylists }
        );
        await game.settings.set("playlistenchantment", "settings", settings);
        await this.close();
        ui.playlists.render();
    }
}
