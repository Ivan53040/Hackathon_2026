/**
 * 觀眾席　[Codex]
 *
 * 競技場有看台但完全是空的 —— 空看台讀起來是「廢墟」，不是「有在辦比賽的場地」。
 * 規格與硬規則見專案根目錄的 `CROWD-BRIEF.md`。
 *
 * 這個模組只做加法：`romanArena.ts` 既有的建築、燈光、火把、海報都不重做。
 * 需要拿掉或調整既有的東西，寫在回報裡，由 Wesley 改。
 *
 * 已經由 `view/index.ts` 接好線，直接填內容即可。
 */
import * as THREE from 'three';
import { EV, on } from '../core/bus';

/** 讀 tokens.css 的顏色。觀眾一律用 --struct / --ash 這一側，不准用 --me / --them */
export function tok(name: string): THREE.Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v);
}

const objects: THREE.Object3D[] = [];
const geometries: THREE.BufferGeometry[] = [];
const materials: THREE.Material[] = [];

const MAX_CROWD = 216;
const positionsX = new Float32Array(MAX_CROWD);
const positionsY = new Float32Array(MAX_CROWD);
const positionsZ = new Float32Array(MAX_CROWD);
const scales = new Float32Array(MAX_CROWD);
const phases = new Float32Array(MAX_CROWD);
const swayRates = new Float32Array(MAX_CROWD);
const baseTurns = new Float32Array(MAX_CROWD);
const tints = new Float32Array(MAX_CROWD);
const dummy = new THREE.Object3D();
const dummyColor = new THREE.Color();
const crowdBaseColor = new THREE.Color();
const crowdHitColor = new THREE.Color();

let crowd: THREE.InstancedMesh | null = null;
let crowdMaterial: THREE.MeshBasicMaterial | null = null;
let crowdCount = 0;
let hitReaction = 0;
let stopHitListener: (() => void) | null = null;

/** 登記到這裡的東西，dispose 時會自動清掉 */
export function track<T extends THREE.Object3D>(o: T): T { objects.push(o); return o; }
export function ownGeometry<T extends THREE.BufferGeometry>(g: T): T { geometries.push(g); return g; }
export function ownMaterial<T extends THREE.Material>(m: T): T { materials.push(m); return m; }

