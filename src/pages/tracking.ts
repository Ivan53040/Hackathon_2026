/**
 * 校準關卡　[Wesley]
 *
 * iframe 裡是 Ivan 的 WandFrame lab —— 那是**除錯工具**，不是給玩家看的。
 * 它同時對玩家講十件事（錄影控制、event 契約、15 格 HUD…），只有三件跟玩家有關。
 *
 * lab 的 build 產物不在這個 repo，改不了它的原始碼。但 iframe 同源，
 * 所以父層可以注入樣式，把雜訊關掉、只留 `.stage-wrap`（相機 + 校準指引 + 筆畫）。
 *
 * ⚠️ 誰下指令是刻意分工的：
 *   `bridge.js` 只送 ready / frame / gesture，**不送「現在第幾步」** ——
 *   所以逐步校準指引只有 lab 自己知道，必須留給它。
 *   我們這塊面板只講 lab 講不了的事：符文的意思、整體進度、入口。
 *   兩邊都下指令 = 玩家不知道要聽誰的，這就是原本最亂的地方。
 *
 * 加 `?debug=1` 會跳過注入，Ivan 的完整 lab 原封不動回來。
 */
import { makeScreen, register, show } from './index';
import { clearExternalFrame, publishExternalFrame } from '../tracking/tracker';

type Shape = 'z' | 'arc';
type TrackingMessage = {
  source?: string;
  type?: string;
  frame?: { timestamp?: number; tip?: { x: number; y: number } | null; confidence?: number; tipConfidence?: number };
  shape?: Shape;
  confidence?: number;
};

let trackingFrame: HTMLIFrameElement | null = null;
let trackingLoaded = false;

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

/** 從 tokens.css 讀值。iframe 沒有我們的 tokens，只能把值算好帶過去 —— 
 *  來源仍然是同一份 token，改色票這裡會跟著變，沒有第二套真相。 */
