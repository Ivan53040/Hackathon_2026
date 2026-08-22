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
  halo: THREE.Sprite;
  pool: THREE.Mesh;
  phase: number;
}
let braziers: Brazier[] = [];

// 火把繞著場邊排。|x| >= 4.4 全部在 lane 之外，擋不到 z = −7.5 的對手。
// 有 light 的才吃光照成本；其餘只有視覺火焰，免費。
const BRAZIER_SPOTS: Array<{ x: number; z: number; lit: boolean }> = [
  { x: -6.4, z: -3.2, lit: true },
  { x: 6.4, z: -3.2, lit: true },
  { x: -6.7, z: -5.5, lit: true },
  { x: 6.7, z: -5.5, lit: true },
  { x: -6.2, z: -9.4, lit: false },
  { x: 6.2, z: -9.4, lit: false },
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
    if (!(node instanceof THREE.Mesh || node instanceof THREE.Points || node instanceof THREE.Sprite)) return;
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

  /*
   * 主光與環境光的比例 = 這個場景「有沒有立體感」的全部。
   * 之前 hemisphere 1.02 + fill 0.5 = 1.52，對上 key 1.35 —— 環境光比主光還強，
   * 每個面不管朝哪邊收到的光都差不多，所以石材、柱子、階梯全部糊成同一個灰。
   * 壓到 0.30 之後 key:fill ≈ 2.7:1，夜戲該有的形狀就回來了。
   * ⚠️ 這個數字動一格，整場的觀感就會變。要改先看 §4.4。
   */
  const hemisphere = new THREE.HemisphereLight(tok('--struct-lit'), tok('--void'), 0.30);
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
  // 補光只負責讓暗面「讀得出輪廓」，不負責照亮。跟著 hemisphere 一起壓。
  const fill = new THREE.DirectionalLight(tok('--struct'), 0.22);
  fill.position.set(8, 8, -8);
  root.add(fill);

  // 火焰改成不對稱淚滴輪廓。ConeGeometry 無論怎麼打光都會讀成交通錐；
  // ShapeGeometry 的外焰、內焰與柔光片疊起來才會像一個小型發光源。
  const flameShape = new THREE.Shape();
  flameShape.moveTo(0, 0);
  flameShape.bezierCurveTo(-0.18, 0.08, -0.2, 0.28, -0.07, 0.39);
  flameShape.bezierCurveTo(-0.13, 0.48, -0.1, 0.59, -0.055, 0.69);
  flameShape.bezierCurveTo(0.035, 0.56, 0.21, 0.4, 0.15, 0.2);
  flameShape.bezierCurveTo(0.12, 0.08, 0.04, 0.02, 0, 0);
  const flameGeo = new THREE.ShapeGeometry(flameShape, 5);

  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 64;
  const glowContext = glowCanvas.getContext('2d')!;
  const glowColor = tok('--me');
  const glowR = Math.round(glowColor.r * 255);
  const glowG = Math.round(glowColor.g * 255);
  const glowB = Math.round(glowColor.b * 255);
  const glowGradient = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  glowGradient.addColorStop(0, `rgb(${glowR} ${glowG} ${glowB} / 0.72)`);
  glowGradient.addColorStop(0.28, `rgb(${glowR} ${glowG} ${glowB} / 0.26)`);
  glowGradient.addColorStop(1, `rgb(${glowR} ${glowG} ${glowB} / 0)`);
  glowContext.fillStyle = glowGradient;
  glowContext.fillRect(0, 0, 64, 64);
  const glowMap = new THREE.CanvasTexture(glowCanvas);
  glowMap.colorSpace = THREE.SRGBColorSpace;

  const poolGeo = new THREE.CircleGeometry(1.65, 24);
  const bowlGeo = new THREE.CylinderGeometry(0.3, 0.18, 0.14, 10);
  const stemGeo = new THREE.CylinderGeometry(0.055, 0.075, 0.72, 8);
  const flameMat = new THREE.MeshBasicMaterial({
    color: tok('--me'), transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    side: THREE.DoubleSide, toneMapped: false,
  });
  const coreMat = new THREE.MeshBasicMaterial({
    color: mix('--me', '--me-hot', 0.42), transparent: true, opacity: 0.56,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    side: THREE.DoubleSide, toneMapped: false,
  });
  const haloMat = new THREE.SpriteMaterial({
    map: glowMap, color: tok('--me'), transparent: true, opacity: 0.14,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false,
  });
  const poolMat = new THREE.MeshBasicMaterial({
    color: tok('--me'), transparent: true, opacity: 0.11,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const ironMat = new THREE.MeshStandardMaterial({ color: tok('--ash'), roughness: 0.5, metalness: 0.55 });

  flameLights = [];
  braziers = BRAZIER_SPOTS.map((spot, index) => {
    // The Blender plinth has a deep rim; pull the runtime flame slightly forward
    // so the lip does not hide everything except its tip.
    const fireZ = spot.z + 0.42;
    const stem = new THREE.Mesh(stemGeo, ironMat);
    stem.position.set(spot.x, 0.3, fireZ);
    root!.add(stem);
    const bowl = new THREE.Mesh(bowlGeo, ironMat);
    bowl.position.set(spot.x, 0.68, fireZ);
    root!.add(bowl);

    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(spot.x, 0.72, fireZ + 0.018);
    root!.add(flame);
    const core = new THREE.Mesh(flameGeo, coreMat);
    core.position.set(spot.x, 0.73, fireZ + 0.036);
    root!.add(core);
    const halo = new THREE.Sprite(haloMat);
    halo.position.set(spot.x, 1.03, fireZ + 0.055);
    halo.scale.setScalar(1.08);
    root!.add(halo);

    // 地面光池：假的、加色混合、零光照成本，但它才是「這裡有火」的主要訊號
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(spot.x, -0.62, fireZ);
    root!.add(pool);

    let light: THREE.PointLight | null = null;
    if (spot.lit) {
      light = new THREE.PointLight(tok('--me'), 2.35, 7, 2);
      light.position.set(spot.x, 1.02, fireZ);
      root!.add(light);
      flameLights.push(light);
    }
    return { light, flame, core, halo, pool, phase: index * 1.37 };
  });

  /*
   * 場館海報。真的競技場牆上就是掛這種東西 —— 它讓這裡看起來像「有在辦比賽的場地」，
   * 而不是一個空的場景。用的就是首頁那張 key art，兩邊視覺因此對得上。
   *
   * 位置是算過的：對手在 z=-7.5、頭頂約 y=2.6；海報下緣 y=3.75，中間空一整個身高。
   * 材質用 MeshBasicMaterial 不吃光照，所以要手動壓。
   * 原本壓到 62% 是對著舊的環境光（hemisphere 1.02 + fill 0.5）調的；
   * 環境光壓到 0.30 / 0.22 之後場景整體只剩約 65% 的光，海報若不跟著降
   * 就會反過來變成全場最亮的東西 —— 所以 0.62 × 0.65 ≈ 0.40。
   * 另外拿掉 toneMapped: false：接上 EffectComposer 之後 OutputPass 會統一做
   * tone mapping，個別材質的 toneMapped 旗標形同虛設，留著只會誤導下一個人。
   * 對手是深藍剪影，背後放一張全亮的畫會把他吃掉。海報是背景，不是主角。
   */
  // 尺寸是解出來的，不是試出來的：
  //   對手頭頂 (y=2.6, z=-7.5) 的畫面比例 = (2.6-1.6)/7.5 = 0.133
  //   FOV 55° 的可視上緣比例 = tan(27.5°) = 0.521
  //   海報連吊桿必須整個落在 0.157 ~ 0.490 之間 —— 高過人頭，又不被畫面切掉
  const POSTER_W = 8.37, POSTER_H = 4.7, POSTER_Y = 6.52, POSTER_Z = -15.2;
  // 灰階乘數，不是顏色 —— 這是曝光，所以不走 tokens.css
  const POSTER_DIM = new THREE.Color().setScalar(0.40);
  new THREE.TextureLoader().load('/cover.jpg', (tex) => {
    if (!root || generation !== loadGeneration) { tex.dispose(); return; }
    tex.colorSpace = THREE.SRGBColorSpace;
    const poster = new THREE.Mesh(
      new THREE.PlaneGeometry(POSTER_W, POSTER_H),
      new THREE.MeshBasicMaterial({ map: tex, color: POSTER_DIM, fog: false }),
    );
    poster.name = 'arena-poster';
    poster.position.set(0, POSTER_Y, POSTER_Z);
    root.add(poster);

    // 外框與吊桿：沒有實體支撐的話它會像貼在空中的貼紙
    const trim = new THREE.Mesh(
      new THREE.PlaneGeometry(POSTER_W + 0.34, POSTER_H + 0.34),
      new THREE.MeshBasicMaterial({ color: tok('--ash'), fog: false }),
    );
    trim.position.set(0, POSTER_Y, POSTER_Z - 0.04);
    root.add(trim);

    const barGeo = new THREE.CylinderGeometry(0.07, 0.07, POSTER_W + 1.1, 8);
    // 吊桿是金屬，不是光源。接上 bloom 之後純 --me 會直接爆掉，
    // 變成全場最亮的東西 —— 剛好跟「海報不該搶畫面」是同一個問題。
    // 往 --ash 拉成暗銅色，壓在 bloom 門檻之下。
    const barMat = new THREE.MeshBasicMaterial({ color: mix('--ash', '--me', 0.38), fog: false });
    for (const y of [POSTER_Y + POSTER_H / 2 + 0.14, POSTER_Y - POSTER_H / 2 - 0.14]) {
      const bar = new THREE.Mesh(barGeo, barMat);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, y, POSTER_Z - 0.02);
      root.add(bar);
    }
  }, undefined, () => { /* 海報載不到不影響遊戲 */ });

  new GLTFLoader().load('/models/roman_arena.glb', (gltf) => {
    if (!root || generation !== loadGeneration) {
      disposeObject(gltf.scene);
      return;
    }
    gltf.scene.name = 'blender-roman-architecture';
    // Expand the architectural shell without changing the combat coordinates.
    // The backward shift keeps near pillars/banners out of the player's peripheral view.
    gltf.scene.scale.set(1.2, 1, 1.2);
    gltf.scene.position.z = -1.35;
    gltf.scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.castShadow = true;
      node.receiveShadow = true;
      // Blender's arena is exported as one multi-material mesh. Its built-in flame
      // primitive is the large white triangle seen in the foreground, so hide only
      // that material group and let the layered runtime flame above replace it.
      const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of nodeMaterials) {
        if (material.name === 'Brazier Flame') material.visible = false;
      }
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
    b.flame.scale.set(0.96 + flicker * 0.045, 0.98 + flicker * 0.08, 1);
    b.flame.rotation.z = Math.sin(b.phase) * 0.07 + flicker * 0.018;
    b.core.scale.set(0.27 + flicker * 0.018, 0.41 + flicker * 0.035, 1);
    b.core.rotation.z = b.flame.rotation.z * 0.55;
    b.halo.scale.setScalar(1.08 + flicker * 0.04);
    (b.halo.material as THREE.SpriteMaterial).opacity = 0.16 + flicker * 0.018;
    (b.pool.material as THREE.MeshBasicMaterial).opacity = 0.11 + flicker * 0.022;
    if (b.light) b.light.intensity = 2.3 + flicker * 0.36;
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
