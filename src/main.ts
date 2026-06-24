import { Game } from "./runtime/Game";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

const game = new Game(app);
game.start();
