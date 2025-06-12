export class EnchantmentPopup extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static PARTS = {
    main: {
      root: true,
      template: "modules/playlistenchantment/templates/currentplayling.hbs",
    },
  };

  static DEFAULT_OPTIONS = {
    id: "enchantment-popup",
    window: {
      frame: false,
    },
    classes: ["enchantmentplaylisttooltip", "playlists-sidebar"],
  };

  constructor(callingTarget, macroId) {
    super();
    this.macroId = macroId;
    this.callingTarget = callingTarget;
  }

  async _prepareContext(_options) {
    const data = await super._prepareContext(_options);
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

    foundry.utils.mergeObject(data, {
      macroId: this.macroId,
      name: this.callingTarget.dataset.tooltip,
      isGM: game.user.isGM,
      playingSounds,
      showPlaying: ui.playlists.playing.length > 0,
    });
    return data;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    const template = $(this.element);
    ui.playlists.activateListeners(template);
    template.find("[data-action]").on("click", async (ev) => {
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
  }
}
