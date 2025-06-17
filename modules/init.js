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
            playListLoopEnabled: false
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