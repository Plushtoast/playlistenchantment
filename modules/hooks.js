const { mergeObject, getProperty } = foundry.utils;

export function setupHooks() {
  Hooks.on("hotbarDrop", (bar, data, slot) => {
    if (["PlaylistSound", "Playlist"].includes(data.type)) {
      buildPlaylistMacro(data.uuid, slot);
      return false;
    } else if (data.type == "Folder") {
      const folder = fromUuidSync(data.uuid);

      if (folder.type == "Playlist") {
        buildPlaylistMacro(data.uuid, slot);
        return false;
      }
    }
  });

  Hooks.on("getPlaylistSoundContextOptions", (app, optns) => {
    optns.push({
      name: "PLAYLISTENCHANTMENT.Prehear",
      icon: "<i class='fas fa-music'></i>",
      callback: (i) => preHearSound(i),
    });
  });

  Hooks.on("renderHotbar", (bar, html) => {
    html = $(html);
    const activemacros = html.find(".slot.full");
    activemacros.mouseenter((ev) => onHoverMacros(ev));
    activemacros.mouseleave((ev) => onUnhoverMacros(ev));
    activemacros.mousedown((ev) => onUnhoverMacros(ev));
  });

  Hooks.on("preUpdatePlaylist", (playlist, changes, options, userId) => {
    if (playlist.mode >= 0 && "sounds" in changes) {
      const settings = game.settings.get("playlistenchantment", "settings");
      if (settings.alwaysFade) {
        changes.fade = settings.fadeModifier || 0;
      }
      if (settings.normalize) {
        const sound = changes.sounds.find((s) => s.playing);
        if (sound) {
            sound.volume = settings.normalizeModifier || 0;
        }
      }
    }
  });
}

async function buildPlaylistMacro(uuid, slot) {
  const playlist = await fromUuid(uuid);
  const command = `CONFIG.ui.playlists.hotbarPlaylist("${uuid}")`;
  createHotBarMacro(command, playlist.name, "icons/svg/sound.svg", slot, "Playlist");
}

function onHoverMacros(ev) {
  const slot = ev.currentTarget.dataset.slot;
  const macroId = game.user.hotbar[slot];
  if (!macroId) return;
  const macro = game.macros.get(macroId);
  if (!macro) return;

  const playlistType = getProperty(macro, "flags.enchantedplaylist.type");

  if (!playlistType) return;

  showHotbarSoundMenu(ev, macroId);
}

async function preHearSound(i) {
  const playlistId = i.dataset.playlistId;
  const soundId = i.dataset.soundId;

  const sound = game.playlists.get(playlistId).sounds.get(soundId);

  const settings = game.settings.get("playlistenchantment", "settings");

  const volume = settings.normalize ? settings.normalizeModifier : sound.volume || 0.5;

  ui.notifications.info(`Fetching & Playing ${sound.name}`);
  foundry.audio.AudioHelper.play({ src: sound.path, volume, loop: false }, false).then((soundSource) => {
    new SoundPreview(soundSource, sound).render(true);
  });
}

class SoundPreview extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static PARTS = {
    main: {
      template: "modules/playlistenchantment/templates/soundpreview.hbs",
    },
  };

  static DEFAULT_OPTIONS = {
    window: {
      title: "PLAYLISTENCHANTMENT.Prehear",
    },
    actions: {
      stopSound: this._stopSound,
    },
  };

  constructor(sound, source) {
    super();
    this.sound = sound;
    this.source = source;
    this.sound.addEventListener("stop", () => {
      this.close();
    });
    this.sound.addEventListener("end", () => {
      this.close();
    });
  }

  async _prepareContext(_options) {
    const data = await super._prepareContext(_options);
    data.sound = this.sound;
    data.source = this.source;
    return data;
  }

  static _stopSound(ev, target) {
    this.close();
  }

  async close(options) {
    this.sound.stop();
    return super.close(options);
  }
}

