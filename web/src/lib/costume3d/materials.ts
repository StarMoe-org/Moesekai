/**
 * Materials of the 3D costume stage: a stand-in for the game's `Sekai/Live/Character/Toon`
 * shader and its inverted-hull outlines, written for three.js.
 *
 * - Lit areas take `_MainTex`, shadowed areas `_ShadowTex`; skin (red of `_ValueTex`) takes the
 *   role's skin colours. A key light stays with the camera.
 * - The face itself is flat-lit (the game shades it from an SDF); hair, body and accessories are
 *   toon-shaded.
 * - `Eye-Highlight` textures are opaque black with white spots: the game adds them onto the eye.
 * - Outline width per vertex is the red of the vertex colour.
 *
 * The Unity material properties come from the glTF material's `extras.unity`, which
 * GLTFLoader puts in `material.userData.unity`. A texture property names a glTF texture, whose
 * image is `texture/<n>.webp` (see model.md): the corresponding member of the same asset.
 */
import * as THREE from "three";

const VERTEX = /* glsl */ `
  #include <common>
  #include <color_pars_vertex>
  #include <morphtarget_pars_vertex>
  #include <skinning_pars_vertex>
  uniform float outlineWidth;
  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewPos;
  void main() {
    vUv = uv;
    #include <color_vertex>
    #include <beginnormal_vertex>
    #include <morphnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #include <morphtarget_vertex>
    #include <skinning_vertex>
    #ifdef OUTLINE
      #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
        float width = vColor.r;
      #else
        float width = 1.0;
      #endif
      transformed += normalize(objectNormal) * outlineWidth * width;
    #endif
    #include <project_vertex>
    vViewNormal = normalize(transformedNormal);
    vViewPos = -mvPosition.xyz;
  }`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D mainTex;
  uniform sampler2D shadowTex;
  uniform sampler2D valueTex;
  uniform float hasShadowTex;
  uniform float hasValueTex;
  uniform float shade;
  uniform vec3 skinColor;
  uniform vec3 skinShadow;
  uniform vec3 lightDir;
  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewPos;
  void main() {
    vec4 base = texture2D(mainTex, vUv);
    if (base.a < 0.5) discard;
    #ifdef OUTLINE
      gl_FragColor = vec4(base.rgb * 0.38, 1.0);
    #else
      vec3 shadow = hasShadowTex > 0.5 ? texture2D(shadowTex, vUv).rgb : base.rgb * vec3(0.80, 0.76, 0.84);
      float skin = hasValueTex > 0.5 ? step(0.5, texture2D(valueTex, vUv).r) : 0.0;
      vec3 lit = mix(base.rgb, base.rgb * skinColor, skin);
      shadow = mix(shadow, base.rgb * skinShadow, skin);
      vec3 n = normalize(vViewNormal) * (gl_FrontFacing ? 1.0 : -1.0);
      float ndl = dot(n, lightDir) * 0.5 + 0.5;
      float light = mix(1.0, smoothstep(0.44, 0.50, ndl), shade);
      vec3 color = mix(shadow, lit, light);
      float rim = pow(1.0 - clamp(dot(n, normalize(vViewPos)), 0.0, 1.0), 4.0);
      color += rim * 0.10 * light * shade;
      gl_FragColor = vec4(color, 1.0);
    #endif
    #include <colorspace_fragment>
  }`;

/** The key light, in view space: shared by every toon material. */
const lightDir = { value: new THREE.Vector3(-0.35, 0.55, 0.76).normalize() };

const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
blank.needsUpdate = true;

interface ToonOptions {
    main: THREE.Texture | null;
    shadow?: THREE.Texture | null;
    value?: THREE.Texture | null;
    shade: boolean;
    skin: { default: string; shadow1: string } | null;
    outline?: boolean;
}

function toonMaterial({ main, shadow = null, value = null, shade, skin, outline = false }: ToonOptions): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
        uniforms: {
            mainTex: { value: main ?? blank },
            shadowTex: { value: shadow ?? blank },
            valueTex: { value: value ?? blank },
            hasShadowTex: { value: shadow ? 1 : 0 },
            hasValueTex: { value: value ? 1 : 0 },
            shade: { value: shade ? 1 : 0 },
            skinColor: { value: new THREE.Color(skin?.default ?? "#ffffff") },
            skinShadow: { value: new THREE.Color(skin?.shadow1 ?? "#e9b0bd") },
            lightDir,
            outlineWidth: { value: 0.0016 },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        side: outline ? THREE.BackSide : THREE.DoubleSide,
        vertexColors: true,
    });
    if (outline) material.defines = { OUTLINE: "" };
    return material;
}

/**
 * Loads the object `sha256` of the store, shared between looks. `srgb` says whether it is colour
 * (else a value read as linear).
 */
export type TextureSource = (sha256: string, srgb: boolean) => Promise<THREE.Texture | null>;

/** The colour-variation textures, one source per material slot they replace. */
export interface ColorTextures {
    main: TextureSource;
    shadow: TextureSource;
    value: TextureSource;
}

/** For each image of a `costume-model`'s GLB (`texture/<n>.webp`), the hash of the asset's member `texture/<n>`. */
export function imageMembers(images: Array<{ uri?: string }>, members: Array<{ role: string; sha256: string }>): string[] {
    return images.map(image => {
        const n = /^texture\/(\d+)\.webp$/.exec(image.uri ?? "")?.[1];
        return (n != null && members.find(member => member.role === `texture/${n}`)?.sha256) || "";
    });
}

interface UnityMaterial {
    shader?: string;
    textures?: Record<string, { texture?: number | null }>;
}

const isEye = (name: string) => /eye|ehl|eyelash|eyebrow/i.test(name);

/** Replaces a converted model's glTF materials with toon materials. `images` maps a texture property's glTF texture to its member. */
export async function dress(
    root: THREE.Object3D,
    { kind, skin, colors, texture, images }: {
        kind: "body" | "face" | "accessory";
        skin: ToonOptions["skin"];
        colors: ColorTextures | null;
        texture: TextureSource;
        images: string[];
    },
): Promise<void> {
    const meshes: THREE.Mesh[] = [];
    root.traverse(object => { if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh); });
    await Promise.all(meshes.map(async mesh => {
        mesh.frustumCulled = false;
        const source = mesh.material as THREE.MeshStandardMaterial;
        const unity = (source.userData?.unity ?? {}) as UnityMaterial;
        const slot = (name: string) => {
            const index = unity.textures?.[name]?.texture;
            return index == null ? "" : images[index] ?? "";
        };
        if (/Eye-Highlight/.test(unity.shader ?? "")) {
            mesh.material = new THREE.MeshBasicMaterial({ map: source.map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
            // GLTFLoader's own texture, not one of the texture source's: released with the look.
            mesh.material.userData.ownsMap = true;
            mesh.renderOrder = 2;
            source.dispose();
            return;
        }
        // A material with a lit map of its own takes the colour variation's textures.
        const recolor = colors && slot("_MainTex") ? colors : null;
        const pick = (source: TextureSource | null, property: string, srgb: boolean) => {
            const sha256 = slot(property);
            return sha256 ? (source ?? texture)(sha256, srgb) : Promise.resolve(null);
        };
        const [main, shadow, value] = await Promise.all([
            recolor ? pick(recolor.main, "_MainTex", true) : pick(null, "_MainTex", true),
            pick(recolor?.shadow ?? null, "_ShadowTex", true),
            pick(recolor?.value ?? null, "_ValueTex", false),
        ]);
        const shade = !(kind === "face" && !/hair/i.test(source.name));
        mesh.material = toonMaterial({ main: main ?? source.map, shadow, value, shade, skin });
        mesh.material.name = source.name;
        mesh.userData.outline = !isEye(source.name);
        // The glTF material's own textures are the same files, already held by the texture source.
        source.dispose();
    }));
}

/** Adds an inverted-hull outline next to every mesh that has one, sharing its geometry, skeleton and morphs. */
export function addOutlines(root: THREE.Object3D): void {
    const meshes: THREE.Mesh[] = [];
    root.traverse(object => { if ((object as THREE.Mesh).isMesh && object.userData.outline) meshes.push(object as THREE.Mesh); });
    for (const mesh of meshes) {
        const uniforms = (mesh.material as THREE.ShaderMaterial).uniforms;
        const material = toonMaterial({ main: uniforms.mainTex.value, shade: true, skin: null, outline: true });
        const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh;
        const outline: THREE.Mesh = skinned ? new THREE.SkinnedMesh(mesh.geometry, material) : new THREE.Mesh(mesh.geometry, material);
        outline.name = `${mesh.name}#outline`;
        outline.frustumCulled = false;
        outline.position.copy(mesh.position);
        outline.quaternion.copy(mesh.quaternion);
        outline.scale.copy(mesh.scale);
        if (skinned) {
            const source = mesh as THREE.SkinnedMesh;
            (outline as unknown as THREE.SkinnedMesh).bind(source.skeleton, source.bindMatrix);
        }
        if (mesh.morphTargetInfluences) {
            outline.morphTargetInfluences = mesh.morphTargetInfluences;
            outline.morphTargetDictionary = mesh.morphTargetDictionary;
        }
        outline.userData.isOutline = true;
        mesh.parent?.add(outline);
    }
}
