/**
 * Z / arc recognizer used by both the calibration gate and the duel.
 *
 * The tracking backend already tunes these two gestures for a single stroke,
 * so the game keeps the same normalized geometry instead of translating them
 * into the old triangle / square templates.
 */
import { CONFIG } from '../core/config';
import type { Spell, Vec2 } from '../core/types';

export interface Recognition {
  spell: Spell;
  score: number;
  templatePoints: Vec2[];
  corners: number;
}
const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));
const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
const scoreNear = (value: number, target: number, tolerance: number): number => clamp(1 - Math.abs(value - target) / tolerance);

function pathLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  return total;
}

function deduplicate(points: readonly Vec2[]): Vec2[] {
  const result: Vec2[] = [];
  for (const point of points) if (!result.length || distance(result[result.length - 1], point) >= 0.0015) result.push({ ...point });
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

function normalizeGesture(points: readonly Vec2[]): Vec2[] {
  const sampled = resample(points, 64);
  if (!sampled.length) return [];
  const xs = sampled.map((point) => point.x);
  const ys = sampled.map((point) => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const centreX = (minX + maxX) / 2, centreY = (minY + maxY) / 2;
  const scale = Math.max(maxX - minX, maxY - minY, 0.0001);
  return sampled.map((point) => ({ x: (point.x - centreX) / scale, y: (point.y - centreY) / scale }));
}

function rotateGesture(points: readonly Vec2[], angle: number): Vec2[] {
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  return points.map((point) => ({ x: point.x * cosine - point.y * sine, y: point.x * sine + point.y * cosine }));
}

function gestureDistance(first: readonly Vec2[], second: readonly Vec2[]): number {
  let total = 0;
  const count = Math.min(first.length, second.length);
  for (let i = 0; i < count; i++) total += distance(first[i], second[i]);
  return total / Math.max(count, 1);
}

const RAW_GESTURES = {
  z: [{ x: 0.22, y: 0.22 }, { x: 0.78, y: 0.22 }, { x: 0.22, y: 0.78 }, { x: 0.78, y: 0.78 }],
  arc: [{ x: 0.04, y: 0.84 }, { x: 0.14, y: 0.57 }, { x: 0.3, y: 0.32 }, { x: 0.5, y: 0.2 }, { x: 0.7, y: 0.32 }, { x: 0.86, y: 0.57 }, { x: 0.96, y: 0.84 }],
} as const;

const NORMALIZED_GESTURES = {
  z: normalizeGesture(RAW_GESTURES.z),
  arc: normalizeGesture(RAW_GESTURES.arc),
};

function templateScores(points: readonly Vec2[]): { z: number; arc: number } {
  const normalized = normalizeGesture(points);
  const reversed = [...normalized].reverse();
  const scores = { z: 0, arc: 0 };
  for (const name of ['z', 'arc'] as const) {
    let bestDistance = Infinity;
    for (const angle of [-0.22, -0.11, 0, 0.11, 0.22]) {
      const variant = rotateGesture(NORMALIZED_GESTURES[name], angle);
      bestDistance = Math.min(bestDistance, gestureDistance(normalized, variant), gestureDistance(reversed, variant));
    }
    scores[name] = clamp(1 - bestDistance / 0.34);
  }
  return scores;
}

function bbox(points: readonly Vec2[]): { x: number; y: number; w: number; h: number } {
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function fitTemplate(shape: 'z' | 'arc', stroke: readonly Vec2[]): Vec2[] {
  const source = RAW_GESTURES[shape];
  const target = bbox(source), frame = bbox(stroke);
  const scale = Math.min(frame.w / Math.max(target.w, 0.0001), frame.h / Math.max(target.h, 0.0001));
  const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
  const tx = target.x + target.w / 2, ty = target.y + target.h / 2;
  return source.map((point) => ({ x: (point.x - tx) * scale + cx, y: (point.y - ty) * scale + cy }));
}

/** Z = attack, arc = cover. Returns null when the gesture is ambiguous. */
export function recognize(input: readonly Vec2[]): Recognition | null {
  const points = deduplicate(input);
  if (points.length < CONFIG.MIN_STROKE_POINTS) return null;
  const length = pathLength(points);
  const frame = bbox(points);
  const diagonal = Math.hypot(frame.w, frame.h);
  if (diagonal < 0.075 || length < 0.09) return null;

  const sampled = resample(points, 96);
  const closedGap = distance(sampled[0], sampled[sampled.length - 1]) / diagonal;
  const aspect = Math.min(frame.w, frame.h) / Math.max(frame.w, frame.h, 0.0001);
  const first = { x: sampled[31].x - sampled[0].x, y: sampled[31].y - sampled[0].y };
  const middle = { x: sampled[63].x - sampled[31].x, y: sampled[63].y - sampled[31].y };
  const last = { x: sampled[95].x - sampled[63].x, y: sampled[95].y - sampled[63].y };
  const horizontalScore = (
    Math.abs(first.x) / Math.max(Math.hypot(first.x, first.y), 0.0001) +
    Math.abs(last.x) / Math.max(Math.hypot(last.x, last.y), 0.0001)
  ) / 2;
  const diagonalScore = Math.min(Math.abs(middle.x), Math.abs(middle.y)) / Math.max(Math.abs(middle.x), Math.abs(middle.y), 0.0001);
  const directionScore = first.x * last.x > 0 && first.x * middle.x < 0 ? 1 : 0;
  const zScore = clamp((closedGap - 0.45) / 0.45) * 0.2 + horizontalScore * 0.28 + diagonalScore * 0.16 + directionScore * 0.25 + aspect * 0.06 + scoreNear(length / diagonal, 2.4, 0.8) * 0.05;

  const scores = templateScores(points);
  scores.z = Math.max(scores.z, zScore);
  const ranked: ('z' | 'arc')[] = ['z', 'arc'];
  ranked.sort((a, b) => scores[b] - scores[a]);
  const shape = ranked[0];
  const confidence = scores[shape];
  const margin = confidence - scores[ranked[1]];
  const minimumConfidence = shape === 'z' ? 0.62 : 0.7;
  if (confidence < minimumConfidence || margin < 0.045) return null;

  return {
    spell: shape === 'z' ? 'attack' : 'wall',
    score: confidence,
    templatePoints: fitTemplate(shape, points),
    corners: shape === 'z' ? 3 : 1,
  };
}
