// De vormen van een realistischer mens, volledig in code: hoofd met gezicht, ledematen met spieren, handen met vingers,
// schoenen en haar uit honderden lokken. Geen downloads of gekochte modellen, en de kijkrichting is -z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const glad = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const bult = (x: number, y: number, sx: number, sy: number) => Math.exp(-(x * x) / (sx * sx) - (y * y) / (sy * sy));

/** Hoofd: één doorlopend oppervlak met kin, jukbeenderen, wenkbrauwboog, oogkassen, neus en lippen. */
export const hoofdGeo = (() => {
  const R = 0.105;
  const g = new THREE.SphereGeometry(1, 64, 52);
  const pos = g.attributes.position;
  const kleur = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i);
    const ny = pos.getY(i);
    const nz = pos.getZ(i);
    const voor = glad(-0.1, 0.5, -nz);
    const k = glad(-0.15, -1, ny);
    let x = nx * (1 - 0.25 * k ** 1.5) * 0.93;
    let z = nz * (1 - 0.14 * k);
    const y = ny * 1.17;
    // Achterhoofd iets voller, slapen iets smaller.
    if (nz > 0) z *= 1.05;
    x *= 1 - 0.05 * bult(0, ny - 0.3, 2, 0.4);
    const ax = Math.abs(nx);
    let voorKant = 0;
    voorKant += 0.05 * bult(nx, ny - 0.27, 0.62, 0.09); // wenkbrauwboog
    voorKant -= 0.075 * bult(ax - 0.36, ny - 0.13, 0.17, 0.09); // oogkassen
    voorKant += 0.05 * bult(ax - 0.52, ny + 0.17, 0.2, 0.17); // jukbeenderen
    voorKant += 0.15 * bult(nx, ny + 0.12, 0.1, 0.22) + 0.075 * bult(nx, ny + 0.26, 0.15, 0.06); // neus met punt
    voorKant += 0.03 * bult(nx, ny + 0.5, 0.27, 0.04) + 0.035 * bult(nx, ny + 0.585, 0.23, 0.045); // lippen
    voorKant -= 0.022 * bult(nx, ny + 0.545, 0.32, 0.012); // lijn tussen de lippen
    voorKant += 0.05 * bult(nx, ny + 0.84, 0.36, 0.15); // kin
    z -= voorKant * voor;
    pos.setXYZ(i, x * R, y * R, z * R);
    // Kleur boven op de huidskleur: blosje, lippen, schaduw in de oogkassen.
    const f = voor;
    const lip = Math.min(1, bult(nx, ny + 0.545, 0.27, 0.07) * 1.15) * f;
    const blos = 0.18 * bult(ax - 0.5, ny + 0.28, 0.24, 0.2) * f;
    const kas = 0.26 * bult(ax - 0.36, ny - 0.12, 0.18, 0.08) * f;
    const baard = 0.05 * glad(-0.45, -0.8, ny);
    kleur[i * 3] = 1 - kas * 0.75 + blos * 0.08 - lip * 0.08 - baard;
    kleur[i * 3 + 1] = 1 - kas - blos * 0.55 - lip * 0.3 - baard;
    kleur[i * 3 + 2] = 1 - kas - blos * 0.45 - lip * 0.24 - baard;
  }
  g.setAttribute('color', new THREE.BufferAttribute(kleur, 3));
  g.computeVertexNormals();
  return g;
})();

/** Ledemaat als draaiprofiel: [hoogte van 0 tot 1, straal]. Oorsprong bovenaan, zoals een gewricht. */
function ledemaat(len: number, profiel: [number, number][], plat = 1) {
  // Van onder naar boven: zo wijzen de vlakken naar buiten.
  const pts = profiel.map(([t, r]) => new THREE.Vector2(r, -t * len)).reverse();
  const g = new THREE.LatheGeometry(pts, 18);
  g.scale(1, 1, plat);
  g.computeVertexNormals();
  return g;
}
export const vormen = {
  dij: ledemaat(0.45, [[0, 0.0], [0.005, 0.07], [0.12, 0.083], [0.45, 0.075], [0.82, 0.056], [1, 0.051]]),
  kuit: ledemaat(0.44, [[0, 0.051], [0.08, 0.052], [0.28, 0.056], [0.6, 0.043], [0.92, 0.032], [1, 0.034]]),
  bovenarm: ledemaat(0.285, [[0, 0.0], [0.035, 0.03], [0.09, 0.044], [0.18, 0.052], [0.45, 0.048], [0.85, 0.038], [1, 0.036]]),
  onderarm: ledemaat(0.26, [[0, 0.036], [0.2, 0.042], [0.55, 0.035], [0.92, 0.026], [1, 0.026]], 0.86),
  mouwBoven: ledemaat(0.285, [[0, 0.0], [0.035, 0.032], [0.09, 0.047], [0.18, 0.055], [0.5, 0.052], [1, 0.044]]),
  mouwOnder: ledemaat(0.26, [[0, 0.044], [0.25, 0.046], [0.85, 0.038], [1, 0.037]]),
  broekDij: ledemaat(0.45, [[0, 0.0], [0.03, 0.06], [0.09, 0.085], [0.18, 0.09], [0.5, 0.08], [1, 0.064]]),
  broekKuit: ledemaat(0.42, [[0, 0.064], [0.3, 0.062], [0.85, 0.055], [1, 0.057]]),
};

