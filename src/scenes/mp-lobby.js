// ============================================================
// MULTIPLAYER LOBBY — quick match, friend room create/join.
// Connects to backend on enter; navigates to MultiplayerBattleScene
// on `match_start`.
// ============================================================
(function () {
    const { GW, GH } = window.NBA;

    class MultiplayerLobbyScene extends Phaser.Scene {
        constructor() { super('MultiplayerLobbyScene'); }

        init(data) {
            this.autoJoinRoom = data && data.autoJoinRoom;
        }

        create() {
            this.cameras.main.setBackgroundColor('#0a0a1e');
            const ts = { fontFamily: 'monospace', stroke: '#000', strokeThickness: 2 };

            this.add.text(GW / 2, 30, 'MULTIPLAYER', {
                ...ts, fontSize: '26px', color: '#ff66cc'
            }).setOrigin(0.5);

            const back = this.add.text(12, 12, '< BACK', {
                ...ts, fontSize: '14px', color: '#88ccff'
            }).setInteractive({ useHandCursor: true });
            back.on('pointerdown', () => {
                window.NBA.net && window.NBA.net.disconnect();
                this.scene.start('MenuScene');
            });

            const cfg = window.NBA.config;
            if (!cfg || !cfg.SERVER_URL) {
                this.add.text(GW / 2, 200, 'No backend configured.\nEdit src/config.js\nto set SERVER_URL.', {
                    ...ts, fontSize: '14px', color: '#ff8888', align: 'center', lineSpacing: 4
                }).setOrigin(0.5);
                return;
            }

            this.statusText = this.add.text(GW / 2, 70, 'Connecting...', {
                ...ts, fontSize: '12px', color: '#aaaaaa'
            }).setOrigin(0.5);

            this.buildButtons();
            this.connect();
        }

        buildButtons() {
            const ts = { fontFamily: 'monospace', stroke: '#000', strokeThickness: 2 };

            const mkBtn = (y, label, color, onClick) => {
                const bg = this.add.rectangle(GW / 2, y, 240, 44, 0x0a1428)
                    .setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(color).color)
                    .setInteractive({ useHandCursor: true });
                this.add.text(GW / 2, y, label, {
                    ...ts, fontSize: '18px', color
                }).setOrigin(0.5);
                bg.on('pointerdown', onClick);
                return bg;
            };

            mkBtn(140, 'QUICK MATCH', '#66ccff', () => this.quickMatch());
            mkBtn(200, 'CREATE FRIEND ROOM', '#ffcc66', () => this.createRoom());
            mkBtn(260, 'JOIN FRIEND ROOM', '#ff66cc', () => this.joinRoomPrompt());

            // Show join code area when room is created
            this.codeText = this.add.text(GW / 2, 340, '', {
                ...ts, fontSize: '32px', color: '#ffcc00', letterSpacing: 6
            }).setOrigin(0.5);
            this.codeHint = this.add.text(GW / 2, 380, '', {
                ...ts, fontSize: '11px', color: '#88aacc'
            }).setOrigin(0.5);
        }

        async connect() {
            try {
                await window.NBA.net.connect();
                this.statusText.setText('Connected as @' + window.NBA.auth.getUsername()).setColor('#88ffaa');

                window.NBA.net.on('hello', () => {});
                window.NBA.net.on('queued', () => this.statusText.setText('Waiting for opponent...').setColor('#ffcc66'));
                window.NBA.net.on('friend_room_created', (m) => {
                    this.codeText.setText(m.code);
                    this.codeHint.setText('Share this code with a friend');
                    this.statusText.setText('Waiting for friend...').setColor('#ffcc66');
                });
                window.NBA.net.on('match_start', (m) => {
                    this.scene.start('MultiplayerBattleScene', {
                        opponentName: m.opponent.username,
                        startingHp: m.startingHp,
                        maxChips: m.maxChips,
                    });
                });
                window.NBA.net.on('error', (m) => {
                    this.statusText.setText('Error: ' + m.message).setColor('#ff8888');
                });

                if (this.autoJoinRoom) {
                    window.NBA.net.send({ type: 'join_friend_room', code: this.autoJoinRoom });
                }
            } catch (e) {
                this.statusText.setText('Connection failed: ' + (e.message || e)).setColor('#ff8888');
            }
        }

        quickMatch() {
            if (!window.NBA.net.isConnected()) return;
            window.NBA.net.send({ type: 'join_public_queue' });
        }

        createRoom() {
            if (!window.NBA.net.isConnected()) return;
            window.NBA.net.send({ type: 'create_friend_room' });
        }

        joinRoomPrompt() {
            if (!window.NBA.net.isConnected()) return;
            const code = (typeof prompt === 'function')
                ? prompt('Enter friend room code:')
                : '';
            if (code) window.NBA.net.send({ type: 'join_friend_room', code: code.trim().toUpperCase() });
        }
    }

    window.NBA.MultiplayerLobbyScene = MultiplayerLobbyScene;
})();
