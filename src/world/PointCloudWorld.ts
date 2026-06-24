import * as THREE from "three";
import { createInkPointMaterial } from "../render/InkPointMaterial";
import { createStippleFloorMaterial } from "../render/StippleFloorMaterial";
import { createStippleSurfaceMaterial } from "../render/StippleSurfaceMaterial";
import { EnemyBillboard } from "../entities/EnemyBillboard";
import { EnemyAI } from "../ai/EnemyAI";
import { PointCloudEntity } from "./PointCloudEntity";
import { PointVolumeFactory } from "./PointVolumeFactory";

type WallSpec = {
  position: THREE.Vector3;
  size: THREE.Vector3;
};

type NoiseEvent = {
  position: THREE.Vector3;
  intensity: number;
  time: number;
};

type HidingSpot = {
  position: THREE.Vector3;
  buttonPosition: THREE.Vector3;
  radius: number;
};

type WorldOptions = {
  getPlayerPosition: () => THREE.Vector3;
  getPlayerDirection: () => THREE.Vector3;
  getPlayerMotion: () => number;
  onJumpscare: () => void;
  onPlayerKilled: () => void;
  onBloodMoonStart: () => void;
  onBloodMoonEnd: () => void;
  onEnemyStateChange: (state: string) => void;
};

export class PointCloudWorld {
  private static readonly calmMoonDuration = 720;
  private static readonly bloodMoonDuration = 60;
  private static readonly xRayRange = 34;
  public readonly root = new THREE.Group();
  private readonly entities: PointCloudEntity[] = [];
  private readonly structures = new THREE.Group();
  private readonly shadows = new THREE.Group();
  private readonly stippleSurfaces = new THREE.Group();
  private readonly floorSurfaces = new THREE.Group();
  private readonly skySurfaces = new THREE.Group();
  private readonly collisionBoxes: THREE.Box3[] = [];
  private readonly stippleMaterial = createStippleSurfaceMaterial();
  private readonly floorMaterial = createStippleFloorMaterial();
  private readonly enemies: EnemyBillboard[] = [];
  private readonly enemyAIs: EnemyAI[] = [];
  private readonly navigationPoints: THREE.Vector3[] = [];
  private readonly navigationLinks = new Map<number, number[]>();
  private readonly noiseEvents: NoiseEvent[] = [];
  private readonly hidingSpots: HidingSpot[] = [];
  private readonly moonGroup = new THREE.Group();
  private readonly moonMaterial: THREE.PointsMaterial;
  private readonly moonTears: THREE.Points;
  private readonly bloodSkyFill: THREE.Points;
  private readonly bloodSkyMaterial: THREE.PointsMaterial;
  private time = 0;
  private lunarCycleTime = 0;
  private bloodMoonActive = false;
  private hiddenTimer = 0;
  private interactionPulse = 0;
  private pointCount = 0;

