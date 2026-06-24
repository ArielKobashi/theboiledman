/// <reference types="vite/client" />

export {};

declare global {
  interface Window {
    __ULTRA_DEBUG__?: {
      player: {
        x: number;
        y: number;
        z: number;
      };
      motion: number;
      blocked: boolean;
      world: {
        walls: number;
        points: number;
        pulse: number;
        enemy?: {
          state: string;
          tension: number;
          distance: number;
        };
      };
    };
  }
}
