import {Poker, Rule} from '/static/js/rule.mjs'
import {Layout} from '/static/js/boot.mjs'

export const createPlay = function (seat, game) {
    let player = seat === 0 ? new Player(seat, game) : new NetPlayer(seat, game);
    let xy = [
        Poker.PW / 2, game.world.height - Poker.PH - 10,
        game.world.width - Poker.PW / 2, 94,
        Poker.PW / 2, 94
    ];
    player.initUI(xy[seat * 2], xy[seat * 2 + 1]);
    if (seat === 0) {
        player.initShotLayer();
    } else if (seat === 1) {
        player.uiHead.scale.set(-1, 1);
    }
    return player;
}

function getLevelName(point) {
    if (point < 0) return "逆风修行";
    if (point < 500) return "新手上桌";
    if (point < 900) return "稳手学徒";
    if (point < 1300) return "牌桌熟手";
    if (point < 1800) return "茶馆名家";
    if (point < 2500) return "江湖高手";
    if (point < 3600) return "牌局宗师";
    return "天元牌圣";
}

export class Player {
    constructor(seat, game) {
        this.uid = seat;
        this.name = '';
        this.point = 1000;
        this.seat = seat;
        this.game = game;

        this.pokerInHand = [];
        this._pokerPic = {};
        this.isLandlord = false;

        this.hintPoker = [];
        this.isDraging = false;
    }

    initUI(sx, sy) {
        this.uiHead = this.game.add.sprite(sx, sy, 'btn', 'icon_default.png');
        this.uiHead.anchor.set(0.5, 1);
        const nameStyle = {
            font: "20px Arial",
            fill: "#fff6d7",
            align: "center",
            stroke: "#000000",
            strokeThickness: 3
        };
        const infoStyle = {
            font: "18px Arial",
            fill: "#bfe9ff",
            align: "center",
            stroke: "#000000",
            strokeThickness: 3
        };
        const nameX = this.seat === 1 ? sx - 42 : sx + 42;
        const nameY = sy - 86;
        this.uiName = this.game.add.text(nameX, nameY, this.seat === 0 ? '自己' : '等待玩家加入', nameStyle);
        this.uiName.anchor.set(this.seat === 1 ? 1 : 0, 0);
        this.uiScore = this.game.add.text(nameX, nameY + 28, '', infoStyle);
        this.uiScore.anchor.set(this.seat === 1 ? 1 : 0, 0);
        this.uiAction = this.game.add.text(sx, sy + 12, '', {
            font: "22px Arial",
            fill: "#ffe08a",
            align: "center",
            stroke: "#000000",
            strokeThickness: 3
        });
        this.uiAction.anchor.set(0.5, 0);

        // 轮次指示光环（出牌/叫地主轮到该玩家时高亮）
        this.uiTurn = this.game.add.graphics(0, 0);
        this.uiTurn.visible = false;
        this.uiTurn.alpha = 0;
        this._turnTween = null;
        this._drawTurnRing(sx, sy);
    }

    _drawTurnRing(sx, sy) {
        if (!this.uiTurn) return;
        const cx = sx;
        const cy = sy - 42;
        const g = this.uiTurn;
        g.clear();
        g.lineStyle(4, 0xffe066, 0.95);
        g.drawCircle(cx, cy, 98);
        g.lineStyle(2, 0xfff3ce, 0.45);
        g.drawCircle(cx, cy, 110);
        g.endFill();
    }

    setTurnActive(active) {
        if (!this.uiTurn) return;
        const on = !!active && !!this.uid;
        this.uiTurn.visible = on;
        if (this._turnTween) {
            this._turnTween.stop();
            this._turnTween = null;
        }
        if (on) {
            this.uiTurn.alpha = 0.9;
            this._turnTween = this.game.add.tween(this.uiTurn)
                .to({alpha: 0.3}, 700, Phaser.Easing.Sinusoidal.InOut, true, 0, -1, true);
        } else {
            this.uiTurn.alpha = 0;
        }
    }

