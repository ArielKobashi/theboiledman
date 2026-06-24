import * as THREE from "three";

export class PointCloudEntity {
  public readonly points: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly baseSize: number;
  private readonly pulseSpeed: number;
  private readonly pulseDepth: number;

  constructor(geometry: THREE.BufferGeometry, material: THREE.PointsMaterial, pulseSpeed = 1, pulseDepth = 0.08) {
    this.material = material;
    this.baseSize = material.size;
    this.pulseSpeed = pulseSpeed;
    this.pulseDepth = pulseDepth;
    this.points = new THREE.Points(geometry, material);
  }

  update(time: number, motionIntensity: number): void {
    const pulse = 1 + Math.sin(time * this.pulseSpeed) * this.pulseDepth;
    this.material.size = this.baseSize * pulse * (1 + motionIntensity * 0.45);
  }
}
