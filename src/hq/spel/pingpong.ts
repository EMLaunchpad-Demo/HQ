// Pingpong in het HQ: regels en balvlucht, zonder 3D en zonder netwerk (getest in scripts/hq-spel-test.ts).
// Coördinaten in meter, met het midden van de tafel als oorsprong; x langs de tafel, z in de breedte, y vanaf de vloer.
// Zij 0 staat aan x < 0, zij 1 aan x > 0.
//
// Tegen elkaar over het internet: wie de bal krijgt, beslist. De slag zelf wordt doorgestuurd als startpunt en snelheid,
// en de ontvanger rekent de vlucht na. Zo telt de batje-positie die je op je eigen scherm ziet, ook met wat vertraging.

export type Zij = 0 | 1;
export const PP = { L: 1.37, W: 0.7625, TOP: 0.775, NET: 0.15, R: 0.02, PADDLE_X: 1.62, BEREIK: 0.2, G: 5.5, TOT: 11 };

export interface Bal {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}
export interface Vlucht {
  bal: Bal;
  van: Zij;
  naar: Zij;
  stuit: number;
  rally: number;
}

export const klem = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const andere = (z: Zij): Zij => (z === 0 ? 1 : 0);

/** De slag: vanop het batje naar een punt op de helft van de ander, altijd net hoog genoeg over het net. */
export function schot(van: Zij, z: number, y: number, mikZ: number, rally: number): Bal {
  const x = van === 1 ? PP.PADDLE_X : -PP.PADDLE_X;
  const dir = van === 1 ? -1 : 1;
  const landX = dir * 0.85;
  let v = Math.min(2.7 + rally * 0.11, 4.8);
  let t = 0;
  let vy = 0;
  for (let i = 0; i < 10; i++) {
    t = Math.abs(landX - x) / v;
    vy = (PP.TOP + PP.R - y + 0.5 * PP.G * t * t) / t;
    const tNet = Math.abs(x) / v;
    if (y + vy * tNet - 0.5 * PP.G * tNet * tNet > PP.TOP + PP.NET + PP.R + 0.03) break;
    v *= 0.9;
  }
  return { x, y, z, vx: dir * v, vy, vz: (mikZ - z) / t };
}

export type VluchtEinde = 'net' | 'te-lang' | 'gemist' | 'dubbel' | 'vlak' | null;

/** Eén tijdstap. Geeft terug waarom de vlucht eindigt; `vlak` = de bal is bij het batje van de ontvanger. */
export function stapVlucht(f: Vlucht, dt: number): VluchtEinde {
  const b = f.bal;
  const xOud = b.x;
  b.vy -= PP.G * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  if (xOud * b.x < 0 && b.y < PP.TOP + PP.NET && Math.abs(b.z) < 0.85) return 'net';
  if (b.y <= PP.TOP + PP.R && b.vy < 0 && Math.abs(b.x) <= PP.L && Math.abs(b.z) <= PP.W) {
    b.y = PP.TOP + PP.R;
    b.vy = -b.vy * 0.86;
    b.vx *= 0.97;
    const kant: Zij = b.x < 0 ? 0 : 1;
    if (kant === f.van) return 'te-lang';
    f.stuit++;
    if (f.stuit >= 2) return 'dubbel';
  }
  const voorbij = f.naar === 1 ? b.x >= PP.PADDLE_X : b.x <= -PP.PADDLE_X;
  if (voorbij) return f.stuit === 1 ? 'vlak' : 'te-lang';
  if (b.y < 0.2) return f.stuit === 0 ? 'te-lang' : 'gemist';
  return null;
}

export interface PuntInfo {
  score: [number, number];
  opslag: Zij;
  winnaar: Zij | null;
  reden: string;
}

/** Eén wedstrijd. `beslist(zij)` zegt voor welke zijde dit toestel de waarheid heeft (eigen batje of de computer). */
export class Wedstrijd {
  score: [number, number] = [0, 0];
  opslag: Zij = 0;
  winnaar: Zij | null = null;
  vlucht: Vlucht | null = null;
  batje: [number, number] = [0, 0];
  /** Beweging van het batje (m/s), geeft effect mee aan de slag. */
  batjeV: [number, number] = [0, 0];
  aiFout = 0;

  constructor(
    public beslist: (z: Zij) => boolean,
    public opSlag: (f: Vlucht) => void = () => {},
    public opPunt: (p: PuntInfo) => void = () => {},
  ) {}

