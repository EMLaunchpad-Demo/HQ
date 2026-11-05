// De wereld rond het perceel: een landelijk dorp, nagebouwd naar luchtfoto's (hq-referentie/, nooit online).
// Een bakstenen kerk met leien spits en kerkhof, smalle dorpswegen zonder stoep met grasbermen en lantaarnpalen,
// huizen in rode en gele baksteen of wit, met pannen- en leien daken en zonnepanelen, gesloten huizenrijen in de kern,
// langgevelhoeves, loodsen en kassen aan de rand, en daarrond een lappendeken van weides, graan en omgeploegde akkers
// tot glooiende heuvels met een bosrand en verre dorpjes aan de horizon.
// Alles is instanced waar het kan: het hele dorp kost maar een handvol tekenopdrachten.
// Geen adres en geen plaatsnaam in deze code (zie HQ.md, Privacy).
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { brickTex, corrugatedTex, cropTex, grassTex, leafTex, plowedTex, roofTex, slateTex, wheatTex, asphaltTex } from '../textures';
import { RoundTree, STREET_Z, crownGeometry } from './Environment';

/** Vast zaadje: het dorp ziet er bij elke reload hetzelfde uit. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** Hoogte van het land: vlak tot ±230 m van het HQ, daarna glooiende heuvels. */
export function hillAt(x: number, z: number) {
  const d = Math.hypot(x, z);
  const t = smooth((d - 230) / 230);
  const n = Math.sin(x * 0.012 + 1.3) * Math.cos(z * 0.01 + 0.4) * 0.6 + Math.sin(x * 0.031 - z * 0.022) * 0.25 + 0.6;
  return t * (10 + n * 20);
}

// ─── Landschap ──────────────────────────────────────────────────────────────

function Landscape() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1700, 1700, 170, 170);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    // Verre velden: zachte vlekken in groen, goud en bruin, zodat de heuvels ook een lappendeken zijn.
    const tones = ['#6f8a47', '#7f9650', '#a89d63', '#8c9a55', '#8a7356', '#66803f'].map((h) => new THREE.Color(h));
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, hillAt(x, z) - 0.03);
      const cell = Math.floor((x + 2000) / 70) * 31 + Math.floor((z + 2000) / 55) * 17;
      // Dichtbij enkel groen (weides), de bonte velden pas verderop.
      c.copy(tones[Math.hypot(x, z) < 230 ? [0, 1, 5][Math.abs(cell) % 3] : Math.abs(cell) % tones.length]);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  );
}

type Field = [x: number, z: number, w: number, d: number, kind: 'akker' | 'graan' | 'gewas' | 'weide', rot?: number];
// Velden in de vlakte rond het dorp. Omgeploegde akker vlak over de straat, zoals op de foto's.
const FIELDS: Field[] = [
  [-120, 112, 150, 80, 'weide'],
  [0, 118, 74, 70, 'graan'],
  [118, 115, 150, 84, 'akker', 0.08],
  [150, 0, 100, 90, 'graan'],
  [160, -95, 90, 90, 'gewas'],
  [-165, -5, 110, 80, 'akker', -0.05],
  [-170, -110, 100, 90, 'weide'],
  [-90, -200, 110, 50, 'graan'],
  [40, -212, 130, 44, 'gewas', 0.04],
];

