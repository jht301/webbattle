// ============================================================
// NetBattle Arena — entry point
// All game logic lives in src/. This file initializes the data
// layer (auth + inventory), reads CrazyGames invite params, and
// boots Phaser with every registered scene.
// ============================================================

(async function () {
    // ---- CrazyGames SDK init (no-op if not on CG) ----
    try {
        if (window.CrazyGames && window.CrazyGames.SDK && window.CrazyGames.SDK.init) {
            await window.CrazyGames.SDK.init();
        }
    } catch (e) {
        console.warn('[boot] CrazyGames SDK init failed', e);
    }

    // ---- Capture friend-room invite param if present ----
    try {
        const sdk = window.CrazyGames && window.CrazyGames.SDK;
        if (sdk && sdk.game && sdk.game.getInviteParam) {
            const room = sdk.game.getInviteParam('roomCode');
            if (room) window.NBA.cgInviteRoom = room;
        }
    } catch (_) {}

    // ---- Load identity + inventory ----
    await window.NBA.auth.init();
    window.NBA.inventory.load();

    // ---- Pull authoritative inventory from backend if signed in ----
    try {
        const cfg = window.NBA.config;
        if (cfg && cfg.SERVER_URL && window.NBA.auth.isGuest && !window.NBA.auth.isGuest()) {
            const serverInv = await window.NBA.net.fetchInventory();
            if (serverInv) window.NBA.inventory.applyServerState(serverInv);
        }
    } catch (e) {
        console.warn('[boot] inventory sync skipped', e.message);
    }

    // ---- Phaser config ----
    const config = {
        type: Phaser.AUTO,
        width: window.NBA.GW,
        height: window.NBA.GH,
        parent: 'game-container',
        backgroundColor: '#0e0e24',
        input: {
            activePointers: 3,
            touch: { capture: true }
        },
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH
        },
        scene: [
            window.NBA.BootScene,
            window.NBA.MenuScene,
            window.NBA.CustomScreenScene,
            window.NBA.BattleScene,
            window.NBA.GameOverScene,
            window.NBA.ShopScene,
            window.NBA.TradeScene,
            window.NBA.MultiplayerLobbyScene,
            window.NBA.MultiplayerBattleScene,
            window.NBA.MultiplayerResultScene,
        ],
    };

    window.NBA.game = new Phaser.Game(config);
})();