function tok(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * 玩家模式。只做兩件事：關掉除錯介面、把舞台換成 RUNESPIRE 的顏色。
 * 留下來的 `.stage-wrap` 內含相機、筆尖框、逐步指引與筆畫軌跡 —— 玩家需要的全在裡面。
 * 下緣留 32vh 給我們自己的面板，所以舞台會往上坐。
 */
function playerModeCss(): string {
  const void_ = tok('--void'), struct = tok('--struct'), ash = tok('--ash');
  const parchment = tok('--parchment'), structLit = tok('--struct-lit');
  return `
    body { background: transparent !important; }
    .shell > header, .shell > .toolbar, .shell > .record-bar,
    .shell > aside.hud, .shell > footer { display: none !important; }
    /* #shape-test 與 #tip-state 的資訊我們自己講一次，不要兩份 */
    #shape-test, #tip-state { display: none !important; }
    /* 訓練步驟 chip（1 HOLD / 2 SLOW / 3 CIRCLE…）是調參用的；
       #calibration-progress 又把標題再講一次。兩個都是面板變高變擋的原因。 */
    #training-steps, #calibration-progress { display: none !important; }
    .shell {
      width: min(72rem, calc(100vw - 4rem)) !important;
      padding: 0 0 13rem !important;   /* 面板實測約 11rem，留一點呼吸就好 */
      min-height: 100vh; display: flex; flex-direction: column; justify-content: center;
    }
    /*
     * ⚠️ 舞台**必須**鎖 4:3。相機是 640×480，而 TIP ONLY 取樣框是用舞台座標
     * 定位的 DOM 元素，不是畫進影像裡的。舞台一旦比 4:3 寬，影像會左右留黑邊，
     * 框就會落在黑邊上 —— 筆伸不進去，校準永遠過不了。
     * 改這裡的比例之前先確認相機解析度。
     */
    .stage-wrap {
      height: min(62vh, 46rem) !important; min-height: 0 !important;
      aspect-ratio: 4 / 3 !important;
      width: auto !important;
      align-self: center !important;
      border-radius: 0 !important;
      border-color: ${struct} !important;
      background: ${void_} !important;
    }
    /*
     * 指引從「浮在臉上的 330px 窄卡」改成「貼齊底緣的整條欄」。
     * 內容砍成兩行之後高度大幅下降，擋住的只剩畫面最底一條 —— 那裡通常是桌面，
     * 不是筆尖所在。卡片浮在中間會擋掉你正要對準的東西。
     */
    .calibration-panel {
      left: 0 !important; right: 0 !important; bottom: 0 !important;
      width: auto !important; max-width: none !important;
      transform: none !important;
      gap: 2px !important;
      padding: .7rem 1rem !important;
      border: 0 !important;
      border-top: 1px solid ${struct} !important;
      border-radius: 0 !important;
      background: ${void_}f2 !important;
    }
    .calibration-panel strong { font-size: 15px !important; color: ${parchment} !important; }
    .calibration-panel span { font-size: 11px !important; color: ${structLit} !important; }
    .recalibrate {
      border-radius: 0 !important;
      border-color: ${ash} !important;
      background: ${void_} !important;
    }
  `;
}

/**
 * 叫 lab 重算 canvas 尺寸。
 *
 * ⚠️ 這一行是必要的，不是保險。lab **只在 window resize 時**依 `.stage-wrap`
 * 的當下寬高重設 canvas 的 backing store，純 CSS 改動不會觸發它。
 * 我們注入樣式改了舞台大小之後如果不叫它重算，backing store 會停在舊尺寸，
 * 於是：影像被非等比拉伸，而 TIP ONLY 取樣框（位置用 canvas 座標算、卻當成
 * CSS px 寫進 style.left）會整個飛到影像外面 —— 筆伸不進去，校準永遠過不了。
 *
 * 實測：不叫重算 backing/CSS 比例是 3.175，叫了之後回到正確的 2.00（= dpr）。
 */
function nudgeResize(frame: HTMLIFrameElement): void {
  try {
    frame.contentWindow?.dispatchEvent(new Event('resize'));
  } catch { /* 跨源就算了 */ }
}

/*
 * 一次不夠。lab 的 resize listener 不是在 load 當下掛好的（相機初始化之後才掛），
 * 太早送它收不到；而 canvas 也可能在相機第一次出圖時又被重設一次。
 * 所以送一串，成本是幾個 setTimeout，換「一定會校正到」。
 */
const NUDGE_DELAYS_MS = [0, 120, 400, 1000, 2000];
function nudgeResizeRepeatedly(frame: HTMLIFrameElement): void {
  for (const delay of NUDGE_DELAYS_MS) setTimeout(() => nudgeResize(frame), delay);
}

/** iframe 同源才注得進去；跨源會丟例外，包起來不要讓校準頁整個掛掉 */
function applyPlayerMode(frame: HTMLIFrameElement): void {
  if (DEBUG) return;
  try {
    const doc = frame.contentDocument;
    if (!doc) return;
    const style = doc.createElement('style');
    style.dataset.runespire = 'player-mode';
    style.textContent = playerModeCss();
    doc.head.appendChild(style);
    // 等一幀讓新樣式套用完，再叫它照新尺寸重算
    nudgeResizeRepeatedly(frame);
  } catch { /* 注不進去就維持 lab 原樣，至少還能校準 */ }
}

/*
 * 把 Shift 轉發進 iframe。
 *
 * ⚠️ bridge.js 是在 **iframe 自己的 window** 上聽 keydown/keyup 的。
 * 只要使用者點過父層的任何東西（我們的按鈕、面板、甚至空白處），焦點就在父層，
 * iframe 收不到鍵盤事件 —— 於是「按住 Shift 畫符文」永遠不會觸發，
 * 校準卡在畫手勢那一步過不去。
 *
 * 用轉發而不是 frame.focus()：focus 會被下一次點擊搶走，轉發不會。
 * 只轉 Shift，其他按鍵不碰，免得干擾 lab 自己的快捷鍵。
 */
function forwardShift(frame: HTMLIFrameElement): () => void {
  const relay = (event: KeyboardEvent): void => {
    if (event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') return;
    const win = frame.contentWindow;
    if (!win || event.target === win) return;
    try {
      win.dispatchEvent(new KeyboardEvent(event.type, {
        code: event.code, key: event.key, repeat: event.repeat, bubbles: true,
      }));
    } catch { /* 跨源就算了 */ }
  };
  addEventListener('keydown', relay, true);
  addEventListener('keyup', relay, true);
  return () => {
    removeEventListener('keydown', relay, true);
    removeEventListener('keyup', relay, true);
  };
}

export function buildTracking(root: HTMLElement, onEnter: (usePen: boolean) => void): void {
  const frame = document.createElement('iframe');
  frame.className = 'tracking-runtime parked';
  frame.title = 'Wand tracking calibration';
  frame.allow = 'camera';
  frame.addEventListener('load', () => applyPlayerMode(frame));
  const stopShiftRelay = forwardShift(frame);
  root.appendChild(frame);
  trackingFrame = frame;

  const el = makeScreen(root);
  el.classList.add('tracking-screen');
  /*
   * 面板刻意很少字。原本這裡有 kicker + 標題 + 一整句說明，
   * 跟舞台裡 lab 自己的逐步指引打架 —— 同一個畫面兩套教學。
   * 現在只留三樣：目前狀態一行、兩個符文的意思與進度、入口。
   *
   * 狀態那一行**只描述我們確定知道的事**，不下跟校準步驟有關的指令 ——
   * lab 在 Step 0 會叫你把筆移出畫面，我們若同時喊「把筆舉起來」就是互相矛盾。
   */
  el.innerHTML = `
    <section class="tracking-gate" aria-live="polite">
      <p class="tracking-status" data-status>Starting the camera…</p>
      <div class="tracking-runes">
        <span class="tracking-rune" data-shape="z">
          <b>Z</b>
          <i>Attack</i>
          <em data-state>not yet</em>
        </span>
        <span class="tracking-rune" data-shape="arc">
          <b>&#x2312;</b>
          <i>Build</i>
          <em data-state>not yet</em>
        </span>
      </div>
      <div class="tracking-actions">
        <button class="btn primary" data-enter disabled>Enter the duel</button>
        <button class="btn" data-mouse>Play with a mouse</button>
      </div>
      <p class="tracking-tip" data-tip>
        <span class="tracking-dot" data-dot></span><span data-tiptext>No pen tip yet</span>
      </p>
    </section>
  `;
  register('tracking', el);

  const status = el.querySelector<HTMLElement>('[data-status]')!;
  const enter = el.querySelector<HTMLButtonElement>('[data-enter]')!;
  const mouse = el.querySelector<HTMLButtonElement>('[data-mouse]')!;
  const tipRow = el.querySelector<HTMLElement>('[data-tip]')!;
  const tipText = el.querySelector<HTMLElement>('[data-tiptext]')!;
  const passed = new Set<Shape>();
  let ready = false;
  let tipLive = false;

  const park = (): void => { frame.classList.add('parked'); };

  /** 狀態一行由進度推導，永遠只講「還差什麼」 */
  function retell(): void {
    if (!ready) { status.textContent = 'Starting the camera…'; return; }
    if (passed.size === 0) { status.textContent = 'Finish the steps below, then hold Shift and draw a Z'; return; }
    if (passed.size === 1) {
      status.textContent = passed.has('z')
        ? 'Good. Now hold Shift and draw an arc'
        : 'Good. Now hold Shift and draw a Z';
      return;
    }
    status.textContent = 'Both runes recognised — you are ready.';
  }

  /** 筆尖在不在。中性描述，不是指令 —— 見 tracking-tip 的樣式註解 */
  function showTip(live: boolean): void {
    if (live === tipLive) return;          // 每幀都進來，只在變化時碰 DOM
    tipLive = live;
    tipRow.classList.toggle('live', live);
    tipText.textContent = live ? 'Pen tip tracking' : 'No pen tip yet';
  }

  const onMessage = (event: MessageEvent<TrackingMessage>): void => {
    if (event.source !== frame.contentWindow || event.origin !== location.origin) return;
    const message = event.data;
    if (!message || message.source !== 'runespire-tracking') return;
    if (message.type === 'ready') { ready = true; retell(); nudgeResizeRepeatedly(frame); }
    if (message.type === 'frame' && message.frame) {
      publishExternalFrame(message.frame);
      showTip(Boolean(message.frame.tip));
    }
    if (message.type === 'gesture' && (message.shape === 'z' || message.shape === 'arc')) {
      passed.add(message.shape);
      const item = el.querySelector<HTMLElement>(`[data-shape="${message.shape}"]`);
      if (item) {
        item.classList.add('passed');
        item.querySelector('em')!.textContent = 'passed';
      }
      if (passed.size === 2) enter.disabled = false;
      retell();
    }
  };
  addEventListener('message', onMessage);

  enter.addEventListener('click', () => { stopShiftRelay(); park(); onEnter(true); });
  mouse.addEventListener('click', () => {
    stopShiftRelay();
    clearExternalFrame();
    park();
    onEnter(false);
  });
}

export function enterTracking(): void {
  if (!trackingFrame) return;
  if (!trackingLoaded) {
    trackingFrame.src = '/tracking/index.html';
    trackingLoaded = true;
  }
  trackingFrame.classList.remove('parked');
  show('tracking');
  // parked 時 iframe 只有 20rem×15rem，放開之後尺寸整個變 —— 同樣要叫它重算
  nudgeResizeRepeatedly(trackingFrame);
}
