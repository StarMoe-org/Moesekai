"use client";

// WebGL gacha presentation: a dome with an orb that charges, a rarity-coloured
// signal, then the card flips in and bursts for 4★. Built natively with
// Three.js from the gacha stage's visual language; it does not load Unity assets.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { SimRarity } from "@/lib/gacha-simulator/engine";
import { playCharge, playReveal, playTick } from "@/lib/gacha-simulator/audio";

export interface StageEvent {
    key: number;
    rarity: SimRarity;
    up: boolean;
    imageUrl: string | null;
}

export interface GachaStageProps {
    event: StageEvent | null;
    /** 1, 2 or 4 for normal playback; 0 skips animation and reports completion at once. */
    speed: number;
    /** Muted playback suppresses synthesized sound effects. */
    sfx: boolean;
    onRevealed: (key: number) => void;
    /** Fired when the card starts to flip over, the moment its voice should play. */
    onFlip?: (key: number) => void;
    onUnsupported?: () => void;
    className?: string;
}

const RARITY_COLOR: Record<SimRarity, number> = {
    rarity_1: 0x9aa4b2,
    rarity_2: 0x6fbf73,
    rarity_3: 0x5aa9ff,
    rarity_4: 0xffc93c,
    rarity_birthday: 0xff7ad9,
};

// Timeline in ms at speed 1.
const CHARGE_MS = 1100;
const SIGNAL_MS = 450;
const REVEAL_MS = 650;
const HOLD_MS = 1000;
const HOLD_HIGH_MS = 1500;

type Phase = "idle" | "charge" | "signal" | "reveal" | "hold";

interface Anim {
    key: number;
    rarity: SimRarity;
    up: boolean;
    phase: Phase;
    phaseStart: number;
    imageUrl: string | null;
    sfx: boolean;
}

function isHigh(rarity: SimRarity) {
    return rarity === "rarity_4" || rarity === "rarity_birthday";
}

