import { Settings } from "../settings.js";

export class Theme {
    static SETTING = "enchantmentStyle";

    static FOUNDRY = "pe-theme-foundry";
    static ENCHANTED = "pe-theme-enchanted";

    static SELECTOR = ".playlistenchantment";

    static WINDOW = ":is(.pe-studio, .pe-dialog, .pe-preview)";

    static get useEnchantedStyle() {
        return Settings.get(this.SETTING) !== false;
    }

    static async setEnchantedStyle(enabled) {
        await Settings.set(this.SETTING, !!enabled);
    }

    static apply(element) {
        if (!element?.classList?.contains("playlistenchantment")) return;
        if (element.classList.contains("pe-sheet")) return;
        const enchanted = this.useEnchantedStyle;
        element.classList.toggle(this.ENCHANTED, enchanted);
        element.classList.toggle(this.FOUNDRY, !enchanted);
    }

    static refresh() {
        for (const element of document.querySelectorAll(`${this.SELECTOR}${this.WINDOW}`)) this.apply(element);
    }
}
