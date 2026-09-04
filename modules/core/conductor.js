export class Conductor {
    static get activeGM() {
        return game.users.activeGM ?? null;
    }

    static get hasActiveGM() {
        return !!game.users.activeGM;
    }

    // Active GM conducts; without a GM, lowest-id active owner does.
    static isConductor(document) {
        if (this.hasActiveGM) return game.user.isActiveGM === true;
        if (!document) return false;
        const owners = game.users
            .filter((user) => user.active && document.testUserPermission(user, "OWNER"))
            .sort((a, b) => a.id.localeCompare(b.id));
        return owners[0]?.id === game.userId;
    }
}
