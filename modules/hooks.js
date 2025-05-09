const { mergeObject, getProperty } = foundry.utils

export function setupHooks() {
    Hooks.on("hotbarDrop", (bar, data, slot) => {
        if(["PlaylistSound", "Playlist"].includes(data.type)) {
            buildPlaylistMacro(data.uuid, slot)
            return false
        } else if(data.type == "Folder") {
            const folder = fromUuidSync(data.uuid)

            if(folder.type == "Playlist") {
                buildPlaylistMacro(data.uuid, slot)
                return false
            }                
        }
    })

    Hooks.on("getEnchantedPlaylistSoundContext", (app, optns) => {       
        optns.push(
            {
                name: "PLAYLISTENCHANTMENT.Prehear",
                icon: "<i class='fas fa-music'></i>",
                callback: (i) => preHearSound(i)
            }
        )
    })

    Hooks.on("renderHotbar", (bar, html) => {
        const activemacros = html.find('.macro.active')
        activemacros.mouseenter(ev => onHoverMacros(ev))
        activemacros.mouseleave(ev => onUnhoverMacros(ev))
        activemacros.mousedown(ev => onUnhoverMacros(ev))
    })

    Hooks.on('preUpdatePlaylist' , (playlist, data, options, userId) => {
        if(playlist.mode >= 0 && 'sounds' in data) {
            const update = {}
            const settings = game.settings.get("playlistenchantment", "settings")
            if(settings.alwaysFade) {
                update.fade = settings.fadeModifier || 0
            }
            if(settings.normalize) {
                const sound = data.sounds.find(s => s.playing)
                if(!sound) return

                sound.volume = settings.normalizeModifier || 0
                update.sounds = [ sound ]
            }

            if(Object.keys(update).length > 0)
                playlist.updateSource(update)
        }
    })
}

async function buildPlaylistMacro(uuid, slot) {
    const playlist = await fromUuid(uuid)
    const command = `CONFIG.ui.playlists.hotbarPlaylist("${uuid}")`
    createHotBarMacro(command, playlist.name, "icons/svg/sound.svg", slot, "Playlist")
}

function onHoverMacros(ev) {
    const macro = game.macros.get(ev.currentTarget.dataset.macroId)

    if(!macro) return

    const playlistType = getProperty(macro, "flags.enchantedplaylist.type")

    if(!playlistType) return

    showHotbarSoundMenu(ev)
}

async function preHearSound(i) {
    const playlistId = i[0].dataset.playlistId
    const soundId = i[0].dataset.soundId

    const sound = game.playlists.get(playlistId).sounds.get(soundId)

    const settings = game.settings.get("playlistenchantment", "settings")

    const volume = settings.normalize ? settings.normalizeModifier : sound.volume || 0.5

    ui.notifications.info(`Fetching & Playing ${sound.name}`)
    foundry.audio.AudioHelper.play({ src: sound.path, volume, loop: false }, false).then((soundSource) => {
        (new SoundPreview(soundSource, sound)).render(true)
    });
}

class SoundPreview extends Application {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            template: "modules/playlistenchantment/templates/soundpreview.html"
        })
    }

    constructor(sound, source) {
        super()
        this.sound = sound
        this.source = source
        this.sound.addEventListener("stop", () => {
            this.close()
        });
        this.sound.addEventListener("end", () => {
            this.close()
        });
    }

    async getData() {
        const data = await super.getData()
        data.sound = this.sound
        data.source = this.source
        return data
    }

    activateListeners(html) {
        html.find('.stopSound').click(() => this.close())
    }

    async close(options) {
        this.sound.stop()
        return super.close(options)
    }
}

async function showHotbarSoundMenu(ev) {
    const id = `.enchantmentplaylisttooltip`
    $(id).remove()
    
    const rect = ev.currentTarget.getBoundingClientRect()
    const name = ev.currentTarget.dataset.tooltip

    const playingSounds = foundry.utils.duplicate(ui.playlists._playingSoundsData)

    for(let s of playingSounds) {
        const sound = ui.playlists._playingSounds.find(ps => ps._id == s._id)
        s.pauseIcon = ui.playlists._getPauseIcon(sound);
        s.lvolume = foundry.audio.AudioHelper.volumeToInput(s.volume);
        s.volumeTooltip = ui.playlists.constructor.volumeToTooltip(s.volume);
        s.currentTime = ui.playlists._formatTimestamp(sound.playing ? sound.sound.currentTime : s.pausedTime);
        s.durationTime = ui.playlists._formatTimestamp(sound.sound.duration);
    }

    const data =  { 
        macroId: ev.currentTarget.dataset.macroId,  
        name, 
        isGM: game.user.isGM,
        playingSounds: playingSounds,
        showPlaying: ui.playlists._playingSoundsData.length > 0
    }
    
    const template = $(await renderTemplate("modules/playlistenchantment/templates/currentplayling.html", data))

    ui.playlists.activateListeners(template)

    $('body').append(template)

    const tt = $(`.enchantmentplaylisttooltip[data-macro-id="${ev.currentTarget.dataset.macroId}"]`)
    tt.on("mouseleave", ev => onUnhoverMacros(ev))
    tt.css({
        left: rect.x - 125 + rect.width / 2,
        top: rect.y - tt.height(),
        zIndex: 1000
    })
    tt.fadeIn()
    game.tooltip.deactivate()
}

function onUnhoverMacros(ev)  {
    const id = `.enchantmentplaylisttooltip[data-macro-id="${ev.currentTarget.dataset.macroId}"]`
    setTimeout(() => {
        if(!$(`${id}:hover`).length)
            $(id).remove()
    }, 100)    
}

function createHotBarMacro(command, name, img, slot, type) {
    let macro = game.macros.contents.find(m => (m.name === name) && (m.command === command));
    if (!macro) {
        Macro.create({
            name,
            type: "script",
            img,
            command,
            flags: {
                enchantedplaylist: {
                    type
                }
            }
        }, { displaySheet: false }).then(macro => game.user.assignHotbarMacro(macro, slot))
    }else{
        game.user.assignHotbarMacro(macro, slot);
    }
    return false
}