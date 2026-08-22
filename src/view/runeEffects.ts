/** 符文成功／失敗的 2D 回饋。所有每幀資料都放在固定大小的 typed array。 */
import { EV, on } from '../core/bus';
import { CONFIG } from '../core/config';
import type { CastEvent, FizzleEvent, Vec2 } from '../core/types';

const POINTS = CONFIG.RESAMPLE_N;
const SPARKS = 72;
const SNAP_AFTERGLOW_MS = 220;
const SPARK_LIFE_MS = 520;
const FIZZLE_MS = 450;
const NO_MANA_MS = 520;

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** 依弧長重採樣，避免來源點密度不均讓 morph 中途折線跳動。 */
function resampleInto(points: readonly Vec2[], out: Float32Array): boolean {
  if (points.length < 2) return false;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  if (total <= Number.EPSILON) return false;

  let seg = 1;
  let walked = 0;
  let segLen = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  for (let i = 0; i < POINTS; i++) {
    const wanted = (total * i) / (POINTS - 1);
    while (seg < points.length - 1 && walked + segLen < wanted) {
      walked += segLen;
      seg++;
      segLen = Math.hypot(points[seg].x - points[seg - 1].x, points[seg].y - points[seg - 1].y);
    }
    const t = segLen > 0 ? Math.min(Math.max((wanted - walked) / segLen, 0), 1) : 0;
    out[i * 2] = points[seg - 1].x + (points[seg].x - points[seg - 1].x) * t;
    out[i * 2 + 1] = points[seg - 1].y + (points[seg].y - points[seg - 1].y) * t;
  }
  return true;
}

export class RuneEffects {
  private readonly from = new Float32Array(POINTS * 2);
  private readonly to = new Float32Array(POINTS * 2);
  private readonly sparkX = new Float32Array(SPARKS);
  private readonly sparkY = new Float32Array(SPARKS);
  private readonly sparkVx = new Float32Array(SPARKS);
  private readonly sparkVy = new Float32Array(SPARKS);
  private readonly sparkAge = new Float32Array(SPARKS);
  private readonly fizzle = new Float32Array(POINTS * 2);
  private readonly fizzleDrift = new Float32Array(POINTS);
  private readonly offs: (() => void)[];
  private snapAge = Number.POSITIVE_INFINITY;
  private fizzleAge = Number.POSITIVE_INFINITY;
  private noManaAge = Number.POSITIVE_INFINITY;
  private sparksStarted = false;
  private readonly gold = token('--me');
  private readonly hot = token('--me-hot');
  private readonly magic = token('--magic');
  private readonly ash = token('--ash');
  private readonly dim = token('--dim');

  constructor() {
    this.sparkAge.fill(SPARK_LIFE_MS);
    this.offs = [
      on(EV.CAST, (raw) => this.beginSnap(raw as CastEvent)),
      on(EV.FIZZLE, (raw) => this.beginFizzle(raw as FizzleEvent)),
      on(EV.NO_MANA, () => this.beginNoMana()),
    ];
  }

  private beginSnap(event: CastEvent): void {
    if (!resampleInto(event.points, this.from) || !resampleInto(event.templatePoints, this.to)) return;
    this.snapAge = 0;
    this.fizzleAge = Number.POSITIVE_INFINITY;
    this.noManaAge = Number.POSITIVE_INFINITY;
    this.sparksStarted = false;
    this.sparkAge.fill(SPARK_LIFE_MS);
  }

  private beginFizzle(event: FizzleEvent): void {
    if (!resampleInto(event.points, this.fizzle)) return;
    for (let i = 0; i < POINTS; i++) this.fizzleDrift[i] = (Math.random() - 0.5) * 0.035;
    this.snapAge = Number.POSITIVE_INFINITY;
    this.noManaAge = Number.POSITIVE_INFINITY;
    this.fizzleAge = 0;
  }

  private beginNoMana(): void {
    // EV.CAST 先提供了理想符文；match 緊接著發 NO_MANA 時把金色吸附改成灰色法陣。
    this.snapAge = Number.POSITIVE_INFINITY;
    this.fizzleAge = Number.POSITIVE_INFINITY;
    this.noManaAge = 0;
    this.sparkAge.fill(SPARK_LIFE_MS);
  }

