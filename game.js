// ============================================================
// NetBattle Arena — MMBN-style vertical grid battle game
// ============================================================

// ---- Constants ----
const GW = 480, GH = 720;
const COLS = 3, ROWS = 6;
const CELL_W = 96, CELL_H = 72;
const GRID_X = (GW - COLS * CELL_W) / 2;
const GRID_Y = 120;
const CUSTOM_GAUGE_MAX = 8000; // ms to fill custom gauge

function cellCenter(col, row) {
    return {
        x: GRID_X + col * CELL_W + CELL_W / 2,
        y: GRID_Y + row * CELL_H + CELL_H / 2
    };
}

// ---- Chip Definitions with letter codes (MMBN style) ----
// Selection rule: can multi-select chips with SAME NAME or SAME CODE
const CHIP_DEFS = {
    Cannon:    { name: 'Cannon',    dmg: 40, desc: 'High-damage shot',       color: 0xff6600, codes: ['A', 'B', 'C'] },
    Sword:     { name: 'Sword',     dmg: 30, desc: 'Slash 1 cell ahead',     color: 0xcc00ff, codes: ['S', 'L', 'B'] },
    Shockwave: { name: 'Shockwave', dmg: 20, desc: 'Wave up your column',    color: 0xffff00, codes: ['L', 'D', 'A'] },
    AreaSteal: { name: 'AreaSteal', dmg: 0,  desc: 'Steal enemy front row',  color: 0x00ff66, codes: ['C'] },
    Recover30: { name: 'Recover30', dmg: 0,  desc: 'Heal 30 HP',            color: 0x00ffcc, codes: ['A', 'C', 'F'] },
    Spreader:  { name: 'Spreader',  dmg: 20, desc: 'Explodes in + pattern',  color: 0xff3399, codes: ['M', 'N', 'B'] },
};
const CHIP_NAMES = Object.keys(CHIP_DEFS);

// Generate a chip instance with a random code from its pool
function makeChipInstance(name) {
    const def = CHIP_DEFS[name];
    const code = def.codes[Phaser.Math.Between(0, def.codes.length - 1)];
    return { name, code };
}

// Check if a chip can be added to current selection (MMBN rules)
function canSelectChip(chip, currentSelection) {
    if (currentSelection.length === 0) return true;
    // All same name?
    const allSameName = currentSelection.every(c => c.name === chip.name);
    if (allSameName && chip.name === currentSelection[0].name) return true;
    // All same code?
    const allSameCode = currentSelection.every(c => c.code === chip.code);
    if (allSameCode && chip.code === currentSelection[0].code) return true;
    // Can join if matches name of all OR code of all
    // Single chip selected: can match either name or code
    if (currentSelection.length === 1) {
        return chip.name === currentSelection[0].name || chip.code === currentSelection[0].code;
    }
    return false;
}

// Build waves for a given round (shared by BattleScene and CustomScreenScene)
function buildWavesForRound(r) {
    if (r === 1) return [[{ type: 'mettaur', col: 0, row: 1 }, { type: 'mettaur', col: 2, row: 1 }]];
    if (r === 2) return [[
        { type: 'mettaur', col: 0, row: 1 }, { type: 'mettaur', col: 2, row: 0 },
        { type: 'canodumb', col: 1, row: 0 }
    ]];
    if (r === 3) return [[
        { type: 'mettaur', col: 0, row: 1 }, { type: 'mettaur', col: 2, row: 1 },
        { type: 'swordy', col: 1, row: 0 }, { type: 'canodumb', col: 2, row: 0 }
    ]];
    // Single wave, more enemies as rounds increase (max 9 = full grid)
    const count = Math.min(3 + Math.floor(r / 2), 9);
    const wave = [];
    const taken = new Set();
    for (let i = 0; i < count; i++) {
        let col, row;
        do {
            col = Phaser.Math.Between(0, 2);
            row = Phaser.Math.Between(0, 2);
        } while (taken.has(col + ',' + row));
        taken.add(col + ',' + row);
        const roll = Math.random();
        let type;
        if (roll < 0.4) type = 'mettaur';
        else if (roll < 0.7) type = 'canodumb';
        else type = 'swordy';
        wave.push({ type, col, row });
    }
    return [wave];
}

// ============================================================
// BOOT SCENE — generate all textures
// ============================================================
class BootScene extends Phaser.Scene {
    constructor() { super('BootScene'); }

    create() {
        this.generateTextures();
        this.scene.start('MenuScene');
    }

