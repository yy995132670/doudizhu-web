import {Poker, Rule} from '/static/js/rule.mjs'
import {Player, createPlay} from '/static/js/player.mjs'
import {Protocol, Socket} from '/static/js/net.mjs'
import {AudioPref, Layout} from '/static/js/boot.mjs'

function drawRounded(graphics, x, y, w, h, radius) {
    if (graphics.drawRoundedRect) {
        graphics.drawRoundedRect(x, y, w, h, radius);
    } else {
        graphics.drawRect(x, y, w, h);
    }
}

function addTableButton(game, x, y, w, h, label, callback, context) {
    const group = game.add.group();
    const body = game.add.graphics(0, 0);
    body.beginFill(0x07111a, 0.78);
    body.lineStyle(2, 0xf6d28a, 0.62);
    drawRounded(body, x, y, w, h, 8);
    body.endFill();
    body.inputEnabled = true;
    body.input.useHandCursor = true;
    body.events.onInputUp.add(callback, context);
    group.add(body);

    const text = game.add.text(x + w / 2, y + h / 2, label, {
        font: "22px Arial",
        fill: "#fff3ce",
        align: "center",
        stroke: "#000000",
        strokeThickness: 3
    });
    text.anchor.set(0.5);
    text.inputEnabled = true;
    text.input.useHandCursor = true;
    text.events.onInputUp.add(callback, context);
    group.add(text);
    group.labelText = text;
    return group;
}

function playSfx(game, key) {
    if (!AudioPref.soundOn()) return;
    try { game.add.audio(key).play(); } catch (e) { /* ignore */ }
}

class Observer {

    constructor() {
        this.state = {};
        this.subscribers = {};
    }

    get(key) {
        return this.state[key];
    }

    set(key, val) {
        const keys = key.split('.');
        if (keys.length === 1) {
            this.state[key] = val;
        } else {
            this.state[keys[0]][keys[1]] = val;
            key = keys[0];
        }
        const newVal = this.state[key];
        const subscribers = this.subscribers;
        if (subscribers.hasOwnProperty(key)) {
            subscribers[key].forEach(function (cb) {
                if (cb) cb(newVal);
            });
        }
    }

    subscribe(key, cb) {
        const subscribers = this.subscribers;
        if (subscribers.hasOwnProperty(key)) {
            subscribers[key].push(cb);
        } else {
            subscribers[key] = [cb];
        }
    }

    unsubscribe(key, cb) {
        const subscribers = this.subscribers;
        if (subscribers.hasOwnProperty(key)) {
            const index = subscribers.indexOf(cb);
            if (index > -1) {
                subscribers.splice(index, 1);
            }
        }
    }
}

const observer = new Observer();
const RoomState = {
    INIT: 0,
    WAITING: 1,
    CALL_SCORE: 2,
    PLAYING: 3,
    GAME_OVER: 4,
};

export class Game {
    constructor(game) {
        this.players = [];

        this.tablePoker = [];
        this.tablePokerPic = {};
        this.playerShotPic = [[], [], []];

        this.bottomPokers = [];
        this.bottomPokerSprites = [];
        this.tableActive = false;

        this.lastShotPlayer = null;

        this.whoseTurn = 0;
        this.titleBar = null;
        this.countdownText = null;
        this.lobbyButton = null;
        this.readyButton = null;
        this.trusteeButton = null;
        this.trustee = false;
        this.autoActionEvent = null;
    }

    init(baseScore, roomId) {
        observer.set('baseScore', baseScore);
        observer.set('roomId', roomId === undefined ? -1 : roomId);
        observer.set('ready', false);
        observer.set('rob', false);
        observer.set('countdown', -1);
        observer.set('trustee', false);
    }

