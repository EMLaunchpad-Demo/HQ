// Het virtuele hoofdkantoor (#/hq): het gebouw in 3D met daarover de interface.
// Kijken en navigeren; chatten met de agents gebeurt in Claude, niet hier.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Building2, ChevronDown, ExternalLink, Mic, MicOff, PhoneCall, PhoneOff, Video, VideoOff } from 'lucide-react';
import { config, fileUrl } from '../config';
import { Logo } from '../components/Logo';
import { HqScene } from './Scene';
import { floors, humans, isBusy, isOpen, isOverdue, progress, startHqData, tasksByOwner, useHq, warRoomTasks, type FloorModel, type HqTaak, type Occupant } from './model';
import { ui, useUi } from './ui';
import { accept, call, connectPresence, decline, hangup, nameOf, setMe, toggleCam, toggleMute, useCall } from './call';
import { moodOf } from './world/Warehouse';
import { MOOD_COLOR, type Mood } from './world/Character';

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

function MoodChip({ mood }: { mood: Mood }) {
  return (
    <span className="label inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider" style={{ background: 'rgba(255,255,255,0.06)', color: MOOD_COLOR[mood] }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: MOOD_COLOR[mood], boxShadow: `0 0 8px ${MOOD_COLOR[mood]}` }} />
      {MOOD_LABEL[mood]}
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
    <a href={t.url} target="_blank" rel="noreferrer" className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5">
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

function PersonBlock({ o, tasks, roles, focus }: { o: Occupant; tasks: HqTaak[]; roles?: Occupant[]; focus: string | null }) {
  const live = useHq((s) => s.live[o.id]);
  const mood = moodOf(tasks, live);
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
            <MoodChip mood={mood} />
          </div>
          <div className="truncate text-[12px] text-mid">{o.title}</div>
        </div>
      </div>
      {live && (
        <div className="mt-2 rounded-lg px-2.5 py-1.5 text-[12px] text-hi" style={{ background: 'rgba(47,240,166,0.08)' }}>
          <span className="font-mono text-[10px] uppercase tracking-wider text-mint">{live.done ? 'Net klaar' : 'Nu live'} · </span>
          {live.done ?? live.task}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-dim">
        <span>{p.busy} bezig · {p.open} open · {p.done} klaar</span>
        <span>{p.pct}%</span>
      </div>
      <div className="mt-1.5">
        <Bar pct={p.pct} />
      </div>
      <div className="mt-2 -mx-1">
        {shown.length === 0 && <div className="px-2 py-1 text-[12px] text-dim">Geen open taken in Notion.</div>}
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
            title={!me ? 'Meld je eerst aan' : !online ? `${o.name} is niet in het HQ` : ''}
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

function LoungePanel() {
  const zones: [string, string][] = [
    ['Biljart en pingpong', 'Beneden in de arena: pooltafel onder een hanglamp, en een pingpongtafel.'],
    ['Gaming room', 'Boven links: groot scherm, gamingstoelen, sofa en een arcadekast.'],
    ['Salon en bar', 'Boven rechts: bank, lederen fauteuils, open haard en een bar.'],
    ['Parking', 'Naast het HQ: vijf bedrijfswagens in de huisstijl van EM Launchpad, elk met een laadpaal.'],
  ];
  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-mid">De plek om even te ontspannen, samen te komen of klanten te ontvangen, midden in het HQ.</p>
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
  const bijgewerkt = useHq((s) => s.bijgewerkt);
  const tijd = bijgewerkt ? new Date(bijgewerkt).toLocaleString('nl-BE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const [c, t] =
    bron === 'notion' ? ['#2ff0a6', `Live uit Notion · ${tijd}`] : bron === 'momentopname' ? ['#ffd23f', `Notion-momentopname · ${tijd}`] : bron === 'laden' ? ['#7c8a97', 'Taken laden…'] : ['#ff8a6a', 'Geen taken gevonden'];
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-mid">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
      {t}
    </span>
  );
}

function WhoAmI() {
  const me = useCall((s) => s.me);
  const [open, setOpen] = useState(false);
  if (!me) return null;
  return (
    <div className="relative">
      <button className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] text-hi" style={glass} onClick={() => setOpen((x) => !x)}>
        <span className="h-1.5 w-1.5 rounded-full bg-mint" /> Je bent {nameOf(me)} <ChevronDown size={13} />
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

function Welcome() {
  const me = useCall((s) => s.me);
  const [skip, setSkip] = useState(false);
  if (me || skip) return null;
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
          Enkel rondkijken
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

function useKeys() {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const { level } = ui.get();
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
    connectPresence();
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

  return (
    <div className="fixed inset-0 z-10" style={{ background: '#cfe2ef' }}>
      <div className="absolute inset-0" style={{ filter: 'saturate(1.1) contrast(1.06)' }}>
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

      <div className="pointer-events-none fixed inset-0 z-20">
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
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{floor?.lounge ? <LoungePanel /> : floor ? <FloorPanel floor={floor} byOwner={byOwner} /> : <Overview byOwner={byOwner} />}</div>
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-mid" style={glass}>
          Slepen = draaien · rechtsklik = schuiven · scrollen = zoomen · pijltjes = volgende ruimte · Esc = buiten
        </div>
      </div>

      <Welcome />
      <CallUi />
    </div>
  );
}
