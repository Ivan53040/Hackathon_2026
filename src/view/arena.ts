/**
 * 場地　[Wesley]
 *
 * 第一人稱下畫面有一大半是「遠景」。原本兩塊板子看起來像 debug 場景，
 * 不像一個地方 —— 天空、月亮、遠處的塔、地面格線，都是為了讓人相信這裡是個世界。
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config';
import { LANE_WIDTH } from './camera';

const GAP = 8.5;   // 兩邊的距離。太遠對手會小到觀眾在 10 公尺外讀不到

function tok(name: string): THREE.Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v);
}

/** 垂直漸層當天空。用 canvas 貼圖比寫 shader 省事，而且改色只要改 token */
function skyTexture(top: THREE.Color, bottom: THREE.Color): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, `#${top.getHexString()}`);
  grad.addColorStop(0.55, `#${bottom.clone().lerp(top, 0.35).getHexString()}`);
  grad.addColorStop(1, `#${bottom.getHexString()}`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface ArenaRefs { stars: THREE.Points; moon: THREE.Mesh; }

/** Low-quality arena: one continuous lane, ten grid guides, no background assets. */
export function buildSimpleArena(scene: THREE.Scene): ArenaRefs {
  const voidC = tok('--void');
  const blue = tok('--them');
  const blueLit = tok('--them-hot');
  const structure = tok('--struct');

  scene.background = voidC;
  scene.fog = null;

  const floorMaterial = new THREE.MeshStandardMaterial({ color: blue.getHex(), roughness: 0.94, metalness: 0.02 });
  const sideMaterial = new THREE.MeshStandardMaterial({ color: structure.getHex(), roughness: 0.96, metalness: 0 });
  const edgeMaterial = new THREE.MeshBasicMaterial({ color: blueLit.getHex() });

  const ownPlatform = new THREE.Mesh(new THREE.BoxGeometry(LANE_WIDTH, 0.6, 3.2), sideMaterial);
  ownPlatform.position.set(0, -0.3, 0.6);
  scene.add(ownPlatform);

  const enemyPlatform = new THREE.Mesh(new THREE.BoxGeometry(LANE_WIDTH, 0.6, 3.2), floorMaterial);
  enemyPlatform.position.set(0, -0.3, -GAP);
  scene.add(enemyPlatform);

  const road = new THREE.Mesh(new THREE.BoxGeometry(LANE_WIDTH, 0.18, GAP - 1.4), floorMaterial);
  road.position.set(0, -0.09, (0.6 - GAP) / 2);
  scene.add(road);

  const gridMaterial = new THREE.MeshBasicMaterial({ color: blueLit.getHex(), transparent: true, opacity: 0.18 });
  const lineGeometry = new THREE.BoxGeometry(0.025, 0.02, GAP + 3.2);
  const grid = new THREE.InstancedMesh(lineGeometry, gridMaterial, CONFIG.GRID_CELLS - 1);
  const transform = new THREE.Matrix4();
  for (let cell = 1; cell < CONFIG.GRID_CELLS; cell++) {
    transform.makeTranslation((cell / CONFIG.GRID_CELLS - 0.5) * LANE_WIDTH, 0.012, (0.6 - GAP) / 2);
    grid.setMatrixAt(cell - 1, transform);
  }
  grid.instanceMatrix.needsUpdate = true;
  scene.add(grid);

  const ownEdge = new THREE.Mesh(new THREE.BoxGeometry(LANE_WIDTH, 0.1, 0.2), edgeMaterial);
  ownEdge.position.set(0, 0.05, -1);
  scene.add(ownEdge);
  const enemyEdge = new THREE.Mesh(new THREE.BoxGeometry(LANE_WIDTH, 0.1, 0.2), edgeMaterial);
  enemyEdge.position.set(0, 0.05, -GAP + 1.6);
  scene.add(enemyEdge);

  scene.add(new THREE.AmbientLight(tok('--spell-core').getHex(), 1.25));
  const key = new THREE.DirectionalLight(blueLit.getHex(), 1.1);
  key.position.set(-4, 8, 2);
  scene.add(key);

  const stars = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ transparent: true, opacity: 0 }));
  const moon = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  stars.visible = false;
  moon.visible = false;
  scene.add(stars, moon);
  return { stars, moon };
}

