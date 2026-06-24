import * as THREE from "three";
import { EnemyBillboard } from "../entities/EnemyBillboard";

export enum EnemyState {
  Idle = "IDLE",
  Stalk = "STALK",
  Watch = "WATCH",
  Investigate = "INVESTIGATE",
  Ambush = "AMBUSH",
  Chase = "CHASE",
  Search = "SEARCH",
  Jumpscare = "JUMPSCARE"
}

type PlayerSnapshot = {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  motion: number;
};

type NoiseEvent = {
  position: THREE.Vector3;
  intensity: number;
  time: number;
};

type EnemyWorld = {
  raycastWall: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
  getPathStep: (from: THREE.Vector3, to: THREE.Vector3) => THREE.Vector3;
  getHidingPointNear: (position: THREE.Vector3) => THREE.Vector3;
  getAmbushPoint: (position: THREE.Vector3, direction: THREE.Vector3) => THREE.Vector3;
  getWatchPoint: (position: THREE.Vector3, direction: THREE.Vector3) => THREE.Vector3;
  getCornerPeekPoint: (position: THREE.Vector3, direction: THREE.Vector3) => THREE.Vector3;
  getSearchPointNear: (position: THREE.Vector3) => THREE.Vector3;
  clampEnemyMove: (from: THREE.Vector3, to: THREE.Vector3) => THREE.Vector3;
  getRecentNoises: (time: number) => NoiseEvent[];
  isBloodMoonActive: () => boolean;
  isPlayerHidden: () => boolean;
  onJumpscare: () => void;
  onPlayerKilled: () => void;
  onStateChange: (state: EnemyState) => void;
};

class EnemyMemory {
  lastSeenPosition: THREE.Vector3 | null = null;
  lastHeardPosition: THREE.Vector3 | null = null;
  timeSinceLastSeen = 999;
  stareTime = 0;
}

class EnemySensors {
  constructor(
    private readonly enemy: EnemyBillboard,
    private readonly getPlayer: () => PlayerSnapshot,
    private readonly world: EnemyWorld
  ) {}

  distanceToPlayer(): number {
    return this.enemy.position.distanceTo(this.getPlayer().position);
  }

  canSeePlayer(): boolean {
    const player = this.getPlayer();
    if (this.distanceToPlayer() > 10.5) return false;
    if (this.world.raycastWall(this.enemy.position, player.position)) return false;
    return true;
  }

  playerLookingAtEnemy(): boolean {
    const player = this.getPlayer();
    if (this.distanceToPlayer() > 9) return false;
    if (this.world.raycastWall(player.position, this.enemy.position)) return false;
    const toEnemy = this.enemy.position.clone().sub(player.position).setY(0).normalize();
    return player.direction.dot(toEnemy) > 0.66;
  }

  latestNoise(time: number): NoiseEvent | null {
    const recent = this.world.getRecentNoises(time);
    for (const noise of recent) {
      const audibleRange = 5 + noise.intensity * 6;
      if (this.enemy.position.distanceTo(noise.position) <= audibleRange) return noise;
    }
    return null;
  }
}

export class EnemyAI {
  private readonly memory = new EnemyMemory();
  private readonly sensors: EnemySensors;
  private state = EnemyState.Idle;
  private stateTimer = 0;
  private tension = 0;
  private jumpscareCooldown = 20;
  private lastJumpscareAt = -999;
  private target: THREE.Vector3 | null = null;

  constructor(
    private readonly enemy: EnemyBillboard,
    private readonly getPlayer: () => PlayerSnapshot,
    private readonly world: EnemyWorld
  ) {
    this.sensors = new EnemySensors(enemy, getPlayer, world);
    this.enemy.setVisible(false);
  }

