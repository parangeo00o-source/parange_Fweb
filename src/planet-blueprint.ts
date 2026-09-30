import * as THREE from 'three'

export type BlueprintSurface = 'land' | 'paper' | 'ink' | 'water'
const ink = new THREE.Color('#2675d3')
const paper = new THREE.Color('#f2f4e9')

/** Real mesh geometry, rendered with two-color printed surfaces instead of PBR. */
export const blueprintMaterial = (surface: BlueprintSurface, map: THREE.Texture | null = null) => new THREE.ShaderMaterial({
  uniforms: {
    ink: { value: ink.clone() }, paper: { value: paper.clone() },
    mode: { value: ['land', 'paper', 'ink', 'water'].indexOf(surface) },
    image: { value: map }, hasImage: { value: map ? 1 : 0 },
  },
  side: THREE.DoubleSide,
  transparent: Boolean(map),
  toneMapped: false,
  vertexShader: `
    varying vec3 localPoint;
    varying vec3 surfaceNormal;
    varying vec3 viewDirection;
    varying vec2 imageUV;
    void main() {
      localPoint = position;
      imageUV = uv;
      vec4 point = vec4(position, 1.0);
      vec3 n = normal;
      #ifdef USE_INSTANCING
        point = instanceMatrix * point;
        mat3 instanceNormal = mat3(instanceMatrix);
        n /= vec3(dot(instanceNormal[0], instanceNormal[0]), dot(instanceNormal[1], instanceNormal[1]), dot(instanceNormal[2], instanceNormal[2]));
        n = instanceNormal * n;
      #endif
      vec4 viewPoint = modelViewMatrix * point;
      surfaceNormal = normalize(normalMatrix * n);
      viewDirection = -viewPoint.xyz;
      gl_Position = projectionMatrix * viewPoint;
    }
  `,
  fragmentShader: `
    uniform vec3 ink;
    uniform vec3 paper;
    uniform int mode;
    uniform sampler2D image;
    uniform int hasImage;
    varying vec3 localPoint;
    varying vec3 surfaceNormal;
    varying vec3 viewDirection;
    varying vec2 imageUV;
    float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    float line(float value, float width) {
      float delta = max(fwidth(value), 0.0001);
      return 1.0 - smoothstep(width * delta, (width + 1.0) * delta, abs(fract(value + 0.5) - 0.5));
    }
    void main() {
      vec3 normal = normalize(surfaceNormal);
      float light = dot(normal, normalize(vec3(-0.4,0.7,0.8)));
      float rim = 1.0 - abs(dot(normal, normalize(viewDirection)));
      float hatch = line((gl_FragCoord.x + gl_FragCoord.y) / 8.0, 0.38);
      float grain = noise(floor(gl_FragCoord.xy));
      float tone = 0.0;
      if (mode == 0) {
        vec3 p = normalize(localPoint);
        float longitude = atan(p.x, p.z);
        float latitude = asin(clamp(p.y,-1.0,1.0));
        float grid = max(line(longitude / 0.261799, 0.25), line(latitude / 0.261799, 0.25));
        float major = max(line(longitude / 0.785398, 0.50), line(latitude / 0.785398, 0.50));
        float elevation = sin(p.x*7.0+p.z*4.0)*cos(p.y*6.0-p.z*3.0);
        float contour = line(elevation * 5.0, 0.18);
        tone = 0.035 + grid*0.24 + major*0.27 + contour*0.12;
        tone = max(tone, smoothstep(0.85,0.98,rim)*0.80);
        if (length(localPoint) < 3.115) tone = max(tone, 0.48 + hatch*0.30);
      } else if (mode == 1) {
        tone = light > 0.30 ? 0.96 : 0.10 + hatch*0.35;
        tone = mix(tone,0.04,smoothstep(0.78,0.95,rim));
        float seam = max(line(imageUV.x*7.0,0.18),line(imageUV.y*5.0,0.18));
        tone -= seam*0.12;
      } else if (mode == 2) {
        tone = 0.03 + smoothstep(0.58,0.95,rim)*0.80;
        if (light < 0.1) tone += hatch*0.12;
      } else {
        tone = 0.78 + line((gl_FragCoord.x-gl_FragCoord.y)/7.0,0.25)*0.18;
      }
      float alpha = 1.0;
      if (hasImage == 1) {
        vec4 sampleColor = texture2D(image, imageUV);
        alpha = sampleColor.a;
        if (alpha < 0.08) discard;
        float luminance = dot(sampleColor.rgb, vec3(0.299,0.587,0.114));
        tone = mix(0.07,0.96,smoothstep(0.22,0.8,luminance));
        tone = floor(tone*4.0)/4.0;
      }
      // Fine ink loss and paper fibers, anchored in screen pixels like print.
      tone += (grain-0.5)*0.10;
      if (grain > 0.986) tone = mix(tone,1.0,0.40);
      if (grain < 0.015) tone *= 0.50;
      gl_FragColor = vec4(mix(ink,paper,clamp(tone,0.0,1.0)),alpha);
      #include <colorspace_fragment>
    }
  `,
})

/** Keep photo/label UVs and alpha, but print their colors in the same two inks. */
export const blueprintObject = (root: THREE.Object3D, preserveImages = false) => {
  const cache = new Map<THREE.Material, THREE.ShaderMaterial>()
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    const convert = (original: THREE.Material) => {
      let result = cache.get(original)
      if (!result) {
        const source = original as THREE.MeshStandardMaterial
        const color = source.color ?? new THREE.Color('#ffffff')
        const luminance = color.r*.299+color.g*.587+color.b*.114
        result = blueprintMaterial(luminance < .18 ? 'ink' : 'paper', preserveImages || source.transparent ? source.map : null)
        cache.set(original, result)
      }
      return result
    }
    object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material)
  })
  return () => cache.forEach(material => material.dispose())
}