export default function GachaStage({ event, speed, sfx, onRevealed, onFlip, onUnsupported, className }: GachaStageProps) {
    const hostRef = useRef<HTMLDivElement>(null);
    const latest = useRef({ speed, sfx, onRevealed, onFlip, onUnsupported });
    useEffect(() => {
        latest.current = { speed, sfx, onRevealed, onFlip, onUnsupported };
    }, [speed, sfx, onRevealed, onFlip, onUnsupported]);
    const animRef = useRef<Anim | null>(null);
    const startRef = useRef<(e: StageEvent) => void>(() => undefined);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return undefined;

        let renderer: THREE.WebGLRenderer;
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
        } catch {
            latest.current.onUnsupported?.();
            return undefined;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0b0b16);
        const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
        camera.position.set(0, 0.2, 6.2);

        scene.add(new THREE.AmbientLight(0x6a6a90, 1.1));
        const orbLight = new THREE.PointLight(0xffffff, 0, 24, 1.6);
        scene.add(orbLight);

        // Dome and starfield.
        const dome = new THREE.Mesh(
            new THREE.SphereGeometry(18, 40, 24),
            new THREE.MeshBasicMaterial({ color: 0x14142a, side: THREE.BackSide }),
        );
        scene.add(dome);
        const starCount = 420;
        const starPositions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i += 1) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 10 + Math.random() * 5;
            starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            starPositions[i * 3 + 1] = r * Math.cos(phi);
            starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        const starGeometry = new THREE.BufferGeometry();
        starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
        const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xbfc8ff, size: 0.05, transparent: true, opacity: 0.8 }));
        scene.add(stars);

        // Orb with halo and ring.
        const orbMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3a6a, emissive: 0x222244, emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.2 });
        const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 3), orbMaterial);
        scene.add(orb);
        const halo = new THREE.Mesh(
            new THREE.SphereGeometry(1.35, 32, 16),
            new THREE.MeshBasicMaterial({ color: 0x8888ff, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        scene.add(halo);
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(1.7, 0.02, 8, 120),
            new THREE.MeshBasicMaterial({ color: 0x8888ff, transparent: true, opacity: 0.7 }),
        );
        ring.rotation.x = Math.PI / 2.4;
        scene.add(ring);

        // Card: front face shows the art, back face is a rarity-coloured frame.
        const cardGroup = new THREE.Group();
        cardGroup.visible = false;
        const front = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.FrontSide }));
        const back = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 2.25), new THREE.MeshBasicMaterial({ color: 0x888888, side: THREE.FrontSide }));
        back.position.z = -0.01;
        back.rotation.y = Math.PI;
        cardGroup.add(front, back);
        scene.add(cardGroup);

        // Burst particles for 4★.
        const burstCount = 160;
        const burstPositions = new Float32Array(burstCount * 3);
        const burstVelocities = new Float32Array(burstCount * 3);
        const burstGeometry = new THREE.BufferGeometry();
        burstGeometry.setAttribute("position", new THREE.BufferAttribute(burstPositions, 3));
        const burstMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
        const burst = new THREE.Points(burstGeometry, burstMaterial);
        scene.add(burst);
        let burstT = -1;

        const textureCache = new Map<string, THREE.Texture>();
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");
        const loadTexture = (url: string) => {
            const cached = textureCache.get(url);
            if (cached) return cached;
            const texture = loader.load(url, undefined, undefined, () => {
                textureCache.delete(url);
            });
            texture.colorSpace = THREE.SRGBColorSpace;
            textureCache.set(url, texture);
            return texture;
        };

        const resize = () => {
            const { clientWidth: w, clientHeight: h } = host;
            if (!w || !h) return;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        };
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(host);

        const startAnim = (e: StageEvent) => {
            const now = performance.now();
            const speedNow = latest.current.speed;
            if (speedNow <= 0) {
                animRef.current = null;
                cardGroup.visible = false;
                latest.current.onRevealed(e.key);
                return;
            }
            animRef.current = { key: e.key, rarity: e.rarity, up: e.up, phase: "charge", phaseStart: now, imageUrl: e.imageUrl, sfx: latest.current.sfx };
            if (latest.current.sfx) playCharge(CHARGE_MS / 1000 / speedNow);
            cardGroup.visible = false;
            if (e.imageUrl) {
                const texture = loadTexture(e.imageUrl);
                front.material.map = texture;
                front.material.color.set(0xffffff);
                front.material.needsUpdate = true;
            } else {
                front.material.map = null;
                front.material.color.set(RARITY_COLOR[e.rarity]);
                front.material.needsUpdate = true;
            }
            (back.material as THREE.MeshBasicMaterial).color.set(RARITY_COLOR[e.rarity]);
        };
        startRef.current = startAnim;

        let raf = 0;
        let last = performance.now();
        let idleAngle = 0;
        const tmpColor = new THREE.Color();

        const setOrbColor = (color: number, intensity: number) => {
            tmpColor.set(color);
            orbMaterial.emissive.copy(tmpColor);
            orbMaterial.emissiveIntensity = intensity;
            (halo.material as THREE.MeshBasicMaterial).color.copy(tmpColor);
            (ring.material as THREE.MeshBasicMaterial).color.copy(tmpColor);
            orbLight.color.copy(tmpColor);
        };

        const frame = (now: number) => {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            idleAngle += dt;

            let anim = animRef.current;
            if (anim && latest.current.speed <= 0) {
                // Skip requested mid-animation: finish the current card at once.
                animRef.current = null;
                cardGroup.visible = false;
                latest.current.onRevealed(anim.key);
                anim = null;
            }
            const speedNow = Math.max(0.01, latest.current.speed || 1);
            let orbScale = 1 + Math.sin(idleAngle * 1.6) * 0.04;
            let haloScale = 1;
            let lightIntensity = 0.6;
            let cardScale = 0;
            let cardRotY = Math.PI;
            setOrbColor(0x8888ff, 0.5);

            if (anim) {
                const elapsed = now - anim.phaseStart;
                const dur = (ms: number) => ms / speedNow;
                if (anim.phase === "charge") {
                    const t = Math.min(1, elapsed / dur(CHARGE_MS));
                    orbScale = 1 + t * 0.7 + Math.sin(t * 40) * 0.02 * t;
                    haloScale = 1 + t * 0.8;
                    lightIntensity = 0.6 + t * 4;
                    setOrbColor(0x8888ff, 0.5 + t * 1.2);
                    if (t >= 1) {
                        animRef.current = { ...anim, phase: "signal", phaseStart: now };
                        if (anim.sfx) playReveal(anim.rarity);
                    }
                } else if (anim.phase === "signal") {
                    const t = Math.min(1, elapsed / dur(SIGNAL_MS));
                    const flash = Math.sin(t * Math.PI);
                    orbScale = 1.7 + flash * 0.5;
                    haloScale = 1.8 + flash * 1.6;
                    lightIntensity = 4 + flash * 8;
                    setOrbColor(RARITY_COLOR[anim.rarity], 1.5 + flash * 2);
                    if (t >= 1) {
                        animRef.current = { ...anim, phase: "reveal", phaseStart: now };
                        cardGroup.visible = true;
                        latest.current.onFlip?.(anim.key);
                        if (isHigh(anim.rarity)) {
                            burstT = 0;
                            for (let i = 0; i < burstCount; i += 1) {
                                const theta = Math.random() * Math.PI * 2;
                                const speedV = 1.2 + Math.random() * 2.4;
                                burstPositions[i * 3] = 0;
                                burstPositions[i * 3 + 1] = 0;
                                burstPositions[i * 3 + 2] = 0.2;
                                burstVelocities[i * 3] = Math.cos(theta) * speedV;
                                burstVelocities[i * 3 + 1] = Math.sin(theta) * speedV;
                                burstVelocities[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
                            }
                            burstMaterial.color.set(RARITY_COLOR[anim.rarity]);
                        }
                    }
                } else if (anim.phase === "reveal") {
                    const t = Math.min(1, elapsed / dur(REVEAL_MS));
                    const eased = 1 - Math.pow(1 - t, 3);
                    cardScale = eased;
                    cardRotY = Math.PI * (1 - eased);
                    orbScale = 1.7 * (1 - eased) + 0.6 * eased;
                    haloScale = 2 * (1 - eased) + 1 * eased;
                    lightIntensity = 3 * (1 - eased);
                    if (t >= 1) {
                        animRef.current = { ...anim, phase: "hold", phaseStart: now };
                        if (latest.current.sfx && !isHigh(anim.rarity)) playTick();
                    }
                } else if (anim.phase === "hold") {
                    cardScale = 1;
                    cardRotY = 0;
                    const hold = dur(isHigh(anim.rarity) ? HOLD_HIGH_MS : HOLD_MS);
                    if (elapsed >= hold) {
                        animRef.current = null;
                        latest.current.onRevealed(anim.key);
                    }
                }
            }

            orb.scale.setScalar(orbScale);
            halo.scale.setScalar(haloScale);
            orb.rotation.y += dt * 0.4;
            orb.rotation.x += dt * 0.15;
            ring.rotation.z += dt * 0.6;
            orbLight.intensity = lightIntensity;
            orb.position.y = Math.sin(idleAngle * 1.2) * 0.06;
            halo.position.copy(orb.position);
            ring.position.copy(orb.position);

            cardGroup.position.set(0, 0.1, 0.6);
            cardGroup.scale.setScalar(Math.max(0.001, cardScale));
            cardGroup.rotation.y = cardRotY;
            cardGroup.rotation.z = Math.sin(idleAngle * 0.8) * 0.02 * (1 - cardScale);
            cardGroup.visible = cardScale > 0.001;

            stars.rotation.y += dt * 0.02;

            if (burstT >= 0) {
                burstT += dt;
                const life = 1.1;
                const fade = Math.max(0, 1 - burstT / life);
                for (let i = 0; i < burstCount; i += 1) {
                    burstPositions[i * 3] += burstVelocities[i * 3] * dt;
                    burstPositions[i * 3 + 1] += burstVelocities[i * 3 + 1] * dt;
                    burstPositions[i * 3 + 2] += burstVelocities[i * 3 + 2] * dt;
                    burstVelocities[i * 3] *= 0.97;
                    burstVelocities[i * 3 + 1] *= 0.97;
                }
                burstGeometry.attributes.position.needsUpdate = true;
                burstMaterial.opacity = fade;
                if (burstT >= life) burstT = -1;
            } else {
                burstMaterial.opacity = 0;
            }

            renderer.render(scene, camera);
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);

        return () => {
            cancelAnimationFrame(raf);
            observer.disconnect();
            textureCache.forEach((texture) => texture.dispose());
            textureCache.clear();
            [starGeometry, burstGeometry, orb.geometry, halo.geometry, ring.geometry, front.geometry, back.geometry, dome.geometry].forEach((g) => g.dispose());
            [orbMaterial, burstMaterial].forEach((m) => m.dispose());
            renderer.dispose();
            renderer.domElement.remove();
            startRef.current = () => undefined;
        };
    }, []);

    // New reveal request.
    useEffect(() => {
        if (event) startRef.current(event);
    }, [event]);

    return <div ref={hostRef} className={className ?? "relative h-full w-full overflow-hidden rounded-md3-lg"} aria-hidden />;
}
