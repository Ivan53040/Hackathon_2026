/**
 * 啟動與串接　[擁有者：Wesley]
 *
 * 四個畫面：Landing → 大廳 → 對戰 → 結算。
 * 遊戲迴圈永遠在跑，但只有 screen === 'game' 才渲染與模擬。
 */
import './ui/tokens.css';
import { CONFIG } from './core/config';
import { EV, emit, on } from './core/bus';
import { initInput, isCasting, getMoveAxis } from './core/input';
import { getFrame, setSource, currentKind } from './tracking/tracker';
import { initRunes, disposeRunes } from './runes';
import { initMatch, tickMatch, createBotOpponent, disposeMatch } from './match';
import { initView, renderView } from './view';
import { show, currentScreen } from './pages';
import { buildLanding } from './pages/landing';
import { buildLobby, enterLobby } from './pages/lobby';
import { buildResults, enterResults } from './pages/results';
import { buildPause, openPause, closePause, isPaused } from './pages/pause';
import { connect, createRemoteOpponent, disconnect, sendInput, sendCast, sendStart, isHost } from './net';
import type { MatchState, Mode } from './core/types';

// 開發捷徑：?solo=1 直接開一場真的 bot 對戰，跳過首頁。
// （舊的 ?mock=1 是假狀態，玩家的攻擊與建造不會被模擬，已移除）
const AUTO_SOLO = new URLSearchParams(location.search).has('solo');

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
buildLobby(app, () => { if (isHost()) sendStart(); startMatch(isHost() ? 'host' : 'guest'); }, () => startMatch('solo'));

// host 按下開始 → guest 自動進場，不用兩邊各按一次（在台上一定會有人忘記按）
on(EV.NET_PEER_MSG, (p) => {
  if ((p as { type?: string })?.type === 'start' && !isHost() && currentScreen() !== 'game') startMatch('guest');
});
buildResults(app, () => startMatch(mode), () => { disconnect(); show('landing'); });
// 對局中的唯一退出路徑（02-journey-ia.md：返回路徑必須存在）
buildPause(app, { onLeave: () => { disconnect(); disposeMatch(); } });

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
  // ESC 開選單而不是直接退出 —— 誤按一下就被踢出對局，在台上是災難
  if (e.code === 'Escape' && currentScreen() === 'game') {
    isPaused() ? closePause() : openPause(mode === 'solo');
  }
});

// ─── 啟動 ─────────────────────────────────────────
initInput();
await setSource('mouse');
initRunes();
initView(canvas);
if (AUTO_SOLO) startMatch('solo');

// 施法事件轉送到對手
on(EV.CAST, (p) => {
  if (mode === 'solo') return;
  const c = p as { spell: 'attack' | 'wall'; score: number; durationMs: number };
  sendCast(c.spell, c.score, c.durationMs);
});

let last = performance.now();
let netAt = 0;
let gameFps = 60, frames = 0, fpsAt = performance.now();

function loop(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  if (currentScreen() === 'game') {
    const f = getFrame();
    emit(EV.WAND_FRAME, f);

    // solo 時選單真的把世界停住；連線對戰停不了對手，所以照跑（選單上有寫）
    const s = tickMatch(isPaused() && mode === 'solo' ? 0 : dt);

    // 15Hz 送走位意圖給對手。不節流會塞爆
    if (mode !== 'solo' && now - netAt > 1000 / CONFIG.TICK_HZ) {
      netAt = now;
      // 🔴 送本地意圖，不要送 s.me.x —— 那是 host 算給我的位置，送回去會變成死循環
      sendInput(getMoveAxis(), isCasting());
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
    `${currentKind() ?? '-'}  ${mode}  fps ${gameFps.toFixed(0)}`,
    `me   x ${s.me.x.toFixed(3)}  hp ${s.me.hp}  mp ${Math.round(s.me.mp)}`,
    `them x ${s.them.x.toFixed(3)}  hp ${s.them.hp}  ${s.canSeeThemStats ? '' : '(???)'}`,
    `covers ${s.covers.length}  proj ${s.projectiles.length}  casting ${isCasting()}  casts ${casts}`,
    `A/D 走位  Shift 起手  ~ HUD  1 webcam  2/M mouse  B 切 bot`,
  ].forEach((l, i) => ctx.fillText(l, 12, 20 + i * 15));
}

addEventListener('beforeunload', () => { disposeRunes(); disconnect(); });
console.info('[runespire] 就緒。加 ?solo=1 直接開一場 bot 對戰。');
requestAnimationFrame(loop);
