/**
 * 啟動與串接　[擁有者：Wesley]
 *
 * 這個檔案只做一件事：把五個模組接起來，然後跑 60Hz 迴圈。
 * 接好之後就不用再動它了 —— 各模組在自己的資料夾裡長大。
 */
import './ui/tokens.css';
import { CONFIG } from './core/config';
import { EV, emit } from './core/bus';
import { initInput, getMoveAxis, isCasting } from './core/input';
import { tickMock } from './core/mockMatch';
import { getFrame, setSource, currentKind } from './tracking/tracker';
import { initRunes, disposeRunes } from './runes';
import { initMatch, tickMatch, createBotOpponent } from './match';
import { initView, renderView } from './view';
import type { MatchState } from './core/types';

// ?mock=1 → 用假狀態，view/ 不用等 match/ 寫完就能開發
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

// ─── 保命熱鍵：台上炸掉時用 ────────────────────────
let hudOn = true;
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === '~' || e.key === '`') hudOn = !hudOn;
  if (e.code === 'Digit1') void setSource('mediapipe');
  if (e.code === 'Digit2' || e.code === 'KeyM') void setSource('mouse');
  // TODO [Wesley]：KeyB → 強制把對手換成 bot
});

// ─── 啟動 ─────────────────────────────────────────
initInput();
await setSource('mouse');
initRunes();
initMatch('solo', createBotOpponent('apprentice'));
initView(canvas);

let mockX = 0.5;
let last = performance.now();
let gameFps = 0, frames = 0, fpsAt = 0;

function loop(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  const f = getFrame();
  emit(EV.WAND_FRAME, f);

  let s: MatchState;
  if (USE_MOCK) {
    mockX = Math.min(Math.max(mockX + getMoveAxis() * CONFIG.MOVE_SPEED * dt, 0), 1);
    s = tickMock(dt, mockX);
  } else {
    s = tickMatch(dt);
  }

  renderView(s, f, dt);
  if (hudOn) drawHud(s);

  frames++;
  if (now - fpsAt > 500) { gameFps = (frames * 1000) / (now - fpsAt); frames = 0; fpsAt = now; }
  requestAnimationFrame(loop);
}

/** 全隊調參的眼睛。view/ 接手渲染之後這裡只留文字 */
function drawHud(s: MatchState): void {
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--dim').trim() || '#7B8296';
  const lines = [
    `source   ${currentKind() ?? '-'}${USE_MOCK ? '   [MOCK]' : ''}`,
    `game fps ${gameFps.toFixed(0)}`,
    `me       x ${s.me.x.toFixed(3)}  hp ${s.me.hp}  mp ${Math.round(s.me.mp)}`,
    `them     x ${s.them.x.toFixed(3)}  hp ${s.them.hp}  ${s.canSeeThemStats ? '' : '(???)'}`,
    `covers ${s.covers.length}  proj ${s.projectiles.length}  casting ${isCasting()}`,
    `A/D 走位  Shift 起手  ~ HUD  1 webcam  2/M mouse`,
  ];
  lines.forEach((l, i) => ctx.fillText(l, 12, 20 + i * 15));
}

addEventListener('beforeunload', () => disposeRunes());
console.info('[runespire] 就緒。A/D 走位、滑鼠當筆尖、按住 Shift 起手。加 ?mock=1 用假對手。');
requestAnimationFrame(loop);
