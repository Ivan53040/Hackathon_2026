import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LANE_WIDTH } from './camera';
import { GAP, type ArenaRefs } from './arena';

let root: THREE.Group | null = null;
let loadGeneration = 0;
let flameLights: THREE.PointLight[] = [];
/** 火焰本體與地面光池。每幀只改 scale / opacity / intensity，不配置物件 */
interface Brazier {
  light: THREE.PointLight | null;
  flame: THREE.Mesh;
  core: THREE.Mesh;
  pool: THREE.Mesh;
  phase: number;
}
let braziers: Brazier[] = [];

// 火把繞著場邊排。|x| >= 4.4 全部在 lane 之外，擋不到 z = −7.5 的對手。
// 有 light 的才吃光照成本；其餘只有視覺火焰，免費。
const BRAZIER_SPOTS: Array<{ x: number; z: number; lit: boolean }> = [
  { x: -5.1, z: -2.4, lit: true },
  { x: 5.1, z: -2.4, lit: true },
  { x: -5.3, z: -4.6, lit: true },
  { x: 5.3, z: -4.6, lit: true },
  { x: -4.9, z: -8.2, lit: false },
  { x: 4.9, z: -8.2, lit: false },
];

/** 顏色一律從 tokens.css 讀（CLAUDE.md / HANDOFF §7）。夜間版不再寫死 hex。 */
function tok(name: string): THREE.Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v);
}
/** a 與 b 之間插值，t=0 全 a。用來調出色票之間的中間色，仍然只依賴 token */
function mix(a: string, b: string, t: number): THREE.Color {
  return tok(a).lerp(tok(b), t);
}
const hex = (c: THREE.Color) => `#${c.getHexString()}`;
let dust: THREE.Points | null = null;

function skyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  // 夜空：頂端最深，接近地平線微微被場內火光染暖，但整體仍在 --void 這一側
  gradient.addColorStop(0, hex(tok('--void')));
  gradient.addColorStop(0.52, hex(mix('--void', '--struct', 0.22)));
  gradient.addColorStop(0.82, hex(mix('--void', '--struct', 0.42)));
  gradient.addColorStop(1, hex(mix('--void', '--me', 0.18)));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function sandTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = hex(mix('--void', '--struct', 0.34));
  ctx.fillRect(0, 0, 256, 256);
  let seed = 907;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < 900; i++) {
    // 顆粒往冷色偏，不要再是暖沙
    const tone = 58 + Math.floor(random() * 46);
    ctx.fillStyle = `rgb(${tone} ${tone + 8} ${tone + 34} / ${0.1 + random() * 0.2})`;
    const size = 0.4 + random() * 1.4;
    ctx.fillRect(random() * 256, random() * 256, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(14, 14);
  return texture;
}

function disposeObject(object: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh || node instanceof THREE.Points)) return;
    geometries.add(node.geometry);
    const list = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of list) {
      materials.add(material);
      const map = (material as THREE.MeshStandardMaterial).map;
      if (map) textures.add(map);
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

export function buildRomanArena(scene: THREE.Scene): ArenaRefs {
  disposeRomanArena();
  const generation = ++loadGeneration;
  root = new THREE.Group();
  root.name = 'roman-sunset-colosseum';
  scene.add(root);

  scene.background = tok('--void');
  // 夜間霧要更早咬進來，外圈才會沉進黑暗，競技場邊界自然收掉
  scene.fog = new THREE.Fog(hex(mix('--void', '--struct', 0.12)), 14, 46);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(80, 32, 18),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  root.add(sky);

  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 48),
    new THREE.MeshBasicMaterial({ color: tok('--spell-core'), fog: false, transparent: true, opacity: 0.9 }),
  );
  sunDisc.position.set(-22, 17, -46);
  sunDisc.lookAt(0, 3, 0);
  root.add(sunDisc);
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(6.8, 48),
    new THREE.MeshBasicMaterial({ color: tok('--struct-lit'), fog: false, transparent: true, opacity: 0.14, depthWrite: false }),
  );
  halo.position.copy(sunDisc.position).add(new THREE.Vector3(0, 0, -0.25));
  halo.lookAt(0, 3, 0);
  root.add(halo);

  const dustPositions = new Float32Array(320 * 3);
  let dustSeed = 211;
  const dustRandom = () => {
    dustSeed = (dustSeed * 1103515245 + 12345) & 0x7fffffff;
    return dustSeed / 0x7fffffff;
  };
  for (let i = 0; i < 320; i++) {
    dustPositions[i * 3] = (dustRandom() - 0.5) * 22;
    dustPositions[i * 3 + 1] = -0.2 + dustRandom() * 7;
    dustPositions[i * 3 + 2] = -1 - dustRandom() * 24;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  dust = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({ color: tok('--struct-lit'), size: 0.055, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  root.add(dust);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ map: sandTexture(), color: mix('--void', '--struct', 0.55), roughness: 1, metalness: 0 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, -0.65, -GAP / 2);
  sand.receiveShadow = true;
  root.add(sand);

  const arenaLine = new THREE.Mesh(
    new THREE.RingGeometry(9.65, 9.92, 96),
    new THREE.MeshBasicMaterial({ color: tok('--struct-lit'), transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
  );
  arenaLine.rotation.x = -Math.PI / 2;
  arenaLine.scale.x = 1.42;
  arenaLine.position.set(0, -0.625, -4.3);
  root.add(arenaLine);

  const platformMaterial = new THREE.MeshStandardMaterial({
    color: tok('--struct'), roughness: 0.88, metalness: 0.02,
  });
  const platformEdgeMaterial = new THREE.MeshStandardMaterial({
    color: tok('--struct-lit'), roughness: 0.62, metalness: 0.08,
  });
  for (const z of [0.6, -GAP]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(LANE_WIDTH + 4, 0.6, 3.2), platformMaterial);
    slab.position.set(0, -0.3, z);
    slab.castShadow = true;
    slab.receiveShadow = true;
    root.add(slab);

    const edge = new THREE.Mesh(new THREE.BoxGeometry(LANE_WIDTH + 4, 0.11, 0.24), platformEdgeMaterial);
    edge.position.set(0, 0.055, z + (z < -1 ? 1.6 : -1.6));
    root.add(edge);
  }

  const hemisphere = new THREE.HemisphereLight(tok('--struct-lit'), tok('--void'), 1.02);
  root.add(hemisphere);
  // 主光是月光：冷、方向明確，但要讀得出石材。太低整場會糊成一團黑。
  const sun = new THREE.DirectionalLight(tok('--spell-core'), 1.35);
  sun.position.set(-9, 14, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 16;
  sun.shadow.camera.bottom = -8;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 55;
  root.add(sun);
  const fill = new THREE.DirectionalLight(tok('--struct'), 0.5);
  fill.position.set(8, 8, -8);
  root.add(fill);

  // 火焰用 MeshBasicMaterial 自己發亮，不靠光源 —— 加光源是逐片段成本，加形狀不是。
  const flameGeo = new THREE.ConeGeometry(0.17, 0.92, 8);
  const coreGeo = new THREE.ConeGeometry(0.085, 0.5, 6);
  const haloGeo = new THREE.SphereGeometry(0.52, 12, 10);
  const poolGeo = new THREE.CircleGeometry(2.3, 24);
  const bowlGeo = new THREE.CylinderGeometry(0.34, 0.2, 0.2, 10);
  const stemGeo = new THREE.CylinderGeometry(0.07, 0.1, 1.15, 8);
  // 加色混合 + 不寫深度：實心錐體會讀成交通錐，會發光的才讀成火
  const flameMat = new THREE.MeshBasicMaterial({
    color: tok('--me'), transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const coreMat = new THREE.MeshBasicMaterial({
    color: tok('--me-hot'), transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const haloMat = new THREE.MeshBasicMaterial({
    color: tok('--me'), transparent: true, opacity: 0.11,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.BackSide,
  });
  const poolMat = new THREE.MeshBasicMaterial({
    color: tok('--me'), transparent: true, opacity: 0.16,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const ironMat = new THREE.MeshStandardMaterial({ color: tok('--ash'), roughness: 0.5, metalness: 0.55 });

  flameLights = [];
  braziers = BRAZIER_SPOTS.map((spot, index) => {
    const stem = new THREE.Mesh(stemGeo, ironMat);
    stem.position.set(spot.x, -0.08, spot.z);
    root!.add(stem);
    const bowl = new THREE.Mesh(bowlGeo, ironMat);
    bowl.position.set(spot.x, 0.58, spot.z);
    root!.add(bowl);

    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(spot.x, 1.02, spot.z);
    root!.add(flame);
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(spot.x, 0.92, spot.z);
    root!.add(core);
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.set(spot.x, 1.0, spot.z);
    root!.add(halo);

    // 地面光池：假的、加色混合、零光照成本，但它才是「這裡有火」的主要訊號
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(spot.x, -0.62, spot.z);
    root!.add(pool);

    let light: THREE.PointLight | null = null;
    if (spot.lit) {
      light = new THREE.PointLight(tok('--me'), 3.1, 9, 2);
      light.position.set(spot.x, 1.1, spot.z);
      root!.add(light);
      flameLights.push(light);
    }
    return { light, flame, core, pool, phase: index * 1.37 };
  });

  new GLTFLoader().load('/models/roman_arena.glb', (gltf) => {
    if (!root || generation !== loadGeneration) {
      disposeObject(gltf.scene);
      return;
    }
    gltf.scene.name = 'blender-roman-architecture';
    gltf.scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.castShadow = true;
      node.receiveShadow = true;
    });
    root.add(gltf.scene);
  });

  // Hidden compatibility refs let the shared render loop keep its compact API.
  const stars = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ transparent: true, opacity: 0 }));
  const moon = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  stars.visible = false;
  moon.visible = false;
  root.add(stars, moon);
  return { stars, moon };
}

export function updateRomanArena(t: number): void {
  if (dust) dust.rotation.y = Math.sin(t * 0.055) * 0.018;
  for (const b of braziers) {
    // 兩個不同頻率相加，看起來才不規則；純 sin 會像在呼吸不像在燒
    const flicker = Math.sin(t * 9.5 + b.phase) * 0.5 + Math.sin(t * 21.3 + b.phase * 2.1) * 0.5;
    b.flame.scale.set(1 + flicker * 0.11, 1 + flicker * 0.19, 1 + flicker * 0.11);
    b.core.scale.setScalar(1 + flicker * 0.16);
    (b.pool.material as THREE.MeshBasicMaterial).opacity = 0.16 + flicker * 0.035;
    if (b.light) b.light.intensity = 3.0 + flicker * 0.55;
  }
}

export function disposeRomanArena(): void {
  loadGeneration++;
  if (root) {
    disposeObject(root);
    root.removeFromParent();
  }
  root = null;
  flameLights = [];
  braziers = [];
  dust = null;
}
