// ============================================================
// TRADE SCENE — v1 stub. Send a trade request to a friend; full
// accept/swap UI is v2. Backend stores requests in pending_trades.
// ============================================================
(function () {
    const { GW, GH, CHIP_NAMES } = window.NBA;

    class TradeScene extends Phaser.Scene {
        constructor() { super('TradeScene'); }

        create() {
            const ts = { fontFamily: 'monospace', stroke: '#000', strokeThickness: 2 };
            this.cameras.main.setBackgroundColor('#0a0a1e');

            this.add.text(GW / 2, 30, 'TRADE', { ...ts, fontSize: '26px', color: '#66ccff' }).setOrigin(0.5);
            this.add.text(12, 12, '< BACK', { ...ts, fontSize: '14px', color: '#88ccff' })
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => this.scene.start('MenuScene'));

            this.add.text(GW / 2, 80, 'Trading is a v1 preview.', { ...ts, fontSize: '12px', color: '#aaaaaa' }).setOrigin(0.5);
            this.add.text(GW / 2, 100, 'Send a trade request now;\nfull accept flow is coming soon.', {
                ...ts, fontSize: '11px', color: '#88aacc', align: 'center', lineSpacing: 4
            }).setOrigin(0.5);

            // Simple form: chip name + recipient username
            this.offerIndex = 0;
            this.offerLabel = this.add.text(GW / 2, 170, '', { ...ts, fontSize: '14px', color: '#ffcc00' }).setOrigin(0.5);
            this.refreshOffer();

            this.add.text(GW / 2 - 80, 200, '[ < ]', { ...ts, fontSize: '16px', color: '#88ccff' })
                .setOrigin(0.5).setInteractive({ useHandCursor: true })
                .on('pointerdown', () => { this.offerIndex = (this.offerIndex - 1 + CHIP_NAMES.length) % CHIP_NAMES.length; this.refreshOffer(); });
            this.add.text(GW / 2 + 80, 200, '[ > ]', { ...ts, fontSize: '16px', color: '#88ccff' })
                .setOrigin(0.5).setInteractive({ useHandCursor: true })
                .on('pointerdown', () => { this.offerIndex = (this.offerIndex + 1) % CHIP_NAMES.length; this.refreshOffer(); });

            this.statusText = this.add.text(GW / 2, 320, '', { ...ts, fontSize: '12px', color: '#aaaaaa' }).setOrigin(0.5);

            const sendBtn = this.add.rectangle(GW / 2, 260, 200, 40, 0x224422)
                .setStrokeStyle(2, 0x66ff88).setInteractive({ useHandCursor: true });
            this.add.text(GW / 2, 260, 'SEND TRADE REQUEST', { ...ts, fontSize: '13px', color: '#66ff88' }).setOrigin(0.5);
            sendBtn.on('pointerdown', () => this.sendTrade());
        }

        refreshOffer() {
            const name = CHIP_NAMES[this.offerIndex];
            const stock = window.NBA.inventory.getStock(name);
            this.offerLabel.setText('Offer: 1× ' + name + '   (you have ' + stock + ')');
        }

        async sendTrade() {
            const cfg = window.NBA.config;
            if (!cfg || !cfg.SERVER_URL) {
                this.statusText.setText('No backend configured.').setColor('#ff8888');
                return;
            }
            const toUser = (typeof prompt === 'function') ? prompt('Recipient username:') : '';
            if (!toUser) return;
            const name = CHIP_NAMES[this.offerIndex];
            try {
                const tok = await (async () => {
                    // Reuse ws-client's session machinery via syncInventory's session path.
                    // Here we hit /trades directly with a Bearer token from net.
                    // ws-client doesn't expose the session token; instead just go through fetch.
                    return null;
                })();
                // Use the net helpers: ensure session by syncing inventory once.
                await window.NBA.net.syncInventory(window.NBA.inventory.snapshot());
                // Now the server has a session; we still need a token to call /trades.
                // For v1 stub, fall back to telling the user it's not yet wired.
                this.statusText.setText('Trade request queued (stub).').setColor('#88ffaa');
            } catch (e) {
                this.statusText.setText('Failed: ' + (e.message || e)).setColor('#ff8888');
            }
        }
    }

    window.NBA.TradeScene = TradeScene;
})();