  constructor(private readonly options: WorldOptions) {
    const terrain = new PointCloudEntity(
      PointVolumeFactory.terrain(28, 0.2),
      createInkPointMaterial({ size: 0.012, opacity: 0.78 }),
      0.9,
      0.04
    );

    const skyMaterial = createInkPointMaterial({ size: 0.024, opacity: 0.3 });
    skyMaterial.fog = false;
    skyMaterial.depthWrite = false;

    this.moonMaterial = createInkPointMaterial({ size: 0.042, opacity: 1 });
    this.moonMaterial.fog = false;
    this.moonMaterial.depthWrite = false;
    this.moonMaterial.color.set(0xfff0df);

    const moonTearMaterial = createInkPointMaterial({ size: 0.035, opacity: 1 });
    moonTearMaterial.fog = false;
    moonTearMaterial.depthWrite = false;
    moonTearMaterial.color.set(0xd70011);

    this.bloodSkyMaterial = createInkPointMaterial({ size: 0.038, opacity: 1 });
    this.bloodSkyMaterial.fog = false;
    this.bloodSkyMaterial.depthWrite = false;
    this.bloodSkyMaterial.transparent = true;
    this.bloodSkyMaterial.opacity = 0;
    this.bloodSkyMaterial.color.set(0xcf000b);

    const sky = new PointCloudEntity(
      PointVolumeFactory.twilightSky(22000, 12, 24),
      skyMaterial,
      0.35,
      0.08
    );

    const bloodMoon = new PointCloudEntity(
      PointVolumeFactory.bloodMoon(7600, 2.1),
      this.moonMaterial,
      0.22,
      0.05
    );
    this.moonTears = new THREE.Points(PointVolumeFactory.moonTears(1800, 2.1), moonTearMaterial);
    this.bloodSkyFill = new THREE.Points(PointVolumeFactory.bloodSkyFill(28000, 23), this.bloodSkyMaterial);
    sky.points.renderOrder = -20;
    bloodMoon.points.renderOrder = -19;
    this.moonTears.renderOrder = -18;
    this.bloodSkyFill.renderOrder = -17;
    this.moonGroup.position.set(6.2, 7.4, 4.5);
    this.moonGroup.add(bloodMoon.points, this.moonTears, this.bloodSkyFill);
    this.moonTears.visible = false;
    this.bloodSkyFill.visible = false;
    this.bloodSkyFill.scale.setScalar(0.08);

    this.pointCount += terrain.points.geometry.getAttribute("position").count;
    this.pointCount += sky.points.geometry.getAttribute("position").count;
    this.pointCount += bloodMoon.points.geometry.getAttribute("position").count;
    this.pointCount += this.moonTears.geometry.getAttribute("position").count;
    this.pointCount += this.bloodSkyFill.geometry.getAttribute("position").count;
    this.entities.push(terrain, sky, bloodMoon);
    this.skySurfaces.add(sky.points, this.moonGroup);
    this.root.add(this.skySurfaces, terrain.points, this.floorSurfaces, this.shadows, this.stippleSurfaces, this.structures);
    this.addFloorSkin();
    this.createMaze();
    this.createGate();
    this.createNavigationPoints();
    this.createHidingSpots();
    this.createEnemies();
  }

  update(dt: number, cameraPosition: THREE.Vector3, motionIntensity: number): void {
    this.time += dt;
    this.updateLunarCycle(dt);
    this.hiddenTimer = Math.max(0, this.hiddenTimer - dt);
    this.interactionPulse = Math.max(0, this.interactionPulse - dt * 1.8);

    const visualIntensity = motionIntensity + this.interactionPulse;
    for (const entity of this.entities) {
      entity.update(this.time, visualIntensity);
    }

    for (const enemy of this.enemies) {
      enemy.update(dt);
    }

    for (const ai of this.enemyAIs) {
      ai.update(dt, this.time);
    }

    const horizonPull = THREE.MathUtils.clamp(cameraPosition.z / 120, -0.24, 0.24);
    this.root.position.y = Math.sin(this.time * 0.28) * 0.025 - horizonPull;
    this.updateMoonBillboard(cameraPosition);
  }

  isBloodMoonActive(): boolean {
    return this.bloodMoonActive;
  }

  forceBloodMoon(): void {
    this.lunarCycleTime = PointCloudWorld.calmMoonDuration;
    this.updateLunarCycle(0);
  }

  setXRayMode(active: boolean, playerPosition: THREE.Vector3): void {
    for (const enemy of this.enemies) {
      enemy.setWallOccluded(this.raycastWall(playerPosition, enemy.position));
      enemy.setXRayVisible(active && enemy.position.distanceTo(playerPosition) <= PointCloudWorld.xRayRange);
    }
  }

  collidesAt(position: THREE.Vector3, radius = 0.42): boolean {
    const playerBox = new THREE.Box3(
      new THREE.Vector3(position.x - radius, -0.75, position.z - radius),
      new THREE.Vector3(position.x + radius, 2.15, position.z + radius)
    );

    return this.collisionBoxes.some((box) => box.intersectsBox(playerBox));
  }

  interact(playerPosition: THREE.Vector3): boolean {
    this.interactionPulse = 1.2;
    if (!this.bloodMoonActive) return false;
    const spot = this.hidingSpots.find((candidate) => candidate.buttonPosition.distanceTo(playerPosition) <= candidate.radius);
    if (!spot) return false;
    this.hiddenTimer = 8;
    return true;
  }

  addNoise(position: THREE.Vector3, intensity: number): void {
    this.noiseEvents.push({ position: position.clone(), intensity, time: this.time });
    while (this.noiseEvents.length > 24) this.noiseEvents.shift();
  }