export function buildCrowd(scene: THREE.Scene): void {
  disposeCrowd();

  const voidColor = tok('--void');
  const structColor = tok('--struct');
  const ashColor = tok('--ash');
  // 0.27 → 0.20：建築用的是 --struct / --struct-lit，觀眾必須明確落在它們之下，
  // 否則看台會跟牆面黏成同一片。逐一上色的明度雜訊圍繞這個值散開。
  crowdBaseColor.copy(voidColor).lerp(structColor, 0.20).lerp(ashColor, 0.03);
  crowdHitColor.copy(crowdBaseColor).lerp(ashColor, 0.08);

  // A single low-poly lathed profile reads as head + neck + shoulders from a distance.
  // Because the whole silhouette is one geometry, every spectator still fits in one draw call.
  const profile = [
    new THREE.Vector2(0.10, 0.00),
    new THREE.Vector2(0.16, 0.22),
    new THREE.Vector2(0.23, 0.46),
    new THREE.Vector2(0.35, 0.58),
    new THREE.Vector2(0.22, 0.66),
    new THREE.Vector2(0.14, 0.72),
    new THREE.Vector2(0.15, 0.78),
    new THREE.Vector2(0.20, 0.89),
    new THREE.Vector2(0.16, 1.01),
    new THREE.Vector2(0.00, 1.08),
  ];
  const geometry = ownGeometry(new THREE.LatheGeometry(profile, 7));
  crowdMaterial = ownMaterial(new THREE.MeshBasicMaterial({
    color: crowdBaseColor,
    fog: true,
  }));

  crowdCount = 0;
  const addSpectator = (x: number, y: number, z: number, seed: number): void => {
    if (crowdCount >= MAX_CROWD) return;
    const i = crowdCount++;
    positionsX[i] = x;
    positionsY[i] = y;
    positionsZ[i] = z;
    scales[i] = 0.66 + hash(seed + 1) * 0.26;
    phases[i] = hash(seed + 2) * Math.PI * 2;
    swayRates[i] = 0.42 + hash(seed + 3) * 0.24;
    baseTurns[i] = (hash(seed + 4) - 0.5) * 0.28;
    // 每個人自己的明度。全部同一個值 = 216 張一模一樣的貼紙；
    // 散開之後才會讀成「一群人」，因為人群的資訊是它的雜訊，不是它的形狀。
    tints[i] = 0.58 + hash(seed + 7) * 0.54;
  };

  // Side banks are deliberately sparse and start farther from camera, so they frame
  // the fight instead of becoming a continuous wall around it.
  for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
    const side = sideIndex === 0 ? -1 : 1;
    for (let tier = 0; tier < 3; tier++) {
      for (let seat = 0; seat < 14; seat++) {
        if ((seat + tier * 2 + sideIndex * 4) % 7 === 0) continue;
        const seed = 100 + sideIndex * 200 + tier * 31 + seat;
        addSpectator(
          side * (8.00 + tier * 0.95 + hash(seed) * 0.22),
          0.12 + tier * 0.72 + hash(seed + 5) * 0.10,
          -7.10 - seat * 0.94 + (hash(seed + 6) - 0.5) * 0.18,
          seed,
        );
      }
    }
  }

  // Rear banks flank the poster instead of sitting in front of it.
  for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
    const side = sideIndex === 0 ? -1 : 1;
    for (let tier = 0; tier < 2; tier++) {
      for (let seat = 0; seat < 8; seat++) {
        if ((seat + tier * 2 + sideIndex) % 5 === 0) continue;
        const seed = 700 + sideIndex * 200 + tier * 37 + seat;
        addSpectator(
          side * (5.45 + seat * 0.76 + hash(seed) * 0.14),
          1.20 + tier * 0.72 + hash(seed + 5) * 0.08,
          -14.10 - tier * 1.45 + (hash(seed + 6) - 0.5) * 0.14,
          seed,
        );
      }
    }
  }

  crowd = track(new THREE.InstancedMesh(geometry, crowdMaterial, crowdCount));
  crowd.name = 'arena-crowd';
  crowd.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  crowd.castShadow = false;
  crowd.receiveShadow = false;

  /*
   * 逐一上色。instanceColor 是乘上材質色，所以 updateCrowd 的受擊反應
   * 仍然對全場生效 —— 兩者不衝突。
   *
   * 深度衰減：後排比前排暗。看台是往後往上疊的，靠真實的空氣透視把層次做出來，
   * 比多加幾何體便宜得多，而且不會多一個 draw call。
   * 整體壓在建築之下 —— 觀眾是背景的質地，不是要被讀的東西。
   */
  for (let i = 0; i < crowdCount; i++) {
    const depth = Math.min(1, Math.max(0, (positionsZ[i] + 7) / -14));
    dummyColor.setScalar(tints[i] * (1 - depth * 0.3));
    crowd.setColorAt(i, dummyColor);
  }
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;

  scene.add(crowd);

  updateCrowd(0, 0);
  crowd.computeBoundingSphere();

  stopHitListener = on(EV.SPELL_HIT, () => {
    hitReaction = 1;
  });
}

/** 每幀呼叫。t 是累積秒數，dt 是這一幀的秒數。不准在這裡配置物件 */
export function updateCrowd(t: number, dt: number): void {
  if (!crowd || !crowdMaterial) return;

  // 0.36 s total response, peaking at an 8% token-derived lift.
  hitReaction = Math.max(0, hitReaction - dt / 0.36);
  crowdMaterial.color.copy(crowdBaseColor).lerp(
    crowdHitColor,
    hitReaction * hitReaction,
  );

  for (let i = 0; i < crowdCount; i++) {
    const sway = Math.sin(t * swayRates[i] + phases[i]);
    dummy.position.set(positionsX[i], positionsY[i], positionsZ[i]);
    dummy.rotation.set(sway * 0.0035, baseTurns[i], sway * 0.0075);
    dummy.scale.setScalar(scales[i]);
    dummy.updateMatrix();
    crowd.setMatrixAt(i, dummy.matrix);
  }
  crowd.instanceMatrix.needsUpdate = true;
}

export function disposeCrowd(): void {
  stopHitListener?.();
  stopHitListener = null;
  for (const o of objects) o.removeFromParent();
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
  objects.length = 0;
  geometries.length = 0;
  materials.length = 0;
  crowd = null;
  crowdMaterial = null;
  crowdCount = 0;
  hitReaction = 0;
}

function hash(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
