/**
 * Webcam 畫中畫。
 *
 * tracking 的影像來源可能被替換，因此這裡獨立取得 stream；拿不到權限時
 * 不顯示任何錯誤，避免 demo 被瀏覽器權限 UI 卡住。
 */
let panel: HTMLDivElement | null = null;
let video: HTMLVideoElement | null = null;
let stream: MediaStream | null = null;
let watchdog = 0;
let lastGameFrame = Number.NEGATIVE_INFINITY;
let starting = false;
let blocked = false;
let session = 0;

const IDLE_STOP_MS = 750;

export function initWebcamPip(parent: HTMLElement): void {
  disposeWebcamPip();
  if (!navigator.mediaDevices?.getUserMedia) return;

  const root = document.createElement('div');
  root.setAttribute('aria-label', 'Live webcam preview');
  root.style.cssText = [
    'position:absolute',
    'right:clamp(1rem,2vw,1.5rem)',
    'bottom:clamp(1rem,2vw,1.5rem)',
    'width:min(25vw,12.5rem)',
    'aspect-ratio:4/3',
    'border:0.125rem solid var(--me)',
    'background:var(--void)',
    'overflow:hidden',
    'pointer-events:none',
    'z-index:3',
    'display:none',
  ].join(';');

  const feed = document.createElement('video');
  feed.autoplay = true;
  feed.muted = true;
  feed.playsInline = true;
  feed.style.cssText = [
    'width:100%',
    'height:100%',
    'object-fit:cover',
    'transform:scaleX(-1)',
  ].join(';');

  const label = document.createElement('span');
  label.textContent = 'LIVE';
  label.style.cssText = [
    'position:absolute',
    'left:0.5rem',
    'top:0.5rem',
    'padding:0.15em 0.45em',
    'background:var(--void-soft)',
    'color:var(--me-hot)',
    'font:700 0.7rem/1 ui-monospace,monospace',
    'letter-spacing:0.12em',
  ].join(';');

  root.append(feed, label);
  parent.appendChild(root);
  panel = root;
  video = feed;
  blocked = false;
  starting = false;
  watchdog = window.setInterval(stopWhenIdle, IDLE_STOP_MS);
}

/** renderView 每幀呼叫；第一次真正進 game 才向瀏覽器要相機。 */
export function touchWebcamPip(): void {
  lastGameFrame = performance.now();
  if (!panel || !video || stream || starting || blocked) return;
  starting = true;
  const target = panel;
  const feed = video;
  const requestSession = session;
  void navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }).then((media) => {
    if (session !== requestSession || panel !== target) {
      media.getTracks().forEach((track) => track.stop());
      return;
    }
    starting = false;
    if (performance.now() - lastGameFrame > IDLE_STOP_MS) {
      media.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = media;
    feed.srcObject = media;
    target.style.display = 'block';
    return feed.play();
  }).catch(() => {
    if (session !== requestSession || panel !== target) return;
    starting = false;
    blocked = true;       // 權限拒絕後不要每幀重開 prompt
    stopStream();
  });
}

function stopWhenIdle(): void {
  if (!stream && !starting) return;
  if (performance.now() - lastGameFrame <= IDLE_STOP_MS) return;
  pauseWebcamPip();
}

function stopStream(): void {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  if (video) video.srcObject = null;
  if (panel) panel.style.display = 'none';
}

/** 比賽結束的最後一幀立即關閉；保留 DOM，下一場可再次 touch 啟動。 */
export function pauseWebcamPip(): void {
  session++;              // 讓尚未完成的 getUserMedia / play callback 全部失效
  starting = false;
  lastGameFrame = Number.NEGATIVE_INFINITY;
  stopStream();
}

export function disposeWebcamPip(): void {
  pauseWebcamPip();
  clearInterval(watchdog);
  watchdog = 0;
  panel?.remove();
  panel = null;
  video = null;
  starting = false;
  blocked = false;
}
