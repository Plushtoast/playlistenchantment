import { EnchantmentPopup } from "./enchantmentpopup.js";
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

  Hooks.on("renderPlaylistDirectory", (app, html, data) => {
    ui.enchantmentPopup?.render();
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

async function showHotbarSoundMenu(ev, macroId) {
  $(".enchantment-popup").remove();

  const target = ev.currentTarget;
  const rect = target.getBoundingClientRect();
  const popup = new EnchantmentPopup(target, macroId);
  ui.enchantmentPopup = popup;
  await popup.render(true);
  const tt = $(popup.element);
  const options = {
    left: rect.x - 135 + rect.width / 2,
    top: rect.y - tt.height(),
  };
  popup.setPosition(options);

  $(ev.currentTarget)
    .off("mouseleave")
    .on("mouseleave", (ev) => onUnhoverMacros(popup));
  tt.on("mouseleave", (ev) => onUnhoverMacros(popup));

  game.tooltip.deactivate();
}

function onUnhoverMacros(popup) {
  setTimeout(() => {
    if (popup?.element && !$(popup.element).is(":hover")) {
      popup.close({ animate: false });
    }
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