    layoutUI(sx, sy) {
        if (this.uiHead) {
            this.uiHead.x = sx;
            this.uiHead.y = sy;
        }
        const nameX = this.seat === 1 ? sx - 42 : sx + 42;
        const nameY = sy - 86;
        if (this.uiName) {
            this.uiName.x = nameX;
            this.uiName.y = nameY;
            this.uiName.anchor.set(this.seat === 1 ? 1 : 0, 0);
        }
        if (this.uiScore) {
            this.uiScore.x = nameX;
            this.uiScore.y = nameY + 28;
            this.uiScore.anchor.set(this.seat === 1 ? 1 : 0, 0);
        }
        if (this.uiAction) {
            this.uiAction.x = sx;
            this.uiAction.y = sy + 12;
        }
        this._drawTurnRing(sx, sy);
    }

    updateInfo(uid, name, point) {
        this.uid = uid;
        this.name = name || '';
        if (point !== undefined && point !== null) {
            this.point = point;
        }
        if (uid) {
            this.uiHead.frameName = 'icon_farmer.png';
            if (this.uiName) {
                this.uiName.text = this.name || (this.seat === 0 ? '自己' : '玩家');
            }
            this.updateScore();
        } else {
            this.uiHead.frameName = 'icon_default.png';
            if (this.uiName) {
                this.uiName.text = this.seat === 0 ? '自己' : '等待玩家加入';
            }
            if (this.uiScore) {
                this.uiScore.text = '';
            }
        }
    }

    updateScore(point) {
        if (point !== undefined && point !== null) {
            this.point = point;
        }
        if (this.uiScore) {
            this.uiScore.text = `${this.point} 分 · ${getLevelName(this.point)}`;
        }
    }

    resetTableInfo() {
        this.isLandlord = false;
        if (this.uiHead) {
            this.uiHead.revive();
            this.uiHead.visible = true;
            this.uiHead.frameName = this.uid ? 'icon_farmer.png' : 'icon_default.png';
        }
        [this.uiName, this.uiScore, this.uiAction].forEach((item) => {
            if (item) {
                item.revive();
                item.visible = true;
            }
        });
        this.updateAction("");
        this.setTurnActive(false);
        if (this.uid) {
            this.updateScore();
        } else if (this.uiScore) {
            this.uiScore.text = "";
        }
    }

    updateAction(str) {
        if (this.uiAction) {
            this.uiAction.text = str || '';
        }
    }

    cleanPokers() {

        let length = this.pokerInHand.length;
        for (let i = 0; i < length; i++) {
            let pid = this.pokerInHand[i];
            let p = this.findAPoker(pid);
            if (p) {
                p.kill();
            }
        }
        this.pokerInHand = [];
    }

    initShotLayer() {
        this.shotLayer = this.game.add.group();
        let group = this.shotLayer;

        let sy = this.game.world.height * 0.6;
        let pass = this.game.make.button(0, sy, "btn", this.onPass, this, 'pass.png', 'pass.png', 'pass.png');
        pass.anchor.set(0.5, 0);
        group.add(pass);
        let hint = this.game.make.button(0, sy, "btn", this.onHint, this, 'hint.png', 'hint.png', 'hint.png');
        hint.anchor.set(0.5, 0);
        group.add(hint);
        let shot = this.game.make.button(0, sy, "btn", this.onShot, this, 'shot.png', 'shot.png', 'shot.png');
        shot.anchor.set(0.5, 0);
        group.add(shot);

        group.forEach(function (child) {
            child.kill();
        });
    }

    setLandlord() {
        this.isLandlord = true;
        this.uiHead.frameName = 'icon_landlord.png';
    }

