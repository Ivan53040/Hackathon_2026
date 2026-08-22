/**
 * 頭頂血魔量　[Wesley]
 *
 * 規格要求：兩條都顯示在角色頭頂讓敵方看得見 ——
 * 但敵方前面有遮蔽物時看不見（C3）。
 *
 * 這是「蓋牆」的第三個好處，也是玩家理解遮蔽物最快的方式：
 * 他躲到牆後，你手上的資訊就少一塊。
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config';

const W = 96;      // 血條寬（px）
const H = 7;
const GAP_Y = 3;
const projected = new THREE.Vector3();

function tok(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

let dim = '';
let them = '';
let themHot = '';
let mono = '';

function ensurePalette(): void {
  if (dim) return;
  dim = tok('--dim');
  them = tok('--them');
  themHot = tok('--them-hot');
  mono = tok('--font-mono');
}

/** 把世界座標投影到螢幕，畫出兩條 bar。看不到時畫 ??? */
export function drawNameplate(
  ctx: CanvasRenderingContext2D,
  cam: THREE.PerspectiveCamera,
  world: THREE.Vector3,
  hp: number,
  mp: number,
  visible: boolean,
): void {
  ensurePalette();
  const p = projected.copy(world).project(cam);
  if (p.z > 1) return;                       // 在相機背後
  const sx = (p.x * 0.5 + 0.5) * innerWidth;
  const sy = (-p.y * 0.5 + 0.5) * innerHeight;

  if (!visible) {
    // 不要淡出，要「明確地被擋住」—— 玩家才會意識到「我看不到他，因為有牆」
    ctx.font = `700 15px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = dim;
    ctx.fillText('? ? ?', sx, sy);
    ctx.textAlign = 'left';
    return;
  }

  const x = sx - W / 2;
  // HP：用格子不用數字。10 公尺外讀得到形狀，讀不到數字
  const cells = CONFIG.HP_MAX;
  const cw = (W - (cells - 1) * 2) / cells;
  for (let i = 0; i < cells; i++) {
    ctx.fillStyle = i < hp ? themHot : dim;
    ctx.globalAlpha = i < hp ? 1 : 0.25;
    ctx.fillRect(x + i * (cw + 2), sy, cw, H);
  }
  ctx.globalAlpha = 1;
  // MP：細長條。快滿時整條發亮 —— 觀眾看得到「他要出手了」
  const full = mp >= CONFIG.MP_MAX * 0.95;
  ctx.fillStyle = dim;
  ctx.globalAlpha = 0.25;
  ctx.fillRect(x, sy + H + GAP_Y, W, 4);
  ctx.globalAlpha = 1;
  ctx.fillStyle = full ? themHot : them;
  ctx.fillRect(x, sy + H + GAP_Y, W * (mp / CONFIG.MP_MAX), 4);
}
