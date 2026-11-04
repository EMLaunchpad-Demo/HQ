// Een personage met realistische verhoudingen (± 1,78 m): kleiner hoofd, nek, schouders, taille,
// armen met ellebogen, handen en schoenen, in zakelijke kledij. De kleur van de afdeling zit in de badge.
// Boven het hoofd zweeft een kleine kristallen diamant die de status toont.
import { useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Billboard, RoundedBox, Text } from '@react-three/drei';
import { FONT } from '../fonts';

export type Mood = 'bezig' | 'volgende' | 'open' | 'rust' | 'offline';

export const MOOD_COLOR: Record<Mood, string> = {
  bezig: '#2ff0a6',
  volgende: '#ffd23f',
  open: '#2f7bff',
  rust: '#9aa7b2',
  offline: '#5b6670',
};

const SKIN = ['#e9c3a5', '#d7a986', '#c08a66', '#9c6b4b', '#f0d2bb', '#7d5139'];
const HAIR = ['#2a1f18', '#4a3424', '#7b5a3a', '#b38a5a', '#1a1a1a', '#5e3e28', '#9a9a96'];
const SHIRT = ['#f2f1ec', '#d4dde7', '#e7e1d6', '#bfcbd6', '#f6f6f4', '#cfd6cf'];
const JACKET = ['#1f2733', '#2c3440', '#33302d', '#24303f', '#3a3f44'];
const PANTS = ['#262b33', '#3a3f47', '#2e3540', '#4a443c', '#1f242b'];

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Romp als draaiprofiel: taille, borst en schouders, iets plat van voor naar achter. */
const torsoGeo = (() => {
  const pts = [
    [0.0, 0.0], [0.14, 0.0], [0.145, 0.06], [0.135, 0.16], [0.15, 0.28], [0.17, 0.38], [0.175, 0.44], [0.15, 0.5], [0.08, 0.53], [0.0, 0.535],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 28);
  g.scale(1, 1, 0.62);
  return g;
})();
const hipsGeo = (() => {
  const pts = [[0, -0.1], [0.12, -0.1], [0.15, -0.04], [0.145, 0.04], [0.14, 0.06], [0, 0.06]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 24);
  g.scale(1, 1, 0.66);
  return g;
})();
const limb = (r1: number, r2: number, len: number) => {
  const g = new THREE.CylinderGeometry(r1, r2, len, 14, 1);
  g.translate(0, -len / 2, 0);
  return g;
};
const GEO = {
  thigh: limb(0.072, 0.056, 0.43),
  shin: limb(0.052, 0.04, 0.42),
  upperArm: limb(0.045, 0.038, 0.27),
  foreArm: limb(0.037, 0.031, 0.25),
  joint: new THREE.SphereGeometry(1, 12, 10),
  head: new THREE.SphereGeometry(0.105, 28, 22),
  hair: new THREE.SphereGeometry(0.112, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.55),
};

function Plumbob({ mood, y }: { mood: Mood; y: number }) {
  const ref = useRef<THREE.Group>(null);
  const geo = useMemo(() => {
    const g = new THREE.OctahedronGeometry(0.07, 0);
    g.scale(0.8, 1.7, 0.8);
    return g;
  }, []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.rotation.y = t * 1.2;
    ref.current.position.y = y + Math.sin(t * 2) * 0.025;
  });
  const c = MOOD_COLOR[mood];
  return (
    <group ref={ref} position-y={y}>
      <mesh geometry={geo}>
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={mood === 'offline' ? 0.05 : 0.6} roughness={0.1} metalness={0.2} transparent opacity={0.88} flatShading />
      </mesh>
    </group>
  );
}

export interface CharacterProps {
  id: string;
  name: string;
  /** Kleur van de afdeling (badge en das). */
  shirt: string;
  mood: Mood;
  pose?: 'zit' | 'staat';
  /** Typt hij/zij (animatie)? */
  working?: boolean;
  label?: boolean;
  /** Live onder de naam: percentage en huidige stap (enkel als hij werkt). */
  status?: string;
  big?: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  selected?: boolean;
  /** Van ver (buitenaanzicht): minder onderdelen, zelfde silhouet. */
  lite?: boolean;
}

