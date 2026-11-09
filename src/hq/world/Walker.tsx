// Rondlopen in het HQ als mens: ooghoogte, kijken met de muis, lopen met de toetsen, botsen, trappen en vallen.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import { ui, useUi } from '../ui';
import { Botsingen, bouwBotsingen, walkPos, type Blok } from '../walk';
import { maakLos, voegSamen, type Batch } from '../walkBatch';
import { B } from './dims';
import { walkLabel, walkSpawn } from './Warehouse';

const EYE = 1.68;
const WALK = 2.3; // m/s: rustig wandelen voelt in beeld beter dan de echte 1,4 m/s
const RUN = 4.4;
const SENS = 0.0021;
const LIMIT = 92;

/** Leuningen langs de twee stalen trappen: de trapbomen staan schuin en tellen zelf niet mee. */
function trapLeuningen(): Blok[] {
  const out: Blok[] = [];
  const ix = B.W / 2 - B.MD - 0.85;
  for (const sx of [-1, 1])
    for (const s of [-1, 1])
      out.push({ x: sx * ix + s * 0.68, z: B.Z + 4.3, hx: 0.03, hz: 3.1, cos: 1, sin: 0, bottom: -1, top: 6 });
  return out;
}

/** Vraagt de muis op. Lukt dat niet (sommige ingebouwde browsers), dan kijk je rond door te slepen. */
export function vraagMuis() {
  const c = document.querySelector<HTMLCanvasElement>('[data-hq-canvas] canvas');
  ui.set({ walkPaused: false });
  if (!c?.requestPointerLock) return ui.set({ walkDrag: true });
  try {
    const p = c.requestPointerLock() as unknown as Promise<void> | undefined;
    p?.catch?.((e) => {
      console.warn('Muis vastzetten lukt niet:', e);
      ui.set({ walkDrag: true });
    });
  } catch {
    ui.set({ walkDrag: true });
  }
}

