/**
 * 對手 · 遮蔽物 · 投射物　[Wesley]
 *
 * 第一人稱下畫面上唯一會演戲的角色就是對手。
 * 投射物的尺度曲線決定這個遊戲好不好玩 —— 前 70% 慢慢變大，最後 30% 暴衝。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONFIG } from '../core/config';
import { EV, on } from '../core/bus';
import { LANE_WIDTH } from './camera';
import { GAP } from './arena';
import type { MatchState } from '../core/types';
import type { CoverBuilt, CoverHit, SpellFired } from '../match/events';

const COVER_HEIGHT = 1.6;
const BUILD_S = 0.2;
const BUILD_SLOTS = 8;
const DEBRIS_COUNT = 48;
const DEBRIS_LIFE_S = 0.55;
const ACTION_COLS = 8;
const ACTION_ROWS = 4;
const ACTION_FRAMES = ACTION_COLS * ACTION_ROWS;
// Atlas 的爆光在第 18–19 格，蓄力必須停在爆光之前，
// 否則「他要出手了」的預警會比實際出手早四分之一拍。
// 停在 15 而不是 17：舉杖過頂這個姿勢比 376px 的 tile 高 7 列，
// f16 / f17 的水晶尖端在生成當下就被格子切平了，f14 / f15 才是完整的。
// 收招會經過那兩格，但每格只有約 30ms，看不出來。
const ACTION_RELEASE_FRAME = 15;
const ACTION_RECOVER_S = 0.5;
// 側面跑步 atlas 已停用 —— 第一人稱只從正面看對手，換成側視會在每次起步時轉 90°。
// 移動改用連續量：帶符號的傾斜 + 踏步起伏，沒有任何影格切換。
const LEAN_MAX = 0.055;
const LEAN_SMOOTH = 9;
const STEP_RATE = 5.5;
const STEP_BOB = 0.055;
const IDLE_BOB = 0.035;

const toWorldX = (x: number) => (x - 0.5) * LANE_WIDTH;

/*
 * 對手 sprite 是 MeshBasicMaterial —— 這是刻意的（見 tryLoadSprite 的註解：
 * 正面 billboard 比網格清晰）。但「不吃光照」跟「沒有被場景調過色」是兩件事。
 * 之前每一幀都把 sprite 染成 --spell-core（接近純白），等於用 100% 貼圖亮度渲染 ——
 * 不管場上是正午還是半夜他都一樣亮，所以他讀起來像貼在場景上，不是站在場景裡。
 *
 * 這裡把 romanArena.ts 的打光比例算成一個乘數：主光 --spell-core 1.35、
 * 環境光 --struct-lit 0.30，混完再壓到 SPRITE_EXPOSURE。
 * sprite 保持不吃光，但顏色屬於這個夜晚。
 * ⚠️ romanArena.ts 的 hemisphere / sun 強度改了，這裡要跟著改。
 */
const SPRITE_KEY = 1.35;
const SPRITE_AMBIENT = 0.30;
const SPRITE_EXPOSURE = 0.62;

function nightGrade(): THREE.Color {
  return new THREE.Color(tok('--spell-core'))
    .lerp(new THREE.Color(tok('--struct-lit')), SPRITE_AMBIENT / (SPRITE_KEY + SPRITE_AMBIENT))
    .multiplyScalar(SPRITE_EXPOSURE);
}



function tok(name: string): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v).getHex();
}

type Pose = 'idle' | 'charge' | 'attack' | 'build' | 'hit';