    say(str) {
        this.updateAction(str);

        let style = {font: "22px Arial", fill: "#ffffff", align: "center"};
        let sx = this.uiHead.x + this.uiHead.width / 2 + 10;
        let sy = this.uiHead.y - this.uiHead.height * 0.5;
        let text = this.game.add.text(sx, sy, str, style);
        if (this.uiHead.scale.x === -1) {
            text.x = text.x - text.width - 10;
        }
        this.game.time.events.add(2000, text.destroy, text);
    }

    onInputDown(poker, pointer) {
        this.isDraging = true;
        this.onSelectPoker(poker, pointer);
    }

    onInputUp(poker, pointer) {
        this.isDraging = false;
        //this.onSelectPoker(poker, pointer);
    }

    onInputOver(poker, pointer) {
        if (this.isDraging) {
            this.onSelectPoker(poker, pointer);
        }
    }

    onSelectPoker(poker, pointer) {
        let index = this.hintPoker.indexOf(poker.id);
        if (index === -1) {
            poker.y = this.game.world.height - Poker.PH * 0.8;
            this.hintPoker.push(poker.id);
        } else {
            poker.y = this.game.world.height - Poker.PH * 0.5;
            this.hintPoker.splice(index, 1);
        }
    }


    onPass(btn) {
        this.game.finishPlay([]);
        this.pokerUnSelected(this.hintPoker);
        this.hintPoker = [];
        btn.parent.forEach(function (child) {
            child.kill();
        });
    }


    onHint(btn) {
        if (this.hintPoker.length === 0) {
            this.hintPoker = this.lastTurnPoker;
        } else {
            this.pokerUnSelected(this.hintPoker);
            if (this.lastTurnPoker.length > 0 && !Poker.canCompare(this.hintPoker, this.lastTurnPoker)) {
                this.hintPoker = [];
            }
        }
        let bigger = this.hint(this.hintPoker);
        if (bigger.length === 0) {
            if (this.hintPoker === this.lastTurnPoker) {
                this.say("没有能大过的牌");
            } else {
                this.pokerUnSelected(this.hintPoker);
            }
        } else {
            this.pokerSelected(bigger);
        }
        this.hintPoker = bigger;
    }

    onShot(btn) {
        if (this.hintPoker.length === 0) {
            return;
        }
        let code = this.canPlay(this.game.isLastShotPlayer() ? [] : this.game.tablePoker, this.hintPoker);
        if (code) {
            this.say(code);
            return;
        }
        this.game.finishPlay(this.hintPoker);
        this.hintPoker = [];
        btn.parent.forEach(function (child) {
            child.kill();
        });
    }

    hint(lastTurnPoker) {
        let cards;
        let handCards = Poker.toCards(this.pokerInHand);
        if (lastTurnPoker.length === 0) {
            cards = Rule.bestShot(handCards);
        } else {
            cards = Rule.cardsAbove(handCards, Poker.toCards(lastTurnPoker));
        }

        return Poker.toPokers(this.pokerInHand, cards);
    }

    canPlay(lastTurnPoker, shotPoker) {
        let cardsA = Poker.toCards(shotPoker);
        let valueA = Rule.cardsValue(cardsA);
        if (!valueA[0]) {
            return '出牌不合法';
        }
        let cardsB = Poker.toCards(lastTurnPoker);
        if (cardsB.length === 0) {
            return '';
        }
        let valueB = Rule.cardsValue(cardsB);
        if (valueA[0] !== valueB[0] && valueA[1] < 1000) {
            return '出牌类型跟上家不一致';
        }

        if (valueA[1] > valueB[1]) {
            return '';
        }
        return '出牌需要大于上家';
    }

