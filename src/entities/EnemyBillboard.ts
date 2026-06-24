import * as THREE from "three";

export class EnemyBillboard {
  public readonly root = new THREE.Group();
  private readonly sprite: THREE.Sprite;
  private readonly baseScale = new THREE.Vector2(1.65, 4);
  private presenceMode: "hidden" | "stalk" | "watch" | "chase" | "scare" = "hidden";
  private visibilityBoost = 1;
  private gazeLocked = false;
  private xRayFocus = false;
  private wallOccluded = false;
  private pulse = 0;
  private gaitPhase = 0;

  constructor(texturePath: string, position: THREE.Vector3) {
    const texture = new THREE.TextureLoader().load(texturePath);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.08,
      depthWrite: true
    });

    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.set(this.baseScale.x, this.baseScale.y, 1);
    this.sprite.position.set(0, 0, 0);
    this.root.position.copy(position);
    this.root.add(this.sprite);
  }

  update(dt: number): void {
    this.pulse += dt;
    if (this.gazeLocked && this.presenceMode === "watch") {
      const stareBreath = 1 + Math.sin(this.pulse * 1.05) * 0.018;
      const stareLean = Math.sin(this.pulse * 0.72) * 0.018;
      const xRayBoost = this.xRayFocus ? 1.34 : 1;
      this.sprite.position.set(0, 0.08 + Math.sin(this.pulse * 0.9) * 0.025, 0);
      this.sprite.material.rotation = stareLean;
      this.sprite.scale.set(
        this.baseScale.x * 1.42 * stareBreath * xRayBoost,
        this.baseScale.y * 1.18 * stareBreath * xRayBoost,
        1
      );
      return;
    }

    const intensity =
      this.presenceMode === "chase" ? 1.35 :
      this.presenceMode === "scare" ? 1.9 :
      this.presenceMode === "watch" ? 0.72 :
      this.presenceMode === "stalk" ? 0.45 :
      0.18;
    this.gaitPhase += dt * (this.presenceMode === "chase" ? 13 : this.presenceMode === "scare" ? 18 : 5.8);

    const breath = 1 + Math.sin(this.pulse * 2.4) * 0.035 * intensity;
    const stepLift = Math.abs(Math.sin(this.gaitPhase)) * 0.16 * intensity;
    const lean = Math.sin(this.gaitPhase * 0.5) * 0.08 * intensity;
    const twitch = Math.sin(this.pulse * 17.5) * 0.015 * intensity;
    const squash = 1 + Math.sin(this.gaitPhase) * 0.035 * intensity;
    const xRayBoost = this.xRayFocus ? 1.42 : 1;
    const xRayFloat = this.xRayFocus ? Math.sin(this.pulse * 3.2) * 0.055 : 0;

    this.sprite.position.set(Math.sin(this.gaitPhase * 0.5) * 0.04 * intensity, stepLift + twitch + xRayFloat, 0);
    this.sprite.material.rotation = lean + twitch;
    this.sprite.scale.set(
      this.baseScale.x * breath * this.visibilityBoost * xRayBoost * (1 + (squash - 1) * 0.45),
      this.baseScale.y * breath * this.visibilityBoost * xRayBoost * (1 - (squash - 1) * 0.32),
      1
    );
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  setPosition(position: THREE.Vector3): void {
    this.root.position.copy(position);
  }

  moveToward(target: THREE.Vector3, speed: number, dt: number): void {
    const direction = target.clone().sub(this.root.position);
    direction.y = 0;
    const distance = direction.length();
    if (distance < 0.04) return;
    direction.normalize();
    this.root.position.add(direction.multiplyScalar(Math.min(distance, speed * dt)));
  }

  setVisible(visible: boolean): void {
    this.sprite.visible = visible && (!this.wallOccluded || this.xRayFocus);
  }

  setScareScale(active: boolean): void {
    this.baseScale.set(active ? 2.4 : 1.65, active ? 5.8 : 4);
  }

  setPresenceMode(mode: "hidden" | "stalk" | "watch" | "chase" | "scare"): void {
    this.presenceMode = mode;
    if (mode !== "watch") this.gazeLocked = false;
    if (mode === "hidden") this.xRayFocus = false;
    this.visibilityBoost = mode === "watch" ? 1.28 : mode === "chase" ? 1.15 : mode === "scare" ? 1.7 : 1;
    this.sprite.material.opacity = mode === "watch" ? 1 : mode === "stalk" ? 0.82 : 1;
    this.sprite.material.depthTest = true;
    this.sprite.material.depthWrite = true;
    this.sprite.material.color.set(0xffffff);
    this.sprite.renderOrder = 0;
    this.refreshVisibility();
  }

  setGazeLocked(active: boolean): void {
    this.gazeLocked = active;
  }

  setXRayVisible(active: boolean): void {
    this.xRayFocus = active;
    if (!active) {
      this.sprite.material.depthTest = true;
      this.sprite.material.depthWrite = true;
      this.sprite.material.opacity = this.presenceMode === "watch" ? 1 : this.presenceMode === "stalk" ? 0.82 : 1;
      this.sprite.material.color.set(0xffffff);
      this.sprite.renderOrder = 0;
      this.refreshVisibility();
      return;
    }

    this.sprite.material.depthTest = false;
    this.sprite.material.depthWrite = false;
    this.sprite.material.opacity = 1;
    this.sprite.material.color.set(0xff3326);
    this.sprite.renderOrder = 90;
    this.refreshVisibility();
  }

  setWallOccluded(occluded: boolean): void {
    this.wallOccluded = occluded;
    this.refreshVisibility();
  }

  private refreshVisibility(): void {
    this.sprite.visible = this.presenceMode !== "hidden" && (!this.wallOccluded || this.xRayFocus);
  }
}