export class Actors {
  private opponent!: THREE.Group;
  private crystal!: THREE.Mesh;
  private sprite: THREE.Mesh | null = null;   // 有素材就用它，沒有就退回幾何造型
  private poses: Partial<Record<Pose, THREE.Texture>> = {};
  private actionTexture: THREE.Texture | null = null;
  private actionFrame = -1;
  private wasOpponentCasting = false;
  private recovering = false;
  private recoverAge = 0;
  private pose: Pose = 'idle';
  private hitUntil = 0;
  private attackUntil = 0;
  private buildUntil = 0;
  private previousOpponentX = Number.NaN;
  private moveLean = 0;          // −1..1，帶符號且平滑；反向時經過 0，不會瞬間翻面
  private walkTime = 0;
  private t = 0;
  private sigil!: THREE.Mesh;
  private coverPool: THREE.Group[] = [];
  private projPool: THREE.Sprite[] = [];
  private projectileTexture: THREE.CanvasTexture | null = null;
  private debrisPool: THREE.Mesh[] = [];
  private readonly debrisVx = new Float32Array(DEBRIS_COUNT);
  private readonly debrisVy = new Float32Array(DEBRIS_COUNT);
  private readonly debrisVz = new Float32Array(DEBRIS_COUNT);
  private readonly debrisAge = new Float32Array(DEBRIS_COUNT);
  private readonly buildIds = new Int32Array(BUILD_SLOTS);
  private readonly buildAge = new Float32Array(BUILD_SLOTS);
  private debrisCursor = 0;
  private disposed = false;
  private readonly offs: (() => void)[];
  private readonly meColor = tok('--me');
  private readonly themColor = tok('--them');
  private readonly themHotColor = tok('--them-hot');
  private readonly spellCoreColor = tok('--spell-core');
  private readonly ashColor = tok('--ash');
  private readonly voidColor = tok('--void');
  private readonly themHot = new THREE.Color(this.themHotColor);
  private readonly spriteGrade = nightGrade();