function bol(rx: number, ry: number, rz: number, x: number, y: number, z: number) {
  const g = new THREE.SphereGeometry(1, 12, 9);
  g.scale(rx, ry, rz);
  g.translate(x, y, z);
  return g;
}

/** Hand met vier vingers en een duim. side: -1 = links, 1 = rechts. Oorsprong bij de pols. */
export function handGeo(side: number) {
  const delen: THREE.BufferGeometry[] = [bol(0.031, 0.043, 0.015, 0, -0.045, 0)];
  [-1.5, -0.5, 0.5, 1.5].forEach((n, i) => {
    const lang = [0.05, 0.058, 0.055, 0.044][i];
    const v = new THREE.CapsuleGeometry(0.0072, lang, 3, 7);
    v.rotateX(0.32);
    v.translate(n * 0.0148 * side, -0.083 - lang / 2, -0.012);
    delen.push(v);
  });
  const d = new THREE.CapsuleGeometry(0.0085, 0.038, 3, 7);
  d.rotateZ(side * 0.55);
  d.rotateX(0.3);
  d.translate(-side * 0.034, -0.056, -0.012);
  delen.push(d);
  return mergeGeometries(delen.map((x) => x.toNonIndexed()))!;
}
export const handen = { l: handGeo(-1), r: handGeo(1) };

/** Schoen: zool, neus en hiel; de punt wijst naar -z. Oorsprong in het midden. */
export const schoenBoven = (() => {
  const delen = [bol(0.05, 0.043, 0.085, 0, 0.012, -0.04), bol(0.046, 0.05, 0.065, 0, 0.016, 0.055)];
  return mergeGeometries(delen.map((x) => x.toNonIndexed()))!;
})();
export const schoenZool = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.045, 0.12);
  s.bezierCurveTo(-0.055, 0.03, -0.06, -0.1, 0, -0.145);
  s.bezierCurveTo(0.06, -0.1, 0.055, 0.03, 0.045, 0.12);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.024, bevelEnabled: false, curveSegments: 10 });
  g.rotateX(Math.PI / 2);
  g.translate(0, -0.016, 0);
  g.computeVertexNormals();
  return g;
})();

/** Romp met schouders, borst en taille. */
function romp(pts: [number, number][], plat: number) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 36);
  g.scale(1, 1, plat);
  g.computeVertexNormals();
  return g;
}
export const rompen = {
  bloot: romp([[0, 0], [0.142, 0], [0.147, 0.06], [0.134, 0.16], [0.148, 0.28], [0.172, 0.38], [0.182, 0.45], [0.16, 0.505], [0.085, 0.54], [0, 0.545]], 0.62),
  /** Ruimer: colbert of trui. */
  dik: romp([[0, -0.02], [0.152, -0.02], [0.155, 0.06], [0.145, 0.16], [0.155, 0.28], [0.172, 0.38], [0.18, 0.45], [0.158, 0.51], [0.085, 0.545], [0, 0.55]], 0.62),
  /** Onderkant van een colbert of hoodie, over de heupen. */
  rok: romp([[0.162, -0.13], [0.16, -0.05], [0.152, 0.03]], 0.65),
};
rompen.rok.computeVertexNormals();

/** Stofstructuur als reliëf: zo lijkt textiel op textiel en niet op plastic. */
export const stofReliëf = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const d = g.createImageData(128, 128);
  for (let i = 0; i < d.data.length; i += 4) {
    const px = (i / 4) % 128;
    const py = Math.floor(i / 4 / 128);
    const v = 120 + ((px + py) % 4 < 2 ? 34 : -20) + Math.random() * 42;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9, 9);
  return t;
})();

// --- Haar ---

export type HaarStijl = 'krul' | 'wild' | 'kort' | 'zij' | 'lang' | 'knot';
const lokGeo = new THREE.IcosahedronGeometry(1, 1);
export const haarVorm = lokGeo;

