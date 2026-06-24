import * as THREE from "three";

export function createStippleSurfaceMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    uniforms: {
      dotDensity: { value: 540 },
      dotRadius: { value: 0.052 },
      inkOpacity: { value: 1.0 },
      lightDirection: { value: new THREE.Vector3(-0.35, 0.72, 0.42).normalize() }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      precision highp float;

      uniform float dotDensity;
      uniform float dotRadius;
      uniform float inkOpacity;
      uniform vec3 lightDirection;

      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        vec2 grid = vUv * dotDensity;
        vec2 cell = floor(grid);
        vec2 local = fract(grid) - 0.5;

        float h1 = hash(cell);
        float h2 = hash(cell + 19.37);
        vec2 offset = vec2(h1 - 0.5, h2 - 0.5) * 0.34;
        float distanceToDot = length(local - offset);

        float dotMask = 1.0 - smoothstep(dotRadius, dotRadius + 0.018, distanceToDot);
        float light = clamp(dot(normalize(vNormal), lightDirection) * 0.5 + 0.5, 0.0, 1.0);
        float heightShade = clamp(1.0 - (vWorldPosition.y + 1.0) * 0.13, 0.28, 1.0);
        float shadowBias = mix(1.18, 0.48, light) * heightShade;
        float paperBreakup = mix(0.78, 1.0, hash(cell + 83.21));
        float alpha = dotMask * inkOpacity * shadowBias * paperBreakup;

        if (alpha < 0.22) {
          discard;
        }

        gl_FragColor = vec4(vec3(0.0), 1.0);
      }
    `
  });
}