    create() {
        Rule.RuleList = this.cache.getJSON('rule');
        this.stage.backgroundColor = '#182d3b';

        this.players.push(createPlay(0, this));
        this.players.push(createPlay(1, this));
        this.players.push(createPlay(2, this));
        this.players[0].updateInfo(window.playerInfo.uid, window.playerInfo.name);
        const protocol = location.protocol.startsWith("https") ? "wss://" : "ws://";
        this.socket = new Socket(protocol + location.host + "/ws");
        this.socket.connect(this.onopen.bind(this), this.onmessage.bind(this), this.onerror.bind(this));

        const width = this.game.world.width;
        const height = this.game.world.height;

        const titleBar = this.game.add.text(width / 2, 0, `房间号:${0} 底分: 0 倍数: 0`, {
            font: "22px",
            fill: "#fff",
            align: "center"
        });
        this.titleBar = titleBar;
        titleBar.anchor.set(0.5, 0);
        observer.subscribe('room', function (room) {
            titleBar.text = `房间号:${room.id} 底分: ${room.origin} 倍数: ${room.multiple}`;
        });

        this.isLeavingRoom = false;
        this.renderLobbyButton();

        // 创建准备按钮
        const that = this;
        const countdown = this.game.add.text(width / 2, height / 2, '10', {
            font: "80px",
            fill: "#fff",
            align: "center"
        });
        this.countdownText = countdown;
        countdown.anchor.set(0.5);
        countdown.visible = false;
        observer.subscribe('countdown', function (timer) {
            countdown.visible = timer >= 0;
            if (timer >= 0) {
                countdown.text = timer;
                that.game.time.events.add(1000, function () {
                    observer.set('countdown', observer.get('countdown') - 1);
                }, that);
            }
        });

        this.renderReadyButton();

        observer.subscribe('ready', function (is_ready) {
            if (that.readyButton) {
                that.readyButton.visible = !is_ready;
            }
        });

        observer.subscribe('trustee', function (isTrustee) {
            that.trustee = !!isTrustee;
            if (that.trusteeButton && that.trusteeButton.labelText) {
                that.trusteeButton.labelText.text = that.trustee ? "取消托管" : "托管";
            }
            if (that.trustee) {
                that.tryAutoAction();
            } else if (that.autoActionEvent) {
                that.game.time.events.remove(that.autoActionEvent);
                that.autoActionEvent = null;
            }
        });

        this.renderTrusteeButton();

        // 创建抢地主按钮
        const callGroup = this.game.add.group();
        this.callScoreGroup = callGroup;
        const pass = this.game.make.button(0, 0, "btn", function () {
            playSfx(this.game, 'f_score_0');
            this.send_message([Protocol.REQ_CALL_SCORE, {"rob": 0}]);
        }, this, 'score_0.png', 'score_0.png', 'score_0.png');
        pass.anchor.set(0.5, 0);
        callGroup.add(pass);

        const rob = this.game.make.button(0, 0, "btn", function () {
            playSfx(this.game, 'f_score_1');
            this.send_message([Protocol.REQ_CALL_SCORE, {"rob": 1}]);
        }, this, 'score_1.png', 'score_1.png', 'score_1.png');
        rob.anchor.set(0.5, 0);
        callGroup.add(rob);
        callGroup.visible = false;
        this.layoutCallScoreButtons();

        observer.subscribe('rob', function (is_rob) {
            callGroup.visible = is_rob;
            observer.set('countdown', -1);
        });
    }

    renderLobbyButton() {
        if (this.lobbyButton && this.lobbyButton.destroy) {
            this.lobbyButton.destroy(true);
        }
        const width = this.game.world.width;
        const height = this.game.world.height;
        const buttonWidth = 132;
        const buttonHeight = 46;
        const gap = 18;
        this.lobbyButton = addTableButton(
            this.game,
            Math.max(gap, width - buttonWidth - gap),
            Math.max(gap, height - buttonHeight - gap),
            buttonWidth,
            buttonHeight,
            "返回大厅",
            this.quitGame,
            this
        );
        this.game.world.add(this.lobbyButton);
    }

    renderReadyButton() {
        if (this.readyButton && this.readyButton.destroy) {
            this.readyButton.destroy(true);
        }
        const width = this.game.world.width;
        const height = this.game.world.height;
        const buttonWidth = 156;
        const buttonHeight = 56;
        const x = Math.max(24, width / 2 - buttonWidth / 2);
        const y = Math.max(220, height * 0.62);
        this.readyButton = addTableButton(this.game, x, y, buttonWidth, buttonHeight, "准备", function () {
            if (!observer.get('ready')) {
                this.send_message([Protocol.REQ_READY, {"ready": 1}]);
            }
        }, this);
        this.readyButton.visible = !observer.get('ready');
        this.game.world.add(this.readyButton);
        this.game.world.bringToTop(this.readyButton);
    }

    renderTrusteeButton() {
        if (this.trusteeButton && this.trusteeButton.destroy) {
            this.trusteeButton.destroy(true);
        }
        const width = this.game.world.width;
        const height = this.game.world.height;
        const buttonWidth = 132;
        const buttonHeight = 46;
        const step = width / 6;
        const x = Math.min(width - buttonWidth - 18, width / 2 + step * 1.35);
        const y = Math.max(210, height * 0.6 + 8);
        this.trusteeButton = addTableButton(
            this.game,
            Math.max(18, x),
            y,
            buttonWidth,
            buttonHeight,
            this.trustee ? "取消托管" : "托管",
            this.toggleTrustee,
            this
        );
        this.game.world.add(this.trusteeButton);
        this.game.world.bringToTop(this.trusteeButton);
    }

    onResize() {
        const width = this.game.world.width;
        const height = this.game.world.height;
        if (this.game.canvas) {
            this.game.canvas.style.width = `${width}px`;
            this.game.canvas.style.height = `${height}px`;
            this.game.canvas.style.left = '0px';
            this.game.canvas.style.top = '0px';
        }
        if (this.titleBar) {
            this.titleBar.x = width / 2;
        }
        if (this.countdownText) {
            this.countdownText.x = width / 2;
            this.countdownText.y = height / 2;
        }
        this.renderLobbyButton();
        this.renderTrusteeButton();
        this.renderReadyButton();
        this.layoutCallScoreButtons();
        this.relayoutPlayers();
        this.relayoutShotPokers();
    }

