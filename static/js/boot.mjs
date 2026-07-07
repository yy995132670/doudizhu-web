
function audioPref(key) {
    const v = window.localStorage.getItem(key);
    return v === null ? '1' : v;
}

export const AudioPref = {
    musicOn: () => audioPref('ddz_music') === '1',
    soundOn: () => audioPref('ddz_sound') === '1',
    setMusic: (on) => {
        window.localStorage.setItem('ddz_music', on ? '1' : '0');
        if (window.__ddzRoomMusic && window.__ddzRoomMusic.stop) {
            if (on) { window.__ddzRoomMusic.play(); } else { window.__ddzRoomMusic.stop(); }
        }
    },
    setSound: (on) => window.localStorage.setItem('ddz_sound', on ? '1' : '0'),
};

export const Layout = {
    isMobile: false,
    isPortrait: false,
    cardScale: 1,
    fontScale: 1,
    btnScale: 1,
    compute() {
        const ua = navigator.userAgent || '';
        const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const w = window.innerWidth || document.documentElement.clientWidth || screen.width || 320;
        const h = window.innerHeight || document.documentElement.clientHeight || screen.height || 320;
        this.viewW = w;
        this.viewH = h;
        this.isPortrait = h > w;
        const minDim = Math.min(w, h);
        this.isMobile = /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(ua) || (hasTouch && minDim < 820);
        if (this.isMobile) {
            if (minDim <= 380) { this.cardScale = 0.58; this.fontScale = 0.78; }
            else if (minDim <= 480) { this.cardScale = 0.66; this.fontScale = 0.84; }
            else if (minDim <= 640) { this.cardScale = 0.76; this.fontScale = 0.9; }
            else { this.cardScale = 0.86; this.fontScale = 0.95; }
            this.btnScale = minDim <= 480 ? 0.9 : 1;
        } else {
            this.cardScale = 1;
            this.fontScale = 1;
            this.btnScale = 1;
        }
    }
};

function get(url, payload, callback) {
    http('GET', url, payload, callback);
}

function post(url, payload, callback) {
    http('POST', url, payload, callback);
}

function http(method, url, payload, callback) {
    const xhr = new XMLHttpRequest();
    xhr.withCredentials = true;
    xhr.open(method, url, true);
    xhr.setRequestHeader('Content-type', 'application/json');
    xhr.onreadystatechange = function () {
        if (xhr.readyState === XMLHttpRequest.DONE) {
            const response = JSON.parse(xhr.responseText);
            callback(xhr.status, response);
        }
    };
    xhr.send(JSON.stringify(payload));
}

function drawRounded(graphics, x, y, w, h, radius) {
    if (graphics.drawRoundedRect) {
        graphics.drawRoundedRect(x, y, w, h, radius);
    } else {
        graphics.drawRect(x, y, w, h);
    }
}

function coverBackground(game, key) {
    const bg = game.add.sprite(game.world.centerX, game.world.centerY, key);
    bg.anchor.set(0.5);
    const scale = Math.max(game.world.width / bg.width, game.world.height / bg.height);
    bg.scale.set(scale);
    return bg;
}

function addPanel(game, x, y, w, h, alpha) {
    const panel = game.add.graphics(0, 0);
    panel.beginFill(0x07111a, alpha);
    panel.lineStyle(2, 0xf6d28a, 0.42);
    drawRounded(panel, x, y, w, h, 12);
    panel.endFill();
    return panel;
}

