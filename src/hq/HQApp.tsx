// Het virtuele hoofdkantoor (#/hq): het gebouw in 3D met daarover de interface.
// Kijken en navigeren; chatten met de agents gebeurt in Claude, niet hier.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bell, Footprints, Building2, ChevronDown, ExternalLink, Mic, MicOff, PhoneCall, PhoneOff, RefreshCw, Video, VideoOff } from 'lucide-react';
import { config, fileUrl } from '../config';
import { Logo } from '../components/Logo';
import { HqScene } from './Scene';
import { floors, humans, isBusy, isOpen, isOverdue, livePct, progress, startHqData, tasksByOwner, useHq, useTakenStand, warRoomTasks, type FloorModel, type HqTaak, type LiveWork, type Occupant } from './model';
import { ui, useUi } from './ui';
import { accept, call, decline, hangup, nameOf, setMe, startPresence, toggleCam, toggleMute, useCall, ZELF_KIEZEN } from './call';
import { meldingenAanzetten, meldingenToestemming } from './bel';
import { moodOf } from './world/Warehouse';
import { MOOD_COLOR, type Mood } from './world/Character';
import { vraagMuis } from './world/Walker';
import { naamVan, stopSpel, useSpel } from './spel/store';

const MOOD_LABEL: Record<Mood, string> = { bezig: 'Bezig', volgende: 'Volgende', open: 'Open taken', rust: 'Niets open', offline: 'Niet in het HQ' };
const STATUS_COLOR: Record<string, string> = { 'In uitvoering': '#2ff0a6', Volgende: '#ffd23f', 'Niet gestart': '#7c8a97', Done: '#2f7bff' };

const glass: React.CSSProperties = {
  background: 'rgba(9,13,20,0.78)',
  border: '1px solid var(--line-2)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
};

const btn = 'inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white transition disabled:opacity-40';
const btnGrad: React.CSSProperties = { background: 'linear-gradient(100deg, rgba(47,123,255,.9), rgba(19,199,230,.85))', border: '1px solid rgba(255,255,255,.18)' };

const fmtDate = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
const agentOf = (id: string) => [config.chiefOfStaff, ...config.departments.map((d) => d.agent)].find((a) => a.id === id);

function Avatar({ o, size = 40 }: { o: Occupant; size?: number }) {
  const a = agentOf(o.id);
  if (a?.avatar) {
    return (
      <div className="shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size, border: `2px solid ${o.color}` }}>
        <img
          src={fileUrl(a.avatar)}
          alt=""
          className="h-full w-full object-cover"
          style={{ objectPosition: a.avatarFocus ?? '50% 30%', transform: `scale(${Math.min(a.avatarZoom ?? 1, 1.8)})`, transformOrigin: a.avatarFocus ?? '50% 30%' }}
        />
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full font-bold text-[#0b1526]" style={{ width: size, height: size, background: 'var(--grad)', fontSize: size * 0.42 }}>
      {o.name.slice(0, 1)}
    </div>
  );
}

function MoodChip({ mood, label }: { mood: Mood; label?: string }) {
  return (
    <span className="label inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider" style={{ background: 'rgba(255,255,255,0.06)', color: MOOD_COLOR[mood] }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: MOOD_COLOR[mood], boxShadow: `0 0 8px ${MOOD_COLOR[mood]}` }} />
      {label ?? MOOD_LABEL[mood]}
    </span>
  );
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--grad)' }} />
    </div>
  );
}

function TaskRow({ t }: { t: HqTaak }) {
  return (
    <a href={t.url || undefined} target="_blank" rel="noreferrer" className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[t.status] ?? '#7c8a97' }} />
      <span className="min-w-0 flex-1">
        <span className={`block text-[13px] leading-snug ${isOpen(t) ? 'text-hi' : 'text-dim line-through'}`}>{t.naam}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[10px] uppercase tracking-wider text-dim">
          <span style={{ color: STATUS_COLOR[t.status] }}>{t.status}</span>
          {t.prioriteit && <span>{t.prioriteit}</span>}
          {t.vervaldatum && <span style={{ color: isOverdue(t) ? '#ff8a6a' : undefined }}>{isOverdue(t) ? 'te laat · ' : ''}{fmtDate(t.vervaldatum)}</span>}
          {t.voorstel && <span>voorstel</span>}
        </span>
      </span>
      <ExternalLink size={12} className="mt-1 shrink-0 text-dim opacity-0 group-hover:opacity-100" />
    </a>
  );
}

