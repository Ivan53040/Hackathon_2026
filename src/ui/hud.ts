/**
 * HUD　[Wesley]
 *
 * 只有三樣東西：你的 HP、對手的 HP、剩餘時間。
 * 加上左下符文小抄與 webcam PIP。
 *
 * webcam PIP 一定要留 —— 它是「這是真的」的唯一證據，judge 需要看到。
 */
import { CONFIG } from '../core/config';
import type { MatchState } from '../core/types';

function tok(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function drawHud(ctx: CanvasRenderingContext2D, s: MatchState): void {
  const w = innerWidth, h = innerHeight;
  const me = tok('--me', '#D4AF37');
  const meHot = tok('--me-hot', '#FFEFC2');
  const dim = tok('--dim', '#7C88AB');
  const mono = tok('--font-mono', 'monospace');

  // ── 我的 HP：符文格子，左下 ──
  const cells = CONFIG.HP_MAX;
  const cw = 22, ch = 12, gap = 4;
  const x0 = 28, y0 = h - 92;
  for (let i = 0; i < cells; i++) {
    ctx.fillStyle = i < s.me.hp ? me : 'rgba(124,136,171,.22)';
    ctx.fillRect(x0 + i * (cw + gap), y0, cw, ch);
  }

  // ── 我的 MP：快滿時發亮，玩家才知道自己夠不夠蓋牆 ──
  const mpW = cells * (cw + gap) - gap;
  const full = s.me.mp >= CONFIG.COST.wall;
  ctx.fillStyle = 'rgba(124,136,171,.22)';
  ctx.fillRect(x0, y0 + ch + 6, mpW, 8);
  ctx.fillStyle = full ? meHot : me;
  ctx.fillRect(x0, y0 + ch + 6, mpW * (s.me.mp / CONFIG.MP_MAX), 8);

  // 唯一站玩家那邊的例外：MP 精確值。不夠會施法失敗，玩家必須能算
  ctx.font = `12px ${mono}`;
  ctx.fillStyle = dim;
  ctx.fillText(`${Math.round(s.me.mp)} / ${CONFIG.MP_MAX}`, x0 + mpW + 12, y0 + ch + 15);

  // ── 符文小抄：兩個。第一局後可以淡掉，但觀眾每 3 秒換一個人在看 ──
  ctx.font = `600 15px ${mono}`;
  ctx.fillStyle = s.me.mp >= CONFIG.COST.attack ? me : 'rgba(124,136,171,.35)';
  ctx.fillText('△  ATTACK', x0, h - 34);
  ctx.fillStyle = s.me.mp >= CONFIG.COST.wall ? me : 'rgba(124,136,171,.35)';
  ctx.fillText('□  BUILD', x0 + 118, h - 34);

  // ── 時間：小、低對比。時限只是保險，不是主要玩法 ──
  ctx.font = `13px ${mono}`;
  ctx.fillStyle = dim;
  ctx.textAlign = 'center';
  const m = Math.floor(s.timeLeft / 60), sec = Math.floor(s.timeLeft % 60);
  ctx.fillText(`${m}:${String(sec).padStart(2, '0')}`, w / 2, 34);
  ctx.textAlign = 'left';
}