  update(dt: number, time: number): void {
    this.stateTimer += dt;
    this.updateMemory(dt, time);
    this.updateTension(dt);

    if (!this.world.isBloodMoonActive() && this.isHuntingState()) {
      this.changeState(EnemyState.Stalk);
      return;
    }
    if (!this.world.isBloodMoonActive() && this.shouldVanishFromPlayer()) {
      this.vanishFromPlayer();
      return;
    }
    if (
      this.world.isBloodMoonActive() &&
      !this.world.isPlayerHidden() &&
      this.state !== EnemyState.Chase &&
      this.state !== EnemyState.Jumpscare
    ) {
      this.changeState(EnemyState.Chase);
      return;
    }

    switch (this.state) {
      case EnemyState.Idle:
        this.updateIdle(time);
        break;
      case EnemyState.Stalk:
        this.updateStalk(dt, time);
        break;
      case EnemyState.Watch:
        this.updateWatch(dt);
        break;
      case EnemyState.Investigate:
        this.updateInvestigate(dt);
        break;
      case EnemyState.Ambush:
        this.updateAmbush(dt, time);
        break;
      case EnemyState.Chase:
        this.updateChase(dt, time);
        break;
      case EnemyState.Search:
        this.updateSearch(dt);
        break;
      case EnemyState.Jumpscare:
        this.updateJumpscare();
        break;
    }
  }

  getDebugState(): { state: EnemyState; tension: number; distance: number; stare: number } {
    return {
      state: this.state,
      tension: Number(this.tension.toFixed(1)),
      distance: Number(this.sensors.distanceToPlayer().toFixed(2)),
      stare: Number(this.memory.stareTime.toFixed(2))
    };
  }

  forceBloodHunt(): void {
    const player = this.getPlayer();
    this.memory.lastSeenPosition = player.position.clone();
    this.memory.timeSinceLastSeen = 0;
    this.memory.stareTime = 0;
    this.tension = Math.max(this.tension, 62);
    this.changeState(EnemyState.Chase);
  }

  private changeState(next: EnemyState): void {
    if (this.state === next) return;
    this.state = next;
    this.stateTimer = 0;
    this.target = null;

    if (next === EnemyState.Idle) this.enemy.setPresenceMode("hidden");
    if (next === EnemyState.Stalk || next === EnemyState.Investigate || next === EnemyState.Search) this.enemy.setPresenceMode("stalk");
    if (next === EnemyState.Watch) {
      const player = this.getPlayer();
      if (this.world.raycastWall(player.position, this.enemy.position) || this.sensors.distanceToPlayer() > 8.5) {
        this.enemy.setPosition(this.world.getCornerPeekPoint(player.position, player.direction));
      }
      this.enemy.setPresenceMode("watch");
    }
    if (next === EnemyState.Ambush) this.enemy.setPresenceMode("watch");
    if (next === EnemyState.Chase) this.enemy.setPresenceMode("chase");
    if (next === EnemyState.Jumpscare) {
      this.lastJumpscareAt = performance.now() / 1000;
      this.enemy.setPresenceMode("scare");
      this.enemy.setScareScale(true);
      this.world.onJumpscare();
      if (this.world.isBloodMoonActive()) this.world.onPlayerKilled();
    } else {
      this.enemy.setScareScale(false);
    }
    this.world.onStateChange(next);
  }

  private updateMemory(dt: number, time: number): void {
    if (this.world.isBloodMoonActive() && !this.world.isPlayerHidden()) {
      this.memory.lastSeenPosition = this.getPlayer().position.clone();
      this.memory.timeSinceLastSeen = 0;
    } else if (!this.world.isPlayerHidden() && this.sensors.canSeePlayer()) {
      this.memory.lastSeenPosition = this.getPlayer().position.clone();
      this.memory.timeSinceLastSeen = 0;
    } else {
      this.memory.timeSinceLastSeen += dt;
    }

    const noise = this.sensors.latestNoise(time);
    if (noise) this.memory.lastHeardPosition = noise.position.clone();

    if (this.sensors.playerLookingAtEnemy()) {
      this.memory.stareTime += dt;
    } else {
      this.memory.stareTime = Math.max(0, this.memory.stareTime - dt * 1.6);
    }
  }

