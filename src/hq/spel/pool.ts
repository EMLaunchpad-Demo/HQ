// Pool (8-ball) in het HQ: fysica en regels, zonder 3D en zonder netwerk (getest in scripts/hq-spel-test.ts).
// Coördinaten in meter op het laken: midden = 0, x langs de tafel, z in de breedte.
// Tegen elkaar: wie stoot, stuurt richting en kracht. Beide toestellen rekenen de stoot na, en de stoter stuurt daarna
// de eindstand, zodat een klein rekenverschil tussen twee pc's nooit kan blijven hangen.

export type Speler = 0 | 1;
export type Groep = 'vol' | 'half';
export const TAFEL = { HX: 1.2, HZ: 0.6, R: 0.0285, MAX: 4.6, DT: 1 / 240 };
const WRIJVING = 0.75;
const POCKETS: [number, number, number][] = [
  [-TAFEL.HX, -TAFEL.HZ, 0.075],
  [TAFEL.HX, -TAFEL.HZ, 0.075],
  [-TAFEL.HX, TAFEL.HZ, 0.075],
  [TAFEL.HX, TAFEL.HZ, 0.075],
  [0, -TAFEL.HZ - 0.012, 0.065],
  [0, TAFEL.HZ + 0.012, 0.065],
];

export interface PoolBal {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  weg: boolean;
}
export interface PoolStand {
  ballen: PoolBal[];
  beurt: Speler;
  groep: [Groep | null, Groep | null];
  winnaar: Speler | null;
  melding: string;
}

export const groepVan = (id: number): Groep | null => (id >= 1 && id <= 7 ? 'vol' : id >= 9 ? 'half' : null);
const CUE_X = -TAFEL.HX / 2;

export function nieuweStand(): PoolStand {
  const d = TAFEL.R * 2.02;
  const volgorde = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  const ballen: PoolBal[] = [{ id: 0, x: CUE_X, z: 0, vx: 0, vz: 0, weg: false }];
  let i = 0;
  for (let rij = 0; rij < 5; rij++)
    for (let k = 0; k <= rij; k++) ballen.push({ id: volgorde[i++], x: TAFEL.HX / 2 + rij * d * 0.866, z: (k - rij / 2) * d, vx: 0, vz: 0, weg: false });
  return { ballen, beurt: 0, groep: [null, null], winnaar: null, melding: 'Stoot af' };
}

export const kopie = (s: PoolStand): PoolStand => ({ ...s, groep: [s.groep[0], s.groep[1]], ballen: s.ballen.map((b) => ({ ...b })) });

export interface Schot {
  gepot: number[];
  eersteRaak: number | null;
}
export const nieuwSchot = (): Schot => ({ gepot: [], eersteRaak: null });

/** Stoot op de witte bal. */
export function stoot(s: PoolStand, hoek: number, kracht: number) {
  const w = s.ballen[0];
  const v = Math.max(0.05, Math.min(1, kracht)) * TAFEL.MAX;
  w.vx = Math.cos(hoek) * v;
  w.vz = Math.sin(hoek) * v;
}

