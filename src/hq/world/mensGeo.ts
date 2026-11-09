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
    let x = nx * (1 - 0.2 * k ** 1.6) * 0.97;
    let z = nz * (1 - 0.14 * k);
    const y = ny * 1.17;
    // Achterhoofd iets voller, slapen iets smaller.
    if (nz > 0) z *= 1.05;
    x *= 1 - 0.05 * bult(0, ny - 0.3, 2, 0.4);
    const ax = Math.abs(nx);
    // Mond met licht opgetrokken hoeken: een vriendelijk gezicht.
    const my = ny + 0.53 - 0.42 * nx * nx;
    let voorKant = 0;
    voorKant += 0.022 * bult(nx, ny - 0.3, 0.62, 0.1); // wenkbrauwboog, heel zacht
    voorKant -= 0.02 * bult(ax - 0.38, ny - 0.08, 0.2, 0.1); // ondiepe oogkassen
    voorKant += 0.05 * bult(ax - 0.5, ny + 0.2, 0.26, 0.22); // ronde wangen
    voorKant += 0.11 * bult(nx, ny + 0.12, 0.075, 0.2) + 0.03 * bult(nx, ny - 0.02, 0.06, 0.16); // neusrug
        voorKant -= 0.012 * bult(nx, my, 0.36, 0.05); // mond iets dieper
    voorKant += 0.035 * bult(nx, ny + 0.86, 0.34, 0.14); // zachte kin
    z -= voorKant * voor;
    pos.setXYZ(i, x * R, y * R, z * R);
    // Kleur boven op de huidskleur: blosje en lippen, verder egaal.
    const f = voor;
    const lip = 0;
    void my;
    const blos = 0.3 * bult(ax - 0.52, ny + 0.24, 0.26, 0.2) * f;
    const kas = 0.1 * bult(ax - 0.38, ny - 0.14, 0.2, 0.08) * f + 0.12 * bult(ax - 0.1, ny + 0.2, 0.07, 0.16) * f;
    kleur[i * 3] = 1 - kas * 0.5 + blos * 0.05 - lip * 0.05;
    kleur[i * 3 + 1] = 1 - kas - blos * 0.5 - lip * 0.36;
    kleur[i * 3 + 2] = 1 - kas - blos * 0.42 - lip * 0.28;
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

/** Ontspannen hand: vingers bij elkaar en licht geplooid, duim tegen de wijsvinger. side: -1 = links, 1 = rechts. */
export function handGeo(side: number) {
  const delen: THREE.BufferGeometry[] = [bol(0.029, 0.041, 0.014, 0, -0.042, 0)];
  [-1.5, -0.5, 0.5, 1.5].forEach((n, i) => {
    const lang = [0.038, 0.046, 0.044, 0.034][i];
    const v = new THREE.CapsuleGeometry(0.0075, lang, 3, 7);
    v.rotateX(0.5);
    v.translate(n * 0.0128 * side, -0.074 - lang / 2, -0.016);
    delen.push(v);
  });
  const d = new THREE.CapsuleGeometry(0.0085, 0.026, 3, 7);
  d.rotateZ(side * 0.3);
  d.rotateX(0.4);
  d.translate(-side * 0.028, -0.052, -0.015);
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
  t.repeat.set(14, 14);
  return t;
})();

// --- Haar ---

export type HaarStijl = 'krul' | 'wild' | 'kort' | 'zij' | 'lang' | 'knot';
/** Eén gladde lok; tientallen ervan vormen samen een gebeeldhouwd kapsel. */
export const haarVorm = new THREE.SphereGeometry(1, 14, 10);