  private startSparks(): void {
    let cx = 0, cy = 0;
    for (let i = 0; i < POINTS; i++) {
      cx += this.to[i * 2];
      cy += this.to[i * 2 + 1];
    }
    cx /= POINTS;
    cy /= POINTS;

    for (let i = 0; i < SPARKS; i++) {
      const p = Math.floor((i / SPARKS) * POINTS);
      const x = this.to[p * 2], y = this.to[p * 2 + 1];
      const dx = x - cx, dy = y - cy;
      const len = Math.max(Math.hypot(dx, dy), 0.01);
      const speed = 0.16 + Math.random() * 0.22;
      this.sparkX[i] = x;
      this.sparkY[i] = y;
      this.sparkVx[i] = (dx / len) * speed + (Math.random() - 0.5) * 0.08;
      this.sparkVy[i] = (dy / len) * speed - Math.random() * 0.1;
      this.sparkAge[i] = 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D, dt: number): void {
    const dtMs = dt * 1000;
    if (this.snapAge < CONFIG.SNAP_MS + SNAP_AFTERGLOW_MS) {
      this.snapAge += dtMs;
      const raw = Math.min(this.snapAge / CONFIG.SNAP_MS, 1);
      const morph = 1 - Math.pow(1 - raw, 3);
      const fade = this.snapAge <= CONFIG.SNAP_MS
        ? 1
        : 1 - (this.snapAge - CONFIG.SNAP_MS) / SNAP_AFTERGLOW_MS;

      ctx.beginPath();
      for (let i = 0; i < POINTS; i++) {
        const x = (this.from[i * 2] + (this.to[i * 2] - this.from[i * 2]) * morph) * innerWidth;
        const y = (this.from[i * 2 + 1] + (this.to[i * 2 + 1] - this.from[i * 2 + 1]) * morph) * innerHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = this.magic;
      ctx.lineWidth = 20;
      ctx.globalAlpha = 0.18 * fade;
      ctx.stroke();
      ctx.strokeStyle = this.gold;
      ctx.lineWidth = 10;
      ctx.globalAlpha = 0.48 * fade;
      ctx.stroke();
      ctx.strokeStyle = this.hot;
      ctx.lineWidth = 3;
      ctx.globalAlpha = fade;
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (raw >= 1 && !this.sparksStarted) {
        this.sparksStarted = true;
        this.startSparks();
      }
    }

    this.drawFizzle(ctx, dtMs);
    this.drawNoMana(ctx, dtMs);
    this.drawSparks(ctx, dt, dtMs);
  }

  private drawFizzle(ctx: CanvasRenderingContext2D, dtMs: number): void {
    if (this.fizzleAge >= FIZZLE_MS) return;
    this.fizzleAge += dtMs;
    const t = Math.min(this.fizzleAge / FIZZLE_MS, 1);
    const fall = t * t * 0.16;
    ctx.strokeStyle = this.ash;
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
    ctx.globalAlpha = 1 - t;

    // 每小段獨立下墜，筆跡會像乾灰一樣裂開，而不是整條一起淡掉。
    for (let i = 1; i < POINTS; i++) {
      const stagger = Math.max(0, t - i / POINTS * 0.18);
      ctx.beginPath();
      ctx.moveTo(
        (this.fizzle[(i - 1) * 2] + this.fizzleDrift[i - 1] * stagger) * innerWidth,
        (this.fizzle[(i - 1) * 2 + 1] + fall * (0.55 + i / POINTS * 0.45)) * innerHeight,
      );
      ctx.lineTo(
        (this.fizzle[i * 2] + this.fizzleDrift[i] * stagger) * innerWidth,
        (this.fizzle[i * 2 + 1] + fall * (0.55 + i / POINTS * 0.45)) * innerHeight,
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawNoMana(ctx: CanvasRenderingContext2D, dtMs: number): void {
    if (this.noManaAge >= NO_MANA_MS) return;
    this.noManaAge += dtMs;
    const t = Math.min(this.noManaAge / NO_MANA_MS, 1);
    let cx = 0, cy = 0, radius = 0;
    for (let i = 0; i < POINTS; i++) {
      cx += this.to[i * 2];
      cy += this.to[i * 2 + 1];
    }
    cx /= POINTS;
    cy /= POINTS;
    for (let i = 0; i < POINTS; i++) {
      radius = Math.max(radius, Math.hypot(this.to[i * 2] - cx, this.to[i * 2 + 1] - cy));
    }

    const fade = 1 - t;
    const px = cx * innerWidth, py = cy * innerHeight;
    const r = radius * Math.min(innerWidth, innerHeight) * (1 + t * 0.1);
    ctx.strokeStyle = this.dim;
    ctx.globalAlpha = fade * (0.55 + Math.sin(t * Math.PI * 6) * 0.2);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, r * 0.78, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < POINTS; i++) {
      const x = this.to[i * 2] * innerWidth, y = this.to[i * 2 + 1] * innerHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = this.ash;
    ctx.lineWidth = 6;
    ctx.globalAlpha = fade * 0.9;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawSparks(ctx: CanvasRenderingContext2D, dt: number, dtMs: number): void {
    for (let i = 0; i < SPARKS; i++) {
      if (this.sparkAge[i] >= SPARK_LIFE_MS) continue;
      this.sparkAge[i] += dtMs;
      this.sparkX[i] += this.sparkVx[i] * dt;
      this.sparkY[i] += this.sparkVy[i] * dt;
      this.sparkVy[i] += 0.32 * dt;
      ctx.globalAlpha = Math.max(0, 1 - this.sparkAge[i] / SPARK_LIFE_MS);
      ctx.fillStyle = i % 3 === 0 ? this.magic : this.gold;
      const size = i % 4 === 0 ? 3 : 2;
      ctx.fillRect(this.sparkX[i] * innerWidth, this.sparkY[i] * innerHeight, size, size);
    }
    ctx.globalAlpha = 1;
  }

  dispose(): void { this.offs.forEach((off) => off()); }
}
