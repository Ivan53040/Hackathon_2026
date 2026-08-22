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

/** 登記到這裡的東西，dispose 時會自動清掉 */
export function track<T extends THREE.Object3D>(o: T): T {
  objects.push(o);
  return o;
}

export function buildScenery(_scene: THREE.Scene): void {
  // TODO [Codex]：見 SCENE-BRIEF.md §2 與 §4。先做 A（地面符文圓盤）。
}

/** 每幀呼叫。t 是累積秒數，dt 是這一幀的秒數。不准在這裡配置物件 */
export function updateScenery(_t: number, _dt: number): void {
  // 沒有動畫就維持空的
}

export function disposeScenery(): void {
  for (const o of objects) o.removeFromParent();
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
  objects.length = 0;
  geometries.length = 0;
  materials.length = 0;
}