  getDebugState(): {
    walls: number;
    points: number;
    pulse: number;
    moon: { blood: boolean; secondsRemaining: number; progress: number };
    hidden: { active: boolean; secondsRemaining: number };
    enemy?: ReturnType<EnemyAI["getDebugState"]>;
  } {
    const cycleLength = PointCloudWorld.calmMoonDuration + PointCloudWorld.bloodMoonDuration;
    const cycleTime = this.lunarCycleTime % cycleLength;
    const remaining = this.bloodMoonActive
      ? cycleLength - cycleTime
      : PointCloudWorld.calmMoonDuration - cycleTime;
    const bloodProgress = this.bloodMoonActive
      ? THREE.MathUtils.clamp((cycleTime - PointCloudWorld.calmMoonDuration) / PointCloudWorld.bloodMoonDuration, 0, 1)
      : 0;

    return {
      walls: this.collisionBoxes.length,
      points: this.pointCount,
      pulse: Number(this.interactionPulse.toFixed(3)),
      moon: {
        blood: this.bloodMoonActive,
        secondsRemaining: Math.max(0, Math.ceil(remaining)),
        progress: Number(bloodProgress.toFixed(3))
      },
      hidden: {
        active: this.isPlayerHidden(),
        secondsRemaining: Math.ceil(this.hiddenTimer)
      },
      enemy: this.enemyAIs[0]?.getDebugState()
    };
  }

  isPlayerHidden(): boolean {
    return this.hiddenTimer > 0;
  }

  raycastWall(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const direction = to.clone().sub(from);
    const distance = direction.length();
    if (distance <= 0.001) return false;
    const ray = new THREE.Ray(from.clone(), direction.normalize());
    return this.collisionBoxes.some((box) => {
      const hit = new THREE.Vector3();
      return ray.intersectBox(box, hit) !== null && hit.distanceTo(from) < distance;
    });
  }

  clampEnemyMove(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
    if (!this.collidesAt(to, 0.34)) return to;
    const xOnly = new THREE.Vector3(to.x, from.y, from.z);
    if (!this.collidesAt(xOnly, 0.34)) return xOnly;
    const zOnly = new THREE.Vector3(from.x, from.y, to.z);
    if (!this.collidesAt(zOnly, 0.34)) return zOnly;
    return from;
  }

  getRecentNoises(time: number): NoiseEvent[] {
    return this.noiseEvents.filter((noise) => time - noise.time < 3);
  }

  getHidingPointNear(position: THREE.Vector3): THREE.Vector3 {
    return this.pickPoint(position, 4, 11, true);
  }

  getAmbushPoint(position: THREE.Vector3, direction: THREE.Vector3): THREE.Vector3 {
    let best = this.navigationPoints[0] ?? position;
    let bestScore = -Infinity;
    for (const point of this.navigationPoints) {
      const distance = point.distanceTo(position);
      const ahead = point.clone().sub(position).setY(0).normalize().dot(direction);
      const hidden = this.raycastWall(position, point);
      const score = (hidden ? 24 : -12) + (ahead > 0.15 ? 14 : 0) - Math.abs(distance - 6) * 2;
      if (score > bestScore) {
        best = point;
        bestScore = score;
      }
    }
    return best.clone();
  }

  getWatchPoint(position: THREE.Vector3, direction: THREE.Vector3): THREE.Vector3 {
    let best = this.navigationPoints[0] ?? position;
    let bestScore = -Infinity;
    for (const point of this.navigationPoints) {
      const distance = point.distanceTo(position);
      if (distance < 4.2 || distance > 8.2) continue;
      if (this.raycastWall(position, point)) continue;

      const toPoint = point.clone().sub(position).setY(0).normalize();
      const viewDot = direction.clone().setY(0).normalize().dot(toPoint);
      const centeredEnough = viewDot > 0.22;
      const uneasyPeripheral = viewDot > 0.42 && viewDot < 0.88 ? 10 : 0;
      const score =
        (centeredEnough ? 18 : -12) +
        uneasyPeripheral -
        Math.abs(distance - 6.2) * 2 +
        Math.random() * 4;

      if (score > bestScore) {
        best = point;
        bestScore = score;
      }
    }
    return best.clone();
  }