function addMenuButton(game, x, y, w, h, label, detail, callback, context) {
    const group = game.add.group();
    const shadow = game.add.graphics(0, 0);
    shadow.beginFill(0x000000, 0.35);
    drawRounded(shadow, x - w / 2 + 6, y - h / 2 + 8, w, h, 12);
    shadow.endFill();
    group.add(shadow);

    const body = game.add.graphics(0, 0);
    body.beginFill(0xf4d492, 0.98);
    body.lineStyle(3, 0x7a3f10, 0.78);
    drawRounded(body, x - w / 2, y - h / 2, w, h, 12);
    body.endFill();
    body.beginFill(0xfff4c8, 0.45);
    drawRounded(body, x - w / 2 + 8, y - h / 2 + 6, w - 16, Math.max(16, h * 0.32), 8);
    body.endFill();
    body.inputEnabled = true;
    body.input.useHandCursor = true;
    body.events.onInputUp.add(callback, context);
    group.add(body);

    const title = game.add.text(x, y - (detail ? 17 : 0), label, {
        font: "34px Arial",
        fill: "#56320f",
        align: "center",
        stroke: "#fff7cf",
        strokeThickness: 2
    });
    title.anchor.set(0.5);
    title.inputEnabled = true;
    title.input.useHandCursor = true;
    title.events.onInputUp.add(callback, context);
    group.add(title);

    if (detail) {
        const sub = game.add.text(x, y + 22, detail, {
            font: "17px Arial",
            fill: "#71461a",
            align: "center"
        });
        sub.anchor.set(0.5);
        sub.inputEnabled = true;
        sub.input.useHandCursor = true;
        sub.events.onInputUp.add(callback, context);
        group.add(sub);
    }
    return group;
}