    layoutCallScoreButtons() {
        const group = this.callScoreGroup;
        if (!group) return;
        const W = this.game.world.width;
        const H = this.game.world.height;
        const btns = [group.getAt(0), group.getAt(1)];
        const gap = 12;
        const n = btns.length;
        const baseScale = (typeof Layout.btnScale === 'number') ? Layout.btnScale : 1;
        const maxScale = (W * 0.94 - (n - 1) * gap) / (n * 128);
        const scale = Math.min(baseScale, Math.max(0.5, maxScale));
        const btnW = 128 * scale;
        const totalW = n * btnW + (n - 1) * gap;
        const sy = Math.min(H * 0.58, H - 48 * scale - 16);
        let x = W / 2 - totalW / 2;
        btns.forEach((b) => {
            b.scale.set(scale);
            b.y = sy;
            b.x = x + btnW / 2;
            x += btnW + gap;
        });
    }

    relayoutPlayers() {
        const positions = [
            [Poker.PW / 2, this.game.world.height - Poker.PH - 10],
            [this.game.world.width - Poker.PW / 2, 94],
            [Poker.PW / 2, 94]
        ];
        this.players.forEach((player, seat) => {
            if (!player) {
                return;
            }
            player.layoutUI(positions[seat][0], positions[seat][1]);
            player.arrangePoker();
        });
        this.updateTurnIndicator();
    }

    updateTurnIndicator() {
        const active = this.tableActive && this.whoseTurn >= 0 && this.whoseTurn < 3;
        this.players.forEach((player, seat) => {
            if (player) player.setTurnActive(active && seat === this.whoseTurn);
        });
    }

    // ---- 地主底牌整局明牌展示 ----
    renderBottomCards(cards) {
        this.clearBottomCards();
        if (!cards || cards.length === 0) return;
        this.bottomPokers = cards.slice();
        const n = cards.length;
        const scale = 0.34;
        const cardW = 90 * scale;
        const gap = cardW * 0.78;
        const totalW = (n - 1) * gap;
        const cx = this.game.world.width / 2;
        const cy = 56;
        const label = this.game.add.text(cx - totalW / 2 - 14, cy, '底牌', {
            font: "15px Arial", fill: "#ffe08a", align: "right",
            stroke: "#000000", strokeThickness: 2
        });
        label.anchor.set(1, 0.5);
        this.game.world.add(label);
        this.bottomPokerSprites.push(label);
        for (let i = 0; i < n; i++) {
            const p = new Poker(this, cards[i], cards[i]);
            this.game.world.add(p);
            p.scale.set(scale);
            p.x = cx - totalW / 2 + i * gap;
            p.y = cy;
            p.bringToTop();
            this.bottomPokerSprites.push(p);
        }
    }

    clearBottomCards() {
        if (this.bottomPokerSprites) {
            this.bottomPokerSprites.forEach((s) => { if (s && s.destroy) s.destroy(); });
        }
        this.bottomPokerSprites = [];
        this.bottomPokers = [];
    }

    relayoutShotPokers() {
        if (!this.playerShotPic) {
            return;
        }
        for (let seat = 0; seat < 3; seat++) {
            const pokers = this.playerShotPic[seat] || [];
            pokers.forEach((poker, index) => {
                if (poker) {
                    this.placeShotPoker(seat, poker, index, pokers.length, false);
                }
            });
        }
    }

    syncRoom(room, syncInfo) {
        const selfUid = window.playerInfo.uid;
        let selfIndex = -1;
        for (let i = 0; i < syncInfo.length; i++) {
            if (syncInfo[i] && String(syncInfo[i].uid) === String(selfUid)) {
                selfIndex = i;
                break;
            }
        }
        if (selfIndex === -1) {
            return;
        }

        if (room.state < RoomState.CALL_SCORE && this.players[0].pokerInHand.length > 0) {
            this.cleanWorld();
            this.tablePoker = [];
            this.lastShotPlayer = null;
        }
        if (room.state < RoomState.CALL_SCORE) {
            this.clearOwnShotControls();
            for (let seat = 0; seat < 3; seat++) {
                this.clearPlayerShot(seat);
            }
        }

        for (let seat = 0; seat < 3; seat++) {
            const info = syncInfo[(selfIndex + seat) % 3] || {};
            const player = this.players[seat];
            player.updateInfo(info.uid, info.name, info.point);
            player.resetTableInfo();
            if (info.landlord) {
                player.setLandlord();
            }
            if (info.uid) {
                player.updateAction(info.ready ? "已准备" : "");
            } else {
                player.updateAction("");
            }
        }

        const selfInfo = syncInfo[selfIndex] || {};
        observer.set('ready', !!selfInfo.ready || room.state >= RoomState.CALL_SCORE);
        if (room.state < RoomState.CALL_SCORE && this.readyButton) {
            this.readyButton.visible = !selfInfo.ready;
            this.game.world.bringToTop(this.readyButton);
        }

        if (room.state >= RoomState.CALL_SCORE && selfInfo.pokers && selfInfo.pokers.length > 0 && this.players[0].pokerInHand.length === 0) {
            this.syncPokers(syncInfo, selfIndex);
        }

        this.whoseTurn = this.uidToSeat(room.whose_turn);
        this.lastShotPlayer = this.players[this.uidToSeat(room.last_shot_uid)];
        if (room.last_shot_poker && room.last_shot_poker.length > 0) {
            this.renderTablePokers(room.last_shot_poker);
        }

        this.tableActive = room.state >= RoomState.CALL_SCORE;
        this.updateTurnIndicator();

        if (room.bottom_pokers && room.bottom_pokers.length === 3) {
            this.renderBottomCards(room.bottom_pokers);
        }

        observer.set('rob', room.state === RoomState.CALL_SCORE && this.whoseTurn === 0);
        if (room.state === RoomState.PLAYING && this.whoseTurn === 0) {
            this.game.time.events.add(300, this.startPlay, this);
        }
    }

