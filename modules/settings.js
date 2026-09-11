export const MODULE = "playlistenchantment";

export class Settings {
    static get MODULE() {
        return MODULE;
    }

    static WORLD_DEFAULTS = {
        normalize: false,
        normalizeModifier: 0.5,
        fadeModifier: 500,
        alwaysFade: false,
        playListLoopEnabled: false,
        autoCombatSwitch: false,
        combatPlaylists: [],
        channelFade: {
            music: true,
            environment: false,
            interface: false,
        },
        channelSettings: {
            music: { fade: true, fadeModifier: 500, normalize: false, normalizeModifier: 0.5 },
            environment: { fade: false, fadeModifier: 500, normalize: false, normalizeModifier: 0.5 },
            interface: { fade: false, fadeModifier: 500, normalize: false, normalizeModifier: 0.5 },
        },
    };

    static register() {
        game.settings.register(MODULE, "settings", {
            name: "playlistsettings",
            scope: "world",
            config: false,
            default: foundry.utils.deepClone(this.WORLD_DEFAULTS),
            type: Object,
        });

        game.settings.register(MODULE, "soundUploadFolder", {
            name: "PLAYLISTENCHANTMENT.soundUploadFolder",
            hint: "PLAYLISTENCHANTMENT.soundUploadFolderHint",
            scope: "world",
            config: true,
            type: String,
            filePicker: "folder",
            default: "modules/playlistenchantment/storage",
        });

        game.settings.register(MODULE, "queueEnabled", {
            name: "PLAYLISTENCHANTMENT.SETTINGS.queueEnabled",
            hint: "PLAYLISTENCHANTMENT.SETTINGS.queueEnabledHint",
            scope: "world",
            config: true,
            type: Boolean,
            default: true,
        });

        game.settings.register(MODULE, "queueTakeover", {
            name: "PLAYLISTENCHANTMENT.SETTINGS.queueTakeover",
            hint: "PLAYLISTENCHANTMENT.SETTINGS.queueTakeoverHint",
            scope: "world",
            config: true,
            type: Boolean,
            default: true,
        });

        game.settings.register(MODULE, "playerQueue", {
            name: "PLAYLISTENCHANTMENT.SETTINGS.playerQueue",
            hint: "PLAYLISTENCHANTMENT.SETTINGS.playerQueueHint",
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
        });

        game.settings.register(MODULE, "notifyGm", {
            name: "PLAYLISTENCHANTMENT.SETTINGS.notifyGm",
            hint: "PLAYLISTENCHANTMENT.SETTINGS.notifyGmHint",
            scope: "world",
            config: true,
            type: Boolean,
            default: true,
        });

        game.settings.register(MODULE, "announceChat", {
            name: "PLAYLISTENCHANTMENT.SETTINGS.announceChat",
            hint: "PLAYLISTENCHANTMENT.SETTINGS.announceChatHint",
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
        });

        game.settings.register(MODULE, "duckLevel", {
            name: "PLAYLISTENCHANTMENT.SETTINGS.duckLevel",
            hint: "PLAYLISTENCHANTMENT.SETTINGS.duckLevelHint",
            scope: "world",
            config: true,
            type: Number,
            range: { min: 0, max: 1, step: 0.05 },
            default: 0.3,
        });

        game.settings.register(MODULE, "duckFade", {
            name: "PLAYLISTENCHANTMENT.SETTINGS.duckFade",
            hint: "PLAYLISTENCHANTMENT.SETTINGS.duckFadeHint",
            scope: "world",
            config: true,
            type: Number,
            range: { min: 0, max: 2000, step: 50 },
            default: 300,
        });

        game.settings.register(MODULE, "announceTracks", {
            name: "PLAYLISTENCHANTMENT.SETTINGS.announceTracks",
            hint: "PLAYLISTENCHANTMENT.SETTINGS.announceTracksHint",
            scope: "client",
            config: true,
            type: Boolean,
            default: false,
        });

        game.settings.register(MODULE, "enchantmentStyle", {
            name: "PLAYLISTENCHANTMENT.SETTINGS.enchantmentStyle",
            hint: "PLAYLISTENCHANTMENT.SETTINGS.enchantmentStyleHint",
            scope: "client",
            config: true,
            type: Boolean,
            default: true,
            onChange: () => {
                import("./core/theme.js").then(({ Theme }) => Theme.refresh());
            },
        });

        game.settings.register(MODULE, "tagLibrary", {
            scope: "world",
            config: false,
            type: Array,
            default: [],
        });

        game.settings.register(MODULE, "pinnedPlaylists", {
            scope: "client",
            config: false,
            type: Array,
            default: [],
        });

        game.settings.register(MODULE, "pinnedFolders", {
            scope: "client",
            config: false,
            type: Array,
            default: [],
        });

        game.settings.register(MODULE, "collapsedFolders", {
            scope: "client",
            config: false,
            type: Array,
            default: [],
        });

        game.settings.register(MODULE, "studioPosition", {
            scope: "client",
            config: false,
            type: Object,
            default: {},
        });

        game.settings.register(MODULE, "studioState", {
            scope: "client",
            config: false,
            type: Object,
            default: {},
        });

        game.settings.register(MODULE, "lastUploadFolder", {
            scope: "client",
            config: false,
            type: String,
            default: "",
        });

        game.settings.register(MODULE, "seekWarningAck", {
            scope: "client",
            config: false,
            type: Boolean,
            default: false,
        });
    }

