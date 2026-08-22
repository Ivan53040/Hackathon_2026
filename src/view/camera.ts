/**
 * 第一人稱相機　[Wesley]
 *
 * 相機就是「我」的身體。畫面上沒有你自己，所以你的一切感受都由相機承擔。
 * 三個硬規則：對手永遠在視線水平高度、FOV 55°、震動 ≤8px ≤0.25s。
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config';

const EYE_HEIGHT = 1.6;
const LANE_WIDTH = 6;      // x 從 0..1 對應到世界座標的橫向範圍

export class FpsCamera {
  readonly cam: THREE.PerspectiveCamera;
  private targetX = 0;
  private curX = 0;
  private vel = 0;
  private shakeT = 0;
  private shakeAmp = 0;

  constructor(aspect: number) {
    this.cam = new THREE.PerspectiveCamera(CONFIG.FOV, aspect, 0.1, 200);
    this.cam.position.set(0, EYE_HEIGHT, 0);
    this.cam.lookAt(0, EYE_HEIGHT, -12);   // 視線水平 —— 決鬥不俯視也不仰視
  }

  resize(aspect: number): void {
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
  }

  /** 命中時呼叫。幅度是第一人稱最容易做錯的地方，超過 8px 就會暈 */
  shake(strength = 1): void {
    this.shakeT = CONFIG.SHAKE_MS / 1000;
    this.shakeAmp = strength;
  }

  update(myX: number, dt: number): void {
    this.targetX = (myX - 0.5) * LANE_WIDTH;

    // 臨界阻尼：不會過衝，也不會拖泥帶水。PARALLAX_MS 是「追上」的時間常數
    const omega = 2 / (CONFIG.PARALLAX_MS / 1000);
    const d = this.curX - this.targetX;
    const acc = -omega * omega * d - 2 * omega * this.vel;
    this.vel += acc * dt;
    this.curX += this.vel * dt;

    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = Math.max(0, this.shakeT) / (CONFIG.SHAKE_MS / 1000);   // 線性衰減
      const px = (CONFIG.SHAKE_PX / 1000) * this.shakeAmp * k;
      sx = Math.sin(this.shakeT * 90) * px;
      sy = Math.cos(this.shakeT * 70) * px;
    }

    this.cam.position.set(this.curX + sx, EYE_HEIGHT + sy, 0);
  }
}

export { EYE_HEIGHT, LANE_WIDTH };