    generateTextures() {
        const g = this.add.graphics();

        // Player panel (blue)
        g.clear();
        g.fillStyle(0x1a3a5c); g.fillRect(0, 0, CELL_W, CELL_H);
        g.lineStyle(2, 0x3388cc); g.strokeRect(1, 1, CELL_W - 2, CELL_H - 2);
        g.fillStyle(0x2255aa, 0.3); g.fillRect(4, 4, CELL_W - 8, CELL_H - 8);
        g.generateTexture('panel_player', CELL_W, CELL_H);

        // Enemy panel (red)
        g.clear();
        g.fillStyle(0x5c1a1a); g.fillRect(0, 0, CELL_W, CELL_H);
        g.lineStyle(2, 0xcc3333); g.strokeRect(1, 1, CELL_W - 2, CELL_H - 2);
        g.fillStyle(0xaa2222, 0.3); g.fillRect(4, 4, CELL_W - 8, CELL_H - 8);
        g.generateTexture('panel_enemy', CELL_W, CELL_H);

        // Stolen panel
        g.clear();
        g.fillStyle(0x1a5c3a); g.fillRect(0, 0, CELL_W, CELL_H);
        g.lineStyle(2, 0x33cc66); g.strokeRect(1, 1, CELL_W - 2, CELL_H - 2);
        g.generateTexture('panel_stolen', CELL_W, CELL_H);

        // Cracked panel
        g.clear();
        g.fillStyle(0x333333); g.fillRect(0, 0, CELL_W, CELL_H);
        g.lineStyle(2, 0x666666); g.strokeRect(1, 1, CELL_W - 2, CELL_H - 2);
        g.lineStyle(1, 0x888888);
        g.lineBetween(0, 0, CELL_W, CELL_H);
        g.lineBetween(CELL_W, 0, 0, CELL_H);
        g.generateTexture('panel_cracked', CELL_W, CELL_H);

        // Player sprite
        g.clear();
        g.fillStyle(0x0066ff); g.fillRect(14, 18, 20, 24);
        g.fillStyle(0x00aaff); g.fillCircle(24, 14, 12);
        g.fillStyle(0x0044cc); g.fillRect(14, 4, 20, 8);
        g.fillStyle(0x00ccff); g.fillRect(34, 22, 10, 8);
        g.fillStyle(0x0055dd); g.fillRect(16, 42, 6, 6); g.fillRect(26, 42, 6, 6);
        g.generateTexture('player', 48, 48);

        // Mettaur (visible, normal state)
        g.clear();
        g.fillStyle(0xffcc00);
        g.beginPath(); g.arc(20, 16, 18, Math.PI, 0, false); g.closePath(); g.fill();
        g.fillStyle(0x996600); g.fillRect(8, 16, 24, 16);
        g.fillStyle(0x000000); g.fillCircle(14, 22, 3); g.fillCircle(26, 22, 3);
        g.generateTexture('mettaur', 40, 40);

        // Mettaur hiding (hat only — invulnerable)
        g.clear();
        g.fillStyle(0xffcc00);
        g.beginPath(); g.arc(20, 22, 18, Math.PI, 0, false); g.closePath(); g.fill();
        g.fillStyle(0xddaa00); g.fillRect(4, 22, 32, 6);
        g.generateTexture('mettaur_hide', 40, 40);

        // Canodumb
        g.clear();
        g.fillStyle(0x888888); g.fillRect(6, 12, 28, 20);
        g.fillStyle(0x666666); g.fillRect(14, 4, 12, 12);
        g.fillStyle(0xaaaaaa); g.fillRect(16, 32, 8, 8);
        g.fillStyle(0xff0000); g.fillCircle(20, 20, 4);
        g.generateTexture('canodumb', 40, 40);

        // Swordy
        g.clear();
        g.fillStyle(0x8833cc); g.fillRect(10, 12, 20, 22);
        g.fillStyle(0xaa55ee); g.fillCircle(20, 10, 10);
        g.fillStyle(0xcccccc); g.fillRect(30, 8, 4, 28);
        g.fillStyle(0xffcc00); g.fillRect(28, 20, 8, 4);
        g.generateTexture('swordy', 40, 40);

        // Projectiles
        g.clear();
        g.fillStyle(0xffff00); g.fillCircle(6, 6, 5);
        g.generateTexture('buster_shot', 12, 12);

        g.clear();
        g.fillStyle(0x00ccff); g.fillCircle(10, 10, 9);
        g.fillStyle(0x00ffff); g.fillCircle(10, 10, 5);
        g.generateTexture('charge_shot', 20, 20);

        g.clear();
        g.fillStyle(0xff6600); g.fillRect(0, 0, 16, 12);
        g.fillStyle(0xffaa00); g.fillRect(2, 2, 12, 8);
        g.generateTexture('cannon_shot', 16, 12);

        g.clear();
        g.fillStyle(0xffff00, 0.8);
        g.fillRect(0, 0, CELL_W - 8, CELL_H - 8);
        g.lineStyle(2, 0xffaa00);
        g.lineBetween(0, 0, CELL_W - 8, CELL_H - 8);
        g.lineBetween(CELL_W - 8, 0, 0, CELL_H - 8);
        g.generateTexture('shockwave_fx', CELL_W - 8, CELL_H - 8);

        g.clear();
        g.fillStyle(0xcc00ff, 0.7);
        g.beginPath();
        g.moveTo(0, 0); g.lineTo(CELL_W, CELL_H / 3);
        g.lineTo(CELL_W, CELL_H * 2 / 3); g.lineTo(0, CELL_H);
        g.closePath(); g.fill();
        g.generateTexture('sword_slash', CELL_W, CELL_H);

        g.clear();
        g.fillStyle(0xff4400); g.fillCircle(24, 24, 20);
        g.fillStyle(0xffaa00); g.fillCircle(24, 24, 12);
        g.fillStyle(0xffff00); g.fillCircle(24, 24, 6);
        g.generateTexture('explosion', 48, 48);

        g.clear();
        g.fillStyle(0xff3399, 0.6); g.fillCircle(24, 24, 22);
        g.fillStyle(0xff66bb, 0.4); g.fillCircle(24, 24, 14);
        g.generateTexture('spreader_hit', 48, 48);

        g.destroy();
    }
}

