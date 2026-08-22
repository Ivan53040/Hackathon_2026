/**
 * 對手 · 遮蔽物 · 投射物　[Wesley]
 *
 * 第一人稱下畫面上唯一會演戲的角色就是對手。
 * 投射物的尺度曲線決定這個遊戲好不好玩 —— 前 70% 慢慢變大，最後 30% 暴衝。
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config';
import { LANE_WIDTH } from './camera';
import { GAP } from './arena';
import type { MatchState } from '../core/types';

const toWorldX = (x: number) => (x - 0.5) * LANE_WIDTH;

function tok(name: string, fallback: string): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v || fallback).getHex();
}

export class Actors {
  private opponent!: THREE.Mesh;
  private sigil!: THREE.Mesh;
  private coverPool: THREE.Mesh[] = [];
  private projPool: THREE.Sprite[] = [];

  constructor(private scene: THREE.Scene) {
    this.buildOpponent();
    this.buildPools();
  }

  private buildOpponent(): void {
    // TODO [Wesley]：素材到了換成 sprite billboard，讀 public/anim/manifest.json
    this.opponent = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 2.0, 0.45),
      new THREE.MeshStandardMaterial({ color: tok('--them', '#1F86AC'), roughness: 0.6 }),
    );
    this.opponent.position.set(0, 0.9, -GAP + 1);
    this.scene.add(this.opponent);

    // 起手光暈：對手唯一的預警，玩家看到它才知道要閃
    this.sigil = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 32),
      new THREE.MeshBasicMaterial({ color: tok('--them', '#1F86AC'), transparent: true, opacity: 0 }),
    );
    this.sigil.rotation.x = -Math.PI / 2;
    this.scene.add(this.sigil);
  }

  private buildPools(): void {
    // 每幀熱路徑不准配置物件 —— 全部先開好，用 visible 開關
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 1.3, 0.5),
        new THREE.MeshStandardMaterial({ color: tok('--struct-lit', '#7FA3DC'), roughness: 0.8 }),
      );
      m.visible = false;
      this.scene.add(m);
      this.coverPool.push(m);
    }
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ color: tok('--spell-core', '#E6F2FF'), transparent: true, depthWrite: false }),
      );
      s.visible = false;
      this.scene.add(s);
      this.projPool.push(s);
    }
  }

  update(s: MatchState, dt: number): void {
    // ── 對手 ──
    this.opponent.position.x = toWorldX(s.them.x);
    this.opponent.visible = s.them.hp > 0;
    const m = this.opponent.material as THREE.MeshStandardMaterial;
    m.emissive.setHex(s.them.casting ? tok('--them', '#1F86AC') : 0x000000);
    m.emissiveIntensity = s.them.casting ? s.them.castProgress * 0.8 : 0;

    this.sigil.position.set(this.opponent.position.x, 0.03, this.opponent.position.z);
    const sm = this.sigil.material as THREE.MeshBasicMaterial;
    sm.opacity = s.them.casting ? 0.35 + s.them.castProgress * 0.5 : 0;
    const k = 1 + s.them.castProgress * (CONFIG.SIGIL_MAX_R - 1);
    this.sigil.scale.setScalar(k);

    // ── 遮蔽物 ──
    this.coverPool.forEach((mesh, i) => {
      const c = s.covers[i];
      if (!c) { mesh.visible = false; return; }
      mesh.visible = true;
      mesh.position.set(toWorldX(c.x), 0.65, c.side === 'me' ? -2.5 : -GAP + 2.5);
      const mm = mesh.material as THREE.MeshStandardMaterial;
      // 耐久剩 1 → 半透明。玩家要看得出「快破了」
      mm.transparent = c.hp < CONFIG.COVER_HP;
      mm.opacity = c.hp < CONFIG.COVER_HP ? 0.55 : 1;
      mm.color.setHex(tok(c.side === 'me' ? '--me' : '--them', '#F5C542'));
    });

    // ── 投射物：朝相機飛 ──
    this.projPool.forEach((spr, i) => {
      const p = s.projectiles[i];
      if (!p) { spr.visible = false; return; }
      spr.visible = true;
      const toward = p.owner === 'them';
      const t = Math.min(Math.max(p.progress, 0), 1);
      // 朝你飛的才做壓迫感曲線；你打出去的只要單純變小
      const z = toward ? -GAP + t * (GAP - 0.6) : -t * (GAP - 0.6);
      spr.position.set(
        THREE.MathUtils.lerp(toWorldX(p.fromX), toWorldX(p.toX), t),
        1.35,
        z,
      );
      const scale = toward
        ? 0.22 + Math.pow(t, CONFIG.PROJ_SCALE_POW) * 1.9   // ★ 前慢後爆
        : 0.35 * (1 - t * 0.6);
      spr.scale.setScalar(scale);
      (spr.material as THREE.SpriteMaterial).color.setHex(
        tok(p.owner === 'me' ? '--me' : '--them-hot', '#3CC6FF'),
      );
    });

    void dt;
  }
}
