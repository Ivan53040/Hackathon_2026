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
import { buildArena, GAP, type ArenaRefs } from './arena';
import { buildScenery, updateScenery, disposeScenery } from './scenery';
import { buildRomanArena, updateRomanArena, disposeRomanArena } from './romanArena';
import { buildCrowd, updateCrowd, disposeCrowd } from './crowd';
import { Actors } from './actors';
import { drawNameplate } from './nameplate';
import { drawHud } from '../ui/hud';
import { LANE_WIDTH } from './camera';
import { disposeWebcamPip, initWebcamPip, pauseWebcamPip, touchWebcamPip } from './pip';
import { RuneEffects } from './runeEffects';
import type { MatchState, WandFrame } from '../core/types';
import type { CoverHit, NearMiss, SpellHit } from '../match/events';

const HIT_FLASH_S = 0.3;
const TRACER_LAYERS = [[9, 0.14], [4, 0.4], [1.5, 0.85]] as const;
const TRACER_TAIL = 0.28;
const PATH_ALPHA = 0.16;

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let fps: FpsCamera;
let actors: Actors;
let arena: ArenaRefs;
let runeEffects: RuneEffects;
let clock = 0;
let overlay: HTMLCanvasElement;
let glCanvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D;
let offs: (() => void)[] = [];
const namePos = new THREE.Vector3();
const tmp = new THREE.Vector3();
const projNow = new Float32Array(2);
const projTail = new Float32Array(2);
const projTarget = new Float32Array(2);
let hitFlash = 0;
let hitVignette: CanvasGradient;
let meColor = '';
let meHotColor = '';
let themHotColor = '';
const romanScene = new URLSearchParams(location.search).get('scene') !== 'moon';

function tokenRgb(name: string): [number, number, number] {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const color = new THREE.Color(value);
  return [Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255)];
}

function buildHitVignette(): void {
  // 色票沒有獨立 danger token；以既有金／紫通道推導警示紅，仍跟著 token 改色。
  const gold = tokenRgb('--me');
  const magic = tokenRgb('--magic');
  const r = Math.max(gold[0], magic[0]);
  const g = Math.min(gold[1], magic[1]);
  const b = Math.min(gold[2], magic[2]);
  const radius = Math.max(innerWidth, innerHeight);
  hitVignette = ctx.createRadialGradient(
    innerWidth / 2, innerHeight / 2, Math.min(innerWidth, innerHeight) * 0.28,
    innerWidth / 2, innerHeight / 2, radius * 0.7,
  );
  hitVignette.addColorStop(0, `rgb(${r} ${g} ${b} / 0)`);
  hitVignette.addColorStop(1, `rgb(${r} ${g} ${b} / 0.92)`);
}

export function initView(overlayCanvas: HTMLCanvasElement): void {
  overlay = overlayCanvas;
  ctx = overlay.getContext('2d')!;
  const styles = getComputedStyle(document.documentElement);
  meColor = styles.getPropertyValue('--me').trim();
  meHotColor = styles.getPropertyValue('--me-hot').trim();
  themHotColor = styles.getPropertyValue('--them-hot').trim();
  buildHitVignette();

  const gl = document.createElement('canvas');
  glCanvas = gl;
  gl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  overlay.parentElement!.insertBefore(gl, overlay);   // 3D 在 2D 底下
  initWebcamPip(overlay.parentElement!);

  renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = romanScene ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = romanScene ? 1.08 : 1;
  renderer.shadowMap.enabled = romanScene;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  fps = new FpsCamera(innerWidth / innerHeight);
  arena = romanScene ? buildRomanArena(scene) : buildArena(scene);
  if (romanScene) buildCrowd(scene);   // 觀眾席，見 CROWD-BRIEF.md（Codex 的檔）
  if (!romanScene) buildScenery(scene); // 舊月光場景保留：加 ?scene=moon 即可切回
  actors = new Actors(scene);
  runeEffects = new RuneEffects();

  addEventListener('resize', onResize);
  offs.push(on(EV.SPELL_HIT, (raw) => {
    const event = raw as SpellHit;
    if (event.target === 'them') actors.hit();      // 對手挨打 → 換受擊姿勢
    else {
      fps.shake(1);                                // 我挨打 → 相機震動與邊緣警示
      hitFlash = HIT_FLASH_S;
    }
  }));
  offs.push(on(EV.NEAR_MISS, (raw) => {
    // 只有閃掉迎面而來的攻擊才震動；我方火球打空不該像自己被打。
    if ((raw as NearMiss).owner !== 'me') fps.shake(0.35);
  }));
  offs.push(on(EV.COVER_HIT, (raw) => {
    // 對方牆受擊由碎塊回饋；只有我方牆挨打才傳到第一人稱相機。
    if ((raw as CoverHit).side === 'me') fps.shake(0.5);
  }));
}

function onResize(): void {
  renderer?.setSize(innerWidth, innerHeight, false);
  fps.resize(innerWidth / innerHeight);
  buildHitVignette();
}

