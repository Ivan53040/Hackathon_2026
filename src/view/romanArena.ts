import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LANE_WIDTH } from './camera';
import { GAP, type ArenaRefs } from './arena';

let root: THREE.Group | null = null;
let loadGeneration = 0;
let flameLights: THREE.PointLight[] = [];

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

  const hemisphere = new THREE.HemisphereLight(tok('--struct-lit'), tok('--void'), 0.62);
  root.add(hemisphere);
  // 主光是月光：冷、低、方向明確。強度從 3.2 降到 0.85，發光特效才有對比可用
  const sun = new THREE.DirectionalLight(tok('--spell-core'), 0.85);
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
  const fill = new THREE.DirectionalLight(tok('--struct'), 0.3);
  fill.position.set(8, 8, -8);
  root.add(fill);

  flameLights = [-4.15, 4.15].map((x, index) => {
    const light = new THREE.PointLight(tok('--me'), 2.6, 7.5, 2);
    light.position.set(x, 1.35, -4.5);
    light.userData.phase = index * 1.9;
    root!.add(light);
    return light;
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
  for (const light of flameLights) {
    light.intensity = 2.4 + Math.sin(t * 9.5 + (light.userData.phase as number)) * 0.38;
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
  dust = null;
}
