// Een personage met realistische verhoudingen (± 1,78 m): kleiner hoofd, nek, schouders, taille,
// armen met ellebogen, handen en schoenen, in zakelijke kledij. De kleur van de afdeling zit in de badge.
// Boven het hoofd zweeft een kleine kristallen diamant die de status toont.
import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { FONT } from '../fonts';
import { FOUNDERS, haarLokken, haarVorm, handen, hoofdGeo, rompen, schoenBoven, schoenZool, stofReliëf, vormen, type HaarStijl, type Uiterlijk } from './mensGeo';

export type Mood = 'bezig' | 'volgende' | 'open' | 'rust' | 'offline';

export const MOOD_COLOR: Record<Mood, string> = {
  bezig: '#2ff0a6',
  volgende: '#ffd23f',
  open: '#2f7bff',
  rust: '#9aa7b2',
  offline: '#5b6670',
};

const SKIN = ['#e9c3a5', '#d7a986', '#c08a66', '#9c6b4b', '#f0d2bb', '#7d5139'];
const HAIR = ['#2a1f18', '#4a3424', '#7b5a3a', '#a07c50', '#1a1a1a', '#5e3e28', '#3a2a20'];
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
/** Hemd in de open hals van een colbert. */
const VHALS = (() => {
  const v = new THREE.Shape();
  v.moveTo(-0.082, 0.095);
  v.lineTo(0.082, 0.095);
  v.lineTo(0, -0.24);
  v.closePath();
  return v;
})();

const GEO = {
  thigh: limb(0.072, 0.056, 0.43),
  shin: limb(0.052, 0.04, 0.42),
  upperArm: limb(0.045, 0.038, 0.27),
  foreArm: limb(0.037, 0.031, 0.25),
  joint: new THREE.SphereGeometry(1, 12, 10),
  head: new THREE.SphereGeometry(0.105, 28, 22),
  hair: new THREE.SphereGeometry(0.112, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.55),
};

/** Haar uit honderden lokken, in één tekenopdracht. */
function Haar({ stijl, kleur, seed }: { stijl: HaarStijl; kleur: string; seed: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const lokken = useMemo(() => haarLokken(stijl, seed), [stijl, seed]);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const basis = new THREE.Color(kleur);
    const c = new THREE.Color();
    lokken.forEach((l, i) => {
      m.setMatrixAt(i, l.m);
      m.setColorAt(i, c.copy(basis).multiplyScalar(l.licht));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [lokken, kleur]);
  return (
    <instancedMesh ref={ref} args={[haarVorm, undefined, lokken.length]} castShadow>
      <meshStandardMaterial color="#ffffff" roughness={0.62} />
    </instancedMesh>
  );
}

const OOG_WIT = new THREE.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.18 });
const PUPIL = new THREE.MeshStandardMaterial({ color: '#060606', roughness: 0.1 });
const oorGeo = (() => {
  const g = new THREE.SphereGeometry(1, 12, 10);
  g.scale(0.0085, 0.024, 0.016);
  return g;
})();

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
  /** Loopt dit mannetje? 0 = stil, 1 = wandelen, hoger = rennen. */
  loop?: { current: number };
  /** Geen statusdiamant boven het hoofd (voor wie zelf rondloopt). */
  zonderDiamant?: boolean;
}

