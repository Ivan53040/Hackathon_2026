/**
 * 啟動與串接　[擁有者：Wesley]
 *
 * Landing / Lobby → Tracking → Practice → Duel → Results.
 * 遊戲迴圈永遠在跑，但只有練習場與正式對戰會渲染與模擬。
 */
import './ui/tokens.css';
import { CONFIG } from './core/config';
import { EV, emit, on } from './core/bus';
import { initInput, isCasting, getMoveAxis } from './core/input';
import { getFrame, setSource, currentKind } from './tracking/tracker';
import { initRunes, disposeRunes } from './runes';
import { initMatch, tickMatch, createBotOpponent, createPracticeOpponent, disposeMatch } from './match';
import { initView, renderView, disposeView } from './view';
import { show, currentScreen } from './pages';
import { buildLanding } from './pages/landing';
import { buildSingleplayer, enterSingleplayer } from './pages/singleplayer';
import { buildLobby, enterLobby } from './pages/lobby';
import { buildResults, enterResults } from './pages/results';
import type { MatchOver } from './match/events';
import { buildPause, openPause, closePause, isPaused } from './pages/pause';
import { buildTracking, enterTracking } from './pages/tracking';
import { buildPractice, enterPractice, setPracticeCountdown } from './pages/practice';
import { connect, createRemoteOpponent, disconnect, sendInput, sendCast, sendStart, isHost } from './net';
import type { MatchState, Mode, Spell } from './core/types';
import type { BotLevel } from './match/botOpponent';

// 開發捷徑：?solo=1 跳過首頁，直接進入單人校準與練習流程。
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
let pendingStart: (() => void) | null = null;
let selectedDifficulty: BotLevel = 'training';
let viewReady = false;
let practiceCountdownTimer: number | null = null;
let practiceStartTimer: number | null = null;

function ensureView(): void {
  if (viewReady) return;
  initView(canvas);
  viewReady = true;
}

function resetViewForQualityChange(): void {
  if (!viewReady) return;
  disposeView();
  viewReady = false;
}

buildLanding(app, {
  onHost: async (code, playerId) => { await connect(code, playerId); enterLobby(code); },
  onJoin: async (code, playerId) => { await connect(code, playerId); enterLobby(code); },
  onSolo: enterSingleplayer,
  onQualityChanged: resetViewForQualityChange,
});
buildSingleplayer(app, {
  onSelect: (level) => {
    selectedDifficulty = level;
    requestSingleplayerPractice();
  },
  onBack: () => show('landing'),
});
buildLobby(app, () => {
  if (isHost()) sendStart();
  requestMultiplayerStart(() => startMatch(isHost() ? 'host' : 'guest'));
}, () => {
  disconnect();
  enterSingleplayer();
});

// host 按下開始 → guest 自動進場，不用兩邊各按一次（在台上一定會有人忘記按）
on(EV.NET_PEER_MSG, (p) => {
  if ((p as { type?: string })?.type === 'start' && !isHost() && currentScreen() !== 'game') {
    requestMultiplayerStart(() => startMatch('guest'));
  }
});
buildResults(app, () => {
  if (mode === 'solo') requestSingleplayerPractice();
  else requestMultiplayerStart(() => startMatch(mode));
}, () => { disconnect(); show('landing'); });
// 對局中的唯一退出路徑（02-journey-ia.md：返回路徑必須存在）
buildPause(app, { onLeave: () => { disconnect(); disposeMatch(); } });
buildTracking(app, (usePen, flow) => {
  void setSource(usePen ? 'pen' : 'mouse').then(() => {
    if (flow === 'singleplayer') {
      beginFreePractice();
      return;
    }
    const next = pendingStart;
    pendingStart = null;
    next?.();
  });
});
buildPractice(app, startPracticeCountdown, () => {
  stopPracticeCountdown();
  disposeMatch();
  enterTracking('singleplayer');
});

function requestMultiplayerStart(next: () => void): void {
  pendingStart = next;
  ensureView();
  enterTracking('multiplayer');
}

function requestSingleplayerPractice(): void {
  pendingStart = null;
  stopPracticeCountdown();
  ensureView();
  enterTracking('singleplayer');
}

function beginFreePractice(): void {
  mode = 'solo';
  stopPracticeCountdown();
  initMatch('solo', createPracticeOpponent(), { practiceMode: true });
  enterPractice(selectedDifficulty);
}

function startPracticeCountdown(): void {
  if (practiceCountdownTimer !== null) return;
  let value = 3;
  setPracticeCountdown(value);
  practiceCountdownTimer = window.setInterval(() => {
    value -= 1;
    setPracticeCountdown(value);
    if (value > 0) return;
    stopPracticeCountdown(false);
    practiceStartTimer = window.setTimeout(() => {
      practiceStartTimer = null;
      startMatch('solo');
    }, 350);
  }, 1000);
}

function stopPracticeCountdown(clearLabel = true): void {
  if (practiceCountdownTimer !== null) window.clearInterval(practiceCountdownTimer);
  practiceCountdownTimer = null;
  if (practiceStartTimer !== null) window.clearTimeout(practiceStartTimer);
  practiceStartTimer = null;
  if (clearLabel) setPracticeCountdown(null);
}

function startMatch(m: Mode): void {
  stopPracticeCountdown();
  ensureView();
  mode = m;
  casts = 0; hits = 0;
  initMatch(
    m,
    m === 'solo' ? createBotOpponent(selectedDifficulty) : createRemoteOpponent(),
    m === 'solo' && selectedDifficulty === 'hard' ? { opponentHpMax: 15 } : {},
  );
  show('game');
}

// 對手斷線 → 幻影接管。這行是台上的保命符
on(EV.NET_LOST, () => {
  if (currentScreen() !== 'game') return;
  console.warn('[net] 對手失去連線 — 由幻影接管');
  mode = 'solo';
  selectedDifficulty = 'medium';
  initMatch('solo', createBotOpponent(selectedDifficulty));
});

on(EV.MATCH_OVER, (p) => {
  const r = p as MatchOver;
  enterResults({
    winner: r.winner,
    reason: r.reason,
    myHp: r.myHp,
    theirHp: r.theirHp,
    casts, hits,
    soloOpponent: mode === 'solo',
  });
});

// ─── 保命熱鍵 ─────────────────────────────────────
let hudOn = new URLSearchParams(location.search).has('debug');
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === '~' || e.key === '`') hudOn = !hudOn;
  if (e.code === 'KeyM' && currentScreen() !== 'game' && currentScreen() !== 'practice') void setSource('mouse');
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
if (AUTO_SOLO) requestSingleplayerPractice();

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

    // solo 時選單真的把世界停住；連線對戰停不了對手，所以照跑（選單上有寫）
    const inBattle = currentScreen() === 'game';
    const s = tickMatch(inBattle && isPaused() && mode === 'solo' ? 0 : dt);

    // 15Hz 送走位意圖給對手。不節流會塞爆
    if (inBattle && mode !== 'solo' && now - netAt > 1000 / CONFIG.TICK_HZ) {
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
    `covers ${s.covers.length}  proj ${s.projectiles.length}  hazards ${s.hazards.length}  casts ${casts}`,
    `A/D move  Shift draw  1–5 spells  ~ HUD  M mouse  B bot`,
  ].forEach((l, i) => ctx.fillText(l, 12, 20 + i * 15));
}

addEventListener('beforeunload', () => {
  stopPracticeCountdown();
  disposeRunes();
  disconnect();
  if (viewReady) disposeView();
});
console.info('[runespire] Ready. Add ?solo=1 to open the single-player calibration flow.');
requestAnimationFrame(loop);
