// De omgeving van het hoofdkantoor: een landelijk perceel.
// Straat met kasseien en bakstenen pilaren, groene smeedijzeren hekken, lange grindoprit,
// een groot gazon met hagen, hoeves met rode pannendaken en boomgaarden erachter.
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { QuadraticBezierLine, Sky, Text } from '@react-three/drei';
import { asphaltTex, brickTex, cloudTex, cobbleTex, grassTex, gravelTex, leafTex, roofTex } from '../textures';
import { FONT_MONO } from '../fonts';

export const STREET_Z = 47;
export const GATE_Z = 36;

const IRON = '#2d5a3d';

// Het land, de velden en het dorp errond staan in Village.tsx; hier enkel het perceel.
function Ground() {
  return (
    <group>
      {/* Het perceel zelf: verzorgd gazon. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -4]} receiveShadow>
        <planeGeometry args={[62, 82]} />
        <meshStandardMaterial map={grassTex([10, 13])} bumpMap={grassTex([10, 13])} bumpScale={1.5} roughness={0.95} />
      </mesh>
    </group>
  );
}

function Street() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, STREET_Z]} receiveShadow>
        <planeGeometry args={[400, 6.5]} />
        <meshStandardMaterial map={asphaltTex([60, 1])} bumpMap={asphaltTex([60, 1])} bumpScale={1} roughness={0.9} />
      </mesh>
      {/* Grasberm en goot aan beide kanten. */}
      {[-1, 1].map((s) => (
        <mesh key={s} rotation-x={-Math.PI / 2} position={[0, 0.025, STREET_Z + s * 3.4]}>
          <planeGeometry args={[400, 0.35]} />
          <meshStandardMaterial color="#9c9a94" roughness={1} />
        </mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, STREET_Z + 7]} receiveShadow>
        <planeGeometry args={[400, 7]} />
        <meshStandardMaterial map={grassTex([60, 1])} roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, STREET_Z - 5.5]} receiveShadow>
        <planeGeometry args={[400, 4.5]} />
        <meshStandardMaterial map={grassTex([60, 1])} roughness={1} />
      </mesh>
    </group>
  );
}

/** Waaier van kasseien tussen straat en poort. */
function CobbleApron() {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-3.7, -GATE_Z + 2.5);
    s.lineTo(3.7, -GATE_Z + 2.5);
    s.lineTo(3.7, -GATE_Z);
    s.quadraticCurveTo(4.6, -GATE_Z - 5.6, 10.5, -STREET_Z + 3.2);
    s.lineTo(-10.5, -STREET_Z + 3.2);
    s.quadraticCurveTo(-4.6, -GATE_Z - 5.6, -3.7, -GATE_Z);
    return new THREE.ShapeGeometry(s, 24);
  }, []);
  return (
    <mesh geometry={geo} rotation-x={-Math.PI / 2} position-y={0.035} receiveShadow>
      <meshStandardMaterial map={cobbleTex([0.16, 0.16])} bumpMap={cobbleTex([0.16, 0.16])} bumpScale={4} roughness={0.85} />
    </mesh>
  );
}