    syncPokers(syncInfo, selfIndex) {
        this.clearPokers();
        for (let seat = 0; seat < 3; seat++) {
            const info = syncInfo[(selfIndex + seat) % 3] || {};
            const source = info.pokers || [];
            const pokers = seat === 0 ? source.slice() : new Array(source.length).fill(55);
            const player = this.players[seat];
            player.pokerInHand = [];
            if (seat === 0) {
                player._pokerPic = {};
            } else {
                player._pokerPic = [];
            }
            pokers.forEach((pid, index) => {
                const poker = new Poker(this, pid, seat === 0 ? pid : 55);
                this.game.world.add(poker);
                player.pokerInHand.push(pid);
                player.pushAPoker(poker);
                player.dealPokerAnim(poker, seat === 1 ? pokers.length - 1 - index : index);
            });
            player.arrangePoker();
        }
    }

    clearPokers() {
        this.players.forEach(function (player) {
            player.cleanPokers();
            if (player.seat === 0) {
                player._pokerPic = {};
            } else {
                player._pokerPic = [];
            }
        });
        Object.keys(this.tablePokerPic).forEach((pid) => {
            if (this.tablePokerPic[pid]) {
                this.tablePokerPic[pid].destroy();
            }
        });
        this.tablePoker = [];
        this.tablePokerPic = {};
        for (let seat = 0; seat < 3; seat++) {
            this.clearPlayerShot(seat);
        }
    }

    clearPlayerShot(seat) {
        if (!this.playerShotPic || !this.playerShotPic[seat]) {
            return;
        }
        this.playerShotPic[seat].forEach((poker) => {
            if (poker && poker.destroy) {
                poker.destroy();
            }
        });
        this.playerShotPic[seat] = [];
    }

    shotCenter(seat, count, gap) {
        const width = this.game.world.width;
        const height = this.game.world.height;
        const safeCount = Math.max(count, 1);
        if (seat === 0) {
            return {
                x: width / 2,
                y: Math.max(height * 0.56, height - Poker.PH * 2.15),
                gap: Math.min(gap, Poker.PW * 0.36)
            };
        }
        if (seat === 1) {
            return {
                x: width - Math.min(260, width * 0.2) - (safeCount > 6 ? Poker.PW * 0.18 : 0),
                y: Math.max(190, height * 0.36),
                gap: Math.min(gap, Poker.PW * 0.3)
            };
        }
        return {
            x: Math.min(260, width * 0.2) + (safeCount > 6 ? Poker.PW * 0.18 : 0),
            y: Math.max(190, height * 0.36),
            gap: Math.min(gap, Poker.PW * 0.3)
        };
    }

    placeShotPoker(seat, poker, index, count, animate = true) {
        const gap = Math.min((this.game.world.width - Poker.PW * 2) / Math.max(count, 1), Poker.PW * 0.36);
        const center = this.shotCenter(seat, count, gap);
        const target = {
            x: center.x + (index - (count - 1) / 2) * center.gap,
            y: center.y
        };
        poker.bringToTop();
        if (animate) {
            this.game.add.tween(poker).to(target, 500, Phaser.Easing.Default, true);
        } else {
            poker.x = target.x;
            poker.y = target.y;
        }
    }

    renderTablePokers(pokers) {
        const seat = this.lastShotPlayer ? this.lastShotPlayer.seat : this.uidToSeat(observer.get('room').last_shot_uid);
        if (seat < 0) {
            return;
        }
        this.tablePoker = pokers.slice();
        this.tablePokerPic = {};
        this.clearPlayerShot(seat);
        const count = pokers.length;
        pokers.forEach((pid, index) => {
            const poker = new Poker(this, pid, pid);
            this.game.world.add(poker);
            this.placeShotPoker(seat, poker, index, count, false);
            this.playerShotPic[seat].push(poker);
        });
    }

    onopen() {
        console.log('socket onopen');
        this.socket.send([Protocol.REQ_ROOM_LIST, {}]);
        let roomId = observer.get('roomId');
        if ((roomId === undefined || roomId === -1) && window.playerInfo && window.playerInfo.room > 0) {
            roomId = window.playerInfo.room;
        }
        this.socket.send([Protocol.REQ_JOIN_ROOM, {"room": roomId, "level": observer.get('baseScore')}]);
    }

    onerror() {
        console.log('socket onerror, try reconnect.');
        this.socket.connect(this.onopen.bind(this), this.onmessage.bind(this), this.onerror.bind(this));
    }

    send_message(request) {
        this.socket.send(request);
    }

