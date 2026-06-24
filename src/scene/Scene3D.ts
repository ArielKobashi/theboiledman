import * as THREE from "three";
import { FirstPersonController } from "../systems/FirstPersonController";
import { StoryDirector } from "../story/StoryDirector";
import { PointCloudWorld } from "../world/PointCloudWorld";

type ChiptuneTheme = {
  duration: number;
  start: (onEnd?: () => void) => void;
  stop: () => void;
};

type ChiptuneThemeConstructor = new (audioCtx: AudioContext, output: AudioNode) => ChiptuneTheme;

declare global {
  interface Window {
    NormalTheme8Bit?: ChiptuneThemeConstructor;
    BloodMoonTheme8Bit?: ChiptuneThemeConstructor;
    webkitAudioContext?: typeof AudioContext;
  }
}

export class Scene3D {
  private readonly root: HTMLDivElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly moonTimerLabel: HTMLElement | null;
  private readonly moonTimerValue: HTMLElement | null;
  private readonly bloodMoonButton: HTMLButtonElement | null;
  private readonly startButton: HTMLButtonElement | null;
  private readonly lorePanel: HTMLElement | null;
  private readonly objectivePanel: HTMLElement | null;
  private readonly whisperPanel: HTMLElement | null;
  private readonly clock = new THREE.Clock();
  private readonly story = new StoryDirector();
  private readonly controller: FirstPersonController;
  private readonly world: PointCloudWorld;
  private animationFrameId = 0;
  private xRayActive = false;
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private normalTheme: ChiptuneTheme | null = null;
  private bloodTheme: ChiptuneTheme | null = null;
  private musicStarted = false;
  private dead = false;

