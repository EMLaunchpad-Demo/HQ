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

type Bron = 'notion' | 'momentopname' | 'geen' | 'laden';

interface HqState {
  bron: Bron;
  bijgewerkt: string | null;
  /** Korte uitleg waarom de taken niet (helemaal) kloppen. */
  fout?: string;
  taken: HqTaak[];
  /** De lijst is de laatst goede uit de cache van de Worker, niet de huidige. */
  verouderd: boolean;
  /** Tijd van die laatst goede lijst (bij verouderd). */
  sinds: string | null;
  /** De login (Cloudflare Access) is verlopen: niets meer ophalen tot de founder herlaadt. */
  verlopen: boolean;
  /** Wat een agent nu live doet (uit het Claude Code-activiteitslog). */
  live: Record<string, LiveWork>;
  /** Welke mensen nu in het HQ zijn. */
  online: string[];
}

let state: HqState = { bron: 'laden', bijgewerkt: null, taken: [], verouderd: false, sinds: null, verlopen: false, live: {}, online: [] };
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

// --- Hoe betrouwbaar zijn de taken? ---

const vandaag = (d: Date) => d.toDateString() === new Date().toDateString();
/** "14:05", of "3/11 14:05" als het niet van vandaag is. */
function uur(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hm = d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
  return vandaag(d) ? hm : `${d.getDate()}/${d.getMonth() + 1} ${hm}`;
}

/**
 * Mogen we de taken geloven? Alleen dan zegt het HQ "niets open" of "alles is bij".
 * Anders een korte tekst voor de bronchip en de schermen (Notion plat, verouderd, login verlopen).
 */
export function takenStand(s: HqState): { ok: boolean; tekst: string } {
  if (s.verlopen) return { ok: false, tekst: 'Login verlopen' };
  if (s.bron === 'laden') return { ok: false, tekst: 'Taken laden…' };
  if (s.verouderd) return { ok: false, tekst: `Verouderd sinds ${uur(s.sinds ?? s.bijgewerkt)}` };
  if (s.bron === 'geen' || s.fout)
    return { ok: false, tekst: s.taken.length && s.bijgewerkt ? `Notion is niet bereikbaar · stand van ${uur(s.bijgewerkt)}` : 'Notion is niet bereikbaar' };
  return { ok: true, tekst: `${s.bron === 'notion' ? 'Live uit Notion' : 'Notion-momentopname'} · ${uur(s.bijgewerkt)}` };
}

/** Zelfde als takenStand, als hook (twee losse waarden, zodat React niet bij elke render opnieuw tekent). */
export function useTakenStand() {
  const ok = useHq((s) => takenStand(s).ok);
  const tekst = useHq((s) => takenStand(s).tekst);
  return { ok, tekst };
}

// --- Login (Cloudflare Access) ---

/**
 * Zegt dit antwoord "niet (meer) ingelogd"? Een redirect naar de login van Access (met redirect: 'manual'),
 * een 401/403 van de Worker of van Access, of een pagina in plaats van JSON.
 * Een 503 van de Worker ({"fout":"login-controle"}) is geen verlopen login: de controle lukte even niet, opnieuw proberen.
 */
export function loginVerlopen(r: Response) {
  if (r.type === 'opaqueredirect' || r.status === 401 || r.status === 403) return true;
  return r.ok && !(r.headers.get('content-type') ?? '').includes('json');
}

let pollTimer: ReturnType<typeof setTimeout> | undefined;

/** Login verlopen: de balk tonen en stoppen met ophalen (call.ts stopt dan ook met opnieuw verbinden). */
export function meldVerlopen() {
  clearTimeout(pollTimer);
  if (!state.verlopen) hqStore.set({ verlopen: true });
}

// --- Taken ophalen ---

const BRONNEN: Bron[] = ['notion', 'momentopname', 'geen'];
const isStr = (x: unknown): x is string => typeof x === 'string';

