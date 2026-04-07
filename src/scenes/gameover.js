// ============================================================
// GAME OVER SCENE
// ============================================================
(function () {
    const { GW } = window.NBA;

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

            const restart = this.add.text(GW / 2, 460, '[ TAP TO RETURN ]', {
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

    window.NBA.GameOverScene = GameOverScene;
})();