  private updateTension(dt: number): void {
    const distance = this.sensors.distanceToPlayer();
    const playerMotion = this.getPlayer().motion;
    const motionPressure = playerMotion > 1 ? 1.45 : playerMotion > 0.35 ? 1 : 0.65;
    const moonPressure = this.world.isBloodMoonActive() ? 1.9 : 0.74;
    this.tension += distance < 7 ? dt * 18 * motionPressure * moonPressure : -dt * 8;
    this.tension = THREE.MathUtils.clamp(this.tension, 0, 100);
  }

  private updateIdle(time: number): void {
    this.enemy.setVisible(false);
    if (this.sensors.latestNoise(time)) {
      this.changeState(EnemyState.Investigate);
      return;
    }
    if (this.stateTimer > 2.4) this.changeState(EnemyState.Stalk);
  }

  private updateStalk(dt: number, time: number): void {
    if (this.sensors.latestNoise(time)) {
      this.changeState(EnemyState.Investigate);
      return;
    }
    if (this.sensors.canSeePlayer()) {
      this.changeState(EnemyState.Watch);
      return;
    }

    if (!this.target || this.enemy.position.distanceTo(this.target) < 0.5 || this.stateTimer > 6.5) {
      const player = this.getPlayer();
      this.target = !this.world.isBloodMoonActive() && Math.random() < 0.68
        ? this.world.getCornerPeekPoint(player.position, player.direction)
        : this.world.getHidingPointNear(player.position);
    }
    this.moveTo(this.target, this.world.isBloodMoonActive() ? 0.95 : 0.58, dt);

    if (this.sensors.distanceToPlayer() < 8.5 && Math.random() < (this.world.isBloodMoonActive() ? 0.035 : 0.08)) {
      this.changeState(EnemyState.Watch);
    }
    if (!this.world.isBloodMoonActive() && this.stateTimer > 9.5) this.changeState(EnemyState.Watch);
    if (this.world.isBloodMoonActive() && this.stateTimer > 2.5) this.changeState(EnemyState.Chase);
  }

  private updateWatch(dt: number): void {
    this.enemy.setPresenceMode("watch");
    const playerLooking = this.sensors.playerLookingAtEnemy();
    this.enemy.setGazeLocked(!this.world.isBloodMoonActive() && playerLooking);
    if (!this.world.isBloodMoonActive() && this.getPlayer().motion > 0.18) {
      this.target = this.world.getHidingPointNear(this.getPlayer().position);
      this.vanishFromPlayer();
      return;
    }
    const stareLimit = this.world.isBloodMoonActive() ? 4.8 : 8.5;
    if (this.world.isBloodMoonActive() && playerLooking && this.memory.stareTime > stareLimit) {
      this.target = this.world.getHidingPointNear(this.getPlayer().position);
      this.changeState(EnemyState.Stalk);
      return;
    }
    if (!this.world.isBloodMoonActive() && this.sensors.distanceToPlayer() < 3.7) {
      this.target = this.world.getHidingPointNear(this.getPlayer().position);
      this.changeState(EnemyState.Stalk);
      return;
    }
    if (!this.world.isBloodMoonActive() && !playerLooking && this.stateTimer > 8.5) {
      const player = this.getPlayer();
      this.enemy.setPosition(this.world.getCornerPeekPoint(player.position, player.direction));
      this.memory.stareTime = 0;
      this.stateTimer = 0;
      return;
    }
    if (this.world.isBloodMoonActive() && this.stateTimer > 6 && this.canUseJumpscare(performance.now() / 1000)) {
      this.changeState(EnemyState.Jumpscare);
      return;
    }
    if (this.world.isBloodMoonActive() && this.sensors.distanceToPlayer() < 3.2 && this.stateTimer > 7.5 && this.tension > 46) {
      this.changeState(EnemyState.Ambush);
    }
    if (this.world.isBloodMoonActive() && this.stateTimer > 12 && this.tension > 58) this.changeState(EnemyState.Ambush);
    if (this.stateTimer > (this.world.isBloodMoonActive() ? 15 : 24)) this.changeState(EnemyState.Stalk);
    this.enemy.update(dt);
  }

