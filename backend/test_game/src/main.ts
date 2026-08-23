/**
 * 啟動與串接　[擁有者：Wesley]
 *
 * 四個畫面：Landing → 大廳 → 對戰 → 結算。
 * 遊戲迴圈永遠在跑，但只有 screen === 'game' 才渲染與模擬。
 */
import './ui/tokens.css';
import { CONFIG } from './core/config';
import { EV, emit, on } from './core/bus';
import { initInput, isCasting } from './core/input';
import { getFrame, setSource, currentKind } from './tracking/tracker';
import { initRunes, disposeRunes } from './runes';
import { initMatch, tickMatch, createBotOpponent, createPracticeOpponent, type MatchOptions } from './match';
import { initView, renderView } from './view';
import { show, currentScreen } from './pages';
import { buildLanding } from './pages/landing';
import { buildSingleplayer, enterSingleplayer } from './pages/singleplayer';
import { buildMultiplayer, enterMultiplayer } from './pages/multiplayer';
import { buildSettings, enterSettings } from './pages/settings';
import { buildLobby, enterLobby } from './pages/lobby';
import { buildResults, enterResults } from './pages/results';
import { buildTracking, enterTracking, type TrackingFlow } from './pages/tracking';
import { buildPractice, enterPractice, setPracticeCountdown } from './pages/practice';
import { connect, createRemoteOpponent, disconnect, sendInput, sendCast, isHost } from './net';
import type { MatchState, Mode, Spell } from './core/types';
import type { BotLevel } from './match/botOpponent';

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
let selectedDifficulty: BotLevel = 'training';
let gamePhase: 'practice' | 'countdown' | 'battle' = 'battle';
let countdownUntil = 0;
let countdownShown = 0;

buildLanding(app, {
  onSingleplayer: enterSingleplayer,
  onMultiplayer: enterMultiplayer,
  onSettings: enterSettings,
});
buildSingleplayer(app, {
  onSelect: (level) => { selectedDifficulty = level; requestTracking('singleplayer'); },
  onBack: () => show('landing'),
});
buildMultiplayer(app, {
  onHost: async (code, playerId) => { await connect(code, playerId); enterLobby(code); },
  onJoin: async (code, playerId) => { await connect(code, playerId); enterLobby(code); },
  onBack: () => show('landing'),
});
buildSettings(app, () => show('landing'));
buildLobby(app, () => requestGameStart(() => startMatch(isHost() ? 'host' : 'guest')), () => requestGameStart(() => startMatch('solo')));
buildResults(app, () => {
  if (mode === 'solo') requestTracking('singleplayer');
  else requestTracking('multiplayer', () => startMatch(mode));
}, () => { disconnect(); show('landing'); });
buildPractice(app, beginCountdown, () => {
  gamePhase = 'practice';
  requestTracking('singleplayer');
});
buildTracking(app, (usePen, flow) => {
  void setSource(usePen ? 'pen' : 'mouse').then(() => {
    if (flow === 'singleplayer') beginFreePractice();
    else {
      const next = pendingAfterTracking;
      pendingAfterTracking = null;
      next?.();
    }
  });
});

function requestGameStart(next: () => void): void {
  requestTracking('multiplayer', next);
}

let pendingAfterTracking: (() => void) | null = null;
function requestTracking(flow: TrackingFlow, next?: () => void): void {
  pendingAfterTracking = next ?? null;
  enterTracking(flow);
}

function soloOptions(): MatchOptions {
  return selectedDifficulty === 'hard' ? { opponentHpMax: 15 } : {};
}

function startMatch(m: Mode): void {
  mode = m;
  casts = 0; hits = 0;
  gamePhase = 'battle';
  initMatch(m, m === 'solo' ? createBotOpponent(selectedDifficulty) : createRemoteOpponent(), m === 'solo' ? soloOptions() : {});
  show('game');
}

function beginFreePractice(): void {
  mode = 'solo';
  gamePhase = 'practice';
  initMatch('solo', createPracticeOpponent(), { ...soloOptions(), practiceMode: true });
  enterPractice(selectedDifficulty);
}

function beginCountdown(): void {
  if (currentScreen() !== 'practice' || gamePhase !== 'practice') return;
  gamePhase = 'countdown';
  countdownUntil = performance.now() + 3000;
  countdownShown = 0;
  // Reset any practice casts so the actual duel always starts clean.
  initMatch('solo', createBotOpponent(selectedDifficulty), soloOptions());
  setPracticeCountdown(3);
}

function updateCountdown(now: number): void {
  const remaining = Math.max(0, countdownUntil - now);
  const value = Math.ceil(remaining / 1000);
  if (value !== countdownShown && value > 0) {
    countdownShown = value;
    setPracticeCountdown(value);
  }
  if (remaining <= 0) {
    gamePhase = 'battle';
    setPracticeCountdown(null);
    show('game');
  }
}

// 對手斷線 → 幻影接管。這行是台上的保命符
on(EV.NET_LOST, () => {
  if (currentScreen() !== 'game') return;
  console.warn('[net] 對手失去連線 — 由幻影接管');
  mode = 'solo';
  selectedDifficulty = 'training';
  initMatch('solo', createBotOpponent('training'));
});

on(EV.MATCH_OVER, (p) => {
  enterResults((p as { winner?: string })?.winner === 'me', casts, hits);
});

// ─── 保命熱鍵 ─────────────────────────────────────
let hudOn = true;
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === '~' || e.key === '`') hudOn = !hudOn;
  if (currentScreen() !== 'game' && e.code === 'Digit1') void setSource('mediapipe');
  if (currentScreen() !== 'game' && (e.code === 'Digit2' || e.code === 'KeyM')) void setSource('mouse');
  if (e.code === 'KeyB' && currentScreen() === 'game') startMatch('solo');   // 強制切 bot
  if (e.code === 'Space' && currentScreen() === 'practice' && gamePhase === 'practice') {
    e.preventDefault();
    beginCountdown();
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
  const c = p as { spell: Spell; score: number; durationMs: number };
  sendCast(c.spell, c.score, c.durationMs);
});

let last = performance.now();
let netAt = 0;
let gameFps = 60, frames = 0, fpsAt = performance.now();

function loop(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  if (currentScreen() === 'game' || currentScreen() === 'practice') {
    const f = getFrame();
    emit(EV.WAND_FRAME, f);

    if (gamePhase === 'countdown') updateCountdown(now);
    const s = tickMatch(gamePhase === 'battle' || gamePhase === 'practice' ? dt : 0);

    // 15Hz 送位置給對手。不節流會塞爆
    if (currentScreen() === 'game' && mode !== 'solo' && now - netAt > 1000 / CONFIG.TICK_HZ) {
      netAt = now;
      sendInput(s.me.x, s.me.casting, s.me.castProgress);
    }

    renderView(s, f, dt);
    if (hudOn && currentScreen() === 'game') drawDebug(s);
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
    `A/D 走位  Shift 手勢  1-5 快捷施法  ~ HUD  B 切 bot`,
  ].forEach((l, i) => ctx.fillText(l, 12, 20 + i * 15));
}

addEventListener('beforeunload', () => { disposeRunes(); disconnect(); });
console.info('[runespire] 就緒。加 ?solo=1 直接開一場 bot 對戰。');
requestAnimationFrame(loop);
