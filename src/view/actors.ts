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
  private opponent!: THREE.Group;
  private crystal!: THREE.Mesh;
  private sprite: THREE.Mesh | null = null;   // 有素材就用它，沒有就退回幾何造型
  private t = 0;
  private sigil!: THREE.Mesh;
  private coverPool: THREE.Mesh[] = [];
  private projPool: THREE.Sprite[] = [];

  constructor(private scene: THREE.Scene) {
    this.buildOpponent();
    this.buildPools();
  }

  private buildOpponent(): void {
    // 用基本幾何堆出一個看得懂的法師剪影。
    // 素材（或 GLB）到了就整組換掉 —— 但剪影對了，即使沒貼圖也讀得懂。
    const robe = new THREE.MeshStandardMaterial({ color: tok('--them', '#1E7FB8'), roughness: 0.75 });
    const gold = new THREE.MeshStandardMaterial({ color: tok('--me', '#D4AF37'), roughness: 0.4, metalness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0B1226, roughness: 1 });

    const g = new THREE.Group();

    // 長袍：下寬上窄的梯形，剪影的主體
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.62, 1.5, 8), robe);
    body.position.y = 0.75;
    g.add(body);
    // 金色飾邊
    const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.63, 0.64, 0.09, 8), gold);
    hem.position.y = 0.06;
    g.add(hem);
    // 肩：讓長袍與頭之間有過渡，不然像一根柱子頂著球
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 8), robe);
    shoulder.scale.set(1, 0.55, 0.9);
    shoulder.position.y = 1.5;
    g.add(shoulder);
    // 頭：整顆藏進帽簷底下的陰影，只露一點點
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), dark);
    head.position.y = 1.68;
    g.add(head);
    // 尖帽 —— 剪影最關鍵的一塊，一眼認出是法師。帽簷、環、尖頂三段要接在一起
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 14), robe);
    brim.position.y = 1.80;
    g.add(brim);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.03, 6, 18), gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.85;
    g.add(ring);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.22, 14), robe);
    crown.position.y = 1.94;
    g.add(crown);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.62, 14), robe);
    cone.position.y = 2.36;
    g.add(cone);
    // 法杖 + 菱形水晶
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 6), new THREE.MeshStandardMaterial({ color: 0x6B4A2A, roughness: 1 }));
    staff.position.set(0.6, 0.95, 0.12);
    g.add(staff);
    this.crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16),
      new THREE.MeshBasicMaterial({ color: tok('--them-hot', '#3CC6FF') }),
    );
    this.crystal.position.set(0.6, 1.98, 0.12);
    g.add(this.crystal);

    g.position.set(0, 0, -GAP + 1);
    this.scene.add(g);
    this.opponent = g;
    this.tryLoadSprite();
  }

  /**
   * 對手素材。第一人稱下你永遠只從正面看對手 ——
   * 所以 billboard sprite 比 3D 網格更好：更清晰、更小、而且就是概念圖本人。
   * 載不到就靜靜地退回幾何造型，遊戲照樣能跑。
   */
  private tryLoadSprite(): void {
    new THREE.TextureLoader().load(
      '/anim/wizard.png',
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const h = 2.9;
        const w = h * (tex.image.width / tex.image.height);
        this.sprite = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }),
        );
        this.sprite.position.set(0, h / 2 - 0.05, -GAP + 1);
        this.scene.add(this.sprite);
        this.opponent.visible = false;          // 幾何造型退場
      },
      undefined,
      () => { /* 沒有素材就用幾何造型，不是錯誤 */ },
    );

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
    this.t += dt;
    const wx = toWorldX(s.them.x);
    const bob = Math.sin(this.t * 1.6) * 0.035;   // idle 呼吸，靜止的角色看起來像當機

    if (this.sprite) {
      const h = (this.sprite.geometry as THREE.PlaneGeometry).parameters.height;
      this.sprite.position.set(wx, h / 2 - 0.05 + bob, -GAP + 1);
      this.sprite.visible = s.them.hp > 0;
      const sm = this.sprite.material as THREE.MeshBasicMaterial;
      // 起手 → 整個人染上冷光。這是玩家唯一的預警
      sm.color.setHex(0xffffff);
      if (s.them.casting) sm.color.lerp(new THREE.Color(tok('--them-hot', '#3CC6FF')), 0.25 + s.them.castProgress * 0.4);
      this.opponent.visible = false;
    } else {
      this.opponent.position.x = wx;
      this.opponent.position.y = bob;
      this.opponent.visible = s.them.hp > 0;
    }
    // 起手時杖頂水晶亮起（幾何造型用）
    const cm = this.crystal.material as THREE.MeshBasicMaterial;
    const glow = s.them.casting ? 0.4 + s.them.castProgress * 0.6 : 0.35 + Math.sin(this.t * 2.2) * 0.08;
    cm.color.setHex(tok('--them-hot', '#3CC6FF')).multiplyScalar(glow * 1.6);
    this.crystal.scale.setScalar(s.them.casting ? 1 + s.them.castProgress * 0.5 : 1);
    this.crystal.rotation.y = this.t * 0.9;

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
      // 耐久剩 1 → 半透明 + 微微抖。玩家要看得出「快破了」
      const cracked = c.hp < CONFIG.COVER_HP;
      mm.transparent = cracked;
      mm.opacity = cracked ? 0.5 : 1;
      mesh.rotation.z = cracked ? Math.sin(this.t * 22) * 0.012 : 0;
      mm.color.setHex(tok(c.side === 'me' ? '--me' : '--them', '#D4AF37'));
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

  }
}
