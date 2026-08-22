/**
 * 啟動與串接　[擁有者：Wesley]
 *
 * 四個畫面：Landing → 大廳 → 對戰 → 結算。
 * 遊戲迴圈永遠在跑，但只有 screen === 'game' 才渲染與模擬。
 */
import './ui/tokens.css';
import { CONFIG } from './core/config';
import { EV, emit, on } from './core/bus';
import { initInput, getMoveAxis, isCasting } from './core/input';
import { tickMock } from './core/mockMatch';
import { getFrame, setSource, currentKind } from './tracking/tracker';
import { initRunes, disposeRunes } from './runes';
import { initMatch, tickMatch, createBotOpponent } from './match';
import { initView, renderView } from './view';
import { show, currentScreen } from './pages';
import { buildLanding } from './pages/landing';
import { buildLobby, enterLobby } from './pages/lobby';
import { buildResults, enterResults } from './pages/results';
import { connect, createRemoteOpponent, disconnect, sendInput, sendCast, isHost } from './net';
import type { MatchState, Mode } from './core/types';

const USE_MOCK = new URLSearchParams(location.search).has('mock');

const app = document.getElementById('app')!;
const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
app.appendChild(canvas);
const ctx = canvas.getContext('2d')!;

function resize(): void {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

// ─── 遙測：施法次數與成功率，結算頁與講稿都要用 ──
let casts = 0, hits = 0;
on(EV.CAST, () => { casts++; hits++; });
on(EV.FIZZLE, () => { casts++; });

// ─── 頁面 ─────────────────────────────────────────
let mode: Mode = 'solo';

buildLanding(app, {
  onHost: async (code, playerId) => { await connect(code, playerId); enterLobby(code); },
  onJoin: async (code, playerId) => { await connect(code, playerId); enterLobby(code); },
  onSolo: () => startMatch('solo'),
});
buildLobby(app, () => startMatch(isHost() ? 'host' : 'guest'), () => startMatch('solo'));
buildResults(app, () => startMatch(mode), () => { disconnect(); show('landing'); });

function startMatch(m: Mode): void {
  mode = m;
  casts = 0; hits = 0;
  initMatch(m, m === 'solo' ? createBotOpponent('warlock') : createRemoteOpponent());
  show('game');
}

// 對手斷線 → 幻影接管。這行是台上的保命符
on(EV.NET_LOST, () => {
  if (currentScreen() !== 'game') return;
  console.warn('[net] 對手失去連線 — 由幻影接管');
  mode = 'solo';
  initMatch('solo', createBotOpponent('warlock'));
});

on(EV.MATCH_OVER, (p) => {
  enterResults((p as { winner?: string })?.winner === 'me', casts, hits);
});

// ─── 保命熱鍵 ─────────────────────────────────────
let hudOn = true;
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === '~' || e.key === '`') hudOn = !hudOn;
  if (e.code === 'Digit1') void setSource('mediapipe');
  if (e.code === 'Digit2' || e.code === 'KeyM') void setSource('mouse');
  if (e.code === 'KeyB' && currentScreen() === 'game') startMatch('solo');   // 強制切 bot
});

// ─── 啟動 ─────────────────────────────────────────
initInput();
await setSource('mouse');
initRunes();
initView(canvas);
if (USE_MOCK) startMatch('solo');

// 施法事件轉送到對手
on(EV.CAST, (p) => {
  if (mode === 'solo') return;
  const c = p as { spell: 'attack' | 'wall'; score: number; durationMs: number };
  sendCast(c.spell, c.score, c.durationMs);
});

let mockX = 0.5;
let last = performance.now();
let netAt = 0;
let gameFps = 60, frames = 0, fpsAt = performance.now();

function loop(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  if (currentScreen() === 'game') {
    const f = getFrame();
    emit(EV.WAND_FRAME, f);

    let s: MatchState;
    if (USE_MOCK) {
      mockX = Math.min(Math.max(mockX + getMoveAxis() * CONFIG.MOVE_SPEED * dt, 0), 1);
      s = tickMock(dt, mockX);
    } else {
      s = tickMatch(dt);
    }

    // 15Hz 送位置給對手。不節流會塞爆
    if (mode !== 'solo' && now - netAt > 1000 / CONFIG.TICK_HZ) {
      netAt = now;
      sendInput(s.me.x, s.me.casting, s.me.castProgress);
    }

    renderView(s, f, dt);
    if (hudOn) drawDebug(s);
  } else {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
  }

  frames++;
  if (now - fpsAt > 500) { gameFps = (frames * 1000) / (now - fpsAt); frames = 0; fpsAt = now; }
  requestAnimationFrame(loop);
}

/** 全隊調參的眼睛。正式 HUD 在 ui/hud.ts，這裡只有除錯數字 */
function drawDebug(s: MatchState): void {
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--dim').trim() || '#7C88AB';
  [
    `${currentKind() ?? '-'}  ${mode}${USE_MOCK ? '  [MOCK]' : ''}  fps ${gameFps.toFixed(0)}`,
    `me   x ${s.me.x.toFixed(3)}  hp ${s.me.hp}  mp ${Math.round(s.me.mp)}`,
    `them x ${s.them.x.toFixed(3)}  hp ${s.them.hp}  ${s.canSeeThemStats ? '' : '(???)'}`,
    `covers ${s.covers.length}  proj ${s.projectiles.length}  casting ${isCasting()}  casts ${casts}`,
    `A/D 走位  Shift 起手  ~ HUD  1 webcam  2/M mouse  B 切 bot`,
  ].forEach((l, i) => ctx.fillText(l, 12, 20 + i * 15));
}

addEventListener('beforeunload', () => { disposeRunes(); disconnect(); });
console.info('[runespire] 就緒。加 ?mock=1 直接進遊戲用假對手。');
requestAnimationFrame(loop);