    onmessage(message) {
        const code = message[0], packet = message[1];
        switch (code) {
            case Protocol.RSP_ROOM_LIST:
                console.log(code, packet);
                break;
            case Protocol.RSP_JOIN_ROOM:
                observer.set('room', packet['room']);
                this.syncRoom(packet['room'], packet['players']);
                break;
            case Protocol.RSP_LEAVE_ROOM:
                this.handlePlayerLeave(packet['uid']);
                break;
            case Protocol.RSP_READY:
                {
                    const seat = this.uidToSeat(packet['uid']);
                    if (seat >= 0) {
                        this.players[seat].updateAction(packet['ready'] ? "已准备" : "");
                    }
                }
                if (packet['uid'] === this.players[0].uid) {
                    observer.set('ready', true);
                }
                break;
            case Protocol.RSP_DEAL_POKER: {
                this.hideGameOverPanel();
                this.players.forEach(player => player.updateAction(""));
                const playerId = packet['uid'];
                const pokers = packet['pokers'];
                this.dealPoker(pokers);
                this.whoseTurn = this.uidToSeat(playerId);
                this.tableActive = true;
                this.updateTurnIndicator();
                this.startCallScore();
                break;
            }
            case Protocol.RSP_CALL_SCORE: {
                const playerId = packet['uid'];
                const rob = packet['rob'];
                const landlord = packet['landlord'];
                this.whoseTurn = this.uidToSeat(playerId);

                const hanzi = ['不抢', "抢地主"];
                this.players[this.whoseTurn].updateAction(hanzi[rob]);

                observer.set('rob', false);
                if (landlord === -1) {
                    this.whoseTurn = (this.whoseTurn + 1) % 3;
                    this.updateTurnIndicator();
                    this.startCallScore();
                } else {
                    this.whoseTurn = this.uidToSeat(landlord);
                    this.tablePoker[0] = packet['pokers'][0];
                    this.tablePoker[1] = packet['pokers'][1];
                    this.tablePoker[2] = packet['pokers'][2];
                    this.players[this.whoseTurn].setLandlord();
                    this.renderBottomCards(packet['pokers']);
                    this.showLastThreePoker();
                    this.updateTurnIndicator();
                }
                observer.set('room.multiple', packet['multiple']);
                break;
            }
            case Protocol.RSP_SHOT_POKER:
                this.handleShotPoker(packet);
                observer.set('room.multiple', packet['multiple']);
                break;
            case Protocol.RSP_GAME_OVER: {
                const winner = packet['winner'];
                const that = this;
                packet['players'].forEach(function (player) {
                    const seat = that.uidToSeat(player['uid']);
                    if (seat >= 0) {
                        that.players[seat].updateScore(player['point']);
                        const delta = player['point_delta'] === undefined ? 0 : player['point_delta'];
                        that.players[seat].updateAction(delta >= 0 ? `+${delta}` : `${delta}`);
                    }
                    if (seat > 0) {
                        that.players[seat].replacePoker(player['pokers'], 0);
                        that.players[seat].reDealPoker();
                    }
                });

                this.whoseTurn = this.uidToSeat(winner);

                this.lastGameOverPacket = packet;
                this.lastGameOverLandlords = this.players.map(function (p) {
                    return {uid: p.uid, isLandlord: !!p.isLandlord};
                });
                this.game.time.events.add(1500, function () {
                    if (that.lastGameOverPacket) {
                        that.showGameOverPanel(that.lastGameOverPacket);
                    }
                }, this);
                break;
            }
            // case Protocol.RSP_CHEAT:
            //     let seat = this.uidToSeat(packet[1]);
            //     this.players[seat].replacePoker(packet[2], 0);
            //     this.players[seat].reDealPoker();
            //     break;
            default:
                console.log("UNKNOWN PACKET:", packet)
        }
    }

    cleanWorld() {
        this.clearPokers();
        this.clearBottomCards();
        this.tableActive = false;
        this.players.forEach(function (player) {
            player.isLandlord = false;
            if (player.uiHead) player.uiHead.frameName = player.uid ? 'icon_farmer.png' : 'icon_default.png';
            player.updateAction("");
            player.setTurnActive(false);
        });
        observer.set('trustee', false);
    }

    hideGameOverPanel() {
        if (this.gameOverPanel && this.gameOverPanel.destroy) {
            this.gameOverPanel.destroy(true);
        }
        this.gameOverPanel = null;
        this.lastGameOverPacket = null;
        this.lastGameOverLandlords = null;
    }