    playPoker(lastTurnPoker) {
        this.lastTurnPoker = lastTurnPoker;

        const group = this.shotLayer;
        const W = this.game.world.width;
        const H = this.game.world.height;
        const showPass = !this.game.isLastShotPlayer();
        const btns = showPass ? [group.getAt(0), group.getAt(1), group.getAt(2)] : [group.getAt(1), group.getAt(2)];

        const gap = 10;
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
            b.revive();
        });

        this.enableInput();
    }

    sortPoker() {
        this.pokerInHand.sort(Poker.comparePoker);
    }

    dealPoker() {
        this.sortPoker();
        let length = this.pokerInHand.length;
        for (let i = 0; i < length; i++) {
            let pid = this.pokerInHand[i];
            let p = new Poker(this.game, pid, pid);
            this.game.world.add(p);
            this.pushAPoker(p);
            this.dealPokerAnim(p, i);
        }
    }

    dealPokerAnim(p, i) {
        //to(properties, duration, ease, autoStart, delay, repeat, yoyo)
        this.game.add.tween(p).to({
            x: this.game.world.width / 2 + Poker.PW * 0.44 * (i - 8.5),
            y: this.game.world.height - Poker.PH / 2
        }, 500, Phaser.Easing.Default, true, 50 * i);
    }

    arrangePoker() {
        let count = this.pokerInHand.length;
        if (count === 0) {
            return;
        }
        let gap = Math.min(this.game.world.width / count, Poker.PW * 0.44);
        for (let i = 0; i < count; i++) {
            let pid = this.pokerInHand[i];
            let p = this.findAPoker(pid);
            if (!p) continue;
            p.bringToTop();
            if (typeof Layout.cardScale === 'number') p.scale.set(Layout.cardScale);
            this.game.add.tween(p).to({x: this.game.world.width / 2 + (i - count / 2) * gap}, 600, Phaser.Easing.Default, true);
        }
    }

    pushAPoker(poker) {
        this._pokerPic[poker.id] = poker;

        poker.events.onInputDown.add(this.onInputDown, this);
        poker.events.onInputUp.add(this.onInputUp, this);
        poker.events.onInputOver.add(this.onInputOver, this);
    }

    removeAPoker(pid) {
        let length = this.pokerInHand.length;
        for (let i = 0; i < length; i++) {
            if (this.pokerInHand[i] === pid) {
                this.pokerInHand.splice(i, 1);
                delete this._pokerPic[pid];
                return;
            }
        }
        console.log('Error: REMOVE POKER ', pid);
    }

    removeAllPoker() {
        let length = this.pokerInHand.length;
        for (let i = 0; i < length; i++) {
            this.pokerInHand.splice(i, 1);
            delete this._pokerPic[pid];
        }
        console.log('Error: REMOVE POKER ', pid);
    }

    findAPoker(pid) {
        let poker = this._pokerPic[pid];
        if (poker === undefined) {
            console.log('Error: FIND POKER ', pid);
        }
        return poker;
    }

    enableInput() {
        let length = this.pokerInHand.length;
        for (let i = 0; i < length; i++) {
            let p = this.findAPoker(this.pokerInHand[i]);
            p.inputEnabled = true;
        }
    }

    pokerSelected(pokers) {
        for (let i = 0; i < pokers.length; i++) {
            let p = this.findAPoker(pokers[i]);
            p.y = this.game.world.height - Poker.PH * 0.8;
        }
    }

    pokerUnSelected(pokers) {
        for (let i = 0; i < pokers.length; i++) {
            let p = this.findAPoker(pokers[i]);
            p.y = this.game.world.height - Poker.PH / 2;
        }
    }
}


export class NetPlayer extends Player {
    constructor(seat, game) {
        super(seat, game);
        this._pokerPic = [];
    }

    pushAPoker(poker) {
        this._pokerPic.push(poker);
        this.updateLeftPoker();
    }

    removeAPoker(pid) {
        let i = this.pokerInHand.length - 1;
        for (; i >= 0; i--) {
            if (this.pokerInHand[i] === pid) {
                this.pokerInHand.splice(i, 1);
                break
            }
        }
        if (i === -1) {
            this.pokerInHand.pop();
        }
        i = this._pokerPic.length - 1;
        for (; i >= 0; i--) {
            if (this._pokerPic[i].id === pid) {
                this._pokerPic.splice(i, 1);
                break
            }
        }
        if (i === -1) {
            this._pokerPic.pop();
        }
        this.updateLeftPoker();
    }