const duur = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000));
  return m < 1 ? 'net' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} u ${m % 60} min`;
};

/** Live wat een agent nu doet, rechtstreeks uit Claude Code: opdracht, stappenplan in procent, huidige stap en tijd. */
function LiveCard({ w }: { w: LiveWork }) {
  // Elke 20 seconden opnieuw tekenen, zodat "bezig sinds" meeloopt.
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 20_000);
    return () => clearInterval(iv);
  }, []);
  const pct = livePct(w);
  const stil = !w.done && Date.now() - (w.at ?? w.since) > 30 * 60_000;
  const kop = w.done ? 'Net klaar' : stil ? 'Geen teken van leven' : 'Nu live';
  return (
    <div className="mt-2 space-y-1.5 rounded-lg px-2.5 py-2 text-[12px] text-hi" style={{ background: w.done || stil ? 'rgba(255,255,255,0.04)' : 'rgba(47,240,166,0.08)' }}>
      <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-wider">
        <span className={w.done || stil ? 'text-mid' : 'text-mint'}>
          {!w.done && !stil && <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#2ff0a6] align-middle" />}
          {kop}
        </span>
        <span className="text-dim">{w.done ? `${duur(Date.now() - w.since)} geleden` : `bezig sinds ${duur(Date.now() - w.since)}`}</span>
      </div>
      {w.task && <div className="leading-snug">{w.task}</div>}
      {pct !== null && (
        <div>
          <div className="mb-1 flex justify-between font-mono text-[10px] uppercase tracking-wider text-dim">
            <span>
              Stappenplan · {w.plan!.done} van {w.plan!.total} klaar
            </span>
            <span className="text-white">{pct}%</span>
          </div>
          <Bar pct={pct} />
        </div>
      )}
      {!w.done && w.doing && (
        <div className="text-[11.5px] text-mid">
          <span className="font-mono text-[10px] uppercase tracking-wider text-dim">Nu · </span>
          {w.doing}
          {w.steps ? <span className="text-dim"> · stap {w.steps}</span> : null}
        </div>
      )}
      {pct === null && !w.done && !w.doing && <div className="text-[11.5px] text-dim">Begint eraan.</div>}
      {w.done && <div className="text-[11.5px] text-mid">{w.done}</div>}
    </div>
  );
}

function PersonBlock({ o, tasks, roles, focus }: { o: Occupant; tasks: HqTaak[]; roles?: Occupant[]; focus: string | null }) {
  const live = useHq((s) => s.live[o.id]);
  const stand = useTakenStand();
  // Taken niet te geloven (Notion plat, verouderd): nooit "niets open", maar "taken onbekend".
  const mood = moodOf(tasks, live, stand.ok);
  const p = progress(tasks);
  const [all, setAll] = useState(false);
  const shown = all ? tasks : tasks.filter(isOpen).slice(0, 6);
  const ref = useRef<HTMLDivElement>(null);
  const selected = focus === o.id || roles?.some((r) => r.id === focus);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selected]);
  return (
    <div ref={ref} className="rounded-2xl p-3" style={{ background: selected ? 'rgba(47,240,166,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selected ? 'rgba(47,240,166,.35)' : 'var(--line)'}` }}>
      <div className="flex items-center gap-3">
        <Avatar o={o} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-bold text-white">{o.name}</span>
            <MoodChip mood={mood} label={mood === 'offline' ? 'Taken onbekend' : undefined} />
          </div>
          <div className="truncate text-[12px] text-mid">{o.title}</div>
        </div>
      </div>
      {live && <LiveCard w={live} />}
      <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-dim">
        <span>{p.busy} bezig · {p.open} open · {p.done} klaar</span>
        <span>{p.pct}%</span>
      </div>
      <div className="mt-1.5">
        <Bar pct={p.pct} />
      </div>
      <div className="mt-2 -mx-1">
        {shown.length === 0 && (
          <div className="px-2 py-1 text-[12px]" style={{ color: stand.ok ? 'var(--dim)' : '#ff8a6a' }}>
            {stand.ok ? 'Geen open taken in Notion.' : stand.tekst}
          </div>
        )}
        {shown.map((t) => (
          <TaskRow key={t.id} t={t} />
        ))}
      </div>
      {tasks.length > shown.length || all ? (
        <button className="mt-1 px-2 font-mono text-[10px] uppercase tracking-wider text-cyan hover:text-white" onClick={() => setAll((x) => !x)}>
          {all ? 'Minder tonen' : `Alles tonen (${tasks.length})`}
        </button>
      ) : null}
      {roles && roles.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t pt-2" style={{ borderColor: 'var(--line)' }}>
          {roles.map((r) => (
            <span key={r.id} className="rounded-full px-2 py-0.5 text-[11px] text-mid" style={{ background: 'rgba(255,255,255,0.05)', outline: focus === r.id ? '1px solid var(--mint)' : 'none' }}>
              {r.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function OfficeCard({ o, tasks }: { o: Occupant; tasks: HqTaak[] }) {
  const online = useHq((s) => s.online.includes(o.id));
  const me = useCall((s) => s.me);
  const status = useCall((s) => s.status);
  const focus = useUi((s) => s.focus);
  const level = useUi((s) => s.level);
  const mine = me === o.id;
  const here = focus === `kantoor-${o.id}`;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button className={btn} style={here ? btnGrad : { background: 'rgba(255,255,255,0.06)', border: '1px solid var(--line-2)' }} onClick={() => ui.go(level, `kantoor-${o.id}`)}>
          <Building2 size={14} /> {mine ? 'Naar je kantoor' : `Naar kantoor ${o.name}`}
        </button>
        {!mine && (
          <button
            className={btn}
            style={btnGrad}
            disabled={!me || !online || status !== 'idle'}
            title={!me ? (ZELF_KIEZEN ? 'Meld je eerst aan' : 'Even geduld: je login wordt nagekeken') : !online ? `${o.name} is niet in het HQ` : ''}
            onClick={() => {
              ui.go(level, `kantoor-${o.id}`);
              void call(o.id);
            }}
          >
            <PhoneCall size={14} /> Videocall
          </button>
        )}
      </div>
      {!mine && here && !online && <div className="text-[12px] text-dim">{o.name} is nu niet in het HQ. Zodra {o.name} het HQ opent, kan je bellen.</div>}
      <PersonBlock o={{ ...o, title: online ? `${o.title} · in het HQ` : o.title }} tasks={tasks} focus={focus} />
    </div>
  );
}

function FloorPanel({ floor, byOwner }: { floor: FloorModel; byOwner: Record<string, HqTaak[]> }) {
  const focus = useUi((s) => s.focus);
  const taken = useHq((s) => s.taken);
  const warRoom = useMemo(() => warRoomTasks(taken), [taken]);
  return (
    <div className="space-y-3">
      {floor.groups.map((g) => {
        const [head, ...roles] = g.members;
        const tasks = head.kind === 'cos' ? warRoom : byOwner[head.id] ?? [];
        return <PersonBlock key={g.id} o={head} roles={roles} tasks={tasks} focus={focus} />;
      })}
      {floor.offices.map((o) => {
        const f = config.founders.find((x) => x.id === o.id);
        return <OfficeCard key={o.id} o={{ ...o, title: f?.title ?? o.title }} tasks={byOwner[o.id] ?? []} />;
      })}
    </div>
  );
}

function floorTasks(f: FloorModel, byOwner: Record<string, HqTaak[]>) {
  return [...f.groups.map((g) => g.members[0].id), ...f.offices.map((o) => o.id)].flatMap((id) => byOwner[id] ?? []);
}

function Overview({ byOwner }: { byOwner: Record<string, HqTaak[]> }) {
  const taken = useHq((s) => s.taken);
  const p = progress(taken);
  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-mid">
        Het HQ is één grote hal. Elke afdeling heeft een eigen glazen ruimte onder de tussenverdieping, in het midden zit de arena met de War Room. Klik op het gebouw of kies een ruimte rechts. De diamant boven
        iemands hoofd toont de status: <span style={{ color: MOOD_COLOR.bezig }}>bezig</span>, <span style={{ color: MOOD_COLOR.volgende }}>volgende</span>,{' '}
        <span style={{ color: MOOD_COLOR.open }}>open taken</span> of <span style={{ color: MOOD_COLOR.rust }}>niets open</span>.
      </p>
      <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)' }}>
        <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider text-dim">
          <span>Hele team · {p.busy} bezig · {p.open} open · {p.done} klaar (7 dagen)</span>
          <span>{p.pct}%</span>
        </div>
        <div className="mt-2">
          <Bar pct={p.pct} />
        </div>
      </div>
      {[...floors].reverse().map((f) => {
        const t = floorTasks(f, byOwner);
        const fp = progress(t);
        return (
          <button key={f.id} onClick={() => ui.go(f.level)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/5" style={{ border: '1px solid var(--line)' }}>
            <span className="font-mono text-[12px] text-cyan">{String(f.level + 1).padStart(2, '0')}</span>
            <span className="flex-1 text-[13px] font-semibold text-white">{f.label}</span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-dim">
              {fp.busy} bezig · {fp.open} open
            </span>
          </button>
        );
      })}
    </div>
  );
}

const SPACES: Record<'lounge' | 'studio' | 'kitchen', { intro: string; zones: [string, string][] }> = {
  lounge: {
    intro: 'De plek om even te ontspannen, samen te komen of klanten te ontvangen, midden in het HQ.',
    zones: [
      ['EML Arena', 'Beneden: de pingpongtafel op een donkere sportvloer met neon in het merkverloop, een portaal met scorebord en een tribune.'],
      ['Biljart', 'Naast de arena: pooltafel onder een hanglamp.'],
      ['Gaming room', 'Boven links: groot scherm, gamingstoelen, sofa en een arcadekast.'],
      ['Fitness', 'Boven rechts: loopbanden, fietsen, squatrek, halters en een spiegelwand.'],
      ['Parking', 'Naast het HQ: vijf bedrijfswagens in de huisstijl van EM Launchpad, elk met een laadpaal.'],
    ],
  },
  studio: {
    intro: 'Waar de content gemaakt wordt: opnames, podcasts en montage, vooraan rechts in de hal.',
    zones: [
      ['Content studio', 'Witte cyclorama, softboxen, ringlamp en een camera met teleprompter.'],
      ['Podcast', 'Akoestische panelen, ronde tafel met drie microfoons en een ON AIR-lamp boven de deur.'],
      ['Montageplek', 'Twee schermen om de opnames meteen te monteren.'],
    ],
  },
  kitchen: {
    intro: 'De keuken en lounge links in de hal: samen eten, koffie, en even de tv aan.',
    zones: [
      ['Keuken', 'Lange keuken langs de muur, een groot eiland met krukken en een tv-wand.'],
      ['Eettafel', 'Lange eiken tafel voor zes, tussen de keuken en de arena.'],
      ['Lounge', 'Hoekbank, fauteuils en een mediawand met grote tv.'],
    ],
  },
};

function SpacePanel({ kind }: { kind: keyof typeof SPACES }) {
  const { intro, zones } = SPACES[kind];
  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-mid">{intro}</p>
      {zones.map(([t, d], i) => (
        <div key={t} className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)' }}>
          <div className="font-mono text-[10px] uppercase tracking-wider text-cyan">{String(i + 1).padStart(2, '0')}</div>
          <div className="text-[14px] font-bold text-white">{t}</div>
          <div className="text-[12.5px] text-mid">{d}</div>
        </div>
      ))}
    </div>
  );
}

function Elevator({ byOwner }: { byOwner: Record<string, HqTaak[]> }) {
  const level = useUi((s) => s.level);
  return (
    <div className="pointer-events-auto flex w-[220px] flex-col gap-1 rounded-2xl p-2" style={glass}>
      <div className="px-2 pb-1 pt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-dim">Ruimtes</div>
      {[...floors].reverse().map((f) => {
        const t = floorTasks(f, byOwner);
        const busy = t.filter(isBusy).length;
        const active = level === f.level;
        return (
          <button
            key={f.id}
            onClick={() => ui.go(f.level)}
            className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/5"
            style={active ? { background: 'linear-gradient(100deg, rgba(47,123,255,.28), rgba(19,199,230,.18), rgba(47,240,166,.12))', border: '1px solid rgba(19,199,230,.5)' } : { border: '1px solid transparent' }}
          >
            <span className="font-mono text-[12px]" style={{ color: active ? '#fff' : 'var(--cyan)' }}>
              {String(f.level + 1).padStart(2, '0')}
            </span>
            <span className="flex-1 truncate text-[12.5px] font-semibold text-hi">{f.label}</span>
            {busy > 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: MOOD_COLOR.bezig, boxShadow: `0 0 8px ${MOOD_COLOR.bezig}` }} />}
          </button>
        );
      })}
      <button
        onClick={() => ui.go(-1)}
        className="mt-1 flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-white/5"
        style={level < 0 ? { background: 'rgba(255,255,255,0.08)', border: '1px solid var(--line-2)' } : { border: '1px solid transparent' }}
      >
        <span className="font-mono text-[12px] text-cyan">--</span>
        <span className="text-[12.5px] font-semibold text-hi">Buiten</span>
      </button>
    </div>
  );
}