function Fields() {
  return (
    <group>
      {FIELDS.map(([x, z, w, d, kind, rot = 0], i) => {
        const rep: [number, number] = [w / 24, d / 24];
        const map = kind === 'akker' ? plowedTex(rep) : kind === 'graan' ? wheatTex(rep) : kind === 'gewas' ? cropTex(rep) : grassTex([w / 8, d / 8]);
        return (
          <mesh key={i} rotation={[-Math.PI / 2, 0, rot]} position={[x, -0.005, z]} receiveShadow>
            <planeGeometry args={[w, d]} />
            <meshStandardMaterial map={map} bumpMap={kind === 'akker' ? map : undefined} bumpScale={3} roughness={1} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Bosrand op de heuvels: honderden kruinen in één tekenopdracht. */
function Forest() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(() => {
    const r = rng(41);
    const out: [number, number, number, number][] = [];
    for (let i = 0; i < 6000 && out.length < 1400; i++) {
      const a = r() * Math.PI * 2;
      const d = 330 + r() * 170;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      // Bossen in banden: vooral achter het dorp (noorden) en langs de flanken.
      const band = Math.sin(a * 3 + 0.8) + Math.sin(a * 7 - 1.1) * 0.5 + (z < 0 ? 0.6 : -0.2);
      if (band < 0.35) continue;
      out.push([x, hillAt(x, z), z, 6 + r() * 4]);
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    spots.forEach(([x, y, z, k], i) => {
      m.compose(p.set(x, y + k * 0.45, z), q, s.set(k * 1.3, k * 0.9, k * 1.3));
      ref.current!.setMatrixAt(i, m);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [spots]);
  return (
    <instancedMesh ref={ref} args={[crownGeometry(11, 2), undefined, spots.length]}>
      <meshStandardMaterial map={leafTex([1, 1], 'donker')} roughness={1} />
    </instancedMesh>
  );
}

/** Populieren: hoge smalle bomen, in rijen langs de velden. */
function Poplars() {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(() => {
    const rows: [number, number, number, number, number][] = [
      // x0, z0, x1, z1, aantal
      [-225, -62, -115, -62, 14],
      [95, -48, 200, -48, 13],
      [-60, 160, 60, 160, 15],
      [205, 40, 205, 150, 12],
    ];
    const out: [number, number][] = [];
    for (const [x0, z0, x1, z1, n] of rows) for (let i = 0; i < n; i++) out.push([x0 + ((x1 - x0) * i) / (n - 1), z0 + ((z1 - z0) * i) / (n - 1)]);
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    spots.forEach(([x, z], i) => {
      const k = 0.9 + ((Math.sin(i * 5.3) + 1) / 2) * 0.3;
      m.compose(p.set(x, 2, z), q, s.set(1, 1, 1));
      trunks.current!.setMatrixAt(i, m);
      m.compose(p.set(x, 10 * k, z), q, s.set(1.5, 7.5 * k, 1.5));
      crowns.current!.setMatrixAt(i, m);
    });
    trunks.current!.instanceMatrix.needsUpdate = true;
    crowns.current!.instanceMatrix.needsUpdate = true;
  }, [spots]);
  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, spots.length]}>
        <cylinderGeometry args={[0.15, 0.25, 4, 6]} />
        <meshStandardMaterial color="#6b6258" />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[crownGeometry(5, 2), undefined, spots.length]} castShadow>
        <meshStandardMaterial map={leafTex([1, 2])} roughness={1} />
      </instancedMesh>
    </group>
  );
}

// ─── Wegen ──────────────────────────────────────────────────────────────────

type P = [number, number];
/** De dorpsweg: van de straat voor het HQ met bochten naar de kern en de kerk, en twee zijstraten. */
const ROADS: { pts: P[]; w: number }[] = [
  { pts: [[-60, STREET_Z], [-61, 10], [-62, -40], [-55, -90], [-38, -125], [-12, -146], [25, -158], [70, -165], [130, -170], [200, -168]], w: 5.4 },
  { pts: [[-12, -146], [-22, -190], [-38, -240], [-60, -290]], w: 4.6 },
  { pts: [[25, -158], [38, -128], [52, -104]], w: 4.2 },
];

function sampleRoad(pts: P[], step: number) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const n = Math.max(2, Math.round(curve.getLength() / step));
  return Array.from({ length: n + 1 }, (_, i) => ({ p: curve.getPointAt(i / n), t: curve.getTangentAt(i / n) }));
}

function ribbon(pts: P[], w: number, y = 0) {
  const s = sampleRoad(pts, 2);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let dist = 0;
  s.forEach(({ p, t }, i) => {
    if (i) dist += p.distanceTo(s[i - 1].p);
    const nx = -t.z;
    const nz = t.x;
    pos.push(p.x + (nx * w) / 2, y, p.z + (nz * w) / 2, p.x - (nx * w) / 2, y, p.z - (nz * w) / 2);
    uv.push(0, dist / w, 1, dist / w);
    if (i < s.length - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function Roads() {
  const geos = useMemo(() => ROADS.map((r) => ({ road: ribbon(r.pts, r.w, 0.03), verge: ribbon(r.pts, r.w + 3.2, 0.012) })), []);
  return (
    <group>
      {geos.map((g, i) => (
        <group key={i}>
          <mesh geometry={g.verge} receiveShadow>
            <meshStandardMaterial map={grassTex([1, 12])} roughness={1} side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={g.road} receiveShadow>
            <meshStandardMaterial map={asphaltTex([1, 1])} bumpMap={asphaltTex([1, 1])} bumpScale={1} roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Lantaarnpalen langs de dorpsweg: betonnen paal met een korte arm en een armatuur. */
function VillageLamps() {
  const poles = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(() => {
    const out: { x: number; z: number; hx: number; hz: number; a: number }[] = [];
    ROADS.forEach((r, ri) =>
      sampleRoad(r.pts, 34).forEach(({ p, t }, i) => {
        if (ri === 0 && p.z > -92) return; // langs het perceel staan al palen
        const side = i % 2 ? 1 : -1;
        const off = r.w / 2 + 1.4;
        const x = p.x - t.z * off * side;
        const z = p.z + t.x * off * side;
        // Armatuur hangt naar de weg toe.
        const tx = t.z * side;
        const tz = -t.x * side;
        out.push({ x, z, hx: x + tx * 0.9, hz: z + tz * 0.9, a: Math.atan2(tx, tz) });
      }),
    );
    return out;
  }, []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    spots.forEach(({ x, z, hx, hz, a }, i) => {
      o.position.set(x, 3.6, z);
      o.rotation.set(0, a, 0);
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      poles.current!.setMatrixAt(i, o.matrix);
      o.position.set(hx, 7.1, hz);
      o.updateMatrix();
      heads.current!.setMatrixAt(i, o.matrix);
    });
    poles.current!.instanceMatrix.needsUpdate = true;
    heads.current!.instanceMatrix.needsUpdate = true;
  }, [spots]);
  return (
    <group>
      <instancedMesh ref={poles} args={[undefined, undefined, spots.length]} castShadow>
        <cylinderGeometry args={[0.09, 0.14, 7.2, 6]} />
        <meshStandardMaterial color="#a7a49d" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, spots.length]}>
        <boxGeometry args={[0.32, 0.14, 1.1]} />
        <meshStandardMaterial color="#5c6066" roughness={0.6} />
      </instancedMesh>
    </group>
  );
}

// ─── Huizen ─────────────────────────────────────────────────────────────────

type House = {
  x: number; y: number; z: number; a: number;
  w: number; d: number; h: number; rise: number;
  wall: string; slate: boolean; solar: boolean; windows: boolean;
};

const WALLS = ['#a9573d', '#9c4e36', '#b5664a', '#8f4732', '#c9a477', '#a9573d', '#e8e4dc', '#b46a4c'];

// Stukken waar geen dorpshuizen mogen komen: het perceel, de buren en boomgaarden ernaast, de kerk.
const KEEP_OUT: [number, number, number, number][] = [
  [-56, 56, -95, 76],
  [-95, -64, 0, 35],
  [62, 100, -24, 28],
  [-34, 30, -205, -150],
];
const free = (x: number, z: number, pad = 0) => !KEEP_OUT.some(([x0, x1, z0, z1]) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad);

/** Kern rond de kerk: gesloten huizenrijen, dichter op de weg. */
const inCore = (x: number, z: number) => Math.hypot(x + 2, z + 160) < 70;

function buildHouses(): House[] {
  const r = rng(7);
  const out: House[] = [];
  const add = (x: number, z: number, a: number, w: number, core: boolean, y = 0) => {
    const tall = core && r() < 0.6;
    out.push({
      x, y, z, a, w,
      d: 7.5 + r() * 2.5,
      h: tall ? 6.6 + r() * 1.4 : 5 + r() * 1.5,
      rise: 3.2 + r() * 1.6,
      wall: WALLS[Math.floor(r() * WALLS.length)],
      slate: r() < (core ? 0.35 : 0.45),
      solar: r() < 0.35,
      windows: true,
    });
  };

  // Langs de dorpswegen, aan beide kanten.
  ROADS.forEach((road) => {
    for (const side of [1, -1]) {
      const pts = sampleRoad(road.pts, 1);
      let i = Math.floor(r() * 10);
      while (i < pts.length) {
        const { p, t } = pts[i];
        const core = inCore(p.x, p.z);
        const w = core ? 9 + r() * 3 : 9 + r() * 5;
        const setback = core ? road.w / 2 + 1.5 : road.w / 2 + 7 + r() * 5;
        const x = p.x - t.z * side * (setback + 4.5);
        const z = p.z + t.x * side * (setback + 4.5);
        if (free(x, z, 6) && (core || r() > 0.25)) add(x, z, Math.atan2(-t.z, t.x), w, core);
        i += Math.round(core ? w + 0.2 : w + 6 + r() * 14);
      }
    }
  });

  // Langs de straat voor het HQ: een paar woningen verderop, links en rechts.
  for (const x of [-190, -170, -150, -128, 118, 140, 163, 186]) {
    for (const side of [1, -1]) {
      if (r() < 0.3) continue;
      add(x + (r() - 0.5) * 4, STREET_Z + side * (12 + r() * 4), 0, 9 + r() * 4, false);
    }
  }

  // Verre dorpjes op de heuvels (elk met een kerktoren, zie Spires).
  for (const [cx, cz] of SPIRES) {
    for (let k = 0; k < 16; k++) {
      const a = r() * Math.PI * 2;
      const d = 8 + r() * 34;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      add(x, z, r() * Math.PI, 8 + r() * 4, false, hillAt(x, z));
    }
  }
  return out;
}

/** Dak: twee hellende vlakken met overstek, eenheidsmaat (breedte 1, nok op hoogte 1, diepte 1). */
function roofGeometry() {
  const g = new THREE.BufferGeometry();
  // Voorvlak (z+) en achtervlak (z-), elk 4 hoeken: [x, y, z]
  const v = [
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
    0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,
  ];
  const uv = [0, 0, 6, 0, 6, 3, 0, 3, 0, 0, 6, 0, 6, 3, 0, 3];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  g.computeVertexNormals();
  return g;
}

/** Puntgevel (driehoek), eenheidsmaat, zodat muur en dak sluiten. */
function gableGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0);
  s.lineTo(0.5, 0);
  s.lineTo(0, 1);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateY(Math.PI / 2);
  return g;
}

function Houses() {
  const houses = useMemo(buildHouses, []);
  const counts = useMemo(() => {
    let win = 0;
    let solar = 0;
    for (const h of houses) {
      win += Math.max(2, Math.floor(h.w / 3)) * 2 * (h.h > 6.3 ? 2 : 1);
      if (h.solar) solar += 1;
    }
    return { win, solar, slate: houses.filter((h) => h.slate).length, tile: houses.filter((h) => !h.slate).length };
  }, [houses]);
  const walls = useRef<THREE.InstancedMesh>(null);
  const gables = useRef<THREE.InstancedMesh>(null);
  const tiles = useRef<THREE.InstancedMesh>(null);
  const slates = useRef<THREE.InstancedMesh>(null);
  const wins = useRef<THREE.InstancedMesh>(null);
  const chims = useRef<THREE.InstancedMesh>(null);
  const panels = useRef<THREE.InstancedMesh>(null);
  const roofGeo = useMemo(roofGeometry, []);
  const gableGeo = useMemo(gableGeometry, []);

  useLayoutEffect(() => {
    const parent = new THREE.Object3D();
    const child = new THREE.Object3D();
    parent.add(child);
    const col = new THREE.Color();
    let wi = 0;
    let si = 0;
    let ti = 0;
    let li = 0;
    const put = (mesh: THREE.InstancedMesh, i: number, pos: [number, number, number], scale: [number, number, number], rx = 0) => {
      child.position.set(...pos);
      child.scale.set(...scale);
      child.rotation.set(rx, 0, 0);
      child.updateMatrixWorld(true);
      mesh.setMatrixAt(i, child.matrixWorld);
    };
    houses.forEach((h, i) => {
      parent.position.set(h.x, h.y, h.z);
      parent.rotation.set(0, h.a, 0);
      parent.updateMatrixWorld(true);
      col.set(h.wall);
      put(walls.current!, i, [0, h.h / 2, 0], [h.w, h.h, h.d]);
      walls.current!.setColorAt(i, col);
      put(gables.current!, i, [0, h.h, 0], [h.w, h.rise, h.d]);
      gables.current!.setColorAt(i, col);
      if (h.slate) put(slates.current!, si++, [0, h.h - 0.15, 0], [h.w + 0.6, h.rise + 0.3, h.d + 1.1]);
      else put(tiles.current!, ti++, [0, h.h - 0.15, 0], [h.w + 0.6, h.rise + 0.3, h.d + 1.1]);
      put(chims.current!, i, [h.w * 0.3, h.h + h.rise * 0.55, -h.d * 0.15], [0.6, 1.8, 0.6]);
      // Ramen op voor- en achtergevel, een of twee rijen.
      const n = Math.max(2, Math.floor(h.w / 3));
      const floors = h.h > 6.3 ? 2 : 1;
      for (const side of [1, -1])
        for (let f = 0; f < floors; f++)
          for (let k = 0; k < n; k++)
            put(wins.current!, wi++, [(k / (n - 1) - 0.5) * (h.w - 2.6), floors === 2 ? 1.6 + f * 2.8 : h.h * 0.5, side * (h.d / 2 + 0.03)], [1.05, 1.3, 0.08]);
      if (h.solar) {
        const slope = Math.atan2(h.rise, h.d / 2);
        put(panels.current!, li++, [0, h.h + h.rise * 0.5 + 0.08, h.d * 0.25], [h.w * 0.6, 0.06, Math.hypot(h.d / 2, h.rise) * 0.55], slope);
      }
    });
    for (const m of [walls, gables, tiles, slates, wins, chims, panels]) {
      m.current!.instanceMatrix.needsUpdate = true;
      if (m.current!.instanceColor) m.current!.instanceColor.needsUpdate = true;
    }
  }, [houses]);

  const brick = useMemo(() => {
    const t = brickTex([2.5, 2], 'wit').clone();
    t.needsUpdate = true;
    return t;
  }, []);
  return (
    <group>
      <instancedMesh ref={walls} args={[undefined, undefined, houses.length]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial map={brick} roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={gables} args={[gableGeo, undefined, houses.length]} castShadow>
        <meshStandardMaterial map={brick} roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={tiles} args={[roofGeo, undefined, counts.tile]} castShadow>
        <meshStandardMaterial map={roofTex([1, 1])} roughness={0.8} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={slates} args={[roofGeo, undefined, counts.slate]} castShadow>
        <meshStandardMaterial map={slateTex([1, 1])} roughness={0.7} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={chims} args={[undefined, undefined, houses.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#8f4a35" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={wins} args={[undefined, undefined, counts.win]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#2b3a44" roughness={0.25} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={panels} args={[undefined, undefined, Math.max(1, counts.solar)]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#1d2a44" roughness={0.3} metalness={0.5} />
      </instancedMesh>
    </group>
  );
}

// ─── Kerk ───────────────────────────────────────────────────────────────────

/** Dorpskerk: bakstenen schip met hoge boogramen, toren met leien spits en kruis, kerkhof met een laag muurtje. */
function Church({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const L = 26;
  const W = 12;
  const H = 10;
  const RISE = 6;
  const brick = useMemo(() => {
    const t = brickTex([5, 2.5], 'rood').clone();
    t.needsUpdate = true;
    return t;
  }, []);
  const roofGeo = useMemo(roofGeometry, []);
  const gableGeo = useMemo(gableGeometry, []);
  const stones = useRef<THREE.InstancedMesh>(null);
  const graves = 70;
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    for (let i = 0; i < graves; i++) {
      const row = Math.floor(i / 10);
      const col = i % 10;
      p.set(-L / 2 - 3 + col * 2.6 + (row % 2) * 0.6, 0.45, -W / 2 - 5 - row * 2.4);
      m.compose(p, q, s);
      stones.current!.setMatrixAt(i, m);
    }
    stones.current!.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group position={position} rotation-y={rotation}>
      {/* Schip */}
      <mesh position-y={H / 2} castShadow receiveShadow>
        <boxGeometry args={[L, H, W]} />
        <meshStandardMaterial map={brick} roughness={0.95} />
      </mesh>
      <mesh geometry={gableGeo} position-y={H} scale={[L, RISE, W]} castShadow>
        <meshStandardMaterial map={brick} roughness={0.95} />
      </mesh>
      <mesh geometry={roofGeo} position-y={H - 0.2} scale={[L + 0.8, RISE + 0.4, W + 1.4]} castShadow>
        <meshStandardMaterial map={slateTex([2, 1])} roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
      {/* Hoge boogramen aan beide langse gevels */}
      {[1, -1].map((side) =>
        Array.from({ length: 6 }, (_, i) => (
          <group key={`${side}${i}`} position={[-L / 2 + 3.4 + i * 3.6, 4.6, side * (W / 2 + 0.03)]} rotation-y={side < 0 ? Math.PI : 0}>
            <mesh>
              <boxGeometry args={[1.4, 4.4, 0.06]} />
              <meshStandardMaterial color="#2b3440" roughness={0.3} metalness={0.3} />
            </mesh>
            <mesh position-y={2.2}>
              <circleGeometry args={[0.7, 16, 0, Math.PI]} />
              <meshStandardMaterial color="#2b3440" roughness={0.3} metalness={0.3} />
            </mesh>
            <mesh position={[0, -2.35, 0.05]}>
              <boxGeometry args={[1.7, 0.18, 0.18]} />
              <meshStandardMaterial color="#c9c2b4" />
            </mesh>
          </group>
        )),
      )}
      {/* Toren met spits, aan de westkant */}
      <group position-x={-L / 2 - 3}>
        <mesh position-y={9} castShadow receiveShadow>
          <boxGeometry args={[6.2, 18, 6.2]} />
          <meshStandardMaterial map={brick} roughness={0.95} />
        </mesh>
        <mesh position-y={18.15}>
          <boxGeometry args={[6.6, 0.3, 6.6]} />
          <meshStandardMaterial color="#c9c2b4" />
        </mesh>
        <mesh position-y={25.3} rotation-y={Math.PI / 4} castShadow>
          <coneGeometry args={[4.6, 14, 4]} />
          <meshStandardMaterial map={slateTex([2, 3])} roughness={0.7} />
        </mesh>
        <mesh position-y={33.2}>
          <boxGeometry args={[0.14, 2, 0.14]} />
          <meshStandardMaterial color="#3a3a3a" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position-y={33.6}>
          <boxGeometry args={[1, 0.14, 0.14]} />
          <meshStandardMaterial color="#3a3a3a" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Klokgaten */}
        {[0, 1, 2, 3].map((k) => (
          <mesh key={k} position={[Math.sin((k * Math.PI) / 2) * 3.13, 15.5, Math.cos((k * Math.PI) / 2) * 3.13]} rotation-y={(k * Math.PI) / 2}>
            <boxGeometry args={[1.2, 2.2, 0.05]} />
            <meshStandardMaterial color="#1e2328" />
          </mesh>
        ))}
        {/* Portaal */}
        <mesh position={[-3.13, 2.2, 0]} rotation-y={-Math.PI / 2}>
          <boxGeometry args={[2, 4.4, 0.08]} />
          <meshStandardMaterial color="#4a3326" roughness={0.8} />
        </mesh>
      </group>
      {/* Kerkhof met laag bakstenen muurtje en grafstenen */}
      <instancedMesh ref={stones} args={[undefined, undefined, graves]} castShadow>
        <boxGeometry args={[0.8, 0.9, 0.18]} />
        <meshStandardMaterial color="#9b9a96" roughness={0.9} />
      </instancedMesh>
      {(
        [
          [[-L / 2 - 6, -W / 2 - 2], [L / 2 + 4, -W / 2 - 2]],
          [[-L / 2 - 6, -W / 2 - 22], [L / 2 + 4, -W / 2 - 22]],
          [[-L / 2 - 6, -W / 2 - 2], [-L / 2 - 6, -W / 2 - 22]],
          [[L / 2 + 4, -W / 2 - 2], [L / 2 + 4, -W / 2 - 22]],
        ] as [P, P][]
      ).map(([a, b], i) => {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return (
          <mesh key={i} position={[(a[0] + b[0]) / 2, 0.5, (a[1] + b[1]) / 2]} rotation-y={Math.atan2(-(b[1] - a[1]), b[0] - a[0])} castShadow>
            <boxGeometry args={[len, 1, 0.4]} />
            <meshStandardMaterial map={brick} roughness={0.95} />
          </mesh>
        );
      })}
      {/* Grote lindes naast de kerk */}
      <RoundTree position={[L / 2 + 9, 0, 4]} seed={21} scale={1.6} />
      <RoundTree position={[L / 2 + 14, 0, -6]} seed={22} scale={1.5} />
      <RoundTree position={[L / 2 + 8, 0, -16]} seed={23} scale={1.7} />
    </group>
  );
}

/** Verre dorpjes: kerktorens op de heuvels aan de horizon. */
const SPIRES: P[] = [
  [270, -330],
  [-320, -250],
  [-160, 390],
  [360, 160],
];
function Spires() {
  return (
    <group>
      {SPIRES.map(([x, z], i) => {
        const y = hillAt(x, z);
        return (
          <group key={i} position={[x, y, z]}>
            <mesh position-y={8}>
              <boxGeometry args={[5, 16, 5]} />
              <meshStandardMaterial color="#9c5a42" roughness={1} />
            </mesh>
            <mesh position-y={22} rotation-y={Math.PI / 4}>
              <coneGeometry args={[3.8, 12, 4]} />
              <meshStandardMaterial color="#454a50" roughness={0.8} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ─── Rand van het dorp: loodsen en kassen ───────────────────────────────────

function Shed({ position, rotation = 0, w, d, h }: { position: [number, number, number]; rotation?: number; w: number; d: number; h: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position-y={h / 2} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#c3c5c2" roughness={0.85} />
      </mesh>
      <mesh position-y={h + 0.05} castShadow>
        <boxGeometry args={[w + 0.6, 0.12, d + 0.6]} />
        <meshStandardMaterial map={corrugatedTex([w / 2, d / 4])} color="#9a8f86" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0, h + 0.14, 0]}>
        <boxGeometry args={[w * 0.7, 0.06, d * 0.6]} />
        <meshStandardMaterial color="#1d2a44" roughness={0.3} metalness={0.5} />
      </mesh>
    </group>
  );
}

function Greenhouse({ position, rotation = 0, w, d }: { position: [number, number, number]; rotation?: number; w: number; d: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position-y={1.6} rotation-z={Math.PI / 2} scale={[1, 1, 1]}>
        <cylinderGeometry args={[2.4, 2.4, w, 16, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#eef3f2" transparent opacity={0.75} roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      {d > 6 && (
        <mesh position={[0, 1.6, 5]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[2.4, 2.4, w, 16, 1, false, 0, Math.PI]} />
          <meshStandardMaterial color="#eef3f2" transparent opacity={0.75} roughness={0.3} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

export function Village() {
  return (
    <group>
      <Landscape />
      <Fields />
      <Roads />
      <VillageLamps />
      <Houses />
      <Church position={[-2, 0, -174]} rotation={0.12} />
      <Spires />
      <Forest />
      <Poplars />
      {/* Loodsen met zonnepanelen en kassen aan de rand van het dorp. */}
      <Shed position={[-96, 0, -120]} rotation={0.3} w={30} d={14} h={6} />
      <Shed position={[-110, 0, -98]} rotation={0.3} w={22} d={11} h={5} />
      <Shed position={[95, 0, -140]} rotation={-0.05} w={26} d={16} h={7} />
      <Greenhouse position={[-92, 0, -150]} rotation={0.3} w={34} d={10} />
      <Greenhouse position={[110, 0, -112]} w={28} d={4} />
    </group>
  );
}
