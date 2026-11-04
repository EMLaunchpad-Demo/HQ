// Het wagenpark van EM Launchpad: luxewagens in de stijl van een hoekige terreinwagen, een lange sedan en een coupé.
// Geen merklogo's of exacte merkontwerpen; wel een subtiele EM Launchpad-belettering en eigen nummerplaten.
import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox, Text } from '@react-three/drei';
import { FONT, FONT_MONO } from '../fonts';
import { asphaltTex, brandGradientTex } from '../textures';
import { Plant } from './Furniture';

const chrome = new THREE.MeshStandardMaterial({ color: '#e6e9ec', roughness: 0.08, metalness: 1 });
const satin = new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.35, metalness: 0.8 });
const black = new THREE.MeshStandardMaterial({ color: '#0d0e10', roughness: 0.45, metalness: 0.3 });
const tyre = new THREE.MeshStandardMaterial({ color: '#121212', roughness: 0.92 });
const glass = new THREE.MeshStandardMaterial({ color: '#0a0e13', roughness: 0.04, metalness: 0.6, envMapIntensity: 1.8 });
const lamp = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#eef7ff', emissiveIntensity: 2.2 });
const rear = new THREE.MeshStandardMaterial({ color: '#3a0606', emissive: '#ff2020', emissiveIntensity: 1.2 });
const white = new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.6 });

const paint = (color: string, matte = false) =>
  new THREE.MeshPhysicalMaterial({ color, metalness: matte ? 0.3 : 0.65, roughness: matte ? 0.45 : 0.22, clearcoat: matte ? 0.2 : 1, clearcoatRoughness: 0.06, envMapIntensity: 1.4 });

/** Extrudeert een zijprofiel over de breedte, met afgeronde randen. */
function extrude(shape: THREE.Shape, depth: number, bevel = 0.08) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 5, curveSegments: 20 });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  return g;
}

/** Zijprofiel met uitgesneden wielkasten; `top` loopt van achter-onder over het dak naar voor-onder. */
function bodyShape(top: [number, number][], y0: number, wx: number, r: number, smooth = true) {
  const ra = r + 0.06;
  const s = new THREE.Shape();
  const front = top[top.length - 1];
  s.moveTo(front[0], y0);
  for (const cx of [-wx, wx]) {
    s.lineTo(cx - ra, y0);
    s.lineTo(cx - ra, r * 0.9);
    s.absarc(cx, r * 0.9, ra, Math.PI, 0, true);
    s.lineTo(cx + ra, y0);
  }
  if (smooth) {
    const pts = top.map(([x, y]) => new THREE.Vector2(x, y));
    const curve = new THREE.SplineCurve(pts);
    for (const p of curve.getPoints(60)) s.lineTo(p.x, p.y);
  } else for (const [x, y] of top) s.lineTo(x, y);
  s.closePath();
  return s;
}

/** Velg met veel fijne spaken, laagprofielband en remschijf. */
function Wheel({ r, spokes = 20, rim = 'twee' }: { r: number; spokes?: number; rim?: 'twee' | 'zwart' }) {
  const tyreGeo = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    const w = 0.14;
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI;
      pts.push(new THREE.Vector2(r - 0.07 + Math.sin(a) * 0.07, -w + (i / 12) * w * 2));
    }
    return new THREE.LatheGeometry(pts, 40);
  }, [r]);
  const spokeMat = rim === 'zwart' ? satin : chrome;
  return (
    <group rotation-x={Math.PI / 2}>
      <mesh geometry={tyreGeo} material={tyre} />
      <mesh material={tyre}>
        <cylinderGeometry args={[r - 0.07, r - 0.07, 0.26, 36, 1, true]} />
      </mesh>
      <mesh position-y={0.06} material={black}>
        <cylinderGeometry args={[r - 0.075, r - 0.075, 0.12, 36]} />
      </mesh>
      <mesh position-y={0.1} material={satin}>
        <cylinderGeometry args={[r * 0.45, r * 0.45, 0.02, 30]} />
      </mesh>
      <mesh position-y={0.135} material={spokeMat}>
        <torusGeometry args={[r - 0.085, 0.012, 6, 40]} />
      </mesh>
      {Array.from({ length: spokes }, (_, i) => (
        <mesh key={i} position-y={0.135} rotation-y={(i / spokes) * Math.PI * 2} material={i % 2 ? spokeMat : satin}>
          <boxGeometry args={[(r - 0.09) * 2, 0.014, 0.028]} />
        </mesh>
      ))}
      <mesh position-y={0.14} material={chrome}>
        <cylinderGeometry args={[0.06, 0.06, 0.02, 20]} />
      </mesh>
    </group>
  );
}