function addTopButton(game, x, y, w, h, label, callback, context) {
    const group = game.add.group();
    const body = game.add.graphics(0, 0);
    body.beginFill(0x07111a, 0.72);
    body.lineStyle(2, 0xf6d28a, 0.5);
    drawRounded(body, x, y, w, h, 8);
    body.endFill();
    body.inputEnabled = true;
    body.input.useHandCursor = true;
    body.events.onInputUp.add(callback, context);
    group.add(body);

    const text = game.add.text(x + w / 2, y + h / 2, label, {
        font: "20px Arial",
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
    return group;
}

export class Boot {
    preload() {
        this.load.image('preloaderBar', 'static/i/preload.png');
    }

    create() {
        this.input.maxPointers = 1;
        this.stage.disableVisibilityChange = true;
        this.scale.scaleMode = Phaser.ScaleManager.RESIZE;
        this.scale.enterIncorrectOrientation.add(this.enterIncorrectOrientation, this);
        this.scale.leaveIncorrectOrientation.add(this.leaveIncorrectOrientation, this);
        this.resizeHandler = this.onSizeChange.bind(this);
        window.addEventListener('resize', this.resizeHandler);
        window.addEventListener('orientationchange', this.resizeHandler);
        this.onSizeChange();
        this.state.start('Preloader');
    }

    onSizeChange() {
        Layout.compute();
        let width = Layout.viewW;
        let height = Layout.viewH;
        // sane minimum so tiny windows still render
        width = Math.max(320, Math.floor(width));
        height = Math.max(320, Math.floor(height));
        const stateName = this.game.state.current;
        const heightOnly = this._lastResizeW !== undefined && this._lastResizeW === width;
        this._lastResizeW = width;
        // On the Login screen, a height-only change is the mobile soft keyboard
        // appearing/disappearing. Resizing the canvas mid-animation can dismiss the
        // keyboard, so keep the canvas stable and leave the focused <input> alone.
        if (stateName === 'Login' && heightOnly) {
            return;
        }
        try {
            this.scale.setGameSize(width, height);
            this.scale.setMinMax(320, 320, Math.max(width, 3200), Math.max(height, 3200));
            this.scale.pageAlignHorizontally = false;
            this.scale.pageAlignVertically = false;
            this.scale.refresh();
        } catch (e) { /* scale manager not ready */ }
        if (this.game.canvas) {
            this.game.canvas.style.width = `${width}px`;
            this.game.canvas.style.height = `${height}px`;
            this.game.canvas.style.left = '0px';
            this.game.canvas.style.top = '0px';
        }
        this.updateOrientationHint();
        const state = this.game.state.getCurrentState();
        if (state && state !== this && typeof state.onResize === 'function') {
            state.onResize();
        }
        window.setTimeout(() => { try { this.scale.refresh(); } catch (e) {} }, 100);
    }

    updateOrientationHint() {
        const el = document.getElementById('orientation');
        if (!el) return;
        if (Layout.isMobile && Layout.isPortrait) {
            el.innerHTML = '📱 <b>横屏体验更佳</b> · 已可正常操作';
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    }

    enterIncorrectOrientation() {
        this.updateOrientationHint();
    }

    leaveIncorrectOrientation() {
        this.updateOrientationHint();
    }
}

export class Preloader {

    preload() {
        this.preloadBar = this.game.add.sprite(120, 200, 'preloaderBar');
        this.load.setPreloadSprite(this.preloadBar);

        this.load.audio('music_room', 'static/audio/bg_room.mp3');
        this.load.audio('music_game', 'static/audio/bg_game.ogg');
        this.load.audio('music_deal', 'static/audio/deal.mp3');
        this.load.audio('music_win', 'static/audio/end_win.mp3');
        this.load.audio('music_lose', 'static/audio/end_lose.mp3');
        this.load.audio('f_score_0', 'static/audio/f_score_0.mp3');
        this.load.audio('f_score_1', 'static/audio/f_score_1.mp3');
        this.load.atlas('btn', 'static/i/btn.png', 'static/i/btn.json');
        this.load.image('bg', 'static/i/bg.png');
        this.load.spritesheet('poker', 'static/i/poker.png', 90, 120);
        this.load.json('rule', 'static/rule.json');
    }

    create() {
        const that = this;
        get('/userinfo', {}, function (status, response) {
            if (status === 200) {
                window.playerInfo = response;
                if (response['uid']) {
                    // 刷新浏览器后若仍在房间宽限期内，直接回到该房间
                    if (response['room'] && response['room'] > 0) {
                        that.state.start('Game', true, false, 1, response['room']);
                    } else {
                        that.state.start('MainMenu');
                    }
                } else {
                    that.state.start('Login');
                }
            } else {
                that.state.start('Login');
            }
        });
        const music = this.game.add.audio('music_room');
        music.loop = true;
        music.loopFull();
        window.__ddzRoomMusic = music;
        if (AudioPref.musicOn()) {
            music.play();
        }
    }
}

export class MainMenu {
    create() {
        this.stage.backgroundColor = '#102636';
        this.roomPickerOpen = false;
        this.settingsOpen = false;
        this.renderMainMenu();
    }

    onResize() {
        if (this.settingsOpen) {
            this.renderSettings();
        } else if (this.roomPickerOpen) {
            this.renderRoomPicker();
        } else {
            this.renderMainMenu();
        }
    }

    renderMainMenu() {
        if (this.root) {
            this.root.destroy();
        }
        this.root = this.game.add.group();
        const width = this.game.world.width;
        const height = this.game.world.height;

        const bg = coverBackground(this.game, 'bg');
        this.root.add(bg);

        const wash = this.game.add.graphics(0, 0);
        wash.beginFill(0x062033, 0.18);
        wash.drawRect(0, 0, width, height);
        wash.endFill();
        wash.beginFill(0x000000, 0.28);
        wash.drawRect(0, 0, width, 88);
        wash.endFill();
        wash.beginFill(0x000000, 0.22);
        wash.drawRect(0, height - 74, width, 74);
        wash.endFill();
        this.root.add(wash);

        const title = this.game.add.text(width / 2, Math.max(76, height * 0.13), "斗地主", {
            font: "64px Arial",
            fill: "#ffe8a2",
            align: "center",
            stroke: "#5b2608",
            strokeThickness: 7
        });
        title.anchor.set(0.5);
        this.root.add(title);

        const subTitle = this.game.add.text(width / 2, title.y + 54, "好友同桌 · 实时对战", {
            font: "22px Arial",
            fill: "#fff8d6",
            align: "center",
            stroke: "#17384a",
            strokeThickness: 3
        });
        subTitle.anchor.set(0.5);
        this.root.add(subTitle);

        const accountPanel = this.game.add.graphics(0, 0);
        accountPanel.beginFill(0x07111a, 0.64);
        accountPanel.lineStyle(2, 0xf6d28a, 0.35);
        drawRounded(accountPanel, 24, 16, Math.min(430, width * 0.36), 52, 8);
        accountPanel.endFill();
        this.root.add(accountPanel);

        const user = this.game.add.text(42, 42, "当前账号：" + window.playerInfo.name, {
            font: "24px Arial",
            fill: "#fff6dc",
            align: "left",
            stroke: "#000000",
            strokeThickness: 4
        });
        user.anchor.set(0, 0.5);
        this.root.add(user);

        this.root.add(addTopButton(this.game, width - 160, 16, 132, 44, "退出登录", this.logout, this));

        const buttonWidth = Math.max(300, Math.min(400, width * 0.26));
        const buttonHeight = 88;
        const centerX = width / 2;
        const startY = Math.max(height * 0.36, 250);
        const gap = Math.max(112, Math.min(136, height * 0.16));

        this.root.add(addMenuButton(this.game, centerX, startY, buttonWidth, buttonHeight, "快速开始", "系统自动配桌", this.gotoAiRoom, this));
        this.root.add(addMenuButton(this.game, centerX, startY + gap, buttonWidth, buttonHeight, "真人对战", "选择房间或新建房间", this.showRoomPicker, this));
        this.root.add(addMenuButton(this.game, centerX, startY + gap * 2, buttonWidth, buttonHeight, "设置", "音效与玩法偏好", this.gotoSetting, this));

        const footer = this.game.add.text(width / 2, height - 36, "选择一个模式进入牌桌", {
            font: "20px Arial",
            fill: "#e3edf2",
            align: "center",
            stroke: "#0b1820",
            strokeThickness: 3
        });
        footer.anchor.set(0.5);
        this.root.add(footer);
    }

    gotoAiRoom() {
        // start(key, clearWorld, clearCache, parameter)
        this.state.start('Game', true, false, 1, -1);
        // this.music.stop();
    }

    gotoRoom(roomId) {
        this.state.start('Game', true, false, 2, roomId);
    }

    showRoomPicker() {
        get('/userinfo', {}, (status, response) => {
            if (status === 200) {
                window.playerInfo = response;
            }
            this.roomPickerOpen = true;
            this.renderRoomPicker();
        });
    }

    renderRoomPicker() {
        if (this.roomPicker) {
            this.roomPicker.destroy();
        }

        const group = this.game.add.group();
        this.roomPicker = group;
        const width = this.game.world.width;
        const height = this.game.world.height;
        const panel = this.game.add.graphics(0, 0);
        panel.beginFill(0x06121c, 0.72);
        panel.drawRect(0, 0, width, height);
        panel.endFill();
        group.add(panel);

        const boardWidth = Math.max(640, Math.min(980, width * 0.72));
        const boardHeight = Math.max(420, Math.min(620, height * 0.72));
        const boardX = (width - boardWidth) / 2;
        const boardY = (height - boardHeight) / 2;
        group.add(addPanel(this.game, boardX, boardY, boardWidth, boardHeight, 0.86));

        const titleStyle = {font: "38px Arial", fill: "#ffe8a2", align: "center", stroke: "#542706", strokeThickness: 5};
        const bodyStyle = {font: "24px Arial", fill: "#fff3ce", align: "center", stroke: "#2b1708", strokeThickness: 2};
        const title = this.game.add.text(width / 2, boardY + 34, "真人对战大厅", titleStyle);
        title.anchor.set(0.5, 0);
        group.add(title);

        const roomsByLevel = (window.playerInfo.rooms || []).find(item => item.level === 2);
        const rooms = roomsByLevel && roomsByLevel.rooms ? roomsByLevel.rooms : [];
        const actions = [{id: 0, label: "新建房间", players: 0, state: 0}].concat(rooms);
        const cols = width < 900 ? 2 : 3;
        const cardWidth = Math.min(250, (boardWidth - 80) / cols);
        const cardHeight = 82;
        actions.slice(0, 12).forEach((room, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const label = room.id === 0 ? room.label : `房间 ${room.id}`;
            const meta = room.id === 0 ? "开一个新的三人桌" : `${room.players}/3 人 ${room.playing ? "对局中" : "等待中"}`;
            const x = boardX + 40 + cardWidth / 2 + col * cardWidth;
            const y = boardY + 128 + row * 112;
            group.add(addMenuButton(this.game, x, y, cardWidth - 18, cardHeight, label, meta, () => this.gotoRoom(room.id), this));
        });

        const quick = this.game.add.text(width / 2, boardY + boardHeight - 90, "快速加入等待房间", bodyStyle);
        quick.anchor.set(0.5);
        quick.inputEnabled = true;
        quick.input.useHandCursor = true;
        quick.events.onInputUp.add(() => this.gotoRoom(-1), this);
        group.add(quick);

        const close = this.game.add.text(width / 2, boardY + boardHeight - 44, "返回主界面", bodyStyle);
        close.anchor.set(0.5);
        close.inputEnabled = true;
        close.input.useHandCursor = true;
        close.events.onInputUp.add(() => {
            this.roomPickerOpen = false;
            group.destroy();
        }, this);
        group.add(close);
    }

    gotoSetting() {
        this.settingsOpen = true;
        this.renderSettings();
    }

    renderSettings() {
        if (this.settingsGroup) {
            this.settingsGroup.destroy();
        }
        const group = this.game.add.group();
        this.settingsGroup = group;
        const width = this.game.world.width;
        const height = this.game.world.height;

        const overlay = this.game.add.graphics(0, 0);
        overlay.beginFill(0x06121c, 0.72);
        overlay.drawRect(0, 0, width, height);
        overlay.endFill();
        overlay.inputEnabled = true;
        group.add(overlay);

        const boardWidth = Math.max(420, Math.min(560, width * 0.4));
        const boardHeight = Math.max(360, Math.min(440, height * 0.66));
        const boardX = (width - boardWidth) / 2;
        const boardY = (height - boardHeight) / 2;
        group.add(addPanel(this.game, boardX, boardY, boardWidth, boardHeight, 0.9));

        const titleStyle = {font: "38px Arial", fill: "#ffe8a2", align: "center", stroke: "#542706", strokeThickness: 5};
        const title = this.game.add.text(width / 2, boardY + 36, "设  置", titleStyle);
        title.anchor.set(0.5, 0);
        group.add(title);

        const rows = [
            {key: 'music', label: '背景音乐', on: AudioPref.musicOn(), toggle: (v) => AudioPref.setMusic(v)},
            {key: 'sound', label: '游戏音效', on: AudioPref.soundOn(), toggle: (v) => AudioPref.setSound(v)},
        ];
        const that = this;
        const rowH = 76;
        rows.forEach((row, idx) => {
            const y = boardY + 130 + idx * rowH;
            const label = that.game.add.text(boardX + 40, y, row.label, {
                font: "26px Arial", fill: "#fff3ce", align: "left",
                stroke: "#2b1708", strokeThickness: 2
            });
            label.anchor.set(0, 0.5);
            group.add(label);

            const tw = 92, th = 40;
            const tx = boardX + boardWidth - 40 - tw;
            const ty = y - th / 2;
            const knob = that.game.add.graphics(0, 0);
            const knobText = that.game.add.text(tx + tw / 2, y, row.on ? '开' : '关', {
                font: "22px Arial", fill: "#ffffff", align: "center",
                stroke: "#000000", strokeThickness: 2
            });
            knobText.anchor.set(0.5);
            const draw = (on) => {
                knob.clear();
                knob.beginFill(on ? 0x4caf50 : 0x5a6b78, 0.95);
                knob.lineStyle(2, on ? 0x9be7b4 : 0xaab4bd, 0.9);
                drawRounded(knob, tx, ty, tw, th, th / 2);
                knob.endFill();
                knob.beginFill(0xffffff, 0.95);
                const cx = on ? tx + tw - th / 2 : tx + th / 2;
                knob.drawCircle(cx, y, th - 8);
                knob.endFill();
                knobText.text = on ? '开' : '关';
            };
            draw(row.on);
            knob.inputEnabled = true;
            knob.input.useHandCursor = true;
            const toggleArea = that.game.add.graphics(0, 0);
            toggleArea.beginFill(0x000000, 0);
            toggleArea.drawRect(boardX + 30, y - rowH / 2 + 6, boardWidth - 60, rowH - 12);
            toggleArea.endFill();
            toggleArea.inputEnabled = true;
            toggleArea.input.useHandCursor = true;
            toggleArea.events.onInputUp.add(() => {
                row.on = !row.on;
                row.toggle(row.on);
                draw(row.on);
            }, that);
            group.add(knob);
            group.add(knobText);
            group.add(toggleArea);
        });

        group.add(addMenuButton(this.game, width / 2, boardY + boardHeight - 56, 220, 64, "返回", null, () => {
            this.settingsOpen = false;
            group.destroy();
            this.renderMainMenu();
        }, this));
    }

    logout() {
        post('/logout', {}, () => {
            window.playerInfo = null;
            this.state.start('Login');
        });
    }
}

export class Login {
    create() {
        this.stage.backgroundColor = '#182d3b';
        this.renderLogin();
    }

    onResize() {
        // On mobile, the soft keyboard shrinks window.innerHeight and fires a resize.
        // Re-rendering here would destroy the phaser-input <input> element and dismiss
        // the keyboard instantly. Skip re-render when only the height changed (width
        // unchanged == keyboard, not orientation/real resize).
        const w = this.game.world.width;
        if (this._loginRenderedW !== undefined && this._loginRenderedW === w) {
            return;
        }
        this._loginRenderedW = w;
        this.renderLogin();
    }

    renderLogin() {
        if (this.name && this.name.destroy) {
            this.name.destroy();
            this.name = null;
        }
        if (this.root) {
            this.root.destroy();
        }
        this.root = this.game.add.group();
        const width = this.game.world.width;
        const height = this.game.world.height;
        this._loginRenderedW = width;
        const bg = coverBackground(this.game, 'bg');
        this.root.add(bg);

        const shade = this.game.add.graphics(0, 0);
        shade.beginFill(0x061827, 0.28);
        shade.drawRect(0, 0, width, height);
        shade.endFill();
        this.root.add(shade);

        const panelWidth = Math.max(420, Math.min(540, width * 0.34));
        const panelHeight = 330;
        const panelX = (width - panelWidth) / 2;
        const panelY = Math.max(120, (height - panelHeight) / 2);
        this.root.add(addPanel(this.game, panelX, panelY, panelWidth, panelHeight, 0.82));

        const title = this.game.add.text(width / 2, panelY + 48, "斗地主", {
            font: "54px Arial",
            fill: "#ffe8a2",
            align: "center",
            stroke: "#5b2608",
            strokeThickness: 6
        });
        title.anchor.set(0.5);
        this.root.add(title);

        this.game.add.plugin(PhaserInput.Plugin);
        const style = {
            font: '30px Arial', fill: '#3e2b17', width: 320, padding: 14,
            backgroundColor: '#fff7dc',
            borderWidth: 2, borderColor: '#9b6425', borderRadius: 6,
            textAlign: 'center', placeHolder: '请输入用户名'
        };
        this.name = this.game.add.inputField((width - 320) / 2, panelY + 112, style);
        this.root.add(this.name);

        this.errorText = this.game.add.text(width / 2, panelY + 184, '', {
            font: "24px Arial",
            fill: "#ffdddd",
            align: "center",
            stroke: "#3b0000",
            strokeThickness: 3
        });
        this.errorText.anchor.set(0.5, 0);
        this.root.add(this.errorText);

        this.root.add(addMenuButton(this.game, width / 2, panelY + 248, 260, 78, "登录", "进入游戏大厅", this.onLogin, this));
    }

    onLogin() {
        this.errorText.text = '';
        if (!this.name.value) {
            this.name.startFocus();
            this.errorText.text = '请输入用户名';
            return;
        }
        let that = this;
        const payload = {
            "name": this.name.value,
        };
        post('/login', payload, function (status, response) {
            if (status === 200) {
                window.playerInfo = response;
                that.state.start('MainMenu');
            } else {
                that.errorText.text = response.detail;
            }
        })
    }
}
