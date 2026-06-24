import * as THREE from "three";

export function createStippleFloorMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    uniforms: {
      dotDensity: { value: 540 },
      dotRadius: { value: 0.052 },
      fadeDistance: { value: 24 }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      precision highp float;

      uniform float dotDensity;
      uniform float dotRadius;
      uniform float fadeDistance;

      varying vec2 vUv;
      varying vec3 vWorldPosition;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(41.91, 289.12))) * 9358.5453);
      }

      void main() {
        vec2 grid = vUv * dotDensity;
        vec2 cell = floor(grid);
        vec2 local = fract(grid) - 0.5;
        vec2 offset = vec2(hash(cell) - 0.5, hash(cell + 17.0) - 0.5) * 0.3;
        float mask = 1.0 - smoothstep(dotRadius, dotRadius + 0.015, length(local - offset));
        float distanceFade = 1.0 - smoothstep(fadeDistance * 0.68, fadeDistance, length(vWorldPosition.xz));
        float grain = mix(0.72, 1.0, hash(cell + 81.0));
        float alpha = mask * distanceFade * grain;

        if (alpha < 0.2) {
          discard;
        }

        gl_FragColor = vec4(vec3(0.0), 1.0);
      }
    `
  });
}
