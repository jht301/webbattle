// ============================================================
// SHOP SCENE — spend tokens to unlock chips and buy MP stock.
// ============================================================
(function () {
    const { GW, GH, CHIP_DEFS, CHIP_NAMES } = window.NBA;

    class ShopScene extends Phaser.Scene {
        constructor() { super('ShopScene'); }

        create() {
            this.cameras.main.setBackgroundColor('#0a0a1e');
            const ts = { fontFamily: 'monospace', stroke: '#000', strokeThickness: 2 };

            this.add.text(GW / 2, 30, 'CHIP SHOP', {
                ...ts, fontSize: '28px', color: '#ffcc00'
            }).setOrigin(0.5);

            this.tokensText = this.add.text(GW / 2, 60, '', {
                ...ts, fontSize: '14px', color: '#ffffff'
            }).setOrigin(0.5);

            // Back button
            const back = this.add.text(12, 12, '< BACK', {
                ...ts, fontSize: '14px', color: '#88ccff'
            }).setInteractive({ useHandCursor: true });
            back.on('pointerdown', () => this.scene.start('MenuScene'));

            // Render rows
            this.cardRefs = [];
            const inv = window.NBA.inventory;
            const rowH = 78;
            const top = 90;

            for (let i = 0; i < CHIP_NAMES.length; i++) {
                const name = CHIP_NAMES[i];
                const def = CHIP_DEFS[name];
                const price = inv.PRICES[name];
                const y = top + i * rowH;

                // Card background
                const bg = this.add.rectangle(GW / 2, y + rowH / 2 - 6, GW - 24, rowH - 8, 0x0e1a2c)
                    .setStrokeStyle(2, def.color);

                // Color stripe
                this.add.rectangle(20, y + rowH / 2 - 6, 6, rowH - 16, def.color).setOrigin(0, 0.5);

                // Name + desc
                this.add.text(36, y + 6, name, { ...ts, fontSize: '16px', color: '#ffffff' });
                this.add.text(36, y + 26, def.desc, { ...ts, fontSize: '11px', color: '#88aacc' });
                const dmgText = def.dmg > 0 ? (def.dmg + ' DMG') : 'UTIL';
                this.add.text(36, y + 42, dmgText, { ...ts, fontSize: '11px', color: '#ffcc88' });

                // Status text
                const statusT = this.add.text(GW - 14, y + 6, '', { ...ts, fontSize: '11px', color: '#aaaaaa' }).setOrigin(1, 0);

                // Buttons (rendered to right side)
                const unlockBtn = this.add.rectangle(GW - 90, y + 38, 80, 22, 0x223344)
                    .setStrokeStyle(1, 0x66ccff).setInteractive({ useHandCursor: true });
                const unlockTxt = this.add.text(GW - 90, y + 38, '', { ...ts, fontSize: '10px', color: '#66ccff' }).setOrigin(0.5);

                const buyBtn = this.add.rectangle(GW - 90, y + 62, 80, 22, 0x224422)
                    .setStrokeStyle(1, 0x66ff88).setInteractive({ useHandCursor: true });
                const buyTxt = this.add.text(GW - 90, y + 62, '', { ...ts, fontSize: '10px', color: '#66ff88' }).setOrigin(0.5);

                const buy5Btn = this.add.rectangle(GW - 22, y + 62, 50, 22, 0x224422)
                    .setStrokeStyle(1, 0x66ff88).setInteractive({ useHandCursor: true });
                const buy5Txt = this.add.text(GW - 22, y + 62, '', { ...ts, fontSize: '10px', color: '#66ff88' }).setOrigin(0.5);

                unlockBtn.on('pointerdown', () => {
                    const r = inv.unlockChip(name);
                    if (!r.ok) this.flash(r.reason);
                    else this.flash('UNLOCKED ' + name);
                    this.refresh();
                });
                buyBtn.on('pointerdown', () => {
                    const r = inv.buyStock(name, 1);
                    if (!r.ok) this.flash(r.reason);
                    else this.flash('+1 ' + name);
                    this.refresh();
                });
                buy5Btn.on('pointerdown', () => {
                    const r = inv.buyStock(name, 5);
                    if (!r.ok) this.flash(r.reason);
                    else this.flash('+5 ' + name);
                    this.refresh();
                });

                this.cardRefs.push({ name, statusT, unlockBtn, unlockTxt, buyBtn, buyTxt, buy5Btn, buy5Txt });
            }

            this.flashText = this.add.text(GW / 2, GH - 22, '', { ...ts, fontSize: '12px', color: '#ffcc00' }).setOrigin(0.5);

            this.refresh();
        }

        refresh() {
            const inv = window.NBA.inventory;
            this.tokensText.setText('TOKENS: ⬢ ' + inv.getTokens());

            for (const c of this.cardRefs) {
                const price = inv.PRICES[c.name];
                const unlocked = inv.isUnlocked(c.name);
                const stock = inv.getStock(c.name);

                if (unlocked) {
                    c.statusT.setText('OWNED · stock ' + stock).setColor('#88ffaa');
                    c.unlockBtn.setVisible(false);
                    c.unlockTxt.setVisible(false);
                    c.buyBtn.setVisible(true);
                    c.buyTxt.setVisible(true).setText('+1 ⬢' + price.stock);
                    c.buy5Btn.setVisible(true);
                    c.buy5Txt.setVisible(true).setText('+5 ⬢' + (price.stock * 5));
                } else {
                    c.statusT.setText('LOCKED').setColor('#aaaaaa');
                    c.unlockBtn.setVisible(true);
                    c.unlockTxt.setVisible(true).setText('UNLOCK ⬢' + price.unlock);
                    c.buyBtn.setVisible(false);
                    c.buyTxt.setVisible(false);
                    c.buy5Btn.setVisible(false);
                    c.buy5Txt.setVisible(false);
                }
            }
        }

        flash(text) {
            this.flashText.setText(text).setAlpha(1);
            this.tweens.add({
                targets: this.flashText, alpha: 0, duration: 1500, ease: 'Power2'
            });
        }
    }

    window.NBA.ShopScene = ShopScene;
})();
