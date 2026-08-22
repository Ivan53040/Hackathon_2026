/**
 * 場景裝飾　[Codex]
 *
 * 決鬥場本身 —— 地面符文圓盤、外圈斷柱、平台基座、斷崖。
 * 規格與硬規則見專案根目錄的 `SCENE-BRIEF.md`。
 *
 * 這個模組只做「加法」：`arena.ts` 已經有的天空、月亮、星星、地板、
 * 兩塊平台與燈光都不重做。需要拿掉或調暗既有的東西，寫在回報裡，由 Wesley 改。
 *
 * 已經由 `view/index.ts` 接好線，直接填內容即可。
 */
import * as THREE from 'three';

/** 讀 tokens.css 的顏色。場景主色用 --struct / --struct-lit，不要用 --them */
export function tok(name: string): THREE.Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v);
}

const objects: THREE.Object3D[] = [];
const geometries: THREE.BufferGeometry[] = [];
const materials: THREE.Material[] = [];

const DISC_Z = -4;
const DISC_RADIUS = 5.15;

let celestialDial: THREE.Group | null = null;
let magicMaterial: THREE.MeshBasicMaterial | null = null;

function ownGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
  geometries.push(geometry);
  return geometry;
}

function ownMaterial<T extends THREE.Material>(material: T): T {
  materials.push(material);
  return material;
}

/** 登記到這裡的東西，dispose 時會自動清掉 */
export function track<T extends THREE.Object3D>(o: T): T {
  objects.push(o);
  return o;
}