/** Het kapsel als grote, gladde lokken over een korte basis. Geeft de transformaties en een kleine kleurvariatie terug. */
export function haarLokken(stijl: HaarStijl, seed: number) {
  let z = seed >>> 0 || 7;
  const rnd = () => ((z = (z * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const uit: { m: THREE.Matrix4; licht: number }[] = [];
  const omhoog = new THREE.Vector3(0, 1, 0);
  const lok = (x: number, y: number, zz: number, r: number, lang: number, plat: number, richting: THREE.Vector3) => {
    uit.push({
      m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, zz), new THREE.Quaternion().setFromUnitVectors(omhoog, richting.clone().normalize()), new THREE.Vector3(r, r * lang, r * plat)),
      licht: 0.78 + rnd() * 0.42,
    });
  };
  const N = { krul: 620, wild: 300, kort: 90, zij: 90, lang: 110, knot: 80 }[stijl];
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const ny = 1 - 2 * t;
    const r = Math.sqrt(1 - ny * ny);
    const a = i * 2.39996 + rnd() * 0.25;
    const nx = Math.cos(a) * r;
    const nz = Math.sin(a) * r;
    const voor = -nz;
    const lijn = voor > 0.3 ? 0.4 + (voor - 0.3) * 0.3 : voor > -0.2 ? 0.1 + voor * 0.3 : -0.2;
    const px = (d: number) => nx * d * 0.95;
    const py = (d: number) => ny * d * 1.17;
    const pz = (d: number) => nz * d * 1.02;
    if (stijl === 'krul') {
      // Enkel bovenop: dichte, kleine krullen; de zijkanten zijn kort en dat doet de basis.
      if (ny < 0.26 + (voor > 0.3 ? 0.17 : 0)) continue;
      const d = 0.106 + rnd() * 0.017 + glad(0.3, 0.9, ny) * 0.012;
      lok(px(d), py(d), pz(d), 0.0095 + rnd() * 0.0065, 1.25 + rnd() * 0.75, 0.85, new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5));
    } else if (stijl === 'wild') {
      if (ny < lijn - 0.1) continue;
      const d = 0.108 + rnd() * 0.016 + glad(0, 0.8, ny) * 0.01;
      lok(px(d), py(d), pz(d), 0.0115 + rnd() * 0.006, 1.5 + rnd() * 1.0, 0.8, new THREE.Vector3(rnd() - 0.5, rnd() - 0.7, rnd() - 0.2));
    } else if (stijl === 'lang') {
      if (ny < lijn && voor > 0.1) continue;
      const d = 0.107 + rnd() * 0.006;
      lok(px(d), py(d), pz(d), 0.017, ny < 0.2 ? 3 : 2, 0.6, new THREE.Vector3(nx * 0.3, -1, 0.3 + nz * 0.3));
    } else {
      if (ny < lijn) continue;
      const d = 0.104 + rnd() * 0.004 + (stijl === 'zij' ? glad(0.2, 0.9, ny) * 0.012 : 0);
      // Lokken liggen plat langs de schedel; bij een zijscheiding allemaal naar dezelfde kant.
      const richting = stijl === 'zij' ? new THREE.Vector3(1, -0.15, nz * 0.4) : new THREE.Vector3(nx * 0.3, -0.35, 0.8);
      lok(px(d), py(d), pz(d), 0.021, 1.7, 0.42, richting);
    }
  }
  if (stijl === 'lang')
    for (let i = 0; i < 26; i++) {
      const a = Math.PI * (0.1 + rnd() * 0.8);
      lok(Math.cos(a) * 0.09, -0.06 - rnd() * 0.13, Math.sin(a) * 0.08 + 0.012, 0.018, 3.2, 0.6, new THREE.Vector3(0, -1, 0.1));
    }
  if (stijl === 'knot') lok(0, 0.1, 0.1, 0.043, 1, 0.95, omhoog);
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

/** Ebert: blonde krullen met korte zijkanten, donker colbert en wit hemd. Martijn: donkerblonde warrige krullen, grijze hoodie en jeans. */
export const FOUNDERS: Record<string, Uiterlijk> = {
  ebert: { huid: '#e6b392', haar: '#c9a064', stijl: 'krul', ogen: '#4a3a28', top: 'colbert', topKleur: '#1e1a17', hemd: '#f5f2ec', broek: '#1f2024', schoen: '#20160f', zool: '#15100c' },
  martijn: { huid: '#e4b497', haar: '#8c6c3c', stijl: 'wild', ogen: '#59626a', top: 'hoodie', topKleur: '#5c5f58', hemd: '#5c5f58', broek: '#4e6a88', schoen: '#d8d6d0', zool: '#f2f0ea' },
};
