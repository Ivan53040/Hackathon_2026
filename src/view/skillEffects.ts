/** Visuals for Rock, Spike and Mushroom.
 *
 * Gameplay owns lifetime and collision in match/. This layer is deliberately
 * state-driven: when a hazard/projectile leaves MatchState it is hidden on
 * the next frame, so there are no per-spell timers or listeners to leak.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config';
import { GAP } from './arena';
import { LANE_WIDTH } from './camera';
import type { MatchState } from '../core/types';

const MAX_INSTANCES = 16;
const MUSHROOM_CELL_WIDTH = LANE_WIDTH / CONFIG.GRID_CELLS;
const SPIKE_START_ME_Z = -1.0;
const SPIKE_END_ME_Z = 0.6 + 1.6;
const SPIKE_START_THEM_Z = -GAP + 1.6;
const SPIKE_END_THEM_Z = -GAP - 1.6;
const MUSHROOM_ME_Z = -GAP;
const MUSHROOM_THEM_Z = 0.6;
const toWorldX = (x: number): number => (x - 0.5) * LANE_WIDTH;

export class SkillEffects {
  private readonly rocks: THREE.Group[] = [];
  private readonly spikes: THREE.Group[] = [];
  private readonly mushrooms: THREE.Group[] = [];
  private disposed = false;

  constructor(private readonly scene: THREE.Scene) {
    for (let i = 0; i < MAX_INSTANCES; i++) {
      const rock = new THREE.Group();
      rock.add(new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.62, 0.62),
        new THREE.MeshStandardMaterial({ color: 0x766b65, roughness: 0.92, metalness: 0.04 }),
      ));
      rock.visible = false;
      scene.add(rock);
      this.rocks.push(rock);

      const spike = new THREE.Group();
      spike.add(new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x8e8790, roughness: 0.86, metalness: 0.08 }),
      ));
      spike.visible = false;
      scene.add(spike);
      this.spikes.push(spike);

      const mushroom = new THREE.Group();
      for (let cell = 0; cell < CONFIG.MUSHROOM_RANGE_CELLS; cell++) {
        const cluster = new THREE.Group();
        cluster.position.x = (cell - (CONFIG.MUSHROOM_RANGE_CELLS - 1) / 2) * MUSHROOM_CELL_WIDTH;
        cluster.add(new THREE.Mesh(
          new THREE.ConeGeometry(0.34, 0.78, 3),
          new THREE.MeshStandardMaterial({ color: 0x7d4ca3, roughness: 0.74, emissive: 0x281238, emissiveIntensity: 0.25 }),
        ));
        cluster.position.y = 0.39;
        cluster.rotation.y = Math.PI / 6;
        mushroom.add(cluster);
      }
      mushroom.visible = false;
      scene.add(mushroom);
      this.mushrooms.push(mushroom);
    }
  }

  update(s: MatchState, _dt: number): void {
    if (this.disposed) return;
    for (const object of this.rocks) object.visible = false;
    for (const object of this.spikes) object.visible = false;
    for (const object of this.mushrooms) object.visible = false;

    let rockSlot = 0;
    for (const projectile of s.projectiles) {
      if (projectile.spell !== 'rock' || rockSlot >= this.rocks.length) continue;
      const t = THREE.MathUtils.clamp(projectile.progress, 0, 1);
      const object = this.rocks[rockSlot++];
      object.visible = true;
      object.position.set(
        toWorldX(THREE.MathUtils.lerp(projectile.fromX, projectile.toX, t)),
        3.75 - t * 2.55,
        projectile.owner === 'me' ? -GAP + 1.8 : -2.15,
      );
      object.rotation.set(t * 4, t * 5, t * 2);
      object.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.12);
    }

    let spikeSlot = 0;
    let mushroomSlot = 0;
    for (const hazard of s.hazards) {
      if (hazard.type === 'spike' && spikeSlot < this.spikes.length) {
        const object = this.spikes[spikeSlot++];
        const startZ = hazard.owner === 'me' ? SPIKE_START_ME_Z : SPIKE_START_THEM_Z;
        const endZ = hazard.owner === 'me' ? SPIKE_END_THEM_Z : SPIKE_END_ME_Z;
        const currentZ = THREE.MathUtils.lerp(startZ, endZ, hazard.progress);
        const length = Math.max(0.18, Math.abs(currentZ - startZ));
        const rectangle = object.children[0] as THREE.Mesh;
        const laneWidth = LANE_WIDTH * Math.abs(hazard.toX - hazard.fromX);
        object.visible = true;
        rectangle.visible = true;
        rectangle.position.set(
          toWorldX((hazard.fromX + hazard.toX) / 2),
          0.07,
          (startZ + currentZ) / 2,
        );
        rectangle.scale.set(Math.max(0.12, laneWidth * 0.92), 0.12, length);
      } else if (hazard.type === 'mushroom' && mushroomSlot < this.mushrooms.length) {
        const object = this.mushrooms[mushroomSlot++];
        object.visible = true;
        object.position.set(
          toWorldX(hazard.x),
          0,
          hazard.owner === 'me' ? MUSHROOM_ME_Z : MUSHROOM_THEM_Z,
        );
        const growth = THREE.MathUtils.clamp(hazard.age / 0.7, 0, 1);
        const pulse = 1 + Math.sin(hazard.age * 4) * 0.04;
        object.scale.setScalar(Math.max(0.12, pulse * growth));
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const object of [...this.rocks, ...this.spikes, ...this.mushrooms]) {
      object.visible = false;
      for (const child of [...object.children]) this.disposeObject(child);
      object.removeFromParent();
    }
  }

  private disposeObject(root: THREE.Object3D): void {
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry.dispose();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) material.dispose();
    });
  }
}