    showGameOverPanel(packet) {
        this.hideGameOverPanel();
        const that = this;
        const width = this.game.world.width;
        const height = this.game.world.height;
        const group = this.game.add.group();
        this.gameOverPanel = group;

        const overlay = this.game.add.graphics(0, 0);
        overlay.beginFill(0x000000, 0.55);
        overlay.drawRect(0, 0, width, height);
        overlay.endFill();
        overlay.inputEnabled = true;
        group.add(overlay);

        const winnerSeat = this.uidToSeat(packet['winner']);
        const snapshot = this.lastGameOverLandlords || [];
        const winnerIsLandlord = snapshot.reduce(function (acc, s) {
            return s.uid === packet['winner'] ? !!s.isLandlord : acc;
        }, winnerSeat >= 0 ? !!this.players[winnerSeat].isLandlord : false);
        const selfIsLandlord = snapshot.reduce(function (acc, s) {
            return s.uid === window.playerInfo.uid ? !!s.isLandlord : acc;
        }, !!this.players[0].isLandlord);
        const selfWon = (selfIsLandlord === winnerIsLandlord);

        const mult = packet['multiple'] || {};
        const origin = mult['origin'] || 1;
        let product = 1;
        Object.keys(mult).forEach(function (k) { product *= (mult[k] || 1); });
        const displayMultiple = origin > 0 ? Math.round(product / origin) : product;

        const panelW = Math.max(360, Math.min(460, width * 0.42));
        const panelH = Math.max(380, Math.min(560, height * 0.8));
        const px = (width - panelW) / 2;
        const py = Math.max(16, (height - panelH) / 2);

        const accent = selfWon ? 0x6fe39a : 0xe5736f;
        const panel = this.game.add.graphics(0, 0);
        panel.beginFill(0x0a1c28, 0.97);
        panel.lineStyle(3, accent, 0.85);
        drawRounded(panel, px, py, panelW, panelH, 16);
        panel.endFill();
        panel.beginFill(accent, 0.12);
        drawRounded(panel, px, py, panelW, 70, 16);
        panel.endFill();
        group.add(panel);

        const titleTxt = selfWon ? "胜  利" : "失  败";
        const titleColor = selfWon ? "#8ef0b0" : "#ff9a93";
        const titleStroke = selfWon ? "#0c3a22" : "#3a0c0c";
        const title = this.game.add.text(width / 2, py + 42, titleTxt, {
            font: "52px Arial", fill: titleColor, align: "center",
            stroke: titleStroke, strokeThickness: 6
        });
        title.anchor.set(0.5);
        group.add(title);

        let sub = winnerIsLandlord ? "地主胜利" : "农民胜利";
        if (packet['spring']) sub += " · 春天";
        if (packet['antispring']) sub += " · 反春";
        const subtitle = this.game.add.text(width / 2, py + 96, sub, {
            font: "22px Arial", fill: "#ffe08a", align: "center",
            stroke: "#000000", strokeThickness: 3
        });
        subtitle.anchor.set(0.5);
        group.add(subtitle);

        const factorLabels = {
            'di': '底牌', 'ming': '明牌', 'bomb': '炸弹', 'rob': '抢地主',
            'spring': '春天', 'landlord': '地主加倍', 'farmer': '农民加倍'
        };
        const factorLines = [];
        Object.keys(factorLabels).forEach(function (k) {
            const v = mult[k] || 1;
            if (v > 1) factorLines.push(`${factorLabels[k]} ×${v}`);
        });
        if (factorLines.length === 0) factorLines.push("无加倍");

        const bodyX = px + 28;
        const bodyRight = px + panelW - 28;
        const bodyW = panelW - 56;
        let cy = py + 132;

        const multBox = this.game.add.graphics(0, 0);
        multBox.beginFill(0x061018, 0.6);
        multBox.lineStyle(1, 0xf6d28a, 0.25);
        drawRounded(multBox, bodyX, cy, bodyW, 56, 10);
        multBox.endFill();
        group.add(multBox);
        const bigMult = this.game.add.text(px + panelW / 2, cy + 18, `本局倍数 ×${displayMultiple}`, {
            font: "30px Arial", fill: "#fff3ce", align: "center",
            stroke: "#000000", strokeThickness: 3
        });
        bigMult.anchor.set(0.5, 0);
        group.add(bigMult);
        const factorTxt = this.game.add.text(px + panelW / 2, cy + 50, factorLines.join("   "), {
            font: "16px Arial", fill: "#bcd6e6", align: "center",
            stroke: "#000000", strokeThickness: 2
        });
        factorTxt.anchor.set(0.5, 0);
        group.add(factorTxt);
        cy += 56 + 18;

        (packet['players'] || []).forEach(function (p) {
            const seat = that.uidToSeat(p['uid']);
            if (seat < 0) return;
            const pl = that.players[seat];
            const isLandlord = snapshot.reduce(function (acc, s) {
                return s.uid === p['uid'] ? !!s.isLandlord : acc;
            }, !!pl.isLandlord);
            const roleName = isLandlord ? "地主" : "农民";
            const isWin = p['uid'] === packet['winner'] || (!isLandlord && !winnerIsLandlord);
            const d = p['point_delta'] || 0;
            const row = that.game.add.text(bodyX, cy,
                `${pl.name || roleName}（${roleName}）  ${d >= 0 ? '+' : ''}${d}`,
                {
                    font: "19px Arial",
                    fill: isWin ? "#9be7b4" : "#f1a9a4",
                    align: "left",
                    stroke: "#000000", strokeThickness: 2
                });
            row.anchor.set(0, 0);
            group.add(row);
            const tag = that.game.add.text(bodyRight, cy, isWin ? "胜" : "负", {
                font: "19px Arial", fill: isWin ? "#9be7b4" : "#f1a9a4",
                align: "right", stroke: "#000000", strokeThickness: 2
            });
            tag.anchor.set(1, 0);
            group.add(tag);
            cy += 28;
        });

        const btnY = py + panelH - 64;
        const btnW = Math.min(150, panelW * 0.36);
        const btnH = 50;
        const againBtn = addTableButton(this.game, px + panelW / 2 - btnW - 10, btnY, btnW, btnH, "再来一局", function () {
            that.hideGameOverPanel();
            that.cleanWorld();
            that.send_message([Protocol.REQ_READY, {"ready": 1}]);
        }, this);
        group.add(againBtn);
        const lobbyBtn = addTableButton(this.game, px + panelW / 2 + 10, btnY, btnW, btnH, "返回大厅", function () {
            that.hideGameOverPanel();
            that.quitGame();
        }, this);
        group.add(lobbyBtn);

        playSfx(this.game, selfWon ? 'music_win' : 'music_lose');

        group.forEach(function (child) {
            child.bringToTop && child.bringToTop();
        });
        this.game.world.bringToTop(group);
    }


