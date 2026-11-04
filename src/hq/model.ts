// Het model achter het hoofdkantoor: verdiepingen en wie er zit (uit team.config.json),
// de taken uit Notion per agent of founder, en de live-activiteit van het Claude Code-team.
import { useSyncExternalStore } from 'react';
import { config } from '../config';
import { onActivity } from '../live';
import type { Agent, HqFloor } from '../types';

export interface HqTaak {
  id: string;
  naam: string;
  status: string;
  uitvoerder: string;
  afdeling: string;
  prioriteit: string;
  bron: string;
  voorstel: boolean;
  vervaldatum: string | null;
  aangemaakt: string;
  bewerkt: string;
  url: string;
}

/** Iemand in het gebouw: een afdelingshoofd, een rol (werk-agent) of een mens. */
export interface Occupant {
  id: string;
  name: string;
  title: string;
  color: string;
  kind: 'hoofd' | 'rol' | 'cos' | 'mens';
  avatar?: string;
  /** Voor rollen: het afdelingshoofd. */
  lead?: string;
}

export interface FloorModel extends Omit<HqFloor, 'offices'> {
  level: number;
  groups: { id: string; label: string; color: string; members: Occupant[] }[];
  offices: Occupant[];
}

const FLOORS_DEFAULT: HqFloor[] = [
  { id: 'inkom', label: 'Inkom & War Room', agents: [config.chiefOfStaff.id] },
  ...config.departments.map((d) => ({ id: d.id, label: d.agent.title, departments: [d.id] })),
  { id: 'directie', label: 'Directie', offices: true },
];

const colorOf = (a: Agent) => (a.color === 'gradient' ? '#13c7e6' : a.color);