/** Eén vaste tijdstap. Zo komen twee toestellen op (bijna) dezelfde uitkomst. */
export function stapPool(s: PoolStand, sc: Schot, dt = TAFEL.DT) {
  const { R, HX, HZ } = TAFEL;
  const bs = s.ballen;
  for (const b of bs) {
    if (b.weg) continue;
    const v = Math.hypot(b.vx, b.vz);
    if (v > 0) {
      const nv = Math.max(0, v - WRIJVING * dt);
      b.vx *= nv / v;
      b.vz *= nv / v;
      if (nv < 0.012) b.vx = b.vz = 0;
    }
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    let inPocket = false;
    for (const [px, pz, pr] of POCKETS) {
      const d = Math.hypot(b.x - px, b.z - pz);
      if (d < pr * 0.82) {
        b.weg = true;
        b.vx = b.vz = 0;
        sc.gepot.push(b.id);
        inPocket = true;
        break;
      }
      if (d < pr * 1.55) inPocket = true; // bij de opening geen band
    }
    if (b.weg || inPocket) continue;
    if (b.x < -HX + R) (b.x = -HX + R), (b.vx = -b.vx * 0.82);
    else if (b.x > HX - R) (b.x = HX - R), (b.vx = -b.vx * 0.82);
    if (b.z < -HZ + R) (b.z = -HZ + R), (b.vz = -b.vz * 0.82);
    else if (b.z > HZ - R) (b.z = HZ - R), (b.vz = -b.vz * 0.82);
  }
  for (let i = 0; i < bs.length; i++) {
    const a = bs[i];
    if (a.weg) continue;
    for (let j = i + 1; j < bs.length; j++) {
      const b = bs[j];
      if (b.weg) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= 4 * R * R || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      const overlap = 2 * R - d;
      a.x -= (nx * overlap) / 2;
      a.z -= (nz * overlap) / 2;
      b.x += (nx * overlap) / 2;
      b.z += (nz * overlap) / 2;
      const rv = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (rv <= 0) continue;
      const imp = (rv * (1 + 0.95)) / 2;
      a.vx -= imp * nx;
      a.vz -= imp * nz;
      b.vx += imp * nx;
      b.vz += imp * nz;
      if (sc.eersteRaak === null && (a.id === 0 || b.id === 0)) sc.eersteRaak = a.id === 0 ? b.id : a.id;
    }
  }
}

export const stilt = (s: PoolStand) => s.ballen.every((b) => b.weg || (b.vx === 0 && b.vz === 0));

/** Regels na de stoot: wie is aan de beurt, wie heeft welke groep, wie wint. */
export function naSchot(s: PoolStand, sc: Schot, namen: [string, string]) {
  const ik = s.beurt;
  const ander: Speler = ik === 0 ? 1 : 0;
  const wit = sc.gepot.includes(0);
  const acht = sc.gepot.includes(8);
  const mijn = s.groep[ik];
  const bleef = (g: Groep | null) => (g ? s.ballen.filter((b) => !b.weg && groepVan(b.id) === g).length : 7);
  // Een zwarte bal is enkel goed als je eigen groep vóór deze stoot al leeg was.
  const klaarVoorAcht = !!mijn && bleef(mijn) === 0 && !sc.gepot.some((id) => groepVan(id) === mijn);
  if (acht) {
    s.winnaar = klaarVoorAcht && !wit ? ik : ander;
    s.melding = `${namen[s.winnaar]} wint: ${s.winnaar === ik ? 'de zwarte erin' : 'zwarte bal te vroeg'}`;
    herplaatsWit(s);
    return;
  }
  // Groep toewijzen bij de eerste gepotte bal.
  if (!mijn) {
    const eerste = sc.gepot.map(groepVan).find((g) => g);
    if (eerste && !wit) {
      s.groep[ik] = eerste;
      s.groep[ander] = eerste === 'vol' ? 'half' : 'vol';
    }
  }
  const groep = s.groep[ik];
  const eersteGroep = sc.eersteRaak === null ? null : sc.eersteRaak === 8 ? null : groepVan(sc.eersteRaak);
  const foutRaak = sc.eersteRaak === null || (!!mijn && mijn !== eersteGroep && !(sc.eersteRaak === 8 && bleef(mijn) === 0));
  const fout = wit || foutRaak;
  const goedGepot = !!groep && sc.gepot.some((id) => groepVan(id) === groep);
  herplaatsWit(s);
  if (fout) {
    s.beurt = ander;
    s.melding = wit ? `Witte bal erin, ${namen[ander]} aan zet` : `Foutstoot, ${namen[ander]} aan zet`;
  } else if (goedGepot || (!mijn && sc.gepot.length > 0)) {
    s.melding = `${namen[ik]} mag verder`;
  } else {
    s.beurt = ander;
    s.melding = `${namen[ander]} aan zet`;
  }
}

