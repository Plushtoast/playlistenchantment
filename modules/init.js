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
            alwaysFade: false
        },
        type: Object
    });

    CONFIG.ui.playlists = EnchantedPlaylist
})

Hooks.once("setup", () => {
    setupHooks()
})