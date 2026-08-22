/**
 * $1 Unistroke Recognizer + 角點分流　[擁有者：Bill]
 *
 * 自己寫，不裝套件。兩個符文：△ attack / □ wall。
 *
 * 判定順序（照 PLAN.md §4.2）：
 *   1. 先數角點 —— 3 角 → △、4 角 → □。這一步比調閾值有效十倍
 *   2. $1 只負責給分數（信心），不負責分類
 *   3. 分數過 CAST_THRESHOLD 才算數，否則 fizzle
 *
 * 所有閾值從 config.ts 讀。這裡的常數是演算法本身的（$1 論文），不是遊戲手感。
 */
import { CONFIG } from '../core/config';
import type { Spell, Vec2 } from '../core/types';

// ── $1 演算法常數（論文值，不是可調參數）──────────────
const SQUARE = 250;
const HALF_DIAGONAL = 0.5 * Math.sqrt(SQUARE * SQUARE + SQUARE * SQUARE);
const ANGLE_RANGE = rad(45);
const ANGLE_PRECISION = rad(2);
const PHI = 0.5 * (-1 + Math.sqrt(5));
/** 起終點距離 < bbox 對角線的這個比例 → 視為封閉圖形（□ 常常畫不準，放寬） */
const CLOSED_RATIO = 0.35;

function rad(d: number): number { return (d * Math.PI) / 180; }

export interface Recognition {
  spell: Spell;
  score: number;           // 0..1
  /** 理想形狀，已對齊玩家軌跡的位置/大小/角度 —— 給吸附特效直接用 */
  templatePoints: Vec2[];
  corners: number;         // debug 用
}

// ── 幾何小工具 ────────────────────────────────────
function centroid(p: readonly Vec2[]): Vec2 {
  let x = 0, y = 0;
  for (const q of p) { x += q.x; y += q.y; }
  return { x: x / p.length, y: y / p.length };
}

function bbox(p: readonly Vec2[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const q of p) {
    if (q.x < minX) minX = q.x;
    if (q.y < minY) minY = q.y;
    if (q.x > maxX) maxX = q.x;
    if (q.y > maxY) maxY = q.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function pathLength(p: readonly Vec2[]): number {
  let d = 0;
  for (let i = 1; i < p.length; i++) d += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return d;
}

function resample(p: readonly Vec2[], n: number): Vec2[] {
  const I = pathLength(p) / (n - 1);
  if (!isFinite(I) || I <= 0) return [];
  const out: Vec2[] = [{ ...p[0] }];
  let D = 0;
  const src = p.map((q) => ({ ...q }));
  for (let i = 1; i < src.length; i++) {
    const d = Math.hypot(src[i].x - src[i - 1].x, src[i].y - src[i - 1].y);
    if (D + d >= I) {
      const t = (I - D) / d;
      const q = {
        x: src[i - 1].x + t * (src[i].x - src[i - 1].x),
        y: src[i - 1].y + t * (src[i].y - src[i - 1].y),
      };
      out.push(q);
      src.splice(i, 0, { ...q });
      D = 0;
    } else D += d;
  }
  while (out.length < n) out.push({ ...src[src.length - 1] });
  return out.slice(0, n);
}

function indicativeAngle(p: readonly Vec2[]): number {
  const c = centroid(p);
  return Math.atan2(c.y - p[0].y, c.x - p[0].x);
}

function rotateBy(p: readonly Vec2[], a: number): Vec2[] {
  const c = centroid(p);
  const cos = Math.cos(a), sin = Math.sin(a);
  return p.map((q) => ({
    x: (q.x - c.x) * cos - (q.y - c.y) * sin + c.x,
    y: (q.x - c.x) * sin + (q.y - c.y) * cos + c.y,
  }));
}

function scaleToSquare(p: readonly Vec2[]): Vec2[] {
  const b = bbox(p);
  return p.map((q) => ({
    x: b.w > 0 ? (q.x * SQUARE) / b.w : q.x,
    y: b.h > 0 ? (q.y * SQUARE) / b.h : q.y,
  }));
}

function translateToOrigin(p: readonly Vec2[]): Vec2[] {
  const c = centroid(p);
  return p.map((q) => ({ x: q.x - c.x, y: q.y - c.y }));
}

function pathDistance(a: readonly Vec2[], b: readonly Vec2[]): number {
  let d = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) d += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
  return d / n;
}

function distanceAtAngle(p: readonly Vec2[], tpl: readonly Vec2[], a: number): number {
  return pathDistance(rotateBy(p, a), tpl);
}

/** 黃金分割搜尋 ±45°，論文的做法 */
function distanceAtBestAngle(p: readonly Vec2[], tpl: readonly Vec2[]): number {
  let a = -ANGLE_RANGE, b = ANGLE_RANGE;
  let x1 = PHI * a + (1 - PHI) * b, f1 = distanceAtAngle(p, tpl, x1);
  let x2 = (1 - PHI) * a + PHI * b, f2 = distanceAtAngle(p, tpl, x2);
  while (Math.abs(b - a) > ANGLE_PRECISION) {
    if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = PHI * a + (1 - PHI) * b; f1 = distanceAtAngle(p, tpl, x1); }
    else { a = x1; x1 = x2; f1 = f2; x2 = (1 - PHI) * a + PHI * b; f2 = distanceAtAngle(p, tpl, x2); }
  }
  return Math.min(f1, f2);
}

