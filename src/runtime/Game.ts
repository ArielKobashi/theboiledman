import { Scene3D } from "../scene/Scene3D";

export class Game {
  private readonly root: HTMLDivElement;
  private scene: Scene3D | null = null;

  constructor(root: HTMLDivElement) {
    this.root = root;
  }

  start(): void {
    this.scene = new Scene3D(this.root);
    this.scene.start();
  }
}
