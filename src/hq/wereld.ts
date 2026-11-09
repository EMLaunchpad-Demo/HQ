// Samen in het HQ: wie loopt er rond en waar. Posities en spelberichten gaan via dezelfde verbinding als de videocall
// (het Durable Object "Kantoor", lokaal de dev-server). Het kantoor stuurt ze door naar de anderen en bewaart niets.
import { useSyncExternalStore } from 'react';
import { callStore, onWereld, stuurWereld } from './call';
import { hqStore } from './model';

export interface Speler {
  id: string;
  /** Laatste positie die binnenkwam. */
  x: number;
  y: number;
  z: number;
  ry: number;
  snel: number;
  /** Wanneer (ms), om iemand die stil valt weg te halen. */
  t: number;
}

const spelers = new Map<string, Speler>();
let lijst: string[] = [];
const subs = new Set<() => void>();
const wijzig = () => {
  lijst = [...spelers.keys()].sort();
  subs.forEach((f) => f());
};
export const spelerVan = (id: string) => spelers.get(id);
export const alleSpelers = () => spelers.values();
export const useSpelers = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => lijst,
  );

const STIL_MS = 12_000;
const getal = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

// Spelberichten per tafel.
type Luisteraar = (van: string, d: Record<string, unknown>) => void;
const tafels = new Map<string, Set<Luisteraar>>();
export function opSpelbericht(soort: 'pp' | 'pool', f: Luisteraar) {
  let s = tafels.get(soort);
  if (!s) tafels.set(soort, (s = new Set()));
  s.add(f);
  return () => void s.delete(f);
}
export const stuurSpel = (soort: 'pp' | 'pool', d: Record<string, unknown>) => stuurWereld({ soort, d });

onWereld((van, soort, d) => {
  if (van === callStore.get().me) return; // een ander tabblad van mezelf
  if (soort === 'pos') {
    if (!getal(d.x) || !getal(d.y) || !getal(d.z) || !getal(d.r)) return;
    if (Math.abs(d.x) > 200 || Math.abs(d.z) > 200 || d.y < -2 || d.y > 12) return;
    const nieuw = !spelers.has(van);
    spelers.set(van, { id: van, x: d.x, y: d.y, z: d.z, ry: d.r, snel: getal(d.s) ? d.s : 0, t: Date.now() });
    if (nieuw) wijzig();
    return;
  }
  if (soort === 'weg') {
    if (spelers.delete(van)) wijzig();
    return;
  }
  if (soort === 'pp' || soort === 'pool') tafels.get(soort)?.forEach((f) => f(van, d));
});

// Wie weg is (of niets meer stuurt), verdwijnt.
setInterval(() => {
  const online = hqStore.get().online;
  const nu = Date.now();
  let weg = false;
  for (const [id, s] of spelers)
    if (!online.includes(id) || nu - s.t > STIL_MS) {
      spelers.delete(id);
      weg = true;
    }
  if (weg) wijzig();
}, 2000);

let laatst = 0;
let vorige = '';
/** Mijn positie doorsturen: 8 keer per seconde als ik beweeg, anders om de 3 seconden als teken van leven. */
export function zendPositie(x: number, y: number, z: number, ry: number, snel: number) {
  const nu = Date.now();
  if (nu - laatst < 125) return;
  const r = (v: number) => Math.round(v * 100) / 100;
  const nieuw = `${r(x)},${r(y)},${r(z)},${r(ry)},${r(snel)}`;
  if (nieuw === vorige && nu - laatst < 3000) return;
  laatst = nu;
  vorige = nieuw;
  stuurWereld({ soort: 'pos', d: { x: r(x), y: r(y), z: r(z), r: r(ry), s: r(snel) } });
}
export function zendWeg() {
  vorige = '';
  stuurWereld({ soort: 'weg', d: {} });
}