/** Een taak zoals de Worker of de dev-server ze stuurt; wat niet klopt, valt weg. */
function leesTaak(x: unknown): HqTaak | null {
  if (!x || typeof x !== 'object') return null;
  const t = x as Record<string, unknown>;
  if (!isStr(t.id) || !isStr(t.naam)) return null;
  const s = (k: string) => (isStr(t[k]) ? (t[k] as string) : '');
  const url = s('url');
  return {
    id: t.id,
    naam: t.naam,
    status: s('status') || 'Niet gestart',
    uitvoerder: s('uitvoerder'),
    afdeling: s('afdeling'),
    prioriteit: s('prioriteit'),
    bron: s('bron'),
    voorstel: t.voorstel === true,
    vervaldatum: isStr(t.vervaldatum) ? t.vervaldatum : null,
    aangemaakt: s('aangemaakt'),
    bewerkt: s('bewerkt'),
    // Enkel gewone https-links (Notion), nooit iets anders in een href.
    url: /^https:\/\//.test(url) ? url : '',
  };
}

const POLL_MS = 60_000;
let started = false;
/** Taken elke minuut verversen (niet als het tabblad verborgen is) en de live-activiteit volgen. */
export function startHqData() {
  if (started) return;
  started = true;
  let bezig = false;
  let laatste = 0;
  /** Het vorige antwoord: is het hetzelfde, dan hoeft er niets opnieuw getekend te worden. */
  let vorigRuw: string | null = null;

  const load = async () => {
    if (bezig || state.verlopen) return;
    bezig = true;
    laatste = Date.now();
    try {
      // Met een tijdslimiet: een verzoek dat blijft hangen (slaapstand, wifi-wissel) mag de polling niet stilleggen.
      const r = await fetch('/hq/taken', { redirect: 'manual', cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
      if (loginVerlopen(r)) return meldVerlopen();
      if (!r.ok) throw new Error(String(r.status));
      const ruw = await r.text();
      if (ruw === vorigRuw) return;
      const d = JSON.parse(ruw) as Record<string, unknown>;
      const bron = BRONNEN.find((b) => b === d.bron) ?? 'geen';
      const fout = isStr(d.fout) ? d.fout.slice(0, 200) : undefined;
      if (bron === 'geen') {
        // Niets bruikbaars ontvangen: de laatst goede taken blijven in beeld, enkel de fout erbij.
        hqStore.set({ bron, fout: fout ?? 'Geen taken ontvangen.', verouderd: false, sinds: null });
      } else {
        const taken = Array.isArray(d.taken) ? d.taken.map(leesTaak).filter((t): t is HqTaak => !!t) : [];
        hqStore.set({ bron, bijgewerkt: isStr(d.bijgewerkt) ? d.bijgewerkt : null, taken, fout, verouderd: d.verouderd === true, sinds: isStr(d.sinds) ? d.sinds : null });
      }
      vorigRuw = ruw;
    } catch {
      vorigRuw = null;
      hqStore.set((s) => ({ bron: s.bron === 'laden' ? 'geen' : s.bron, fout: import.meta.env.PROD ? 'HQ niet bereikbaar.' : 'Dev-server niet bereikbaar.' }));
    } finally {
      bezig = false;
    }
  };
  const plan = () => {
    clearTimeout(pollTimer);
    if (state.verlopen || document.hidden) return;
    pollTimer = setTimeout(() => void load().then(plan), POLL_MS);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return clearTimeout(pollTimer);
    // Terug in het tabblad: meteen verversen (tenzij net gebeurd).
    if (Date.now() - laatste > 15_000) void load().then(plan);
    else plan();
  });
  void load().then(plan);

  // Zelfde stroom als het organigram (main.tsx opent ze al): geen extra verbinding.
  onActivity((e) => {
    if (e.t === 'start') hqStore.set((s) => ({ live: { ...s.live, [e.agent]: { task: e.task, since: Date.now() } } }));
    else if (e.t === 'done' || e.t === 'error')
      hqStore.set((s) => ({ live: { ...s.live, [e.agent]: { task: s.live[e.agent]?.task ?? '', since: Date.now(), done: e.t === 'done' ? e.result : 'Gestopt' } } }));
  });
}
