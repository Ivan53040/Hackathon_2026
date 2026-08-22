/**
 * 第一人稱畫面　[擁有者：Wesley]
 *
 * 畫面上沒有你自己，只有對手。
 * 對手承擔全部角色表演，相機承擔全部「我」的感受。
 * 規格：frontend/PLAN.md §4.4 與 §5（動畫）
 *
 * 分層：WebGL canvas 在下（3D），main.ts 傳進來的 2D canvas 在上（拖尾與 HUD）。
 */
import * as THREE from 'three';
import { EV, on } from '../core/bus';
import { CONFIG } from '../core/config';
import { getStroke } from '../runes';
import { FpsCamera } from './camera';
import { buildArena, GAP } from './arena';
import { Actors } from './actors';
import { drawNameplate } from './nameplate';
import { drawHud } from '../ui/hud';
import { LANE_WIDTH } from './camera';
import type { MatchState, WandFrame } from '../core/types';

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let fps: FpsCamera;
let actors: Actors;
let overlay: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let offs: (() => void)[] = [];
const namePos = new THREE.Vector3();

export function initView(overlayCanvas: HTMLCanvasElement): void {
  overlay = overlayCanvas;
  ctx = overlay.getContext('2d')!;

  const gl = document.createElement('canvas');
  gl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  overlay.parentElement!.insertBefore(gl, overlay);   // 3D 在 2D 底下

  renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight, false);

  scene = new THREE.Scene();
  fps = new FpsCamera(innerWidth / innerHeight);
  buildArena(scene);
  actors = new Actors(scene);

  addEventListener('resize', onResize);
  offs.push(on(EV.SPELL_HIT, () => fps.shake(1)));
  offs.push(on(EV.NEAR_MISS, () => fps.shake(0.35)));   // 打空也要有回饋，否則玩家不知道自己閃掉了
  offs.push(on(EV.COVER_HIT, () => fps.shake(0.5)));
}

function onResize(): void {
  renderer?.setSize(innerWidth, innerHeight, false);
  fps.resize(innerWidth / innerHeight);
}

export function renderView(s: MatchState, f: WandFrame, dt: number): void {
  if (!renderer) return;
  fps.update(s.me.x, dt);
  actors.update(s, dt);
  renderer.render(scene, fps.cam);

  ctx.clearRect(0, 0, innerWidth, innerHeight);

  // 頭頂血魔量：投影對手的世界座標到螢幕
  namePos.set((s.them.x - 0.5) * LANE_WIDTH, 2.35, -GAP + 1);
  drawNameplate(ctx, fps.cam, namePos, s.them.hp, s.them.mp, s.canSeeThemStats);

  drawTrail();
  drawHud(ctx, s);
  void f;
}

/**
 * 筆尖拖尾。三層描邊做發光 —— **不准用 shadowBlur**，
 * 它的成本會在施法那一刻爆掉，正好是 demo 最關鍵的 5 秒。
 */
function drawTrail(): void {
  const pts = getStroke();
  if (pts.length < 2) return;

  const css = getComputedStyle(document.documentElement);
  const gold = css.getPropertyValue('--me').trim() || '#F5C542';
  const hot = css.getPropertyValue('--me-hot').trim() || '#FFF4D6';

  const path = new Path2D();
  path.moveTo(pts[0].x * innerWidth, pts[0].y * innerHeight);
  for (let i = 1; i < pts.length; i++) {
    path.lineTo(pts[i].x * innerWidth, pts[i].y * innerHeight);
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [w, a, c] of [[20, 0.15, gold], [10, 0.35, gold], [3, 1, hot]] as const) {
    ctx.lineWidth = w;
    ctx.globalAlpha = a;
    ctx.strokeStyle = c;
    ctx.stroke(path);
  }
  ctx.globalAlpha = 1;
}

export function disposeView(): void {
  offs.forEach((f) => f());
  offs = [];
  removeEventListener('resize', onResize);
  renderer?.dispose();
  renderer = null;
}