  private updateInvestigate(dt: number): void {
    if (this.sensors.canSeePlayer()) {
      this.changeState(this.world.isBloodMoonActive() && this.tension > 35 ? EnemyState.Chase : EnemyState.Watch);
      return;
    }
    const target = this.memory.lastHeardPosition;
    if (target) this.moveTo(target, 1.9, dt);
    if (!target || this.enemy.position.distanceTo(target) < 0.75 || this.stateTimer > 6) {
      this.changeState(EnemyState.Search);
    }
  }

  private updateAmbush(dt: number, time: number): void {
    if (!this.target) {
      const player = this.getPlayer();
      this.target = this.world.getAmbushPoint(player.position, player.direction);
    }
    this.moveTo(this.target, 1.05, dt);
    if (this.canUseJumpscare(time)) this.changeState(EnemyState.Jumpscare);
    else if (this.world.isBloodMoonActive() && this.sensors.distanceToPlayer() < 9.5 && this.tension > 34) this.changeState(EnemyState.Chase);
    else if (this.stateTimer > 9) this.changeState(EnemyState.Stalk);
  }

  private updateChase(dt: number, time: number): void {
    if (this.world.isBloodMoonActive() && this.world.isPlayerHidden()) {
      const lastKnown = this.memory.lastSeenPosition ?? this.getPlayer().position;
      this.moveTo(lastKnown, 1.25, dt);
      if (this.stateTimer > 4.5) this.changeState(EnemyState.Search);
      return;
    }
    if (this.world.isBloodMoonActive() && this.sensors.distanceToPlayer() < 1.35) {
      this.changeState(EnemyState.Jumpscare);
      return;
    }
    if (this.canUseJumpscare(time)) {
      this.changeState(EnemyState.Jumpscare);
      return;
    }
    if (this.sensors.canSeePlayer() || this.world.isBloodMoonActive()) {
      this.moveTo(this.getPlayer().position, 4.65, dt);
    } else {
      this.changeState(EnemyState.Search);
    }
  }

  private updateSearch(dt: number): void {
    const base = this.memory.lastSeenPosition ?? this.memory.lastHeardPosition;
    if (!this.target && base) this.target = this.world.getSearchPointNear(base);
    if (this.target) this.moveTo(this.target, 1.55, dt);
    if (this.sensors.canSeePlayer()) {
      this.changeState(this.world.isBloodMoonActive() && this.tension > 45 ? EnemyState.Chase : EnemyState.Watch);
    }
    else if (this.stateTimer > 5.5) this.changeState(EnemyState.Stalk);
  }

  private updateJumpscare(): void {
    const player = this.getPlayer();
    this.enemy.setPosition(player.position.clone().add(player.direction.clone().multiplyScalar(0.9)).setY(1.1));
    if (this.stateTimer > 1.35) this.changeState(EnemyState.Idle);
  }

  private canUseJumpscare(time: number): boolean {
    return (
      this.world.isBloodMoonActive() &&
      this.sensors.distanceToPlayer() < 1.25 &&
      this.tension > 48 &&
      time - this.lastJumpscareAt > this.jumpscareCooldown
    );
  }

  private isHuntingState(): boolean {
    return this.state === EnemyState.Ambush || this.state === EnemyState.Chase || this.state === EnemyState.Jumpscare;
  }

  private shouldVanishFromPlayer(): boolean {
    if (this.state === EnemyState.Idle || this.state === EnemyState.Jumpscare) return false;
    return this.sensors.distanceToPlayer() < 5.2;
  }

  private vanishFromPlayer(): void {
    this.enemy.setGazeLocked(false);
    this.enemy.setPosition(this.world.getHidingPointNear(this.getPlayer().position));
    this.memory.stareTime = 0;
    this.changeState(EnemyState.Idle);
  }

  private moveTo(target: THREE.Vector3, speed: number, dt: number): void {
    const desired = this.enemy.position.clone();
    const waypoint = this.world.raycastWall(desired, target) ? this.world.getPathStep(desired, target) : target;
    const direction = waypoint.clone().sub(desired).setY(0);
    if (direction.lengthSq() < 0.01) return;
    direction.normalize().multiplyScalar(speed * dt);
    const next = this.world.clampEnemyMove(desired, desired.clone().add(direction));
    this.enemy.setPosition(next);
  }
}
