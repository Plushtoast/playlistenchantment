![Version](https://img.shields.io/github/v/tag/Plushtoast/playlistenchantment?label=Version&style=flat-square&color=2577a1) ![Foundry Core Compatible Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2FPlushtoast%2Fplaylistenchantment%2Ffoundry14%2Fmodule.json&label=Foundry%20Core%20Compatible%20Version&query=$.compatibility.verified&style=flat-square&color=ff6400)

# Playlist Enchantment

A modern music player for Foundry VTT. The sidebar keeps working the way you know it, and a new **Playlist Enchantment** window adds everything a table needs to run its audio quickly: a searchable library with artwork and tags, a shared queue, soundboards with ducking, guided uploads, and the option to hand the music over to a player.

## Installation

Use the module manifest url or the Foundry package installer.

```html
https://raw.githubusercontent.com/Plushtoast/playlistenchantment/foundry14/module.json
```

## Playlist Enchantment

Open it from the **Playlist Enchantment** button at the top of the Playlists sidebar, from a playlist's context menu, or with a hotkey you assign in its own settings tab (no key is bound by default).
Drag the button onto the hotbar to get a macro for it.

* **Library** — folders and playlists on the left, tracks in the middle, what is playing on the right. Folders and subfolders can be created right here, they collapse, they mark themselves while something inside them plays, and both folders and playlists can be pinned to the top. Search matches playlist names, track names and tags, and the channel filter narrows it down further. 
Channel colours match the sidebar's music, environment and interface icons.
* **Transport** — cover art, play/pause, previous/next, stop everything, a scrub bar, the channel mixer with volume and cross-fade, and a mini player that folds the window down to what is playing. Foundry has no true seek, so jumping restarts the track on all clients and everyone hears a short gap; you are warned the first time rather than lied to.
* **Playlists** — sequential, shuffle or simultaneous playback is one click away in the header, and every track can be previewed locally before the table hears it.
* **Drag and drop** — drag a track onto another playlist to add it there, drop it on the queue to play it next or to reorder the queue, drag it onto the map to place it as an ambient sound, or drop audio files from your computer anywhere in the window to upload them. 
* **Artwork and tags** — every track and playlist can carry a cover image, an accent colour and tags. Tracks without their own artwork inherit their playlist's. Tags can be dragged onto a playlist or track to apply them, and onto the hotbar for a macro that plays a random track carrying that tag.
* **Settings** — the look of the window and the hotkey for everyone, and for the gamemaster the channel mixer (volume, fade, normalize), the combat music selection, the tag library and the upload folder.

## Tags

Tags are plain words stored on playlists and tracks. The **tag library** in the settings tab decides which tags are offered and which colour they carry; the text colour is computed from the background so a chip is always readable. Tags that are not in the library still work and get a stable colour derived from their name. The library ships with a set of useful defaults (combat, tension, tavern, wilderness and so on) and can be edited or reset at any time.

## Playlist and track sheets

The module extends Foundry's own playlist and sound sheets instead of replacing them: every native field stays where it is, and an **Enchantment** section for artwork, colour and tags appears below.
Saving a track's metadata also updates the other copies of the same file in your world.

## Queue

Queue a track and it plays after the current one; when the queue runs dry the interrupted playlist picks up again. Entries disappear once they have played.

Players can be allowed to add wish songs (**Settings → Players may queue tracks**). Players cannot write world data in Foundry, so their request is carried out by the gamemaster's client, and the gamemaster sees who queued what.

## Soundboards

A soundboard is an ordinary Foundry playlist in *Soundboard* mode, so boards stay usable even without this module. Each pad can:

* loop or fire once,
* **duck** the music while it plays and restore it afterwards,
* belong to a **choke group** so one ambience replaces another,
* be marked **player usable** so your players can trigger it themselves.

## Player DJ access

Per playlist you can hand control to specific players. Foundry expresses this as document ownership, which also lets them edit that playlist's tracks — the dialog says so plainly. The gamemaster gets a notification when a player starts, stops or changes audio, which can be switched off.

## Uploads

Foundry cannot move, rename or delete a file after upload, so the upload dialog is built around choosing the destination *first*: browse the upload folder, create subfolders, see the exact resulting path, then upload. Files that already exist in the target folder are reused instead of uploaded twice.

## Sidebar features

* Currently played tracks have a background colour for better visibility.
* Per audio channel (music, environment, interface) you can set a default fade and normalize volume, and decide whether starting a playlist fades out the others on that channel.
* Buttons to pause, start, forward and rewind everything that is playing.
* Double click a song in a playlist to play it.
* Drag playlists to the hotbar to create a crossfade macro, with quick controls on hover. Drag a playlist *folder* to start a random playlist from it on each click.
* Sounds have a context menu entry for the gamemaster to preview them without the players hearing.
* Automatic combat music: cross-fade to a random combat playlist when a fight starts and restore what was playing when it ends. The playlists are chosen in the Playlist Enchantment settings.
* Long song names scroll so they can be read entirely.
* Drop sound files onto a playlist to upload and add them (credits to @janckoch and the original module [Ensemble](https://github.com/janckoch/Ensemble)).

## Settings worth knowing

| Setting | What it does |
|---|---|
| Enable the queue | Shows the shared queue in Playlist Enchantment |
| Queue takes over automatically | Wait for the current track to end, then play the queue |
| Players may queue tracks | Lets players add wish songs through the gamemaster's client |
| Notify me about player actions | Toast for the gamemaster when a player changes audio |
| Announce new tracks in chat | Posts a chat card with cover art when a track starts |
| Ducking level and fade | How far the music dips for a ducking pad, and how quickly |

![grafik](https://github.com/Plushtoast/playlistenchantment/assets/44941845/a64a4f61-267b-42d0-9842-33e10a984ea0)
![grafik](https://github.com/Plushtoast/playlistenchantment/assets/44941845/c3bbc9c4-caa3-406a-a9ff-1c7d4343556d)