function Mirrors({ x, y, W, mat }: { x: number; y: number; W: number; mat: THREE.Material }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <group key={s} position={[x, y, s * (W / 2 + 0.1)]}>
          <RoundedBox args={[0.2, 0.13, 0.18]} radius={0.04} material={mat} />
          <mesh position={[0.05, -0.08, -s * 0.07]} material={black}>
            <boxGeometry args={[0.06, 0.06, 0.08]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Plates({ front, back, y, text }: { front: number; back: number; y: number; text: string }) {
  return (
    <>
      {[front, back].map((x, i) => (
        <group key={i} position={[x, y, 0]} rotation-y={x < 0 ? -Math.PI / 2 : Math.PI / 2}>
          <mesh material={white}>
            <planeGeometry args={[0.52, 0.12]} />
          </mesh>
          <Text font={FONT_MONO} fontSize={0.07} color="#b3132b" position-z={0.002}>
            {text}
          </Text>
        </group>
      ))}
    </>
  );
}

/** Subtiele belettering laag op de achterdeur, zoals een bedrijfswagen van een premium merk. */
function Lettering({ x, y, W, light }: { x: number; y: number; W: number; light: boolean }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <group key={s} position={[x, y, s * (W / 2 + 0.012)]} rotation-y={s > 0 ? 0 : Math.PI}>
          <Text font={FONT} fontSize={0.075} letterSpacing={0.25} color={light ? '#0b1526' : '#e8eef2'}>
            EM LAUNCHPAD
          </Text>
          <mesh position-y={-0.06}>
            <planeGeometry args={[0.7, 0.012]} />
            <meshBasicMaterial map={brandGradientTex()} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** Hoekige terreinwagen: vlakke panelen, rechtopstaande ruit, ronde koplampen, brede wielkasten. */
function BoxSuv({ color, plate, matte }: { color: string; plate: string; matte?: boolean }) {
  const W = 1.98;
  const r = 0.43;
  const wx = 1.45;
  const mat = useMemo(() => paint(color, matte), [color, matte]);
  const body = useMemo(
    () => extrude(bodyShape([[2.35, 0.48], [2.4, 0.62], [2.4, 1.12], [-1.05, 1.14], [-2.3, 1.12], [-2.38, 1.0], [-2.4, 0.62], [-2.36, 0.48]], 0.48, wx, r, false), W, 0.06),
    [],
  );
  const light = color === '#f4f5f6';
  return (
    <group>
      <mesh geometry={body} material={mat} castShadow receiveShadow />
      {/* Kooi: bijna verticale ruit, plat dak, ruiten in de flanken */}
      <RoundedBox args={[3.35, 0.82, W - 0.1]} radius={0.06} position={[0.68, 1.54, 0]} material={mat} castShadow />
      <mesh position={[-1.0, 1.55, 0]} rotation-z={-0.08} material={glass}>
        <boxGeometry args={[0.05, 0.66, W - 0.32]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          {[[-0.45, 0.78], [0.5, 0.78], [1.48, 0.86]].map(([x, w]) => (
            <mesh key={x} position={[x, 1.56, s * (W / 2 - 0.045)]} material={glass}>
              <boxGeometry args={[w, 0.56, 0.02]} />
            </mesh>
          ))}
          {/* Brede wielkasten */}
          {[-wx, wx].map((x) => (
            <mesh key={x} position={[x, 0.86, s * (W / 2 + 0.02)]} material={mat}>
              <boxGeometry args={[1.15, 0.12, 0.08]} />
            </mesh>
          ))}
          {/* Sierlijst, treeplank en deurklinken */}
          <mesh position={[0.1, 0.98, s * (W / 2 + 0.005)]} material={black}>
            <boxGeometry args={[3.3, 0.06, 0.02]} />
          </mesh>
          <mesh position={[0.05, 0.36, s * (W / 2 + 0.06)]} material={satin}>
            <boxGeometry args={[1.7, 0.06, 0.16]} />
          </mesh>
          {[-0.25, 0.75].map((x) => (
            <mesh key={x} position={[x, 1.05, s * (W / 2 + 0.02)]} material={chrome}>
              <boxGeometry args={[0.16, 0.03, 0.03]} />
            </mesh>
          ))}
          {/* Ronde koplampen en richtingaanwijzers bovenop de spatborden */}
          <group position={[-2.41, 0.86, s * 0.66]} rotation-z={Math.PI / 2}>
            <mesh material={chrome}>
              <torusGeometry args={[0.15, 0.025, 10, 28]} />
            </mesh>
            <mesh material={lamp}>
              <circleGeometry args={[0.13, 24]} />
            </mesh>
          </group>
          <mesh position={[-2.05, 1.17, s * 0.82]} material={lamp}>
            <boxGeometry args={[0.22, 0.05, 0.12]} />
          </mesh>
          <mesh position={[2.41, 0.95, s * 0.74]} material={rear}>
            <boxGeometry args={[0.04, 0.26, 0.14]} />
          </mesh>
          {[-wx, wx].map((x) => (
            <group key={`w${x}`} position={[x, r, s * (W / 2 - 0.16)]} scale={[1, 1, s]}>
              <Wheel r={r} spokes={22} rim="zwart" />
            </group>
          ))}
        </group>
      ))}
      {/* Grille met verticale lamellen tussen de koplampen, zwarte bumper */}
      <mesh position={[-2.415, 0.86, 0]} material={black}>
        <boxGeometry args={[0.03, 0.42, 1.0]} />
      </mesh>
      {Array.from({ length: 11 }, (_, i) => (
        <mesh key={i} position={[-2.43, 0.86, -0.45 + i * 0.09]} material={chrome}>
          <boxGeometry args={[0.02, 0.38, 0.018]} />
        </mesh>
      ))}
      <RoundedBox args={[0.22, 0.24, W + 0.04]} radius={0.05} position={[-2.38, 0.5, 0]} material={black} />
      <RoundedBox args={[0.2, 0.22, W + 0.04]} radius={0.05} position={[2.4, 0.52, 0]} material={black} />
      <Mirrors x={-0.92} y={1.3} W={W} mat={mat} />
      <Lettering x={0.75} y={0.62} W={W} light={light} />
      <Plates front={-2.5} back={2.51} y={0.55} text={plate} />
    </group>
  );
}

/** Lange luxesedan: vloeiende daklijn, chromen ruitomlijsting, grote chromen grille, smalle ledkoplampen. */
function LuxSedan({ color, plate }: { color: string; plate: string }) {
  const W = 1.92;
  const r = 0.37;
  const wx = 1.6;
  const mat = useMemo(() => paint(color), [color]);
  const body = useMemo(
    () => extrude(bodyShape([[2.5, 0.3], [2.62, 0.48], [2.6, 0.78], [2.4, 0.95], [1.75, 0.99], [0.4, 0.98], [-1.0, 0.95], [-2.1, 0.86], [-2.55, 0.75], [-2.62, 0.55], [-2.55, 0.3]], 0.3, wx, r), W, 0.1),
    [],
  );
  const cabinShape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-1.02, 0.93);
    s.lineTo(1.85, 0.97);
    s.bezierCurveTo(1.55, 1.25, 1.05, 1.44, 0.45, 1.46);
    s.bezierCurveTo(-0.15, 1.46, -0.45, 1.3, -1.02, 0.93);
    return s;
  }, []);
  const cabin = useMemo(() => extrude(cabinShape, W - 0.16, 0.1), [cabinShape]);
  const trim = useMemo(() => extrude(cabinShape, W - 0.12, 0.02), [cabinShape]);
  const light = color === '#c9ccd0';
  return (
    <group>
      <mesh geometry={body} material={mat} castShadow receiveShadow />
      <mesh geometry={trim} material={chrome} scale={[1.01, 1.0, 1]} position-y={-0.005} />
      <mesh geometry={cabin} material={glass} castShadow />
      <mesh position={[0.4, 1.47, 0]} material={mat}>
        <boxGeometry args={[1.4, 0.04, W - 0.5]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[0.05, 0.42, s * (W / 2 + 0.005)]} material={chrome}>
            <boxGeometry args={[3.2, 0.03, 0.02]} />
          </mesh>
          <mesh position={[0.4, 1.2, s * (W / 2 - 0.11)]} material={mat}>
            <boxGeometry args={[0.07, 0.48, 0.03]} />
          </mesh>
          {[-0.2, 1.0].map((x) => (
            <mesh key={x} position={[x, 0.88, s * (W / 2 + 0.02)]} material={chrome}>
              <boxGeometry args={[0.2, 0.025, 0.025]} />
            </mesh>
          ))}
          <mesh position={[-2.58, 0.7, s * 0.66]} rotation-y={s * 0.25} material={lamp}>
            <boxGeometry args={[0.06, 0.05, 0.42]} />
          </mesh>
          <mesh position={[2.6, 0.78, s * 0.62]} material={rear}>
            <boxGeometry args={[0.05, 0.07, 0.5]} />
          </mesh>
          {[-wx, wx].map((x) => (
            <group key={`w${x}`} position={[x, r, s * (W / 2 - 0.17)]} scale={[1, 1, s]}>
              <Wheel r={r} spokes={20} />
            </group>
          ))}
        </group>
      ))}
      {/* Grote chromen grille met verticale lamellen */}
      <mesh position={[-2.62, 0.6, 0]} material={chrome}>
        <boxGeometry args={[0.04, 0.34, 0.86]} />
      </mesh>
      <mesh position={[-2.63, 0.6, 0]} material={black}>
        <boxGeometry args={[0.03, 0.29, 0.8]} />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[-2.645, 0.6, -0.36 + i * 0.09]} material={chrome}>
          <boxGeometry args={[0.02, 0.27, 0.02]} />
        </mesh>
      ))}
      <mesh position={[-2.6, 0.36, 0]} material={chrome}>
        <boxGeometry args={[0.03, 0.03, 1.4]} />
      </mesh>
      <Mirrors x={-0.85} y={1.02} W={W} mat={mat} />
      <Lettering x={1.0} y={0.55} W={W} light={light} />
      <Plates front={-2.66} back={2.66} y={0.45} text={plate} />
    </group>
  );
}

