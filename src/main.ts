/**
 * 啟動與串接　[擁有者：E]
 *
 * v5 骨架：只做兩件事 —— 起 60Hz 迴圈、把 WandFrame 畫出來。
 * 這樣 M0 就能驗收（移動滑鼠 → console 有 WandFrame）。
 * 其他模組接進來的位置都標了 TODO。
 */
import { CONFIG } from './core/config';
import { EV, emit } from './core/bus';
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
function loop(now: number) {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  const f = getFrame();
  emit(EV.WAND_FRAME, f);

  // TODO [B]  segmenter.update(f)
  // TODO [C]  match.tick(dt, f)
  // TODO [D]  view.render(matchState, dt)
  void dt;

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

  const x = Math.min(Math.max((f.head * CONFIG.HEAD_TO_X_GAIN + 1) / 2, 0), 1);
  ctx.fillStyle = me;
  ctx.fillRect(x * w - 3, h * 0.72 - 40, 6, 40);

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
      `head     ${f.head.toFixed(3)}  → x ${x.toFixed(3)}`,
      `tip      ${f.tip ? `${f.tip.x.toFixed(3)}, ${f.tip.y.toFixed(3)}` : 'null'}`,
      `conf     tip ${f.tipConfidence.toFixed(2)}  head ${f.headConfidence.toFixed(2)}`,
      `~ HUD   1 mediapipe   2/M mouse`,
    ];
    lines.forEach((l, i) => ctx.fillText(l, 12, 20 + i * 15));
  }
}

// ── 啟動 ────────────────────────────────────────
await setSource('mouse');
console.info('[runespire] v5 skeleton. 移動滑鼠應該看到 WandFrame：');
setInterval(() => console.log(getFrame()), 2000);   // TODO [E]：M0 驗收完就刪掉
requestAnimationFrame(loop);