    restart() {
        this.players = [];

        this.tablePoker = [];
        this.tablePokerPic = {};

        this.lastShotPlayer = null;

        this.whoseTurn = 0;

        this.stage.backgroundColor = '#182d3b';
        this.players.push(createPlay(0, this));
        this.players.push(createPlay(1, this));
        this.players.push(createPlay(2, this));
        for (let i = 0; i < 3; i++) {
            //this.players[i].uiHead.kill();
        }
    }

    update() {
    }

    uidToSeat(uid) {
        for (let i = 0; i < 3; i++) {
            if (uid === this.players[i].uid)
                return i;
        }
        console.log('ERROR uidToSeat:' + uid);
        return -1;
    }

    handlePlayerLeave(uid) {
        if (uid === this.players[0].uid) {
            this.goMainMenu();
            return;
        }

        const seat = this.uidToSeat(uid);
        if (seat > 0) {
            this.players[seat].cleanPokers();
            this.clearPlayerShot(seat);
            this.players[seat].updateInfo(0, '');
            this.players[seat].updateAction("");
        }
    }

    dealPoker(pokers) {
        this.clearPokers();
        const handPokers = pokers.slice();
        // 添加一张底牌
        let p = new Poker(this, 55, 55);
        this.tablePokerPic[55] = p;
        this.game.world.add(p);

        for (let i = 0; i < 17; i++) {
            this.players[2].pokerInHand.push(55);
            this.players[1].pokerInHand.push(55);
            this.players[0].pokerInHand.push(handPokers.pop());
        }

        this.players[0].dealPoker();
        this.players[1].dealPoker();
        this.players[2].dealPoker();
    }

    showLastThreePoker() {
        // 删除底牌
        if (this.tablePokerPic[55]) {
            this.tablePokerPic[55].destroy();
            delete this.tablePokerPic[55];
        }

        for (let i = 0; i < 3; i++) {
            let pokerId = this.tablePoker[i];
            let p = new Poker(this, pokerId, pokerId);
            this.tablePokerPic[pokerId] = p;
            this.game.world.add(p);
            this.game.add.tween(p).to({x: this.game.world.width / 2 + (i - 1) * 60}, 600, Phaser.Easing.Default, true);
        }
        this.game.time.events.add(1500, this.dealLastThreePoker, this);
    }

    dealLastThreePoker() {
        let turnPlayer = this.players[this.whoseTurn];

        for (let i = 0; i < 3; i++) {
            let pid = this.tablePoker[i];
            let poker = this.tablePokerPic[pid]
            turnPlayer.pokerInHand.push(pid);
            turnPlayer.pushAPoker(poker);
        }
        turnPlayer.sortPoker();
        if (this.whoseTurn === 0) {
            turnPlayer.arrangePoker();
            const that = this;
            for (let i = 0; i < 3; i++) {
                let pid = this.tablePoker[i];
                let p = this.tablePokerPic[pid];
                let tween = this.game.add.tween(p).to({y: this.game.world.height - Poker.PH * 0.8}, 400, Phaser.Easing.Default, true);

                function adjust(p) {
                    that.game.add.tween(p).to({y: that.game.world.height - Poker.PH / 2}, 400, Phaser.Easing.Default, true, 400);
                }

                tween.onComplete.add(adjust, this, p);
            }
        } else {
            let first = turnPlayer.findAPoker(55);
            for (let i = 0; i < 3; i++) {
                let pid = this.tablePoker[i];
                let p = this.tablePokerPic[pid];
                p.frame = 55 - 1;
                this.game.add.tween(p).to({x: first.x, y: first.y}, 200, Phaser.Easing.Default, true);
            }
        }

        this.tablePoker = [];
        this.lastShotPlayer = turnPlayer;
        if (this.whoseTurn === 0) {
            this.startPlay();
        }
    }