    arrangePoker() {
        if (this.pokerInHand.length > 0 && this.pokerInHand[0] < 54) {
            this.reDealPoker();
        }
    }

    replacePoker(pokers, start) {
        if (this.pokerInHand.length !== pokers.length - start) {
            console.log("ERROR ReplacePoker:", this.pokerInHand, pokers);
        }
        if (this._pokerPic.length !== pokers.length - start) {
            console.log("ERROR ReplacePoker:", this._pokerPic, pokers);
        }
        const length = this.pokerInHand.length;
        for (let i = 0; i < length; i++) {
            this.pokerInHand[i] = pokers[start + i];
            this._pokerPic[i].id = pokers[start + i];
            this._pokerPic[i].frame = pokers[start + i];
        }
    }

    findAPoker(pid) {
        for (let i = this._pokerPic.length - 1; i >= 0; i--) {
            if (this._pokerPic[i].id == pid) {
                return this._pokerPic[i];
            }
        }
        return this._pokerPic[this._pokerPic.length - 1];
    }

    reDealPoker() {
        this.sortPoker();
        const length = this.pokerInHand.length;
        for (let i = 0; i < length; i++) {
            const pid = this.pokerInHand[i];
            const p = this.findAPoker(pid);
            if (!p) continue;
            p.bringToTop();
            if (typeof Layout.cardScale === 'number') p.scale.set(Layout.cardScale);
            this.dealPokerAnim(p, this.seat === 1 ? length - 1 - i : i);
        }
    }

    cleanPokers() {
        const length = this.pokerInHand.length;
        for (let i = 0; i < length; i++) {
            const pid = this.pokerInHand[i];
            const p = this.findAPoker(pid);
            if (p) {
                p.kill();
            }
        }
        this.pokerInHand = [];
    }

    dealPokerAnim(p, i) {
        const width = this.game.world.width;
        if (p.id > 53) {
            this.game.add.tween(p).to({
                x: this.seat === 1 ? width - Poker.PW / 2 : Poker.PW / 2,
                y: this.seat === 1 ? this.uiHead.y + Poker.PH / 2 + 10 : this.uiHead.y + Poker.PH / 2 + 10
            }, 500, Phaser.Easing.Default, true, 25 + 50 * i);
        } else {
            this.game.add.tween(p).to({
                x: this.seat === 1 ? (width - Poker.PW / 2) - (i * Poker.PW * 0.44) : Poker.PW / 2 + i * Poker.PW * 0.44,
                y: this.seat === 1 ? this.uiHead.y + Poker.PH / 2 + 10 : this.uiHead.y + Poker.PH * 1.5 + 20
            }, 500, Phaser.Easing.Default, true, 50 * i);
        }
    }

    initUI(sx, sy) {
        super.initUI(sx, sy);
        this.uiLeftPoker = this.game.add.text(sx, sy + Poker.PH + 10, '17', {
            font: "22px Arial",
            fill: "#ffffff",
            align: "center"
        });
        this.uiLeftPoker.anchor.set(0.5, 0);
        this.uiLeftPoker.kill();
    }

    layoutUI(sx, sy) {
        super.layoutUI(sx, sy);
        if (this.uiLeftPoker) {
            this.uiLeftPoker.x = sx;
            this.uiLeftPoker.y = sy + Poker.PH + 10;
        }
    }

    updateInfo(uid, name, point) {
        super.updateInfo(uid, name, point);
    }

    updateLeftPoker() {
        const len = this.pokerInHand.length;
        if (len > 0) {
            this.uiLeftPoker.text = "" + this.pokerInHand.length;
            this.uiLeftPoker.revive();
        } else {
            this.uiLeftPoker.kill();
        }
    }
}