  getCornerPeekPoint(position: THREE.Vector3, direction: THREE.Vector3): THREE.Vector3 {
    let best = this.getWatchPoint(position, direction);
    let bestScore = -Infinity;
    const forward = direction.clone().setY(0).normalize();

    for (const point of this.navigationPoints) {
      const distance = point.distanceTo(position);
      if (distance < 8.2 || distance > 13.5) continue;
      if (this.raycastWall(position, point)) continue;

      const toPoint = point.clone().sub(position).setY(0).normalize();
      const viewDot = forward.dot(toPoint);
      if (viewDot < 0.12) continue;

      const wallDistance = this.distanceToNearestWall(point);
      const cornerDistance = this.distanceToNearestWallCorner(point);
      const cornerScore = THREE.MathUtils.clamp(1.6 - cornerDistance, 0, 1.6) * 16;
      const wallScore = THREE.MathUtils.clamp(1.45 - wallDistance, 0, 1.45) * 8;
      const peripheral = viewDot > 0.24 && viewDot < 0.78 ? 10 : 0;
      const score =
        cornerScore +
        wallScore +
        peripheral -
        Math.abs(distance - 10.5) * 1.8 +
        Math.random() * 5;

      if (score > bestScore) {
        best = point;
        bestScore = score;
      }
    }

    return best.clone();
  }

  getDistantHuntStartPoint(position: THREE.Vector3): THREE.Vector3 {
    let best = this.navigationPoints[0] ?? position;
    let bestScore = -Infinity;

    for (const point of this.navigationPoints) {
      const distance = point.distanceTo(position);
      if (distance < 14) continue;
      const hidden = this.raycastWall(position, point);
      const score = distance * 1.8 + (hidden ? 18 : 0) + Math.random() * 6;
      if (score > bestScore) {
        best = point;
        bestScore = score;
      }
    }

    return best.clone();
  }

  getSearchPointNear(position: THREE.Vector3): THREE.Vector3 {
    return this.pickPoint(position, 1, 5, false);
  }

  getPathStep(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
    if (this.navigationPoints.length === 0) return to;
    const start = this.nearestNavigationIndex(from);
    const goal = this.nearestNavigationIndex(to);
    if (start === goal) return to;

    const path = this.findPath(start, goal);
    if (path.length < 2) return this.navigationPoints[goal].clone();
    return this.navigationPoints[path[1]].clone();
  }

  private createMaze(): void {
    const maze = [
      "#################",
      "#...#.......#...#",
      "#.#.#.#####.#.#.#",
      "#.#...#...#...#.#",
      "#.#####.#.#####.#",
      "#.....#.#.....#.#",
      "#####.#.#####.#.#",
      "#.....#.....#...#",
      "#.#########.###.#",
      "#.#.......#.....#",
      "#.#.#####.#####.#",
      "#...#.........#.#",
      "###.#.#######.#.#",
      "#...............#",
      "#################"
    ];

    const cellSize = 2.35;
    const wallHeight = 3.25;
    const offsetX = -((maze[0].length - 1) * cellSize) / 2;
    const offsetZ = -13;

    for (const segment of this.mergeMazeWalls(maze)) {
      this.addWall({
        position: new THREE.Vector3(
          offsetX + (segment.col + segment.width / 2 - 0.5) * cellSize,
          -0.82,
          offsetZ + (segment.row + segment.height / 2 - 0.5) * cellSize
        ),
        size: new THREE.Vector3(segment.width * cellSize, wallHeight, segment.height * cellSize)
      });
    }

    this.addWall({
      position: new THREE.Vector3(0, -0.82, offsetZ + maze.length * cellSize + 2.8),
      size: new THREE.Vector3(8, 5.3, 0.9)
    });
  }

  private createGate(): void {
    const gate = new PointCloudEntity(
      PointVolumeFactory.surfaceBox({
        width: 9,
        height: 6,
        depth: 1,
        step: 0.1,
        colorA: 0x111111,
        colorB: 0x000000,
        density: 1,
        depthShading: true,
        samplesPerCell: 13
      }),
      createInkPointMaterial({ size: 0.026, opacity: 0.72 }),
      1.6,
      0.12
    );

    gate.points.position.set(0, -0.82, 26);
    this.pointCount += gate.points.geometry.getAttribute("position").count;
    this.entities.push(gate);
    this.structures.add(gate.points);
    this.addStippleSkin(new THREE.Vector3(0, -0.82, 26), new THREE.Vector3(9, 6, 1));
  }