    handleShotPoker(packet) {
        this.whoseTurn = this.uidToSeat(packet['uid']);
        let turnPlayer = this.players[this.whoseTurn];
        let pokers = packet['pokers'];
        this.clearPlayerShot(this.whoseTurn);
        if (pokers.length === 0) {
            turnPlayer.updateAction("不出");
            this.showPassLabel(this.whoseTurn);
        } else {
            turnPlayer.updateAction("");
            let pokersPic = {};
            pokers.sort(Poker.comparePoker);
            let count = pokers.length;
            for (let i = 0; i < count; i++) {
                let p = turnPlayer.findAPoker(pokers[i]);
                p.id = pokers[i];
                p.frame = pokers[i] - 1;
                this.placeShotPoker(this.whoseTurn, p, i, count);

                turnPlayer.removeAPoker(pokers[i]);
                pokersPic[p.id] = p;
                this.playerShotPic[this.whoseTurn].push(p);
            }

            this.tablePoker = pokers;
            this.tablePokerPic = {};
            this.lastShotPlayer = turnPlayer;
            turnPlayer.arrangePoker();
        }
        if (turnPlayer.pokerInHand.length > 0) {
            this.whoseTurn = (this.whoseTurn + 1) % 3;
            this.updateTurnIndicator();
            if (this.whoseTurn === 0) {
                this.game.time.events.add(1000, this.startPlay, this);
            }
        }
    }

    // “不出”像出牌一样在该玩家出牌区展示一个标签，持续到下次该玩家动作
    showPassLabel(seat) {
        const center = this.shotCenter(seat, 1, Poker.PW * 0.36);
        const label = this.game.add.text(center.x, center.y, '不  出', {
            font: "26px Arial",
            fill: "#ffd9a0",
            align: "center",
            stroke: "#3a1c00",
            strokeThickness: 4
        });
        label.anchor.set(0.5);
        label.alpha = 0;
        this.game.world.add(label);
        this.game.add.tween(label).to({alpha: 1}, 250, Phaser.Easing.Default, true);
        this.playerShotPic[seat].push(label);
    }

    startCallScore() {
        if (this.whoseTurn === 0) {
            observer.set('rob', true);
            this.tryAutoAction();
        }

    }

    startPlay() {
        if (this.trustee) {
            this.clearOwnShotControls();
            this.tryAutoAction();
            return;
        }
        if (this.isLastShotPlayer()) {
            this.players[0].playPoker([]);
        } else {
            this.players[0].playPoker(this.tablePoker);
        }
    }

    finishPlay(pokers) {
        this.send_message([Protocol.REQ_SHOT_POKER, {"pokers": pokers}]);
    }

    toggleTrustee() {
        observer.set('trustee', !this.trustee);
        if (!this.trustee && this.whoseTurn === 0 && this.players[0].pokerInHand.length > 0) {
            this.startPlay();
        }
    }

    clearOwnShotControls() {
        const player = this.players[0];
        if (player && player.shotLayer) {
            player.shotLayer.forEach(function (child) {
                child.kill();
            });
        }
        if (player && player.hintPoker && player.hintPoker.length > 0) {
            player.pokerUnSelected(player.hintPoker);
            player.hintPoker = [];
        }
    }

    tryAutoAction() {
        if (!this.trustee || this.whoseTurn !== 0 || this.isLeavingRoom) {
            return;
        }
        if (this.autoActionEvent) {
            return;
        }
        this.autoActionEvent = this.game.time.events.add(900, function () {
            this.autoActionEvent = null;
            if (!this.trustee || this.whoseTurn !== 0 || this.isLeavingRoom) {
                return;
            }
            if (observer.get('rob')) {
                this.autoCallScore();
            } else if (this.players[0].pokerInHand.length > 0) {
                this.autoPlay();
            }
        }, this);
    }

    autoCallScore() {
        const hand = this.players[0].pokerInHand;
        const strongPokers = [54, 53, 2, 15, 28, 41].filter((pid) => hand.indexOf(pid) !== -1);
        const rob = strongPokers.length >= 4 ? 1 : 0;
        playSfx(this.game, `f_score_${rob}`);
        this.send_message([Protocol.REQ_CALL_SCORE, {"rob": rob}]);
    }

    autoPlay() {
        const player = this.players[0];
        const lastTurnPoker = this.isLastShotPlayer() ? [] : this.tablePoker;
        let shot = player.hint(lastTurnPoker);
        if (shot.length === 0) {
            if (lastTurnPoker.length > 0) {
                shot = [];
            } else {
                player.sortPoker();
                shot = player.pokerInHand.length > 0 ? [player.pokerInHand[player.pokerInHand.length - 1]] : [];
            }
        }
        this.clearOwnShotControls();
        this.finishPlay(shot.slice());
    }

    isLastShotPlayer() {
        return this.players[this.whoseTurn] === this.lastShotPlayer;
    }

    quitGame() {
        if (this.isLeavingRoom) {
            return;
        }
        this.isLeavingRoom = true;
        if (this.socket) {
            this.send_message([Protocol.REQ_LEAVE_ROOM, {}]);
        }
        this.game.time.events.add(200, this.goMainMenu, this);
    }

    goMainMenu() {
        this.hideGameOverPanel();
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        if (window.playerInfo) {
            window.playerInfo.room = -1;
        }
        this.cleanWorld();
        observer.set('ready', false);
        observer.set('rob', false);
        observer.set('countdown', -1);
        observer.set('trustee', false);
        this.state.start('MainMenu');
    }
}