/** Honderden lokken op de schedel, volgens een kapsel. Geeft de transformaties en kleurvariatie terug. */
export function haarLokken(stijl: HaarStijl, seed: number) {
  let z = seed >>> 0 || 7;
  const rnd = () => ((z = (z * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const uit: { m: THREE.Matrix4; licht: number }[] = [];
  const pos = new THREE.Vector3();
  const schaal = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const omhoog = new THREE.Vector3(0, 1, 0);
  const n = new THREE.Vector3();
  const R = 0.105;
  const N = stijl === 'krul' ? 1000 : stijl === 'wild' ? 400 : stijl === 'lang' ? 420 : 340;
  for (let i = 0; i < N; i++) {
    // Gelijkmatig verdeeld over de bol (Fibonacci), met wat willekeur.
    const t = (i + 0.5) / N;
    const ny = 1 - 2 * t;
    const r = Math.sqrt(1 - ny * ny);
    const a = i * 2.39996 + rnd() * 0.2;
    const nx = Math.cos(a) * r;
    const nz = Math.sin(a) * r;
    const voor = -nz;
    // Haarlijn: hoog op het voorhoofd, lager aan de zijkant en in de nek.
    const lijn = voor > 0.3 ? 0.42 + (voor - 0.3) * 0.28 : voor > -0.2 ? 0.05 + voor * 0.25 : -0.34;
    if (ny < lijn - (stijl === 'krul' ? 0.0 : 0) && !(stijl === 'lang' && voor < 0.1)) continue;
    n.set(nx, ny, nz);
    let dik = 0.1;
    let grootte = 0.014;
    let lang = 1;
    if (stijl === 'krul') {
      // Fade aan de zijkant, veel volume en krullen bovenop.
      // Bovenaan vol, opzij en in de nek heel kort (fade).
      const boven = glad(0.28, 0.72, ny);
      dik = 0.103 + boven * (0.03 + rnd() * 0.03);
      grootte = 0.0048 + boven * (0.0065 + rnd() * 0.0065);
      lang = 1.2 + rnd() * 0.9;
    } else if (stijl === 'wild') {
      const boven = glad(0.0, 0.7, ny);
      dik = 0.108 + boven * 0.024 + rnd() * 0.016;
      grootte = 0.012 + rnd() * 0.009;
      lang = 1.5 + rnd() * 1.1;
    } else if (stijl === 'kort') {
      dik = 0.104 + rnd() * 0.004;
      grootte = 0.012;
      lang = 1.3;
    } else if (stijl === 'zij') {
      dik = 0.105 + glad(0, 0.8, ny) * 0.012 + rnd() * 0.005;
      grootte = 0.013;
      lang = 1.8;
    } else if (stijl === 'lang') {
      dik = 0.108 + rnd() * 0.007;
      grootte = 0.015;
      lang = ny < 0.1 ? 3 : 1.8;
    } else {
      dik = 0.104 + rnd() * 0.003;
      grootte = 0.012;
      lang = 2;
    }
    pos.set(nx * dik * 0.92, ny * dik * 1.17, nz * dik * 1.02 + 0.004);
    // Lokken liggen min of meer langs de schedel; krullen wijzen alle kanten op.
    const richting = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    if (stijl !== 'krul') richting.lerp(new THREE.Vector3(nz * (stijl === 'zij' ? -0.6 : 0.2), -Math.max(0.2, ny) * 0.5 - 0.1, 0.45 + nx * 0.1), stijl === 'wild' ? 0.5 : 0.85).normalize();
    q.setFromUnitVectors(omhoog, richting);
    schaal.set(grootte, grootte * lang, grootte);
    uit.push({ m: new THREE.Matrix4().compose(pos, q, schaal), licht: 0.55 + rnd() * 0.65 });
  }
  void R;
  if (stijl === 'lang') {
    // Lang haar valt tot op de schouders.
    for (let i = 0; i < 90; i++) {
      const a = Math.PI * (0.15 + rnd() * 0.7);
      const y = -0.02 - rnd() * 0.2;
      pos.set(Math.cos(a) * 0.095, y, Math.sin(a) * 0.082 + 0.01);
      q.identity();
      schaal.set(0.016, 0.05, 0.016);
      uit.push({ m: new THREE.Matrix4().compose(pos, q, schaal), licht: 0.72 + rnd() * 0.5 });
    }
  }
  if (stijl === 'knot') {
    for (let i = 0; i < 26; i++) {
      pos.set((rnd() - 0.5) * 0.05, 0.1 + (rnd() - 0.5) * 0.045, 0.085 + (rnd() - 0.5) * 0.05);
      q.identity();
      schaal.setScalar(0.012 + rnd() * 0.006);
      uit.push({ m: new THREE.Matrix4().compose(pos, q, schaal), licht: 0.72 + rnd() * 0.5 });
    }
  }
  return uit;
}

// --- Uiterlijk ---

export interface Uiterlijk {
  huid: string;
  haar: string;
  stijl: HaarStijl;
  ogen: string;
  top: 'colbert' | 'hoodie' | 'hemd' | 'trui';
  topKleur: string;
  hemd: string;
  broek: string;
  schoen: string;
  zool: string;
}

/** Ebert: koperkleurige krullen met fade, donker colbert en wit hemd. Martijn: donkerblonde warrige krullen, grijze hoodie en jeans. */
export const FOUNDERS: Record<string, Uiterlijk> = {
  ebert: { huid: '#efbf9f', haar: '#99532b', stijl: 'krul', ogen: '#3f2a1c', top: 'colbert', topKleur: '#1e1a17', hemd: '#f5f2ec', broek: '#1f2024', schoen: '#20160f', zool: '#15100c' },
  martijn: { huid: '#ecc1a6', haar: '#856338', stijl: 'wild', ogen: '#59626a', top: 'hoodie', topKleur: '#5c5f58', hemd: '#5c5f58', broek: '#4e6a88', schoen: '#d8d6d0', zool: '#f2f0ea' },
};
