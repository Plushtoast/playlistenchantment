import { MODULE, Settings } from "./settings.js";
import { setupHooks } from "./hooks.js";
import { AudioChannels } from "./core/audiochannels.js";
import { DuckingService } from "./core/duckingservice.js";
import { FileLocation, installPickerOverride } from "./core/filelocation.js";
import { Librarian } from "./core/librarian.js";
import { PlaybackService } from "./core/playbackservice.js";
import { QueueService } from "./core/queueservice.js";
import { Relay } from "./core/relay.js";
import { SoundboardService } from "./core/soundboardservice.js";
import { Tags } from "./core/tagservice.js";
import { TrackIndex } from "./core/trackindex.js";
import { TrackMeta } from "./core/trackmeta.js";
import { EnchantedPlaylist } from "./apps/enchantedplaylist.js";
import { EnchantedPlaylistConfig, EnchantedSoundConfig } from "./apps/sheets/enchantedsheets.js";
import { Studio } from "./apps/studio/studio.js";

const STUDIO_TEMPLATES = [
    "templates/studio/header.hbs",
    "templates/studio/browser.hbs",
    "templates/studio/folder.hbs",
    "templates/studio/entry.hbs",
    "templates/studio/content.hbs",
    "templates/studio/rail.hbs",
    "templates/studio/transport.hbs",
    "templates/studio/track.hbs",
    "templates/studio/pad.hbs",
    "templates/studio/settings.hbs",
    "templates/sheets/enchantment.hbs",
    "templates/dialogs/padeditor.hbs",
    "templates/dialogs/djdialog.hbs",
    "templates/dialogs/uploaddialog.hbs",
].map((path) => `modules/${MODULE}/${path}`);

Hooks.once("init", () => {
    Settings.register();
    Settings.registerKeybindings();

    CONFIG.ui.playlists = EnchantedPlaylist;
    foundry.applications.handlebars.loadTemplates(STUDIO_TEMPLATES);

    const { DocumentSheetConfig } = foundry.applications.apps;
    const label = "PLAYLISTENCHANTMENT.EDITOR.sheetLabel";
    DocumentSheetConfig.registerSheet(foundry.documents.Playlist, MODULE, EnchantedPlaylistConfig, {
        makeDefault: true,
        label,
    });
    DocumentSheetConfig.registerSheet(foundry.documents.PlaylistSound, MODULE, EnchantedSoundConfig, {
        makeDefault: true,
        label,
    });

    game.modules.get(MODULE).api = {
        Studio,
        PlaybackService,
        QueueService,
        SoundboardService,
        Librarian,
        FileLocation,
        TrackMeta,
        Tags,
        AudioChannels,
    };
});

Hooks.once("setup", () => {
    installPickerOverride();
    Relay.register();
    DuckingService.register();
    QueueService.register();
    SoundboardService.register();
    setupHooks();
});

Hooks.once("ready", async () => {
    await Settings.migrate();
    TrackIndex.build();
    QueueService.evaluate();
});
