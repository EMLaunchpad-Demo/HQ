// Wat de interface over het lopende spel moet weten, en wie een plaats aan de tafel heeft.
import { useSyncExternalStore } from 'react';
import { callStore } from '../call';
import { humans } from '../model';
import { ui } from '../ui';
import { opSpelbericht, stuurSpel } from '../wereld';

export type SpelSoort = 'pingpong' | 'pool';

export interface SpelUi {
  /** Heeft iemand een pingpongspel bezig? Dan liggen de batjes niet meer op de tafel. */
  ppActief: boolean;
  tegen: string | null;
  zij: 0 | 1;
  score: [number, number];
  tekst: string;
  hulp: string;
}
let state: SpelUi = { ppActief: false, tegen: null, zij: 0, score: [0, 0], tekst: '', hulp: '' };
const subs = new Set<() => void>();
export const spelUi = {
  get: () => state,
  set(p: Partial<SpelUi>) {
    state = { ...state, ...p };
    subs.forEach((f) => f());
  },
};
export function useSpel<T>(sel: (s: SpelUi) => T): T {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => sel(state),
  );
}

export const naamVan = (id: string | null) => (id ? humans.find((h) => h.id === id)?.name ?? id : 'Computer');
export const ikBen = () => callStore.get().me;

/** Plaatsen aan één tafel. Wie eerst zit, speelt tegen de computer tot er iemand aanschuift. */
export class Tafel {
  zit: [string | null, string | null] = [null, null];
  mijn: 0 | 1 | null = null;
  private los: () => void;

  constructor(
    private soort: 'pp' | 'pool',
    private opWijziging: () => void,
    verder: (van: string, d: Record<string, unknown>) => void,
  ) {
    this.los = opSpelbericht(soort, (van, d) => {
      const z = d.z === 0 || d.z === 1 ? d.z : null;
      if (d.t === 'wie') {
        if (this.mijn !== null) stuurSpel(soort, { t: 'ik', z: this.mijn });
      } else if (d.t === 'ik' && z !== null) {
        this.zit[z] = van;
      } else if (d.t === 'aan' && z !== null) {
        this.zit[z] = van;
        this.opWijziging();
      } else if (d.t === 'af') {
        this.laat(van);
      } else verder(van, d);
    });
  }

  /** Iemand is weg: zijn plaats komt vrij. */
  laat(id: string) {
    let weg = false;
    for (const z of [0, 1] as const)
      if (this.zit[z] === id) {
        this.zit[z] = null;
        weg = true;
      }
    if (weg) this.opWijziging();
  }

  get tegen() {
    if (this.mijn === null) return null;
    return this.zit[this.mijn === 0 ? 1 : 0];
  }

  /** Vraagt wie er zit en neemt een vrije plaats. null = de tafel is bezet. */
  async neemPlaats(): Promise<0 | 1 | null> {
    const ik = ikBen();
    if (ik) {
      stuurSpel(this.soort, { t: 'wie' });
      await new Promise((r) => setTimeout(r, 450));
    }
    const vrij: 0 | 1 | null = !this.zit[0] ? 0 : !this.zit[1] ? 1 : null;
    if (vrij === null) return null;
    this.zit[vrij] = ik ?? 'ik';
    this.mijn = vrij;
    if (ik) stuurSpel(this.soort, { t: 'aan', z: vrij });
    return vrij;
  }

  verlaat() {
    if (this.mijn === null) return;
    this.zit[this.mijn] = null;
    this.mijn = null;
    if (ikBen()) stuurSpel(this.soort, { t: 'af' });
  }

  stop() {
    this.los();
  }
}

// Starten en stoppen: de spellen in de scène melden zich hier aan.
const starters: Partial<Record<SpelSoort, { start: () => void; stop: () => void }>> = {};
export function meldSpel(s: SpelSoort, h: { start: () => void; stop: () => void }) {
  starters[s] = h;
  return () => void delete starters[s];
}
export function startSpel(s: SpelSoort) {
  if (ui.get().spel || !starters[s]) return;
  ui.set({ spel: s, walkHint: '' });
  if (document.pointerLockElement) document.exitPointerLock();
  starters[s]!.start();
}
export function stopSpel() {
  const s = ui.get().spel;
  if (!s) return;
  starters[s]?.stop();
  spelUi.set({ tekst: '', hulp: '' });
  ui.set({ spel: null });
}

// Kort klikje, zonder geluidsbestand.
let ctx: AudioContext | null = null;
export function tik(freq: number, sterkte = 0.12, duur = 0.05) {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(sterkte, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + duur);
  } catch {
    /* geen geluid mogelijk */
  }
}
