import * as THREE from "three";

type FirstPersonControllerOptions = {
  collidesAt: (position: THREE.Vector3) => boolean;
  onInteract: (position: THREE.Vector3) => void;
  onNoise: (position: THREE.Vector3, intensity: number) => void;
};

export class FirstPersonController {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;
  private readonly options: FirstPersonControllerOptions;
  private readonly keys = new Set<string>();
  private yaw = 0;
  private pitch = 0;
  private readonly walkSpeed = 5;
  private readonly sprintSpeed = 8.2;
  private readonly crouchSpeed = 2.4;
  private readonly lookSensitivity = 0.0025;
  private readonly standingEyeHeight = 1.7;
  private readonly crouchingEyeHeight = 1.02;
  private currentSpeed = 0;
  private verticalVelocity = 0;
  private eyeHeight = this.standingEyeHeight;
  private isGrounded = true;
  private interactLatch = false;
  private lockTimer = 0;
  private footstepTimer = 0;
  private stepPhase = 0;
  private viewBobOffset = 0;
  private viewSideOffset = 0;
  private viewRoll = 0;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, options: FirstPersonControllerOptions) {
    this.camera = camera;
    this.domElement = domElement;
    this.options = options;

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    this.domElement.addEventListener("click", this.requestPointerLock);
    document.addEventListener("mousemove", this.handleMouseMove);
  }

  update(dt: number): void {
    this.camera.position.y -= this.viewBobOffset;
    const rightCorrection = this.getFlatRight().multiplyScalar(this.viewSideOffset);
    this.camera.position.sub(rightCorrection);
    this.viewBobOffset = 0;
    this.viewSideOffset = 0;
    this.lockTimer = Math.max(0, this.lockTimer - dt);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = this.viewRoll;

    const isCrouching = this.keys.has("ControlLeft") || this.keys.has("ControlRight");
    const isSprinting = !isCrouching && (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"));
    const targetEyeHeight = isCrouching ? this.crouchingEyeHeight : this.standingEyeHeight;
    this.eyeHeight = THREE.MathUtils.lerp(this.eyeHeight, targetEyeHeight, 1 - Math.exp(-dt * 10));

    if (this.keys.has("Space") && this.isGrounded && !isCrouching) {
      this.verticalVelocity = 5.2;
      this.isGrounded = false;
    }

    let isMoving = false;
    if (this.lockTimer <= 0) {
      this.handleInteraction();
      isMoving = this.applyHorizontalMovement(dt, isSprinting, isCrouching);
    } else {
      this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, 0, 1 - Math.exp(-dt * 10));
    }
    this.applyVerticalMovement(dt);
    this.applyStepAnimation(dt, isMoving, isSprinting, isCrouching);
  }

  getMotionIntensity(): number {
    return this.currentSpeed;
  }

  getDirection(): THREE.Vector3 {
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    direction.y = 0;
    return direction.normalize();
  }

  lockControls(seconds: number): void {
    this.lockTimer = Math.max(this.lockTimer, seconds);
  }

  private applyHorizontalMovement(dt: number, isSprinting: boolean, isCrouching: boolean): boolean {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const movement = new THREE.Vector3();

    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) movement.add(forward);
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) movement.sub(forward);
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) movement.sub(right);
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) movement.add(right);

    const isMoving = movement.lengthSq() > 0;
    const speed = isCrouching ? this.crouchSpeed : isSprinting ? this.sprintSpeed : this.walkSpeed;

    if (isMoving) {
      movement.normalize().multiplyScalar(speed * dt);
      this.tryMove(new THREE.Vector3(movement.x, 0, 0));
      this.tryMove(new THREE.Vector3(0, 0, movement.z));
      this.emitFootstepNoise(dt, isSprinting);
    }

    const targetSpeed = isMoving ? (isSprinting ? 1.45 : isCrouching ? 0.45 : 1) : 0;
    this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, targetSpeed, 1 - Math.exp(-dt * 8));
    return isMoving;
  }

  private applyVerticalMovement(dt: number): void {
    this.verticalVelocity -= 14 * dt;
    this.camera.position.y += this.verticalVelocity * dt;

    if (this.camera.position.y <= this.eyeHeight) {
      this.camera.position.y = this.eyeHeight;
      this.verticalVelocity = 0;
      this.isGrounded = true;
    }
  }

  private tryMove(delta: THREE.Vector3): void {
    const nextPosition = this.camera.position.clone().add(delta);
    if (!this.options.collidesAt(nextPosition)) {
      this.camera.position.copy(nextPosition);
    }
  }

  private handleInteraction(): void {
    const wantsInteract = this.keys.has("KeyE") || this.keys.has("MousePrimary");
    if (wantsInteract && !this.interactLatch) {
      this.options.onInteract(this.camera.position.clone());
      this.options.onNoise(this.camera.position.clone(), 1.15);
    }
    this.interactLatch = wantsInteract;
  }

  private emitFootstepNoise(dt: number, isSprinting: boolean): void {
    this.footstepTimer -= dt;
    if (this.footstepTimer > 0) return;
    this.footstepTimer = isSprinting ? 0.22 : 0.42;
    this.options.onNoise(this.camera.position.clone(), isSprinting ? 1.4 : 0.55);
  }

  private applyStepAnimation(dt: number, isMoving: boolean, isSprinting: boolean, isCrouching: boolean): void {
    const targetMotion = isMoving && this.isGrounded ? THREE.MathUtils.clamp(this.currentSpeed, 0, 1.35) : 0;
    const cadence = isSprinting ? 11.6 : isCrouching ? 5.4 : 7.6;
    const height = isSprinting ? 0.034 : isCrouching ? 0.01 : 0.022;
    const side = isSprinting ? 0.018 : isCrouching ? 0.005 : 0.011;

    this.stepPhase += dt * cadence * Math.max(0.25, targetMotion);
    const stepWave = Math.sin(this.stepPhase);
    const doubleStep = Math.sin(this.stepPhase * 2);
    const bob = (0.5 - Math.cos(this.stepPhase * 2) * 0.5) * height * targetMotion;
    const sway = stepWave * side * targetMotion;
    const roll = stepWave * (isSprinting ? 0.006 : 0.0035) * targetMotion;

    this.viewBobOffset = THREE.MathUtils.lerp(this.viewBobOffset, bob + doubleStep * height * 0.08, 1 - Math.exp(-dt * 10));
    this.viewSideOffset = THREE.MathUtils.lerp(this.viewSideOffset, sway, 1 - Math.exp(-dt * 9));
    this.viewRoll = THREE.MathUtils.lerp(this.viewRoll, roll, 1 - Math.exp(-dt * 8));
    this.camera.position.y += this.viewBobOffset;
    this.camera.position.add(this.getFlatRight().multiplyScalar(this.viewSideOffset));
    this.camera.rotation.z = this.viewRoll;
  }

  private getFlatRight(): THREE.Vector3 {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (this.isControlKey(event.code)) event.preventDefault();
    this.keys.add(event.code);
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    if (this.isControlKey(event.code)) event.preventDefault();
    this.keys.delete(event.code);
  };

  private isControlKey(code: string): boolean {
    return [
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowLeft",
      "ArrowDown",
      "ArrowRight",
      "Space",
      "ShiftLeft",
      "ShiftRight",
      "ControlLeft",
      "ControlRight",
      "KeyE"
    ].includes(code);
  }

  private requestPointerLock = (): void => {
    this.keys.add("MousePrimary");
    window.setTimeout(() => this.keys.delete("MousePrimary"), 120);

    if (document.pointerLockElement !== this.domElement) {
      this.domElement.requestPointerLock().catch(() => {
        // Test browsers can reject pointer lock even when normal clicks work.
      });
    }
  };

  private handleMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.domElement) return;
    this.yaw -= event.movementX * this.lookSensitivity;
    this.pitch -= event.movementY * this.lookSensitivity;
    const limit = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  };
}
