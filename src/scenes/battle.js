// ============================================================
// BATTLE SCENE — core gameplay
// ============================================================
(function () {
    const {
        GW, GH, COLS, ROWS, CELL_W, CELL_H, GRID_X, GRID_Y, CUSTOM_GAUGE_MAX,
        cellCenter, CHIP_DEFS, CHIP_NAMES, makeChipInstance, canSelectChip,
        buildWavesForRound, toggleFullscreen,
    } = window.NBA;

    class BattleScene extends Phaser.Scene {
        constructor() { super('BattleScene'); }

        init(data) {
            this.round = data.round || 1;
            this.totalDeleted = data.totalDeleted || 0;
            this.equippedChips = (data.chipInventory || []).slice(0, 5);
            this.playerStartHp = data.playerHp || 100;
            // mode: 'training' (default, infinite rounds) or 'mp' (single-battle)
            this.mode = data.mode || 'training';
            // optional: where to go on win/lose. Defaults preserve legacy behavior.
            this.nextSceneOnWin = data.nextSceneOnWin || 'CustomScreenScene';
            this.nextSceneOnLose = data.nextSceneOnLose || 'GameOverScene';
        }

        create() {
            this.cameras.main.setBackgroundColor('#0e0e24');
            this.roundEnding = false;

            // Grid state
            this.panels = [];
            this.panelSprites = [];
            for (let r = 0; r < ROWS; r++) {
                this.panels[r] = [];
                this.panelSprites[r] = [];
                for (let c = 0; c < COLS; c++) {
                    const owner = r <= 2 ? 'enemy' : 'player';
                    this.panels[r][c] = { owner, state: 'normal' };
                    const pos = cellCenter(c, r);
                    const key = owner === 'player' ? 'panel_player' : 'panel_enemy';
                    const spr = this.add.sprite(pos.x, pos.y, key).setDepth(0);
                    this.panelSprites[r][c] = spr;
                }
            }

            // Divider line
            const divY = GRID_Y + 3 * CELL_H;
            const lineG = this.add.graphics();
            lineG.lineStyle(2, 0x446688, 0.6);
            lineG.lineBetween(GRID_X, divY, GRID_X + COLS * CELL_W, divY);
            lineG.setDepth(1);

            // Player
            this.player = {
                col: 1, row: 5,
                hp: this.playerStartHp, maxHp: 100,
                sprite: null,
                moveCd: 0,
                invuln: false, invulnUntil: 0,
                chargeStart: 0, charging: false, chargePointerId: null
            };
            const pp = cellCenter(1, 5);
            this.player.sprite = this.add.sprite(pp.x, pp.y, 'player').setDepth(5);

            // Enemies & projectiles
            this.enemies = [];
            this.projectiles = [];
            this.roundStartTime = this.time.now;
            this.roundDamageTaken = 0;
            this.roundEnemiesDeleted = 0;
            this.chipSelections = 1; // starts at 1 for the initial pre-round selection
            this.waveIndex = 0;
            this.pendingWaveSpawn = false;
            this.waves = this.buildWaves();
            this.allWavesSpawned = false;
            this.spawnWave();

            // Custom gauge
            this.customGauge = 0;
            this.customReady = false;

            // Input — WASD for movement (keyboard)
            this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE');

            // Track if a UI button was clicked so we don't also fire buster
            this.clickedUI = false;

            // Multi-touch: track each pointer independently
            const SWIPE_THRESHOLD = 30;
            this.activePointers = {};

            this.input.on('pointerdown', (pointer) => {
                if (this.roundEnding || this.customScreenOpen) return;
                this.time.delayedCall(0, () => {
                    if (this.clickedUI) {
                        this.clickedUI = false;
                        return;
                    }
                    this.activePointers[pointer.id] = {
                        startX: pointer.x,
                        startY: pointer.y,
                        startTime: this.time.now,
                        resolved: false
                    };
                    if (!this.player.charging) {
                        this.player.charging = true;
                        this.player.chargeStart = this.time.now;
                        this.player.chargePointerId = pointer.id;
                    }
                });
            });

            this.input.on('pointermove', (pointer) => {
                if (this.roundEnding || this.customScreenOpen) return;
                const info = this.activePointers[pointer.id];
                if (!info || info.resolved) return;

                const dx = pointer.x - info.startX;
                const dy = pointer.y - info.startY;
                const absDx = Math.abs(dx);
                const absDy = Math.abs(dy);

                if (absDx > SWIPE_THRESHOLD || absDy > SWIPE_THRESHOLD) {
                    info.resolved = true;
                    let dc = 0, dr = 0;
                    if (absDx > absDy) {
                        dc = dx > 0 ? 1 : -1;
                    } else {
                        dr = dy > 0 ? 1 : -1;
                    }
                    const nc = this.player.col + dc;
                    const nr = this.player.row + dr;
                    if (this.canMove(nc, nr, 'player')) {
                        this.moveEntity(this.player, nc, nr);
                    }
                    if (this.player.chargePointerId === pointer.id) {
                        this._transferOrStopCharge(pointer.id);
                    }
                }
            });

            this.input.on('pointerup', (pointer) => {
                if (this.roundEnding || this.customScreenOpen) return;
                const info = this.activePointers[pointer.id];
                delete this.activePointers[pointer.id];
                if (!info) return;

                if (info.resolved) {
                    if (this.player.chargePointerId === pointer.id) {
                        this._transferOrStopCharge(pointer.id);
                    }
                    return;
                }

                if (this.player.chargePointerId === pointer.id && this.player.charging) {
                    const chargeTime = this.time.now - this.player.chargeStart;
                    if (chargeTime >= 600) {
                        this.fireChargeShot();
                    } else {
                        this.fireBuster();
                    }
                    this._transferOrStopCharge(pointer.id);
                } else if (!this.player.charging) {
                    this.fireBuster();
                }
            });

            // Custom screen overlay state
            this.customScreenOpen = false;
            this.customScreenObjects = [];

            // HUD (includes chip buttons)
            this.buildHud();

            // Round announce
            this.showMessage('ROUND ' + this.round, 1200);
        }

        // ---- Grid helpers ----
        canMove(col, row, side) {
            if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
            const panel = this.panels[row][col];
            if (panel.state === 'broken') return false;
            if (side === 'player') return panel.owner === 'player';
            return row >= 0 && row <= 2;
        }

        moveEntity(entity, col, row) {
            entity.col = col;
            entity.row = row;
            const pos = cellCenter(col, row);
            this.tweens.add({
                targets: entity.sprite, x: pos.x, y: pos.y,
                duration: 60, ease: 'Power2'
            });
        }

        // ---- Wave building ----
        buildWaves() {
            return buildWavesForRound(this.round);
        }

        spawnWave() {
            this.pendingWaveSpawn = false;
            if (this.waveIndex >= this.waves.length) {
                this.allWavesSpawned = true;
                return;
            }
            const wave = this.waves[this.waveIndex];
            const hpMult = 1 + (this.round - 1) * 0.2;
            const spdMult = 1 / (1 + (this.round - 1) * 0.1);

            for (const def of wave) {
                const e = this.createEnemy(def.type, def.col, def.row, hpMult, spdMult);
                this.enemies.push(e);
            }
            this.waveIndex++;
        }

        createEnemy(type, col, row, hpMult, spdMult) {
            const pos = cellCenter(col, row);
            const baseStats = {
                mettaur:  { hp: 10, interval: 2500, tex: 'mettaur' },
                canodumb: { hp: 15, interval: 2000, tex: 'canodumb' },
                swordy:   { hp: 20, interval: 3000, tex: 'swordy' },
            }[type];

            const sprite = this.add.sprite(pos.x, pos.y, baseStats.tex).setDepth(5);
            const hpBg = this.add.rectangle(pos.x, pos.y - 24, 32, 4, 0x330000).setDepth(6);
            const hpFill = this.add.rectangle(pos.x, pos.y - 24, 32, 4, 0xff3333).setDepth(7).setOrigin(0.5);
            return {
                type, col, row, sprite, hpBg, hpFill,
                hp: Math.ceil(baseStats.hp * hpMult),
                maxHp: Math.ceil(baseStats.hp * hpMult),
                baseInterval: baseStats.interval,
                interval: Math.max(baseStats.interval * spdMult, baseStats.interval * 0.5),
                state: 'idle',
                timer: 0,
                moveTimer: 0,
                alive: true,
                homeCol: col, homeRow: row,
            };
        }

        // ---- HUD ----
        buildHud() {
            const ts = { fontFamily: 'monospace', fontSize: '15px', color: '#ffffff', stroke: '#000', strokeThickness: 2 };

            this.add.text(12, 12, 'MegaMan.EXE', { ...ts, color: '#00ffcc', fontSize: '14px' }).setDepth(20);
            this.hpText = this.add.text(12, 32, '', { ...ts, fontSize: '14px' }).setDepth(20);

            this.add.rectangle(12 + 75, 54, 150, 12, 0x001a15).setOrigin(0, 0.5).setDepth(20).setStrokeStyle(1, 0x00ffcc);
            this.hpBar = this.add.rectangle(12 + 76, 54, 148, 10, 0x00ff88).setOrigin(0, 0.5).setDepth(21);

            this.tokensText = this.add.text(GW - 12, 12, '', { ...ts, color: '#ffcc00', fontSize: '16px' }).setOrigin(1, 0).setDepth(20);
            this.roundText = this.add.text(GW - 12, 32, '', { ...ts, color: '#00aaff', fontSize: '14px' }).setOrigin(1, 0).setDepth(20);

            // Chip Reloader gauge
            const gaugeW = 160, gaugeH = 16, gaugeY = 20;
            this.add.rectangle(GW / 2, gaugeY, gaugeW, gaugeH, 0x220033)
                .setStrokeStyle(1, 0x6633aa).setDepth(20);
            this.customBar = this.add.rectangle(GW / 2 - gaugeW / 2 + 1, gaugeY, gaugeW - 2, gaugeH - 2, 0xcc66ff)
                .setOrigin(0, 0.5).setDepth(21);
            this.customBar.scaleX = 0;
            this.customLabelText = this.add.text(GW / 2, gaugeY, 'CHIP RELOADER', {
                ...ts, color: '#cc66ff', fontSize: '10px'
            }).setOrigin(0.5).setDepth(22);
            this.customReadyText = this.add.text(GW / 2, gaugeY, 'TAP / SPACE: New Chips!', {
                ...ts, color: '#ffcc00', fontSize: '11px'
            }).setOrigin(0.5).setDepth(22).setVisible(false);

            this.customGaugeHit = this.add.rectangle(GW / 2, gaugeY, gaugeW, gaugeH + 10, 0x000000, 0)
                .setDepth(23).setInteractive({ useHandCursor: true });
            this.customGaugeHit.on('pointerdown', () => {
                if (this.customReady && !this.roundEnding && !this.customScreenOpen) {
                    this.clickedUI = true;
                    this.openMidRoundCustomScreen();
                }
            });

            // Fullscreen toggle
            const fsBtn = this.add.text(GW - 14, 52, '[ ]', {
                ...ts, color: '#888888', fontSize: '14px'
            }).setOrigin(1, 0).setDepth(23).setInteractive({ useHandCursor: true });
            fsBtn.on('pointerdown', () => {
                this.clickedUI = true;
                toggleFullscreen();
            });

            this.chargeIndicator = this.add.text(GW / 2, GRID_Y + ROWS * CELL_H + 14, '', {
                ...ts, color: '#00ccff', fontSize: '12px'
            }).setOrigin(0.5, 0).setDepth(20);

            this.chipButtons = [];
            this.buildChipButtons();

            this.updateHud();
        }

        buildChipButtons() {
            for (const btn of this.chipButtons) {
                btn.bg.destroy();
                btn.label.destroy();
                btn.codeLabel.destroy();
            }
            this.chipButtons = [];

            const btnY = GH - 65;
            const btnW = 80;
            const btnH = 50;
            const totalW = this.equippedChips.length * (btnW + 8);
            const startX = (GW - totalW) / 2 + btnW / 2;

            for (let i = 0; i < this.equippedChips.length; i++) {
                const chip = this.equippedChips[i];
                const def = CHIP_DEFS[chip.name];
                const x = startX + i * (btnW + 8);

                const bg = this.add.rectangle(x, btnY, btnW, btnH, def.color, 0.3)
                    .setStrokeStyle(2, def.color).setDepth(20).setInteractive({ useHandCursor: true });

                const label = this.add.text(x, btnY - 6, chip.name, {
                    fontFamily: 'monospace', fontSize: '11px', color: '#ffffff',
                    stroke: '#000', strokeThickness: 2
                }).setOrigin(0.5).setDepth(21);

                const codeLabel = this.add.text(x, btnY + 14, chip.code, {
                    fontFamily: 'monospace', fontSize: '13px', color: '#ffcc00',
                    stroke: '#000', strokeThickness: 2
                }).setOrigin(0.5).setDepth(21);

                bg.on('pointerdown', () => {
                    if (this.roundEnding || this.customScreenOpen) return;
                    this.clickedUI = true;
                    this.useChip(i);
                });

                this.chipButtons.push({ bg, label, codeLabel, used: false });
            }
        }

        updateHud() {
            this.hpText.setText(`HP: ${this.player.hp} / ${this.player.maxHp}`);
            this.hpBar.displayWidth = Math.max(0, (this.player.hp / this.player.maxHp) * 148);
            const inv = window.NBA.inventory;
            const tok = inv && inv.getTokens ? inv.getTokens() : 0;
            this.tokensText.setText('⬢ ' + tok);
            this.roundText.setText('ROUND: ' + this.round);

            const gaugePct = Math.min(1, this.customGauge / CUSTOM_GAUGE_MAX);
            this.customBar.scaleX = gaugePct;
            this.customLabelText.setVisible(!this.customReady);
            this.customReadyText.setVisible(this.customReady);
            if (this.customReady && !this._customFlashStarted) {
                this._customFlashStarted = true;
                this.tweens.add({
                    targets: this.customReadyText,
                    alpha: { from: 1, to: 0.4 }, duration: 300,
                    yoyo: true, repeat: -1
                });
                this.tweens.addCounter({
                    from: 0, to: 1, duration: 400, yoyo: true, repeat: -1,
                    onUpdate: (tween) => {
                        const v = tween.getValue();
                        const color = v < 0.5 ? '#ffcc00' : '#ffffff';
                        this.customReadyText.setColor(color);
                    }
                });
            }
            if (!this.customReady) {
                this._customFlashStarted = false;
            }

            if (this.player.charging) {
                const elapsed = this.time.now - this.player.chargeStart;
                if (elapsed >= 600) {
                    this.chargeIndicator.setText('>> CHARGED <<').setColor('#00ffff');
                } else {
                    const dots = '.'.repeat(Math.floor(elapsed / 150) + 1);
                    this.chargeIndicator.setText('Charging' + dots).setColor('#00aacc');
                }
            } else {
                this.chargeIndicator.setText('');
            }

            for (let i = 0; i < this.chipButtons.length; i++) {
                const btn = this.chipButtons[i];
                if (btn.used) {
                    btn.bg.setAlpha(0.3);
                    btn.label.setAlpha(0.3);
                    btn.codeLabel.setAlpha(0.3);
                    btn.bg.disableInteractive();
                }
            }
        }

        showMessage(text, duration) {
            const msg = this.add.text(GW / 2, GH / 2 - 40, text, {
                fontFamily: 'monospace', fontSize: '32px', color: '#ffffff',
                stroke: '#000000', strokeThickness: 4
            }).setOrigin(0.5).setDepth(30).setAlpha(0);

            this.tweens.add({
                targets: msg, alpha: 1, scale: { from: 0.5, to: 1 },
                duration: 200, ease: 'Back.easeOut',
                onComplete: () => {
                    this.time.delayedCall(duration, () => {
                        this.tweens.add({
                            targets: msg, alpha: 0, duration: 200,
                            onComplete: () => msg.destroy()
                        });
                    });
                }
            });
        }

        showBonusLine(text, index) {
            const y = GH / 2 + 10 + index * 28;
            const t = this.add.text(GW / 2, y, text, {
                fontFamily: 'monospace', fontSize: '14px', color: '#ffcc00',
                stroke: '#000', strokeThickness: 2
            }).setOrigin(0.5).setDepth(30).setAlpha(0);
            this.tweens.add({
                targets: t, alpha: 1, x: { from: GW / 2 + 40, to: GW / 2 },
                duration: 250, ease: 'Power2',
                onComplete: () => {
                    this.time.delayedCall(1500, () => {
                        this.tweens.add({
                            targets: t, alpha: 0, duration: 300,
                            onComplete: () => t.destroy()
                        });
                    });
                }
            });
        }

        showDamageNumber(x, y, amount, color) {
            const t = this.add.text(x, y - 10, '-' + amount, {
                fontFamily: 'monospace', fontSize: '18px', color: color || '#ff4444',
                stroke: '#000', strokeThickness: 2
            }).setOrigin(0.5).setDepth(25);
            this.tweens.add({
                targets: t, y: y - 50, alpha: 0, duration: 700,
                onComplete: () => t.destroy()
            });
        }

        // ---- Main update loop ----
        update(time, delta) {
            if (this.roundEnding) return;
            if (this.customScreenOpen) return;

            this.handlePlayerInput(time);
            this.updateProjectiles(time, delta);
            this.updateEnemies(time, delta);
            this.checkPlayerInvuln(time);

            if (!this.customReady) {
                this.customGauge += delta;
                if (this.customGauge >= CUSTOM_GAUGE_MAX) {
                    this.customGauge = CUSTOM_GAUGE_MAX;
                    this.customReady = true;
                }
            }

            this.updateHud();

            const aliveEnemies = this.enemies.filter(e => e.alive);
            if (this.allWavesSpawned && aliveEnemies.length === 0 && !this.pendingWaveSpawn) {
                this.endRound(true);
            }
            if (!this.allWavesSpawned && aliveEnemies.length === 0 && !this.pendingWaveSpawn) {
                this.pendingWaveSpawn = true;
                this.time.delayedCall(800, () => this.spawnWave());
            }
            if (this.player.hp <= 0) {
                this.endRound(false);
            }
        }

        // ---- Player input ----
        handlePlayerInput(time) {
            const p = this.player;
            const k = this.keys;

            if (time > p.moveCd) {
                let dc = 0, dr = 0;
                if (k.A.isDown) dc = -1;
                else if (k.D.isDown) dc = 1;
                else if (k.W.isDown) dr = -1;
                else if (k.S.isDown) dr = 1;

                if (dc !== 0 || dr !== 0) {
                    const nc = p.col + dc, nr = p.row + dr;
                    if (this.canMove(nc, nr, 'player')) {
                        this.moveEntity(p, nc, nr);
                        p.moveCd = time + 150;
                    }
                }
            }

            if (Phaser.Input.Keyboard.JustDown(k.SPACE) && this.customReady) {
                this.openMidRoundCustomScreen();
            }
        }

        _transferOrStopCharge(releasedId) {
            for (const [id, info] of Object.entries(this.activePointers)) {
                if (Number(id) !== releasedId && !info.resolved) {
                    this.player.chargePointerId = Number(id);
                    this.player.chargeStart = info.startTime;
                    this.player.charging = true;
                    return;
                }
            }
            this.player.charging = false;
            this.player.chargeStart = 0;
            this.player.chargePointerId = null;
        }

        fireBuster() {
            const pos = cellCenter(this.player.col, this.player.row);
            const spr = this.add.sprite(pos.x, pos.y - 20, 'buster_shot').setDepth(10);
            this.projectiles.push({
                sprite: spr, dx: 0, dy: -1200, damage: 1,
                owner: 'player', type: 'pixel', alive: true
            });
        }

        fireChargeShot() {
            const pos = cellCenter(this.player.col, this.player.row);
            const spr = this.add.sprite(pos.x, pos.y - 20, 'charge_shot').setDepth(10);
            this.projectiles.push({
                sprite: spr, dx: 0, dy: -1000, damage: 10,
                owner: 'player', type: 'pixel', alive: true
            });
            this.cameras.main.shake(80, 0.002);
            this.player.sprite.setTint(0x00ffff);
            this.time.delayedCall(150, () => {
                if (this.player.sprite) this.player.sprite.clearTint();
            });
        }

        // ---- Mid-round Chip Select (overlay) ----
        openMidRoundCustomScreen() {
            this.customScreenOpen = true;
            this.customReady = false;
            this.customGauge = 0;
            this.chipSelections++;
            const ts = { fontFamily: 'monospace', stroke: '#000', strokeThickness: 2 };
            const D = 40;

            const enemyOverlay = this.add.rectangle(GW / 2, GRID_Y + 1.5 * CELL_H, COLS * CELL_W + 20, 3 * CELL_H + 10, 0x000000, 0.55).setDepth(D);
            this.customScreenObjects.push(enemyOverlay);

            const waitText = this.add.text(GW / 2, GRID_Y + 1.5 * CELL_H, 'Waiting for\nchip selection...', {
                ...ts, fontSize: '14px', color: '#8888aa', align: 'center', lineSpacing: 4
            }).setOrigin(0.5).setDepth(D + 1);
            this.customScreenObjects.push(waitText);
            this.tweens.add({
                targets: waitText, alpha: 0.4, duration: 800,
                yoyo: true, repeat: -1
            });

            const chipPanelTop = GRID_Y + 3 * CELL_H + 4;
            const panelBg = this.add.rectangle(GW / 2, (chipPanelTop + GH) / 2, GW, GH - chipPanelTop, 0x0a1428).setDepth(D);
            this.customScreenObjects.push(panelBg);

            const title = this.add.text(GW / 2, chipPanelTop + 10, 'CHIP SELECT', {
                ...ts, fontSize: '18px', color: '#00ffcc'
            }).setOrigin(0.5).setDepth(D + 1);
            this.customScreenObjects.push(title);

            const hint = this.add.text(GW / 2, chipPanelTop + 32, 'Select chips with same name or same code', {
                ...ts, fontSize: '10px', color: '#556677'
            }).setOrigin(0.5).setDepth(D + 1);
            this.customScreenObjects.push(hint);

            // Generate hand of 8 — pluggable source for later (training/MP filter)
            const hand = (typeof this.generateHand === 'function')
                ? this.generateHand(8)
                : Array.from({ length: 8 }, () =>
                    makeChipInstance(CHIP_NAMES[Phaser.Math.Between(0, CHIP_NAMES.length - 1)]));

            const selected = [];
            const cardObjects = [];

            const chipAreaY = chipPanelTop + 50;
            const cardW = 108, cardH = 58, cols = 4;
            const gapX = 8, gapY = 10;

            const updateCards = () => {
                const selectedChips = selected.map(si => hand[si]);
                for (let i = 0; i < hand.length; i++) {
                    const card = cardObjects[i];
                    const isSelected = selected.includes(i);
                    const isSelectable = isSelected || (selected.length < 5 && canSelectChip(hand[i], selectedChips));
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
            };

            for (let i = 0; i < hand.length; i++) {
                const chip = hand[i];
                const def = CHIP_DEFS[chip.name];
                const cx = i % cols;
                const cy = Math.floor(i / cols);
                const x = (GW - cols * (cardW + gapX)) / 2 + cx * (cardW + gapX) + cardW / 2;
                const y = chipAreaY + cy * (cardH + gapY) + cardH / 2;

                const bg = this.add.rectangle(x, y, cardW, cardH, 0x112233)
                    .setStrokeStyle(2, 0x334455).setDepth(D + 1)
                    .setInteractive({ useHandCursor: true });

                const nameT = this.add.text(x, y - 14, chip.name, {
                    ...ts, fontSize: '12px', color: '#ffffff'
                }).setOrigin(0.5).setDepth(D + 2);

                const codeT = this.add.text(x + cardW / 2 - 6, y - 14, chip.code, {
                    ...ts, fontSize: '14px', color: '#ffcc00'
                }).setOrigin(1, 0.5).setDepth(D + 2);

                const descT = this.add.text(x, y + 6, def.dmg > 0 ? `${def.dmg} DMG` : (chip.name === 'Recover30' ? 'HEAL' : 'UTIL'), {
                    ...ts, fontSize: '10px', color: '#889999'
                }).setOrigin(0.5).setDepth(D + 2);

                const iconBar = this.add.rectangle(x, y + 22, cardW - 8, 4, def.color).setDepth(D + 2);

                bg.on('pointerdown', () => {
                    this.clickedUI = true;
                    const idx = selected.indexOf(i);
                    if (idx !== -1) {
                        selected.splice(idx, 1);
                    } else if (selected.length < 5 && canSelectChip(chip, selected.map(si => hand[si]))) {
                        selected.push(i);
                    }
                    updateCards();
                });

                cardObjects.push({ bg, nameT, codeT, descT, iconBar });
                this.customScreenObjects.push(bg, nameT, codeT, descT, iconBar);
            }

            updateCards();

            const okY = chipAreaY + 2 * (cardH + gapY) + 24;
            const okBtn = this.add.rectangle(GW / 2, okY, 160, 40, 0x005544)
                .setStrokeStyle(2, 0x00ffcc).setDepth(D + 1).setInteractive({ useHandCursor: true });
            const okText = this.add.text(GW / 2, okY, 'OK', {
                ...ts, fontSize: '22px', color: '#00ffcc'
            }).setOrigin(0.5).setDepth(D + 2);
            this.customScreenObjects.push(okBtn, okText);

            okBtn.on('pointerdown', () => {
                this.clickedUI = true;
                const chips = selected.map(si => hand[si]);
                if (chips.length > 0) {
                    this.equippedChips = chips;
                }
                this.buildChipButtons();
                for (const obj of this.customScreenObjects) obj.destroy();
                this.customScreenObjects = [];
                this.customScreenOpen = false;
            });
        }

        useChip(index) {
            if (index >= this.equippedChips.length) return;
            if (this.chipButtons[index] && this.chipButtons[index].used) return;
            const chip = this.equippedChips[index];
            const name = chip.name;
            if (this.chipButtons[index]) this.chipButtons[index].used = true;

            const p = this.player;
            const pos = cellCenter(p.col, p.row);

            switch (name) {
                case 'Cannon': {
                    const spr = this.add.sprite(pos.x, pos.y - 20, 'cannon_shot').setDepth(10);
                    this.projectiles.push({
                        sprite: spr, dx: 0, dy: -1400, damage: 40,
                        owner: 'player', type: 'pixel', alive: true
                    });
                    break;
                }
                case 'Sword': {
                    const targetRow = p.row - 1;
                    if (targetRow >= 0) {
                        const tp = cellCenter(p.col, targetRow);
                        const slash = this.add.sprite(tp.x, tp.y, 'sword_slash').setDepth(15).setAlpha(0.8);
                        this.tweens.add({
                            targets: slash, alpha: 0, scale: 1.3, duration: 250,
                            onComplete: () => slash.destroy()
                        });
                        for (const e of this.enemies) {
                            if (e.col === p.col && e.row === targetRow && e.alive) {
                                this.damageEnemy(e, 30);
                            }
                        }
                    }
                    break;
                }
                case 'Shockwave': {
                    let currentRow = p.row - 1;
                    const col = p.col;
                    const step = () => {
                        if (currentRow < 0) return;
                        const cp = cellCenter(col, currentRow);
                        const fx = this.add.sprite(cp.x, cp.y, 'shockwave_fx').setDepth(12).setAlpha(0.7);
                        this.time.delayedCall(200, () => fx.destroy());
                        for (const e of this.enemies) {
                            if (e.col === col && e.row === currentRow && e.alive) {
                                this.damageEnemy(e, 20);
                            }
                        }
                        currentRow--;
                        this.time.delayedCall(180, step);
                    };
                    step();
                    break;
                }
                case 'AreaSteal': {
                    let stolen = 0;
                    for (let r = 2; r >= 1; r--) {
                        const hasEnemyCells = this.panels[r].some(p => p.owner === 'enemy');
                        if (!hasEnemyCells) continue;
                        for (let c = 0; c < COLS; c++) {
                            if (this.panels[r][c].owner !== 'enemy') continue;
                            const hasEnemy = this.enemies.some(e => e.alive && e.col === c && e.row === r);
                            if (!hasEnemy) {
                                this.panels[r][c].owner = 'player';
                                this.panelSprites[r][c].setTexture('panel_stolen');
                                stolen++;
                            }
                        }
                        break;
                    }
                    if (stolen > 0) {
                        this.showMessage('AREA STEAL!', 800);
                    } else {
                        this.showMessage('NO PANELS TO STEAL', 800);
                    }
                    break;
                }
                case 'Recover30': {
                    p.hp = Math.min(p.hp + 30, p.maxHp);
                    const heal = this.add.text(pos.x, pos.y - 10, '+30', {
                        fontFamily: 'monospace', fontSize: '20px', color: '#00ff88',
                        stroke: '#000', strokeThickness: 2
                    }).setOrigin(0.5).setDepth(25);
                    this.tweens.add({
                        targets: heal, y: pos.y - 50, alpha: 0, duration: 700,
                        onComplete: () => heal.destroy()
                    });
                    p.sprite.setTint(0x00ff88);
                    this.time.delayedCall(200, () => p.sprite.clearTint());
                    break;
                }
                case 'Spreader': {
                    const spr = this.add.sprite(pos.x, pos.y - 20, 'cannon_shot').setDepth(10).setTint(0xff3399);
                    this.projectiles.push({
                        sprite: spr, dx: 0, dy: -1000, damage: 20,
                        owner: 'player', type: 'spreader', alive: true,
                        col: p.col
                    });
                    break;
                }
            }
        }

        // ---- Projectile updates ----
        updateProjectiles(time, delta) {
            const dt = delta / 1000;
            for (const proj of this.projectiles) {
                if (!proj.alive) continue;

                proj.sprite.x += proj.dx * dt;
                proj.sprite.y += proj.dy * dt;

                if (proj.sprite.y < GRID_Y - 20 || proj.sprite.y > GRID_Y + ROWS * CELL_H + 20 ||
                    proj.sprite.x < GRID_X - 20 || proj.sprite.x > GRID_X + COLS * CELL_W + 20) {
                    if (proj.type === 'spreader') this.spreaderExplode(proj);
                    proj.alive = false;
                    proj.sprite.destroy();
                    continue;
                }

                const gc = Math.floor((proj.sprite.x - GRID_X) / CELL_W);
                const gr = Math.floor((proj.sprite.y - GRID_Y) / CELL_H);

                if (proj.owner === 'player') {
                    for (const e of this.enemies) {
                        if (!e.alive) continue;
                        if (e.col === gc && e.row === gr) {
                            if (e.type === 'mettaur' && e.state === 'hiding') continue;
                            if (proj.type === 'spreader') {
                                this.spreaderExplode(proj);
                            } else {
                                this.damageEnemy(e, proj.damage);
                            }
                            proj.alive = false;
                            proj.sprite.destroy();
                            break;
                        }
                    }
                } else if (proj.owner === 'enemy') {
                    const p = this.player;
                    if (p.col === gc && p.row === gr) {
                        this.damagePlayer(proj.damage);
                        proj.alive = false;
                        proj.sprite.destroy();
                    }
                }
            }
            this.projectiles = this.projectiles.filter(p => p.alive);
        }

        spreaderExplode(proj) {
            const gc = Math.floor((proj.sprite.x - GRID_X) / CELL_W);
            const gr = Math.floor((proj.sprite.y - GRID_Y) / CELL_H);
            const cells = [
                [gc, gr], [gc - 1, gr], [gc + 1, gr], [gc, gr - 1], [gc, gr + 1]
            ];
            for (const [c, r] of cells) {
                if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
                const cp = cellCenter(c, r);
                const fx = this.add.sprite(cp.x, cp.y, 'spreader_hit').setDepth(12);
                this.tweens.add({
                    targets: fx, alpha: 0, scale: 1.5, duration: 300,
                    onComplete: () => fx.destroy()
                });
                for (const e of this.enemies) {
                    if (e.alive && e.col === c && e.row === r) {
                        if (e.type === 'mettaur' && e.state === 'hiding') continue;
                        this.damageEnemy(e, 20);
                    }
                }
            }
        }

        // ---- Enemy AI ----
        updateEnemies(time, delta) {
            for (const e of this.enemies) {
                if (!e.alive) continue;
                e.timer += delta;

                switch (e.type) {
                    case 'mettaur': this.updateMettaur(e, time, delta); break;
                    case 'canodumb': this.updateCanodumb(e, time, delta); break;
                    case 'swordy': this.updateSwordy(e, time, delta); break;
                }

                e.hpBg.setPosition(e.sprite.x, e.sprite.y - 24);
                e.hpFill.setPosition(e.sprite.x, e.sprite.y - 24);
                e.hpFill.displayWidth = Math.max(0, (e.hp / e.maxHp) * 32);
            }
        }

        updateMettaur(e, time, delta) {
            e.moveTimer += delta;

            if (e.state === 'idle') {
                e.sprite.setTexture('mettaur');

                if (e.moveTimer >= 1000) {
                    e.moveTimer = 0;
                    if (Math.random() < 0.5) {
                        const nc = Phaser.Math.Clamp(e.col + Phaser.Math.Between(-1, 1), 0, 2);
                        const nr = Phaser.Math.Clamp(e.row + Phaser.Math.Between(-1, 1), 0, 2);
                        const occupied = this.enemies.some(oe => oe !== e && oe.alive && oe.col === nc && oe.row === nr);
                        if (!occupied) this.moveEntity(e, nc, nr);
                    }
                }

                if (e.timer >= e.interval) {
                    e.state = 'hiding';
                    e.sprite.setTexture('mettaur_hide');
                }
            } else if (e.state === 'hiding') {
                if (e.timer >= e.interval + 800) {
                    e.state = 'peek';
                    e.sprite.setTexture('mettaur');
                    const pos = cellCenter(e.col, e.row);
                    const warn = this.add.text(pos.x + 20, pos.y - 28, '!', {
                        fontFamily: 'monospace', fontSize: '22px', color: '#ff0000',
                        stroke: '#000', strokeThickness: 3, fontStyle: 'bold'
                    }).setOrigin(0.5).setDepth(15);
                    this.time.delayedCall(500, () => warn.destroy());
                }
            } else if (e.state === 'peek') {
                if (e.timer >= e.interval + 1300) {
                    e.state = 'attack';
                    this.mettaurShockwave(e);
                }
            } else if (e.state === 'attack') {
                if (e.timer >= e.interval + 1900) {
                    e.state = 'idle';
                    e.timer = 0;
                    e.moveTimer = 0;
                }
            }
        }

        mettaurShockwave(e) {
            let currentRow = e.row + 1;
            const col = e.col;
            const step = () => {
                if (currentRow >= ROWS) return;
                const cp = cellCenter(col, currentRow);
                const fx = this.add.sprite(cp.x, cp.y, 'shockwave_fx').setDepth(12).setAlpha(0.6);
                this.time.delayedCall(200, () => fx.destroy());
                if (this.player.col === col && this.player.row === currentRow) {
                    this.damagePlayer(10);
                }
                currentRow++;
                this.time.delayedCall(180, step);
            };
            step();
        }

        updateCanodumb(e, time, delta) {
            if (e.state === 'idle') {
                if (e.timer >= e.interval - 500) {
                    e.state = 'telegraph';
                    e.sprite.setTint(0xff4444);
                    e.targetCol = this.player.col;
                    const targetPos = cellCenter(e.targetCol, e.row);
                    const warn = this.add.text(targetPos.x, targetPos.y + 28, '!', {
                        fontFamily: 'monospace', fontSize: '18px', color: '#ff4444',
                        stroke: '#000', strokeThickness: 2, fontStyle: 'bold'
                    }).setOrigin(0.5).setDepth(15);
                    e._warnText = warn;
                }
            } else if (e.state === 'telegraph') {
                if (e.timer >= e.interval) {
                    e.sprite.clearTint();
                    if (e._warnText) { e._warnText.destroy(); e._warnText = null; }
                    const fireFrom = cellCenter(e.col, e.row);
                    const fireTo = cellCenter(e.targetCol, e.row);
                    const dx = (fireTo.x - fireFrom.x) / (ROWS * CELL_H / 500);
                    const spr = this.add.sprite(fireFrom.x, fireFrom.y + 16, 'cannon_shot').setDepth(10).setTint(0xff4444);
                    this.projectiles.push({
                        sprite: spr, dx: dx, dy: 500, damage: 15,
                        owner: 'enemy', type: 'pixel', alive: true
                    });
                    e.timer = 0;
                    e.state = 'idle';
                }
            }
        }

        updateSwordy(e, time, delta) {
            e.moveTimer += delta;

            if (e.state === 'idle') {
                if (e.moveTimer >= 1000) {
                    e.moveTimer = 0;
                    if (Math.random() < 0.5) {
                        const nc = Phaser.Math.Clamp(e.col + Phaser.Math.Between(-1, 1), 0, 2);
                        const nr = Phaser.Math.Clamp(e.row + Phaser.Math.Between(-1, 1), 0, 2);
                        const occupied = this.enemies.some(oe => oe !== e && oe.alive && oe.col === nc && oe.row === nr);
                        if (!occupied) this.moveEntity(e, nc, nr);
                    }
                }
                if (e.timer >= e.interval) {
                    e.state = 'telegraph';
                    e.targetCol = e.col;
                    const pos = cellCenter(e.col, e.row);
                    const warn = this.add.text(pos.x + 20, pos.y - 28, '!', {
                        fontFamily: 'monospace', fontSize: '22px', color: '#cc00ff',
                        stroke: '#000', strokeThickness: 3, fontStyle: 'bold'
                    }).setOrigin(0.5).setDepth(15);
                    e._warnText = warn;
                    for (let r = e.row + 1; r < ROWS; r++) {
                        const tp = cellCenter(e.targetCol, r);
                        const marker = this.add.rectangle(tp.x, tp.y, CELL_W - 10, CELL_H - 10, 0xcc00ff, 0.15)
                            .setDepth(3);
                        if (!e._markers) e._markers = [];
                        e._markers.push(marker);
                    }
                    this.tweens.add({
                        targets: e.sprite, alpha: 0.4, duration: 80,
                        yoyo: true, repeat: 4
                    });
                }
            } else if (e.state === 'telegraph') {
                if (e.timer >= e.interval + 800) {
                    e.state = 'attack';
                    if (e._warnText) { e._warnText.destroy(); e._warnText = null; }
                    if (e._markers) { e._markers.forEach(m => m.destroy()); e._markers = null; }
                    e.sprite.setAlpha(1);
                    this.swordySlash(e);
                }
            } else if (e.state === 'attack') {
                if (e.timer >= e.interval + 1400) {
                    e.state = 'idle';
                    e.timer = 0;
                    e.moveTimer = 0;
                }
            }
        }

        swordySlash(e) {
            let currentRow = e.row + 1;
            const col = e.targetCol;
            const step = () => {
                if (currentRow >= ROWS) return;
                const cp = cellCenter(col, currentRow);
                const fx = this.add.sprite(cp.x, cp.y, 'sword_slash').setDepth(12).setAlpha(0.7);
                this.tweens.add({
                    targets: fx, alpha: 0, scale: 1.2, duration: 200,
                    onComplete: () => fx.destroy()
                });
                if (this.player.col === col && this.player.row === currentRow) {
                    this.damagePlayer(20);
                }
                currentRow++;
                this.time.delayedCall(120, step);
            };
            step();
            this.cameras.main.shake(150, 0.004);
        }

        // ---- Damage ----
        damageEnemy(e, amount) {
            e.hp -= amount;
            const pos = cellCenter(e.col, e.row);
            this.showDamageNumber(pos.x, pos.y, amount, '#ffff00');
            e.sprite.setTint(0xffffff);
            this.time.delayedCall(80, () => {
                if (e.alive && e.sprite && e.sprite.active) e.sprite.clearTint();
            });

            if (e.hp <= 0) {
                e.alive = false;
                if (e._warnText) { e._warnText.destroy(); e._warnText = null; }
                if (e._markers) { e._markers.forEach(m => m.destroy()); e._markers = null; }
                const expl = this.add.sprite(pos.x, pos.y, 'explosion').setDepth(15);
                this.tweens.add({
                    targets: expl, scale: { from: 0.5, to: 1.5 }, alpha: { from: 1, to: 0 },
                    duration: 400, onComplete: () => expl.destroy()
                });
                e.sprite.destroy();
                e.hpBg.destroy();
                e.hpFill.destroy();
                this.roundEnemiesDeleted++;
                this.totalDeleted++;
            }
        }

        damagePlayer(amount) {
            const p = this.player;
            if (p.invuln) return;
            p.hp -= amount;
            this.roundDamageTaken += amount;
            const pos = cellCenter(p.col, p.row);
            this.showDamageNumber(pos.x, pos.y, amount, '#ff4444');
            p.invuln = true;
            p.invulnUntil = this.time.now + 1000;
            this.tweens.add({
                targets: p.sprite, alpha: 0.3, duration: 80,
                yoyo: true, repeat: 5
            });
            this.cameras.main.shake(200, 0.005);
        }

        checkPlayerInvuln(time) {
            if (this.player.invuln && time >= this.player.invulnUntil) {
                this.player.invuln = false;
                this.player.sprite.setAlpha(1);
            }
        }

        // ---- Round end ----
        endRound(won) {
            if (this.roundEnding) return;
            this.roundEnding = true;

            if (won) {
                // ---- Training-mode token rewards ----
                // MP rewards are handled server-side in match.js.
                const bonusParts = [];
                if (this.mode === 'training') {
                    const elapsed = (this.time.now - this.roundStartTime) / 1000;
                    const perfect = this.roundDamageTaken === 0;
                    const noReload = this.chipSelections === 1;

                    const base      = 10 + this.round * 5;
                    const killBonus = this.roundEnemiesDeleted * this.round;
                    let speedBonus  = 0;
                    if (elapsed < 20)      speedBonus = this.round * 10;
                    else if (elapsed < 30) speedBonus = this.round * 5;
                    const perfectBonus  = perfect ? 25 : 0;
                    const noReloadBonus = noReload ? 15 : 0;
                    const dmgPenalty    = Math.floor(this.roundDamageTaken / 10);

                    const subtotal = base + killBonus + speedBonus + perfectBonus + noReloadBonus;
                    const earned = Math.max(0, subtotal - dmgPenalty);

                    bonusParts.push('CLEAR +' + base);
                    if (killBonus > 0)     bonusParts.push('KILLS +' + killBonus);
                    if (speedBonus > 0)    bonusParts.push('SPEED +' + speedBonus);
                    if (perfectBonus > 0)  bonusParts.push('PERFECT +' + perfectBonus);
                    if (noReloadBonus > 0) bonusParts.push('NO RELOAD +' + noReloadBonus);
                    if (dmgPenalty > 0)    bonusParts.push('DAMAGE -' + dmgPenalty);
                    bonusParts.push('TOTAL ⬢' + earned);

                    const inv = window.NBA.inventory;
                    if (inv && earned > 0) inv.addTokens(earned);
                }

                this.showMessage('ROUND CLEAR!', 1000);

                for (let i = 0; i < bonusParts.length; i++) {
                    this.time.delayedCall(800 + i * 600, () => {
                        this.showBonusLine(bonusParts[i], i);
                    });
                }

                const totalDelay = 1500 + bonusParts.length * 600;
                this.time.delayedCall(totalDelay, () => {
                    this.scene.start(this.nextSceneOnWin, {
                        round: this.round + 1,
                        totalDeleted: this.totalDeleted,
                        playerHp: this.player.hp,
                        mode: this.mode,
                    });
                });
            } else {
                this.showMessage('DELETED', 1500);
                this.player.sprite.setTint(0xff0000);
                this.tweens.add({
                    targets: this.player.sprite,
                    alpha: 0, scale: 1.5, duration: 600
                });

                this.time.delayedCall(2500, () => {
                    this.scene.start(this.nextSceneOnLose, {
                        round: this.round,
                        totalDeleted: this.totalDeleted,
                    });
                });
            }
        }
    }

    window.NBA.BattleScene = BattleScene;
})();
