/**
 * 啟動與串接　[擁有者：P1]
 *
 * 骨架只做三件事：起 60Hz 迴圈、讀輸入、把狀態畫出來。
 * A/D 走位、滑鼠當筆尖、按住 Shift 起手。
 * 其他模組接進來的位置都標了 TODO。
 */
import { CONFIG } from './core/config';
import { EV, emit } from './core/bus';
import { initInput, getMoveAxis, isCasting } from './core/input';
import { getFrame, setSource, currentKind } from './tracking/tracker';
import type { WandFrame } from './core/types';

const app = document.getElementById('app')!;
const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
app.appendChild(canvas);
const ctx = canvas.getContext('2d')!;

function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

// ── Debug HUD（~ 開關）──────────────────────────
let hudOn = true;
let gameFps = 0, frames = 0, fpsAt = 0;

// ── 保命熱鍵：台上炸掉時用 ───────────────────────
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === '~' || e.key === '`') hudOn = !hudOn;
  if (e.code === 'Digit1') void setSource('mediapipe');
  if (e.code === 'Digit2' || e.key.toLowerCase() === 'm') void setSource('mouse');
  // TODO [E]：B 鍵 → 強制把對手換成 bot
});

// ── 主迴圈：60Hz，CV 自己跑 30Hz ─────────────────
let last = performance.now();
let x = 0.5;                       // 我的位置，0..1
function loop(now: number) {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  // 走位：無慣性無加速度。身體怎麼按，角色就怎麼動
  // TODO [P2]：搬進 match/duelist.ts
  x = Math.min(Math.max(x + getMoveAxis() * CONFIG.MOVE_SPEED * dt, 0), 1);

  const f = getFrame();
  emit(EV.WAND_FRAME, f);

  // TODO [P1]  initRunes() 自己監聽 Shift 與 tip，不用在這裡呼叫
  // TODO [P2]  const s = tickMatch(dt);
  // TODO [P3]  renderView(s, f, dt);

  draw(f);

  frames++;
  if (now - fpsAt > 500) { gameFps = (frames * 1000) / (now - fpsAt); frames = 0; fpsAt = now; }
  requestAnimationFrame(loop);
}

function draw(f: WandFrame) {
  const w = innerWidth, h = innerHeight;
  ctx.clearRect(0, 0, w, h);

  // 骨架佔位：一條地平線 + 你的 x 位置 + 筆尖
  // TODO [D]：整個換成 view/ 的第一人稱場景
  const cs = getComputedStyle(document.documentElement);
  const struct = cs.getPropertyValue('--struct').trim() || '#4E6FA8';
  const me = cs.getPropertyValue('--me').trim() || '#F5C542';

  ctx.strokeStyle = struct;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, h * 0.72); ctx.lineTo(w, h * 0.72); ctx.stroke();

  ctx.fillStyle = me;
  ctx.fillRect(x * w - 3, h * 0.72 - 40, 6, 40);
  if (isCasting()) {                      // 起手：腳下光環
    ctx.strokeStyle = me; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x * w, h * 0.72, 34, 9, 0, 0, Math.PI * 2); ctx.stroke();
  }

  if (f.tip) {
    ctx.beginPath();
    ctx.arc(f.tip.x * w, f.tip.y * h, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  if (hudOn) {
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = cs.getPropertyValue('--dim').trim() || '#7B8296';
    const lines = [
      `source   ${currentKind() ?? '-'}`,
      `game fps ${gameFps.toFixed(0)}`,
      `x        ${x.toFixed(3)}   axis ${getMoveAxis()}`,
      `tip      ${f.tip ? `${f.tip.x.toFixed(3)}, ${f.tip.y.toFixed(3)}` : 'null'}`,
      `casting  ${isCasting()}   conf ${f.tipConfidence.toFixed(2)}`,
      `A/D 走位  Shift 起手  ~ HUD  1 webcam  2/M mouse`,
    ];
    lines.forEach((l, i) => ctx.fillText(l, 12, 20 + i * 15));
  }
}

// ── 啟動 ────────────────────────────────────────
initInput();
await setSource('mouse');
console.info('[runespire] 骨架就緒。A/D 走位、滑鼠當筆尖、按住 Shift 起手。');
setInterval(() => console.log(getFrame()), 2000);   // TODO [E]：M0 驗收完就刪掉
requestAnimationFrame(loop);
