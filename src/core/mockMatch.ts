/**
 * 假的對戰狀態　[暫時用，H+? 之後刪掉]
 *
 * 存在的唯一理由：讓 view/ 不用等 match/ 寫完就能開發。
 * 網址加 ?mock=1 就會用這個，對手會自己走動、蓋牆、開火。
 *
 * Bill 的 match/ 完成後，把網址的 ?mock=1 拿掉即可。這個檔案最後要刪。
 */
import { CONFIG } from './config';
import { EV, emit } from './bus';
import type { MatchState } from './types';

let t = 0;
let nextFire = 1.2;
let pid = 1;
let cid = 1;
let s: MatchState;

reset();

function reset(): void {
  s = {
    me:   { id: 'me',   x: 0.5, hp: CONFIG.HP_MAX, mp: CONFIG.MP_MAX, casting: false, castProgress: 0 },
    them: { id: 'them', x: 0.5, hp: CONFIG.HP_MAX, mp: CONFIG.MP_MAX, casting: false, castProgress: 0 },
    covers: [], projectiles: [], canSeeThemStats: true,
    timeLeft: CONFIG.MATCH_TIME_S, winner: null,
  };
}

export function tickMock(dt: number, myX: number): MatchState {
  t += dt;
  s.me.x = myX;
  const wanderX = 0.5 + Math.sin(t * 0.7) * 0.32;
  const aim = nextFire < 0.9 ? Math.min(1, Math.max(0, 1 - nextFire / 0.9)) : 0;
  const aimEase = aim * aim * (3 - 2 * aim);
  // 起手時平順走到玩家同一條 lane；正式 bot 也遵守相同直射規則。
  s.them.x = wanderX + (myX - wanderX) * aimEase;
  s.them.castProgress = aim;
  s.them.casting = aim > 0;
  s.timeLeft = Math.max(0, CONFIG.MATCH_TIME_S - t);

  // 對手週期性開火，讓你可以調投射物的尺度曲線
  nextFire -= dt;
  if (nextFire <= 0) {
    nextFire = 2.4;
    // Mock 也遵守正式規則：敵方投射物只沿自己的 lane 直射。
    s.projectiles.push({ id: pid++, owner: 'them', fromX: s.them.x, toX: s.them.x, progress: 0 });
    emit(EV.SPELL_FIRED, { owner: 'them' });
  }

  // 每 9 秒兩邊各蓋一面牆，讓你可以調遮蔽物與 ??? 的視覺
  if (s.covers.length === 0 && t > 4) {
    s.covers.push({ id: cid++, side: 'me',   x: 0.38, hp: CONFIG.COVER_HP, bornAt: Date.now() });
    s.covers.push({ id: cid++, side: 'them', x: 0.60, hp: CONFIG.COVER_HP, bornAt: Date.now() });
  }
  s.canSeeThemStats = !s.covers.some(
    (c) => c.side === 'them' && Math.abs(c.x - s.them.x) < CONFIG.COVER_HIDE_W,
  );

  for (const p of s.projectiles) p.progress += dt * 1000 / CONFIG.PROJ_MS;
  const landed = s.projectiles.filter((p) => p.progress >= 1);
  for (const p of landed) {
    const hit = Math.abs(s.me.x - p.toX) < CONFIG.HIT_WIDTH;
    if (hit) { s.me.hp = Math.max(0, s.me.hp - CONFIG.DMG_ATTACK); emit(EV.SPELL_HIT, { target: 'me' }); }
    else emit(EV.NEAR_MISS, { side: p.toX < s.me.x ? 'left' : 'right' });
  }
  s.projectiles = s.projectiles.filter((p) => p.progress < 1);

  if (s.me.hp <= 0) { s.me.hp = CONFIG.HP_MAX; }   // 假狀態不要真的結束
  return s;
}