  /** Opslag geven door deze zijde. */
  serveer(z: Zij, mikZ: number) {
    if (this.vlucht || this.winnaar !== null || z !== this.opslag) return;
    const f: Vlucht = { bal: schot(z, this.batje[z], PP.TOP + 0.28, klem(mikZ, -PP.W * 0.9, PP.W * 0.9), 0), van: z, naar: andere(z), stuit: 0, rally: 0 };
    this.vlucht = f;
    this.opSlag(f);
  }

  /** Slag van de ander, binnengekomen via het netwerk. */
  ontvangSlag(f: Vlucht) {
    this.vlucht = f;
  }

  ontvangPunt(p: PuntInfo) {
    this.score = p.score;
    this.opslag = p.opslag;
    this.winnaar = p.winnaar;
    this.vlucht = null;
    this.opPunt(p);
  }

  private punt(voor: Zij, reden: string) {
    const score: [number, number] = [this.score[0], this.score[1]];
    score[voor]++;
    const totaal = score[0] + score[1];
    const vooruit = Math.abs(score[0] - score[1]) >= 2;
    const winnaar: Zij | null = vooruit && Math.max(score[0], score[1]) >= PP.TOT ? (score[0] > score[1] ? 0 : 1) : null;
    // Elke 2 punten een andere opslag, vanaf 10-10 elk punt.
    const beurt = score[0] >= 10 && score[1] >= 10 ? totaal : Math.floor(totaal / 2);
    const opslag: Zij = beurt % 2 === 0 ? 0 : 1;
    this.ontvangPunt({ score, opslag, winnaar, reden });
  }

  /** Waar de bal het batje van de ontvanger zal bereiken, voor de computer en de schaduw. */
  voorspelZ(): number {
    const f = this.vlucht;
    if (!f) return 0;
    const kopie: Vlucht = { ...f, bal: { ...f.bal } };
    for (let i = 0; i < 400; i++) if (stapVlucht(kopie, 1 / 120)) break;
    return kopie.bal.z;
  }

  /** Eén tijdstap van de bal. `mikAi`: geeft het mikpunt voor een slag van de computer, of null voor een mens. */
  stap(dt: number, mikAi: (z: Zij) => number | null = () => null) {
    const f = this.vlucht;
    if (!f) return;
    const einde = stapVlucht(f, dt);
    if (!einde) return;
    const ontvanger = f.naar;
    if (!this.beslist(ontvanger)) {
      // Niet aan ons om te beslissen: de bal ligt stil tot het bericht binnenkomt.
      if (einde !== 'vlak') this.vlucht = null;
      else this.vlucht = null;
      return;
    }
    if (einde === 'vlak') {
      const pz = this.batje[ontvanger];
      const naast = f.bal.z - pz;
      if (Math.abs(naast) > PP.BEREIK) return this.punt(f.van, 'Gemist');
      const ai = mikAi(ontvanger);
      // Waar je de bal raakt op het batje, plus hoe je batje beweegt, bepaalt de richting. Te wild = naast de tafel.
      const mik = ai ?? klem((naast / PP.BEREIK) * PP.W * 1.05 + this.batjeV[ontvanger] * 0.22, -PP.W * 1.12, PP.W * 1.12);
      const volgende: Vlucht = { bal: schot(ontvanger, f.bal.z, klem(f.bal.y, PP.TOP + 0.08, 1.5), mik, f.rally + 1), van: ontvanger, naar: f.van, stuit: 0, rally: f.rally + 1 };
      this.vlucht = volgende;
      this.opSlag(volgende);
      return;
    }
    if (einde === 'gemist' || einde === 'dubbel') return this.punt(f.van, 'Gemist');
    this.punt(ontvanger, einde === 'net' ? 'In het net' : 'Naast de tafel');
  }
}

/** De computer: gaat naar de bal, met een fout die groeit naarmate de rally langer duurt. */
export function aiBatje(w: Wedstrijd, z: Zij, dt: number) {
  const f = w.vlucht;
  const doel = f && f.naar === z ? w.voorspelZ() + w.aiFout : 0;
  const stap = klem(doel - w.batje[z], -1.7 * dt, 1.7 * dt);
  w.batje[z] += stap;
}

export function kiesAiFout(rally: number, rnd = Math.random) {
  return (rnd() - 0.5) * 2 * (0.05 + rally * 0.028);
}
