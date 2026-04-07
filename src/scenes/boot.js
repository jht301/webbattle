// ============================================================
// BOOT SCENE — generate all textures
// ============================================================
(function () {
    const { CELL_W, CELL_H } = window.NBA;

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

    window.NBA.BootScene = BootScene;
})();