function normalize(p: readonly Vec2[]): Vec2[] {
  const r = resample(p, CONFIG.RESAMPLE_N);
  if (r.length < 2) return [];
  return translateToOrigin(scaleToSquare(rotateBy(r, -indicativeAngle(r))));
}

// ── 內建 template ─────────────────────────────────
// ⚠️ 這些是「滑鼠開發期」用的理想形狀。18:00 要用 webcam 重錄，
//    懸空畫的抖動特性完全不同（PLAN.md §4.2）。屆時換掉 RAW_SHAPES 即可。

/** 單位形狀的頂點（順時針，y 向下）。閉合由 makeVariants 補上 */
const RAW_SHAPES: Record<Spell, Vec2[]> = {
  attack: [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
  wall:   [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
};

/** 沿多邊形邊界取樣成一條封閉筆畫 */
function polyToStroke(verts: readonly Vec2[], reverse: boolean, startAt: number): Vec2[] {
  const v = reverse ? [...verts].reverse() : [...verts];
  const s = startAt % v.length;
  const ordered = [...v.slice(s), ...v.slice(0, s)];
  const loop = [...ordered, ordered[0]];          // 回到起點
  const out: Vec2[] = [];
  const perEdge = 16;
  for (let i = 1; i < loop.length; i++) {
    for (let k = 0; k < perEdge; k++) {
      const t = k / perEdge;
      out.push({
        x: loop[i - 1].x + t * (loop[i].x - loop[i - 1].x),
        y: loop[i - 1].y + t * (loop[i].y - loop[i - 1].y),
      });
    }
  }
  out.push({ ...loop[loop.length - 1] });
  return out;
}

interface Template { spell: Spell; raw: Vec2[]; norm: Vec2[]; }

/**
 * 每個符文生多個變體：不同起點 × 順逆時針。
 * $1 對筆順敏感 —— 有人從左下開始畫三角形，有人從頂點開始。
 * 多幾個 template 幾乎零成本，辨識率差很多。
 */
const TEMPLATES: Template[] = (Object.keys(RAW_SHAPES) as Spell[]).flatMap((spell) => {
  const verts = RAW_SHAPES[spell];
  const out: Template[] = [];
  for (let s = 0; s < verts.length; s++) {
    for (const rev of [false, true]) {
      const raw = polyToStroke(verts, rev, s);
      const norm = normalize(raw);
      if (norm.length) out.push({ spell, raw, norm });
    }
  }
  return out;
});

// ── 角點判定 ──────────────────────────────────────
function angleBetween(a: Vec2, b: Vec2): number {
  const dot = a.x * b.x + a.y * b.y;
  const det = a.x * b.y - a.y * b.x;
  return Math.abs(Math.atan2(det, dot));
}

/**
 * 數轉角。
 *
 * 兩個坑：
 *   1. 封閉圖形要繞一圈數 —— 不繞的話三角形只會數到 2 個角，跟正方形的 3 個撞在一起
 *   2. 繞一圈時起點那個角會在頭尾各被偵測一次 —— 所以要用「環狀分群」而不是 cooldown
 */
function countCorners(p: readonly Vec2[], closed: boolean): number {
  const n = p.length;
  const k = Math.max(2, Math.round(n / 16));
  const thresh = rad(CONFIG.CORNER_ANGLE_DEG);
  const at = (i: number) => p[((i % n) + n) % n];

  const lo = closed ? 0 : k;
  const hi = closed ? n : n - k;
  const marks: number[] = [];
  for (let i = lo; i < hi; i++) {
    const a = { x: at(i).x - at(i - k).x, y: at(i).y - at(i - k).y };
    const b = { x: at(i + k).x - at(i).x, y: at(i + k).y - at(i).y };
    if (angleBetween(a, b) > thresh) marks.push(i);
  }
  if (!marks.length) return closed ? 0 : 1;

  // 相鄰 k 格以內算同一個角。closed 時頭尾也要接起來
  let groups = 1;
  for (let i = 1; i < marks.length; i++) if (marks[i] - marks[i - 1] > k) groups++;
  if (closed && groups > 1 && marks[0] + n - marks[marks.length - 1] <= k) groups--;

  return closed ? groups : groups + 1;   // 開放筆畫：起點那個頂點補回來
}

function isClosed(p: readonly Vec2[]): boolean {
  const b = bbox(p);
  const diag = Math.hypot(b.w, b.h);
  if (diag <= 0) return false;
  const gap = Math.hypot(p[p.length - 1].x - p[0].x, p[p.length - 1].y - p[0].y);
  return gap < diag * CLOSED_RATIO;
}

// ── 吸附用：把理想形狀套回玩家畫的位置與大小 ──────────
/**
 * ⚠️ 故意不旋轉。玩家畫歪的三角形要吸附成**正的**三角形 ——
 * 「系統認得我，而且把我畫得更好看」才是這個特效值錢的地方。
 */
function fitToStroke(ideal: readonly Vec2[], stroke: readonly Vec2[]): Vec2[] {
  const sb = bbox(stroke), tb = bbox(ideal);
  const scale = Math.min(tb.w > 0 ? sb.w / tb.w : 1, tb.h > 0 ? sb.h / tb.h : 1);
  const cx = sb.x + sb.w / 2, cy = sb.y + sb.h / 2;
  const tcx = tb.x + tb.w / 2, tcy = tb.y + tb.h / 2;
  return ideal.map((q) => ({ x: (q.x - tcx) * scale + cx, y: (q.y - tcy) * scale + cy }));
}

/** 顯示用的標準形狀：正立、封閉、從第一個頂點開始 */
const IDEAL: Record<Spell, Vec2[]> = {
  attack: polyToStroke(RAW_SHAPES.attack, false, 0),
  wall: polyToStroke(RAW_SHAPES.wall, false, 0),
};

// ── 對外唯一入口 ──────────────────────────────────
/**
 * @returns null 代表這筆根本不能判（點太少 / 長度為零）
 */
export function recognize(points: readonly Vec2[]): Recognition | null {
  if (points.length < CONFIG.MIN_STROKE_POINTS) return null;
  const cand = normalize(points);
  if (!cand.length) return null;

  // 1) $1 只給分數
  const best: Record<Spell, number> = { attack: 0, wall: 0 };
  for (const t of TEMPLATES) {
    const score = 1 - distanceAtBestAngle(cand, t.norm) / HALF_DIAGONAL;
    if (score > best[t.spell]) best[t.spell] = score;
  }

  // 2) 角點分流優先 —— 3 角 → △、4 角 → □
  const corners = countCorners(resample(points, CONFIG.RESAMPLE_N), isClosed(points));
  let spell: Spell;
  if (corners === 3) spell = 'attack';
  else if (corners === 4) spell = 'wall';
  else spell = best.attack >= best.wall ? 'attack' : 'wall';               // 不明確 → 交給分數

  return {
    spell,
    score: Math.max(0, Math.min(1, best[spell])),
    templatePoints: fitToStroke(IDEAL[spell], points),
    corners,
  };
}