export function renderView(s: MatchState, f: WandFrame, dt: number): void {
  if (!renderer) return;
  if (s.winner === null) touchWebcamPip();
  else pauseWebcamPip();
  clock += dt;
  fps.update(s.me.x, dt);
  actors.update(s, dt);
  if (romanScene) {
    updateRomanArena(clock);
    updateCrowd(clock, dt);          // 人群只存在於羅馬場景，跟 buildCrowd 的條件一致
  } else {
    // 環境呼吸：星光微閃、月暈脈動。畫面完全靜止會讓人以為當機
    (arena.stars.material as THREE.PointsMaterial).opacity = 0.62 + Math.sin(clock * 0.8) * 0.12;
    arena.stars.rotation.y = clock * 0.004;
    (arena.moon.material as THREE.MeshBasicMaterial).opacity = 0.88 + Math.sin(clock * 0.5) * 0.05;
    updateScenery(clock, dt);
  }
  renderer.render(scene, fps.cam);

  ctx.clearRect(0, 0, innerWidth, innerHeight);
  drawHitFlash(dt);

  // 頭頂血魔量：投影對手的世界座標到螢幕
  namePos.set((s.them.x - 0.5) * LANE_WIDTH, 3.05, -GAP + 1);   // 要高過尖帽
  drawNameplate(ctx, fps.cam, namePos, s.them.hp, s.them.mp, s.canSeeThemStats);

  drawTracers(s);
  drawTrail();
  runeEffects.draw(ctx, dt);
  drawHud(ctx, s);
  void f;
}

function drawHitFlash(dt: number): void {
  if (hitFlash <= 0) return;
  hitFlash = Math.max(0, hitFlash - dt);
  ctx.globalAlpha = hitFlash / HIT_FLASH_S;
  ctx.fillStyle = hitVignette;
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.globalAlpha = 1;
}

/**
 * 投射物軌跡。
 *
 * 子彈本來就走直線，但畫面上只有一顆會變大的球時看不出來 ——
 * 補一條沿著實際路徑的尾跡，直線感就出來了，
 * 而且玩家看得到「它會落在哪」，才知道要往哪邊閃。
 */
function drawTracers(s: MatchState): void {
  if (!s.projectiles.length) return;

  ctx.lineCap = 'round';
  for (const p of s.projectiles) {
    const toward = p.owner === 'them';
    if (!projectPoint(p.fromX, p.toX, toward, p.progress, projNow)) continue;
    if (!projectPoint(p.fromX, p.toX, toward, Math.max(0, p.progress - TRACER_TAIL), projTail)) continue;
    if (!projectPoint(p.fromX, p.toX, toward, 1, projTarget)) continue;
    ctx.strokeStyle = p.owner === 'me' ? meColor : themHotColor;

    // 鎖定後的完整剩餘路徑：固定直線，不跟目標之後的移動彎曲。
    // 淡軌道先告訴玩家落點，再用亮光矢表示現在的彈體位置。
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = PATH_ALPHA;
    ctx.beginPath();
    ctx.moveTo(projNow[0], projNow[1]);
    ctx.lineTo(projTarget[0], projTarget[1]);
    ctx.stroke();

    for (const [w, a] of TRACER_LAYERS) {
      ctx.lineWidth = w;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.moveTo(projTail[0], projTail[1]);
      ctx.lineTo(projNow[0], projNow[1]);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** 把投射物在 t 時刻的世界座標投影到螢幕。跟 actors.ts 用同一條路徑公式 */
function projectPoint(fromX: number, toX: number, toward: boolean, t: number, out: Float32Array): boolean {
  const k = Math.min(Math.max(t, 0), 1);
  tmp.set(
    THREE.MathUtils.lerp((fromX - 0.5) * LANE_WIDTH, (toX - 0.5) * LANE_WIDTH, k),
    1.35,
    toward ? -GAP + k * (GAP - 0.6) : -k * (GAP - 0.6),
  );
  const v = tmp.project(fps.cam);
  if (v.z > 1) return false;
  out[0] = (v.x * 0.5 + 0.5) * innerWidth;
  out[1] = (-v.y * 0.5 + 0.5) * innerHeight;
  return true;
}

/**
 * 筆尖拖尾。三層描邊做發光 —— **不准用 shadowBlur**，
 * 它的成本會在施法那一刻爆掉，正好是 demo 最關鍵的 5 秒。
 */
function drawTrail(): void {
  const pts = getStroke();
  if (pts.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(pts[0].x * innerWidth, pts[0].y * innerHeight);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x * innerWidth, pts[i].y * innerHeight);
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 20;
  ctx.globalAlpha = 0.15;
  ctx.strokeStyle = meColor;
  ctx.stroke();
  ctx.lineWidth = 10;
  ctx.globalAlpha = 0.35;
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.globalAlpha = 1;
  ctx.strokeStyle = meHotColor;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function disposeView(): void {
  offs.forEach((f) => f());
  offs = [];
  removeEventListener('resize', onResize);
  actors.dispose();
  runeEffects.dispose();
  if (romanScene) { disposeRomanArena(); disposeCrowd(); }
  else disposeScenery();
  disposeWebcamPip();
  disposeScene();
  renderer?.dispose();
  renderer = null;
  glCanvas?.remove();
  glCanvas = null;
  clock = 0;
  hitFlash = 0;
}

function disposeScene(): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  scene.traverse((node) => {
    const renderable = node as THREE.Mesh | THREE.Points | THREE.Sprite;
    if ('geometry' in renderable && renderable.geometry) geometries.add(renderable.geometry);
    if (!('material' in renderable) || !renderable.material) return;
    const list = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
    for (const material of list) {
      materials.add(material);
      const map = (material as THREE.MeshBasicMaterial).map;
      if (map) textures.add(map);
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
  scene.clear();
}