  constructor(private scene: THREE.Scene) {
    this.buildIds.fill(-1);
    this.buildAge.fill(BUILD_S);
    this.debrisAge.fill(DEBRIS_LIFE_S);
    this.buildOpponent();
    this.buildPools();
    this.offs = [
      on(EV.COVER_BUILT, (raw) => this.onCoverBuilt(raw as CoverBuilt)),
      on(EV.COVER_HIT, (raw) => this.onCoverHit(raw as CoverHit)),
      on(EV.SPELL_FIRED, (raw) => {
        if ((raw as SpellFired).owner === 'them') this.attackUntil = this.t + 0.35;
      }),
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
   * Higgsfield 動作 atlas 會把起手、釋放與收招連成一段；idle / charge / hit
   * 靜態圖是載入失敗時的保底。只有 idle 是必要的。
   * 全部載不到就退回幾何造型 —— 遊戲照樣能跑。
   */
  private tryLoadSprite(): void {
    const loader = new THREE.TextureLoader();
    const load = (pose: Pose, file: string, required: boolean) =>
      loader.load(
        `/anim/${file}`,
        (tex) => {
          if (this.disposed) { tex.dispose(); return; }
          tex.colorSpace = THREE.SRGBColorSpace;
          this.poses[pose] = tex;
          if (required) this.mountSprite(tex);
          else if (this.sprite && this.pose === pose) this.applyPoseTexture(tex);
        },
        undefined,
        () => { /* 沒有這張就算了，不是錯誤 */ },
      );

    // 羅馬場景用新的決鬥姿勢；原素材保留給 ?scene=moon，不覆寫舊動畫資產。
    // ⚠️ 所有姿勢必須共用同一個畫布幾何：mountSprite 用 idle 的長寬比決定 sprite 平面，
    // 換一張比例不同的 idle 會把其餘姿勢整個拉寬，腳線也會跳。
    // 要換角色就六張一起換（含 action atlas），不要只換 idle。
    load('idle', 'wizard.png', true);
    load('charge', 'wizard_charge.png', false);
    load('attack', 'wizard_attack.png', false);
    load('build', 'wizard_build.png', false);
    load('hit', 'wizard_hit.png', false);
    loader.load(
      '/anim/wizard_action_atlas.png',
      (tex) => {
        if (this.disposed) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        // Atlas tile 沒有 padding；停用 mipmap 避免遠距離時混到隔壁影格。
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.repeat.set(1 / ACTION_COLS, 1 / ACTION_ROWS);
        this.actionTexture = tex;
      },
      undefined,
      () => { /* 靜態姿勢仍可完整遊玩 */ },
    );
  }

  private mountSprite(tex: THREE.Texture): void {
    const h = 2.9;
    const w = h * (tex.image.width / tex.image.height);
    this.sprite = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }),
    );
    this.sprite.position.set(0, h / 2 - 0.05, -GAP + 1);
    /*
     * 接地陰影。角色腳下沒有影子是業餘 3D 最明顯的破綻 —— 人會直接讀成「浮在空中」。
     *
     * 這裡不用地上貼一張橢圓的做法：相機在眼高 1.6 且視線水平（camera.ts 的硬規則），
     * 對手在 7.5 公尺外，地面的入射角只有 atan(1.54 / 7.5) ≈ 11.6°。
     * 貼在地上的橢圓在這個角度會被壓成一條線，看起來像地板髒了，不像影子。
     *
     * 改用場上已經有的 shadow map：sun 已經 castShadow，地面與看台都 receiveShadow，
     * 而 sprite 有 alphaTest 0.35 —— three 的 depth material 會沿用 map 與 alphaTest
     * （見 three 的 WebGLShadowMap.getDepthMaterial），所以投出來的是鏤空剪影，透視也對。
     *
     * ⚠️ 但目前這個影子在畫面上讀不出來，A/B 過：開關 castShadow 畫面沒有差別。
     * 原因是主光在 (-9, 14, 4)，位於對手（z = −7.5）的**前方**，影子整個往 −z 倒 ——
     * 從第一人稱看過去正好被他自己的 sprite 擋住。
     * 試過把 sun 移到 z = −6 讓影子往相機倒：影子是出來了，但整個後方平台會被
     * 後面的建築擋成一片暗，反而更糟，所以退回原值。
     * 這一行留著沒有壞處（相機側移時有用），但「腳下的接地陰影」還沒解決。
     * 真要解，要嘛給對手一盞專用的近頂光 + 自己的 shadow camera，
     * 要嘛把對手的平台改矮讓影子有地方落。兩個都不是五分鐘的事。
     */
    this.sprite.castShadow = true;
    this.scene.add(this.sprite);
    this.opponent.visible = false;          // 幾何造型退場
    this.applyPoseTexture(this.poses[this.pose] ?? tex);
  }

  private applyPoseTexture(tex: THREE.Texture): void {
    if (!this.sprite) return;
    const material = this.sprite.material as THREE.MeshBasicMaterial;
    if (material.map === tex) return;
    material.map = tex;
    material.needsUpdate = true;
  }

  /** Atlas 由左到右、由上到下；Three.js 的 UV 原點在左下。 */
  private applyActionFrame(rawFrame: number): void {
    if (!this.sprite || !this.actionTexture) return;
    const frame = Math.min(ACTION_FRAMES - 1, Math.max(0, rawFrame | 0));
    if (frame === this.actionFrame && (this.sprite.material as THREE.MeshBasicMaterial).map === this.actionTexture) return;
    this.actionFrame = frame;
    this.actionTexture.offset.set(
      (frame % ACTION_COLS) / ACTION_COLS,
      1 - (Math.floor(frame / ACTION_COLS) + 1) / ACTION_ROWS,
    );
    this.applyPoseTexture(this.actionTexture);
  }

  private buildPools(): void {
    // 每幀熱路徑不准配置物件 —— 全部先開好，用 visible 開關
    for (let i = 0; i < 8; i++) {
      const group = new THREE.Group();
      const fallback = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, COVER_HEIGHT, 0.5),
        new THREE.MeshStandardMaterial({ color: tok('--struct-lit'), roughness: 0.8 }),
      );
      group.add(fallback);
      group.visible = false;
      this.scene.add(group);
      this.coverPool.push(group);
    }
    this.loadCoverModel();
    const core = document.createElement('canvas');
    core.width = 64;
    core.height = 64;
    const coreCtx = core.getContext('2d')!;
    const base = new THREE.Color(this.spellCoreColor);
    const coreRgb = `${Math.round(base.r * 255)} ${Math.round(base.g * 255)} ${Math.round(base.b * 255)}`;
    const glow = coreCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
    glow.addColorStop(0, `rgb(${coreRgb} / 1)`);
    glow.addColorStop(0.24, `rgb(${coreRgb} / 0.95)`);
    glow.addColorStop(0.58, `rgb(${coreRgb} / 0.38)`);
    glow.addColorStop(1, `rgb(${coreRgb} / 0)`);
    coreCtx.fillStyle = glow;
    coreCtx.fillRect(0, 0, 64, 64);
    this.projectileTexture = new THREE.CanvasTexture(core);

    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.projectileTexture,
          color: this.spellCoreColor,
          transparent: true,
          depthWrite: false,
        }),
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

  private loadCoverModel(): void {
    new GLTFLoader().load('/models/rune_cover.glb', (gltf) => {
      if (this.disposed) {
        this.disposeObject(gltf.scene);
        return;
      }

      for (const group of this.coverPool) {
        // 移除載入期間顯示的單色 fallback，再放入 Blender 模型。
        for (const child of [...group.children]) {
          group.remove(child);
          this.disposeObject(child);
        }

        const model = gltf.scene.clone(true);
        model.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          node.castShadow = true;
          node.receiveShadow = true;
          // 每一面牆要能獨立進入「受損半透明」狀態，材質不可共用。
          node.material = Array.isArray(node.material)
            ? node.material.map((material) => material.clone())
            : node.material.clone();
        });
        group.add(model);
      }
    });
  }

  private disposeObject(root: THREE.Object3D): void {
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry.dispose();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) material.dispose();
    });
  }

  private onCoverBuilt(event: CoverBuilt): void {
    if (event.side === 'them') this.buildUntil = this.t + 0.35;
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
    const dx = Number.isFinite(this.previousOpponentX) ? s.them.x - this.previousOpponentX : 0;
    this.previousOpponentX = s.them.x;
    const moveSpeed = dt > 1e-4 ? dx / dt : 0;
    // 帶符號的目標值。反向時 lean 會經過 0 —— 傾斜先回正再倒向另一邊，
    // 中間沒有任何一格是跳的，這是「移動看起來連續」的關鍵。
    const leanTarget = Math.max(-1, Math.min(1, moveSpeed / CONFIG.MOVE_SPEED));
    this.moveLean += (leanTarget - this.moveLean) * Math.min(1, dt * LEAN_SMOOTH);
    const moveAmount = Math.abs(this.moveLean);
    if (moveAmount > 0.01) this.walkTime += dt * STEP_RATE * (0.6 + moveAmount * 0.4);
    const idleBob = Math.sin(this.t * 1.6) * IDLE_BOB;
    const stepBob = Math.abs(Math.sin(this.walkTime)) * STEP_BOB;
    const bob = idleBob * (1 - moveAmount) + stepBob * moveAmount;

    if (this.sprite) {
      const sm = this.sprite.material as THREE.MeshBasicMaterial;

      if (s.them.casting && !this.wasOpponentCasting) {
        this.recovering = false;
        this.recoverAge = 0;
      } else if (!s.them.casting && this.wasOpponentCasting) {
        // 施法結束不是立刻跳回 idle；接著播 follow-through + recovery。
        this.recovering = true;
        this.recoverAge = 0;
      }
      this.wasOpponentCasting = s.them.casting;

      // 動作優先序：受擊 > 連續施法 atlas > 靜態保底 > 待機。
      const isHit = this.t < this.hitUntil;
      if (isHit) {
        const tex = this.poses.hit ?? this.poses.idle;
        if (tex) this.applyPoseTexture(tex);
        this.pose = 'hit';
      } else if (this.actionTexture && s.them.casting) {
        this.applyActionFrame(Math.round(s.them.castProgress * ACTION_RELEASE_FRAME));
        this.pose = 'charge';
      } else if (this.actionTexture && this.recovering) {
        this.recoverAge += dt;
        const p = Math.min(1, this.recoverAge / ACTION_RECOVER_S);
        this.applyActionFrame(ACTION_RELEASE_FRAME + Math.round(p * (ACTION_FRAMES - 1 - ACTION_RELEASE_FRAME)));
        if (p >= 1) this.recovering = false;
        this.pose = 'charge';
      } else {
        const want: Pose = this.t < this.buildUntil ? 'build'
          : this.t < this.attackUntil ? 'attack'
            : s.them.casting ? 'charge' : 'idle';
        if (want !== this.pose || sm.map === this.actionTexture) {
          const tex = this.poses[want] ?? this.poses.idle;
          if (tex) this.applyPoseTexture(tex);
        }
        this.pose = want;
      }

      const h = (this.sprite.geometry as THREE.PlaneGeometry).parameters.height;
      this.sprite.position.set(wx, h / 2 - 0.05 + bob, -GAP + 1);
      // 素材是正面視角，鏡像會讓法杖瞬間換手 —— 尺度固定，行進方向只用傾斜表示。
      this.sprite.scale.set(1, 1, 1);
      this.sprite.visible = s.them.hp > 0;

      // 底色是「這個夜晚的光」，不是純白（見 nightGrade）。
      // 起手時再往 themHot 拉 —— 從壓暗的底色往上提，預警比之前更讀得出來。
      sm.color.copy(this.spriteGrade);
      if (s.them.casting && !this.actionTexture && !this.poses.charge) {
        sm.color.lerp(this.themHot, 0.25 + s.them.castProgress * 0.4);
      }
      // 沒有 hit 素材時，用向後傾代替
      const hitTilt = isHit && !this.poses.hit ? -0.14 * ((this.hitUntil - this.t) / 0.3) : 0;
      const actionWeight = s.them.casting || this.recovering ? 0.2 : 1;
      const moveTilt = -this.moveLean * LEAN_MAX * actionWeight;
      this.sprite.rotation.z = hitTilt + moveTilt;

      this.opponent.visible = false;
    } else {
      const hit = Math.max(0, (this.hitUntil - this.t) / 0.3);
      this.opponent.position.x = wx;
      this.opponent.position.y = bob;
      this.opponent.position.z = -GAP + 1 - hit * 0.18;
      this.opponent.rotation.z = -hit * 0.12 - this.moveLean * LEAN_MAX;
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
      mesh.position.set(
        toWorldX(c.x),
        COVER_HEIGHT * 0.5 * build,
        c.side === 'me' ? -2.5 : -GAP + 2.5,
      );
      // 耐久剩 1 → 半透明 + 微微抖。玩家要看得出「快破了」
      const cracked = c.hp < CONFIG.COVER_HP;
      const steadyPulse = 0.92 + Math.sin(this.t * 2.8 + i * 0.65) * 0.16;
      const damagedPulse = 0.48 + Math.abs(Math.sin(this.t * 13 + i)) * 0.42;
      mesh.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
          material.transparent = cracked;
          material.opacity = cracked ? 0.5 : 1;
          material.depthWrite = !cracked;
          if (material instanceof THREE.MeshStandardMaterial && material.emissive.getHex() !== 0) {
            const base = material.userData.coverEmission
              ?? (material.userData.coverEmission = material.emissiveIntensity);
            material.emissiveIntensity = base * (cracked ? damagedPulse : steadyPulse);
          }
        }
      });
      mesh.rotation.z = cracked ? Math.sin(this.t * 22) * 0.012 : 0;
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

  dispose(): void {
    this.disposed = true;
    this.offs.forEach((off) => off());
    for (const tex of Object.values(this.poses)) tex?.dispose();
    this.poses = {};
    this.actionTexture?.dispose();
    this.actionTexture = null;
    this.projectileTexture?.dispose();
    this.projectileTexture = null;
    for (const cover of this.coverPool) this.disposeObject(cover);
  }
}
