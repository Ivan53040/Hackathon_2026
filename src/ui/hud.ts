/**
 * HUD　[Wesley]
 *
 * 只有三樣東西：你的 HP、對手的 HP、剩餘時間。
 * 加上左下符文小抄與 webcam PIP。
 *
 * webcam PIP 一定要留 —— 它是「這是真的」的唯一證據，judge 需要看到。
 */
import { CONFIG } from '../core/config';
import { EV, on } from '../core/bus';
import type { MatchState } from '../core/types';

const MANA_FLASH_MS = 520;
let noManaAt = Number.NEGATIVE_INFINITY;
on(EV.NO_MANA, () => { noManaAt = performance.now(); });

function tok(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** 警示紅由既有金色與紫色 token 的通道推導，不另造脫離色票的固定顏色。 */
function alertColor(gold: string, magic: string): string {
  const read = (value: string, offset: number) => Number.parseInt(value.slice(offset, offset + 2), 16);
  if (!/^#[0-9a-f]{6}$/i.test(gold) || !/^#[0-9a-f]{6}$/i.test(magic)) return magic;
  const r = Math.max(read(gold, 1), read(magic, 1));
  const g = Math.min(read(gold, 3), read(magic, 3));
  const b = Math.min(read(gold, 5), read(magic, 5));
  return `rgb(${r} ${g} ${b})`;
}

let palette: {
  voidC: string; me: string; meHot: string; manaAlert: string; dim: string; mono: string;
} | null = null;

function getPalette() {
  if (palette) return palette;
  const me = tok('--me');
  palette = {
    voidC: tok('--void'),
    me,
    meHot: tok('--me-hot'),
    manaAlert: alertColor(me, tok('--magic')),
    dim: tok('--dim'),
    mono: tok('--font-mono'),
  };
  return palette;
}

export function drawHud(ctx: CanvasRenderingContext2D, s: MatchState): void {
  const w = innerWidth, h = innerHeight;
  const { voidC, me, meHot, manaAlert, dim, mono } = getPalette();

  // ── 我的 HP：符文格子，左下 ──
  const cells = CONFIG.HP_MAX;
  const cw = 22, ch = 12, gap = 4;
  const x0 = 28, y0 = h - 92;

  // 深色底板把戰鬥資訊從場景拉出來；上緣金線仍然讓它屬於玩家這一側。
  ctx.save();
  ctx.globalAlpha = 0.78;
  ctx.fillStyle = voidC;
  ctx.fillRect(x0 - 12, y0 - 14, 354, 82);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = me;
  ctx.fillRect(x0 - 12, y0 - 14, 354, 2);
  ctx.restore();

  for (let i = 0; i < cells; i++) {
    ctx.fillStyle = i < s.me.hp ? me : dim;
    ctx.globalAlpha = i < s.me.hp ? 1 : 0.22;
    ctx.fillRect(x0 + i * (cw + gap), y0, cw, ch);
  }
  ctx.globalAlpha = 1;

  // ── 我的 MP：快滿時發亮，玩家才知道自己夠不夠蓋牆 ──
  const mpW = cells * (cw + gap) - gap;
  const full = s.me.mp >= CONFIG.COST.wall;
  const flashAge = performance.now() - noManaAt;
  const flashing = flashAge < MANA_FLASH_MS;
  const flashOn = flashing && Math.floor(flashAge / 70) % 2 === 0;
  ctx.fillStyle = dim;
  ctx.globalAlpha = 0.22;
  ctx.fillRect(x0, y0 + ch + 6, mpW, 8);
  ctx.globalAlpha = 1;
  ctx.fillStyle = flashOn ? manaAlert : full ? meHot : me;
  ctx.fillRect(x0, y0 + ch + 6, mpW * (s.me.mp / CONFIG.MP_MAX), 8);
  if (flashing) {
    ctx.globalAlpha = Math.max(0, 1 - flashAge / MANA_FLASH_MS);
    ctx.strokeStyle = manaAlert;
    ctx.lineWidth = 3;
    ctx.strokeRect(x0 - 3, y0 + ch + 3, mpW + 6, 14);
    ctx.globalAlpha = 1;
  }

  // 唯一站玩家那邊的例外：MP 精確值。不夠會施法失敗，玩家必須能算
  ctx.font = `12px ${mono}`;
  ctx.fillStyle = dim;
  ctx.fillText(`${Math.round(s.me.mp)} / ${CONFIG.MP_MAX}`, x0 + mpW + 12, y0 + ch + 15);

  // ── 符文小抄：兩個。第一局後可以淡掉，但觀眾每 3 秒換一個人在看 ──
  ctx.font = `600 15px ${mono}`;
  ctx.fillStyle = s.me.mp >= CONFIG.COST.attack ? me : dim;
  ctx.globalAlpha = s.me.mp >= CONFIG.COST.attack ? 1 : 0.35;
  ctx.fillText('△  ATTACK', x0, h - 34);
  ctx.fillStyle = s.me.mp >= CONFIG.COST.wall ? me : dim;
  ctx.globalAlpha = s.me.mp >= CONFIG.COST.wall ? 1 : 0.35;
  ctx.fillText('□  BUILD', x0 + 118, h - 34);
  ctx.globalAlpha = 1;

  // ── 時間：小、低對比。時限只是保險，不是主要玩法 ──
  ctx.font = `13px ${mono}`;
  ctx.fillStyle = dim;
  ctx.textAlign = 'center';
  const m = Math.floor(s.timeLeft / 60), sec = Math.floor(s.timeLeft % 60);
  ctx.fillText(`${m}:${String(sec).padStart(2, '0')}`, w / 2, 34);
  ctx.textAlign = 'left';
}
