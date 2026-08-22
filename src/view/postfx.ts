/**
 * 後製　[Wesley]
 *
 * 規格 frontend/PLAN.md §4.4：EffectComposer + UnrealBloomPass。
 * `CONFIG.BLOOM_STRENGTH` 從一開始就在 config 裡，但一直沒有東西讀它 —— 這個檔案就是那個東西。
 *
 * 夜戲裡 bloom 不是「加特效」，是**唯一**能讓火把、水晶杖、符文與投射物
 * 讀起來像「會發光的東西」而不是「亮色的形狀」的手段。沒有它，
 * 火把只是橘色的錐體。
 *
 * 沒有引入任何新套件：EffectComposer 一家都在 three 的 examples/jsm 底下，
 * 跟 actors.ts 既有的 GLTFLoader 走同一條路徑。
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CONFIG } from '../core/config';

// 半徑：光暈往外擴多遠。太大整個畫面會起霧，符文拖尾會糊掉。
const BLOOM_RADIUS = 0.42;
// 門檻：亮度超過這裡才會發光。環境光壓到 0.30 之後石材大約落在 0.25~0.45，
// 抓 0.62 才能只讓火焰核心、水晶與法術發光，而不是整場石頭一起亮。
// ⚠️ 這個值跟 romanArena.ts 的 hemisphere 是綁在一起的，改一個要回頭看另一個。
const BLOOM_THRESHOLD = 0.38;

let composer: EffectComposer | null = null;
let bloomPass: UnrealBloomPass | null = null;
let renderTarget: THREE.WebGLRenderTarget | null = null;

/**
 * EffectComposer 預設的 render target 沒有 MSAA，直接接上去會把 renderer 的
 * antialias 吃掉 —— 階梯與柱子的邊會立刻變鋸齒。所以自己開一個 4x multisample 的。
 * HalfFloatType：bloom 需要 1.0 以上的亮度資訊，8-bit 會先被夾掉才進 bloom。
 */
function createTarget(width: number, height: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
}

export function initPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): void {
  disposePostFx();

  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  renderTarget = createTarget(size.x, size.y);

  composer = new EffectComposer(renderer, renderTarget);
  /*
   * EffectComposer 會把傳進去的 target clone 一份當 ping-pong buffer。
   * 問題是 renderTarget2 只接 fullscreen quad 的輸出 —— MSAA 對一張全螢幕四邊形
   * 一點意義都沒有，但每一個 pass 寫進去時 GPU 還是要做一次 multisample resolve，
   * 而且解的是 2560×1600 的 RGBA16F。實測這一行省 14ms（39ms → 25ms）。
   * MSAA 只留在 rt1，也就是 RenderPass 真正畫幾何的那一張。
   */
  composer.renderTarget2.samples = 0;
  composer.renderTarget2.dispose();
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);

  composer.addPass(new RenderPass(scene, camera));

  /*
   * BLOOM_STRENGTH 設 0 的話直接不掛這個 pass —— 這是真正的關閉開關。
   * 把 strength 設 0 但仍然掛著是沒有用的：整條模糊鏈照跑，錢照付，只是結果乘 0。
   *
   * 實測代價（M3、1280×800 視窗、DPR 1.5、GPU timer query）：
   *   完全不用 composer      5.8ms   171fps
   *   composer 但關 bloom    7.8ms   128fps
   *   composer + bloom      16-18ms   56-63fps
   * 也就是說 bloom 自己吃掉約 10ms，比整個場景（5.8ms）還貴。
   * ⚠️ 別想用「把 bloom 跑在半解析度」省錢 —— 量過了，半解析度只省約 2ms，
   * 四分之一解析度跟全解析度沒有差別。UnrealBloomPass 的成本在固定的全屏 pass，
   * 不在模糊本身。要嘛開，要嘛關，沒有中間檔位。
   */
  if (CONFIG.BLOOM_STRENGTH > 0) {
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      CONFIG.BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD,
    );
    composer.addPass(bloomPass);
  }

  // OutputPass 一定要放最後：tone mapping 與 sRGB 轉換都在這裡做。
  // 渲染進 render target 時 three 會自動把材質層的 tone mapping 關掉，
  // 所以 ACES 只會被套一次，不會疊兩層。
  composer.addPass(new OutputPass());
}

export function resizePostFx(renderer: THREE.WebGLRenderer): void {
  if (!composer) return;
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  bloomPass?.setSize(size.x, size.y);
}

/** 有 composer 就用它畫並回傳 true；沒有的話呼叫端自己 renderer.render */
export function renderPostFx(): boolean {
  if (!composer) return false;
  composer.render();
  return true;
}

export function disposePostFx(): void {
  // EffectComposer.dispose() 會連同傳進去的 renderTarget 一起 dispose，
  // 這裡只要放掉參考就好，再 dispose 一次是多餘的。
  composer?.dispose();
  composer = null;
  bloomPass?.dispose();
  bloomPass = null;
  renderTarget = null;
}
