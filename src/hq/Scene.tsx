// De 3D-scène: omgeving, gebouw en een camera die zacht naar de gekozen plek vliegt.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment as Ibl, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import { floors } from './model';
import { ui, useUi } from './ui';
import { Environment, Lights } from './world/Environment';
import { Village } from './world/Village';
import { Warehouse, officeSlot, zoneKind, zoneView } from './world/Warehouse';
import { Parking } from './world/Cars';
import { B } from './world/dims';

const v = (p: [number, number, number]) => new THREE.Vector3(p[0], p[1], p[2] + B.Z);

function aimFor(level: number, focus: string | null): { pos: THREE.Vector3; target: THREE.Vector3 } {
  // Buiten: van rechtsvoor, zodat oprit, gebouw en parking samen in beeld zijn (het infopaneel zit links).
  if (level < 0) return { pos: new THREE.Vector3(44, 26, 46), target: new THREE.Vector3(-6, 4, B.Z + 8) };
  const office = focus ? officeSlot(focus) : null;
  // Sims-zicht op het kantoor: schuin van boven (het plafond verdwijnt in Sims-modus).
  if (office) return { pos: v([office.x + 4, B.MZ + 8, -3.5]), target: v([office.x, B.MZ + 0.6, -11.5]) };
  const f = floors.find((x) => x.level === level);
  if (!f) return { pos: new THREE.Vector3(44, 26, 46), target: new THREE.Vector3(-6, 4, B.Z + 8) };
  const view = zoneView(f.id, zoneKind(f));
  return { pos: v(view.pos), target: v(view.target) };
}
function CameraRig() {
  const aim = useUi((s) => s.aim);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitImpl | null;
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const first = useRef(true);

  useEffect(() => {
    const { level, focus } = ui.get();
    goal.current = aimFor(level, focus);
  }, [aim]);

  useEffect(() => {
    if (!controls) return;
    // Alleen in dev: camera vanuit de console zetten, handig voor screenshots.
    if (import.meta.env.DEV)
      Object.assign(window, {
        hqCam: (p: [number, number, number], t: [number, number, number]) => {
          goal.current = { pos: new THREE.Vector3(...p), target: new THREE.Vector3(...t) };
        },
      });
    const stop = () => (goal.current = null); // zelf slepen gaat voor
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  useFrame((_, dt) => {
    const g = goal.current;
    if (!g || !controls) return;
    // Eerste vlucht: rustig van de straat naar het gebouw.
    const k = 1 - Math.exp(-dt * (first.current ? 1.1 : 3.2));
    camera.position.lerp(g.pos, k);
    controls.target.lerp(g.target, k);
    controls.update();
    if (camera.position.distanceTo(g.pos) < 0.05 && controls.target.distanceTo(g.target) < 0.05) {
      goal.current = null;
      first.current = false;
    }
  });
  return null;
}

/**
 * Omgevingslicht voor echte reflecties in glas en metaal, zonder iets te downloaden:
 * een hemelkoepel (blauw boven, groen-grijs onder) met een paar lichtvlakken, één keer gerenderd.
 */
function SkyLight() {
  return (
    <Ibl frames={1} resolution={256} environmentIntensity={0.55}>
      <mesh scale={100}>
        <sphereGeometry args={[1, 32, 16]} />
        <shaderMaterial
          side={THREE.BackSide}
          depthWrite={false}
          uniforms={{ top: { value: new THREE.Color('#9cc3e6') }, mid: { value: new THREE.Color('#e9eef0') }, bottom: { value: new THREE.Color('#5d6b4a') } }}
          vertexShader="varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }"
          fragmentShader="uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, bottom, pow(-h, 0.4)); gl_FragColor = vec4(c, 1.0); }"
        />
      </mesh>
      <Lightformer form="circle" intensity={6} color="#fff1dc" position={[46, 52, 40]} scale={14} />
      <Lightformer form="rect" intensity={1.2} color="#ffffff" position={[-40, 30, -10]} scale={[40, 12, 1]} rotation-y={Math.PI / 2} />
      <Lightformer form="rect" intensity={0.8} color="#dfe9f2" position={[0, 40, -60]} scale={[60, 20, 1]} />
    </Ibl>
  );
}

/**
 * Schaduwen niet elk beeld opnieuw berekenen: het gebouw en de bomen staan stil.
 * Eén keer per seconde, en meteen na een cameravlucht naar een andere plek, is genoeg (halveert het tekenwerk).
 */
function ShadowThrottle() {
  const gl = useThree((s) => s.gl);
  const aim = useUi((s) => s.aim);
  const level = useUi((s) => s.level);
  const n = useRef(0);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl, aim, level]);
  useFrame(() => {
    if (++n.current % 60 === 0) gl.shadowMap.needsUpdate = true;
  });
  return null;
}

/** Meldt wanneer de eerste beelden echt getekend zijn (shaders gecompileerd). */
function FirstFrames({ onReady }: { onReady?: () => void }) {
  const n = useRef(0);
  useFrame(() => {
    if (++n.current === 3) onReady?.();
  });
  return null;
}

export function HqScene({ onReady }: { onReady?: () => void }) {
  // Zakt de framerate (oudere laptop), dan tekenen we met iets minder pixels.
  const [dpr, setDpr] = useState(Math.min(window.devicePixelRatio, 1.75));
  return (
    <Canvas
      shadows="soft"
      dpr={dpr}
      // Geen nabewerking achteraf (kostte 40 ms per beeld op een Intel-chip): randverzachting en filmische kleuren
      // gebeuren in de renderer zelf, verzadiging, contrast en vignet via CSS (zie HQApp).
      gl={{ antialias: true, powerPreference: 'high-performance', stencil: false, toneMappingExposure: 1.0 }}
      camera={{ position: [4, 2.6, 62], fov: 35, near: 0.6, far: 900 }}
      onCreated={({ gl, scene, camera }) => {
        if (import.meta.env.DEV) Object.assign(window, { hqGl: gl, hqScene: scene, hqCamera: camera });
      }}
      onPointerMissed={() => ui.set({ focus: null })}
    >
      <PerformanceMonitor
        onDecline={() => setDpr((d) => Math.max(0.8, d - 0.25))}
        onIncline={() => setDpr((d) => Math.min(window.devicePixelRatio, 1.75, d + 0.25))}
      />
      <Lights />
      <SkyLight />
      <Environment forecourtZ={B.Z + B.D / 2 + 9} />
      <Village />
      <Warehouse />
      <Parking position={[17.5, 0, 6.5]} />
      <OrbitControls
        makeDefault
        target={[0, 4, 30]}
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2.15}
        minDistance={4}
        maxDistance={160}
      />
      <CameraRig />
      <FirstFrames onReady={onReady} />
      <ShadowThrottle />
    </Canvas>
  );
}