  constructor(root: HTMLDivElement) {
    this.root = root;
    this.moonTimerLabel = document.querySelector(".moon-timer-label");
    this.moonTimerValue = document.querySelector(".moon-timer-value");
    this.bloodMoonButton = document.querySelector(".debug-bloodmoon-button");
    this.startButton = document.querySelector(".start-button");
    this.lorePanel = document.querySelector(".lore-panel");
    this.objectivePanel = document.querySelector(".objective-panel");
    this.whisperPanel = document.querySelector(".whisper-panel");
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xf8f7f1, 0.13);

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 28);
    this.camera.position.set(0, 1.7, 17.5);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(0.65);
    this.renderer.setClearColor(0xf8f7f1, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.root.appendChild(this.renderer.domElement);

    this.world = new PointCloudWorld({
      getPlayerPosition: () => this.camera.position.clone(),
      getPlayerDirection: () => this.controller?.getDirection() ?? new THREE.Vector3(0, 0, 1),
      getPlayerMotion: () => this.controller?.getMotionIntensity() ?? 0,
      onJumpscare: () => this.triggerJumpscare(),
      onPlayerKilled: () => this.killPlayer(),
      onBloodMoonStart: () => this.triggerBloodMoonRoar(),
      onBloodMoonEnd: () => this.handleBloodMoonEnd(),
      onEnemyStateChange: (state) => this.handleEnemyStateChange(state)
    });
    this.controller = new FirstPersonController(this.camera, this.renderer.domElement, {
      collidesAt: (position) => this.world.collidesAt(position),
      onInteract: (position) => this.handleInteract(position),
      onNoise: (position, intensity) => this.world.addNoise(position, intensity)
    });
    this.scene.add(this.world.root);

    window.addEventListener("resize", this.handleResize);
    window.addEventListener("keydown", this.handleKeyDown);
    this.bloodMoonButton?.addEventListener("click", this.handleForceBloodMoon);
    this.startButton?.addEventListener("click", this.handleStartGame);
    this.updateDebugState();
  }

  start(): void {
    this.loop();
  }

  private loop = (): void => {
    const dt = Math.min(this.clock.getDelta(), 1 / 30);
    if (!this.dead) this.controller.update(dt);
    this.world.update(dt, this.camera.position, this.controller.getMotionIntensity());
    this.world.setXRayMode(this.xRayActive, this.camera.position);
    this.updateDebugState();
    this.renderer.render(this.scene, this.camera);
    this.animationFrameId = window.requestAnimationFrame(this.loop);
  };

  private updateDebugState(): void {
    const debugState = {
      player: {
        x: Number(this.camera.position.x.toFixed(2)),
        y: Number(this.camera.position.y.toFixed(2)),
        z: Number(this.camera.position.z.toFixed(2))
      },
      motion: Number(this.controller.getMotionIntensity().toFixed(3)),
      xray: this.xRayActive,
      blocked: this.world.collidesAt(this.camera.position),
      world: this.world.getDebugState()
    };
    window.__ULTRA_DEBUG__ = debugState;
    document.documentElement.dataset.ultraDebug = JSON.stringify(debugState);
    this.updateBodyTensionClasses(debugState.world.enemy?.state, debugState.world.moon.blood, debugState.world.hidden.active);
    this.updateMoonTimer(debugState.world.moon);
    this.updateStory(debugState.world.enemy?.state, debugState.world.moon, debugState.world.hidden.active);
    document.documentElement.style.setProperty("--blood-progress", debugState.world.moon.progress.toString());
    const bloodFog = debugState.world.moon.progress;
    this.scene.fog = new THREE.FogExp2(new THREE.Color(0xf8f7f1).lerp(new THREE.Color(0x4a0b0b), bloodFog * 0.78), 0.13 + bloodFog * 0.075);
    this.renderer.setClearColor(new THREE.Color(0xf8f7f1).lerp(new THREE.Color(0x2d0505), bloodFog * 0.82), 1);
  }

  private handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || event.code !== "KeyX") return;
    this.xRayActive = !this.xRayActive;
    if (this.xRayActive) this.story.recordXRay();
    document.body.classList.toggle("is-xray-active", this.xRayActive);
    this.playTone(this.xRayActive ? 210 : 130, 0.18, "triangle", 0.035);
  };

  private handleForceBloodMoon = (): void => {
    this.world.forceBloodMoon();
  };

  private handleStartGame = (): void => {
    document.body.classList.add("has-started");
    this.story.start();
    this.ensureMusicStarted();
    this.renderer.domElement.requestPointerLock().catch(() => {
      // Browsers may refuse pointer lock from some embedded previews.
    });
  };

  private handleInteract(position: THREE.Vector3): void {
    const didHide = this.world.interact(position);
    if (!didHide) return;
    this.story.recordHide();
    this.controller.lockControls(0.95);
    document.body.classList.add("is-wall-hiding");
    window.setTimeout(() => document.body.classList.remove("is-wall-hiding"), 950);
  }

  private ensureMusicStarted = (): void => {
    if (this.musicStarted || !window.NormalTheme8Bit || !window.BloodMoonTheme8Bit) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    this.audioContext = new AudioContextClass();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.22;
    this.masterGain.connect(this.audioContext.destination);
    this.normalTheme = new window.NormalTheme8Bit(this.audioContext, this.masterGain);
    this.bloodTheme = new window.BloodMoonTheme8Bit(this.audioContext, this.masterGain);
    this.normalTheme.duration = 12 * 60 * 1000;
    this.bloodTheme.duration = 60 * 1000;
    this.musicStarted = true;
    this.startNormalTheme();
  };

  private startNormalTheme(): void {
    if (!this.musicStarted || !this.normalTheme || !this.bloodTheme) return;
    this.bloodTheme.stop();
    this.normalTheme.duration = 12 * 60 * 1000;
    this.normalTheme.start();
  }

  private startBloodMoonTheme(): void {
    if (!this.musicStarted || !this.normalTheme || !this.bloodTheme) return;
    this.normalTheme.stop();
    this.bloodTheme.duration = 60 * 1000;
    this.bloodTheme.start();
  }

  private triggerJumpscare(): void {
    this.controller.lockControls(1.2);
    document.body.classList.add("is-jumpscared");
    this.playTone(90, 0.7, "sawtooth", 0.14);
    window.setTimeout(() => this.playTone(42, 0.9, "square", 0.1), 80);
    window.setTimeout(() => document.body.classList.remove("is-jumpscared"), 900);
  }

  private killPlayer(): void {
    if (this.dead) return;
    this.dead = true;
    this.story.recordDeath();
    this.controller.lockControls(999);
    document.body.classList.add("is-dead");
    this.normalTheme?.stop();
    this.bloodTheme?.stop();
    this.playTone(38, 1.8, "sawtooth", 0.16);
    window.setTimeout(() => this.playTone(24, 1.3, "square", 0.1), 120);
  }

  private triggerBloodMoonRoar(): void {
    document.body.classList.add("is-blood-moon");
    this.story.recordBloodMoonStart();
    this.startBloodMoonTheme();
    this.playTone(58, 1.25, "sawtooth", 0.08);
    window.setTimeout(() => this.playTone(31, 1.4, "square", 0.055), 140);
    window.setTimeout(() => this.playTone(92, 0.65, "triangle", 0.045), 340);
  }

  private handleEnemyStateChange(state: string): void {
    this.story.recordEnemyState(state);
    if (state === "CHASE") this.playTone(64, 0.28, "triangle", 0.055);
    if (state === "WATCH" || state === "AMBUSH") this.playTone(118, 0.16, "sine", 0.035);
  }

  private handleBloodMoonEnd(): void {
    this.story.recordBloodMoonEnd();
    this.startNormalTheme();
  }

  private playTone(frequency: number, duration: number, type: OscillatorType, volume: number): void {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
    oscillator.addEventListener("ended", () => context.close());
  }

  private updateBodyTensionClasses(enemyState?: string, bloodMoon = false, hidden = false): void {
    const hunted = enemyState === "CHASE" || enemyState === "JUMPSCARE";
    const watched = enemyState === "WATCH" || enemyState === "AMBUSH" || enemyState === "INVESTIGATE";
    document.body.classList.toggle("is-hunted", hunted);
    document.body.classList.toggle("is-watched", watched);
    document.body.classList.toggle("is-blood-moon", bloodMoon);
    document.body.classList.toggle("is-hidden", hidden);
  }

  private updateMoonTimer(moon: { blood: boolean; secondsRemaining: number; progress: number }): void {
    if (!this.moonTimerLabel || !this.moonTimerValue) return;
    this.moonTimerLabel.textContent = moon.blood ? "CRIMSON AWAKENING" : "CRIMSON AWAKENING EM";
    this.moonTimerValue.textContent = this.formatTimer(moon.secondsRemaining);
  }

  private updateStory(
    enemyState: string | undefined,
    moon: { blood: boolean; secondsRemaining: number; progress: number },
    hidden: boolean
  ): void {
    const story = this.story.update({
      enemyState,
      moon,
      hidden,
      xray: this.xRayActive,
      dead: this.dead
    });

    if (this.lorePanel) {
      this.lorePanel.innerHTML = `<strong>${story.chapter}</strong><span>${story.logline}</span>`;
    }

    if (this.objectivePanel) {
      this.objectivePanel.textContent = `OBJETIVO: ${story.objective}`;
    }

    if (!this.whisperPanel) return;
    this.whisperPanel.textContent = story.whisper.text;
    this.whisperPanel.classList.toggle("is-visible", story.whisper.visible);
    this.whisperPanel.classList.toggle("is-blood", story.whisper.tone === "blood");
    this.whisperPanel.classList.toggle("is-watch", story.whisper.tone === "watch");
  }

  private formatTimer(totalSeconds: number): string {
    const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
}