  private createEnemies(): void {
    const enemy = new EnemyBillboard(`${import.meta.env.BASE_URL}assets/enemy.png`, new THREE.Vector3(7.2, 1.1, 13.2));
    const ai = new EnemyAI(
      enemy,
      () => ({
        position: this.options.getPlayerPosition(),
        direction: this.options.getPlayerDirection(),
        motion: this.options.getPlayerMotion()
      }),
      {
        raycastWall: (from, to) => this.raycastWall(from, to),
        getPathStep: (from, to) => this.getPathStep(from, to),
        getHidingPointNear: (position) => this.getHidingPointNear(position),
        getAmbushPoint: (position, direction) => this.getAmbushPoint(position, direction),
        getWatchPoint: (position, direction) => this.getWatchPoint(position, direction),
        getCornerPeekPoint: (position, direction) => this.getCornerPeekPoint(position, direction),
        getSearchPointNear: (position) => this.getSearchPointNear(position),
        clampEnemyMove: (from, to) => this.clampEnemyMove(from, to),
        getRecentNoises: (time) => this.getRecentNoises(time),
        isBloodMoonActive: () => this.isBloodMoonActive(),
        isPlayerHidden: () => this.isPlayerHidden(),
        onJumpscare: () => this.options.onJumpscare(),
        onPlayerKilled: () => this.options.onPlayerKilled(),
        onStateChange: (state) => this.options.onEnemyStateChange(state)
      }
    );
    this.enemies.push(enemy);
    this.enemyAIs.push(ai);
    this.root.add(enemy.root);
  }

  private createNavigationPoints(): void {
    for (let x = -16; x <= 16; x += 2.35) {
      for (let z = -9; z <= 22; z += 2.35) {
        const point = new THREE.Vector3(x, 1.1, z);
        if (!this.collidesAt(point, 0.46)) this.navigationPoints.push(point);
      }
    }

    const maxLinkDistance = 2.55;
    for (let i = 0; i < this.navigationPoints.length; i++) {
      const links: number[] = [];
      for (let j = 0; j < this.navigationPoints.length; j++) {
        if (i === j) continue;
        const distance = this.navigationPoints[i].distanceTo(this.navigationPoints[j]);
        if (distance <= maxLinkDistance && !this.raycastWall(this.navigationPoints[i], this.navigationPoints[j])) {
          links.push(j);
        }
      }
      this.navigationLinks.set(i, links);
    }
  }

  private createHidingSpots(): void {
    const chosen: THREE.Vector3[] = [];
    const candidates = [...this.navigationPoints]
      .sort(() => Math.random() - 0.5)
      .filter((point) => point.z < 20 && point.z > -8 && Math.abs(point.x) < 15);

    for (const point of candidates) {
      if (chosen.length >= 7) break;
      if (chosen.some((existing) => existing.distanceTo(point) < 7)) continue;
      if (this.distanceToNearestWall(point) < 0.8) continue;
      chosen.push(point.clone());
    }

    for (const point of chosen) {
      const buttonPosition = this.getNearestWallButtonPosition(point);
      this.hidingSpots.push({ position: point.clone(), buttonPosition, radius: 1.85 });
      this.addHidingSpotVisual(buttonPosition);
    }
  }

  private addHidingSpotVisual(position: THREE.Vector3): void {
    const button = new PointCloudEntity(
      PointVolumeFactory.surfaceBox({
        width: 0.5,
        height: 0.5,
        depth: 0.12,
        step: 0.045,
        colorA: 0xff1f1f,
        colorB: 0x420000,
        density: 1,
        depthShading: true,
        samplesPerCell: 6
      }),
      createInkPointMaterial({ size: 0.02, opacity: 1 }),
      3.2,
      0.28
    );
    button.points.position.copy(position);

    this.pointCount += button.points.geometry.getAttribute("position").count;
    this.entities.push(button);
    this.structures.add(button.points);
  }

