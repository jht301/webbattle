// ============================================================
// NetBattle Arena — shared constants, chip definitions, helpers
// Loaded as a plain script (no modules); attaches to window.NBA.
// ============================================================
(function () {
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
        const allSameName = currentSelection.every(c => c.name === chip.name);
        if (allSameName && chip.name === currentSelection[0].name) return true;
        const allSameCode = currentSelection.every(c => c.code === chip.code);
        if (allSameCode && chip.code === currentSelection[0].code) return true;
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

    // Fullscreen toggle (used by Menu and Battle scenes)
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    }

    window.NBA = window.NBA || {};
    Object.assign(window.NBA, {
        GW, GH, COLS, ROWS, CELL_W, CELL_H, GRID_X, GRID_Y, CUSTOM_GAUGE_MAX,
        cellCenter, CHIP_DEFS, CHIP_NAMES, makeChipInstance, canSelectChip,
        buildWavesForRound, toggleFullscreen,
    });
})();