/** "sales-lead-onderzoeker" → "Lead-onderzoeker". */
function roleName(id: string) {
  const parts = id.split('-');
  const rest = parts.length > 1 && ['sales', 'content', 'service'].includes(parts[0]) ? parts.slice(1) : parts;
  const s = rest.join('-').replace('launchpad-os', 'EML AI Team').replace('ai-consulting', 'AI consulting');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const people = config.hq?.people ?? [];

export const floors: FloorModel[] = (config.hq?.floors ?? FLOORS_DEFAULT).map((f, level) => {
  const groups: FloorModel['groups'] = [];
  for (const id of f.agents ?? []) {
    const a = id === config.chiefOfStaff.id ? config.chiefOfStaff : config.departments.find((d) => d.agent.id === id)?.agent;
    if (a) groups.push({ id: a.id, label: a.title, color: colorOf(a), members: [{ id: a.id, name: a.name, title: a.title, color: colorOf(a), kind: 'cos', avatar: a.avatar }] });
  }
  for (const depId of f.departments ?? []) {
    const d = config.departments.find((x) => x.id === depId);
    if (!d) continue;
    const c = colorOf(d.agent);
    groups.push({
      id: d.id,
      label: d.agent.title,
      color: c,
      members: [
        { id: d.agent.id, name: d.agent.name, title: d.agent.title, color: c, kind: 'hoofd', avatar: d.agent.avatar },
        ...(d.werkAgents ?? []).map((w) => ({ id: w, name: roleName(w), title: `Rol van ${d.agent.name}`, color: c, kind: 'rol' as const, lead: d.agent.id })),
      ],
    });
  }
  const desks = people.filter((p) => p.floor === f.id && !p.office);
  if (desks.length)
    groups.push({ id: `mensen-${f.id}`, label: 'Team', color: '#f4f1ea', members: desks.map((p) => ({ id: p.id, name: p.name, title: p.title, color: '#f4f1ea', kind: 'mens' })) });
  const offices: Occupant[] = f.offices
    ? [...config.founders, ...people.filter((p) => p.office)].map((p) => ({ id: p.id, name: p.name, title: p.title, color: '#2f7bff', kind: 'mens' }))
    : [];
  return { ...f, level, groups, offices };
});

/** Wie mag zich aanmelden in het HQ (voor aanwezigheid en videocall). */
export const humans = [...config.founders, ...people].map((p) => ({ id: p.id, name: p.name, title: p.title }));

export const floorOf = (occupantId: string) =>
  floors.find((f) => f.offices.some((o) => o.id === occupantId) || f.groups.some((g) => g.members.some((m) => m.id === occupantId)));

// --- Taken toewijzen ---

const has = (s: string, re: RegExp) => re.test(s.toLowerCase());

/**
 * Wie in het HQ een taak "heeft". Uitvoerder Ebert/Martijn → hun kantoor.
 * Uitvoerder Agent → het afdelingshoofd volgens de afdeling in Notion (zelfde verdeling als CLAUDE.md).
 */
export function ownerOf(t: HqTaak): string {
  const human = humans.find((h) => h.name.toLowerCase() === t.uitvoerder.toLowerCase());
  if (human) return human.id;
  const n = t.naam;
  switch (t.afdeling) {
    case 'Sales':
      return has(n, /boekhoud|factu/) ? 'xavier' : 'oscar';
    case 'Content':
      return has(n, /rapport|statistiek|cijfers/) ? 'xavier' : 'carmen';
    case 'Service':
      return t.bron === 'Support' || has(n, /^p\d\b|support|bug|klantvraag|testen|nakijken/) ? 'markske' : 'ddt';
    case 'Intern':
      if (has(n, /boekhoud|factu|financ|strateg|doelen|rapport|cijfer|budget/)) return 'xavier';
      if (has(n, /website|workflow|platform|automat|chatbot|integratie|seo/)) return 'ddt';
      return config.chiefOfStaff.id;
    default:
      return config.chiefOfStaff.id;
  }
}

export const isOpen = (t: HqTaak) => t.status !== 'Done';
export const isBusy = (t: HqTaak) => t.status === 'In uitvoering';
export const isOverdue = (t: HqTaak) => isOpen(t) && !!t.vervaldatum && t.vervaldatum.slice(0, 10) < new Date().toISOString().slice(0, 10);

const PRIO: Record<string, number> = { Hoog: 0, Normaal: 1, Laag: 2, '': 1 };
const STAT: Record<string, number> = { 'In uitvoering': 0, Volgende: 1, 'Niet gestart': 2, Done: 3 };
export const sortTasks = (a: HqTaak, b: HqTaak) =>
  (STAT[a.status] ?? 2) - (STAT[b.status] ?? 2) || (PRIO[a.prioriteit] ?? 1) - (PRIO[b.prioriteit] ?? 1) || (a.vervaldatum ?? '9').localeCompare(b.vervaldatum ?? '9');

// --- Kleine store ---

export interface LiveWork {
  task: string;
  since: number;
  done?: string;
}

interface HqState {
  bron: 'notion' | 'momentopname' | 'geen' | 'laden';
  bijgewerkt: string | null;
  fout?: string;
  taken: HqTaak[];
  /** Wat een agent nu live doet (uit het Claude Code-activiteitslog). */
  live: Record<string, LiveWork>;
  /** Welke mensen nu in het HQ zijn. */
  online: string[];
}

let state: HqState = { bron: 'laden', bijgewerkt: null, taken: [], live: {}, online: [] };
const subs = new Set<() => void>();
export const hqStore = {
  get: () => state,
  set(p: Partial<HqState> | ((s: HqState) => Partial<HqState>)) {
    state = { ...state, ...(typeof p === 'function' ? p(state) : p) };
    subs.forEach((f) => f());
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => subs.delete(f);
  },
};
if (import.meta.env.DEV) Object.assign(window, { hqStore });

export function useHq<T>(sel: (s: HqState) => T): T {
  return useSyncExternalStore(hqStore.subscribe, () => sel(state));
}

/** Taken per eigenaar, gesorteerd. */
export function tasksByOwner(taken: HqTaak[]) {
  const map: Record<string, HqTaak[]> = {};
  for (const t of taken) (map[ownerOf(t)] ??= []).push(t);
  for (const k in map) map[k].sort(sortTasks);
  return map;
}

/** Wat de Chief of Staff in de War Room overziet: zijn eigen taken plus alles wat bij de agents ligt. */
export function warRoomTasks(taken: HqTaak[]) {
  const cos = config.chiefOfStaff.id;
  return taken.filter((t) => t.uitvoerder === 'Agent' || ownerOf(t) === cos).sort(sortTasks);
}

export function progress(list: HqTaak[]) {
  const done = list.filter((t) => !isOpen(t)).length;
  const busy = list.filter(isBusy).length;
  const open = list.length - done;
  return { done, busy, open, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
}

let started = false;
/** Taken elke minuut verversen en de live-activiteit volgen. */
export function startHqData() {
  if (started) return;
  started = true;
  const load = async () => {
    try {
      const r = await fetch('/hq/taken');
      const d = await r.json();
      hqStore.set({ bron: d.bron, bijgewerkt: d.bijgewerkt, taken: d.taken ?? [], fout: d.fout });
    } catch {
      hqStore.set({ bron: 'geen', fout: 'Dev-server niet bereikbaar.' });
    }
  };
  void load();
  setInterval(load, 60_000);

  // Zelfde stroom als het organigram (main.tsx opent ze al): geen extra verbinding.
  onActivity((e) => {
    if (e.t === 'start') hqStore.set((s) => ({ live: { ...s.live, [e.agent]: { task: e.task, since: Date.now() } } }));
    else if (e.t === 'done' || e.t === 'error')
      hqStore.set((s) => ({ live: { ...s.live, [e.agent]: { task: s.live[e.agent]?.task ?? '', since: Date.now(), done: e.t === 'done' ? e.result : 'Gestopt' } } }));
  });
}