export function Character({ id, name, shirt, mood, pose = 'zit', working, label, status, big, onClick, selected, lite, loop, zonderDiamant }: CharacterProps) {
  const h = hash(id);
  const look: Uiterlijk = useMemo(() => {
    const eigen = FOUNDERS[id];
    if (eigen) return eigen;
    const STIJLEN: HaarStijl[] = ['kort', 'knot', 'lang', 'zij'];
    const colbert = big || (h >> 15) % 3 === 0;
    const hemd = SHIRT[(h >> 9) % SHIRT.length];
    return {
      huid: SKIN[h % SKIN.length],
      haar: HAIR[(h >> 3) % HAIR.length],
      stijl: STIJLEN[(h >> 12) % 4],
      ogen: ['#3f2a1c', '#59626a', '#4a5a3a', '#2c1c12'][(h >> 5) % 4],
      top: colbert ? 'colbert' : (h >> 20) % 2 ? 'trui' : 'hemd',
      topKleur: colbert ? JACKET[(h >> 17) % JACKET.length] : (h >> 20) % 2 ? JACKET[(h >> 18) % JACKET.length] : hemd,
      hemd,
      broek: PANTS[(h >> 6) % PANTS.length],
      schoen: '#1b1a19',
      zool: '#121110',
    };
  }, [id, big, h]);
  const sit = pose === 'zit';
  const [hover, setHover] = useState(false);
  const isFounder = !!FOUNDERS[id];

  const mats = useMemo(
    () => {
      const stof = (color: string, roughness: number) => new THREE.MeshStandardMaterial({ color, roughness, bumpMap: stofReliëf, bumpScale: 0.6 });
      return {
        skin: new THREE.MeshStandardMaterial({ color: look.huid, roughness: 0.58 }),
        gezicht: new THREE.MeshStandardMaterial({ color: look.huid, roughness: 0.52, vertexColors: true }),
        hair: new THREE.MeshStandardMaterial({ color: look.haar, roughness: 0.65 }),
        haarBasis: new THREE.MeshStandardMaterial({ color: new THREE.Color(look.haar).multiplyScalar(0.5), roughness: 0.9 }),
        pants: stof(look.broek, 0.88),
        shirt: stof(look.hemd, 0.8),
        top: stof(look.topKleur, look.top === 'colbert' ? 0.72 : 0.92),
        shoe: new THREE.MeshStandardMaterial({ color: look.schoen, roughness: 0.42, metalness: 0.05 }),
        zool: new THREE.MeshStandardMaterial({ color: look.zool, roughness: 0.75 }),
        dark: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.3 }),
        accent: new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.5 }),
        iris: new THREE.MeshStandardMaterial({ color: look.ogen, roughness: 0.22 }),
        wenkbrauw: new THREE.MeshStandardMaterial({ color: new THREE.Color(look.haar).multiplyScalar(0.7), roughness: 0.8 }),
        koord: new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.8 }),
        knoop: new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.4 }),
        riem: new THREE.MeshStandardMaterial({ color: '#17120e', roughness: 0.45 }),
      };
    },
    [look, shirt],
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
  const benen = useRef<(THREE.Group | null)[]>([]);
  const knieen = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    const l = loop?.current ?? 0;
    if (loop) {
      // Stappen: benen en armen tegengesteld, de knie plooit als het been naar achteren gaat.
      const ritme = t * (7 + l * 3.2);
      benen.current.forEach((b, i) => {
        if (b) b.rotation.x = Math.sin(ritme + i * Math.PI) * 0.62 * Math.min(1.25, l);
      });
      knieen.current.forEach((k, i) => {
        if (k) k.rotation.x = -Math.max(0, Math.sin(ritme + i * Math.PI - 0.9)) * 0.85 * Math.min(1.25, l);
      });
      if (body.current) body.current.position.y = hipY + Math.abs(Math.sin(ritme)) * 0.022 * Math.min(1.25, l);
    }
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
        // Armen zwaaien mee met het tegengestelde been.
        const zwaai = loop && l > 0.02 ? Math.sin(t * (7 + l * 3.2) + i * Math.PI + Math.PI) * 0.55 * Math.min(1.25, l) : Math.sin(t * 1.1 + i) * 0.04;
        a.current.rotation.x = zwaai;
        f.current.rotation.x = 0.15 + (loop ? l * 0.45 : 0);
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
      {[-0.088, 0.088].map((x, bi) => (
        <group key={x} ref={(el) => (benen.current[bi] = el)} position={[x, hipY - 0.02, 0]} rotation-x={sit ? Math.PI / 2 : 0}>
          <mesh geometry={vormen.broekDij} material={mats.pants} castShadow />
          <group ref={(el) => (knieen.current[bi] = el)} position-y={-0.43} rotation-x={sit ? -Math.PI / 2 : 0}>
            <mesh geometry={vormen.broekKuit} material={mats.pants} castShadow />
            <group position={[0, -0.44, -0.04]}>
              <mesh geometry={schoenBoven} material={mats.shoe} castShadow />
              <mesh geometry={schoenZool} material={mats.zool} />
            </group>
          </group>
        </group>
      ))}

      <group ref={body} position-y={hipY}>
        <mesh geometry={hipsGeo} material={mats.pants} />
        {/* Riem */}
        {look.top !== 'hoodie' && (
          <mesh position-y={0.03} scale={[1, 1, 0.66]} material={mats.riem}>
            <cylinderGeometry args={[0.149, 0.149, 0.032, 28]} />
          </mesh>
        )}
        {/* Romp en kleding */}
        <mesh geometry={look.top === 'hemd' ? rompen.bloot : rompen.dik} material={mats.top} position-y={0.04} castShadow />
        {look.top !== 'hemd' && <mesh geometry={rompen.rok} material={mats.top} position-y={0.04} />}
        {look.top === 'colbert' && (
          <>
            {/* Open hals met wit hemd, revers en knoop */}
            <mesh position={[0, 0.455, -0.1215]} rotation-y={Math.PI} material={mats.shirt}>
              <shapeGeometry args={[VHALS]} />
            </mesh>
            {[-1, 1].map((sd) => (
              <group key={sd}>
                <mesh position={[sd * 0.067, 0.395, -0.1235]} rotation={[0, sd * 0.18, sd * -0.24]} material={mats.top}>
                  <boxGeometry args={[0.05, 0.35, 0.006]} />
                </mesh>
                <mesh position={[sd * 0.052, 0.552, -0.094]} rotation={[-0.4, sd * 0.25, sd * -0.5]} material={mats.shirt}>
                  <boxGeometry args={[0.052, 0.066, 0.007]} />
                </mesh>
              </group>
            ))}
            <mesh position={[0, 0.2, -0.104]} rotation-x={Math.PI / 2} material={mats.knoop}>
              <cylinderGeometry args={[0.009, 0.009, 0.005, 12]} />
            </mesh>
          </>
        )}
        {look.top === 'hoodie' && (
          <>
            {/* Kap in de nek, koordjes, buikzak en boord */}
            <mesh position={[0, 0.585, 0.052]} scale={[0.122, 0.085, 0.09]} material={mats.top}>
              <sphereGeometry args={[1, 18, 14]} />
            </mesh>
            <mesh position={[0, 0.555, -0.03]} rotation-x={Math.PI / 2 - 0.15} scale={[1, 0.82, 1]} material={mats.top}>
              <torusGeometry args={[0.073, 0.027, 10, 24]} />
            </mesh>
            {[-1, 1].map((sd) => (
              <mesh key={sd} position={[sd * 0.033, 0.455, -0.12]} rotation-z={sd * 0.04} material={mats.koord}>
                <cylinderGeometry args={[0.0035, 0.0035, 0.11, 6]} />
              </mesh>
            ))}
            <mesh position={[0, 0.095, -0.098]} rotation-x={0.03} material={mats.top}>
              <boxGeometry args={[0.2, 0.135, 0.016]} />
            </mesh>
            <mesh position-y={-0.075} scale={[1, 1, 0.69]} material={mats.top}>
              <cylinderGeometry args={[0.168, 0.168, 0.05, 28]} />
            </mesh>
          </>
        )}
        {look.top === 'hemd' && (
          <>
            {[-1, 1].map((sd) => (
              <mesh key={sd} position={[sd * 0.042, 0.552, -0.058]} rotation={[-0.7, sd * 0.2, sd * 0.4]} material={mats.top}>
                <boxGeometry args={[0.05, 0.05, 0.006]} />
              </mesh>
            ))}
            {[0.2, 0.3, 0.4].map((y) => (
              <mesh key={y} position={[0, y, -0.104 + (y - 0.3) * -0.03]} rotation-x={Math.PI / 2} material={mats.knoop}>
                <cylinderGeometry args={[0.005, 0.005, 0.003, 8]} />
              </mesh>
            ))}
          </>
        )}
        {look.top === 'trui' && (
          <mesh position={[0, 0.555, -0.008]} rotation-x={Math.PI / 2 - 0.1} scale={[1, 0.8, 1]} material={mats.top}>
            <torusGeometry args={[0.062, 0.014, 8, 22]} />
          </mesh>
        )}
        {!isFounder && (
          // Badge in de kleur van de afdeling
          <mesh position={[0.088, 0.37, -0.113]} rotation-x={-0.1} material={mats.accent}>
            <boxGeometry args={[0.045, 0.06, 0.006]} />
          </mesh>
        )}
        {/* Armen */}
        {[-1, 1].map((side, i) => (
          <group key={side} ref={arms[i][0]} position={[side * 0.19, 0.5, 0]} rotation-z={side * 0.075}>
            <mesh geometry={look.top === 'hemd' ? vormen.bovenarm : vormen.mouwBoven} material={mats.top} castShadow />
            <group ref={arms[i][1]} position-y={-0.27}>
              <mesh geometry={look.top === 'hemd' ? vormen.onderarm : vormen.mouwOnder} material={mats.top} castShadow />
              {look.top !== 'trui' && (
                <mesh position-y={-0.255} material={look.top === 'hoodie' ? mats.top : mats.shirt}>
                  <cylinderGeometry args={[0.031, 0.031, 0.03, 12]} />
                </mesh>
              )}
              <mesh position-y={-0.262} geometry={side < 0 ? handen.l : handen.r} material={mats.skin} castShadow />
            </group>
          </group>
        ))}
        {/* Nek en hoofd */}
        <mesh position={[0, 0.595, 0.004]} material={mats.skin}>
          <cylinderGeometry args={[0.054, 0.062, 0.11, 16]} />
        </mesh>
        <group ref={head} position-y={0.74} scale={1.09}>
          <mesh geometry={hoofdGeo} material={mats.gezicht} castShadow />
          {[-1, 1].map((sd) => (
            <group key={sd}>
              {/* Oog: wit, iris, pupil en een bovenooglid */}
              <group position={[sd * 0.038, 0.0165, -0.0815]}>
                <mesh material={OOG_WIT}>
                  <sphereGeometry args={[0.0132, 14, 12]} />
                </mesh>
                <mesh position-z={-0.0105} scale={[1, 1, 0.42]} material={mats.iris}>
                  <sphereGeometry args={[0.0074, 14, 12]} />
                </mesh>
                <mesh position-z={-0.0133} scale={[1, 1, 0.3]} material={PUPIL}>
                  <sphereGeometry args={[0.0036, 10, 8]} />
                </mesh>
                <mesh position={[0, 0.0088, -0.004]} rotation-x={0.25} scale={[1.14, 0.42, 1.1]} material={mats.skin}>
                  <sphereGeometry args={[0.0136, 12, 8]} />
                </mesh>
              </group>
              <mesh position={[sd * 0.039, 0.0425, -0.0915]} rotation={[0, sd * -0.2, Math.PI / 2 + sd * 0.08]} scale={[0.42, 1, 0.42]} material={mats.wenkbrauw}>
                <capsuleGeometry args={[0.0085, 0.03, 4, 8]} />
              </mesh>
              <mesh position={[sd * 0.0955, 0.002, 0.003]} rotation-y={sd * 0.25} geometry={oorGeo} material={mats.skin} />
            </group>
          ))}
          {/* Korte basis onder de lokken, zodat de hoofdhuid niet door het haar schijnt */}
          <mesh rotation-x={0.5} scale={[0.93, 1.17, 1.02]} material={mats.haarBasis}>
            <sphereGeometry args={[0.1045, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          </mesh>
          <Haar stijl={look.stijl} kleur={look.haar} seed={h} />
        </group>
      </group>

      {!zonderDiamant && <Plumbob mood={mood} y={hipY + 1.08} />}
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
