import { EnchantedPlaylist } from "./enchantedplaylist.js"
import { setupHooks } from "./hooks.js"

Hooks.once("init", () => {

    game.settings.register("playlistenchantment", "settings", {
        name: "playlistsettings",
        scope: "world",
        config: false,
        default: {
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
                interface: false
            },
            channelSettings: {
                music: { fade: true, fadeModifier: 500, normalize: false, normalizeModifier: 0.5 },
                environment: { fade: false, fadeModifier: 500, normalize: false, normalizeModifier: 0.5 },
                interface: { fade: false, fadeModifier: 500, normalize: false, normalizeModifier: 0.5 }
            }
        },
        type: Object
    });

    game.settings.register("playlistenchantment", "soundUploadFolder", {
        name: "PLAYLISTENCHANTMENT.soundUploadFolder",
        hint: "PLAYLISTENCHANTMENT.soundUploadFolderHint",
        scope: "world",
        config: true,
        type: String,
        filePicker: 'folder',
        default: "modules/playlistenchantment/storage"
    })

    CONFIG.ui.playlists = EnchantedPlaylist
})

Hooks.once("setup", () => {
    setupHooks()
})

Hooks.once("ready", () => {
    const settings = game.settings.get("playlistenchantment", "settings");
    if ((settings.channelControlsV ?? 0) >= 1) return;

    const channelSettings = settings.channelSettings ?? {};
    for (const id of ["environment", "interface"]) {
        channelSettings[id] = { ...channelSettings[id], fade: false, normalize: false };
    }
    settings.channelSettings = channelSettings;
    settings.channelControlsV = 1;
    game.settings.set("playlistenchantment", "settings", settings);
})