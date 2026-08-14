/* ============================================================
   SONIC WEB PLATFORMER â€” Emerald Hill Zone Act 1
   Physics per Sonic Physics Guide (SPG, 16-bit Genesis era)
   ============================================================ */
(function() {
    'use strict';

    /* ---------------- Audio Engine (Web Audio synth) ---------------- */
    class SoundEngine {
        constructor() {
            this.ctx = null;
            this.musicVolume = 0.7;
            this.sfxVolume = 0.8;
            this.isMuted = false;
            this.bgmTimer = null;
            this.bgmStep = 0;
            this.initialized = false;
        }
        init() {
            if (this.initialized) return;
            try {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                this.ctx = new Ctx();
                this.initialized = true;
            } catch (e) { /* no audio */ }
        }
        resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
        playSFX(type, pitch = 1) {
            if (!this.initialized || this.isMuted || this.sfxVolume <= 0) return;
            this.resume();
            const now = this.ctx.currentTime, v = this.sfxVolume;
            const tone = (f0, f1, dur, wave, g) => {
                const o = this.ctx.createOscillator(), gn = this.ctx.createGain();
                o.type = wave; o.frequency.setValueAtTime(f0 * pitch, now);
                o.frequency.exponentialRampToValueAtTime(Math.max(1, f1 * pitch), now + dur);
                gn.gain.setValueAtTime(g * v, now);
                gn.gain.exponentialRampToValueAtTime(0.001, now + dur);
                o.connect(gn); gn.connect(this.ctx.destination);
                o.start(now); o.stop(now + dur + 0.02);
            };
            const noise = (dur, g) => {
                const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
                const d = buf.getChannelData(0);
                for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
                const src = this.ctx.createBufferSource(); src.buffer = buf;
                const gn = this.ctx.createGain();
                gn.gain.setValueAtTime(g * v, now);
                gn.gain.exponentialRampToValueAtTime(0.001, now + dur);
                src.connect(gn); gn.connect(this.ctx.destination);
                src.start(now);
            };
            switch (type) {
                case 'jump': tone(140, 640, 0.14, 'square', 0.22); break;
                case 'ring': tone(880, 1320, 0.22, 'sine', 0.22); break;
                case 'spindash_charge': tone(180 + pitch * 60, 320 + pitch * 90, 0.1, 'sawtooth', 0.18); break;
                case 'spindash_release': tone(240, 760, 0.22, 'sawtooth', 0.3); break;
                case 'hurt': tone(150, 40, 0.32, 'sawtooth', 0.4); break;
                case 'spring': tone(180, 950, 0.2, 'triangle', 0.32); break;
                case 'destroy': noise(0.16, 0.35); tone(900, 140, 0.12, 'square', 0.15); break;
                case 'skid': noise(0.12, 0.2); break;
                case 'clear': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.22, 'triangle', 0.22)); break;
            }
        }
        startBGM() {
            if (this.bgmTimer) return;
            this.bgmStep = 0;
            const mel = [660, 784, 880, 784, 660, 587, 523, 587, 660, 784, 880, 1047, 880, 784, 660, 587];
            const bass = [220, 196, 165, 147, 220, 196, 165, 147, 220, 196, 165, 147, 220, 196, 165, 147];
            this.bgmTimer = setInterval(() => {
                if (!this.initialized || this.isMuted || this.musicVolume <= 0) return;
                this.resume();
                const t = this.ctx.currentTime;
                const note = (f, dur, wave, g) => {
                    const o = this.ctx.createOscillator(), gn = this.ctx.createGain();
                    o.type = wave; o.frequency.setValueAtTime(f, t);
                    gn.gain.setValueAtTime(g * this.musicVolume, t);
                    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
                    o.connect(gn); gn.connect(this.ctx.destination);
                    o.start(t); o.stop(t + dur + 0.02);
                };
                const i = this.bgmStep % mel.length;
                note(mel[i], 0.16, 'triangle', 0.09);
                note(bass[i] / 2, 0.16, 'square', 0.05);
                this.bgmStep++;
            }, 155);
        }
        stopBGM() { if (this.bgmTimer) { clearInterval(this.bgmTimer); this.bgmTimer = null; } }
    }
    const audio = new SoundEngine();

    /* ---------------- State Machine ---------------- */
    const STATES = { TITLE: 'TITLE', OPTIONS: 'OPTIONS', PLAYING: 'PLAYING', STAGE_CLEAR: 'STAGE_CLEAR', GAME_OVER: 'GAME_OVER' };
    let currentState = STATES.TITLE;
    let lastScore = parseInt(localStorage.getItem('sonic_last_score') || '0', 10);

    /* ---------------- DOM ---------------- */
    const $ = (id) => document.getElementById(id);
    const gameWrapper = $('game-wrapper');
    const canvas = $('gameCanvas');
    const ctx = canvas.getContext('2d');
    const VIRTUAL_WIDTH = 480, VIRTUAL_HEIGHT = 270;
    canvas.width = VIRTUAL_WIDTH; canvas.height = VIRTUAL_HEIGHT;

    const titleScreen = $('title-screen'), optionsScreen = $('options-screen'),
        hudOverlay = $('hud-overlay'), stageClearScreen = $('stage-clear-screen'),
        gameOverScreen = $('game-over-screen'), touchControls = $('touch-controls');
    const btnStart = $('btn-start'), btnOptions = $('btn-options'), btnOptionsBack = $('btn-options-back'),
        btnFullscreenToggle = $('btn-fullscreen-toggle'), btnMusicMute = $('btn-music-mute'),
        btnSfxMute = $('btn-sfx-mute'), btnMuteAll = $('btn-mute-all'),
        inputMusicVolume = $('music-volume'), inputSfxVolume = $('sfx-volume');
    const btnClearContinue = $('btn-clear-continue'), btnOverRetry = $('btn-over-retry'), btnOverTitle = $('btn-over-title');
    const lastScoreDisplay = $('last-score-display'), lastScoreVal = $('last-score-val');
    const hudScore = $('hud-score'), hudTime = $('hud-time'), hudRings = $('hud-rings'),
        hudLives = $('hud-lives'), hudRingsBox = $('hud-rings-box');
    const clearTimeBonus = $('clear-time-bonus'), clearRingBonus = $('clear-ring-bonus'),
        clearTotalScore = $('clear-total-score'), clearCountdown = $('clear-countdown'),
        overFinalScore = $('over-final-score');
    const touchLeft = $('touch-left'), touchRight = $('touch-right'),
        touchDown = $('touch-down'), touchJump = $('touch-jump'), dpadZone = $('dpad-zone');

    if (lastScore > 0) { lastScoreVal.textContent = lastScore; lastScoreDisplay.classList.remove('hidden'); }

    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    /* ---------------- Input ---------------- */
    const kb = { left: false, right: false, down: false, jump: false };
    const touch = { left: false, right: false, down: false, jump: false };
    const gp = { left: false, right: false, down: false, jump: false };
    let jumpPressed = false;
    const LEFT = () => kb.left || touch.left || gp.left;
    const RIGHT = () => kb.right || touch.right || gp.right;
    const DOWN = () => kb.down || touch.down || gp.down;
    const JUMP = () => kb.jump || touch.jump || gp.jump;

    window.addEventListener('keydown', (e) => {
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
        if (currentState !== STATES.PLAYING && e.code === 'Space') {
            if (currentState === STATES.TITLE) { audio.init(); startNewGame(); }
            return;
        }
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') kb.left = true;
        else if (e.code === 'ArrowRight' || e.code === 'KeyD') kb.right = true;
        else if (e.code === 'ArrowDown' || e.code === 'KeyS') kb.down = true;
        else if (e.code === 'Space' || e.code === 'KeyK' || e.code === 'KeyZ') {
            if (!kb.jump) jumpPressed = true;
            kb.jump = true;
        }
        audio.init();
    });
    window.addEventListener('keyup', (e) => {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') kb.left = false;
        else if (e.code === 'ArrowRight' || e.code === 'KeyD') kb.right = false;
        else if (e.code === 'ArrowDown' || e.code === 'KeyS') kb.down = false;
        else if (e.code === 'Space' || e.code === 'KeyK' || e.code === 'KeyZ') kb.jump = false;
    });

    /* Touch D-Pad with sliding support (pointer events) */
    let dpadPointerId = null;
    const btnRects = () => ({
        l: touchLeft.getBoundingClientRect(), r: touchRight.getBoundingClientRect(),
        d: touchDown.getBoundingClientRect(), zone: dpadZone.getBoundingClientRect()
    });
    function updateDpad(clientX, clientY) {
        const { l, r, d, zone } = btnRects();
        const px = clientX - zone.left, py = clientY - zone.top;
        const inL = px >= l.left - zone.left && px < l.right - zone.left && py >= l.top - zone.top && py < l.bottom - zone.top;
        const inR = px >= r.left - zone.left && px < r.right - zone.left && py >= r.top - zone.top && py < r.bottom - zone.top;
        const inD = px >= d.left - zone.left && px < d.right - zone.left && py >= d.top - zone.top && py < d.bottom - zone.top;
        touch.left = inL; touch.right = inR; touch.down = inD;
        touchLeft.classList.toggle('active', inL);
        touchRight.classList.toggle('active', inR);
        touchDown.classList.toggle('active', inD);
    }
    function clearDpad() {
        touch.left = touch.right = touch.down = false;
        touchLeft.classList.remove('active');
        touchRight.classList.remove('active');
        touchDown.classList.remove('active');
    }
    dpadZone.addEventListener('pointerdown', (e) => { e.preventDefault(); dpadPointerId = e.pointerId; updateDpad(e.clientX, e.clientY); });
    dpadZone.addEventListener('pointermove', (e) => { if (e.pointerId === dpadPointerId) { e.preventDefault(); updateDpad(e.clientX, e.clientY); } });
    dpadZone.addEventListener('pointerup', (e) => { if (e.pointerId === dpadPointerId) { e.preventDefault(); clearDpad(); dpadPointerId = null; } });
    dpadZone.addEventListener('pointercancel', () => { clearDpad(); dpadPointerId = null; });

    /* Touch Jump button */
    touchJump.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!touch.jump) jumpPressed = true; touch.jump = true; touchJump.classList.add('active'); if (navigator.vibrate) navigator.vibrate(12); });
    touchJump.addEventListener('pointerup', (e) => { e.preventDefault(); touch.jump = false; touchJump.classList.remove('active'); });
    touchJump.addEventListener('pointercancel', () => { touch.jump = false; touchJump.classList.remove('active'); });

    /* Gamepad polling */
    let prevGpJump = false;
    function pollGamepad() {
        const gps = navigator.getGamepads ? navigator.getGamepads() : [];
        let g = null;
        for (let i = 0; i < 4; i++) if (gps[i]) { g = gps[i]; break; }
        if (!g) return;
        const sx = g.axes[0] || 0, sy = g.axes[1] || 0;
        gp.left = (g.buttons[14] && g.buttons[14].pressed) || sx < -0.35;
        gp.right = (g.buttons[15] && g.buttons[15].pressed) || sx > 0.35;
        gp.down = (g.buttons[13] && g.buttons[13].pressed) || sy > 0.35;
        const gpJump = (g.buttons[0] && g.buttons[0].pressed) || (g.buttons[1] && g.buttons[1].pressed) || (g.buttons[2] && g.buttons[2].pressed);
        if (gpJump && !prevGpJump) jumpPressed = true;
        prevGpJump = gpJump;
        audio.init();
    }

    /* ---------------- Level Data: Emerald Hill Zone Act 1 ---------------- */
    const LEVEL_WIDTH = 4900;

    /* Terrain segments (connected ground, slopes allowed) */
    const terrain = [
        { x1: -100, y1: 220, x2: 420, y2: 220 },
        { x1: 420, y1: 220, x2: 560, y2: 232 },
        { x1: 560, y1: 232, x2: 700, y2: 220 },
        { x1: 700, y1: 220, x2: 800, y2: 220 },
        { x1: 800, y1: 220, x2: 830, y2: 252 },
        /* PIT 1 (water) 830..1250 */
        { x1: 1250, y1: 252, x2: 1280, y2: 220 },
        { x1: 1300, y1: 220, x2: 1400, y2: 220 },
        { x1: 1400, y1: 220, x2: 1500, y2: 198 },
        { x1: 1500, y1: 198, x2: 1560, y2: 198 },
        { x1: 1560, y1: 198, x2: 1660, y2: 232 },
        { x1: 1660, y1: 232, x2: 1750, y2: 245 },
        { x1: 1750, y1: 245, x2: 1850, y2: 190 },
        { x1: 1850, y1: 190, x2: 1895, y2: 190 },
        /* LOOP  cx=1950 cy=190 r=55 (spans 1895..2005) */
        { x1: 2005, y1: 190, x2: 2100, y2: 245 },
        { x1: 2100, y1: 245, x2: 2300, y2: 245 },
        { x1: 2300, y1: 245, x2: 2420, y2: 220 },
        { x1: 2420, y1: 220, x2: 2580, y2: 220 },
        { x1: 2580, y1: 220, x2: 2700, y2: 246 },
        { x1: 2700, y1: 246, x2: 2750, y2: 250 },
        /* PIT 2 (water) 2750..3150 */
        { x1: 3150, y1: 250, x2: 3200, y2: 224 },
        { x1: 3200, y1: 224, x2: 3400, y2: 224 },
        { x1: 3400, y1: 224, x2: 3600, y2: 190 },
        { x1: 3600, y1: 190, x2: 3760, y2: 190 },
        { x1: 3760, y1: 190, x2: 3850, y2: 210 },
        { x1: 3850, y1: 210, x2: 4050, y2: 210 },
        { x1: 4050, y1: 210, x2: 4300, y2: 235 },
        { x1: 4300, y1: 235, x2: 4700, y2: 235 },
        { x1: 4700, y1: 235, x2: 4900, y2: 245 }
    ];

    /* 360Â° loop: player runs over top arc */
    const loopDef = { cx: 1950, cy: 190, r: 55 };

    /* One-way platforms (bridges & floating platforms) */
    const platforms = [
        { x: 845, y: 252, w: 390, h: 10 },   // wooden bridge 1
        { x: 2750, y: 250, w: 400, h: 10 },  // wooden bridge 2 (spans pit 2 fully)
        { x: 1440, y: 158, w: 110, h: 10 },
        { x: 1640, y: 130, w: 120, h: 10 },
        { x: 2200, y: 185, w: 120, h: 10 },
        { x: 2900, y: 195, w: 100, h: 10 },
        { x: 3050, y: 158, w: 100, h: 10 },
        { x: 3460, y: 150, w: 110, h: 10 },
        { x: 3900, y: 165, w: 120, h: 10 },
        { x: 4250, y: 180, w: 100, h: 10 }
    ];

    let springs = [], spikes = [];
    const springDefs = [
        { x: 1650, y: 0, power: -11.5 },     // mid-level slope, launch to upper route
        { x: 3180, y: 0, power: -11 },       // after pit 2
        { x: 4560, y: 0, power: -10.5 }      // near goal
    ];
    const spikeDefs = [
        { x: 2140, w: 44 }, { x: 2480, w: 30 }, { x: 3960, w: 36 }, { x: 4360, w: 32 }
    ];

    /* Water pits (visual + kill zone) */
    const waters = [
        { x1: 830, x2: 1250, surface: 262 },
        { x1: 1895, x2: 2005, surface: 245 },
        { x1: 2750, x2: 3150, surface: 262 }
    ];

    /* Palm tree decorations */
    const palmTrees = [
        { x: 150, base: 220 }, { x: 500, base: 228 }, { x: 1330, base: 220 },
        { x: 1890, base: 190 }, { x: 2450, base: 220 }, { x: 3360, base: 224 },
        { x: 4050, base: 210 }
    ];

    /* Collectible rings: [x, y, count, spacing] */
    const ringGroups = [
        [150, 200, 5, 22], [470, 178, 6, 22], [720, 196, 4, 22],
        [900, 218, 4, 22], [1010, 218, 4, 22], [1120, 218, 4, 22],
        [1340, 196, 4, 22], [1455, 140, 4, 22], [1655, 112, 5, 22],
        [1905, 128, 2, 22], [1925, 118, 2, 22], [1950, 114, 3, 22], [1975, 118, 2, 22], [1995, 128, 2, 22],
        [2140, 226, 4, 22], [2310, 225, 4, 22],
        [2830, 215, 4, 22], [2920, 215, 4, 22], [3010, 215, 4, 22],
        [2215, 165, 4, 22], [3065, 140, 4, 22], [3480, 132, 4, 22],
        [3620, 172, 4, 22], [3920, 148, 4, 22], [4100, 190, 5, 22],
        [4440, 215, 5, 22]
    ];

    let rings = [];
    function initRings() {
        rings = [];
        ringGroups.forEach(g => {
            for (let i = 0; i < g[2]; i++) {
                rings.push({ x: g[0] + i * g[3], y: g[1], r: 6, collected: false });
            }
        });
    }

    /* ---------------- Player (SPG physics) ---------------- */
    const PHYS = {
        acc: 0.046875, dec: 0.5, frc: 0.046875,
        rollAcc: 0.046875, rollDec: 0.125, rollFrc: 0.0234375,
        airAcc: 0.09375, gravity: 0.21875,
        jump: 6.5, jumpCut: 4.0, top: 6.0,
        slopeGravity: 0.125, loopMin: 3.0, maxFall: 16
    };

    const player = {
        x: 60, y: 188, w: 24, h: 30,
        spd: 0, vx: 0, vy: 0,
        facing: 1, groundAngle: 0,
        isGrounded: false, isJumping: false,
        isRolling: false, isCrouching: false, isSpindashing: false,
        spindashCharge: 0,
        invuln: 0, runAnim: 0, skidCd: 0,
        reset() {
            this.x = 60; this.y = 188; this.spd = 0; this.vx = 0; this.vy = 0;
            this.facing = 1; this.groundAngle = 0;
            this.isGrounded = false; this.isJumping = false; this.isRolling = false;
            this.isCrouching = false; this.isSpindashing = false; this.spindashCharge = 0;
            this.invuln = 0;
        }
    };

    /* ---------------- Enemies & props ---------------- */
    let enemies = [], coconuts = [], scatteredRings = [], particles = [];
    let gameTime = 0, score = 0, ringsCount = 0, lives = 3;
    let cameraX = 0, stageClearTimer = 0;

    const signpost = { x: 4630, baseY: 235, w: 30, h: 56, cleared: false, spinning: false, angle: 0 };

    /* Checkpoints: respawn points after death */
    const checkpoints = [
        { x: 1330, groundY: 220, active: false, t: 0 },
        { x: 3220, groundY: 224, active: false, t: 0 }
    ];

    function spawnExplosion(x, y, n = 10) {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3.5;
            particles.push({
                x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                life: 18 + Math.random() * 14,
                color: ['#ffcc00', '#ff4444', '#ffffff', '#44ddff'][Math.floor(Math.random() * 4)]
            });
        }
    }

    function initEnemies() {
        const gh = (x) => groundHeightAt(x);
        enemies = [
            { type: 'crawl', x: 600, y: gh(600) - 15, w: 26, h: 15, vx: -0.7, minX: 480, maxX: 690, alive: true, t: 0 },
            { type: 'buzzer', x: 400, y: 118, w: 30, h: 20, vx: -1.1, minX: 290, maxX: 520, alive: true, t: 0 },
            { type: 'coconuts', x: 1360, y: 150, w: 20, h: 26, alive: true, t: 60, facing: 1 },
            { type: 'masher', x: 1020, baseY: 262, w: 24, h: 14, alive: true, state: 'idle', wait: 200, vy: 0, y: 262, t: 0 },
            { type: 'masher', x: 2950, baseY: 262, w: 24, h: 14, alive: true, state: 'idle', wait: 240, vy: 0, y: 262, t: 0 },
            { type: 'crawl', x: 2430, y: gh(2430) - 15, w: 26, h: 15, vx: 0.7, minX: 2320, maxX: 2560, alive: true, t: 0 },
            { type: 'buzzer', x: 3320, y: 120, w: 30, h: 20, vx: -1.1, minX: 3210, maxX: 3440, alive: true, t: 0 },
            { type: 'coconuts', x: 4180, y: 152, w: 20, h: 26, alive: true, t: 120, facing: -1 },
            { type: 'buzzer', x: 4520, y: 140, w: 30, h: 20, vx: -1.1, minX: 4410, maxX: 4700, alive: true, t: 0 }
        ];
        coconuts = [];
    }

    /* Ground height/angle query (returns null if no ground) */
    function groundAt(x, spd, ignoreLoop) {
        const d = Math.abs(x - loopDef.cx);
        if (!ignoreLoop && d <= loopDef.r) {
            const dx = x - loopDef.cx;
            const root = Math.sqrt(loopDef.r * loopDef.r - dx * dx);
            if (root > 0.001) {
                return { y: loopDef.cy - root, angle: Math.atan(dx / root), loop: true, exists: true };
            }
            return { y: loopDef.cy, angle: 0, loop: true, exists: true };
        }
        for (const seg of terrain) {
            if (x >= seg.x1 && x <= seg.x2) {
                const t = (x - seg.x1) / (seg.x2 - seg.x1);
                return {
                    y: seg.y1 + (seg.y2 - seg.y1) * t,
                    angle: Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1),
                    loop: false, exists: true
                };
            }
        }
        return { exists: false };
    }

    function groundHeightAt(x) {
        const g = groundAt(x, 0, true);
        return g.exists ? g.y : 240;
    }

    /* One-way platform top as ground (for running across bridges/ledges) */
    function platformGround(x, bottom) {
        for (const plat of platforms) {
            if (x >= plat.x && x <= plat.x + plat.w &&
                bottom >= plat.y - 2 && bottom <= plat.y + 8) {
                return { y: plat.y, angle: 0, loop: false, exists: true };
            }
        }
        return { exists: false };
    }

    function initLevel() {
        springs = springDefs.map(s => {
            const y = s.y > 0 ? s.y : groundHeightAt(s.x) - 16;
            return { x: s.x, y, w: 22, h: 16, power: s.power, squish: 0 };
        });
        spikes = spikeDefs.map(s => ({ x: s.x, y: groundHeightAt(s.x) - 14, w: s.w, h: 14 }));
        checkpoints.forEach(c => { c.active = false; c.t = 0; });
        initRings();
        initEnemies();
        scatteredRings = [];
        particles = [];
        coconuts = [];
    }

    function triggerRingScatter() {
        if (ringsCount <= 0) return;
        audio.playSFX('hurt');
        const n = Math.min(ringsCount, 16);
        ringsCount = 0;
        hudRings.textContent = '0';
        hudRingsBox.classList.add('flash');
        const cx = player.x + player.w / 2, cy = player.y + player.h / 2;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + (Math.random() * 0.3 - 0.15);
            const s = 4 + Math.random() * 3;
            scatteredRings.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2.5, life: 300, cooldown: 30 });
        }
    }

    function hurtPlayer() {
        if (player.invuln > 0) return;
        if (ringsCount > 0) {
            triggerRingScatter();
            player.vy = -5;
            player.spd = -Math.sign(player.spd || player.facing) * 2;
            player.isGrounded = false;
            player.isRolling = false;
            player.invuln = 90;
        } else {
            handlePlayerDeath();
        }
    }

    function handlePlayerDeath() {
        lives--;
        ringsCount = 0;
        hudLives.textContent = lives;
        hudRings.textContent = '0';
        hudRingsBox.classList.remove('flash');
        audio.playSFX('hurt');
        if (lives > 0) {
            const cp = checkpoints.filter(c => c.active).pop();
            if (cp) {
                player.reset();
                player.x = cp.x;
                player.y = cp.groundY - player.h;
                cameraX = Math.max(0, cp.x - 150);
            } else {
                player.reset();
                cameraX = 0;
            }
        } else {
            lastScore = score;
            localStorage.setItem('sonic_last_score', lastScore.toString());
            overFinalScore.textContent = score;
            switchState(STATES.GAME_OVER);
        }
    }

    /* ---------------- Screen management ---------------- */
    function switchState(s) {
        currentState = s;
        titleScreen.classList.add('hidden');
        optionsScreen.classList.add('hidden');
        hudOverlay.classList.add('hidden');
        stageClearScreen.classList.add('hidden');
        gameOverScreen.classList.add('hidden');
        touchControls.classList.add('hidden');
        if (s === STATES.TITLE) {
            titleScreen.classList.remove('hidden');
            audio.stopBGM();
            if (lastScore > 0) { lastScoreVal.textContent = lastScore; lastScoreDisplay.classList.remove('hidden'); }
        } else if (s === STATES.OPTIONS) {
            optionsScreen.classList.remove('hidden');
        } else if (s === STATES.PLAYING) {
            hudOverlay.classList.remove('hidden');
            if (isTouchDevice) touchControls.classList.remove('hidden');
            audio.startBGM();
        } else if (s === STATES.STAGE_CLEAR) {
            stageClearScreen.classList.remove('hidden');
            audio.stopBGM();
            audio.playSFX('clear');
        } else if (s === STATES.GAME_OVER) {
            gameOverScreen.classList.remove('hidden');
            audio.stopBGM();
        }
    }

    function startNewGame() {
        score = 0; ringsCount = 0; lives = 3; gameTime = 0;
        hudScore.textContent = '0'; hudRings.textContent = '0'; hudLives.textContent = '3'; hudTime.textContent = '0:00';
        hudRingsBox.classList.remove('flash');
        player.reset();
        cameraX = 0;
        signpost.cleared = false; signpost.spinning = false; signpost.angle = 0;
        if (stageClearTimer) { clearInterval(stageClearTimer); stageClearTimer = 0; }
        initLevel();
        switchState(STATES.PLAYING);
    }

    /* ---------------- Physics update ---------------- */
    function updateGame() {
        if (currentState !== STATES.PLAYING) return;
        pollGamepad();
        gameTime += 1 / 60;

        const m = Math.floor(gameTime / 60), s = Math.floor(gameTime % 60);
        hudTime.textContent = m + ':' + (s < 10 ? '0' : '') + s;
        if (player.invuln > 0) { player.invuln--; if (player.invuln === 0) hudRingsBox.classList.remove('flash'); }
        if (player.skidCd > 0) player.skidCd--;

        const p = player;
        const dir = (RIGHT() ? 1 : 0) - (LEFT() ? 1 : 0);

        /* --- GROUND STATE --- */
        if (p.isGrounded) {
            let g = groundAt(p.x + p.w / 2, p.spd);
            if (!g.exists && p.vy >= 0) g = platformGround(p.x + p.w / 2, p.y + p.h);
            if (!g.exists) {
                /* walked off ledge */
                p.isGrounded = false;
                p.vx = p.spd * Math.cos(p.groundAngle);
                p.vy = p.spd * Math.sin(p.groundAngle);
            } else {
                p.groundAngle = g.angle;

                /* slope gravity */
                p.spd += Math.sin(g.angle) * PHYS.slopeGravity;

                /* crouch / spindash */
                if (DOWN() && Math.abs(p.spd) <= 0.5) {
                    p.isCrouching = true;
                    p.isRolling = false;
                } else if (!DOWN()) {
                    p.isCrouching = false;
                }
                if (p.isCrouching && !p.isSpindashing) {
                    if (jumpPressed) {
                        jumpPressed = false;
                        p.isSpindashing = true;
                        p.spindashCharge = 0;
                    }
                } else if (p.isSpindashing) {
                    if (jumpPressed) {
                        jumpPressed = false;
                        p.spindashCharge = Math.min(p.spindashCharge + 0.15, 1.0);
                        audio.playSFX('spindash_charge', p.spindashCharge + 0.2);
                        if (navigator.vibrate) navigator.vibrate(10);
                    }
                    if (!DOWN()) {
                        p.isSpindashing = false;
                        p.isCrouching = false;
                        p.isRolling = true;
                        p.spd = p.facing * (5 + p.spindashCharge * 6);
                        audio.playSFX('spindash_release');
                    }
                }

                /* movement input */
                if (!p.isSpindashing) {
                    if (dir !== 0 && !p.isCrouching) {
                        p.facing = dir;
                        if (dir !== Math.sign(p.spd) && Math.abs(p.spd) > 0.5) {
                            /* skid */
                            p.spd -= Math.sign(p.spd) * (p.isRolling ? PHYS.rollDec : PHYS.dec);
                            if (Math.abs(p.spd) < 0.5) p.spd = 0;
                            else if (p.isGrounded && !p.isRolling && p.skidCd <= 0 && Math.abs(p.spd) > 2) {
                                audio.playSFX('skid');
                                p.skidCd = 20;
                            }
                        } else if (Math.abs(p.spd) >= PHYS.top && dir === Math.sign(p.spd)) {
                            p.spd -= Math.sign(p.spd) * (p.isRolling ? PHYS.rollDec : PHYS.dec);
                        } else {
                            p.spd += dir * (p.isRolling ? PHYS.rollAcc : PHYS.acc);
                        }
                    } else if (dir === 0 && !p.isCrouching) {
                        /* friction */
                        if (Math.abs(p.spd) > 0) {
                            const f = p.isRolling ? PHYS.rollFrc : PHYS.frc;
                            p.spd -= Math.sign(p.spd) * f;
                            if (Math.abs(p.spd) < 0.01) p.spd = 0;
                        }
                    }
                }

                /* roll activation / release */
                if (p.isGrounded && DOWN() && Math.abs(p.spd) > 0.5 && !p.isRolling && !p.isCrouching) {
                    p.isRolling = true;
                }
                if (p.isRolling && Math.abs(p.spd) < 0.3 && !DOWN()) p.isRolling = false;

                /* jump */
                if (jumpPressed) {
                    jumpPressed = false;
                    if (!p.isSpindashing) {
                        p.vy = -PHYS.jump;
                        p.isGrounded = false;
                        p.isJumping = true;
                        if (Math.abs(p.spd) > 1) p.isRolling = true;
                        p.vx = p.spd * Math.cos(p.groundAngle);
                        audio.playSFX('jump');
                    }
                }

                /* integrate along ground */
                p.vx = p.spd * Math.cos(g.angle);
                p.vy = p.spd * Math.sin(g.angle);
                p.x += p.vx;

                let g2 = groundAt(p.x + p.w / 2, p.spd);
                if (!g2.exists) g2 = platformGround(p.x + p.w / 2, p.y + p.h);
                if (g2.exists) {
                    p.y = g2.y - p.h;
                } else {
                    p.isGrounded = false;
                    p.vx = p.spd * Math.cos(p.groundAngle);
                    p.vy = p.spd * Math.sin(p.groundAngle);
                }

                /* loop: fall off when too slow near/over the top */
                if (p.isGrounded && g2 && g2.loop && Math.abs(p.spd) < PHYS.loopMin) {
                    p.isGrounded = false;
                    p.vx = p.spd * Math.cos(p.groundAngle);
                    p.vy = p.spd * Math.sin(p.groundAngle) + 0.5;
                }
            }
        }

        /* --- AIR STATE --- */
        if (!p.isGrounded) {
            /* variable jump height */
            if (p.vy < -PHYS.jumpCut && !JUMP()) p.vy = -PHYS.jumpCut;

            p.vy += PHYS.gravity;
            if (p.vy > PHYS.maxFall) p.vy = PHYS.maxFall;

            /* air control (half ground accel) */
            if (dir !== 0) {
                if (dir * p.vx < PHYS.top) p.vx += dir * PHYS.airAcc;
            } else {
                p.vx *= 0.99;
                if (Math.abs(p.vx) < 0.05) p.vx = 0;
            }
            if (Math.abs(p.vx) > 1 && dir !== 0) p.facing = dir;

            const prevBottom = p.y + p.h;
            p.x += p.vx;
            p.y += p.vy;
            if (p.vy >= 0 && p.vy < 6 && !p.isSpindashing) {
                const g = groundAt(p.x + p.w / 2, p.spd);
                if (g.exists && prevBottom <= g.y + 2 && p.y + p.h >= g.y) {
                    /* land */
                    p.spd = p.vx * Math.cos(g.angle) + p.vy * Math.sin(g.angle);
                    p.groundAngle = g.angle;
                    p.y = g.y - p.h;
                    p.vx = p.spd * Math.cos(g.angle);
                    p.vy = p.spd * Math.sin(g.angle);
                    p.isGrounded = true;
                    p.isJumping = false;
                    if (Math.abs(p.spd) < 0.3) p.isRolling = false;
                }
            }
        }

        /* one-way platforms */
        if (p.vy >= 0) {
            const prevBottom = p.y + p.h - p.vy;
            for (const plat of platforms) {
                if (p.x + p.w > plat.x && p.x < plat.x + plat.w &&
                    prevBottom <= plat.y + 2 && p.y + p.h >= plat.y) {
                    p.y = plat.y - p.h;
                    p.vy = 0;
                    p.spd = p.vx;
                    p.isGrounded = true;
                    p.isJumping = false;
                    if (Math.abs(p.spd) < 0.3) p.isRolling = false;
                    break;
                }
            }
        }

        /* world bounds */
        if (p.x < 0) { p.x = 0; if (p.spd < 0) p.spd = 0; }
        if (p.x > LEVEL_WIDTH - p.w) p.x = LEVEL_WIDTH - p.w;

        /* death: pit fall */
        if (p.y > VIRTUAL_HEIGHT + 80) { handlePlayerDeath(); return; }

        /* springs */
        for (const sp of springs) {
            if (p.x + p.w > sp.x && p.x < sp.x + sp.w &&
                p.y + p.h >= sp.y && p.y + p.h <= sp.y + sp.h + 6) {
                p.vy = sp.power;
                p.isGrounded = false;
                p.isJumping = true;
                p.isRolling = true;
                sp.squish = 1;
                audio.playSFX('spring');
            }
        }
        for (const sp of springs) if (sp.squish > 0) sp.squish -= 0.08;

        /* spikes */
        if (p.invuln === 0) {
            for (const sk of spikes) {
                if (p.x + p.w > sk.x + 3 && p.x < sk.x + sk.w - 3 &&
                    p.y + p.h > sk.y + 3 && p.y < sk.y + sk.h) {
                    hurtPlayer();
                    break;
                }
            }
        }

        /* rings */
        for (const r of rings) {
            if (!r.collected &&
                p.x + p.w > r.x - r.r && p.x < r.x + r.r &&
                p.y + p.h > r.y - r.r && p.y < r.y + r.r) {
                r.collected = true;
                ringsCount++; score += 100;
                hudRings.textContent = ringsCount;
                hudScore.textContent = score;
                audio.playSFX('ring');
            }
        }

        /* scattered rings */
        for (let i = scatteredRings.length - 1; i >= 0; i--) {
            const sr = scatteredRings[i];
            sr.x += sr.vx; sr.y += sr.vy;
            sr.vy += PHYS.gravity * 0.9;
            sr.vx *= 0.985;
            if (sr.cooldown > 0) sr.cooldown--;
            sr.life--;
            const gy = groundAt(sr.x, 0, true);
            if (gy.exists && sr.y + 7 >= gy.y && sr.vy > 0) { sr.y = gy.y - 7; sr.vy = -sr.vy * 0.6; }
            for (const plat of platforms) {
                if (sr.x > plat.x && sr.x < plat.x + plat.w && sr.y + 7 >= plat.y && sr.y - 7 < plat.y + plat.h) {
                    sr.y = plat.y - 7; sr.vy = -sr.vy * 0.6;
                }
            }
            if (sr.cooldown === 0 &&
                p.x + p.w > sr.x - 9 && p.x < sr.x + 9 &&
                p.y + p.h > sr.y - 9 && p.y < sr.y + 9) {
                ringsCount++; score += 100;
                hudRings.textContent = ringsCount;
                hudScore.textContent = score;
                audio.playSFX('ring');
                scatteredRings.splice(i, 1);
                continue;
            }
            if (sr.life <= 0) scatteredRings.splice(i, 1);
        }

        /* --- enemies --- */
        for (const e of enemies) {
            if (!e.alive) continue;
            e.t++;
            if (e.type === 'crawl') {
                e.x += e.vx;
                if (e.x <= e.minX || e.x >= e.maxX) e.vx = -e.vx;
            } else if (e.type === 'buzzer') {
                e.x += e.vx;
                if (e.x <= e.minX || e.x >= e.maxX) e.vx = -e.vx;
            } else if (e.type === 'coconuts') {
                e.facing = p.x + p.w / 2 > e.x ? 1 : -1;
                if (e.t > 60 && Math.abs(p.x - e.x) < 380) {
                    e.t = 0;
                    coconuts.push({
                        x: e.x, y: e.y + 12,
                        vx: Math.max(-4, Math.min(4, (p.x - e.x) / 45)),
                        vy: -3.5, alive: true
                    });
                }
            } else if (e.type === 'masher') {
                if (e.state === 'idle') {
                    if (e.wait <= 0 && Math.abs(p.x - e.x) < 340) {
                        e.state = 'jump'; e.vy = -3.4; e.y = e.baseY - 4;
                    } else if (e.wait > 0) e.wait--;
                } else if (e.state === 'jump') {
                    e.vy += PHYS.gravity;
                    e.y += e.vy;
                    if (e.y >= e.baseY) { e.y = e.baseY; e.state = 'idle'; e.wait = 180 + Math.random() * 100; }
                }
            }

            /* collision with player */
            if (p.x + p.w > e.x && p.x < e.x + e.w &&
                p.y + p.h > e.y && p.y < e.y + e.h) {
                const deadly = p.isRolling || p.vy > 0.5 || (p.isGrounded && Math.abs(p.spd) > 4);
                if (deadly) {
                    e.alive = false;
                    if (e.type === 'coconuts' || e.type === 'buzzer') {
                        /* pop out of the machine for buzzers/monkeys not handled â€” just explode */
                    }
                    score += 500;
                    hudScore.textContent = score;
                    p.vy = -6.5;
                    p.isGrounded = false;
                    p.isJumping = true;
                    spawnExplosion(e.x + e.w / 2, e.y + e.h / 2);
                    audio.playSFX('destroy');
                } else if (p.invuln === 0) {
                    hurtPlayer();
                }
            }
        }

        /* coconut projectiles */
        for (let i = coconuts.length - 1; i >= 0; i--) {
            const c = coconuts[i];
            if (!c.alive) continue;
            c.x += c.vx; c.y += c.vy;
            c.vy += PHYS.gravity * 1.1;
            if (p.invuln === 0 &&
                p.x + p.w > c.x - 6 && p.x < c.x + 6 &&
                p.y + p.h > c.y - 6 && p.y < c.y + 6) {
                c.alive = false;
                hurtPlayer();
            }
            if (c.y > VIRTUAL_HEIGHT + 60 || c.x < cameraX - 100 || c.x > cameraX + VIRTUAL_WIDTH + 100) {
                coconuts.splice(i, 1);
            }
        }

        /* checkpoints */
        for (const cp of checkpoints) {
            cp.t++;
            if (!cp.active && p.x + p.w >= cp.x) {
                cp.active = true;
                spawnExplosion(cp.x - 6, cp.groundY - 50, 14);
                audio.playSFX('ring', 1.6);
            }
        }

        /* signpost */
        if (!signpost.cleared && p.x + p.w >= signpost.x) {
            signpost.cleared = true;
            signpost.spinning = true;
            triggerStageClear();
            return;
        }
        if (signpost.spinning) signpost.angle += 0.35;

        /* particles */
        for (let i = particles.length - 1; i >= 0; i--) {
            const pt = particles[i];
            pt.x += pt.vx; pt.y += pt.vy;
            pt.life--;
            if (pt.life <= 0) particles.splice(i, 1);
        }

        /* camera */
        const targetX = p.x + p.facing * 50 - VIRTUAL_WIDTH / 3;
        cameraX += (targetX - cameraX) * 0.09;
        if (cameraX < 0) cameraX = 0;
        if (cameraX > LEVEL_WIDTH - VIRTUAL_WIDTH) cameraX = LEVEL_WIDTH - VIRTUAL_WIDTH;
    }

    function triggerStageClear() {
        const timeBonus = Math.max(0, 50000 - Math.floor(gameTime) * 500);
        const ringBonus = ringsCount * 100;
        const total = score + timeBonus + ringBonus;
        clearTimeBonus.textContent = timeBonus;
        clearRingBonus.textContent = ringBonus;
        clearTotalScore.textContent = total;
        lastScore = total;
        localStorage.setItem('sonic_last_score', lastScore.toString());
        switchState(STATES.STAGE_CLEAR);
        let count = 5;
        clearCountdown.textContent = count;
        if (stageClearTimer) clearInterval(stageClearTimer);
        stageClearTimer = setInterval(() => {
            count--;
            clearCountdown.textContent = count;
            if (count <= 0) { clearInterval(stageClearTimer); stageClearTimer = 0; switchState(STATES.TITLE); }
        }, 1000);
    }

    /* ---------------- Rendering ---------------- */
    function render() {
        const sky = ctx.createLinearGradient(0, 0, 0, VIRTUAL_HEIGHT);
        sky.addColorStop(0, '#4fc2f8');
        sky.addColorStop(0.65, '#8fe0ff');
        sky.addColorStop(1, '#d2f4ff');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

        if (currentState !== STATES.PLAYING && currentState !== STATES.STAGE_CLEAR) return;

        ctx.save();
        ctx.translate(-Math.floor(cameraX), 0);

        /* ---- parallax: checker hills (far) ---- */
        const far = cameraX * 0.2;
        const chk = 40, chkY = 170;
        for (let gx = Math.floor((far) / chk) * chk; gx < cameraX + VIRTUAL_WIDTH + chk; gx += chk) {
            const h = 70 + (Math.floor(gx / chk) % 3) * 18;
            ctx.fillStyle = ((Math.floor(gx / chk) + Math.floor(chkY / chk)) % 2 === 0) ? '#a8e84f' : '#6fc93c';
            ctx.fillRect(gx - far, chkY - h, chk, h + 30);
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(gx - far + 12, chkY - h + 8, chk - 24, 10);
        }

        /* ---- clouds ---- */
        const cl = cameraX * 0.1;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (let i = 0; i < 7; i++) {
            const cx = ((i * 620 + 100) - cl % 2600 + 2600) % 2600 + cameraX - 300;
            const cy = 40 + (i % 3) * 35;
            ctx.beginPath();
            ctx.arc(cx, cy, 22, 0, Math.PI * 2);
            ctx.arc(cx + 22, cy - 8, 26, 0, Math.PI * 2);
            ctx.arc(cx + 48, cy, 20, 0, Math.PI * 2);
            ctx.fill();
        }

        /* ---- near bushes ---- */
        const mid = cameraX * 0.45;
        ctx.fillStyle = '#3fae4a';
        for (let i = 0; i < 14; i++) {
            const bx = ((i * 400) - mid % 2800 + 2800) % 2800 + cameraX - 100;
            ctx.beginPath();
            ctx.arc(bx, 255, 42, Math.PI, 0);
            ctx.fill();
        }

        /* ---- water pits ---- */
        for (const w of waters) {
            const g = ctx.createLinearGradient(0, w.surface - 4, 0, w.surface + 46);
            g.addColorStop(0, '#37c0e8');
            g.addColorStop(1, '#1264a8');
            ctx.fillStyle = g;
            ctx.fillRect(w.x1, w.surface, w.x2 - w.x1, 46);
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            const wob = Math.floor(Date.now() / 120) % 4;
            for (let wx = w.x1; wx < w.x2; wx += 24) {
                const hh = ((wx + wob * 6) / 24) % 2 === 0 ? 3 : 1;
                ctx.fillRect(wx, w.surface - hh, 18, hh + 1);
            }
            ctx.fillStyle = 'rgba(0,40,80,0.4)';
            ctx.fillRect(w.x1, w.surface + 44, w.x2 - w.x1, 30);
        }

        /* ---- terrain ---- */
        for (const seg of terrain) {
            const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len * 6, ny = dx / len * 6;
            /* dirt body */
            ctx.fillStyle = '#b07028';
            ctx.beginPath();
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
            ctx.lineTo(seg.x2, seg.y2 + 46);
            ctx.lineTo(seg.x1, seg.y1 + 46);
            ctx.closePath();
            ctx.fill();
            /* dark dirt edge */
            ctx.fillStyle = '#8a5218';
            ctx.beginPath();
            ctx.moveTo(seg.x1, seg.y1 + 30);
            ctx.lineTo(seg.x2, seg.y2 + 30);
            ctx.lineTo(seg.x2, seg.y2 + 40);
            ctx.lineTo(seg.x1, seg.y1 + 40);
            ctx.closePath();
            ctx.fill();
            /* grass cap */
            ctx.fillStyle = '#3fd14f';
            ctx.beginPath();
            ctx.moveTo(seg.x1 + nx, seg.y1 + ny);
            ctx.lineTo(seg.x2 + nx, seg.y2 + ny);
            ctx.lineTo(seg.x2, seg.y2);
            ctx.lineTo(seg.x1, seg.y1);
            ctx.closePath();
            ctx.fill();
            /* checker on flats */
            if (seg.y1 === seg.y2) {
                ctx.fillStyle = '#2aa03c';
                for (let gx = Math.floor(seg.x1 / 16) * 16; gx < seg.x2; gx += 16) {
                    if (((gx / 16) + Math.floor(seg.y1 / 8)) % 2 === 0) {
                        ctx.fillRect(gx, seg.y1 + 4, 16, 6);
                    }
                }
            }
        }

        /* ---- loop ---- */
        ctx.beginPath();
        ctx.arc(loopDef.cx, loopDef.cy, loopDef.r, 0, Math.PI * 2);
        ctx.lineWidth = 18;
        ctx.strokeStyle = '#b07028';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(loopDef.cx, loopDef.cy, loopDef.r, 0, Math.PI * 2);
        ctx.lineWidth = 7;
        ctx.strokeStyle = '#3fd14f';
        ctx.stroke();
        /* loop seam */
        ctx.beginPath();
        ctx.arc(loopDef.cx, loopDef.cy, loopDef.r + 12, -0.5, 0.5);
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.stroke();

        /* ---- platforms / bridges ---- */
        for (const plat of platforms) {
            const bridge = plat.w > 200;
            if (bridge) {
                /* wooden bridge */
                ctx.fillStyle = '#a0662a';
                ctx.fillRect(plat.x - 4, plat.y - 3, plat.w + 8, plat.h + 6);
                ctx.fillStyle = '#e0a83c';
                ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
                ctx.fillStyle = '#c8882c';
                for (let i = 0; i < plat.w; i += 12) ctx.fillRect(plat.x + i, plat.y, 1.5, plat.h);
                /* posts */
                ctx.fillStyle = '#7a4a1a';
                ctx.fillRect(plat.x - 5, plat.y - 3, 5, 60);
                ctx.fillRect(plat.x + plat.w, plat.y - 3, 5, 60);
            } else {
                ctx.fillStyle = '#3fd14f';
                ctx.fillRect(plat.x, plat.y, plat.w, 4);
                ctx.fillStyle = '#8a5218';
                ctx.fillRect(plat.x, plat.y + 4, plat.w, plat.h - 4);
            }
        }

        /* ---- palm trees ---- */
        for (const t of palmTrees) {
            const gy = groundHeightAt(t.x);
            const topY = gy - 68;
            ctx.strokeStyle = '#8a5a24';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(t.x, gy);
            ctx.quadraticCurveTo(t.x + 8, (gy + topY) / 2, t.x + 6, topY);
            ctx.stroke();
            ctx.fillStyle = '#2f9c3c';
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2 + 0.35;
                ctx.beginPath();
                ctx.ellipse(t.x + 6 + Math.cos(a) * 26, topY + Math.sin(a) * 13, 24, 9, a, 0, Math.PI * 2);
                ctx.fill();
            }
            /* coconuts */
            ctx.fillStyle = '#6b4a1e';
            ctx.beginPath(); ctx.arc(t.x + 3, topY + 4, 4, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(t.x + 10, topY + 7, 4, 0, Math.PI * 2); ctx.fill();
        }

        /* ---- springs ---- */
        for (const sp of springs) {
            const sq = sp.squish || 0;
            const padTop = sp.y + sq * 4;
            ctx.fillStyle = '#ff3333';
            ctx.fillRect(sp.x, padTop + 5, sp.w, sp.h - 5);
            ctx.fillStyle = '#ffd23c';
            ctx.fillRect(sp.x - 2, padTop - 1, sp.w + 4, 6);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(sp.x, sp.y + sp.h - 2, sp.w, 2);
        }

        /* ---- spikes ---- */
        for (const sk of spikes) {
            ctx.fillStyle = '#e8e8e8';
            const n = Math.floor(sk.w / 9);
            for (let i = 0; i < n; i++) {
                ctx.beginPath();
                ctx.moveTo(sk.x + i * 9, sk.y + sk.h);
                ctx.lineTo(sk.x + i * 9 + 4.5, sk.y);
                ctx.lineTo(sk.x + i * 9 + 9, sk.y + sk.h);
                ctx.closePath();
                ctx.fill();
            }
            ctx.fillStyle = '#9a9a9a';
            ctx.fillRect(sk.x, sk.y + sk.h - 3, sk.w, 3);
        }

        /* ---- rings ---- */
        const ringAnim = Math.floor(Date.now() / 130) % 4;
        ctx.lineWidth = 3;
        for (const r of rings) {
            if (r.collected) continue;
            ctx.strokeStyle = '#ffcc00';
            ctx.beginPath();
            ctx.ellipse(r.x, r.y, Math.max(2, r.r - ringAnim), r.r, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        /* ---- scattered rings ---- */
        for (const sr of scatteredRings) {
            if (Math.floor(sr.life / 6) % 2 === 0) {
                ctx.strokeStyle = '#ffff88';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(sr.x, sr.y, 6, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        /* ---- enemies ---- */
        for (const e of enemies) {
            if (!e.alive) continue;
            if (e.type === 'crawl') {
                /* crab */
                ctx.fillStyle = '#e8443c';
                ctx.beginPath();
                ctx.ellipse(e.x + e.w / 2, e.y + e.h / 2 + 2, e.w / 2, e.h / 2 - 2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(e.vx > 0 ? e.x + e.w - 8 : e.x, e.y + 3, 5, 5);
                ctx.fillStyle = '#a03028';
                ctx.beginPath();
                ctx.arc(e.vx > 0 ? e.x + e.w - 4 : e.x + 4, e.y + 1, 4, 0, Math.PI * 2);
                ctx.arc(e.vx > 0 ? e.x + e.w - 4 : e.x + 4, e.y + 2, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(e.vx > 0 ? e.x + e.w - 4 : e.x + 2, e.y + 6);
                ctx.lineTo(e.vx > 0 ? e.x + e.w + 8 : e.x - 6, e.y + 2);
                ctx.lineTo(e.vx > 0 ? e.x + e.w - 2 : e.x + 4, e.y + 9);
                ctx.closePath();
                ctx.fill();
            } else if (e.type === 'buzzer') {
                /* bee */
                const wing = Math.sin(e.t / 3) * 4;
                ctx.fillStyle = '#ffd23c';
                ctx.beginPath();
                ctx.ellipse(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, e.h / 2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#222222';
                for (let i = 0; i < 3; i++) ctx.fillRect(e.x + 5 + i * 7, e.y + 4, 4, e.h - 8);
                ctx.fillStyle = 'rgba(255,255,255,0.85)';
                ctx.beginPath();
                ctx.ellipse(e.x + 6, e.y - 2 + wing, 6, 3, -0.5, 0, Math.PI * 2);
                ctx.ellipse(e.x + e.w - 6, e.y - 2 + wing, 6, 3, 0.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ff4444';
                ctx.beginPath();
                ctx.arc(e.x + e.w - 3, e.y + e.h / 2 - 1, 3, 0, Math.PI * 2);
                ctx.fill();
            } else if (e.type === 'coconuts') {
                /* monkey */
                const arm = Math.sin(e.t / 6) * 0.6;
                ctx.fillStyle = '#7a4a1e';
                ctx.beginPath();
                ctx.ellipse(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, e.h / 2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#d8a878';
                ctx.beginPath();
                ctx.arc(e.x + e.w / 2, e.y + 4, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#3a2a12';
                ctx.fillRect(e.x + e.w / 2 - 3, e.y + 3, 2, 2);
                ctx.fillRect(e.x + e.w / 2 + 1, e.y + 3, 2, 2);
                ctx.strokeStyle = '#7a4a1e';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(e.x + e.w / 2, e.y + 12);
                ctx.quadraticCurveTo(e.x + e.w / 2 + e.facing * 14, e.y + 12 + arm * 6, e.x + e.w / 2 + e.facing * 16, e.y + 16 + arm * 8);
                ctx.stroke();
            } else if (e.type === 'masher') {
                /* piranha fish */
                const up = e.state === 'jump';
                ctx.fillStyle = '#3aa855';
                ctx.beginPath();
                ctx.ellipse(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, e.h / 2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#2a7a3c';
                ctx.beginPath();
                ctx.moveTo(e.x, e.y + e.h / 2);
                ctx.lineTo(e.x - 9, e.y + 2);
                ctx.lineTo(e.x - 9, e.y + e.h - 2);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(e.x + e.w - 5, e.y + 5, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#222222';
                ctx.beginPath();
                ctx.arc(e.x + e.w - 4, e.y + 5, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        /* ---- coconuts projectiles ---- */
        for (const c of coconuts) {
            if (!c.alive) continue;
            ctx.fillStyle = '#6b4a1e';
            ctx.beginPath();
            ctx.ellipse(c.x, c.y, 5, 6, c.vx * 0.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#3f7a2a';
            ctx.beginPath();
            ctx.ellipse(c.x - 1, c.y - 5, 3, 2.5, -0.4, 0, Math.PI * 2);
            ctx.fill();
        }

        /* ---- checkpoints ---- */
        for (const cp of checkpoints) {
            const bob = Math.sin(cp.t / 25) * 3;
            ctx.fillStyle = '#c8c8c8';
            ctx.fillRect(cp.x - 2, cp.groundY - 46, 4, 46);
            ctx.fillStyle = cp.active ? '#ffcc00' : '#3fae4a';
            ctx.beginPath();
            ctx.arc(cp.x, cp.groundY - 50 + bob, 4, 0, Math.PI * 2);
            ctx.fill();
            if (cp.active && cp.t % 60 < 30) {
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.beginPath();
                ctx.arc(cp.x, cp.groundY - 50 + bob, 9, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        /* ---- signpost ---- */
        ctx.fillStyle = '#b8b8b8';
        ctx.fillRect(signpost.x + 11, signpost.baseY - 46, 8, 46);
        ctx.save();
        ctx.translate(signpost.x + 15, signpost.baseY - 56);
        if (signpost.spinning) ctx.rotate(signpost.angle);
        ctx.fillStyle = signpost.cleared ? '#2f7de0' : '#ffcc00';
        ctx.fillRect(-14, -9, 28, 18);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(signpost.cleared ? 'SONIC' : 'GOAL', 0, 3);
        ctx.restore();

        /* ---- particles ---- */
        for (const pt of particles) {
            ctx.fillStyle = pt.color;
            ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
        }

        /* ---- player ---- */
        if (player.invuln === 0 || Math.floor(player.invuln / 4) % 2 === 0) {
            drawPlayer();
        }

        ctx.restore();
    }

    function drawPlayer() {
        const p = player;
        ctx.save();
        ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
        if (p.facing === -1) ctx.scale(-1, 1);

        if (p.isRolling || p.isSpindashing) {
            /* ball */
            const rot = p.isSpindashing ? 0 : (Date.now() / 35) % (Math.PI * 2);
            ctx.rotate(rot);
            ctx.fillStyle = '#1f5fd0';
            ctx.beginPath();
            ctx.arc(0, 0, 13, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#3f8ff0';
            ctx.beginPath();
            ctx.arc(-3, -3, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffd8a8';
            ctx.beginPath();
            ctx.arc(4, 2, 4, 0, Math.PI * 2);
            ctx.fill();
        } else if (p.isCrouching) {
            ctx.fillStyle = '#1f5fd0';
            ctx.fillRect(-11, 2, 22, 14);
            ctx.beginPath();
            ctx.arc(2, 0, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffd8a8';
            ctx.beginPath();
            ctx.arc(5, 0, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ff2020';
            ctx.fillRect(-8, 13, 16, 5);
        } else {
            const running = Math.abs(p.spd) > 0.8;
            const cyc = running ? Math.floor(Date.now() / 55) % 4 : 0;
            const bob = running ? (cyc % 2 === 0 ? 1 : -1) : 0;
            /* legs & shoes */
            ctx.fillStyle = '#ff2020';
            const s1 = running ? (cyc === 0 ? 3 : cyc === 2 ? -3 : 0) : 0;
            const s2 = running ? (cyc === 1 ? 3 : cyc === 3 ? -3 : 0) : 0;
            ctx.fillRect(-7 + s1, 8 + bob, 8, 5);
            ctx.fillRect(0 + s2, 8 + bob, 8, 5);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-5 + s1, 8 + bob, 4, 2);
            ctx.fillRect(2 + s2, 8 + bob, 4, 2);
            /* body */
            ctx.fillStyle = '#1f5fd0';
            ctx.fillRect(-7, -4 + bob, 14, 13);
            ctx.fillStyle = '#ffd8a8';
            ctx.beginPath();
            ctx.arc(1, 4 + bob, 4, 0, Math.PI * 2);
            ctx.fill();
            /* head */
            ctx.fillStyle = '#1f5fd0';
            ctx.beginPath();
            ctx.arc(1, -9 + bob, 9, 0, Math.PI * 2);
            ctx.fill();
            /* back spikes */
            ctx.beginPath();
            ctx.moveTo(-6, -12 + bob);
            ctx.lineTo(-15, -6 + bob);
            ctx.lineTo(-4, -5 + bob);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(-4, -15 + bob);
            ctx.lineTo(-12, -11 + bob);
            ctx.lineTo(-2, -8 + bob);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(-8, -8 + bob);
            ctx.lineTo(-16, -1 + bob);
            ctx.lineTo(-6, 0 + bob);
            ctx.closePath();
            ctx.fill();
            /* muzzle & nose */
            ctx.fillStyle = '#ffd8a8';
            ctx.beginPath();
            ctx.ellipse(7, -6 + bob, 5, 3.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#222222';
            ctx.beginPath();
            ctx.arc(10, -6.5 + bob, 2, 0, Math.PI * 2);
            ctx.fill();
            /* eye */
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(3, -10 + bob, 3.5, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#111111';
            ctx.beginPath();
            ctx.arc(4.5, -9.5 + bob, 1.8, 0, Math.PI * 2);
            ctx.fill();
            /* arm */
            ctx.strokeStyle = '#1f5fd0';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-3, 0 + bob);
            ctx.lineTo(-8 + (running ? Math.sin(Date.now() / 55) * 3 : 0), 5 + bob);
            ctx.stroke();
        }
        ctx.restore();
    }

    /* ---------------- Main loop ---------------- */
    window.__sonicDebug = () => ({
        player: { x: Math.round(player.x), y: Math.round(player.y), spd: +player.spd.toFixed(2), vx: +player.vx.toFixed(2), vy: +player.vy.toFixed(2), grounded: player.isGrounded, rolling: player.isRolling, spindash: player.isSpindashing, facing: player.facing },
        cam: Math.round(cameraX), state: currentState, score, rings: ringsCount, lives, time: Math.floor(gameTime)
    });
    function loop() {
        updateGame();
        render();
        requestAnimationFrame(loop);
    }

    /* ---------------- UI wiring ---------------- */
    btnStart.addEventListener('click', () => { audio.init(); startNewGame(); });
    btnOptions.addEventListener('click', () => { audio.init(); switchState(STATES.OPTIONS); });
    btnOptionsBack.addEventListener('click', () => { audio.init(); switchState(STATES.TITLE); });

    btnFullscreenToggle.addEventListener('click', () => {
        audio.init();
        if (!document.fullscreenElement) {
            gameWrapper.requestFullscreen().then(() => { btnFullscreenToggle.textContent = 'Windowed'; }).catch(() => {});
        } else {
            document.exitFullscreen();
            btnFullscreenToggle.textContent = 'Fullscreen';
        }
    });
    document.addEventListener('fullscreenchange', () => {
        btnFullscreenToggle.textContent = document.fullscreenElement ? 'Windowed' : 'Fullscreen';
    });

    inputMusicVolume.addEventListener('input', (e) => { audio.musicVolume = e.target.value / 100; });
    inputSfxVolume.addEventListener('input', (e) => { audio.sfxVolume = e.target.value / 100; });

    btnMusicMute.addEventListener('click', () => {
        audio.init();
        audio.musicVolume = audio.musicVolume > 0 ? 0 : inputMusicVolume.value / 100;
        btnMusicMute.textContent = audio.musicVolume > 0 ? 'ðŸ”Š' : 'ðŸ”‡';
    });
    btnSfxMute.addEventListener('click', () => {
        audio.init();
        audio.sfxVolume = audio.sfxVolume > 0 ? 0 : inputSfxVolume.value / 100;
        btnSfxMute.textContent = audio.sfxVolume > 0 ? 'ðŸ”Š' : 'ðŸ”‡';
    });
    btnMuteAll.addEventListener('click', () => {
        audio.init();
        audio.isMuted = !audio.isMuted;
        btnMuteAll.textContent = 'MUTE: ' + (audio.isMuted ? 'ON' : 'OFF');
    });

    btnClearContinue.addEventListener('click', () => {
        audio.init();
        if (stageClearTimer) { clearInterval(stageClearTimer); stageClearTimer = 0; }
        switchState(STATES.TITLE);
    });
    btnOverRetry.addEventListener('click', () => { audio.init(); startNewGame(); });
    btnOverTitle.addEventListener('click', () => { audio.init(); switchState(STATES.TITLE); });

    requestAnimationFrame(loop);
})();
