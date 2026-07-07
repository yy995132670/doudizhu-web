# AGENTS.md — doudizhu (斗地主)

Python (Tornado) + MySQL backend, Phaser **2.x** (not 3) canvas frontend. Single-process websocket game. Deployed as a systemd service.

## Run / deploy

The app is a systemd service `doudizhu.service`, live on **port 8060**. The Python in-code defaults in `server/config.py` (port 8080, DB `root:123456`) are **wrong for this host** — the real values come from the systemd unit env:

- `PORT=8060`
- `DATABASE_URI=mysql+aiomysql://ddz:654565168@127.0.0.1:3306/ddz`

Manual run (cwd **must** be `server/`, see gotcha below):
```bash
cd /home/yy-ubuntu/doudizhu/server
PORT=8060 DATABASE_URI='mysql+aiomysql://ddz:654565168@127.0.0.1:3306/ddz' \
  /home/yy-ubuntu/miniconda3/envs/doudizhu/bin/python app.py
```

**Restart** (sudo is typically unavailable here; the unit has `Restart=always`, so killing the pid makes systemd relaunch it):
```bash
kill -TERM $(pgrep -f 'doudizhu/server/app.py')
```

**Python edits need a restart. JS/HTML/CSS do not** — static files are served from disk with `Cache-Control: no-cache` via `NoCacheStaticFileHandler` (see `server/app.py`).

**Logs** go to journald, not the stale `server-8060.log` file:
```bash
journalctl -u doudizhu -f        # or: -n 50 --no-pager
```

## Gotchas

- **Interpreter**: use `/home/yy-ubuntu/miniconda3/envs/doudizhu/bin/python`, not system `python3`. Deps are pinned in `doudizhu/requirements.txt`.
- **cwd dependency**: `server/api/game/rule.py` opens `'static/rule.json'` relative to cwd. Always run from `server/`, or card-rule loading silently falls back to a random shuffle (`ModuleNotFoundError`/file-not-found is caught).
- **DB user is `ddz`, not `root`**: MySQL `root@localhost` uses `auth_socket` and cannot connect over TCP. Connect with `mysql -uddz -p654565168 -h127.0.0.1 ddz`.
- **DB connection pool**: `models/base.py` sets `pool_pre_ping=True` + `pool_recycle=280`. Do **not** remove these — MySQL closes idle connections and the pool will serve dead conns (`Lost connection to MySQL server` / 500 on login) without them. Keep `echo=False`.
- **Two projects in the home dir**: `~/doudizhu/` (this one, Python, active on :8060) and `~/landlord/` (a separate Go implementation, older). Don't edit the wrong one.

## Architecture

- Entry: `server/app.py` → `Application` (Tornado). Routes: `/` (index→`poker.html`), `/login`, `/logout`, `/userinfo`, `/ws` (game socket), `/social/*` (WeChat, unused locally).
- Game flow lives in `server/api/game/`: `views.py` (socket), `player.py` (state machine + turn), `room.py` (deal/rob/shot/score/spring), `rule.py` (card-type engine, loads `static/rule.json`), `globalvar.py` (rooms/players registry), `components/simple.py` (robot AI).
- Protocol: integer codes in `server/api/game/protocol.py` (backend) mirrored by `static/js/net.mjs` (frontend). The two must stay in sync.
- Frontend: `server/templates/poker.html` boots Phaser 2 (uses the legacy `game.state.add`/`Phaser.Sprite`/`events.onInputUp.add` API). ES modules in `static/js/`: `boot.mjs` (menu/login/settings), `game.mjs` (table + game-over panel), `player.mjs`, `rule.mjs`, `net.mjs`. Responsive scaling lives in `Layout` (`boot.mjs`); `Poker.PW/PH` are dynamic getters, not constants.
- DB models: `server/models/auth.py` (`User`, `Record`); Alembic in `server/alembic/` but schema is also in `doudizhu/schema.sql`.

## Verify (there is no test suite)

```bash
# JS syntax
for f in server/static/js/*.mjs; do node --check "$f" || echo "FAIL $f"; done
# Python syntax
/home/yy-ubuntu/miniconda3/envs/doudizhu/bin/python -m py_compile server/app.py
```
End-to-end gameplay: the server doesn't force a move for connected players on timeout (the client/托管 handles own turns). To drive a full game, use a tornado-websocket client that logs in (POST `/login` → token), connects to `/ws?token=…`, and emits `REQ_*` packets per `protocol.py`. Robots auto-join level-1 rooms ~10s after a human joins.

Headless browser check (Chrome is at `~/.agent-browser/browsers/chrome-*/chrome`): load `http://127.0.0.1:8060/` with a mobile UA + `--window-size` to confirm no JS exceptions and that the canvas internal size equals the viewport (no distortion).

## Conventions

- Backend comments and UI strings are Chinese; keep that style.
- `write_error` returns JSON `{"detail": <reason>}`; the game-socket error channel is `[0, {"reason": …}]` (Protocol.ERROR) — different from HTTP errors.
- No git here; back up before large changes if desired (prior sessions left `server/.codex-backups/`).
