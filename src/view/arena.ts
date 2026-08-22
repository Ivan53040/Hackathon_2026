/**
 * 場地　[Wesley]
 * 兩塊平台面對面，中間隔空。voxel 感靠方塊格線，不要真的做幾千個 Mesh。
 */
import * as THREE from 'three';
import { LANE_WIDTH } from './camera';

const GAP = 8.5;   // 兩邊的距離。太遠對手會小到觀眾在 10 公尺外讀不到

function readToken(name: string, fallback: string): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v || fallback).getHex();
}

export function buildArena(scene: THREE.Scene): void {
  const stone = readToken('--struct', '#4E6FA8');
  const lit = readToken('--struct-lit', '#7FA3DC');
  const void_ = readToken('--void', '#05070F');

  scene.background = new THREE.Color(void_);
  scene.fog = new THREE.Fog(void_, GAP * 0.8, GAP * 2.2);

  // 我方腳下
  const near = new THREE.Mesh(
    new THREE.BoxGeometry(LANE_WIDTH + 4, 0.6, 3),
    new THREE.MeshStandardMaterial({ color: stone, roughness: 0.9 }),
  );
  near.position.set(0, -0.3, 0.5);
  scene.add(near);

  // 敵方平台
  const far = new THREE.Mesh(
    new THREE.BoxGeometry(LANE_WIDTH + 4, 0.6, 3),
    new THREE.MeshStandardMaterial({ color: stone, roughness: 0.9 }),
  );
  far.position.set(0, -0.3, -GAP);
  scene.add(far);

  // 受光邊：C2 要求平台數得出來，靠這一條把邊緣拉開對比
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(LANE_WIDTH + 4, 0.08, 0.2),
    new THREE.MeshBasicMaterial({ color: lit }),
  );
  edge.position.set(0, 0.04, -GAP + 1.5);
  scene.add(edge);

  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(2, 6, 2);
  scene.add(key);
}

export { GAP };
