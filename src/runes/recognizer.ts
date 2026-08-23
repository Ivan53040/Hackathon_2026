/**
 * Single-stroke recognizer for the duel spells.
 *
 * The direction-sensitive V / inverted-V checks are intentional: treating
 * those two shapes as reversible is exactly what makes Rock and Spike swap.
 */
import { CONFIG } from '../core/config';
import type { Spell, Vec2 } from '../core/types';

export interface Recognition {
  spell: Spell;
  score: number;
  templatePoints: Vec2[];
  corners: number;
}

type Shape = 'z' | 'v' | 'invertedV' | 'star' | 'arc';
const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));
const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

function pathLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  return total;
}

function deduplicate(points: readonly Vec2[]): Vec2[] {
  const result: Vec2[] = [];
  for (const point of points) {
    if (!result.length || distance(result[result.length - 1], point) >= 0.0015) result.push({ ...point });
  }
  return result;
}

function resample(points: readonly Vec2[], count: number): Vec2[] {
  const total = pathLength(points);
  if (points.length < 2 || total <= 0) return [...points];
  const interval = total / (count - 1);
  const result: Vec2[] = [{ ...points[0] }];
  let travelled = 0;
  let previous = { ...points[0] };
  let index = 1;
  while (index < points.length && result.length < count - 1) {
    const current = points[index];
    const segment = distance(previous, current);
    if (segment <= 0.000001) { previous = { ...current }; index++; continue; }
    if (travelled + segment >= interval) {
      const amount = (interval - travelled) / segment;
      previous = { x: previous.x + (current.x - previous.x) * amount, y: previous.y + (current.y - previous.y) * amount };
      result.push({ ...previous });
      travelled = 0;
    } else {
      travelled += segment;
      previous = { ...current };
      index++;
    }
  }
  while (result.length < count) result.push({ ...points[points.length - 1] });
  return result;
}

function bbox(points: readonly Vec2[]): { x: number; y: number; w: number; h: number } {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function normalize(points: readonly Vec2[]): Vec2[] {
  const sampled = resample(points, CONFIG.RESAMPLE_N);
  if (!sampled.length) return [];
  const frame = bbox(sampled);
  const scale = Math.max(frame.w, frame.h, 0.0001);
  const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
  return sampled.map((point) => ({ x: (point.x - cx) / scale, y: (point.y - cy) / scale }));
}

function templateDistance(a: readonly Vec2[], b: readonly Vec2[]): number {
  const count = Math.min(a.length, b.length);
  let total = 0;
  for (let i = 0; i < count; i++) total += distance(a[i], b[i]);
  return total / Math.max(count, 1);
}

const RAW: Record<Shape, Vec2[]> = {
  z: [{ x: 0.22, y: 0.22 }, { x: 0.78, y: 0.22 }, { x: 0.22, y: 0.78 }, { x: 0.78, y: 0.78 }],
  v: [{ x: 0.08, y: 0.2 }, { x: 0.5, y: 0.84 }, { x: 0.92, y: 0.2 }],
  invertedV: [{ x: 0.08, y: 0.84 }, { x: 0.5, y: 0.16 }, { x: 0.92, y: 0.84 }],
  star: [
    { x: 0.5, y: 0.06 }, { x: 0.92, y: 0.88 }, { x: 0.06, y: 0.34 },
    { x: 0.94, y: 0.34 }, { x: 0.08, y: 0.88 }, { x: 0.5, y: 0.06 },
  ],
  arc: [{ x: 0.08, y: 0.78 }, { x: 0.22, y: 0.42 }, { x: 0.5, y: 0.16 }, { x: 0.78, y: 0.42 }, { x: 0.92, y: 0.78 }],
};

const NORMALIZED = Object.fromEntries(
  (Object.keys(RAW) as Shape[]).map((shape) => [shape, normalize(RAW[shape])]),
) as Record<Shape, Vec2[]>;

function fitTemplate(shape: Shape, stroke: readonly Vec2[]): Vec2[] {
  const source = RAW[shape];
  const target = bbox(source), frame = bbox(stroke);
  const scale = Math.min(frame.w / Math.max(target.w, 0.0001), frame.h / Math.max(target.h, 0.0001));
  const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
  const tx = target.x + target.w / 2, ty = target.y + target.h / 2;
  return source.map((point) => ({ x: (point.x - tx) * scale + cx, y: (point.y - ty) * scale + cy }));
}

function directionScore(shape: Shape, points: readonly Vec2[]): number {
  const sampled = resample(points, 9);
  if (sampled.length < 9) return 0;
  const firstDy = sampled[4].y - sampled[0].y;
  const secondDy = sampled[8].y - sampled[4].y;
  if (shape === 'v') return firstDy > 0 && secondDy < 0 ? 1 : 0;
  if (shape === 'invertedV') return firstDy < 0 && secondDy > 0 ? 1 : 0;
  return 1;
}

function scoreShape(shape: Shape, points: readonly Vec2[]): number {
  const normalized = normalize(points);
  const reversed = [...normalized].reverse();
  const direct = templateDistance(normalized, NORMALIZED[shape]);
  const best = Math.min(direct, templateDistance(reversed, NORMALIZED[shape]));
  const tolerance = shape === 'z'
    ? CONFIG.GESTURE_DISTANCE_TOLERANCE.z
    : shape === 'v'
      ? CONFIG.GESTURE_DISTANCE_TOLERANCE.v
      : CONFIG.GESTURE_DISTANCE_TOLERANCE.default;
  const geometry = clamp(1 - best / tolerance);
  return geometry * 0.78 + directionScore(shape, points) * 0.22;
}

export function recognize(input: readonly Vec2[]): Recognition | null {
  const points = deduplicate(input);
  if (points.length < CONFIG.MIN_STROKE_POINTS) return null;
  const frame = bbox(points);
  const diagonal = Math.hypot(frame.w, frame.h);
  if (diagonal < 0.06 || pathLength(points) < 0.075) return null;

  const ranked = (Object.keys(RAW) as Shape[]).sort((a, b) => scoreShape(b, points) - scoreShape(a, points));
  const shape = ranked[0];
  const confidence = scoreShape(shape, points);
  const margin = confidence - scoreShape(ranked[1], points);
  const minimum = shape === 'z'
    ? CONFIG.GESTURE_MIN_SCORE.z
    : shape === 'v'
      ? CONFIG.GESTURE_MIN_SCORE.v
      : shape === 'invertedV'
        ? CONFIG.GESTURE_MIN_SCORE.invertedV
        : shape === 'star'
          ? CONFIG.GESTURE_MIN_SCORE.star
      : shape === 'arc'
            ? CONFIG.GESTURE_MIN_SCORE.arc
            : CONFIG.GESTURE_MIN_SCORE.default;
  const minimumMargin = shape === 'z'
    ? CONFIG.GESTURE_MIN_MARGIN.z
    : shape === 'v'
      ? CONFIG.GESTURE_MIN_MARGIN.v
      : CONFIG.GESTURE_MIN_MARGIN.default;
  if (confidence < minimum || margin < minimumMargin) return null;

  const spell: Record<Shape, Spell> = {
    z: 'attack', v: 'rock', invertedV: 'spike', star: 'mushroom', arc: 'wall',
  };
  return {
    spell: spell[shape],
    score: confidence,
    templatePoints: fitTemplate(shape, points),
    corners: shape === 'star' ? 5 : shape === 'z' ? 3 : 2,
  };
}
