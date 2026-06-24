import * as THREE from "three";

type InkPointMaterialOptions = {
  size: number;
  opacity: number;
};

let dotTexture: THREE.CanvasTexture | null = null;

export function createInkPointMaterial(options: InkPointMaterialOptions): THREE.PointsMaterial {
  return new THREE.PointsMaterial({
    size: options.size,
    map: getDotTexture(),
    alphaTest: 0.24,
    transparent: false,
    opacity: 1,
    vertexColors: true,
    depthWrite: true,
    sizeAttenuation: true
  });
}

function getDotTexture(): THREE.CanvasTexture {
  if (dotTexture) return dotTexture;

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create ink dot texture.");
  }

  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.78, "rgba(255,255,255,1)");
  gradient.addColorStop(0.9, "rgba(255,255,255,0.65)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");

  context.clearRect(0, 0, 64, 64);
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(32, 32, 30, 0, Math.PI * 2);
  context.fill();

  dotTexture = new THREE.CanvasTexture(canvas);
  dotTexture.minFilter = THREE.LinearFilter;
  dotTexture.magFilter = THREE.LinearFilter;
  dotTexture.generateMipmaps = false;
  dotTexture.needsUpdate = true;
  return dotTexture;
}
