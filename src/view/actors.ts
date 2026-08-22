/**
 * 對手 · 遮蔽物 · 投射物　[Wesley]
 *
 * 第一人稱下畫面上唯一會演戲的角色就是對手。
 * 投射物的尺度曲線決定這個遊戲好不好玩 —— 前 70% 慢慢變大，最後 30% 暴衝。
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config';
import { EV, on } from '../core/bus';
import { LANE_WIDTH } from './camera';
import { GAP } from './arena';
import type { MatchState } from '../core/types';
import type { CoverBuilt, CoverHit } from '../match/events';

const BUILD_S = 0.2;
const BUILD_SLOTS = 8;
const DEBRIS_COUNT = 48;
const DEBRIS_LIFE_S = 0.55;

const toWorldX = (x: number) => (x - 0.5) * LANE_WIDTH;

function tok(name: string): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v).getHex();
}

type Pose = 'idle' | 'charge' | 'hit';

export class Actors {
  private opponent!: THREE.Group;
  private crystal!: THREE.Mesh;
  private sprite: THREE.Mesh | null = null;   // 有素材就用它，沒有就退回幾何造型
  private poses: Partial<Record<Pose, THREE.Texture>> = {};
  private pose: Pose = 'idle';
  private hitUntil = 0;
  private t = 0;
  private sigil!: THREE.Mesh;
  private coverPool: THREE.Mesh[] = [];
  private projPool: THREE.Sprite[] = [];
  private debrisPool: THREE.Mesh[] = [];
  private readonly debrisVx = new Float32Array(DEBRIS_COUNT);
  private readonly debrisVy = new Float32Array(DEBRIS_COUNT);
  private readonly debrisVz = new Float32Array(DEBRIS_COUNT);
  private readonly debrisAge = new Float32Array(DEBRIS_COUNT);
  private readonly buildIds = new Int32Array(BUILD_SLOTS);
  private readonly buildAge = new Float32Array(BUILD_SLOTS);
  private debrisCursor = 0;
  private readonly offs: (() => void)[];
  private readonly meColor = tok('--me');
  private readonly themColor = tok('--them');
  private readonly themHotColor = tok('--them-hot');
  private readonly spellCoreColor = tok('--spell-core');
  private readonly ashColor = tok('--ash');
  private readonly voidColor = tok('--void');
  private readonly themHot = new THREE.Color(this.themHotColor);

  constructor(private scene: THREE.Scene) {
    this.buildIds.fill(-1);
    this.buildAge.fill(BUILD_S);
    this.debrisAge.fill(DEBRIS_LIFE_S);
    this.buildOpponent();
    this.buildPools();
    this.offs = [
      on(EV.COVER_BUILT, (raw) => this.onCoverBuilt(raw as CoverBuilt)),
      on(EV.COVER_HIT, (raw) => this.onCoverHit(raw as CoverHit)),
    ];
  }

  private buildOpponent(): void {
    // 用基本幾何堆出一個看得懂的法師剪影。
    // 素材（或 GLB）到了就整組換掉 —— 但剪影對了，即使沒貼圖也讀得懂。
    const robe = new THREE.MeshStandardMaterial({ color: this.themColor, roughness: 0.75 });
    const gold = new THREE.MeshStandardMaterial({ color: this.meColor, roughness: 0.4, metalness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: this.voidColor, roughness: 1 });

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
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 6), new THREE.MeshStandardMaterial({ color: this.ashColor, roughness: 1 }));
    staff.position.set(0.6, 0.95, 0.12);
    g.add(staff);
    this.crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16),
      new THREE.MeshBasicMaterial({ color: this.themHotColor }),
    );
    this.crystal.position.set(0.6, 1.98, 0.12);
    g.add(this.crystal);

    g.position.set(0, 0, -GAP + 1);
    this.scene.add(g);
    this.opponent = g;
    this.sigil = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 32),
      new THREE.MeshBasicMaterial({ color: this.themColor, transparent: true, opacity: 0 }),
    );
    this.sigil.rotation.x = -Math.PI / 2;
    this.scene.add(this.sigil);
    this.tryLoadSprite();
  }

  /**
   * 對手素材。第一人稱下你永遠只從正面看對手 ——
   * 所以 billboard sprite 比 3D 網格更好：更清晰、更小、而且就是概念圖本人。
   *
   * 三張靜態姿勢（idle / charge / hit），動態由程式驅動（浮動、染色、傾斜）。
   * 只有 idle 是必要的；另外兩張載不到就用 idle 頂替。
   * 全部載不到就退回幾何造型 —— 遊戲照樣能跑。
   */
  private tryLoadSprite(): void {
    const loader = new THREE.TextureLoader();
    const load = (pose: Pose, file: string, required: boolean) =>
      loader.load(
        `/anim/${file}`,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          this.poses[pose] = tex;
          if (required) this.mountSprite(tex);
        },
        undefined,
        () => { /* 沒有這張就算了，不是錯誤 */ },
      );

    load('idle', 'wizard.png', true);
    load('charge', 'wizard_charge.png', false);
    load('hit', 'wizard_hit.png', false);
  }

  private mountSprite(tex: THREE.Texture): void {
    const h = 2.9;
    const w = h * (tex.image.width / tex.image.height);
    this.sprite = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }),
    );
    this.sprite.position.set(0, h / 2 - 0.05, -GAP + 1);
    this.scene.add(this.sprite);
    this.opponent.visible = false;          // 幾何造型退場

  }

  private buildPools(): void {
    // 每幀熱路徑不准配置物件 —— 全部先開好，用 visible 開關
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 1.3, 0.5),
        new THREE.MeshStandardMaterial({ color: tok('--struct-lit'), roughness: 0.8 }),
      );
      m.visible = false;
      this.scene.add(m);
      this.coverPool.push(m);
    }
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ color: this.spellCoreColor, transparent: true, depthWrite: false }),
      );
      s.visible = false;
      this.scene.add(s);
      this.projPool.push(s);
    }
    const debrisGeo = new THREE.BoxGeometry(0.13, 0.13, 0.13);
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const chip = new THREE.Mesh(
        debrisGeo,
        new THREE.MeshBasicMaterial({ color: this.meColor, transparent: true }),
      );
      chip.visible = false;
      this.scene.add(chip);
      this.debrisPool.push(chip);
    }
  }

  private onCoverBuilt(event: CoverBuilt): void {
    let slot = 0;
    for (let i = 0; i < BUILD_SLOTS; i++) {
      if (this.buildIds[i] === event.id || this.buildAge[i] >= BUILD_S) { slot = i; break; }
    }
    this.buildIds[slot] = event.id;
    this.buildAge[slot] = 0;
  }

  private onCoverHit(event: CoverHit): void {
    const amount = event.hpLeft === 0 ? 22 : 10;
    const force = event.hpLeft === 0 ? 2.2 : 1.25;
    const z = event.side === 'me' ? -2.5 : -GAP + 2.5;
    for (let n = 0; n < amount; n++) {
      const i = this.debrisCursor++ % DEBRIS_COUNT;
      const chip = this.debrisPool[i];
      chip.visible = true;
      chip.position.set(toWorldX(event.x), 0.72, z);
      chip.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      chip.scale.setScalar(event.hpLeft === 0 ? 1.15 : 0.85);
      const material = chip.material as THREE.MeshBasicMaterial;
      material.color.setHex(event.side === 'me' ? this.meColor : this.themColor);
      material.opacity = 1;
      const angle = Math.random() * Math.PI * 2;
      const radial = (0.45 + Math.random() * 0.8) * force;
      this.debrisVx[i] = Math.cos(angle) * radial;
      this.debrisVy[i] = (0.75 + Math.random() * 1.15) * force;
      this.debrisVz[i] = Math.sin(angle) * radial;
      this.debrisAge[i] = 0;
    }
  }

  private buildScale(id: number): number {
    for (let i = 0; i < BUILD_SLOTS; i++) {
      if (this.buildIds[i] !== id) continue;
      const t = Math.min(this.buildAge[i] / BUILD_S, 1);
      return 1 - Math.pow(1 - t, 3);
    }
    return 1;
  }

  /** 對手被打中。由 view/index.ts 在 EV.SPELL_HIT 時呼叫 */
  hit(): void { this.hitUntil = this.t + 0.3; }

  update(s: MatchState, dt: number): void {
    // ── 對手 ──
    this.t += dt;
    const wx = toWorldX(s.them.x);
    const bob = Math.sin(this.t * 1.6) * 0.035;   // idle 呼吸，靜止的角色看起來像當機

    if (this.sprite) {
      const sm = this.sprite.material as THREE.MeshBasicMaterial;

      // 姿勢優先序：受擊 > 起手 > 待機。受擊會壓住起手，因為被打斷比較重要
      const want: Pose = this.t < this.hitUntil ? 'hit' : s.them.casting ? 'charge' : 'idle';
      if (want !== this.pose) {
        const tex = this.poses[want] ?? this.poses.idle;
        if (tex && sm.map !== tex) { sm.map = tex; sm.needsUpdate = true; }
        this.pose = want;
      }

      const h = (this.sprite.geometry as THREE.PlaneGeometry).parameters.height;
      this.sprite.position.set(wx, h / 2 - 0.05 + bob, -GAP + 1);
      this.sprite.visible = s.them.hp > 0;

      // 沒有 charge 素材時，用染色代替 —— 起手的預警不能沒有
      sm.color.setHex(this.spellCoreColor);
      if (s.them.casting && !this.poses.charge) {
        sm.color.lerp(this.themHot, 0.25 + s.them.castProgress * 0.4);
      }
      // 沒有 hit 素材時，用向後傾代替
      this.sprite.rotation.z = this.t < this.hitUntil && !this.poses.hit
        ? -0.14 * ((this.hitUntil - this.t) / 0.3)
        : 0;

      this.opponent.visible = false;
    } else {
      this.opponent.position.x = wx;
      this.opponent.position.y = bob;
      this.opponent.visible = s.them.hp > 0;
    }
    // 起手時杖頂水晶亮起（幾何造型用）
    const cm = this.crystal.material as THREE.MeshBasicMaterial;
    const glow = s.them.casting ? 0.4 + s.them.castProgress * 0.6 : 0.35 + Math.sin(this.t * 2.2) * 0.08;
    cm.color.setHex(this.themHotColor).multiplyScalar(glow * 1.6);
    this.crystal.scale.setScalar(s.them.casting ? 1 + s.them.castProgress * 0.5 : 1);
    this.crystal.rotation.y = this.t * 0.9;

    this.sigil.position.set(wx, 0.03, -GAP + 1);
    const sm = this.sigil.material as THREE.MeshBasicMaterial;
    sm.opacity = s.them.casting ? 0.35 + s.them.castProgress * 0.5 : 0;
    const k = 1 + s.them.castProgress * (CONFIG.SIGIL_MAX_R - 1);
    this.sigil.scale.setScalar(k);

    // ── 遮蔽物 ──
    for (let i = 0; i < this.coverPool.length; i++) {
      const mesh = this.coverPool[i];
      const c = s.covers[i];
      if (!c) { mesh.visible = false; continue; }
      mesh.visible = true;
      const build = this.buildScale(c.id);
      mesh.scale.set(1, build, 1);
      mesh.position.set(toWorldX(c.x), 0.65 * build, c.side === 'me' ? -2.5 : -GAP + 2.5);
      const mm = mesh.material as THREE.MeshStandardMaterial;
      // 耐久剩 1 → 半透明 + 微微抖。玩家要看得出「快破了」
      const cracked = c.hp < CONFIG.COVER_HP;
      mm.transparent = cracked;
      mm.opacity = cracked ? 0.5 : 1;
      mesh.rotation.z = cracked ? Math.sin(this.t * 22) * 0.012 : 0;
      mm.color.setHex(c.side === 'me' ? this.meColor : this.themColor);
    }

    // ── 投射物：朝相機飛 ──
    for (let i = 0; i < this.projPool.length; i++) {
      const spr = this.projPool[i];
      const p = s.projectiles[i];
      if (!p) { spr.visible = false; continue; }
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
      (spr.material as THREE.SpriteMaterial).color.setHex(p.owner === 'me' ? this.meColor : this.themHotColor);
    }

    for (let i = 0; i < BUILD_SLOTS; i++) this.buildAge[i] += dt;
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      if (this.debrisAge[i] >= DEBRIS_LIFE_S) continue;
      const chip = this.debrisPool[i];
      this.debrisAge[i] += dt;
      chip.position.x += this.debrisVx[i] * dt;
      chip.position.y += this.debrisVy[i] * dt;
      chip.position.z += this.debrisVz[i] * dt;
      this.debrisVy[i] -= 4.8 * dt;
      chip.rotation.x += dt * 7;
      chip.rotation.y += dt * 5;
      const left = Math.max(0, 1 - this.debrisAge[i] / DEBRIS_LIFE_S);
      (chip.material as THREE.MeshBasicMaterial).opacity = left;
      if (left === 0) chip.visible = false;
    }
  }

  dispose(): void { this.offs.forEach((off) => off()); }
}