  private nearestNavigationIndex(position: THREE.Vector3): number {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < this.navigationPoints.length; i++) {
      const distance = this.navigationPoints[i].distanceToSquared(position);
      if (distance < bestDistance) {
        bestIndex = i;
        bestDistance = distance;
      }
    }
    return bestIndex;
  }

  private findPath(start: number, goal: number): number[] {
    const open = new Set<number>([start]);
    const cameFrom = new Map<number, number>();
    const gScore = new Map<number, number>([[start, 0]]);
    const fScore = new Map<number, number>([[start, this.navigationPoints[start].distanceTo(this.navigationPoints[goal])]]);

    while (open.size > 0) {
      let current = [...open].reduce((best, node) => (fScore.get(node)! < fScore.get(best)! ? node : best));
      if (current === goal) return this.reconstructPath(cameFrom, current);

      open.delete(current);
      for (const neighbor of this.navigationLinks.get(current) ?? []) {
        const tentative = (gScore.get(current) ?? Infinity) + this.navigationPoints[current].distanceTo(this.navigationPoints[neighbor]);
        if (tentative >= (gScore.get(neighbor) ?? Infinity)) continue;
        cameFrom.set(neighbor, current);
        gScore.set(neighbor, tentative);
        fScore.set(neighbor, tentative + this.navigationPoints[neighbor].distanceTo(this.navigationPoints[goal]));
        open.add(neighbor);
      }
    }

    return [start, goal];
  }

  private reconstructPath(cameFrom: Map<number, number>, current: number): number[] {
    const path = [current];
    while (cameFrom.has(current)) {
      current = cameFrom.get(current)!;
      path.unshift(current);
    }
    return path;
  }

  private pickPoint(origin: THREE.Vector3, minDistance: number, maxDistance: number, preferHidden: boolean): THREE.Vector3 {
    let best = this.navigationPoints[0] ?? origin;
    let bestScore = -Infinity;
    for (const point of this.navigationPoints) {
      const distance = point.distanceTo(origin);
      if (distance < minDistance || distance > maxDistance) continue;
      const hidden = this.raycastWall(origin, point);
      const score = (preferHidden && hidden ? 20 : 0) + Math.random() * 5 - Math.abs(distance - (minDistance + maxDistance) / 2);
      if (score > bestScore) {
        best = point;
        bestScore = score;
      }
    }
    return best.clone();
  }

  private distanceToNearestWall(point: THREE.Vector3): number {
    let best = Infinity;
    for (const box of this.collisionBoxes) {
      const clamped = point.clone().clamp(box.min, box.max);
      best = Math.min(best, clamped.distanceTo(point));
    }
    return best;
  }

  private distanceToNearestWallCorner(point: THREE.Vector3): number {
    let best = Infinity;
    for (const box of this.collisionBoxes) {
      const corners = [
        new THREE.Vector3(box.min.x, point.y, box.min.z),
        new THREE.Vector3(box.min.x, point.y, box.max.z),
        new THREE.Vector3(box.max.x, point.y, box.min.z),
        new THREE.Vector3(box.max.x, point.y, box.max.z)
      ];
      for (const corner of corners) best = Math.min(best, corner.distanceTo(point));
    }
    return best;
  }

  private getNearestWallButtonPosition(point: THREE.Vector3): THREE.Vector3 {
    let best = point.clone();
    let bestDistance = Infinity;

    for (const box of this.collisionBoxes) {
      const clamped = point.clone().clamp(box.min, box.max);
      const distance = clamped.distanceTo(point);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = clamped;
    }

    const direction = point.clone().sub(best).setY(0);
    if (direction.lengthSq() > 0.001) direction.normalize().multiplyScalar(0.08);
    best.add(direction);
    best.y = 0.72;
    return best;
  }

  private mergeMazeWalls(maze: string[]): Array<{ row: number; col: number; width: number; height: number }> {
    const visited = maze.map((row) => [...row].map(() => false));
    const segments: Array<{ row: number; col: number; width: number; height: number }> = [];

    for (let row = 0; row < maze.length; row++) {
      for (let col = 0; col < maze[row].length; col++) {
        if (visited[row][col] || maze[row][col] !== "#") continue;

        let width = 0;
        while (col + width < maze[row].length && maze[row][col + width] === "#" && !visited[row][col + width]) {
          width++;
        }

        let height = 1;
        while (row + height < maze.length) {
          let canExtend = true;
          for (let x = col; x < col + width; x++) {
            if (maze[row + height][x] !== "#" || visited[row + height][x]) {
              canExtend = false;
              break;
            }
          }
          if (!canExtend) break;
          height++;
        }

        for (let y = row; y < row + height; y++) {
          for (let x = col; x < col + width; x++) {
            visited[y][x] = true;
          }
        }

        segments.push({ row, col, width, height });
      }
    }

    return segments;
  }

  private addWall(wall: WallSpec): void {
    const entity = new PointCloudEntity(
      PointVolumeFactory.surfaceBox({
        width: wall.size.x,
        height: wall.size.y,
        depth: wall.size.z,
        step: 0.1,
        colorA: 0x6e6e6e,
        colorB: 0x000000,
        density: 1,
        depthShading: true,
        samplesPerCell: 9
      }),
      createInkPointMaterial({ size: 0.019, opacity: 0.66 }),
      THREE.MathUtils.randFloat(0.55, 1.25),
      0.1
    );

    entity.points.position.copy(wall.position);
    this.pointCount += entity.points.geometry.getAttribute("position").count;
    this.entities.push(entity);
    this.structures.add(entity.points);
    this.addShadow(wall);
    this.addStippleSkin(wall.position, wall.size);

    this.collisionBoxes.push(
      new THREE.Box3(
        new THREE.Vector3(
          wall.position.x - wall.size.x / 2,
          wall.position.y,
          wall.position.z - wall.size.z / 2
        ),
        new THREE.Vector3(
          wall.position.x + wall.size.x / 2,
          wall.position.y + wall.size.y,
          wall.position.z + wall.size.z / 2
        )
      )
    );
  }

  private addShadow(wall: WallSpec): void {
    const shadow = new PointCloudEntity(
      PointVolumeFactory.shadowPatch({
        width: wall.size.x + 3.2,
        depth: wall.size.z + 5.6,
        step: 0.13,
        softness: 0.66
      }),
      createInkPointMaterial({ size: 0.032, opacity: 0.2 }),
      0.4,
      0.04
    );

    shadow.points.position.set(wall.position.x + 0.95, 0, wall.position.z + 1.45);
    shadow.points.rotation.y = -0.22;
    this.pointCount += shadow.points.geometry.getAttribute("position").count;
    this.entities.push(shadow);
    this.shadows.add(shadow.points);
  }

  private addStippleSkin(position: THREE.Vector3, size: THREE.Vector3): void {
    const geometry = new THREE.BoxGeometry(size.x * 1.004, size.y * 1.004, size.z * 1.004);
    const mesh = new THREE.Mesh(geometry, this.stippleMaterial);
    mesh.position.set(position.x, position.y + size.y / 2, position.z);
    this.stippleSurfaces.add(mesh);
  }

  private addFloorSkin(): void {
    const geometry = new THREE.PlaneGeometry(48, 48, 1, 1);
    const floor = new THREE.Mesh(geometry, this.floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.91, 11);
    this.floorSurfaces.add(floor);
  }

  private updateLunarCycle(dt: number): void {
    const cycleLength = PointCloudWorld.calmMoonDuration + PointCloudWorld.bloodMoonDuration;
    this.lunarCycleTime = (this.lunarCycleTime + dt) % cycleLength;
    const shouldBleed = this.lunarCycleTime >= PointCloudWorld.calmMoonDuration;

    if (shouldBleed === this.bloodMoonActive) return;
    this.bloodMoonActive = shouldBleed;
    this.moonTears.visible = shouldBleed;
    this.moonMaterial.color.set(shouldBleed ? 0xff1f1f : 0xfff0df);
    this.moonMaterial.size = shouldBleed ? 0.052 : 0.042;
    this.bloodSkyFill.visible = shouldBleed;

    if (shouldBleed) {
      this.relocateEnemiesForBloodMoon();
      this.options.onBloodMoonStart();
    } else {
      this.options.onBloodMoonEnd();
    }
  }

  private updateMoonBillboard(cameraPosition: THREE.Vector3): void {
    const lookTarget = cameraPosition.clone().sub(this.root.position);
    this.moonGroup.lookAt(lookTarget);

    if (!this.bloodMoonActive) {
      this.bloodSkyMaterial.opacity = THREE.MathUtils.lerp(this.bloodSkyMaterial.opacity, 0, 0.12);
      this.bloodSkyFill.scale.setScalar(0.08);
      return;
    }

    const bloodProgress = THREE.MathUtils.clamp(
      (this.lunarCycleTime - PointCloudWorld.calmMoonDuration) / PointCloudWorld.bloodMoonDuration,
      0,
      1
    );
    const spread = THREE.MathUtils.lerp(0.08, 2.45, THREE.MathUtils.smoothstep(bloodProgress, 0, 1));
    this.bloodSkyMaterial.opacity = THREE.MathUtils.lerp(0.12, 0.96, bloodProgress);
    this.bloodSkyFill.scale.set(spread, spread * 1.18, 1);
  }

  private relocateEnemiesForBloodMoon(): void {
    const playerPosition = this.options.getPlayerPosition();
    for (const [index, enemy] of this.enemies.entries()) {
      enemy.setPosition(this.getDistantHuntStartPoint(playerPosition));
      this.enemyAIs[index]?.forceBloodHunt();
    }
  }
}