export function Character({ id, name, shirt, mood, pose = 'zit', working, label, status, big, onClick, selected, lite }: CharacterProps) {
  const h = hash(id);
  const skin = SKIN[h % SKIN.length];
  const hair = HAIR[(h >> 3) % HAIR.length];
  const pants = PANTS[(h >> 6) % PANTS.length];
  const shirtColor = SHIRT[(h >> 9) % SHIRT.length];
  const style = (h >> 12) % 4; // 0 kort, 1 knot, 2 lang, 3 zijscheiding
  const blazer = big || (h >> 15) % 3 === 0;
  const jacket = JACKET[(h >> 17) % JACKET.length];
  const sit = pose === 'zit';
  const [hover, setHover] = useState(false);

  const mats = useMemo(
    () => ({
      skin: new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 }),
      hair: new THREE.MeshStandardMaterial({ color: hair, roughness: 0.65 }),
      pants: new THREE.MeshStandardMaterial({ color: pants, roughness: 0.85 }),
      shirt: new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.8 }),
      top: new THREE.MeshStandardMaterial({ color: blazer ? jacket : shirtColor, roughness: blazer ? 0.7 : 0.8 }),
      shoe: new THREE.MeshStandardMaterial({ color: '#1b1a19', roughness: 0.35, metalness: 0.1 }),
      dark: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.3 }),
      accent: new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.5 }),
    }),
    [skin, hair, pants, shirtColor, blazer, jacket, shirt],
  );

  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const foreL = useRef<THREE.Group>(null);
  const foreR = useRef<THREE.Group>(null);
  const arms: [RefObject<THREE.Group>, RefObject<THREE.Group>][] = [
    [armL, foreL],
    [armR, foreR],
  ];
  const phase = (h % 1000) / 160;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    if (body.current) body.current.scale.y = 1 + Math.sin(t * 1.6) * 0.004; // ademen
    if (head.current) {
      head.current.rotation.y = working ? Math.sin(t * 0.6) * 0.1 : Math.sin(t * 0.35) * 0.28;
      head.current.rotation.x = working ? 0.12 : 0;
    }
    arms.forEach(([a, f], i) => {
      if (!a.current || !f.current) return;
      if (sit) {
        // Bovenarm iets naar voren, onderarm naar het toetsenbord. Positieve x = naar voren (kijkt naar -z).
        a.current.rotation.x = 0.35;
        f.current.rotation.x = 1.2 + (working ? Math.sin(t * 13 + i * 1.7) * 0.06 : 0);
      } else {
        a.current.rotation.x = Math.sin(t * 1.1 + i) * 0.04;
        f.current.rotation.x = 0.15;
      }
    });
  });

  const hipY = sit ? 0.5 : 0.93;
  const s = big ? 1.03 : 1;

  // Van ver (door het glas, buitenaanzicht): enkel het silhouet, zes onderdelen in plaats van zeventien.
  if (lite)
    return (
      <group scale={s}>
        {sit ? (
          <mesh position={[0, hipY, -0.2]} rotation-x={Math.PI / 2} material={mats.pants}>
            <boxGeometry args={[0.3, 0.45, 0.14]} />
          </mesh>
        ) : (
          <mesh position-y={hipY / 2} material={mats.pants}>
            <boxGeometry args={[0.3, hipY, 0.16]} />
          </mesh>
        )}
        {sit && (
          <mesh position={[0, hipY / 2, -0.42]} material={mats.pants}>
            <boxGeometry args={[0.28, hipY, 0.12]} />
          </mesh>
        )}
        <mesh geometry={torsoGeo} material={mats.top} position-y={hipY + 0.04} />
        <mesh geometry={GEO.head} position-y={hipY + 0.74} scale={[0.92, 1.1, 1]} material={mats.skin} />
        <mesh geometry={GEO.hair} position={[0, hipY + 0.752, 0.006]} scale={[0.96, 0.95, 1.04]} material={mats.hair} />
        <Plumbob mood={mood} y={hipY + 1.08} />
      </group>
    );

  return (
    <group
      scale={s}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = '';
      }}
    >
      {/* Benen */}
      {[-0.085, 0.085].map((x) => (
        <group key={x} position={[x, hipY - 0.02, 0]} rotation-x={sit ? Math.PI / 2 : 0}>
          <mesh geometry={GEO.thigh} material={mats.pants} />
          <group position-y={-0.43} rotation-x={sit ? -Math.PI / 2 : 0}>
            <mesh geometry={GEO.shin} material={mats.pants} />
            <group position={[0, -0.44, -0.04]}>
              {lite ? (
                <mesh material={mats.shoe}>
                  <boxGeometry args={[0.09, 0.06, 0.24]} />
                </mesh>
              ) : (
                <RoundedBox args={[0.095, 0.07, 0.26]} radius={0.03} smoothness={3} material={mats.shoe} />
              )}
            </group>
          </group>
        </group>
      ))}

      <group ref={body} position-y={hipY}>
        <mesh geometry={hipsGeo} material={mats.pants} />
        {/* Romp: hemd, of colbert met open hals */}
        <mesh geometry={torsoGeo} material={mats.top} position-y={0.04} />
        {blazer && !lite && (
          <>
            <mesh position={[0, 0.44, -0.075]} rotation-x={-0.25} material={mats.shirt}>
              <boxGeometry args={[0.08, 0.16, 0.02]} />
            </mesh>
            <mesh position={[0, 0.36, -0.088]} rotation-x={-0.2} material={mats.accent}>
              <boxGeometry args={[0.03, 0.14, 0.01]} />
            </mesh>
          </>
        )}
        {!lite && (
          // Badge in de kleur van de afdeling
          <mesh position={[0.08, 0.36, -0.1]} rotation-x={-0.1} material={mats.accent}>
            <boxGeometry args={[0.045, 0.06, 0.006]} />
          </mesh>
        )}
        {/* Armen */}
        {[-1, 1].map((side, i) => (
          <group key={side} ref={arms[i][0]} position={[side * 0.2, 0.5, 0]} rotation-z={side * 0.05}>
            <mesh geometry={GEO.joint} scale={0.05} material={mats.top} />
            <mesh geometry={GEO.upperArm} material={mats.top} />
            <group ref={arms[i][1]} position-y={-0.27}>
              {!lite && <mesh geometry={GEO.joint} scale={0.04} material={mats.top} />}
              <mesh geometry={GEO.foreArm} material={mats.top} />
              {!lite && <mesh position-y={-0.29} scale={[0.04, 0.055, 0.025]} geometry={GEO.joint} material={mats.skin} />}
            </group>
          </group>
        ))}
        {/* Nek en hoofd */}
        <mesh position-y={0.6} material={mats.skin}>
          <cylinderGeometry args={[0.045, 0.05, 0.1, 14]} />
        </mesh>
        <group ref={head} position-y={0.74}>
          <mesh geometry={GEO.head} scale={[0.92, 1.1, 1]} material={mats.skin} />
          {!lite && (
            <>
              {[-1, 1].map((sd) => (
                <group key={sd}>
                  <mesh position={[sd * 0.035, 0.015, -0.093]} geometry={GEO.joint} scale={0.011} material={mats.dark} />
                  <mesh position={[sd * 0.036, 0.042, -0.094]} rotation-z={sd * -0.1} material={mats.hair}>
                    <boxGeometry args={[0.032, 0.007, 0.008]} />
                  </mesh>
                  <mesh position={[sd * 0.097, 0, 0]} geometry={GEO.joint} scale={[0.012, 0.025, 0.018]} material={mats.skin} />
                </group>
              ))}
              <mesh position={[0, -0.01, -0.104]} rotation-x={-Math.PI / 2} material={mats.skin}>
                <coneGeometry args={[0.014, 0.03, 10]} />
              </mesh>
              <mesh position={[0, -0.05, -0.095]} material={mats.dark}>
                <boxGeometry args={[0.03, 0.004, 0.004]} />
              </mesh>
            </>
          )}
          {/* Kapsel */}
          <mesh geometry={GEO.hair} position={[0, 0.012, 0.006]} rotation-x={-0.12} scale={[0.96, style === 2 ? 1.05 : 0.95, 1.04]} material={mats.hair} />
          {!lite && style === 1 && <mesh position={[0, 0.07, 0.085]} geometry={GEO.joint} scale={0.042} material={mats.hair} />}
          {!lite && style === 2 && (
            <mesh position={[0, -0.07, 0.05]} material={mats.hair}>
              <capsuleGeometry args={[0.085, 0.12, 4, 14]} />
            </mesh>
          )}
          {!lite && style === 3 && (
            <mesh position={[0.02, 0.085, -0.06]} rotation={[0.5, 0, -0.25]} material={mats.hair}>
              <boxGeometry args={[0.13, 0.025, 0.07]} />
            </mesh>
          )}
        </group>
      </group>

      <Plumbob mood={mood} y={hipY + 1.08} />
      {(label || hover || selected) && (
        <Billboard position-y={hipY + 1.24}>
          <Text font={FONT} fontSize={big ? 0.15 : 0.12} color="#ffffff" outlineWidth={0.016} outlineColor="#0b1526" anchorY="bottom">
            {name}
          </Text>
          {status && (
            <Text font={FONT} fontSize={big ? 0.085 : 0.075} color="#2ff0a6" outlineWidth={0.012} outlineColor="#0b1526" anchorY="top" position-y={-0.015}>
              {status}
            </Text>
          )}
        </Billboard>
      )}
      {selected && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
          <ringGeometry args={[0.42, 0.48, 48]} />
          <meshBasicMaterial color="#2ff0a6" transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  );
}