/** Lange coupé: lange motorkap, vloeiende fastback, hoge rechtopstaande chromen grille, tweekleurig. */
function GrandCoupe({ color, plate }: { color: string; plate: string }) {
  const W = 2.0;
  const r = 0.4;
  const wx = 1.72;
  const mat = useMemo(() => paint(color), [color]);
  const body = useMemo(
    () => extrude(bodyShape([[2.55, 0.32], [2.66, 0.52], [2.6, 0.82], [2.2, 0.96], [0.9, 1.0], [-0.6, 0.98], [-2.3, 0.94], [-2.62, 0.86], [-2.66, 0.58], [-2.58, 0.32]], 0.32, wx, r), W, 0.1),
    [],
  );
  const cabinShape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.62, 0.96);
    s.lineTo(2.25, 0.98);
    s.bezierCurveTo(1.6, 1.32, 1.0, 1.47, 0.45, 1.47);
    s.bezierCurveTo(0.0, 1.46, -0.25, 1.28, -0.62, 0.96);
    return s;
  }, []);
  const cabin = useMemo(() => extrude(cabinShape, W - 0.2, 0.1), [cabinShape]);
  return (
    <group>
      <mesh geometry={body} material={mat} castShadow receiveShadow />
      <mesh geometry={cabin} material={glass} castShadow />
      <mesh position={[0.45, 1.48, 0]} material={mat}>
        <boxGeometry args={[1.5, 0.04, W - 0.5]} />
      </mesh>
      {/* Chromen lijn over de motorkap en langs de flank */}
      <mesh position={[-1.5, 1.0, 0]} material={chrome}>
        <boxGeometry args={[1.8, 0.02, 0.025]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[0, 0.46, s * (W / 2 + 0.005)]} material={chrome}>
            <boxGeometry args={[3.6, 0.025, 0.02]} />
          </mesh>
          <mesh position={[0.5, 0.92, s * (W / 2 + 0.02)]} material={chrome}>
            <boxGeometry args={[0.22, 0.025, 0.025]} />
          </mesh>
          <mesh position={[-2.62, 0.74, s * 0.68]} material={lamp}>
            <boxGeometry args={[0.05, 0.06, 0.36]} />
          </mesh>
          <mesh position={[2.62, 0.82, s * 0.66]} material={rear}>
            <boxGeometry args={[0.05, 0.05, 0.46]} />
          </mesh>
          {[-wx, wx].map((x) => (
            <group key={`w${x}`} position={[x, r, s * (W / 2 - 0.17)]} scale={[1, 1, s]}>
              <Wheel r={r} spokes={16} />
            </group>
          ))}
        </group>
      ))}
      {/* Hoge, rechtopstaande grille met verticale chromen lamellen */}
      <mesh position={[-2.66, 0.66, 0]} material={chrome}>
        <boxGeometry args={[0.06, 0.42, 0.72]} />
      </mesh>
      {Array.from({ length: 10 }, (_, i) => (
        <mesh key={i} position={[-2.7, 0.66, -0.3 + i * 0.066]} material={satin}>
          <boxGeometry args={[0.02, 0.36, 0.022]} />
        </mesh>
      ))}
      <Mirrors x={-0.45} y={1.06} W={W} mat={mat} />
      <Lettering x={1.3} y={0.62} W={W} light={false} />
      <Plates front={-2.71} back={2.7} y={0.46} text={plate} />
    </group>
  );
}

