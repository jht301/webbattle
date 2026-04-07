// ============================================================
// MULTIPLAYER BATTLE — chip draft + server-resolved duel.
// v1 MP is intentionally simpler than the single-player real-time
// grid loop: both players draft up to 5 chips from their MP
// inventory, the server resolves the exchange, and the winner
// is whoever has more HP at the end. Stock decrements + token
// rewards are server-authoritative.
// ============================================================
(function () {
    const { GW, GH, CHIP_DEFS, makeChipInstance, canSelectChip } = window.NBA;

    class MultiplayerBattleScene extends Phaser.Scene {
        constructor() { super('MultiplayerBattleScene'); }

        init(data) {
            this.opponentName = (data && data.opponentName) || 'Opponent';
            this.startingHp = (data && data.startingHp) || 100;
            this.maxChips = (data && data.maxChips) || 5;
            this.phase = 'draft';
        }

        create() {
            this.cameras.main.setBackgroundColor('#0a0a1e');
            const ts = { fontFamily: 'monospace', stroke: '#000', strokeThickness: 2 };

            this.add.text(GW / 2, 24, 'CHIP DUEL', { ...ts, fontSize: '20px', color: '#ff66cc' }).setOrigin(0.5);
            this.add.text(GW / 2, 46, '@' + window.NBA.auth.getUsername() + '  vs  @' + this.opponentName, {
                ...ts, fontSize: '12px', color: '#88aacc'
            }).setOrigin(0.5);

            this.statusText = this.add.text(GW / 2, 68, 'Draft up to ' + this.maxChips + ' chips', {
                ...ts, fontSize: '12px', color: '#aaaaaa'
            }).setOrigin(0.5);

            // Build hand from MP-eligible chips (unlocked + stock>0).
            const inv = window.NBA.inventory;
            const pool = inv.getMpChips();
            this.hand = [];
            if (pool.length === 0) {
                this.add.text(GW / 2, 200, 'NO MP CHIPS IN STOCK', { ...ts, fontSize: '14px', color: '#ff8888' }).setOrigin(0.5);
                this.add.text(GW / 2, 220, 'Visit the shop to buy chip stock.', { ...ts, fontSize: '11px', color: '#aaaaaa' }).setOrigin(0.5);
                this.add.text(GW / 2, 280, '[ BACK TO LOBBY ]', { ...ts, fontSize: '14px', color: '#88ccff' })
                    .setOrigin(0.5)
                    .setInteractive({ useHandCursor: true })
                    .on('pointerdown', () => {
                        window.NBA.net && window.NBA.net.send({ type: 'leave' });
                        this.scene.start('MultiplayerLobbyScene');
                    });
                return;
            }
            // Build a hand of 8 random chips from the player's MP pool.
            for (let i = 0; i < 8; i++) {
                this.hand.push(makeChipInstance(pool[Phaser.Math.Between(0, pool.length - 1)]));
            }

            this.selected = [];
            this.cards = [];
            this.buildCards();

            // OK button
            const okY = GH - 100;
            this.okBtn = this.add.rectangle(GW / 2, okY, 200, 44, 0x005544)
                .setStrokeStyle(2, 0x00ffcc).setInteractive({ useHandCursor: true });
            this.okText = this.add.text(GW / 2, okY, 'CONFIRM DRAFT', { ...ts, fontSize: '16px', color: '#00ffcc' }).setOrigin(0.5);
            this.okBtn.on('pointerdown', () => this.submit());

            // Wire WS handlers (lobby connected already)
            const net = window.NBA.net;
            this._unsub = [
                net.on('draft_received', () => this.statusText.setText('Waiting for opponent...').setColor('#ffcc66')),
                net.on('opponent_drafted', () => this.statusText.setText('Opponent ready! Submit your draft.').setColor('#ffcc66')),
                net.on('opponent_left', () => this.statusText.setText('Opponent left.').setColor('#ff8888')),
                net.on('match_end', (m) => this.handleMatchEnd(m)),
            ];
        }

        buildCards() {
            const ts = { fontFamily: 'monospace', stroke: '#000', strokeThickness: 2 };
            const cardW = 108, cardH = 60, cols = 4;
            const gapX = 8, gapY = 10;
            const top = 110;

            for (let i = 0; i < this.hand.length; i++) {
                const chip = this.hand[i];
                const def = CHIP_DEFS[chip.name];
                const cx = i % cols;
                const cy = Math.floor(i / cols);
                const x = (GW - cols * (cardW + gapX)) / 2 + cx * (cardW + gapX) + cardW / 2;
                const y = top + cy * (cardH + gapY) + cardH / 2;

                const bg = this.add.rectangle(x, y, cardW, cardH, 0x112233)
                    .setStrokeStyle(2, 0x334455).setInteractive({ useHandCursor: true });
                const nameT = this.add.text(x, y - 14, chip.name, { ...ts, fontSize: '12px', color: '#ffffff' }).setOrigin(0.5);
                const codeT = this.add.text(x + cardW / 2 - 6, y - 14, chip.code, { ...ts, fontSize: '14px', color: '#ffcc00' }).setOrigin(1, 0.5);
                const descT = this.add.text(x, y + 6, def.dmg > 0 ? def.dmg + ' DMG' : (chip.name === 'Recover30' ? 'HEAL' : 'UTIL'), {
                    ...ts, fontSize: '10px', color: '#889999'
                }).setOrigin(0.5);
                this.add.rectangle(x, y + 22, cardW - 8, 4, def.color);

                bg.on('pointerdown', () => {
                    const idx = this.selected.indexOf(i);
                    if (idx !== -1) this.selected.splice(idx, 1);
                    else if (this.selected.length < this.maxChips) {
                        const sc = this.selected.map(si => this.hand[si]);
                        if (canSelectChip(chip, sc)) this.selected.push(i);
                    }
                    this.refreshCards();
                });

                this.cards.push({ bg, nameT, codeT, descT });
            }
            this.refreshCards();
        }

        refreshCards() {
            const sc = this.selected.map(si => this.hand[si]);
            for (let i = 0; i < this.hand.length; i++) {
                const card = this.cards[i];
                const isSelected = this.selected.includes(i);
                const isSelectable = isSelected || (this.selected.length < this.maxChips && canSelectChip(this.hand[i], sc));
                if (isSelected) {
                    card.bg.setStrokeStyle(3, 0xffcc00).setFillStyle(0x2a2a00);
                } else if (isSelectable) {
                    card.bg.setStrokeStyle(2, 0x334455).setFillStyle(0x112233);
                } else {
                    card.bg.setStrokeStyle(2, 0x1a1a1a).setFillStyle(0x0a0a0a);
                }
            }
        }

        submit() {
            if (this.selected.length === 0) {
                this.statusText.setText('Select at least one chip.').setColor('#ff8888');
                return;
            }
            const chips = this.selected.map(si => this.hand[si]);
            window.NBA.net.send({ type: 'submit_draft', chips });
            this.okBtn.disableInteractive();
            this.okText.setColor('#666666');
            this.statusText.setText('Draft sent.').setColor('#ffcc66');
        }

        handleMatchEnd(m) {
            // Server is the source of truth — apply its inventory snapshot.
            if (m.inventory) window.NBA.inventory.applyServerState(m.inventory);

            this.cameras.main.fadeOut(300);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('MultiplayerResultScene', {
                    win: m.winner === 'self',
                    winnerUsername: m.winnerUsername,
                    hpSelf: m.hpSelf,
                    hpOpponent: m.hpOpponent,
                    log: m.log || [],
                    opponentName: this.opponentName,
                });
            });
        }

        shutdown() {
            if (this._unsub) for (const u of this._unsub) u && u();
        }
    }

    // ---- Result screen ----
    class MultiplayerResultScene extends Phaser.Scene {
        constructor() { super('MultiplayerResultScene'); }
        init(d) { this.data = d || {}; }
        create() {
            const ts = { fontFamily: 'monospace', stroke: '#000', strokeThickness: 2 };
            this.cameras.main.setBackgroundColor(this.data.win ? '#0a1e0a' : '#1e0a0a');
            this.add.text(GW / 2, 80, this.data.win ? 'VICTORY' : 'DEFEAT', {
                ...ts, fontSize: '44px', color: this.data.win ? '#88ff88' : '#ff5555'
            }).setOrigin(0.5);
            this.add.text(GW / 2, 140, '@' + window.NBA.auth.getUsername() + '   ' + this.data.hpSelf + ' HP', { ...ts, fontSize: '14px', color: '#cccccc' }).setOrigin(0.5);
            this.add.text(GW / 2, 162, '@' + (this.data.opponentName || '?') + '   ' + this.data.hpOpponent + ' HP', { ...ts, fontSize: '14px', color: '#cccccc' }).setOrigin(0.5);

            // Show the resolution log
            this.add.text(GW / 2, 200, 'EXCHANGE LOG', { ...ts, fontSize: '12px', color: '#888888' }).setOrigin(0.5);
            const lines = (this.data.log || []).slice(0, 10).map(e => {
                const who = e.side === 1 ? 'P1' : 'P2';
                return who + ' · ' + e.chip + ' · -' + (e.dmg || 0) + (e.heal ? ' (+' + e.heal + ' heal)' : '');
            });
            this.add.text(GW / 2, 220, lines.join('\n') || '(no exchanges)', {
                ...ts, fontSize: '11px', color: '#aaaaaa', align: 'center', lineSpacing: 2
            }).setOrigin(0.5, 0);

            const playAgain = this.add.text(GW / 2, GH - 110, '[ PLAY AGAIN ]', { ...ts, fontSize: '16px', color: '#88ccff' })
                .setOrigin(0.5)
                .setInteractive({ useHandCursor: true });
            playAgain.on('pointerdown', () => this.scene.start('MultiplayerLobbyScene'));

            const back = this.add.text(GW / 2, GH - 80, '[ BACK TO MENU ]', { ...ts, fontSize: '14px', color: '#88aacc' })
                .setOrigin(0.5)
                .setInteractive({ useHandCursor: true });
            back.on('pointerdown', () => {
                window.NBA.net && window.NBA.net.disconnect();
                this.scene.start('MenuScene');
            });
        }
    }

    window.NBA.MultiplayerBattleScene = MultiplayerBattleScene;
    window.NBA.MultiplayerResultScene = MultiplayerResultScene;
})();
