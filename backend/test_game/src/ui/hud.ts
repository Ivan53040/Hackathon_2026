/** Duel HUD: both players' HP/MP plus the spell costs and match timer. */
import { CONFIG } from '../core/config';
import { EV, on } from '../core/bus';
import type { MatchState } from '../core/types';

const MANA_FLASH_MS = 520;
let noManaAt = Number.NEGATIVE_INFINITY;
on(EV.NO_MANA, () => { noManaAt = performance.now(); });

const CAST_GUIDE_MS = 250;
const CAST_GUIDE_SPELLS = [
  { name: 'Fireball', gesture: 'Z', spell: 'attack' },
  { name: 'Rock', gesture: 'V', spell: 'rock' },
  { name: 'Spike', gesture: '∧', spell: 'spike' },
  { name: 'Mushroom', gesture: 'star', spell: 'mushroom' },
  { name: 'Wall', gesture: 'arc', spell: 'wall' },
] as const;
let castGuideStartedAt = Number.NEGATIVE_INFINITY;
let castGuideWasActive = false;

function tok(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function alertColor(gold: string, magic: string): string {
  const read = (value: string, offset: number) => Number.parseInt(value.slice(offset, offset + 2), 16);
  if (!/^#[0-9a-f]{6}$/i.test(gold) || !/^#[0-9a-f]{6}$/i.test(magic)) return magic;
  const r = Math.max(read(gold, 1), read(magic, 1));
  const g = Math.min(read(gold, 3), read(magic, 3));
  const b = Math.min(read(gold, 5), read(magic, 5));
  return `rgb(${r} ${g} ${b})`;
}

let palette: { voidC: string; me: string; meHot: string; them: string; themHot: string; parchment: string; alert: string; dim: string; mono: string } | null = null;
function getPalette() {
  if (palette) return palette;
  const me = tok('--me');
  const them = tok('--them');
  palette = {
    voidC: tok('--void'), me, meHot: tok('--me-hot'), them, themHot: tok('--them-hot'), parchment: tok('--parchment'),
    alert: alertColor(me, tok('--magic')), dim: tok('--dim'), mono: tok('--font-mono'),
  };
  return palette;
}

function drawCastGuide(ctx: CanvasRenderingContext2D, w: number, h: number, p: ReturnType<typeof getPalette>, elapsed: number): void {
  const progress = Math.max(0, Math.min(elapsed / CAST_GUIDE_MS, 1));
  const eased = 1 - Math.pow(1 - progress, 3);
  const margin = Math.min(Math.max(w * 0.02, 16), 24);
  const liveWidth = Math.min(w * 0.25, 200);
  const liveHeight = liveWidth * 0.75;
  const panelWidth = liveWidth;
  const panelRight = w - margin;
  const panelBottom = h - margin - liveHeight - 10;
  const panelTop = Math.min(82, panelBottom - CAST_GUIDE_SPELLS.length * 42);
  const panelHeight = Math.max(210, panelBottom - panelTop);
  const rowHeight = panelHeight / CAST_GUIDE_SPELLS.length;
  const panelX = panelRight - panelWidth;
  const panelY = Math.max(14, panelBottom - panelHeight);
  const maskLeft = w - (w * 0.5) * eased;

  ctx.save();
  ctx.globalAlpha = 0.66 * eased;
  ctx.fillStyle = p.voidC;
  ctx.fillRect(maskLeft, 0, w - maskLeft, h);
  ctx.globalAlpha = 0.8 * eased;
  ctx.fillStyle = p.me;
  ctx.fillRect(maskLeft, 0, 2, h);

  ctx.globalAlpha = Math.min(1, progress * 1.5);
  ctx.fillStyle = p.voidC;
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.strokeStyle = p.me;
  ctx.lineWidth = 1;
  ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelWidth - 1, panelHeight - 1);

  CAST_GUIDE_SPELLS.forEach(({ name, gesture, spell }, index) => {
    const rowTop = panelY + index * rowHeight;
    const centerY = rowTop + rowHeight / 2;
    if (index > 0) {
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = p.dim;
      ctx.beginPath();
      ctx.moveTo(panelX, rowTop);
      ctx.lineTo(panelRight, rowTop);
      ctx.stroke();
      ctx.globalAlpha = Math.min(1, progress * 1.5);
    }
    ctx.font = `700 ${Math.max(12, Math.min(18, rowHeight * 0.2))}px ${p.mono}`;
    ctx.fillStyle = p.parchment;
    ctx.fillText(name, panelX + 12, centerY - 3);
    ctx.font = `10px ${p.mono}`;
    ctx.fillStyle = p.dim;
    ctx.fillText(`MP ${CONFIG.COST[spell]}`, panelX + 12, centerY + 15);
    ctx.textAlign = 'right';
    ctx.font = `700 ${Math.max(22, Math.min(38, rowHeight * 0.38))}px ${p.mono}`;
    ctx.fillStyle = p.meHot;
    if (gesture === 'arc') {
      const left = panelRight - Math.min(48, rowHeight * 0.72) - 12;
      const right = panelRight - 12;
      const bend = Math.min(18, rowHeight * 0.28);
      ctx.strokeStyle = p.meHot;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(left, centerY);
      ctx.quadraticCurveTo((left + right) / 2, centerY - bend, right, centerY);
      ctx.stroke();
    } else if (gesture === 'star') {
      const centerX = panelRight - Math.min(28, rowHeight * 0.42) - 12;
      const outerRadius = Math.min(18, rowHeight * 0.28);
      const points = [
        [0, -1], [1, 0.92], [-1, -0.34], [1, -0.34], [-1, 0.92], [0, -1],
      ] as const;
      ctx.strokeStyle = p.meHot;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      points.forEach(([x, y], point) => {
        const px = centerX + x * outerRadius;
        const py = centerY + y * outerRadius;
        if (point === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    } else {
      ctx.fillText(gesture, panelRight - 12, centerY + 12);
    }
    ctx.textAlign = 'left';
  });
  ctx.restore();
}

function drawPanel(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  hp: number,
  maxHp: number,
  mp: number,
  accent: string,
  accentHot: string,
  dim: string,
  mono: string,
  flash: boolean,
  hidden = false,
): void {
  const cells = maxHp;
  const cw = 16, ch = 10, gap = 3;
  const width = cells * (cw + gap) - gap;
  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = tok('--void');
  ctx.fillRect(x - 12, y - 22, width + 24, 64);
  ctx.globalAlpha = 1;
  ctx.font = `700 12px ${mono}`;
  ctx.fillStyle = accentHot;
  ctx.fillText(label, x, y - 7);

  if (hidden) {
    ctx.fillStyle = dim;
    ctx.fillText('HP  ???', x, y + 8);
    ctx.fillText('MP  ???', x, y + 25);
    ctx.restore();
    return;
  }

  ctx.font = `10px ${mono}`;
  ctx.fillStyle = dim;
  ctx.fillText(`HP ${hp} / ${maxHp}`, x + width + 9, y + 8);
  ctx.fillText(`MP ${Math.round(mp)} / ${CONFIG.MP_MAX}`, x + width + 9, y + 25);

  for (let i = 0; i < cells; i++) {
    ctx.fillStyle = i < hp ? accent : dim;
    ctx.globalAlpha = i < hp ? 1 : 0.24;
    ctx.fillRect(x + i * (cw + gap), y, cw, ch);
  }
  ctx.globalAlpha = 0.24;
  ctx.fillStyle = dim;
  ctx.fillRect(x, y + ch + 6, width, 6);
  ctx.globalAlpha = 1;
  ctx.fillStyle = flash ? palette!.alert : mp >= 2 ? accentHot : accent;
  ctx.fillRect(x, y + ch + 6, width * Math.max(0, Math.min(mp / CONFIG.MP_MAX, 1)), 6);
  ctx.restore();
}

export function drawHud(ctx: CanvasRenderingContext2D, s: MatchState): void {
  const w = innerWidth, h = innerHeight;
  const p = getPalette();
  if (s.me.casting && !castGuideWasActive) castGuideStartedAt = performance.now();
  castGuideWasActive = s.me.casting;
  const flashAge = performance.now() - noManaAt;
  const flash = flashAge < MANA_FLASH_MS && Math.floor(flashAge / 70) % 2 === 0;

  drawPanel(ctx, 'YOU', 28, h - 84, s.me.hp, s.me.maxHp, s.me.mp, p.me, p.meHot, p.dim, p.mono, flash);
  drawPanel(
    ctx, 'OPPONENT', Math.max(28, w - (s.them.maxHp > CONFIG.HP_MAX ? 360 : 304)), 28, s.them.hp, s.them.maxHp, s.them.mp,
    p.them, p.themHot, p.dim, p.mono, false, !s.canSeeThemStats,
  );

  ctx.save();
  ctx.font = `600 13px ${p.mono}`;
  ctx.fillStyle = p.dim;
  ctx.fillText(`1 Fireball [Z]   2 Rock [V]   3 Spike [∧]   4 Mushroom [☆]   5 Wall [⌒]`, 28, h - 28);
  ctx.textAlign = 'center';
  const minutes = Math.floor(s.timeLeft / 60), seconds = Math.floor(s.timeLeft % 60);
  ctx.fillText(`${minutes}:${String(seconds).padStart(2, '0')}`, w / 2, 34);
  ctx.restore();

  if (s.me.casting) drawCastGuide(ctx, w, h, p, performance.now() - castGuideStartedAt);
}