function SourceChip() {
  const bron = useHq((s) => s.bron);
  const fout = useHq((s) => s.fout);
  const stand = useTakenStand();
  const c = stand.ok ? (bron === 'notion' ? '#2ff0a6' : '#ffd23f') : bron === 'laden' ? '#7c8a97' : '#ff8a6a';
  return (
    <span className="block">
      <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-mid">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
        {stand.tekst}
      </span>
      {/* Waarom het niet klopt, zichtbaar en niet enkel als tooltip. */}
      {!stand.ok && fout && (
        <span className="block max-w-[260px] truncate text-[11px] text-dim" title={fout}>
          {fout}
        </span>
      )}
    </span>
  );
}

/** Meldingen van het systeem voor een inkomende call: toestemming enkel na een klik. */
function MeldingenKnop() {
  const me = useCall((s) => s.me);
  const [toestemming, setToestemming] = useState(meldingenToestemming);
  if (!me || toestemming !== 'default') return null;
  return (
    <button
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-mid hover:text-white"
      style={glass}
      title="Zo zie je een inkomende videocall ook als het HQ in een ander tabblad staat."
      onClick={() => void meldingenAanzetten().then(setToestemming)}
    >
      <Bell size={13} /> Meldingen aanzetten
    </button>
  );
}

function WhoAmI() {
  const me = useCall((s) => s.me);
  const [open, setOpen] = useState(false);
  // Online komt wie je bent uit de login: niets te kiezen.
  if (!ZELF_KIEZEN) {
    if (!me) return null;
    return (
      <span className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] text-hi" style={glass}>
        <span className="h-1.5 w-1.5 rounded-full bg-mint" /> Je bent {nameOf(me)}
      </span>
    );
  }
  // Lokaal: wisselen, of alsnog aanmelden na "Enkel rondkijken".
  return (
    <div className="relative">
      <button className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] text-hi" style={glass} onClick={() => setOpen((x) => !x)}>
        <span className={`h-1.5 w-1.5 rounded-full ${me ? 'bg-mint' : 'bg-dim'}`} /> {me ? `Je bent ${nameOf(me)}` : 'Aanmelden'} <ChevronDown size={13} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 rounded-xl p-1" style={glass}>
          {humans.map((h) => (
            <button key={h.id} className="block w-full rounded-lg px-3 py-1.5 text-left text-[13px] text-hi hover:bg-white/5" onClick={() => (setMe(h.id), setOpen(false))}>
              {h.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** De login (Cloudflare Access) is verlopen: één duidelijke balk, en niets probeert nog op de achtergrond. */
function VerlopenBalk() {
  const verlopen = useHq((s) => s.verlopen);
  if (!verlopen) return null;
  return (
    <div className="pointer-events-auto fixed left-1/2 top-4 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-2xl px-4 py-2.5" style={{ ...glass, border: '1px solid rgba(255,138,106,.55)' }} role="alert">
      <span className="text-[13px] text-hi">Je login is verlopen. Herlaad de pagina om opnieuw in te loggen.</span>
      <button className={btn} style={btnGrad} onClick={() => location.reload()}>
        <RefreshCw size={14} /> Herladen
      </button>
    </div>
  );
}

function Welcome() {
  const me = useCall((s) => s.me);
  const [skip, setSkip] = useState(false);
  // Enkel lokaal: online weet het HQ wie je bent uit de login.
  if (!ZELF_KIEZEN || me || skip) return null;
  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(6,8,12,0.45)' }}>
      <div className="w-[380px] rounded-3xl p-6" style={glass}>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">01 / Aanmelden</div>
        <h2 className="mt-2 text-[22px] font-extrabold leading-tight text-white">
          Welkom in het HQ. <span className="grad-text">Wie ben je?</span>
        </h2>
        <p className="mt-2 text-[13px] text-mid">Zo verschijn je in je kantoor en kunnen collega's je bellen.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {humans.map((h) => (
            <button key={h.id} className={btn} style={btnGrad} onClick={() => setMe(h.id)}>
              {h.name}
            </button>
          ))}
        </div>
        <button className="mt-3 w-full text-center text-[12px] text-dim hover:text-hi" onClick={() => setSkip(true)}>
          Enkel rondkijken (aanmelden kan later rechtsboven)
        </button>
      </div>
    </div>
  );
}