export function buildArena(scene: THREE.Scene): ArenaRefs {
  const voidC = tok('--void');
  const stone = tok('--struct');
  const lit = tok('--struct-lit');
  const core = tok('--spell-core');
  const me = tok('--me');

  scene.background = voidC;
  scene.fog = new THREE.Fog(voidC.getHex(), GAP * 0.9, GAP * 3.4);

  // ── 天空：內面朝向相機的大球 ──
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(60, 24, 16),
    new THREE.MeshBasicMaterial({
      map: skyTexture(voidC.clone().multiplyScalar(0.5), stone.clone().multiplyScalar(0.55)),
      side: THREE.BackSide, fog: false, depthWrite: false,
    }),
  );
  scene.add(sky);

  // ── 星星：靜止的畫面看起來像當機，給它一點呼吸 ──
  const N = 260;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(1 - Math.random() * 0.9);          // 只灑上半天空
    const r = 48;
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph) + 6;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: core.getHex(), size: 0.34, sizeAttenuation: true, transparent: true, opacity: 0.75, fog: false }),
  );
  scene.add(stars);

  // ── 月亮：給畫面一個焦點，也給遠方一個尺度參考 ──
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(2.1, 40),
    new THREE.MeshBasicMaterial({ color: core.getHex(), fog: false, transparent: true, opacity: 0.92 }),
  );
  moon.position.set(-20, 21, -44);
  moon.lookAt(0, 1.6, 0);
  scene.add(moon);
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(4.6, 40),
    new THREE.MeshBasicMaterial({ color: lit.getHex(), fog: false, transparent: true, opacity: 0.1 }),
  );
  halo.position.copy(moon.position).setZ(moon.position.z - 0.2);
  halo.lookAt(0, 1.6, 0);
  scene.add(halo);

  // ── 遠處的塔：剪影，只負責製造「這裡是個地方」──
  const silo = new THREE.MeshBasicMaterial({ color: voidC.clone().lerp(stone, 0.22).getHex(), fog: false });
  const spires: [number, number, number, number][] = [
    [-16, 9, -34, 2.2], [-9, 6, -40, 1.6], [12, 11, -36, 2.6],
    [20, 7, -30, 1.8], [-24, 5, -28, 1.4], [5, 14, -46, 3.0],
  ];
  for (const [x, hgt, z, w] of spires) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, w), silo);
    m.position.set(x, hgt / 2 - 2, z);
    scene.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.8, w * 1.5, 4), silo);
    cap.position.set(x, hgt - 2 + w * 0.75, z);
    cap.rotation.y = Math.PI / 4;
    scene.add(cap);
  }

  // ── 地面 ──
  // 沒有地板的話畫面下半是一片空的，看起來像沒做完。
  // 而且透視格線是唯一能讓人「感覺到距離」的東西 —— 火球飛過來才有接近感。
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({
      color: voidC.clone().lerp(stone, 0.16).getHex(), roughness: 1, metalness: 0,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.65, -GAP / 2);
  scene.add(floor);

  const grid = new THREE.GridHelper(80, 40, lit.getHex(), stone.getHex());
  grid.position.set(0, -0.63, -GAP / 2);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.34;
  scene.add(grid);

  // ── 兩塊平台 ──
  const slabMat = new THREE.MeshStandardMaterial({ color: stone.getHex(), roughness: 0.92, metalness: 0.05 });
  for (const z of [0.6, -GAP]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(LANE_WIDTH + 4, 0.6, 3.2), slabMat);
    slab.position.set(0, -0.3, z);
    scene.add(slab);
    // 受光邊：C2 要求平台數得出來，靠這一條把邊緣拉開對比
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(LANE_WIDTH + 4, 0.09, 0.22),
      new THREE.MeshBasicMaterial({ color: lit.getHex() }),
    );
    edge.position.set(0, 0.05, z + (z < -1 ? 1.6 : -1.6));
    scene.add(edge);
  }

  // ── 燈光 ──
  scene.add(new THREE.AmbientLight(core.getHex(), 0.5));
  const key = new THREE.DirectionalLight(core.getHex(), 0.85);
  key.position.set(-4, 8, -2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(me.getHex(), 0.35);
  rim.position.set(3, 2, 4);
  scene.add(rim);

  return { stars, moon };
}

export { GAP };