async function renderHotbarSoundMenu(name, macroId) {
  const playingSounds = [];

  for (let con of ui.playlists._playing.context) {
    const s = foundry.utils.duplicate(con);
    const sound = ui.playlists._playing.sounds.find((ps) => ps._id == s.id);
    const lvolume = foundry.audio.AudioHelper.volumeToInput(s.volume);
    (s.pause.icon = `fa-solid ${sound.playing && !sound.sound?.loaded ? "fa-spinner fa-spin" : "fa-pause"}`),
      (s.lvolume = lvolume);
    (s.volumeTooltip = foundry.audio.AudioHelper.volumeToPercentage(lvolume)),
      (s.currentTime = ui.playlists.constructor.formatTimestamp(sound.playing ? sound.sound.currentTime : s.pausedTime));
    s.durationTime = ui.playlists.constructor.formatTimestamp(sound.sound.duration);
    s.volume = con.volume;
    playingSounds.push(s);
  }

  const data = {
    macroId,
    name,
    isGM: game.user.isGM,
    playingSounds,
    showPlaying: ui.playlists.playing.length > 0,
  };

  const template = $(
    await foundry.applications.handlebars.renderTemplate("modules/playlistenchantment/templates/currentplayling.hbs", data)
  );

  ui.playlists.activateListeners(template);

  template.find("[data-action]").on("click", async(ev) => {
    const target = ev.currentTarget;
    const action = target.dataset.action;

    if (action === "soundRepeat") {
      const { playlistId, soundId } = target.closest(".sound")?.dataset ?? {};
      const sound = game.playlists.get(playlistId)?.sounds.get(soundId);
      await sound?.update({ repeat: !sound?.repeat });
    } else {
      const { playlistId, soundId } = target.closest(".sound")?.dataset ?? {};
      const playlist = game.playlists.get(playlistId);
      const sound = playlist?.sounds.get(soundId);
      switch (target.dataset.action) {
        case "soundPause":
          await sound.update({ playing: false, pausedTime: sound.sound.currentTime });
          break;
        case "soundPlay":
          await playlist.playSound(sound);
          break;
        case "soundStop":
          await playlist.stopSound(sound);
          break;
        default:
          let handler = ui.playlists.options.actions[action];
          if (handler) {
            let buttons = [0];
            if (typeof handler === "object") {
              buttons = handler.buttons;
              handler = handler.handler;
            }
            if (buttons.includes(ev.button)) await handler?.call(ui.playlists, ev, target);
          }
      }
    }
  });
  template.find(".sound-volume").on("input", (ev) => {
    const target = ev.currentTarget;
    ui.playlists._onSoundVolume(target);
    setTimeout(() => {
      ui.playlists.render();
    }, 120);
  });

  return template;
}

async function showHotbarSoundMenu(ev, macroId) {
  const id = `.enchantmentplaylisttooltip`;
  $(id).remove();

  const rect = ev.currentTarget.getBoundingClientRect();
  const name = ev.currentTarget.dataset.tooltipText;

  const template = await renderHotbarSoundMenu(name, macroId);

  $("body").append(template);

  const tt = $(`.enchantmentplaylisttooltip[data-macro-id="${macroId}"]`);
  $(ev.currentTarget)
    .off("mouseleave")
    .on("mouseleave", (ev) => onUnhoverMacros(macroId));
  tt.on("mouseleave", (ev) => onUnhoverMacros(macroId));
  tt.css({
    left: rect.x - 125 + rect.width / 2,
    top: rect.y - tt.height(),
    zIndex: 1000,
  });
  tt.fadeIn();
  game.tooltip.deactivate();
}

function onUnhoverMacros(macroId) {
  const id = `.enchantmentplaylisttooltip[data-macro-id="${macroId}"]`;
  console.log("iam called", id);
  setTimeout(() => {
    if (!$(`${id}:hover`).length) $(id).remove();
  }, 100);
}

function createHotBarMacro(command, name, img, slot, type) {
  let macro = game.macros.contents.find((m) => m.name === name && m.command === command);
  if (!macro) {
    Macro.create(
      {
        name,
        type: "script",
        img,
        command,
        flags: {
          enchantedplaylist: {
            type,
          },
        },
      },
      { displaySheet: false }
    ).then((macro) => game.user.assignHotbarMacro(macro, slot));
  } else {
    game.user.assignHotbarMacro(macro, slot);
  }
  return false;
}
