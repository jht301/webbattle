// ============================================================
// CHIP SELECT SCENE — chip selection between rounds (board preview)
// ============================================================
(function () {
    const {
        GW, GH, COLS, ROWS, CELL_W, CELL_H, GRID_X, GRID_Y,
        cellCenter, CHIP_DEFS, CHIP_NAMES, makeChipInstance, canSelectChip,
        buildWavesForRound,
    } = window.NBA;

    class CustomScreenScene extends Phaser.Scene {
        constructor() { super('CustomScreenScene'); }

        init(data) {
            this.round = data.round || 1;
            this.totalDeleted = data.totalDeleted || 0;
            this.playerHp = data.playerHp || 100;
            this.mode = data.mode || 'training';
        }

        create() {
            this.cameras.main.setBackgroundColor('#0e0e24');
            const ts = { fontFamily: 'monospace', stroke: '#000', strokeThickness: 2 };

            // ---- Battle grid preview ----
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    const owner = r <= 2 ? 'enemy' : 'player';
                    const pos = cellCenter(c, r);
                    const key = owner === 'player' ? 'panel_player' : 'panel_enemy';
                    this.add.sprite(pos.x, pos.y, key).setDepth(0).setAlpha(0.6);
                }
            }

            const divY = GRID_Y + 3 * CELL_H;
            const lineG = this.add.graphics();
            lineG.lineStyle(2, 0x446688, 0.4);
            lineG.lineBetween(GRID_X, divY, GRID_X + COLS * CELL_W, divY);

            const pp = cellCenter(1, 5);
            this.add.sprite(pp.x, pp.y, 'player').setDepth(5).setAlpha(0.7);

            const waves = buildWavesForRound(this.round);
            const texMap = { mettaur: 'mettaur', canodumb: 'canodumb', swordy: 'swordy' };
            if (waves.length > 0) {
                for (const def of waves[0]) {
                    const ep = cellCenter(def.col, def.row);
                    this.add.sprite(ep.x, ep.y, texMap[def.type]).setDepth(5).setAlpha(0.7);
                }
            }
            this.add.text(GW / 2, GRID_Y - 10, `${waves.length} wave${waves.length > 1 ? 's' : ''} — Wave 1 shown`, {
                ...ts, fontSize: '10px', color: '#556688'
            }).setOrigin(0.5).setDepth(10);

            this.add.rectangle(GW / 2, GRID_Y + 1.5 * CELL_H, COLS * CELL_W + 20, 3 * CELL_H + 10, 0x000000, 0.45).setDepth(7);
            const waitText = this.add.text(GW / 2, GRID_Y + 1.5 * CELL_H, 'Waiting for\nchip selection...', {
                ...ts, fontSize: '14px', color: '#8888aa', align: 'center', lineSpacing: 4
            }).setOrigin(0.5).setDepth(8);
            this.tweens.add({
                targets: waitText, alpha: 0.4, duration: 800,
                yoyo: true, repeat: -1
            });

            // ---- HUD ----
            this.add.text(12, 12, 'MegaMan.EXE', { ...ts, color: '#00ffcc', fontSize: '14px' });
            this.add.text(12, 30, `HP: ${this.playerHp} / 100`, { ...ts, color: '#ffffff', fontSize: '13px' });
            const inv = window.NBA.inventory;
            const tok = inv && inv.getTokens ? inv.getTokens() : 0;
            this.add.text(GW - 12, 12, '⬢ ' + tok, { ...ts, color: '#ffcc00', fontSize: '14px' }).setOrigin(1, 0);
            this.add.text(GW - 12, 30, 'ROUND: ' + this.round, { ...ts, color: '#00aaff', fontSize: '13px' }).setOrigin(1, 0);

            // ---- Chip select panel ----
            const chipPanelTop = GRID_Y + 3 * CELL_H + 4;
            this.add.rectangle(GW / 2, (chipPanelTop + GH) / 2, GW, GH - chipPanelTop, 0x0a1428).setDepth(9);

            this.add.text(GW / 2, chipPanelTop + 10, 'CHIP SELECT', {
                ...ts, fontSize: '18px', color: '#00ffcc'
            }).setOrigin(0.5).setDepth(10);

            this.add.text(GW / 2, chipPanelTop + 32, 'Select chips with same name or same code', {
                ...ts, fontSize: '10px', color: '#556677'
            }).setOrigin(0.5).setDepth(10);

            // ---- Build hand from inventory (training: all unlocked; mp: stock>0). Falls back to legacy random pool. ----
            this.hand = this.buildHand(8);

            this.selected = [];
            this.chipCards = [];

            const chipAreaY = chipPanelTop + 50;
            const cardW = 108;
            const cardH = 58;
            const cols = 4;
            const gapX = 8, gapY = 10;

            for (let i = 0; i < this.hand.length; i++) {
                const chip = this.hand[i];
                const def = CHIP_DEFS[chip.name];
                const cx = i % cols;
                const cy = Math.floor(i / cols);
                const x = (GW - cols * (cardW + gapX)) / 2 + cx * (cardW + gapX) + cardW / 2;
                const y = chipAreaY + cy * (cardH + gapY) + cardH / 2;

                const bg = this.add.rectangle(x, y, cardW, cardH, 0x112233)
                    .setStrokeStyle(2, 0x334455).setDepth(10)
                    .setInteractive({ useHandCursor: true });

                const nameT = this.add.text(x, y - 14, chip.name, {
                    ...ts, fontSize: '12px', color: '#ffffff'
                }).setOrigin(0.5).setDepth(11);

                const codeT = this.add.text(x + cardW / 2 - 6, y - 14, chip.code, {
                    ...ts, fontSize: '14px', color: '#ffcc00'
                }).setOrigin(1, 0.5).setDepth(11);

                const descT = this.add.text(x, y + 6, def.dmg > 0 ? `${def.dmg} DMG` : (chip.name === 'Recover30' ? 'HEAL' : 'UTIL'), {
                    ...ts, fontSize: '10px', color: '#889999'
                }).setOrigin(0.5).setDepth(11);

                const iconBar = this.add.rectangle(x, y + 22, cardW - 8, 4, def.color).setDepth(11);

                bg.on('pointerdown', () => {
                    const idx = this.selected.indexOf(i);
                    if (idx !== -1) {
                        this.selected.splice(idx, 1);
                    } else if (this.selected.length < 5) {
                        const selectedChips = this.selected.map(si => this.hand[si]);
                        if (canSelectChip(chip, selectedChips)) {
                            this.selected.push(i);
                        }
                    }
                    this.updateCardHighlights();
                });

                this.chipCards.push({ bg, nameT, codeT, descT, iconBar });
            }

            this.updateCardHighlights();

            const okY = chipAreaY + 2 * (cardH + gapY) + 24;
            const okBtn = this.add.rectangle(GW / 2, okY, 160, 40, 0x005544)
                .setStrokeStyle(2, 0x00ffcc).setDepth(10).setInteractive({ useHandCursor: true });
            this.add.text(GW / 2, okY, 'OK', {
                ...ts, fontSize: '22px', color: '#00ffcc'
            }).setOrigin(0.5).setDepth(11);

            okBtn.on('pointerdown', () => this.confirm());
            this.input.keyboard.once('keydown-ENTER', () => this.confirm());
        }

        // Build a hand of size n from the appropriate chip pool.
        buildHand(n) {
            const inv = window.NBA.inventory;
            let pool = CHIP_NAMES;
            if (inv) {
                if (this.mode === 'mp' && inv.getMpChips) {
                    pool = inv.getMpChips();
                } else if (inv.getTrainingChips) {
                    pool = inv.getTrainingChips();
                }
            }
            if (!pool || pool.length === 0) pool = CHIP_NAMES;
            const out = [];
            for (let i = 0; i < n; i++) {
                out.push(makeChipInstance(pool[Phaser.Math.Between(0, pool.length - 1)]));
            }
            return out;
        }

        updateCardHighlights() {
            const selectedChips = this.selected.map(si => this.hand[si]);

            for (let i = 0; i < this.hand.length; i++) {
                const card = this.chipCards[i];
                const isSelected = this.selected.includes(i);
                const isSelectable = isSelected || (this.selected.length < 5 && canSelectChip(this.hand[i], selectedChips));

                if (isSelected) {
                    card.bg.setStrokeStyle(3, 0xffcc00);
                    card.bg.setFillStyle(0x2a2a00);
                    card.bg.setAlpha(1);
                } else if (isSelectable) {
                    card.bg.setStrokeStyle(2, 0x334455);
                    card.bg.setFillStyle(0x112233);
                    card.bg.setAlpha(1);
                } else {
                    card.bg.setStrokeStyle(2, 0x1a1a1a);
                    card.bg.setFillStyle(0x0a0a0a);
                    card.bg.setAlpha(0.5);
                }
                card.nameT.setAlpha(isSelectable || isSelected ? 1 : 0.3);
                card.codeT.setAlpha(isSelectable || isSelected ? 1 : 0.3);
                card.descT.setAlpha(isSelectable || isSelected ? 1 : 0.3);
            }
        }

        confirm() {
            let chips;
            if (this.selected.length > 0) {
                chips = this.selected.map(si => this.hand[si]);
            } else {
                chips = [this.hand[0]];
            }

            this.scene.start('BattleScene', {
                round: this.round,
                totalDeleted: this.totalDeleted,
                chipInventory: chips,
                playerHp: this.playerHp,
                mode: this.mode
            });
        }
    }

    window.NBA.CustomScreenScene = CustomScreenScene;
})();
