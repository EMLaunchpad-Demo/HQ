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

const SKIN = ['#e3b08e', '#d29a76', '#b98059', '#94633f', '#ebbd9d', '#74492f'];
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
      <meshStandardMaterial color="#ffffff" roughness={0.42} />
    </instancedMesh>
  );
}

const OOG_WIT = new THREE.MeshStandardMaterial({ color: '#fbf9f5', roughness: 0.15, emissive: '#ffffff', emissiveIntensity: 0.08 });
const PUPIL = new THREE.MeshStandardMaterial({ color: '#060606', roughness: 0.1 });
const LICHTJE = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const WIMPER = new THREE.MeshStandardMaterial({ color: '#2a1d14', roughness: 0.6 });
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
    const colbert = big || (h >>> 15) % 3 === 0;
    const hemd = SHIRT[(h >>> 9) % SHIRT.length];
    return {
      huid: SKIN[h % SKIN.length],
      haar: HAIR[(h >>> 3) % HAIR.length],
      stijl: STIJLEN[(h >>> 12) % 4],
      ogen: ['#3f2a1c', '#59626a', '#4a5a3a', '#2c1c12'][(h >>> 5) % 4],
      top: colbert ? 'colbert' : (h >>> 20) % 2 ? 'trui' : 'hemd',
      topKleur: colbert ? JACKET[(h >>> 17) % JACKET.length] : (h >>> 20) % 2 ? JACKET[(h >>> 18) % JACKET.length] : hemd,
      hemd,
      broek: PANTS[(h >>> 6) % PANTS.length],
      schoen: '#1b1a19',
      zool: '#121110',
    };
  }, [id, big, h]);
  const sit = pose === 'zit';
  const [hover, setHover] = useState(false);
  const isFounder = !!FOUNDERS[id];

  const mats = useMemo(
    () => {
      const stof = (color: string, roughness: number) => new THREE.MeshStandardMaterial({ color, roughness, bumpMap: stofReliëf, bumpScale: 0.12 });
      return {
        skin: new THREE.MeshStandardMaterial({ color: look.huid, roughness: 0.5, emissive: look.huid, emissiveIntensity: 0.035 }),
        gezicht2: new THREE.MeshStandardMaterial({ color: look.huid, roughness: 0.46, emissive: look.huid, emissiveIntensity: 0.035 }),
        neusgat: new THREE.MeshStandardMaterial({ color: new THREE.Color(look.huid).multiplyScalar(0.42), roughness: 0.8 }),
        lip: new THREE.MeshStandardMaterial({ color: new THREE.Color(look.huid).lerp(new THREE.Color('#b2574f'), 0.62), roughness: 0.38 }),
        lid: new THREE.MeshStandardMaterial({ color: look.huid, roughness: 0.5, emissive: look.huid, emissiveIntensity: 0.035, side: THREE.DoubleSide }),
        gezicht: new THREE.MeshStandardMaterial({ color: look.huid, roughness: 0.46, vertexColors: true, emissive: look.huid, emissiveIntensity: 0.035 }),
        hair: new THREE.MeshStandardMaterial({ color: look.haar, roughness: 0.65 }),
        haarBasis: new THREE.MeshStandardMaterial({ color: new THREE.Color(look.haar).multiplyScalar(0.62), roughness: 0.7 }),
        pants: stof(look.broek, 0.88),
        shirt: stof(look.hemd, 0.8),
        top: stof(look.topKleur, look.top === 'colbert' ? 0.72 : 0.92),
        shoe: new THREE.MeshStandardMaterial({ color: look.schoen, roughness: 0.42, metalness: 0.05 }),
        zool: new THREE.MeshStandardMaterial({ color: look.zool, roughness: 0.75 }),
        dark: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.3 }),
        accent: new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.5 }),
        iris: new THREE.MeshStandardMaterial({ color: look.ogen, roughness: 0.22 }),
        wenkbrauw: new THREE.MeshStandardMaterial({ color: new THREE.Color(look.haar).multiplyScalar(0.72), roughness: 0.7 }),
        koord: new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.8 }),
        knoop: new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.4 }),
        knoopWit: new THREE.MeshStandardMaterial({ color: '#c9c5bd', roughness: 0.4 }),
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
  const voeten = useRef<(THREE.Group | null)[]>([]);
  const leden = useRef<(THREE.Mesh | null)[]>([]);
  const bekken = useRef<THREE.Group>(null);
  const fase = useRef(phase);
  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const t = clock.elapsedTime + phase;
    const l = loop?.current ?? 0;
    const w = Math.min(1, l);
    // Knipperen, om de paar seconden.
    const knip = (t * 0.23 + phase) % 1 < 0.028;
    leden.current.forEach((m) => {
      if (m) m.scale.y = knip ? 0.98 : 0.36;
    });
    if (body.current) body.current.scale.y = 1 + Math.sin(t * 1.6) * 0.005; // ademen
    if (head.current) {
      // Stilstaan: rustig rondkijken. Lopen: recht vooruit.
      head.current.rotation.y = working ? Math.sin(t * 0.6) * 0.1 : (Math.sin(t * 0.35) * 0.3 + Math.sin(t * 0.13) * 0.14) * (1 - w);
      head.current.rotation.x = working ? 0.12 : Math.sin(t * 0.27) * 0.04 * (1 - w);
    }
    if (sit) {
      arms.forEach(([a, f], i) => {
        if (!a.current || !f.current) return;
        // Bovenarm iets naar voren, onderarm naar het toetsenbord. Positieve x = naar voren (kijkt naar -z).
        a.current.rotation.x = 0.35;
        f.current.rotation.x = 1.2 + (working ? Math.sin(t * 13 + i * 1.7) * 0.06 : 0);
      });
      return;
    }
    // Loopcyclus. De paslengte past bij de snelheid, zodat de voeten niet over de vloer glijden.
    const hoek = l <= 1 ? 0.42 * l : 0.42 + (l - 1) * 0.18;
    const omega = 8.4 + Math.max(0, l - 1) * 3.6;
    fase.current += dt * omega;
    const p = fase.current;
    let bereik = 0;
    for (let i = 0; i < 2; i++) {
      const si = p + i * Math.PI;
      const dij = hoek * Math.sin(si) + 0.015;
      // De knie plooit als het been naar voren zwaait (begin van de zwaaifase), en blijft licht gebogen bij het neerzetten.
      const knie = w * (0.07 + (0.95 + Math.max(0, l - 1) * 0.5) * Math.max(0, Math.cos(si - 0.45)) ** 1.6);
      const b = benen.current[i];
      const k = knieen.current[i];
      const v = voeten.current[i];
      if (b) b.rotation.x = dij;
      if (k) k.rotation.x = -knie;
      // De voet blijft zo goed als vlak; achteraan komt de hiel los en bij het neerzetten de neus.
      if (v) v.rotation.x = -(dij - knie) * 0.78;
      bereik = Math.max(bereik, 0.43 * Math.cos(dij) + 0.44 * Math.cos(dij - knie));
    }
    if (bekken.current) {
      // De hoogte volgt het steunbeen: zo blijft er altijd een voet op de grond.
      bekken.current.position.y = hipY + (bereik - 0.87);
      bekken.current.rotation.y = -Math.sin(p) * 0.1 * w;
      bekken.current.rotation.z = Math.cos(p) * 0.03 * w + Math.sin(t * 0.41) * 0.012 * (1 - w);
      bekken.current.position.x = Math.cos(p) * 0.014 * w + Math.sin(t * 0.41) * 0.014 * (1 - w); // gewicht verleggen
    }
    if (body.current) {
      // Schouders draaien tegen het bekken in, en bij het rennen leun je voorover.
      body.current.rotation.y = Math.sin(p) * 0.2 * w;
      body.current.rotation.x = -0.02 * w - Math.max(0, l - 1) * 0.1;
      body.current.rotation.z = -Math.cos(p) * 0.018 * w;
    }
    arms.forEach(([a, f], i) => {
      if (!a.current || !f.current) return;
      const zwaai = -Math.sin(p + i * Math.PI);
      a.current.rotation.x = zwaai * (0.42 + Math.max(0, l - 1) * 0.3) * w + 0.03 + Math.sin(t * 1.1 + i) * 0.015 * (1 - w);
      // Ellebogen plooien meer als de arm naar voren zwaait.
      f.current.rotation.x = 0.16 + (0.28 + Math.max(0, zwaai) * 0.36 + Math.max(0, l - 1) * 0.7) * w;
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
      <group ref={bekken} position-y={hipY}>
      {/* Benen */}
      {[-0.088, 0.088].map((x, bi) => (
        <group key={x} ref={(el) => (benen.current[bi] = el)} position={[x, -0.02, 0]} rotation-x={sit ? Math.PI / 2 : 0}>
          <mesh geometry={vormen.broekDij} material={mats.pants} castShadow />
          <group ref={(el) => (knieen.current[bi] = el)} position-y={-0.43} rotation-x={sit ? -Math.PI / 2 : 0}>
            <mesh geometry={vormen.broekKuit} material={mats.pants} castShadow />
            <group ref={(el) => (voeten.current[bi] = el)} position={[0, -0.44, -0.04]}>
              <mesh geometry={schoenBoven} material={mats.shoe} castShadow />
              <mesh geometry={schoenZool} material={mats.zool} />
            </group>
          </group>
        </group>
      ))}

      <group ref={body}>
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
            <mesh position={[0, 0.552, -0.004]} scale={[1, 1, 0.98]} material={mats.shirt}>
              <cylinderGeometry args={[0.061, 0.092, 0.075, 18]} />
            </mesh>
            <mesh position={[0, 0.535, -0.062]} scale={[0.082, 0.05, 0.064]} material={mats.shirt}>
              <sphereGeometry args={[1, 16, 10]} />
            </mesh>
            {[0.415, 0.345, 0.275].map((y) => (
              <mesh key={y} position={[0, y, -0.1222]} rotation-x={Math.PI / 2} material={mats.knoopWit}>
                <cylinderGeometry args={[0.0042, 0.0042, 0.002, 10]} />
              </mesh>
            ))}
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
        {/* Schouders, zodat romp en armen in elkaar overlopen */}
        {look.top !== 'hemd' &&
          [-1, 1].map((sd) => (
            <mesh key={sd} position={[sd * 0.15, 0.5, 0]} scale={[0.078, 0.047, 0.06]} rotation-z={sd * -0.3} material={mats.top}>
              <sphereGeometry args={[1, 16, 12]} />
            </mesh>
          ))}
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
              <mesh position-y={-0.255} rotation-y={side * (Math.PI / 2 - 0.25)} geometry={side < 0 ? handen.l : handen.r} material={mats.skin} castShadow />
            </group>
          </group>
        ))}
        {/* Nek en hoofd */}
        <mesh position={[0, 0.6, 0.004]} material={mats.skin}>
          <cylinderGeometry args={[0.056, 0.064, 0.13, 16]} />
        </mesh>
        <group ref={head} position-y={0.75} scale={1.13}>
          <mesh geometry={hoofdGeo} material={mats.gezicht} castShadow />
          {[-1, 1].map((sd) => (
            <group key={sd}>
              {/* Groot oog: wit, iris, pupil, lichtje, ooglid en wimpers */}
              <group position={[sd * 0.041, 0.008, -0.0852]} rotation-y={sd * -0.12} scale={1.14}>
                <mesh material={OOG_WIT}>
                  <sphereGeometry args={[0.0158, 18, 14]} />
                </mesh>
                <mesh position-z={-0.0118} scale={[1, 1, 0.45]} material={mats.iris}>
                  <sphereGeometry args={[0.0098, 18, 14]} />
                </mesh>
                <mesh position-z={-0.0153} scale={[1, 1, 0.3]} material={PUPIL}>
                  <sphereGeometry args={[0.0048, 12, 10]} />
                </mesh>
                <mesh position={[0.0034, 0.0038, -0.0167]} material={LICHTJE}>
                  <sphereGeometry args={[0.0017, 8, 6]} />
                </mesh>
                <mesh ref={(el) => (leden.current[sd < 0 ? 0 : 1] = el)} position={[0, 0.0065, -0.002]} scale={[1.1, 0.36, 1.1]} material={mats.lid}>
                  <sphereGeometry args={[0.0163, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
                </mesh>
                <mesh position={[0, 0.0005, -0.0092]} rotation-z={Math.PI * 0.11} material={WIMPER}>
                  <torusGeometry args={[0.0145, 0.00135, 6, 16, Math.PI * 0.78]} />
                </mesh>
              </group>
              <mesh position={[sd * 0.041, 0.0385, -0.0955]} rotation={[0.05, sd * -0.15, Math.PI / 2 + sd * 0.1]} scale={[0.55, 1, 0.42]} material={mats.wenkbrauw}>
                <capsuleGeometry args={[0.0078, 0.03, 4, 8]} />
              </mesh>
              <mesh position={[sd * 0.0955, 0.002, 0.003]} rotation-y={sd * 0.25} geometry={oorGeo} material={mats.skin} />
            </group>
          ))}
          {/* Neus */}
          <mesh position={[0, -0.0235, -0.1035]} scale={[0.0125, 0.0105, 0.0115]} material={mats.gezicht2}>
            <sphereGeometry args={[1, 14, 10]} />
          </mesh>
          {[-1, 1].map((sd) => (
            <group key={sd}>
              <mesh position={[sd * 0.0108, -0.0265, -0.0985]} scale={[0.0072, 0.0062, 0.0072]} material={mats.gezicht2}>
                <sphereGeometry args={[1, 10, 8]} />
              </mesh>
              <mesh position={[sd * 0.0058, -0.0322, -0.1035]} scale={[0.0028, 0.0016, 0.002]} material={mats.neusgat}>
                <sphereGeometry args={[1, 8, 6]} />
              </mesh>
            </group>
          ))}
          {/* Mond: bovenlip, onderlip en een lichte glimlach */}
          <group position={[0, -0.0615, -0.0925]}>
            {[-1, 1].map((sd) => (
              <group key={sd}>
                <mesh position={[sd * 0.0118, 0.0034, 0.0005]} rotation-z={Math.PI / 2 + sd * 0.26} scale={[0.5, 1, 0.5]} material={mats.lip}>
                  <capsuleGeometry args={[0.0042, 0.019, 4, 10]} />
                </mesh>
                <mesh position={[sd * 0.0232, 0.0075, 0.0015]} scale={[0.0026, 0.0018, 0.0018]} material={mats.neusgat}>
                  <sphereGeometry args={[1, 8, 6]} />
                </mesh>
              </group>
            ))}
            <mesh position={[0, -0.0024, -0.0002]} scale={[0.0165, 0.0042, 0.0042]} material={mats.lip}>
              <sphereGeometry args={[1, 16, 10]} />
            </mesh>
          </group>
          {/* Korte basis onder de lokken, zodat de hoofdhuid niet door het haar schijnt */}
          <mesh rotation-x={0.42} scale={[0.96, 1.17, 1.03]} material={mats.haarBasis}>
            <sphereGeometry args={[0.1055, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          </mesh>
          <Haar stijl={look.stijl} kleur={look.haar} seed={h} />
        </group>
      </group>

      </group>

      {!zonderDiamant && <Plumbob mood={mood} y={hipY + 1.16} />}
      {(label || hover || selected) && (
        <Billboard position-y={hipY + 1.32}>
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