type Model = 'suv' | 'sedan' | 'coupe';
const FLEET: { model: Model; color: string; plate: string; matte?: boolean }[] = [
  { model: 'suv', color: '#1f9fd0', plate: '1-EML-001', matte: true },
  { model: 'sedan', color: '#101a2c', plate: '1-EML-002' },
  { model: 'coupe', color: '#0e1412', plate: '1-EML-003' },
  { model: 'suv', color: '#0f1113', plate: '1-EML-004' },
  { model: 'sedan', color: '#c9ccd0', plate: '1-EML-005' },
];

function Car({ model, color, plate, matte }: (typeof FLEET)[number]) {
  if (model === 'suv') return <BoxSuv color={color} plate={plate} matte={matte} />;
  if (model === 'sedan') return <LuxSedan color={color} plate={plate} />;
  return <GrandCoupe color={color} plate={plate} />;
}

function Charger() {
  return (
    <group>
      <RoundedBox args={[0.32, 1.3, 0.22]} radius={0.05} position-y={0.65} material={white} />
      <mesh position={[0, 1.05, 0.112]}>
        <planeGeometry args={[0.2, 0.06]} />
        <meshBasicMaterial map={brandGradientTex()} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Parking: donker asfalt, witte vakken, laadpalen en het wagenpark. */
export function Parking({ position }: { position: [number, number, number] }) {
  const asphalt = useMemo(() => {
    const t = asphaltTex([3, 2]).clone();
    t.needsUpdate = true;
    return t;
  }, []);
  const spot = 2.9;
  return (
    <group position={position}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.03} receiveShadow>
        <planeGeometry args={[16, 11.5]} />
        <meshStandardMaterial map={asphalt} color="#4e5256" roughness={0.8} />
      </mesh>
      {Array.from({ length: FLEET.length + 1 }, (_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[(i - FLEET.length / 2) * spot, 0.035, -2.4]}>
          <planeGeometry args={[0.1, 5.6]} />
          <meshStandardMaterial color="#e8e8e4" roughness={0.6} />
        </mesh>
      ))}
      {FLEET.map((c, i) => (
        <group key={c.plate} position={[(i - (FLEET.length - 1) / 2) * spot, 0.03, -2.2]} rotation-y={Math.PI / 2}>
          <Car {...c} />
        </group>
      ))}
      {FLEET.map((c, i) => (
        <group key={`laad-${c.plate}`} position={[(i - (FLEET.length - 1) / 2) * spot + 1.1, 0.03, -5.4]}>
          <Charger />
        </group>
      ))}
      <group position={[-7.2, 0, 4.6]}>
        <mesh position-y={1} material={black}>
          <boxGeometry args={[0.08, 2, 0.08]} />
        </mesh>
        <mesh position-y={2.05} material={black}>
          <boxGeometry args={[1.3, 0.5, 0.06]} />
        </mesh>
        <Text font={FONT} fontSize={0.12} color="#ffffff" position={[0, 2.1, 0.035]} letterSpacing={0.1}>
          EM LAUNCHPAD
        </Text>
        <Text font={FONT_MONO} fontSize={0.07} color="#13c7e6" position={[0, 1.94, 0.035]}>
          PARKING · ENKEL TEAM
        </Text>
      </group>
      {[-7.6, 7.6].map((x) => (
        <group key={x} position={[x, 0, -5.5]}>
          <Plant tall scale={1.2} />
        </group>
      ))}
    </group>
  );
}