// ============================================================
// MENU SCENE
// ============================================================
class MenuScene extends Phaser.Scene {
    constructor() { super('MenuScene'); }

    create() {
        this.cameras.main.setBackgroundColor('#0a0a1e');

        this.add.text(GW / 2, 140, 'NETBATTLE\nARENA', {
            fontFamily: 'monospace', fontSize: '52px', color: '#00ffcc',
            align: 'center', stroke: '#003322', strokeThickness: 4
        }).setOrigin(0.5);

        this.add.text(GW / 2, 260, 'ENDLESS MODE', {
            fontFamily: 'monospace', fontSize: '20px', color: '#00aaff'
        }).setOrigin(0.5);

        const start = this.add.text(GW / 2, 350, '[ TAP TO START ]', {
            fontFamily: 'monospace', fontSize: '22px', color: '#ffcc00'
        }).setOrigin(0.5);

        this.tweens.add({
            targets: start, alpha: 0.3, duration: 600,
            yoyo: true, repeat: -1
        });

        this.add.text(GW / 2, 440, [
            'Swipe — Move on grid',
            'Tap — Shoot (hold to charge)',
            'WASD also works on desktop',
            '',
            'Chip Reloader fills over time',
            'Tap gauge when full for new chips',
        ].join('\n'), {
            fontFamily: 'monospace', fontSize: '13px', color: '#556688',
            align: 'center', lineSpacing: 6
        }).setOrigin(0.5);

        // Fullscreen button
        const fsBtn = this.add.text(GW / 2, 590, '[ FULLSCREEN ]', {
            fontFamily: 'monospace', fontSize: '16px', color: '#888888',
            stroke: '#000', strokeThickness: 2
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        fsBtn.on('pointerdown', (pointer, lx, ly, event) => {
            event.stopPropagation();
            toggleFullscreen();
        });

        this.input.once('pointerdown', () => {
            this.scene.start('CustomScreenScene', {
                round: 1, score: 0, totalDeleted: 0,
                playerHp: 100, firstRound: true
            });
        });

        this.input.keyboard.once('keydown-ENTER', () => {
            this.scene.start('CustomScreenScene', {
                round: 1, score: 0, totalDeleted: 0,
                playerHp: 100, firstRound: true
            });
        });
    }
}

// ============================================================
// BATTLE SCENE — core gameplay
// ============================================================
class BattleScene extends Phaser.Scene {
    constructor() { super('BattleScene'); }

    init(data) {
        this.round = data.round || 1;
        this.score = data.score || 0;
        this.totalDeleted = data.totalDeleted || 0;
        this.equippedChips = (data.chipInventory || []).slice(0, 5);
        this.playerStartHp = data.playerHp || 100;
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
        // A touch can be a swipe (move) or a tap/hold (shoot/charge)
        const SWIPE_THRESHOLD = 30; // px minimum for a swipe
        this.activePointers = {}; // keyed by pointer.id

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
                    resolved: false // true once classified as swipe
                };
                // Start charging if no other pointer is already charging
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

            // Classify as swipe as soon as threshold is crossed (don't wait for release)
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
                // If this pointer was the charge pointer, transfer charge to another held pointer
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

            // If this pointer already resolved as a swipe, just clean up charge if needed
            if (info.resolved) {
                if (this.player.chargePointerId === pointer.id) {
                    this._transferOrStopCharge(pointer.id);
                }
                return;
            }

            // This pointer was a tap/hold (not a swipe) — fire
            if (this.player.chargePointerId === pointer.id && this.player.charging) {
                const chargeTime = this.time.now - this.player.chargeStart;
                if (chargeTime >= 600) {
                    this.fireChargeShot();
                } else {
                    this.fireBuster();
                }
                this._transferOrStopCharge(pointer.id);
            } else {
                // Secondary pointer released without swiping — quick tap = buster
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
        // HP bar (background + fill)
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

        // HP bar
        this.add.rectangle(12 + 75, 54, 150, 12, 0x001a15).setOrigin(0, 0.5).setDepth(20).setStrokeStyle(1, 0x00ffcc);
        this.hpBar = this.add.rectangle(12 + 76, 54, 148, 10, 0x00ff88).setOrigin(0, 0.5).setDepth(21);

        this.scoreText = this.add.text(GW - 12, 12, '', { ...ts, color: '#ffcc00', fontSize: '16px' }).setOrigin(1, 0).setDepth(20);
        this.roundText = this.add.text(GW - 12, 32, '', { ...ts, color: '#00aaff', fontSize: '14px' }).setOrigin(1, 0).setDepth(20);

        // Chip Reloader gauge — centered, in line with name/score
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

        // Make gauge tappable when ready
        this.customGaugeHit = this.add.rectangle(GW / 2, gaugeY, gaugeW, gaugeH + 10, 0x000000, 0)
            .setDepth(23).setInteractive({ useHandCursor: true });
        this.customGaugeHit.on('pointerdown', () => {
            if (this.customReady && !this.roundEnding && !this.customScreenOpen) {
                this.clickedUI = true;
                this.openMidRoundCustomScreen();
            }
        });

        // Fullscreen toggle button (top-right corner)
        const fsBtn = this.add.text(GW - 14, 52, '[ ]', {
            ...ts, color: '#888888', fontSize: '14px'
        }).setOrigin(1, 0).setDepth(23).setInteractive({ useHandCursor: true });
        fsBtn.on('pointerdown', () => {
            this.clickedUI = true;
            toggleFullscreen();
        });

        // Charge indicator
        this.chargeIndicator = this.add.text(GW / 2, GRID_Y + ROWS * CELL_H + 14, '', {
            ...ts, color: '#00ccff', fontSize: '12px'
        }).setOrigin(0.5, 0).setDepth(20);

        // On-screen chip buttons (below grid)
        this.chipButtons = [];
        this.buildChipButtons();

        this.updateHud();
    }

    buildChipButtons() {
        // Clear existing
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
        this.scoreText.setText('SCORE: ' + this.score);
        this.roundText.setText('ROUND: ' + this.round);

        // Custom gauge
        const gaugePct = Math.min(1, this.customGauge / CUSTOM_GAUGE_MAX);
        this.customBar.scaleX = gaugePct;
        this.customLabelText.setVisible(!this.customReady);
        this.customReadyText.setVisible(this.customReady);
        // Start flash tween once when ready
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

        // Charge indicator
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

        // Update chip buttons
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

        // Custom gauge fills over time
        if (!this.customReady) {
            this.customGauge += delta;
            if (this.customGauge >= CUSTOM_GAUGE_MAX) {
                this.customGauge = CUSTOM_GAUGE_MAX;
                this.customReady = true;
            }
        }

        this.updateHud();

        // Check win — use alive check, not array length
        const aliveEnemies = this.enemies.filter(e => e.alive);
        if (this.allWavesSpawned && aliveEnemies.length === 0 && !this.pendingWaveSpawn) {
            this.endRound(true);
        }
        // Check next wave needed
        if (!this.allWavesSpawned && aliveEnemies.length === 0 && !this.pendingWaveSpawn) {
            this.pendingWaveSpawn = true;
            this.time.delayedCall(800, () => this.spawnWave());
        }
        // Check lose
        if (this.player.hp <= 0) {
            this.endRound(false);
        }
    }

    // ---- Player input ----
    handlePlayerInput(time) {
        const p = this.player;
        const k = this.keys;

        // Movement — WASD only
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

        // SPACE — open custom screen mid-round
        if (Phaser.Input.Keyboard.JustDown(k.SPACE) && this.customReady) {
            this.openMidRoundCustomScreen();
        }
    }

    _transferOrStopCharge(releasedId) {
        // Find another active pointer that hasn't been resolved as a swipe
        for (const [id, info] of Object.entries(this.activePointers)) {
            if (Number(id) !== releasedId && !info.resolved) {
                this.player.chargePointerId = Number(id);
                this.player.chargeStart = info.startTime;
                this.player.charging = true;
                return;
            }
        }
        // No other pointer — stop charging
        this.player.charging = false;
        this.player.chargeStart = 0;
        this.player.chargePointerId = null;
    }

    fireBuster() {
        const pos = cellCenter(this.player.col, this.player.row);
        const spr = this.add.sprite(pos.x, pos.y - 20, 'buster_shot').setDepth(10);
        this.projectiles.push({
            sprite: spr, dx: 0, dy: -360, damage: 1,
            owner: 'player', type: 'pixel', alive: true
        });
    }

    fireChargeShot() {
        const pos = cellCenter(this.player.col, this.player.row);
        const spr = this.add.sprite(pos.x, pos.y - 20, 'charge_shot').setDepth(10);
        this.projectiles.push({
            sprite: spr, dx: 0, dy: -300, damage: 10,
            owner: 'player', type: 'pixel', alive: true
        });
        this.cameras.main.shake(80, 0.002);
        // Flash player
        this.player.sprite.setTint(0x00ffff);
        this.time.delayedCall(150, () => {
            if (this.player.sprite) this.player.sprite.clearTint();
        });
    }

    // ---- Mid-round Chip Select (overlay matching between-round layout) ----
    openMidRoundCustomScreen() {
        this.customScreenOpen = true;
        this.customReady = false;
        this.customGauge = 0;
        this.chipSelections++;
        const ts = { fontFamily: 'monospace', stroke: '#000', strokeThickness: 2 };
        const D = 40; // base depth for overlay

        // Dark overlay on enemy rows
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

        // Solid background covering player rows + below
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

        // Generate hand of 8
        const hand = [];
        for (let i = 0; i < 8; i++) {
            hand.push(makeChipInstance(CHIP_NAMES[Phaser.Math.Between(0, CHIP_NAMES.length - 1)]));
        }

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

        // OK button
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
                    sprite: spr, dx: 0, dy: -420, damage: 40,
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
                            // Sword bypasses nothing — hits even hiding mettaurs
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
                // Find the lowest enemy-owned row (but never row 0)
                // Steal only the unoccupied cells in that row
                let stolen = 0;
                for (let r = 2; r >= 1; r--) {
                    const hasEnemyCells = this.panels[r].some(p => p.owner === 'enemy');
                    if (!hasEnemyCells) continue;
                    // Found the target row — steal empty cells in it
                    for (let c = 0; c < COLS; c++) {
                        if (this.panels[r][c].owner !== 'enemy') continue;
                        const hasEnemy = this.enemies.some(e => e.alive && e.col === c && e.row === r);
                        if (!hasEnemy) {
                            this.panels[r][c].owner = 'player';
                            this.panelSprites[r][c].setTexture('panel_stolen');
                            stolen++;
                        }
                    }
                    break; // only one row per use
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
                    sprite: spr, dx: 0, dy: -300, damage: 20,
                    owner: 'player', type: 'spreader', alive: true,
                    col: p.col
                });
                break;
            }
        }
    }

    // ---- Projectile updates ----
    updateProjectiles(time, delta) {
        const dt = delta / 1000; // delta in seconds
        for (const proj of this.projectiles) {
            if (!proj.alive) continue;

            proj.sprite.x += proj.dx * dt;
            proj.sprite.y += proj.dy * dt;

            // Bounds check
            if (proj.sprite.y < GRID_Y - 20 || proj.sprite.y > GRID_Y + ROWS * CELL_H + 20 ||
                proj.sprite.x < GRID_X - 20 || proj.sprite.x > GRID_X + COLS * CELL_W + 20) {
                if (proj.type === 'spreader') this.spreaderExplode(proj);
                proj.alive = false;
                proj.sprite.destroy();
                continue;
            }

            // Determine grid cell
            const gc = Math.floor((proj.sprite.x - GRID_X) / CELL_W);
            const gr = Math.floor((proj.sprite.y - GRID_Y) / CELL_H);

            if (proj.owner === 'player') {
                for (const e of this.enemies) {
                    if (!e.alive) continue;
                    if (e.col === gc && e.row === gr) {
                        // Mettaur hide: only invulnerable to buster/pixel projectiles, not sword chip
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

            // Update HP bar position and fill
            e.hpBg.setPosition(e.sprite.x, e.sprite.y - 24);
            e.hpFill.setPosition(e.sprite.x, e.sprite.y - 24);
            e.hpFill.displayWidth = Math.max(0, (e.hp / e.maxHp) * 32);
        }
    }

    updateMettaur(e, time, delta) {
        // States: idle (visible, moves around) -> hiding (invuln, brief) -> peek (!) -> attack -> idle
        e.moveTimer += delta;

        if (e.state === 'idle') {
            e.sprite.setTexture('mettaur');

            // Move around while idle
            if (e.moveTimer >= 1000) {
                e.moveTimer = 0;
                if (Math.random() < 0.5) {
                    const nc = Phaser.Math.Clamp(e.col + Phaser.Math.Between(-1, 1), 0, 2);
                    const nr = Phaser.Math.Clamp(e.row + Phaser.Math.Between(-1, 1), 0, 2);
                    const occupied = this.enemies.some(oe => oe !== e && oe.alive && oe.col === nc && oe.row === nr);
                    if (!occupied) this.moveEntity(e, nc, nr);
                }
            }

            // After full interval, start attack cycle by hiding
            if (e.timer >= e.interval) {
                e.state = 'hiding';
                e.sprite.setTexture('mettaur_hide');
            }
        } else if (e.state === 'hiding') {
            // Invulnerable for 800ms, then peek
            if (e.timer >= e.interval + 800) {
                e.state = 'peek';
                e.sprite.setTexture('mettaur');
                // Show "!" warning indicator
                const pos = cellCenter(e.col, e.row);
                const warn = this.add.text(pos.x + 20, pos.y - 28, '!', {
                    fontFamily: 'monospace', fontSize: '22px', color: '#ff0000',
                    stroke: '#000', strokeThickness: 3, fontStyle: 'bold'
                }).setOrigin(0.5).setDepth(15);
                this.time.delayedCall(500, () => warn.destroy());
            }
        } else if (e.state === 'peek') {
            // Visible + vulnerable for 500ms, then fire
            if (e.timer >= e.interval + 1300) {
                e.state = 'attack';
                this.mettaurShockwave(e);
            }
        } else if (e.state === 'attack') {
            // Brief cooldown after attacking, then back to idle
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
                // Lock target column NOW so player can dodge
                e.targetCol = this.player.col;
                // Show targeting line on the locked column
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
                // Fire at the LOCKED column, not current player position
                const fireFrom = cellCenter(e.col, e.row);
                const fireTo = cellCenter(e.targetCol, e.row);
                const dx = (fireTo.x - fireFrom.x) / (ROWS * CELL_H / 150);
                const spr = this.add.sprite(fireFrom.x, fireFrom.y + 16, 'cannon_shot').setDepth(10).setTint(0xff4444);
                this.projectiles.push({
                    sprite: spr, dx: dx, dy: 150, damage: 15,
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
            // Roam on enemy side
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
                // Slash down their own column
                e.targetCol = e.col;
                const pos = cellCenter(e.col, e.row);
                const warn = this.add.text(pos.x + 20, pos.y - 28, '!', {
                    fontFamily: 'monospace', fontSize: '22px', color: '#cc00ff',
                    stroke: '#000', strokeThickness: 3, fontStyle: 'bold'
                }).setOrigin(0.5).setDepth(15);
                e._warnText = warn;
                // Show targeting line down the locked column
                for (let r = e.row + 1; r < ROWS; r++) {
                    const tp = cellCenter(e.targetCol, r);
                    const marker = this.add.rectangle(tp.x, tp.y, CELL_W - 10, CELL_H - 10, 0xcc00ff, 0.15)
                        .setDepth(3);
                    if (!e._markers) e._markers = [];
                    e._markers.push(marker);
                }
                // Flash sprite
                this.tweens.add({
                    targets: e.sprite, alpha: 0.4, duration: 80,
                    yoyo: true, repeat: 4
                });
            }
        } else if (e.state === 'telegraph') {
            // Wait 800ms then slash
            if (e.timer >= e.interval + 800) {
                e.state = 'attack';
                if (e._warnText) { e._warnText.destroy(); e._warnText = null; }
                if (e._markers) { e._markers.forEach(m => m.destroy()); e._markers = null; }
                e.sprite.setAlpha(1);
                // Send sword slash down the locked column — hits every cell
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
            // Clean up any lingering warning text/markers
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
            this.score += 100 * this.round;
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
            const elapsed = (this.time.now - this.roundStartTime) / 1000;
            let speedBonus = 0;
            if (elapsed < 20) speedBonus = 1000 * this.round;
            else if (elapsed < 30) speedBonus = 500 * this.round;
            this.score += speedBonus;

            const dmgPenalty = this.roundDamageTaken * 10;
            this.score = Math.max(0, this.score - dmgPenalty);

            // One-chip-select bonus
            let oneSelectBonus = 0;
            if (this.chipSelections === 1) {
                oneSelectBonus = 1500;
                this.score += oneSelectBonus;
            }

            const bonusParts = [];
            if (this.roundDamageTaken === 0) {
                this.score += 2000;
                bonusParts.push('PERFECT +2000');
            }
            if (oneSelectBonus > 0) {
                bonusParts.push('NO RELOAD +1500');
            }
            if (speedBonus > 0) {
                bonusParts.push('SPEED +' + speedBonus);
            }

            this.showMessage('ROUND CLEAR!', 1000);

            // Show bonuses one at a time in a feed
            for (let i = 0; i < bonusParts.length; i++) {
                this.time.delayedCall(800 + i * 600, () => {
                    this.showBonusLine(bonusParts[i], i);
                });
            }

            const totalDelay = 1500 + bonusParts.length * 600;
            this.time.delayedCall(totalDelay, () => {
                this.scene.start('CustomScreenScene', {
                    round: this.round + 1,
                    score: this.score,
                    totalDeleted: this.totalDeleted,
                    playerHp: this.player.hp
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
                this.scene.start('GameOverScene', {
                    score: this.score,
                    round: this.round,
                    totalDeleted: this.totalDeleted
                });
            });
        }
    }
}

// ============================================================
// CHIP SELECT SCENE — chip selection between rounds (shows board preview)
// ============================================================
class CustomScreenScene extends Phaser.Scene {
    constructor() { super('CustomScreenScene'); }

    init(data) {
        this.round = data.round || 1;
        this.score = data.score || 0;
        this.totalDeleted = data.totalDeleted || 0;
        this.playerHp = data.playerHp || 100;
    }

    create() {
        this.cameras.main.setBackgroundColor('#0e0e24');
        const ts = { fontFamily: 'monospace', stroke: '#000', strokeThickness: 2 };

        // ---- Draw the battle grid as preview ----
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const owner = r <= 2 ? 'enemy' : 'player';
                const pos = cellCenter(c, r);
                const key = owner === 'player' ? 'panel_player' : 'panel_enemy';
                this.add.sprite(pos.x, pos.y, key).setDepth(0).setAlpha(0.6);
            }
        }

        // Divider
        const divY = GRID_Y + 3 * CELL_H;
        const lineG = this.add.graphics();
        lineG.lineStyle(2, 0x446688, 0.4);
        lineG.lineBetween(GRID_X, divY, GRID_X + COLS * CELL_W, divY);

        // Player preview
        const pp = cellCenter(1, 5);
        this.add.sprite(pp.x, pp.y, 'player').setDepth(5).setAlpha(0.7);

        // Enemy preview — show first wave
        const waves = buildWavesForRound(this.round);
        const texMap = { mettaur: 'mettaur', canodumb: 'canodumb', swordy: 'swordy' };
        if (waves.length > 0) {
            for (const def of waves[0]) {
                const ep = cellCenter(def.col, def.row);
                this.add.sprite(ep.x, ep.y, texMap[def.type]).setDepth(5).setAlpha(0.7);
            }
        }
        // Wave count label
        this.add.text(GW / 2, GRID_Y - 10, `${waves.length} wave${waves.length > 1 ? 's' : ''} — Wave 1 shown`, {
            ...ts, fontSize: '10px', color: '#556688'
        }).setOrigin(0.5).setDepth(10);

        // Dark overlay on enemy area only (rows 0-2)
        const enemyBottom = GRID_Y + 3 * CELL_H;
        this.add.rectangle(GW / 2, GRID_Y + 1.5 * CELL_H, COLS * CELL_W + 20, 3 * CELL_H + 10, 0x000000, 0.45).setDepth(7);
        const waitText = this.add.text(GW / 2, GRID_Y + 1.5 * CELL_H, 'Waiting for\nchip selection...', {
            ...ts, fontSize: '14px', color: '#8888aa', align: 'center', lineSpacing: 4
        }).setOrigin(0.5).setDepth(8);
        this.tweens.add({
            targets: waitText, alpha: 0.4, duration: 800,
            yoyo: true, repeat: -1
        });

        // ---- HUD info ----
        this.add.text(12, 12, 'MegaMan.EXE', { ...ts, color: '#00ffcc', fontSize: '14px' });
        this.add.text(12, 30, `HP: ${this.playerHp} / 100`, { ...ts, color: '#ffffff', fontSize: '13px' });
        this.add.text(GW - 12, 12, 'SCORE: ' + this.score, { ...ts, color: '#ffcc00', fontSize: '14px' }).setOrigin(1, 0);
        this.add.text(GW - 12, 30, 'ROUND: ' + this.round, { ...ts, color: '#00aaff', fontSize: '13px' }).setOrigin(1, 0);

        // ---- Chip select area covers player rows + below ----
        const chipPanelTop = GRID_Y + 3 * CELL_H + 4;
        // Solid background for chip select area
        this.add.rectangle(GW / 2, (chipPanelTop + GH) / 2, GW, GH - chipPanelTop, 0x0a1428).setDepth(9);

        this.add.text(GW / 2, chipPanelTop + 10, 'CHIP SELECT', {
            ...ts, fontSize: '18px', color: '#00ffcc'
        }).setOrigin(0.5).setDepth(10);

        this.add.text(GW / 2, chipPanelTop + 32, 'Select chips with same name or same code', {
            ...ts, fontSize: '10px', color: '#556677'
        }).setOrigin(0.5).setDepth(10);

        // ---- Chip cards ----
        this.hand = [];
        for (let i = 0; i < 8; i++) {
            this.hand.push(makeChipInstance(CHIP_NAMES[Phaser.Math.Between(0, CHIP_NAMES.length - 1)]));
        }

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

        // OK button
        const okY = chipAreaY + 2 * (cardH + gapY) + 24;
        const okBtn = this.add.rectangle(GW / 2, okY, 160, 40, 0x005544)
            .setStrokeStyle(2, 0x00ffcc).setDepth(10).setInteractive({ useHandCursor: true });
        this.add.text(GW / 2, okY, 'OK', {
            ...ts, fontSize: '22px', color: '#00ffcc'
        }).setOrigin(0.5).setDepth(11);

        okBtn.on('pointerdown', () => this.confirm());
        this.input.keyboard.once('keydown-ENTER', () => this.confirm());
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
            score: this.score,
            totalDeleted: this.totalDeleted,
            chipInventory: chips,
            playerHp: this.playerHp
        });
    }
}

// ============================================================
// GAME OVER SCENE
// ============================================================
class GameOverScene extends Phaser.Scene {
    constructor() { super('GameOverScene'); }

    init(data) {
        this.finalScore = data.score || 0;
        this.finalRound = data.round || 1;
        this.totalDeleted = data.totalDeleted || 0;
    }

    create() {
        this.cameras.main.setBackgroundColor('#0a0008');

        this.add.text(GW / 2, 120, 'DELETED', {
            fontFamily: 'monospace', fontSize: '48px', color: '#ff3344',
            stroke: '#440000', strokeThickness: 4
        }).setOrigin(0.5);

        this.add.text(GW / 2, 230, 'FINAL SCORE', {
            fontFamily: 'monospace', fontSize: '16px', color: '#888888'
        }).setOrigin(0.5);

        this.add.text(GW / 2, 270, '' + this.finalScore, {
            fontFamily: 'monospace', fontSize: '40px', color: '#ffcc00',
            stroke: '#332200', strokeThickness: 3
        }).setOrigin(0.5);

        this.add.text(GW / 2, 340, [
            'Round: ' + this.finalRound,
            'Enemies Deleted: ' + this.totalDeleted,
        ].join('\n'), {
            fontFamily: 'monospace', fontSize: '16px', color: '#66aacc',
            align: 'center', lineSpacing: 8
        }).setOrigin(0.5);

        const restart = this.add.text(GW / 2, 460, '[ TAP TO RETRY ]', {
            fontFamily: 'monospace', fontSize: '22px', color: '#ffcc00'
        }).setOrigin(0.5);

        this.tweens.add({
            targets: restart, alpha: 0.3, duration: 600,
            yoyo: true, repeat: -1
        });

        this.input.once('pointerdown', () => {
            this.scene.start('MenuScene');
        });
        this.input.keyboard.once('keydown-ENTER', () => {
            this.scene.start('MenuScene');
        });
    }
}

// ============================================================
// PHASER CONFIG & LAUNCH
// ============================================================
// ---- Fullscreen toggle ----
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen().catch(() => {});
    }
}

const config = {
    type: Phaser.AUTO,
    width: GW,
    height: GH,
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
    scene: [BootScene, MenuScene, BattleScene, CustomScreenScene, GameOverScene]
};

const game = new Phaser.Game(config);
