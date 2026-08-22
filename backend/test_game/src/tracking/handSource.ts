/**
 * MediaPipe hand tracking source.
 *
 * Runs vision at CONFIG.CV_HZ and only publishes the latest result so the
 * 60Hz game loop never waits on computer vision work.
 */
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { CONFIG } from '../core/config';
import type { WandFrame } from '../core/types';
import type { TipSource } from './tracker';
import { OneEuro } from './oneEuro';

const WASM_ROOT = '/mediapipe';
const MODEL_PATH = '/mediapipe/hand_landmarker.task';

export function createHandSource(): TipSource {
  const filterX = new OneEuro(CONFIG.ONE_EURO_MIN_CUTOFF, CONFIG.ONE_EURO_BETA);
  const filterY = new OneEuro(CONFIG.ONE_EURO_MIN_CUTOFF, CONFIG.ONE_EURO_BETA);

  let video: HTMLVideoElement | null = null;
  let ownStream: MediaStream | null = null;
  let ownsVideo = false;
  let landmarker: HandLandmarker | null = null;
  let timer = 0;
  let disposed = false;
  let lostFrames: number = CONFIG.LOST_FRAMES;
  let latest: WandFrame = {
    tip: null,
    tipConfidence: 0,
    source: 'mediapipe',
    t: 0,
  };

  const publishLost = (now: number): void => {
    lostFrames++;
    // Brief occlusions should not break a stroke in half.
    if (lostFrames < CONFIG.LOST_FRAMES && latest.tip) {
      latest = { ...latest, tipConfidence: latest.tipConfidence * 0.82, t: now };
      return;
    }
    filterX.reset();
    filterY.reset();
    latest = { tip: null, tipConfidence: 0, source: 'mediapipe', t: now };
  };

  const sample = (): void => {
    if (disposed || !video || !landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    const now = performance.now();
    try {
      const result = landmarker.detectForVideo(video, now);
      const hand = result.landmarks[0];
      if (!hand) {
        publishLost(now);
        return;
      }

      const indexTip = hand[8];
      const indexBase = hand[5];
      const dx = indexTip.x - indexBase.x;
      const dy = indexTip.y - indexBase.y;
      const length = Math.hypot(dx, dy) || 1;
      const extendedX = indexTip.x + (dx / length) * CONFIG.TIP_EXTEND;
      const extendedY = indexTip.y + (dy / length) * CONFIG.TIP_EXTEND;

      // The PIP is mirrored, so mirror tracking coordinates as well. The tip
      // then follows the player's hand instead of moving in the opposite direction.
      const x = Math.min(1, Math.max(0, 1 - extendedX));
      const y = Math.min(1, Math.max(0, extendedY));
      const confidence = result.handedness[0]?.[0]?.score ?? 1;

      lostFrames = 0;
      latest = {
        tip: { x: filterX.filter(x, now), y: filterY.filter(y, now) },
        tipConfidence: confidence,
        source: 'mediapipe',
        t: now,
      };
    } catch (error) {
      console.warn('[tracker] MediaPipe frame failed', error);
      publishLost(now);
    }
  };

  return {
    kind: 'mediapipe',

    async start(givenVideo?: HTMLVideoElement): Promise<void> {
      disposed = false;
      video = givenVideo ?? document.createElement('video');
      ownsVideo = !givenVideo;
      video.muted = true;
      video.playsInline = true;

      if (!givenVideo) {
        ownStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: CONFIG.WEBCAM_W },
            height: { ideal: CONFIG.WEBCAM_H },
            facingMode: 'user',
          },
          audio: false,
        });
        video.srcObject = ownStream;
      }

      await video.play();
      // Keep the large MediaPipe runtime out of the initial gameplay bundle.
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
      const baseOptions = { modelAssetPath: MODEL_PATH, delegate: 'GPU' as const };
      try {
        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions,
          runningMode: 'VIDEO',
          numHands: 1,
        });
      } catch (gpuError) {
        console.warn('[tracker] MediaPipe GPU unavailable, using CPU', gpuError);
        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numHands: 1,
        });
      }

      sample();
      timer = window.setInterval(sample, 1000 / CONFIG.CV_HZ);
    },

    read(): WandFrame { return latest; },

    dispose(): void {
      disposed = true;
      if (timer) window.clearInterval(timer);
      timer = 0;
      landmarker?.close();
      landmarker = null;
      if (ownStream) for (const track of ownStream.getTracks()) track.stop();
      if (ownsVideo && video) video.srcObject = null;
      ownStream = null;
      video = null;
      ownsVideo = false;
      filterX.reset();
      filterY.reset();
    },
  };
}
