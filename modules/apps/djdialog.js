import { Permissions } from "../core/permissionservice.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class DJDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: ["playlistenchantment", "pe-dialog", "pe-dj-dialog"],
        tag: "form",
        window: { title: "PLAYLISTENCHANTMENT.DJ.title", icon: "fa-solid fa-headphones" },
        position: { width: 420 },
        form: { handler: DJDialog._onSubmit, closeOnSubmit: true },
    };

    static PARTS = {
        form: { root: true, template: "modules/playlistenchantment/templates/dialogs/djdialog.hbs" },
    };

    constructor(playlist, options = {}) {
        super({ id: `pe-dj-${playlist.id}`, ...options });
        this.playlist = playlist;
    }

    get title() {
        return game.i18n.format("PLAYLISTENCHANTMENT.DJ.titleFor", { name: this.playlist.name });
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.playlist = this.playlist;
        context.users = game.users
            .filter((user) => !user.isGM)
            .map((user) => ({
                id: user.id,
                name: user.name,
                color: user.color?.css ?? user.color,
                active: user.active,
                isDJ: Permissions.isDJ(this.playlist, user),
            }));
        context.empty = !context.users.length;
        context.hint = game.i18n.localize("PLAYLISTENCHANTMENT.DJ.hint");
        context.buttons = [{ type: "submit", icon: "fa-solid fa-check", label: "PLAYLISTENCHANTMENT.save" }];
        return context;
    }

    static async _onSubmit(_event, form, formData) {
        const selected = new Set(
            Array.from(form.querySelectorAll('input[name="dj"]:checked')).map((input) => input.value)
        );
        const grant = [];
        for (const user of game.users.filter((u) => !u.isGM)) {
            const isDJ = Permissions.isDJ(this.playlist, user);
            if (selected.has(user.id) && !isDJ) grant.push(user.id);
            if (!selected.has(user.id) && isDJ) await Permissions.revokeDJ(this.playlist, user.id);
        }
        if (grant.length) await Permissions.grantDJ(this.playlist, grant);
    }
}
