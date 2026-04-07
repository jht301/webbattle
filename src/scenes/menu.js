// ============================================================
// MENU SCENE
// ============================================================
(function () {
    const { GW, toggleFullscreen } = window.NBA;

    class MenuScene extends Phaser.Scene {
        constructor() { super('MenuScene'); }

        create() {
            this.cameras.main.setBackgroundColor('#0a0a1e');

            this.add.text(GW / 2, 100, 'NETBATTLE\nARENA', {
                fontFamily: 'monospace', fontSize: '52px', color: '#00ffcc',
                align: 'center', stroke: '#003322', strokeThickness: 4
            }).setOrigin(0.5);

            // ---- Account / token HUD ----
            const auth = window.NBA.auth;
            const inv = window.NBA.inventory;
            const username = (auth && auth.getUsername && auth.getUsername()) || 'Guest';
            const tokens = (inv && inv.getTokens) ? inv.getTokens() : 0;
            this.add.text(12, 12, '@' + username, {
                fontFamily: 'monospace', fontSize: '12px', color: '#88aacc'
            }).setDepth(20);
            this.tokensText = this.add.text(GW - 12, 12, '⬢ ' + tokens, {
                fontFamily: 'monospace', fontSize: '14px', color: '#ffcc00'
            }).setOrigin(1, 0).setDepth(20);

            // ---- Mode buttons ----
            const buttons = [
                { label: 'TRAINING',     color: '#00ffcc', y: 220, action: () => this.startTraining() },
                { label: 'MULTIPLAYER',  color: '#ff66cc', y: 280, action: () => this.scene.start('MultiplayerLobbyScene') },
                { label: 'SHOP',         color: '#ffcc00', y: 340, action: () => this.scene.start('ShopScene') },
                { label: 'TRADE',        color: '#66ccff', y: 400, action: () => this.scene.start('TradeScene') },
            ];
            for (const b of buttons) {
                const bg = this.add.rectangle(GW / 2, b.y, 240, 44, 0x0a1428)
                    .setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(b.color).color)
                    .setInteractive({ useHandCursor: true });
                this.add.text(GW / 2, b.y, b.label, {
                    fontFamily: 'monospace', fontSize: '20px', color: b.color
                }).setOrigin(0.5);
                bg.on('pointerdown', b.action);
            }

            this.add.text(GW / 2, 480, [
                'Swipe — Move on grid',
                'Tap — Shoot (hold to charge)',
                'WASD also works on desktop',
                'Tap gauge when full for new chips',
            ].join('\n'), {
                fontFamily: 'monospace', fontSize: '12px', color: '#556688',
                align: 'center', lineSpacing: 4
            }).setOrigin(0.5);

            // Sign-in prompt for guests
            if (auth && auth.isGuest && auth.isGuest()) {
                const signInBtn = this.add.text(GW / 2, 560, '[ SIGN IN ]', {
                    fontFamily: 'monospace', fontSize: '14px', color: '#88ccff',
                    stroke: '#000', strokeThickness: 2
                }).setOrigin(0.5).setInteractive({ useHandCursor: true });
                signInBtn.on('pointerdown', async () => {
                    if (auth.signIn) {
                        await auth.signIn();
                        this.scene.restart();
                    }
                });
            }

            // Fullscreen
            const fsBtn = this.add.text(GW / 2, 600, '[ FULLSCREEN ]', {
                fontFamily: 'monospace', fontSize: '14px', color: '#888888',
                stroke: '#000', strokeThickness: 2
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            fsBtn.on('pointerdown', (pointer, lx, ly, event) => {
                event.stopPropagation();
                toggleFullscreen();
            });

            // CrazyGames-style instant-MP: if launched with a room param, jump in
            if (window.NBA.cgInviteRoom) {
                this.scene.start('MultiplayerLobbyScene', { autoJoinRoom: window.NBA.cgInviteRoom });
                window.NBA.cgInviteRoom = null;
            }
        }

        startTraining() {
            this.scene.start('CustomScreenScene', {
                round: 1, totalDeleted: 0,
                playerHp: 100, firstRound: true, mode: 'training'
            });
        }
    }

    window.NBA.MenuScene = MenuScene;
})();
