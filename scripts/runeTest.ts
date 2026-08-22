import { recognize } from '../src/runes/recognizer';

function jitter(v: number, amt: number) { return v + (Math.random() - 0.5) * amt; }

/** 沿著多邊形取樣，加上手抖 */
function draw(verts: [number, number][], noise: number, close = true) {
  const pts: { x: number; y: number }[] = [];
  const loop = close ? [...verts, verts[0]] : verts;
  for (let i = 0; i < loop.length - 1; i++) {
    for (let t = 0; t < 1; t += 0.06) {
      pts.push({
        x: jitter(loop[i][0] + (loop[i + 1][0] - loop[i][0]) * t, noise),
        y: jitter(loop[i][1] + (loop[i + 1][1] - loop[i][1]) * t, noise),
      });
    }
  }
  return pts;
}

let NOISE = 0.035;
const TRI: [number, number][] = [[0.5, 0.2], [0.75, 0.7], [0.25, 0.7]];
const SQR: [number, number][] = [[0.3, 0.25], [0.7, 0.25], [0.7, 0.68], [0.3, 0.68]];
const LINE: [number, number][] = [[0.2, 0.5], [0.8, 0.45]];

function run(name: string, verts: [number, number][], expect: string | null, close = true) {
  let ok = 0, wrong = 0, none = 0;
  const scores: number[] = [];
  for (let i = 0; i < 40; i++) {
    const r = recognize(draw(verts, NOISE, close));
    if (!r) { none++; continue; }
    scores.push(r.score);
    const pass = r.score >= 0.80;              // CAST_THRESHOLD
    if (!pass) { none++; continue; }           // 分數不夠 → FIZZLE，不算誤判
    if (r.spell === expect) ok++; else wrong++;
  }
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3) : '-';
  console.log(
    `${name.padEnd(14)} 命中 ${String(ok).padStart(2)}/40  誤判 ${wrong}  fizzle ${none}  平均分 ${avg}`,
  );
}

for (const n of [0.035, 0.07, 0.11]) {
  console.log(`\n=== 手抖 \u00b1${(n*100).toFixed(1)}% ===`);
  NOISE = n;
  run('\u25b3 \u4e09\u89d2\u5f62', TRI, 'attack');
  run('\u25a1 \u65b9\u5f62', SQR, 'wall');
  run('\u4e00\u689d\u76f4\u7dda', LINE, null, false);
}