function Pillar({ x }: { x: number }) {
  return (
    <group position={[x, 0, GATE_Z]}>
      <mesh position-y={0.85} castShadow receiveShadow>
        <boxGeometry args={[0.62, 1.7, 0.62]} />
        <meshStandardMaterial map={brickTex([0.6, 1.4])} bumpMap={brickTex([0.6, 1.4])} bumpScale={-2} roughness={0.9} />
      </mesh>
      <mesh position-y={1.74} castShadow>
        <boxGeometry args={[0.74, 0.09, 0.74]} />
        <meshStandardMaterial color="#b8b2a7" roughness={0.8} />
      </mesh>
      <mesh position-y={1.83} castShadow>
        <boxGeometry args={[0.5, 0.09, 0.5]} />
        <meshStandardMaterial color="#b8b2a7" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Rij smeedijzeren spijlen met een bovenlat, tussen twee punten. */
function IronFence({ from, to, base = 0, height = 0.9 }: { from: [number, number]; to: [number, number]; base?: number; height?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const n = Math.max(2, Math.round(len / 0.14));
  const angle = Math.atan2(-dz, dx);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      m.makeTranslation((i / (n - 1) - 0.5) * len, base + height / 2, 0);
      ref.current!.setMatrixAt(i, m);
    }
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [n, len, base, height]);
  return (
    <group position={[(from[0] + to[0]) / 2, 0, (from[1] + to[1]) / 2]} rotation-y={angle}>
      <instancedMesh ref={ref} args={[undefined, undefined, n]} castShadow>
        <boxGeometry args={[0.025, height, 0.025]} />
        <meshStandardMaterial color={IRON} metalness={0.4} roughness={0.5} />
      </instancedMesh>
      {[base + height - 0.04, base + 0.12].map((y) => (
        <mesh key={y} position-y={y}>
          <boxGeometry args={[len, 0.04, 0.04]} />
          <meshStandardMaterial color={IRON} metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** Lage gebogen bakstenen muur met hekwerk erop, zoals naast de poort. */
function WingWall({ side }: { side: 1 | -1 }) {
  const pts = useMemo(() => {
    const c = new THREE.QuadraticBezierCurve(new THREE.Vector2(side * 3.95, GATE_Z), new THREE.Vector2(side * 6.5, GATE_Z + 0.2), new THREE.Vector2(side * 8.8, GATE_Z - 1.2));
    return c.getPoints(7);
  }, [side]);
  return (
    <group>
      {pts.slice(1).map((p, i) => {
        const a = pts[i];
        const len = a.distanceTo(p);
        const ang = Math.atan2(-(p.y - a.y), p.x - a.x);
        return (
          <group key={i}>
            <mesh position={[(a.x + p.x) / 2, 0.34, (a.y + p.y) / 2]} rotation-y={ang} castShadow receiveShadow>
              <boxGeometry args={[len + 0.06, 0.68, 0.36]} />
              <meshStandardMaterial map={brickTex([len / 1.6, 0.45])} bumpMap={brickTex([len / 1.6, 0.45])} bumpScale={-2} roughness={0.9} />
            </mesh>
            <IronFence from={[a.x, a.y]} to={[p.x, p.y]} base={0.68} height={0.72} />
          </group>
        );
      })}
      <Pillar x={side * 8.9} />
    </group>
  );
}

function GateLeaf({ side }: { side: 1 | -1 }) {
  // Open naar binnen gedraaid, zoals op de foto's.
  return (
    <group position={[side * 3.62, 0, GATE_Z]} rotation-y={side * -1.15}>
      <group position-x={-side * 1.75}>
        <IronFence from={[-1.7, 0]} to={[1.7, 0]} base={0.08} height={1.45} />
        {[-1.72, 1.72].map((x) => (
          <mesh key={x} position={[x, 0.82, 0]}>
            <boxGeometry args={[0.06, 1.55, 0.06]} />
            <meshStandardMaterial color={IRON} metalness={0.4} roughness={0.5} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Entrance() {
  return (
    <group>
      <CobbleApron />
      <Pillar x={-3.7} />
      <Pillar x={3.7} />
      <GateLeaf side={-1} />
      <GateLeaf side={1} />
      <WingWall side={-1} />
      <WingWall side={1} />
      {/* Naambordje op de pilaar: alleen de naam van het bedrijf. */}
      <group position={[3.7, 1.05, GATE_Z + 0.32]}>
        <mesh>
          <boxGeometry args={[0.5, 0.2, 0.02]} />
          <meshStandardMaterial color="#0b1526" roughness={0.4} metalness={0.3} />
        </mesh>
        <Text font={FONT_MONO} fontSize={0.055} position-z={0.012} color="#eef4f6" letterSpacing={0.08}>
          EM LAUNCHPAD
        </Text>
      </group>
    </group>
  );
}

/** Grindoprit van de poort tot het voorplein van het HQ. */
function Driveway({ endZ }: { endZ: number }) {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, GATE_Z + 1.5),
      new THREE.Vector3(0.4, 0, 26),
      new THREE.Vector3(-2.2, 0, 14),
      new THREE.Vector3(-1.2, 0, 3),
      new THREE.Vector3(0, 0, endZ),
    ]);
    const N = 80;
    const w = 5.2;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let dist = 0;
    let prev = curve.getPoint(0);
    for (let i = 0; i <= N; i++) {
      const p = curve.getPoint(i / N);
      const t = curve.getTangent(i / N);
      dist += p.distanceTo(prev);
      prev = p;
      const nx = -t.z;
      const nz = t.x;
      pos.push(p.x + (nx * w) / 2, 0, p.z + (nz * w) / 2, p.x - (nx * w) / 2, 0, p.z - (nz * w) / 2);
      uv.push(0, dist / w, 1, dist / w);
      if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) g.index!.array.reverse();
    g.computeVertexNormals();
    return g;
  }, [endZ]);
  return (
    <group>
      <mesh geometry={geo} position-y={0.03} receiveShadow>
        <meshStandardMaterial map={gravelTex([1, 1])} bumpMap={gravelTex([1, 1])} bumpScale={3} roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {/* Voorplein met een rond grasperk en een boom in het midden. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.032, endZ - 1]} receiveShadow>
        <ringGeometry args={[3.2, 10.5, 64]} />
        <meshStandardMaterial map={gravelTex([4, 4])} bumpMap={gravelTex([4, 4])} bumpScale={3} roughness={1} />
      </mesh>
      <mesh position={[0, 0.12, endZ - 1]} receiveShadow>
        <cylinderGeometry args={[3.2, 3.3, 0.22, 48]} />
        <meshStandardMaterial color="#9a948a" roughness={0.9} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.235, endZ - 1]} receiveShadow>
        <circleGeometry args={[3.05, 48]} />
        <meshStandardMaterial map={grassTex([1, 1])} roughness={1} />
      </mesh>
      <RoundTree position={[0, 0.22, endZ - 1]} scale={0.55} seed={3} />
    </group>
  );
}

function Hedge({ from, to, h = 1.7, t = 1.1, kind = 'groen' }: { from: [number, number]; to: [number, number]; h?: number; t?: number; kind?: 'groen' | 'donker' | 'koper' }) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const ang = Math.atan2(-(to[1] - from[1]), to[0] - from[0]);
  return (
    <mesh position={[(from[0] + to[0]) / 2, h / 2, (from[1] + to[1]) / 2]} rotation-y={ang} castShadow receiveShadow>
      <boxGeometry args={[len, h, t]} />
      <meshStandardMaterial map={leafTex([len / 2.5, h / 2.5], kind)} bumpMap={leafTex([len / 2.5, h / 2.5], kind)} bumpScale={6} roughness={1} />
    </mesh>
  );
}

function WoodFence({ from, to }: { from: [number, number]; to: [number, number] }) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const ang = Math.atan2(-(to[1] - from[1]), to[0] - from[0]);
  const n = Math.floor(len / 0.18);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      m.makeTranslation((i / n - 0.5) * len, 0.6, 0);
      ref.current!.setMatrixAt(i, m);
    }
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [n, len]);
  return (
    <group position={[(from[0] + to[0]) / 2, 0, (from[1] + to[1]) / 2]} rotation-y={ang}>
      <instancedMesh ref={ref} args={[undefined, undefined, n]} castShadow>
        <boxGeometry args={[0.14, 1.2, 0.04]} />
        <meshStandardMaterial color="#8a7a66" roughness={1} />
      </instancedMesh>
    </group>
  );
}

/** Bladerkruin: een bol met golvende, bobbelige rand (ruis op de hoekpunten), zodat hij niet als een bal oogt. */
const crownCache = new Map<number, THREE.BufferGeometry>();
export function crownGeometry(seed: number, detail = 4) {
  const key = seed * 10 + detail;
  const hit = crownCache.get(key);
  if (hit) return hit;
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n =
      Math.sin(v.x * 5.1 + seed) * Math.sin(v.y * 4.3 + seed * 1.7) * Math.sin(v.z * 5.7 + seed * 0.6) * 0.16 +
      Math.sin(v.x * 13 + v.y * 11 + seed * 3) * 0.05 +
      Math.sin(v.z * 17 - v.x * 9) * 0.035;
    const flat = v.y < -0.3 ? 0.82 : 1; // onderkant iets afgeplat, zoals echte kruinen
    v.multiplyScalar((1 + n) * flat);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  crownCache.set(key, g);
  return g;
}

export function RoundTree({ position, scale = 1, seed = 1 }: { position: [number, number, number]; scale?: number; seed?: number }) {
  const blobs = useMemo(() => {
    const r = (k: number) => ((Math.sin(seed * 91.7 + k * 13.3) + 1) / 2);
    return Array.from({ length: 9 }, (_, k) => {
      const a = (k / 9) * Math.PI * 2 + r(k) * 0.6;
      const rad = k === 0 ? 0 : 1.1 + r(k + 5) * 0.9;
      return {
        p: [Math.cos(a) * rad, 4.4 + r(k + 7) * 2.2 + (k === 0 ? 0.9 : 0), Math.sin(a) * rad] as [number, number, number],
        s: k === 0 ? 2.3 : 1.15 + r(k + 11) * 0.7,
        kind: (k % 3 === 0 ? 'donker' : 'groen') as 'donker' | 'groen',
      };
    });
  }, [seed]);
  const bark = useMemo(() => new THREE.MeshStandardMaterial({ color: '#5a4a3c', roughness: 1 }), []);
  return (
    <group position={position} scale={scale}>
      <mesh position-y={1.9} castShadow material={bark}>
        <cylinderGeometry args={[0.16, 0.32, 3.8, 10]} />
      </mesh>
      {[0.7, -0.6].map((rz, i) => (
        <mesh key={i} position={[i ? -0.45 : 0.5, 3.6, 0]} rotation-z={rz} material={bark}>
          <cylinderGeometry args={[0.06, 0.12, 1.8, 6]} />
        </mesh>
      ))}
      {blobs.map((b, i) => (
        <mesh key={i} position={b.p} scale={b.s} geometry={crownGeometry(seed + i, 3)} castShadow={i < 3}>
          <meshStandardMaterial map={leafTex([2, 2], b.kind)} bumpMap={leafTex([2, 2], b.kind)} bumpScale={8} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Conifer({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position-y={1} castShadow>
        <cylinderGeometry args={[0.2, 0.3, 2, 8]} />
        <meshStandardMaterial color="#5a4636" />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position-y={3 + i * 2.2} castShadow>
          <coneGeometry args={[2.6 - i * 0.55, 4, 12]} />
          <meshStandardMaterial map={leafTex([1, 1], 'donker')} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/** Boomgaard: rijen laagstamfruitbomen. */
function Orchard({ x0, z0, cols, rows }: { x0: number; z0: number; cols: number; rows: number }) {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  const n = cols * rows;
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    let i = 0;
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++) {
        const jx = Math.sin(i * 12.9) * 0.4;
        p.set(x0 + c * 4.5 + jx, 0.8, z0 - r * 3.6);
        m.compose(p, q, s.set(1, 1, 1));
        trunks.current!.setMatrixAt(i, m);
        const k = 0.85 + ((Math.sin(i * 7.7) + 1) / 2) * 0.4;
        p.y = 2.3;
        m.compose(p, q, s.set(k * 1.3, k, k * 1.3));
        crowns.current!.setMatrixAt(i, m);
        i++;
      }
    trunks.current!.instanceMatrix.needsUpdate = true;
    crowns.current!.instanceMatrix.needsUpdate = true;
  }, [x0, z0, cols, rows]);
  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, n]}>
        <cylinderGeometry args={[0.1, 0.14, 1.6, 6]} />
        <meshStandardMaterial color="#6b5440" />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[crownGeometry(7, 2), undefined, n]} castShadow>
        <meshStandardMaterial map={leafTex([1, 1])} bumpMap={leafTex([1, 1])} bumpScale={6} roughness={0.95} />
      </instancedMesh>
    </group>
  );
}

/** Hoeve: bakstenen volume met puntgevel en rood pannendak. */
export function Farmhouse({
  position, rotation = 0, w, d, h, rise, windows = 4, tint = 'rood',
}: { position: [number, number, number]; rotation?: number; w: number; d: number; h: number; rise: number; windows?: number; tint?: 'rood' | 'wit' }) {
  const body = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-d / 2, 0);
    s.lineTo(d / 2, 0);
    s.lineTo(d / 2, h);
    s.lineTo(0, h + rise);
    s.lineTo(-d / 2, h);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2);
    g.rotateY(Math.PI / 2);
    return g;
  }, [w, d, h, rise]);
  const slope = Math.hypot(d / 2, rise) + 0.7;
  const ang = Math.atan2(rise, d / 2);
  const tex = useMemo(() => {
    const t = brickTex([0.45, 0.45], tint).clone();
    t.needsUpdate = true;
    return t;
  }, [tint]);
  return (
    <group position={position} rotation-y={rotation}>
      <mesh geometry={body} castShadow receiveShadow>
        <meshStandardMaterial map={tex} bumpMap={tex} bumpScale={-2} roughness={0.95} />
      </mesh>
      {[1, -1].map((s) => (
        <mesh key={s} position={[0, h + rise / 2 + 0.05, (s * d) / 4 + s * 0.12]} rotation-x={s * ang} castShadow receiveShadow>
          <boxGeometry args={[w + 0.7, 0.16, slope]} />
          <meshStandardMaterial map={roofTex([w / 2.2, slope / 1.6])} bumpMap={roofTex([w / 2.2, slope / 1.6])} bumpScale={4} roughness={0.8} color={tint === 'wit' ? '#555' : '#e8e2dc'} />
        </mesh>
      ))}
      <mesh position={[w * 0.28, h + rise * 0.55, -d * 0.12]} castShadow>
        <boxGeometry args={[0.6, 1.6, 0.6]} />
        <meshStandardMaterial map={tex} />
      </mesh>
      {[1, -1].map((side) =>
        Array.from({ length: windows }, (_, i) => (
          <group key={`${side}-${i}`} position={[(i / Math.max(1, windows - 1) - 0.5) * (w - 3), h * 0.55, side * (d / 2 + 0.02)]} rotation-y={side < 0 ? Math.PI : 0}>
            <mesh>
              <boxGeometry args={[1.15, 1.35, 0.06]} />
              <meshStandardMaterial color="#f1eee6" />
            </mesh>
            <mesh position-z={0.035}>
              <boxGeometry args={[0.95, 1.15, 0.02]} />
              <meshStandardMaterial color="#2b3a44" roughness={0.2} metalness={0.4} />
            </mesh>
          </group>
        )),
      )}
    </group>
  );
}

function Poles() {
  const xs = [-70, -38, -6, 26, 58, 90];
  const z = STREET_Z + 4.2;
  return (
    <group>
      {xs.map((x) => (
        <group key={x} position={[x, 0, z]}>
          <mesh position-y={4.5} castShadow>
            <cylinderGeometry args={[0.12, 0.17, 9, 8]} />
            <meshStandardMaterial color="#a6a39c" />
          </mesh>
          <mesh position-y={8.6}>
            <boxGeometry args={[0.08, 0.08, 1.4]} />
            <meshStandardMaterial color="#555" />
          </mesh>
        </group>
      ))}
      {xs.slice(1).map((x, i) =>
        [-0.6, 0.6].map((dz) => (
          <QuadraticBezierLine
            key={`${x}${dz}`}
            start={[xs[i], 8.6, z + dz]}
            end={[x, 8.6, z + dz]}
            mid={[(xs[i] + x) / 2, 7.6, z + dz]}
            color="#333"
            lineWidth={1}
          />
        )),
      )}
    </group>
  );
}

/** Zachte stapelwolk als sprite: kijkt altijd naar de camera, met vervagende randen. */
function Cloud({ position, scale = 1, variant = 0 }: { position: [number, number, number]; scale?: number; variant?: number }) {
  return (
    <sprite position={position} scale={[60 * scale, 30 * scale, 1]}>
      <spriteMaterial map={cloudTex(variant)} transparent depthWrite={false} fog={false} opacity={0.9} />
    </sprite>
  );
}

export function Lights() {
  const sun = useRef<THREE.DirectionalLight>(null);
  useLayoutEffect(() => {
    const s = sun.current!;
    s.target.position.set(0, 0, -6);
    s.target.updateMatrixWorld();
  }, []);
  return (
    <>
      <Sky sunPosition={[80, 30, 60]} turbidity={1.6} rayleigh={2.4} mieCoefficient={0.003} mieDirectionalG={0.82} distance={1000} />
      <fog attach="fog" args={['#b9d0e4', 170, 520]} />
      <hemisphereLight args={['#d6ecff', '#6f7f55', 0.35]} />
      <directionalLight
        ref={sun}
        position={[46, 52, 40]}
        intensity={2.6}
        color="#fff3e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-52}
        shadow-camera-right={52}
        shadow-camera-top={52}
        shadow-camera-bottom={-52}
        shadow-camera-near={10}
        shadow-camera-far={180}
      />
    </>
  );
}

export function Environment({ forecourtZ }: { forecourtZ: number }) {
  return (
    <group>
      <Ground />
      <Street />
      <Entrance />
      <Driveway endZ={forecourtZ} />

      {/* Rode beukenhaag aan de straatkant, groene hagen rond het gazon. */}
      <Hedge from={[-30, GATE_Z - 1.3]} to={[-9.4, GATE_Z - 1.3]} kind="koper" />
      <Hedge from={[9.4, GATE_Z - 1.3]} to={[30, GATE_Z - 1.3]} kind="koper" />
      <Hedge from={[30.5, GATE_Z - 1.8]} to={[30.5, -44]} h={1.9} />
      <Hedge from={[-30.5, -44]} to={[30.5, -44]} h={2.2} kind="donker" />
      <Hedge from={[-30.5, -44]} to={[-30.5, -8]} h={1.9} />
      <WoodFence from={[-30.5, -8]} to={[-30.5, GATE_Z - 2]} />
      <Hedge from={[-27, 16]} to={[-15, 16]} h={1.1} t={0.8} />

      {/* Bomen op en rond het perceel. */}
      <RoundTree position={[-24, 0, 26]} seed={1} />
      <RoundTree position={[-19, 0, -34]} seed={2} scale={1.2} />
      <RoundTree position={[27, 0, -40]} seed={4} scale={1.1} />
      <RoundTree position={[25, 0, 22]} seed={5} scale={0.9} />
      <RoundTree position={[-34, 0, 30]} seed={6} />
      <RoundTree position={[38, 0, 12]} seed={7} scale={1.3} />
      <Conifer position={[-26, 0, 4]} scale={1.1} />
      <Conifer position={[34, 0, -20]} />

      {/* Buren: hoeves met rode pannendaken. */}
      <Farmhouse position={[-44, 0, -2]} w={18} d={9} h={6.2} rise={4.6} windows={5} />
      <Farmhouse position={[-41, 0, -20]} rotation={Math.PI / 2} w={20} d={10} h={5.4} rise={5} windows={3} />
      <Farmhouse position={[40, 0, 34]} rotation={Math.PI / 2} w={13} d={8} h={4.8} rise={3.8} windows={3} />
      <Farmhouse position={[-24, 0, 62]} w={16} d={9} h={6} rise={4.5} windows={5} />
      <Farmhouse position={[20, 0, 64]} w={26} d={10} h={5.5} rise={5} windows={6} />
      <Farmhouse position={[46, 0, -34]} w={11} d={9} h={6} rise={3.2} windows={3} tint="wit" />

      <Orchard x0={-58} z0={-56} cols={26} rows={9} />
      <Orchard x0={-90} z0={30} cols={6} rows={8} />
      <Orchard x0={66} z0={20} cols={7} rows={10} />
      <Poles />

      <Cloud position={[-80, 90, -220]} scale={1.6} variant={0} />
      <Cloud position={[70, 110, -260]} scale={2.2} variant={1} />
      <Cloud position={[200, 80, -80]} scale={1.5} variant={2} />
      <Cloud position={[-210, 95, 40]} scale={1.9} variant={3} />
      <Cloud position={[30, 120, 220]} scale={1.6} variant={4} />
      <Cloud position={[-40, 130, -320]} scale={2.6} variant={5} />
    </group>
  );
}