    static STUDIO_KEYBINDING = "openStudio";

    static registerKeybindings() {
        game.keybindings.register(MODULE, this.STUDIO_KEYBINDING, {
            name: "PLAYLISTENCHANTMENT.KEYBINDINGS.openStudio",
            hint: "PLAYLISTENCHANTMENT.KEYBINDINGS.openStudioHint",
            editable: [],
            restricted: false,
            onDown: () => {
                import("./apps/studio/studio.js").then(({ Studio }) => Studio.toggle());
                return true;
            },
        });
    }

    /* -------------------------------------------- */
    /*  The Studio keybinding                       */
    /* -------------------------------------------- */

    static studioBinding() {
        return game.keybindings.get(MODULE, this.STUDIO_KEYBINDING)?.[0] ?? null;
    }

    static studioBindingLabel() {
        return this.humanizeBinding(this.studioBinding());
    }

    static humanizeBinding(binding) {
        if (!binding?.key) return "";
        const controls = foundry.applications.sidebar.apps.ControlsConfig;
        return controls?.humanizeBinding?.(binding) ?? binding.key;
    }

    static async setStudioBinding(binding) {
        await game.keybindings.set(MODULE, this.STUDIO_KEYBINDING, binding ? [binding] : []);
        ui.playlists?.render({ parts: ["controls"] });
    }

    static conflictingActions(binding) {
        if (!binding?.key) return [];
        const KeyboardManager = game.keyboard.constructor;
        const actionId = `${MODULE}.${this.STUDIO_KEYBINDING}`;
        const modifiers = binding.modifiers ?? [];
        const context = KeyboardManager.getKeyboardEventContext({
            code: binding.key,
            shiftKey: modifiers.includes(KeyboardManager.MODIFIER_KEYS.SHIFT),
            ctrlKey: modifiers.includes(KeyboardManager.MODIFIER_KEYS.CONTROL),
            altKey: modifiers.includes(KeyboardManager.MODIFIER_KEYS.ALT),
            repeat: false,
        });
        return KeyboardManager._getMatchingActions(context)
            .filter((match) => match.action !== actionId)
            .map((match) => _loc(match.name));
    }

    static conflictMessage(binding) {
        const conflicts = this.conflictingActions(binding);
        if (!conflicts.length) return "";
        return _loc("KEYBINDINGS.Conflict", {
            conflicts: game.i18n.getListFormatter().format(conflicts),
        });
    }

    static bindingFromEvent(event) {
        const keyboard = game.keyboard.constructor;
        const { MODIFIER_KEYS, MODIFIER_CODES } = keyboard;
        const context = keyboard.getKeyboardEventContext(event);
        if (Object.values(MODIFIER_CODES).some((codes) => codes.includes(context.key))) return null;

        const binding = { key: context.key, logicalKey: context.logicalKey, modifiers: [] };
        if (context.isAlt) binding.modifiers.push(MODIFIER_KEYS.ALT);
        if (context.isShift) binding.modifiers.push(MODIFIER_KEYS.SHIFT);
        if (context.isControl) binding.modifiers.push(MODIFIER_KEYS.CONTROL);
        return binding;
    }

    static get(key) {
        return game.settings.get(MODULE, key);
    }

    static async set(key, value) {
        return game.settings.set(MODULE, key, value);
    }

    static get world() {
        return game.settings.get(MODULE, "settings");
    }

    static async updateWorld(data) {
        const settings = foundry.utils.mergeObject(this.world, data);
        return game.settings.set(MODULE, "settings", settings);
    }

    static async migrate() {
        if (!game.user.isActiveGM) return;
        const settings = this.world;
        let dirty = false;

        if ((settings.channelControlsV ?? 0) < 1) {
            const channelSettings = settings.channelSettings ?? {};
            for (const id of ["environment", "interface"]) {
                channelSettings[id] = { ...channelSettings[id], fade: false, normalize: false };
            }
            settings.channelSettings = channelSettings;
            settings.channelControlsV = 1;
            dirty = true;
        }

        if (dirty) await game.settings.set(MODULE, "settings", settings);
    }
}
