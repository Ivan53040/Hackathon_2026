/**
 * CORNER_ANGLE_DEG 參數掃描
 * △ 與 □ 都是封閉多邊形，靠角點數分流。手抖會製造假角點 →
 * 三角形被數成 4 個角 → 誤判成 □。這支腳本找出最耐抖的門檻值。
 */
import { CONFIG } from '../src/core/config';
import { recognize } from '../src/runes/recognizer';

const cfg = CONFIG as unknown as Record<string, number>;
const rnd = (a: number) => (Math.random() - 0.5) * a;

function draw(verts: [number, number][], noise: number, close = true) {
  const loop = close ? [...verts, verts[0]] : verts;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < loop.length - 1; i++)
    for (let t = 0; t < 1; t += 0.06)
      pts.push({
        x: loop[i][0] + (loop[i + 1][0] - loop[i][0]) * t + rnd(noise),
        y: loop[i][1] + (loop[i + 1][1] - loop[i][1]) * t + rnd(noise),
      });
  return pts;
}

const TRI: [number, number][] = [[0.5, 0.2], [0.75, 0.7], [0.25, 0.7]];
const SQR: [number, number][] = [[0.3, 0.25], [0.7, 0.25], [0.7, 0.68], [0.3, 0.68]];
const LINE: [number, number][] = [[0.2, 0.5], [0.8, 0.45]];
const DASH: [number, number][] = [[0.22, 0.48], [0.78, 0.48]];

function rate(verts: [number, number][], want: string | null, noise: number, close = true) {
  let ok = 0;
  for (let i = 0; i < 120; i++) {
    const r = recognize(draw(verts, noise, close));
    const fired = r !== null && r.score >= CONFIG.CAST_THRESHOLD;
    if (want === null) { if (!fired) ok++; }
    else if (fired && r!.spell === want) ok++;
  }
  return Math.round((ok / 120) * 100);
}

console.log('CORNER_ANGLE_DEG 掃描（每格 120 次，單位 %）\n');
console.log('  deg | △@7%  □@7%  △@11% □@11% | 直線不誤觸發@11%');
console.log('  ----+---------------------------+-----------------');
for (const deg of [40, 45, 50, 55, 60, 65, 70, 75, 80]) {
  cfg.CORNER_ANGLE_DEG = deg;
  const a7 = rate(TRI, 'attack', 0.07), s7 = rate(SQR, 'wall', 0.07);
  const a11 = rate(TRI, 'attack', 0.11), s11 = rate(SQR, 'wall', 0.11);
  const noise = rate(LINE, null, 0.11, false);
  const mark = Math.min(a11, s11) >= 85 ? '  ★' : '';
  console.log(`  ${String(deg).padStart(3)} | ${String(a7).padStart(4)}  ${String(s7).padStart(4)}  ${String(a11).padStart(4)}  ${String(s11).padStart(4)}  |  ${String(noise).padStart(3)}${mark}`);
}

console.log('\n── 備案：□ 改成一條水平線 — ──');
cfg.CORNER_ANGLE_DEG = 55;
for (const n of [0.07, 0.11, 0.15]) {
  console.log(`  手抖 ±${(n * 100).toFixed(0)}%   △ ${String(rate(TRI, 'attack', n)).padStart(3)}%   —(當 wall) ${rate(DASH, 'wall', n, false)}%`);
}