function VideoEl({ stream, muted, className }: { stream: MediaStream | null; muted?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

function CallUi() {
  const s = useCall((x) => x);
  const peer = nameOf(s.peer);
  return (
    <>
      {s.melding && (
        <div className="pointer-events-none fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-[13px] text-hi" style={glass}>
          {s.melding}
        </div>
      )}
      {s.status === 'inkomend' && (
        <div className="pointer-events-auto fixed left-1/2 top-1/2 z-50 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-3xl p-6 text-center" style={glass}>
          <div className="mx-auto h-14 w-14 animate-pulse rounded-full" style={{ background: 'var(--grad)' }} />
          <h3 className="mt-4 text-[18px] font-bold text-white">{peer} klopt aan bij je kantoor</h3>
          <p className="mt-1 text-[13px] text-mid">Videocall, rechtstreeks tussen jullie twee.</p>
          <div className="mt-5 flex justify-center gap-2">
            <button className={btn} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--line-2)' }} onClick={decline}>
              Nu niet
            </button>
            <button className={btn} style={btnGrad} onClick={() => void accept()}>
              <Video size={15} /> Binnenlaten
            </button>
          </div>
        </div>
      )}
      {(s.status === 'uitgaand' || s.status === 'verbinden') && (
        <div className="pointer-events-auto fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-4 py-3" style={glass}>
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-cyan" />
          <span className="text-[13px] text-hi">{s.status === 'uitgaand' ? `Je klopt aan bij ${peer}…` : 'Verbinden… Sta camera en microfoon toe als je browser het vraagt.'}</span>
          <button className={btn} style={{ background: '#c0392b' }} onClick={() => hangup()}>
            <PhoneOff size={14} />
          </button>
        </div>
      )}
      {s.status === 'verbonden' && (
        <div className="pointer-events-auto fixed bottom-6 right-6 z-50 w-[420px] overflow-hidden rounded-3xl" style={glass}>
          <div className="relative aspect-video bg-black">
            <VideoEl stream={s.remote} className="h-full w-full object-cover" />
            <div className="absolute bottom-2 right-2 h-[84px] w-[150px] overflow-hidden rounded-xl border border-white/20 bg-black">
              <VideoEl stream={s.local} muted className="h-full w-full object-cover" />
            </div>
            <div className="absolute left-3 top-3 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-white" style={{ background: 'rgba(0,0,0,.45)' }}>
              In gesprek met {peer}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 p-3">
            <button className={btn} style={{ background: 'rgba(255,255,255,0.08)' }} onClick={toggleMute} title="Microfoon">
              {s.muted ? <MicOff size={15} /> : <Mic size={15} />}
            </button>
            <button className={btn} style={{ background: 'rgba(255,255,255,0.08)' }} onClick={toggleCam} title="Camera">
              {s.camOff ? <VideoOff size={15} /> : <Video size={15} />}
            </button>
            <button className={btn} style={{ background: '#c0392b' }} onClick={() => hangup()}>
              <PhoneOff size={15} /> Ophangen
            </button>
          </div>
          {s.zonderCamera && <div className="px-4 pb-3 text-center text-[11px] text-dim">Geen camera gevonden: de ander ziet je naamkaartje.</div>}
        </div>
      )}
    </>
  );
}

/** Start rondlopen: in de gekozen ruimte, anders buiten voor de voordeur. */
function startWalk() {
  const { level } = ui.get();
  const f = floors.find((x) => x.level === level);
  ui.set({ walk: true, walkPaused: false, walkDrag: false, walkSpot: f?.id ?? '-1', focus: null });
  vraagMuis();
}

function stopWalk() {
  stopSpel();
  const { walkSpot } = ui.get();
  ui.set({ walk: false, walkPaused: false, walkDrag: false });
  ui.go(floors.find((x) => x.id === walkSpot.split('#')[0])?.level ?? -1);
}

/** Terwijl je rondloopt: enkel de naam van de plek, een stipje in het midden en wat de toetsen doen. Esc opent het menu. */
function WalkHud() {
  const room = useUi((s) => s.walkRoom);
  const paused = useUi((s) => s.walkPaused);
  const drag = useUi((s) => s.walkDrag);
  const hint = useUi((s) => s.walkHint);
  const spel = useUi((s) => s.spel);
  const view = useUi((s) => s.walkView);
  const melding = useUi((s) => s.walkMelding);
  const tegen = useSpel((s) => s.tegen);
  const zij = useSpel((s) => s.zij);
  const score = useSpel((s) => s.score);
  const tekst = useSpel((s) => s.tekst);
  const hulp = useSpel((s) => s.hulp);
  useEffect(() => {
    if (!melding) return;
    const t = setTimeout(() => ui.set({ walkMelding: '' }), 4000);
    return () => clearTimeout(t);
  }, [melding]);
  const hintTekst = hint === 'pingpong' ? 'E = pingpong spelen' : hint === 'pool' ? 'E = pool spelen' : hint.startsWith('bel:') ? `T = videocall met ${nameOf(hint.slice(4))}` : '';
  const spring = (id: string) => {
    ui.set({ walkSpot: `${id}#${Date.now()}` });
    vraagMuis();
  };
  return (
    <>
      <div className="pointer-events-none fixed left-1/2 top-4 z-30 -translate-x-1/2 rounded-full px-4 py-1.5 text-[13px] font-semibold text-white" style={glass}>
        {spel ? (
          <span>
            {spel === 'pingpong' ? `Jij ${score[zij]} - ${score[zij === 0 ? 1 : 0]} ${naamVan(tegen)}` : `Pool tegen ${naamVan(tegen)}`}
          </span>
        ) : (
          room || 'EM Launchpad HQ'
        )}
      </div>
      {spel && tekst && (
        <div className="pointer-events-none fixed left-1/2 top-16 z-30 -translate-x-1/2 rounded-full px-4 py-1.5 text-[14px] font-semibold text-white" style={glass}>
          {tekst}
        </div>
      )}
      {!spel && !paused && (hintTekst || melding) && (
        <div className="pointer-events-none fixed bottom-14 left-1/2 z-30 -translate-x-1/2 rounded-full px-4 py-2 text-[14px] font-semibold text-white" style={{ ...glass, border: '1px solid rgba(47,240,166,.55)' }}>
          {melding || hintTekst}
        </div>
      )}
      {!paused && !spel && view === 'eerste' && <div className="pointer-events-none fixed left-1/2 top-1/2 z-30 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: 'rgba(255,255,255,.75)', boxShadow: '0 0 3px rgba(0,0,0,.8)' }} />}
      {!paused && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-mid" style={glass}>
          {spel ? hulp : `ZQSD of pijltjes = stappen · Shift = rennen · ${drag ? 'slepen' : 'muis'} = kijken · V = eigen ogen of over de schouder · Esc = menu`}
        </div>
      )}
      {drag && !paused && (
        <button className="pointer-events-auto fixed right-4 top-4 z-30 rounded-full px-3 py-1.5 text-[12px] text-mid hover:text-white" style={glass} onClick={() => ui.set({ walkPaused: true })}>
          Menu
        </button>
      )}
      {paused && (
        <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(6,8,12,0.45)' }}>
          <div className="w-[420px] rounded-3xl p-6" style={glass}>
            <h2 className="text-[22px] font-extrabold leading-tight text-white">
              Rondlopen in het <span className="grad-text">HQ</span>
            </h2>
            <p className="mt-1 text-[13px] text-mid">Je staat nu op: {room || 'buiten'}. Ga verder of spring naar een ruimte.</p>
            <button className={`${btn} mt-4 w-full`} style={btnGrad} onClick={vraagMuis}>
              <Footprints size={15} /> Verder wandelen
            </button>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <button className="rounded-lg px-3 py-1.5 text-left text-[12.5px] text-hi hover:bg-white/5" onClick={() => spring('-1')}>
                Buiten, voor de deur
              </button>
              {floors.map((f) => (
                <button key={f.id} className="rounded-lg px-3 py-1.5 text-left text-[12.5px] text-hi hover:bg-white/5" onClick={() => spring(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            <button className="mt-3 w-full text-center text-[12px] text-dim hover:text-hi" onClick={stopWalk}>
              Terug naar het bovenaanzicht
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function useKeys() {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const { level, walk, walkPaused, walkDrag } = ui.get();
      if (walk) {
        // Aan een speltafel: Esc stopt het spel en je loopt verder.
        if (ui.get().spel) {
          if (e.key === 'Escape') {
            stopSpel();
            vraagMuis();
          }
          return;
        }
        // Met vergrendelde muis haalt de browser zelf de muis terug bij Esc; daarna sluit Esc het menu.
        if (e.key === 'Escape') {
          if (walkPaused) stopWalk();
          else if (walkDrag) ui.set({ walkPaused: true });
        }
        return;
      }
      if (e.code === 'KeyF') return startWalk();
      if (e.key === 'ArrowUp') ui.go(Math.min(floors.length - 1, level + 1));
      else if (e.key === 'ArrowDown') ui.go(Math.max(-1, level - 1));
      else if (e.key === 'Escape') ui.go(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
}

export default function HQApp() {
  useEffect(() => {
    startHqData();
    void startPresence();
    const prev = document.title;
    document.title = 'EM Launchpad HQ';
    return () => {
      document.title = prev;
    };
  }, []);
  useKeys();
  const level = useUi((s) => s.level);
  const taken = useHq((s) => s.taken);
  const byOwner = useMemo(() => tasksByOwner(taken), [taken]);
  const floor = floors.find((f) => f.level === level);
  const [ready, setReady] = useState(false);
  const walk = useUi((s) => s.walk);

  return (
    <div className="fixed inset-0 z-10" style={{ background: '#cfe2ef' }}>
      <div data-hq-canvas className="absolute inset-0" style={{ filter: 'saturate(1.1) contrast(1.06)' }}>
        <HqScene onReady={() => setReady(true)} />
      </div>
      {/* Zacht vignet, zoals een foto */}
      <div className="pointer-events-none absolute inset-0 z-[15]" style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(6,8,12,0.38) 100%)' }} />
      {!ready && (
        <div className="pointer-events-none fixed inset-0 z-30 flex flex-col items-center justify-center gap-3" style={{ background: 'linear-gradient(180deg, #0b1526, #06080c)' }}>
          <Logo src={config.company.logo} size={52} />
          <div className="text-[18px] font-extrabold text-white">Het HQ wordt opgebouwd</div>
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-dim">Gebouw, licht en team klaarzetten · eerste keer even geduld</div>
          <div className="mt-2 h-1 w-48 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div className="h-full w-1/2 animate-pulse rounded-full" style={{ background: 'var(--grad)' }} />
          </div>
        </div>
      )}

      {walk && <WalkHud />}
      <div className="pointer-events-none fixed inset-0 z-20" style={{ display: walk ? 'none' : undefined }}>
        {/* Merk en bron */}
        <div className="pointer-events-auto absolute left-4 top-4 flex items-center gap-3 rounded-2xl px-3.5 py-2.5" style={glass}>
          <Logo src={config.company.logo} size={34} />
          <div>
            <div className="text-[15px] font-extrabold leading-tight text-white">
              EM Launchpad <span className="grad-text">HQ</span>
            </div>
            <SourceChip />
          </div>
        </div>

        <div className="pointer-events-auto absolute right-4 top-4 flex items-center gap-2">
          <button className={btn} style={btnGrad} onClick={startWalk} title="Loop als mens door het gebouw (toets F)">
            <Footprints size={14} /> Rondlopen
          </button>
          <MeldingenKnop />
          <WhoAmI />
          {/* In de losse versie (repo HQ, online) is er geen organigram om naar terug te gaan. */}
          {!import.meta.env.VITE_HQ_LOS && (
            <a href="#/" className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-mid hover:text-white" style={glass}>
              <ArrowLeft size={13} /> Organigram
            </a>
          )}
        </div>

        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <Elevator byOwner={byOwner} />
        </div>

        {/* Infopaneel */}
        <div className="pointer-events-auto absolute bottom-4 left-4 top-[84px] flex w-[380px] flex-col overflow-hidden rounded-3xl" style={glass}>
          <div className="border-b px-5 pb-3 pt-4" style={{ borderColor: 'var(--line)' }}>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-dim">
              {floor ? `Ruimte ${String(floor.level + 1).padStart(2, '0')} / ${String(floors.length).padStart(2, '0')}${floor.offices.length ? ' · tussenverdieping' : ''}` : 'Buiten · het perceel'}
            </div>
            <h1 className="mt-1 text-[22px] font-extrabold leading-tight text-white">{floor ? floor.label : 'Het hoofdkantoor'}</h1>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{floor?.lounge ? <SpacePanel kind="lounge" /> : floor?.studio ? <SpacePanel kind="studio" /> : floor?.kitchen ? <SpacePanel kind="kitchen" /> : floor ? <FloorPanel floor={floor} byOwner={byOwner} /> : <Overview byOwner={byOwner} />}</div>
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-mid" style={glass}>
          Slepen = draaien · rechtsklik = schuiven · scrollen = zoomen · pijltjes = volgende ruimte · Esc = buiten · F = rondlopen
        </div>
      </div>

      {!walk && <Welcome />}
      <CallUi />
      <VerlopenBalk />
    </div>
  );
}
