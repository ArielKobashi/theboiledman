import * as THREE from "three";

type VolumeOptions = {
  width: number;
  height: number;
  depth: number;
  step: number;
  colorA: THREE.ColorRepresentation;
  colorB: THREE.ColorRepresentation;
  hollow?: boolean;
  density?: number;
  depthShading?: boolean;
};

type ShadowPatchOptions = {
  width: number;
  depth: number;
  step: number;
  softness: number;
};

type SurfaceBoxOptions = VolumeOptions & {
  samplesPerCell: number;
};

export class PointVolumeFactory {
  static surfaceBox(options: SurfaceBoxOptions): THREE.BufferGeometry {
    const positions: number[] = [];
    const colors: number[] = [];
    const colorA = new THREE.Color(options.colorA);
    const colorB = new THREE.Color(options.colorB);
    const halfWidth = options.width / 2;
    const halfDepth = options.depth / 2;

    const addPoint = (x: number, y: number, z: number, faceShade: number): void => {
      const t = THREE.MathUtils.clamp(y / options.height, 0, 1);
      const edge = this.edgeFactor(x, y, z, options);
      const shade = options.depthShading ? this.depthShade(x, y, z, options, edge) : t;
      const ink = THREE.MathUtils.clamp(shade * 0.78 + faceShade + edge * 0.18, 0, 1);
      const color = colorA.clone().lerp(colorB, ink);

      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
    };

    const sampleOffsets = this.stratifiedOffsets(options.samplesPerCell);
    const topSampleOffsets = this.stratifiedOffsets(Math.max(1, Math.round(options.samplesPerCell * 0.45)));
    const jitter = options.step * 0.34;

    for (let y = 0; y <= options.height; y += options.step) {
      for (let z = -halfDepth; z <= halfDepth; z += options.step) {
        for (const offset of sampleOffsets) {
          addPoint(
            -halfWidth,
            y + offset.u * options.step + THREE.MathUtils.randFloatSpread(jitter * 0.2),
            z + offset.v * options.step + THREE.MathUtils.randFloatSpread(jitter * 0.2),
            0.08
          );
          addPoint(
            halfWidth,
            y + offset.v * options.step + THREE.MathUtils.randFloatSpread(jitter * 0.2),
            z + offset.u * options.step + THREE.MathUtils.randFloatSpread(jitter * 0.2),
            0.18
          );
        }
      }
    }

    for (let y = 0; y <= options.height; y += options.step) {
      for (let x = -halfWidth; x <= halfWidth; x += options.step) {
        for (const offset of sampleOffsets) {
          addPoint(
            x + offset.u * options.step + THREE.MathUtils.randFloatSpread(jitter * 0.2),
            y + offset.v * options.step + THREE.MathUtils.randFloatSpread(jitter * 0.2),
            -halfDepth,
            0.04
          );
          addPoint(
            x + offset.v * options.step + THREE.MathUtils.randFloatSpread(jitter * 0.2),
            y + offset.u * options.step + THREE.MathUtils.randFloatSpread(jitter * 0.2),
            halfDepth,
            0.24
          );
        }
      }
    }

    for (let x = -halfWidth; x <= halfWidth; x += options.step) {
      for (let z = -halfDepth; z <= halfDepth; z += options.step) {
        for (const offset of topSampleOffsets) {
          addPoint(
            x + offset.u * options.step + THREE.MathUtils.randFloatSpread(jitter * 0.25),
            options.height + THREE.MathUtils.randFloatSpread(jitter * 0.35),
            z + offset.v * options.step + THREE.MathUtils.randFloatSpread(jitter * 0.25),
            0.12
          );
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }

  static box(options: VolumeOptions): THREE.BufferGeometry {
    const positions: number[] = [];
    const colors: number[] = [];
    const colorA = new THREE.Color(options.colorA);
    const colorB = new THREE.Color(options.colorB);

    for (let x = -options.width / 2; x <= options.width / 2; x += options.step) {
      for (let y = 0; y <= options.height; y += options.step) {
        for (let z = -options.depth / 2; z <= options.depth / 2; z += options.step) {
          const nearSurface =
            Math.abs(Math.abs(x) - options.width / 2) < options.step ||
            Math.abs(Math.abs(z) - options.depth / 2) < options.step ||
            y < options.step ||
            Math.abs(y - options.height) < options.step;

          if (options.hollow && !nearSurface) continue;

          const jitter = options.step * 0.24;
          const t = THREE.MathUtils.clamp(y / options.height, 0, 1);
          const edge = this.edgeFactor(x, y, z, options);
          const shade = options.depthShading ? this.depthShade(x, y, z, options, edge) : t;
          const density = THREE.MathUtils.clamp((options.density ?? 1) * (0.72 + shade * 0.46 + edge * 0.2), 0, 1);

          if (Math.random() > density) continue;

          positions.push(
            x + THREE.MathUtils.randFloatSpread(jitter),
            y + THREE.MathUtils.randFloatSpread(jitter),
            z + THREE.MathUtils.randFloatSpread(jitter)
          );

          const color = colorA.clone().lerp(colorB, THREE.MathUtils.clamp(shade + t * 0.15, 0, 1));
          colors.push(color.r, color.g, color.b);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }

  static terrain(size: number, step: number): THREE.BufferGeometry {
    const positions: number[] = [];
    const colors: number[] = [];
    const low = new THREE.Color(0x242424);
    const high = new THREE.Color(0x050505);

    for (let x = -size; x <= size; x += step) {
      for (let z = -size; z <= size; z += step) {
        const wave = Math.sin(x * 0.22) * Math.cos(z * 0.22);
        const ridge = Math.sin((x + z) * 0.08);
        const height = wave * 0.65 + ridge * 0.35 - 0.85;
        positions.push(x, height, z);

        const slope = Math.abs(wave - ridge);
        const shade = THREE.MathUtils.clamp((height + 1.5) / 2.5 + slope * 0.28, 0, 1);
        const color = low.clone().lerp(high, shade);
        colors.push(color.r, color.g, color.b);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }

  static shadowPatch(options: ShadowPatchOptions): THREE.BufferGeometry {
    const positions: number[] = [];
    const colors: number[] = [];
    const contact = new THREE.Color(0x111111);
    const fade = new THREE.Color(0x8a8a8a);

    for (let x = -options.width / 2; x <= options.width / 2; x += options.step) {
      for (let z = -options.depth / 2; z <= options.depth / 2; z += options.step) {
        const nx = Math.abs(x) / (options.width / 2);
        const nz = Math.abs(z) / (options.depth / 2);
        const falloff = THREE.MathUtils.clamp(1 - Math.max(nx * 0.72, nz), 0, 1);
        const density = THREE.MathUtils.clamp(falloff * options.softness, 0, 0.92);

        if (Math.random() > density) continue;

        const jitter = options.step * 0.45;
        positions.push(
          x + THREE.MathUtils.randFloatSpread(jitter),
          -0.905 + THREE.MathUtils.randFloatSpread(0.015),
          z + THREE.MathUtils.randFloatSpread(jitter)
        );

        const color = fade.clone().lerp(contact, falloff);
        colors.push(color.r, color.g, color.b);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }

  private static edgeFactor(x: number, y: number, z: number, options: VolumeOptions): number {
    const dx = 1 - Math.abs(x) / (options.width / 2);
    const dz = 1 - Math.abs(z) / (options.depth / 2);
    const dy = Math.min(y, options.height - y) / options.height;
    return THREE.MathUtils.clamp(1 - Math.min(dx, dz, dy * 3), 0, 1);
  }

  private static stratifiedOffsets(samples: number): Array<{ u: number; v: number }> {
    const side = Math.ceil(Math.sqrt(samples));
    const offsets: Array<{ u: number; v: number }> = [];

    for (let index = 0; index < samples; index++) {
      const row = Math.floor(index / side);
      const col = index % side;
      const wobble = ((index * 7) % 11) / 11 - 0.5;

      offsets.push({
        u: (col + 0.5 + wobble * 0.16) / side - 0.5,
        v: (row + 0.5 - wobble * 0.16) / side - 0.5
      });
    }

    return offsets;
  }

  private static depthShade(x: number, y: number, z: number, options: VolumeOptions, edge: number): number {
    const heightShade = 1 - THREE.MathUtils.clamp(y / options.height, 0, 1) * 0.42;
    const sideShade = THREE.MathUtils.clamp((z / (options.depth / 2) + 1) / 2, 0, 1) * 0.28;
    const faceShade = Math.abs(x) > Math.abs(z) ? 0.12 : 0;
    const contactShadow = THREE.MathUtils.clamp(1 - y / (options.height * 0.35), 0, 1) * 0.32;
    return THREE.MathUtils.clamp(heightShade + sideShade + faceShade + contactShadow + edge * 0.18, 0, 1);
  }

  static sphere(count: number, radiusMin: number, radiusMax: number): THREE.BufferGeometry {
    const positions: number[] = [];
    const colors: number[] = [];
    const inner = new THREE.Color(0x89706c);
    const outer = new THREE.Color(0x1b1518);

    for (let i = 0; i < count; i++) {
      const radius = THREE.MathUtils.randFloat(radiusMin, radiusMax);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );

      const color = inner.clone().lerp(outer, (radius - radiusMin) / (radiusMax - radiusMin));
      colors.push(color.r, color.g, color.b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }

  static twilightSky(count: number, radiusMin: number, radiusMax: number): THREE.BufferGeometry {
    const positions: number[] = [];
    const colors: number[] = [];
    const dusk = new THREE.Color(0x8f5b50);
    const bruise = new THREE.Color(0x2b2730);
    const ink = new THREE.Color(0x070505);

    for (let i = 0; i < count; i++) {
      const radius = THREE.MathUtils.randFloat(radiusMin, radiusMax);
      const theta = Math.random() * Math.PI * 2;
      const yBias = Math.pow(Math.random(), 1.7);
      const y = THREE.MathUtils.lerp(-0.18, 0.78, yBias);
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const x = Math.cos(theta) * ring;
      const z = Math.sin(theta) * ring;
      const horizon = THREE.MathUtils.clamp(1 - Math.abs(y + 0.12) * 1.9, 0, 1);
      const upper = THREE.MathUtils.clamp(y, 0, 1);
      const color = dusk.clone().lerp(bruise, upper).lerp(ink, Math.random() * 0.26 + (1 - horizon) * 0.18);

      positions.push(x * radius, y * radius, z * radius);
      colors.push(color.r, color.g, color.b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }

  static bloodMoon(count: number, radius: number): THREE.BufferGeometry {
    const positions: number[] = [];
    const colors: number[] = [];
    const glow = new THREE.Color(0xffeee0);
    const ash = new THREE.Color(0x9b8f8b);
    const clotted = new THREE.Color(0x3d2d2d);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius;
      const scar = Math.sin(angle * 5 + distance * 3.4) * 0.5 + 0.5;
      const edge = THREE.MathUtils.clamp(distance / radius, 0, 1);
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      const z = THREE.MathUtils.randFloatSpread(0.08);
      const color = glow.clone().lerp(ash, edge * 0.7 + scar * 0.12).lerp(clotted, Math.pow(edge, 2.2) * 0.28);

      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }

  static moonTears(count: number, radius: number): THREE.BufferGeometry {
    const positions: number[] = [];
    const colors: number[] = [];
    const fresh = new THREE.Color(0xff1f1f);
    const dark = new THREE.Color(0x4d0206);

    for (let i = 0; i < count; i++) {
      const column = THREE.MathUtils.randFloatSpread(radius * 0.95);
      const fall = Math.pow(Math.random(), 1.7) * radius * 2.8;
      const width = THREE.MathUtils.clamp(1 - fall / (radius * 2.8), 0.08, 1);
      const x = column * width;
      const y = -radius * 0.42 - fall;
      const z = THREE.MathUtils.randFloatSpread(0.06);
      const color = fresh.clone().lerp(dark, fall / (radius * 2.8));

      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }

  static bloodSkyFill(count: number, radius: number): THREE.BufferGeometry {
    const positions: number[] = [];
    const colors: number[] = [];
    const fresh = new THREE.Color(0xff1b1b);
    const smoke = new THREE.Color(0x3a0306);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.pow(Math.random(), 0.72) * radius;
      const x = Math.cos(angle) * distance * 1.18;
      const y = Math.sin(angle) * distance * 0.72 + Math.random() * radius * 0.28;
      const z = THREE.MathUtils.randFloatSpread(0.3);
      const color = fresh.clone().lerp(smoke, Math.min(1, distance / radius) * 0.76 + Math.random() * 0.18);

      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }
}