export function buildScenery(scene: THREE.Scene): void {
  if (objects.length > 0) disposeScenery();

  const root = track(new THREE.Group());
  root.name = 'ruined-orrery-court';
  root.position.z = DISC_Z;
  scene.add(root);

  const struct = tok('--struct');
  const structLit = tok('--struct-lit');
  const magic = tok('--magic');
  const voidColor = tok('--void');
  const ash = tok('--ash');

  const stoneMaterial = ownMaterial(new THREE.MeshStandardMaterial({
    color: struct,
    roughness: 0.94,
    metalness: 0.03,
  }));
  const cutStoneMaterial = ownMaterial(new THREE.MeshStandardMaterial({
    color: structLit,
    roughness: 0.84,
    metalness: 0.05,
  }));
  const metalMaterial = ownMaterial(new THREE.MeshStandardMaterial({
    color: ash,
    roughness: 0.48,
    metalness: 0.62,
  }));
  const cliffMaterial = ownMaterial(new THREE.MeshStandardMaterial({
    color: voidColor,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  }));
  const inlayMaterial = ownMaterial(new THREE.MeshBasicMaterial({
    color: structLit,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  magicMaterial = ownMaterial(new THREE.MeshBasicMaterial({
    color: magic,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  const matrixDummy = new THREE.Object3D();

  // 地面不是發光法陣，而是一座被磨損的石造星盤；魔法色只留在中心讀數環。
  const disc = new THREE.Mesh(
    ownGeometry(new THREE.CylinderGeometry(DISC_RADIUS, DISC_RADIUS + 0.16, 0.18, 72)),
    stoneMaterial,
  );
  disc.name = 'orrery-floor';
  disc.position.y = -0.73;
  disc.receiveShadow = true;
  root.add(disc);

  const ringSpecs: Array<[number, number, THREE.Material]> = [
    [1.16, 1.2, magicMaterial],
    [2.52, 2.56, inlayMaterial],
    [3.78, 3.84, inlayMaterial],
    [4.88, 5.02, cutStoneMaterial],
  ];
  for (const [inner, outer, material] of ringSpecs) {
    const ring = new THREE.Mesh(
      ownGeometry(new THREE.RingGeometry(inner, outer, 128)),
      material,
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.625;
    ring.renderOrder = 1;
    root.add(ring);
  }

  // 八條有主次的子午線取代平均撒滿的放射線，視覺節奏更像真正星盤。
  const meridianGeometry = ownGeometry(new THREE.BoxGeometry(1, 0.012, 0.038));
  const meridians = new THREE.InstancedMesh(meridianGeometry, inlayMaterial, 12);
  meridians.name = 'orrery-meridians';
  meridians.position.y = -0.603;
  meridians.renderOrder = 2;
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const isCardinal = i % 2 === 0;
    const length = isCardinal ? 2.62 : 1.08;
    const radius = isCardinal ? 3.14 : 3.35;
    matrixDummy.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    matrixDummy.rotation.set(0, -angle, 0);
    matrixDummy.scale.set(length, 1, isCardinal ? 1.25 : 0.82);
    matrixDummy.updateMatrix();
    meridians.setMatrixAt(i, matrixDummy.matrix);
  }
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    matrixDummy.position.set(Math.cos(angle) * 1.87, 0, Math.sin(angle) * 1.87);
    matrixDummy.rotation.set(0, -angle, 0);
    matrixDummy.scale.set(0.72, 1, 0.72);
    matrixDummy.updateMatrix();
    meridians.setMatrixAt(8 + i, matrixDummy.matrix);
  }
  meridians.instanceMatrix.needsUpdate = true;
  root.add(meridians);

  // 十二枚刻度集中在外環；數量少、間距有秩序，不再像隨機 rune scatter。
  const indexGeometry = ownGeometry(new THREE.BoxGeometry(0.42, 0.016, 0.075));
  const indices = new THREE.InstancedMesh(indexGeometry, metalMaterial, 12);
  indices.name = 'bronze-hour-indices';
  indices.position.y = -0.59;
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    matrixDummy.position.set(Math.cos(angle) * 4.42, 0, Math.sin(angle) * 4.42);
    matrixDummy.rotation.set(0, -angle, 0);
    matrixDummy.scale.set(i % 3 === 0 ? 1.28 : 0.66, 1, 1);
    matrixDummy.updateMatrix();
    indices.setMatrixAt(i, matrixDummy.matrix);
  }
  indices.instanceMatrix.needsUpdate = true;
  root.add(indices);

  const starShape = new THREE.Shape();
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2 + Math.PI / 2;
    const radius = i % 2 === 0 ? 0.68 : 0.25;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) starShape.moveTo(x, y);
    else starShape.lineTo(x, y);
  }
  starShape.closePath();
  const star = new THREE.Mesh(ownGeometry(new THREE.ShapeGeometry(starShape)), magicMaterial);
  star.name = 'central-compass-star';
  star.rotation.x = -Math.PI / 2;
  star.position.y = -0.597;
  star.renderOrder = 2;
  root.add(star);

  celestialDial = new THREE.Group();
  celestialDial.name = 'moving-celestial-index';
  celestialDial.position.y = -0.588;
  const dialGeometry = ownGeometry(new THREE.BoxGeometry(0.34, 0.018, 0.055));
  const dialTicks = new THREE.InstancedMesh(dialGeometry, magicMaterial, 4);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    matrixDummy.position.set(Math.cos(angle) * 1.42, 0, Math.sin(angle) * 1.42);
    matrixDummy.rotation.set(0, -angle, 0);
    matrixDummy.scale.set(1, 1, 1);
    matrixDummy.updateMatrix();
    dialTicks.setMatrixAt(i, matrixDummy.matrix);
  }
  dialTicks.instanceMatrix.needsUpdate = true;
  celestialDial.add(dialTicks);
  root.add(celestialDial);

  // 兩端改成半圓形門檻，讓原平台嵌進星盤，不再加一疊方形講台階梯。
  const fanSpecs: Array<[number, number, number, number]> = [
    [2.16, 3.08, Math.PI, -0.19],
    [2.52, 3.08, Math.PI, -0.43],
    [2.16, -3.08, 0, -0.19],
    [2.52, -3.08, 0, -0.43],
  ];
  for (let i = 0; i < fanSpecs.length; i++) {
    const [radius, z, centerAngle, top] = fanSpecs[i];
    const height = top + 0.65;
    const segmentStep = Math.PI / 7;
    const fan = new THREE.InstancedMesh(
      ownGeometry(new THREE.CylinderGeometry(radius, radius, height, 10, 1, false, -segmentStep * 0.46, segmentStep * 0.92)),
      i % 2 === 0 ? cutStoneMaterial : stoneMaterial,
      7,
    );
    fan.name = i < 2 ? 'near-fan-threshold' : 'far-fan-threshold';
    for (let segment = 0; segment < 7; segment++) {
      matrixDummy.position.set(0, -0.65 + height / 2, z);
      matrixDummy.rotation.set(0, centerAngle - Math.PI / 2 + (segment + 0.5) * segmentStep, 0);
      matrixDummy.scale.set(1, 1, 1);
      matrixDummy.updateMatrix();
      fan.setMatrixAt(segment, matrixDummy.matrix);
    }
    fan.instanceMatrix.needsUpdate = true;
    fan.castShadow = true;
    fan.receiveShadow = true;
    root.add(fan);
  }

  // 六座扶壁依真實受力關係成組：寬基座、收窄塔身、內側豎脊。
  const pierData: Array<{ x: number; z: number; h: number; turn: number }> = [
    { x: -4.28, z: 1.7, h: 3.45, turn: -0.035 },
    { x: -4.28, z: -1.5, h: 2.18, turn: 0.018 },
    { x: -4.28, z: -4.35, h: 1.62, turn: -0.06 },
    { x: 4.66, z: 2.62, h: 1.78, turn: 0.055 },
    { x: 4.66, z: -0.56, h: 3.5, turn: -0.02 },
    { x: 4.66, z: -3.9, h: 3.3, turn: 0.034 },
  ];
  const lowerPierGeometry = ownGeometry(new THREE.CylinderGeometry(0.52, 0.68, 0.72, 6));
  const upperPierGeometry = ownGeometry(new THREE.CylinderGeometry(0.37, 0.48, 1, 6));
  const plinthGeometry = ownGeometry(new THREE.CylinderGeometry(0.76, 0.76, 0.15, 6));
  const lowerPiers = new THREE.InstancedMesh(lowerPierGeometry, stoneMaterial, pierData.length);
  const upperPiers = new THREE.InstancedMesh(upperPierGeometry, stoneMaterial, pierData.length);
  const plinths = new THREE.InstancedMesh(plinthGeometry, cutStoneMaterial, pierData.length);
  const ribGeometry = ownGeometry(new THREE.BoxGeometry(1, 1, 1));
  const ribs = new THREE.InstancedMesh(ribGeometry, cutStoneMaterial, pierData.length);
  for (let i = 0; i < pierData.length; i++) {
    const pier = pierData[i];
    matrixDummy.position.set(pier.x, -0.28, pier.z);
    matrixDummy.rotation.set(0, pier.turn, 0);
    matrixDummy.scale.set(1, 1, 1);
    matrixDummy.updateMatrix();
    lowerPiers.setMatrixAt(i, matrixDummy.matrix);

    const upperHeight = Math.max(0.72, pier.h - 0.64);
    matrixDummy.position.set(pier.x, 0.08 + upperHeight / 2, pier.z);
    matrixDummy.scale.set(1, upperHeight, 1);
    matrixDummy.updateMatrix();
    upperPiers.setMatrixAt(i, matrixDummy.matrix);

    matrixDummy.position.set(pier.x, -0.56, pier.z);
    matrixDummy.scale.set(1, 1, 1);
    matrixDummy.updateMatrix();
    plinths.setMatrixAt(i, matrixDummy.matrix);

    const innerX = pier.x + (pier.x < 0 ? 0.43 : -0.43);
    matrixDummy.position.set(innerX, 0.12 + upperHeight * 0.45, pier.z);
    matrixDummy.rotation.set(0, 0, 0);
    matrixDummy.scale.set(0.075, upperHeight * 0.76, 0.16);
    matrixDummy.updateMatrix();
    ribs.setMatrixAt(i, matrixDummy.matrix);
  }
  for (const mesh of [lowerPiers, upperPiers, plinths, ribs]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  // 尖拱的端點落在扶壁上，從結構上看得出「為什麼它站得住」。
  const makeArchPath = (span: number, half: boolean): THREE.CurvePath<THREE.Vector3> => {
    const path = new THREE.CurvePath<THREE.Vector3>();
    if (!half) {
      path.add(new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 0, -span),
        new THREE.Vector3(0, 1.7, -span),
        new THREE.Vector3(0, 2.65, 0),
      ));
    }
    path.add(new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 2.65, 0),
      new THREE.Vector3(0, 1.7, span),
      new THREE.Vector3(0, 0, span),
    ));
    return path;
  };
  const fullArchGeometry = ownGeometry(new THREE.TubeGeometry(makeArchPath(1.61, false), 36, 0.17, 6, false));
  const archTrimGeometry = ownGeometry(new THREE.TubeGeometry(makeArchPath(1.61, false), 36, 0.055, 5, false));
  const brokenArchGeometry = ownGeometry(new THREE.TubeGeometry(makeArchPath(1.43, true), 18, 0.17, 6, false));
  const archPlacements: Array<[number, number]> = [
    [4.66, -2.23],
  ];
  for (const [x, z] of archPlacements) {
    const arch = new THREE.Mesh(fullArchGeometry, stoneMaterial);
    arch.position.set(x, 1.12, z);
    arch.castShadow = true;
    root.add(arch);

    const trim = new THREE.Mesh(archTrimGeometry, metalMaterial);
    trim.position.set(x + (x < 0 ? 0.025 : -0.025), 1.12, z);
    root.add(trim);
  }
  const brokenArch = new THREE.Mesh(brokenArchGeometry, stoneMaterial);
  brokenArch.name = 'collapsed-lancet-half';
  brokenArch.position.set(-4.28, 1.08, 0.1);
  brokenArch.rotation.z = -0.035;
  brokenArch.castShadow = true;
  root.add(brokenArch);

  const keystoneGeometry = ownGeometry(new THREE.DodecahedronGeometry(0.23, 0));
  for (const [x, z] of archPlacements) {
    const key = new THREE.Mesh(keystoneGeometry, cutStoneMaterial);
    key.position.set(x, 3.78, z);
    key.rotation.set(0.25, 0.2, 0.4);
    root.add(key);
  }

  // 側牆殘段與瓦礫只沿邊界出現；不把中央走廊做成障礙賽。
  const wallGeometry = ownGeometry(new THREE.BoxGeometry(0.7, 0.58, 1));
  const wallData: Array<[number, number, number, number]> = [
    [-4.28, 0.1, 1.52, 0.01],
    [-4.28, -2.93, 1.22, -0.05],
    [4.66, 1.15, 1.3, 0.035],
    [4.66, -3.02, 1.22, -0.025],
  ];
  const walls = new THREE.InstancedMesh(wallGeometry, stoneMaterial, wallData.length);
  for (let i = 0; i < wallData.length; i++) {
    const [x, z, length, turn] = wallData[i];
    matrixDummy.position.set(x, -0.36, z);
    matrixDummy.rotation.set(0, turn, 0);
    matrixDummy.scale.set(1, 1, length);
    matrixDummy.updateMatrix();
    walls.setMatrixAt(i, matrixDummy.matrix);
  }
  walls.instanceMatrix.needsUpdate = true;
  walls.receiveShadow = true;
  root.add(walls);

  const rubbleGeometry = ownGeometry(new THREE.DodecahedronGeometry(0.27, 0));
  const rubble = new THREE.InstancedMesh(rubbleGeometry, stoneMaterial, 14);
  for (let i = 0; i < 14; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = 3.9 - (i % 7) * 1.26;
    matrixDummy.position.set(side * (4.22 + (i % 3) * 0.34), -0.49 + (i % 2) * 0.06, z);
    matrixDummy.rotation.set(i * 0.37, i * 0.61, i * 0.23);
    matrixDummy.scale.set(0.58 + (i % 3) * 0.19, 0.42 + (i % 4) * 0.13, 0.7 + (i % 2) * 0.16);
    matrixDummy.updateMatrix();
    rubble.setMatrixAt(i, matrixDummy.matrix);
  }
  rubble.instanceMatrix.needsUpdate = true;
  rubble.castShadow = true;
  root.add(rubble);

  // 斷崖保持安靜，只用粗糙輪廓說明高度，不與角色和法術搶亮度。
  const cliffWall = new THREE.Mesh(
    ownGeometry(new THREE.CylinderGeometry(DISC_RADIUS + 0.12, DISC_RADIUS + 0.46, 0.8, 48, 1, true)),
    cliffMaterial,
  );
  cliffWall.name = 'orrery-cliff-wall';
  cliffWall.position.y = -1.07;
  root.add(cliffWall);

  const cliffGeometry = ownGeometry(new THREE.ConeGeometry(0.25, 0.78, 5));
  const cliffPieces = new THREE.InstancedMesh(cliffGeometry, cliffMaterial, 18);
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2 + (i % 3) * 0.025;
    const radius = DISC_RADIUS + 0.25;
    matrixDummy.position.set(Math.cos(angle) * radius, -1.2 - (i % 4) * 0.06, Math.sin(angle) * radius);
    matrixDummy.rotation.set((i % 2) * 0.08, -angle, (i % 3 - 1) * 0.09);
    matrixDummy.scale.set(0.8 + (i % 3) * 0.14, 0.72 + (i % 5) * 0.09, 1);
    matrixDummy.updateMatrix();
    cliffPieces.setMatrixAt(i, matrixDummy.matrix);
  }
  cliffPieces.instanceMatrix.needsUpdate = true;
  root.add(cliffPieces);

}

/** 每幀呼叫。t 是累積秒數，dt 是這一幀的秒數。不准在這裡配置物件 */
export function updateScenery(t: number, dt: number): void {
  if (celestialDial) celestialDial.rotation.y += dt * 0.006;
  if (magicMaterial) magicMaterial.opacity = 0.23 + Math.sin(t * 0.7) * 0.025;
}

export function disposeScenery(): void {
  for (const o of objects) o.removeFromParent();
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
  objects.length = 0;
  geometries.length = 0;
  materials.length = 0;
  celestialDial = null;
  magicMaterial = null;
}