function herplaatsWit(s: PoolStand) {
  const w = s.ballen[0];
  if (!w.weg) return;
  w.weg = false;
  w.vx = w.vz = 0;
  w.x = CUE_X;
  w.z = 0;
  for (let i = 0; i < 40 && s.ballen.some((b) => b !== w && !b.weg && Math.hypot(b.x - w.x, b.z - w.z) < TAFEL.R * 2.1); i++) w.z += TAFEL.R * 1.2 * (i % 2 ? -i : i);
}

/** De computer: zoekt een bal van zijn groep die vrij naar een pocket kan, en stoot met een kleine afwijking. */
export function aiStoot(s: PoolStand, rnd = Math.random): { hoek: number; kracht: number } {
  const w = s.ballen[0];
  const mijn = s.groep[s.beurt];
  const eigen = s.ballen.filter((b) => !b.weg && b.id !== 0 && b.id !== 8 && (!mijn || groepVan(b.id) === mijn));
  const doelen = eigen.length ? eigen : s.ballen.filter((b) => !b.weg && b.id === 8);
  let beste: { hoek: number; kracht: number; score: number } | null = null;
  const vrij = (ax: number, az: number, bx: number, bz: number, zonder: number) => {
    const dx = bx - ax;
    const dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    for (const o of s.ballen) {
      if (o.weg || o.id === 0 || o.id === zonder) continue;
      const t = ((o.x - ax) * dx + (o.z - az) * dz) / (l * l);
      if (t < 0 || t > 1) continue;
      if (Math.hypot(ax + dx * t - o.x, az + dz * t - o.z) < TAFEL.R * 2) return false;
    }
    return true;
  };
  for (const d of doelen) {
    for (const [px, pz] of POCKETS) {
      const lp = Math.hypot(px - d.x, pz - d.z) || 1;
      const ux = (px - d.x) / lp;
      const uz = (pz - d.z) / lp;
      const gx = d.x - ux * TAFEL.R * 2;
      const gz = d.z - uz * TAFEL.R * 2;
      const lg = Math.hypot(gx - w.x, gz - w.z) || 1;
      const cos = ((gx - w.x) * ux + (gz - w.z) * uz) / lg;
      if (cos < 0.2 || !vrij(w.x, w.z, gx, gz, d.id) || !vrij(d.x, d.z, px, pz, d.id)) continue;
      const score = cos * 2 - (lp + lg) * 0.35;
      if (!beste || score > beste.score) beste = { hoek: Math.atan2(gz - w.z, gx - w.x), kracht: Math.min(1, 0.22 + (lp + lg) * 0.17), score };
    }
  }
  const afwijking = (rnd() - 0.5) * 0.045;
  if (beste) return { hoek: beste.hoek + afwijking, kracht: beste.kracht };
  // Niets vrij: gewoon naar het eerste doel.
  const d = doelen[0] ?? s.ballen[1];
  return { hoek: Math.atan2(d.z - w.z, d.x - w.x) + afwijking, kracht: 0.6 };
}

/** Eerste bal of band die de witte bal raakt: voor de hulplijn bij het mikken. */
export function hulplijn(s: PoolStand, hoek: number): number {
  const w = s.ballen[0];
  const dx = Math.cos(hoek);
  const dz = Math.sin(hoek);
  let t = 5;
  if (dx > 0) t = Math.min(t, (TAFEL.HX - TAFEL.R - w.x) / dx);
  if (dx < 0) t = Math.min(t, (-TAFEL.HX + TAFEL.R - w.x) / dx);
  if (dz > 0) t = Math.min(t, (TAFEL.HZ - TAFEL.R - w.z) / dz);
  if (dz < 0) t = Math.min(t, (-TAFEL.HZ + TAFEL.R - w.z) / dz);
  for (const b of s.ballen) {
    if (b.weg || b.id === 0) continue;
    const ox = b.x - w.x;
    const oz = b.z - w.z;
    const p = ox * dx + oz * dz;
    if (p <= 0) continue;
    const q = ox * ox + oz * oz - p * p;
    const rr = 4 * TAFEL.R * TAFEL.R;
    if (q > rr) continue;
    t = Math.min(t, p - Math.sqrt(rr - q));
  }
  return Math.max(0, t);
}
