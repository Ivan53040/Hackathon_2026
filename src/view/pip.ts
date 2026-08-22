/**
 * Webcam 畫中畫。
 *
 * tracking 的影像來源可能被替換，因此這裡獨立取得 stream；拿不到權限時
 * 不顯示任何錯誤，避免 demo 被瀏覽器權限 UI 卡住。
 */
let panel: HTMLDivElement | null = null;
let stream: MediaStream | null = null;

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

  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.style.cssText = [
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

  root.append(video, label);
  parent.appendChild(root);
  panel = root;

  void navigator.mediaDevices.getUserMedia({ video: true }).then((media) => {
    if (panel !== root) {
      media.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = media;
    video.srcObject = media;
    root.style.display = 'block';
    return video.play();
  }).catch(() => {
    if (panel === root) disposeWebcamPip();
  });
}

export function disposeWebcamPip(): void {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  panel?.remove();
  panel = null;
}