export function Walker() {
  const walk = useUi((s) => s.walk);
  const spot = useUi((s) => s.walkSpot);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const controls = useThree((s) => s.controls) as unknown as OrbitImpl | null;
  const setEvents = useThree((s) => s.setEvents);

  const col = useRef<Botsingen | null>(null);
  const frames = useRef(0);
  const keys = useRef(new Set<string>());
  const yaw = useRef(0);
  const pitch = useRef(0);
  const vel = useRef(new THREE.Vector2());
  const fall = useRef(0);
  const eyeY = useRef(EYE);
  const bob = useRef(0);
  const saved = useRef<{ fov: number; near: number; far: number } | null>(null);
  const label = useRef('');
  const batch = useRef<Batch | null>(null);

  // Naar een plek gaan (bij het starten en vanuit het menu).
  useEffect(() => {
    if (!walk) return;
    const s = walkSpawn(spot.split('#')[0]);
    walkPos.set(s.x, s.y, s.z);
    yaw.current = s.yaw;
    pitch.current = 0;
    vel.current.set(0, 0);
    eyeY.current = s.y + EYE;
  }, [walk, spot]);

  useEffect(() => {
    if (!walk) return;
    const cam = camera;
    saved.current = { fov: cam.fov, near: cam.near, far: cam.far };
    cam.fov = 68;
    cam.near = 0.07;
    cam.far = 700;
    cam.updateProjectionMatrix();
    cam.rotation.order = 'YXZ';
    setEvents({ enabled: false });
    col.current = null;
    frames.current = 0;
    const held = keys.current;

    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      held.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => held.delete(e.code);
    const blur = () => held.clear();
    const look = (dx: number, dy: number) => {
      // Grote sprongen in de muisbeweging (bekend in Chrome op Windows) negeren.
      if (Math.abs(dx) > 250 || Math.abs(dy) > 250) return;
      yaw.current -= dx * SENS;
      pitch.current = Math.max(-1.45, Math.min(1.45, pitch.current - dy * SENS));
    };
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement === gl.domElement) look(e.movementX, e.movementY);
      else if (ui.get().walkDrag && !ui.get().walkPaused && e.buttons & 1) look(e.movementX, e.movementY);
    };
    const lock = () => {
      const on = document.pointerLockElement === gl.domElement;
      if (on) ui.set({ walkDrag: false, walkPaused: false });
      else if (ui.get().walk && !ui.get().walkDrag) ui.set({ walkPaused: true }); // Esc haalt de muis terug
      held.clear();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('mousemove', move);
    document.addEventListener('pointerlockchange', lock);

    if (import.meta.env.DEV)
      Object.assign(window, {
        hqWalk: {
          naar: (x: number, y: number, z: number, y2 = 0, p = 0) => {
            walkPos.set(x, y, z);
            eyeY.current = y + EYE;
            yaw.current = y2;
            pitch.current = p;
          },
          stand: () => ({ x: walkPos.x, y: walkPos.y, z: walkPos.z, yaw: yaw.current, blokken: col.current?.aantal ?? 0 }),
          botsingen: () => col.current,
          toets: (c: string, aan: boolean) => (aan ? held.add(c) : held.delete(c)),
        },
      });

    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('pointerlockchange', lock);
      if (document.pointerLockElement) document.exitPointerLock();
      held.clear();
      setEvents({ enabled: true });
      if (batch.current) {
        maakLos(scene, batch.current);
        batch.current = null;
      }
      gl.shadowMap.needsUpdate = true;
      cam.rotation.order = 'XYZ';
      if (saved.current) {
        cam.fov = saved.current.fov;
        cam.near = saved.current.near;
        cam.far = saved.current.far;
        cam.updateProjectionMatrix();
      }
      // Vanop deze plek weer naar het overzicht: het orbit-doel recht voor je.
      if (controls) {
        const fw = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
        controls.target.copy(cam.position).addScaledVector(fw, 4);
      }
    };
  }, [walk, camera, gl, scene, setEvents, controls]);

  useFrame((_, rawDt) => {
    if (!walk) return;
    const dt = Math.min(rawDt, 0.05);
    // Het gebouw staat er pas na een paar beelden helemaal in rondloopstand.
    if (!batch.current) {
      frames.current++;
      if (frames.current === 3) {
        col.current = bouwBotsingen(scene, trapLeuningen());
        walkPos.y = col.current.floorAt(walkPos.x, walkPos.z, walkPos.y + 0.5);
        gl.shadowMap.needsUpdate = true; // één keer de schaduwen van het volledige gebouw, daarna staan ze vast
      } else if (frames.current === 5) {
        batch.current = voegSamen(scene);
        if (import.meta.env.DEV) console.info('Rondlopen: tekenobjecten', batch.current.voor, '->', batch.current.na);
      }
    }
    const c = col.current;
    const { walkPaused } = ui.get();
    const k = keys.current;
    let fwd = 0;
    let str = 0;
    if (!walkPaused) {
      // e.code = plaats van de toets: werkt zo op azerty (ZQSD) én qwerty (WASD).
      if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) str += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) str -= 1;
    }
    const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? RUN : WALK;
    const norm = Math.hypot(fwd, str) || 1;
    const sin = Math.sin(yaw.current);
    const cos = Math.cos(yaw.current);
    const wx = ((-sin * fwd + cos * str) / norm) * speed;
    const wz = ((-cos * fwd - sin * str) / norm) * speed;
    // Rustig op gang komen en uitbollen, zoals een lichaam.
    const acc = 1 - Math.exp(-dt * 9);
    vel.current.x += (wx - vel.current.x) * acc;
    vel.current.y += (wz - vel.current.y) * acc;

    const dist = Math.hypot(vel.current.x, vel.current.y) * dt;
    if (c && dist > 0.0005) {
      const steps = Math.max(1, Math.ceil(dist / 0.1));
      for (let i = 0; i < steps; i++) {
        walkPos.x += (vel.current.x * dt) / steps;
        walkPos.z += (vel.current.y * dt) / steps;
        // Eerst de trede op, dan pas botsen: anders houdt de volgende trede je tegen.
        const f = c.floorAt(walkPos.x, walkPos.z, walkPos.y);
        if (f > walkPos.y) walkPos.y = f;
        c.push(walkPos, walkPos.y);
      }
    }
    walkPos.x = Math.max(-LIMIT, Math.min(LIMIT, walkPos.x));
    walkPos.z = Math.max(-LIMIT, Math.min(LIMIT, walkPos.z));
    if (c) {
      const f = c.floorAt(walkPos.x, walkPos.z, walkPos.y);
      if (walkPos.y > f + 0.001) {
        // Bij een lage trede zacht zakken, bij een echte val vallen.
        fall.current += 9.8 * dt;
        walkPos.y = Math.max(f, walkPos.y - fall.current * dt);
      } else {
        fall.current = 0;
        walkPos.y = f;
      }
    }

    // Camera: treden uitvlakken en een heel lichte hoofdbeweging tijdens het stappen.
    const moving = Math.min(1, Math.hypot(vel.current.x, vel.current.y) / WALK);
    bob.current += dt * (speed === RUN ? 11 : 8.2) * moving;
    eyeY.current += (walkPos.y + EYE - eyeY.current) * (1 - Math.exp(-dt * 14));
    camera.position.set(walkPos.x + Math.cos(bob.current * 0.5) * 0.006 * moving, eyeY.current + Math.sin(bob.current) * 0.014 * moving, walkPos.z);
    camera.rotation.set(pitch.current, yaw.current, 0);

    const l = walkLabel(walkPos.x, walkPos.y, walkPos.z);
    if (l !== label.current) {
      label.current = l;
      ui.set({ walkRoom: l });
    }
  });
  return null;
}
