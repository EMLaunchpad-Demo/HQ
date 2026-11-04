// Videocall tussen de founders in het HQ: WebRTC rechtstreeks van pc naar pc (gratis).
// Lokaal geeft de dev-server (server/hq.ts) de berichtjes door, online het Durable Object "Kantoor" (hq-cloud/).
// Wie je bent: online uit de login (GET /hq/ik, Cloudflare Access), lokaal kies je het zelf
// (onthouden in localStorage, of ?ik=<id> in de link).
import { useSyncExternalStore } from 'react';
import { hqStore, humans, loginVerlopen, meldVerlopen } from './model';
import { startBel, stopBel } from './bel';

export type CallStatus = 'idle' | 'uitgaand' | 'inkomend' | 'verbinden' | 'verbonden';

interface CallState {
  me: string | null;
  status: CallStatus;
  peer: string | null;
  local: MediaStream | null;
  remote: MediaStream | null;
  muted: boolean;
  camOff: boolean;
  /** Korte melding voor de interface (bv. "Martijn neemt niet op"). */
  melding: string | null;
  /** Geen echte camera gevonden: we sturen een naamkaartje als beeld. */
  zonderCamera: boolean;
}

/**
 * Twee manieren om de berichtjes door te geven:
 * - lokaal (npm run dev): live-stroom + POST via de dev-server (server/hq.ts);
 * - online (gebouwde app op Cloudflare, zie hq-cloud/): één WebSocket naar het "kantoor".
 */
const ONLINE = import.meta.env.PROD;
/** Lokaal kies je zelf wie je bent (naamkiezer); online komt dat enkel uit de login. */
export const ZELF_KIEZEN = !ONLINE;

const KEY = 'hq-ik';
const ID_RE = /^[a-z0-9-]{1,40}$/;
const urlIk = new URLSearchParams(location.search).get('ik');
/**
 * Om de online versie lokaal te testen (wrangler dev zonder login) gaat ?ik= uit de link mee naar de Worker.
 * Online negeert de Worker het: daar telt enkel de login.
 */
const IK_QUERY = urlIk && ID_RE.test(urlIk) ? `?ik=${urlIk}` : '';
const stored = (() => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
})();
const initialMe = ONLINE ? null : ([urlIk, stored].find((x) => x && humans.some((h) => h.id === x)) ?? null);

let state: CallState = { me: initialMe, status: 'idle', peer: null, local: null, remote: null, muted: false, camOff: false, melding: null, zonderCamera: false };
const subs = new Set<() => void>();
const set = (p: Partial<CallState>) => {
  const vorig = state.status;
  state = { ...state, ...p };
  // Bellen zolang er een oproep binnenkomt, op één plek: zo stopt het ook bij elke manier van eindigen.
  if (state.status === 'inkomend' && vorig !== 'inkomend') startBel(nameOf(state.peer));
  else if (state.status !== 'inkomend' && vorig === 'inkomend') stopBel();
  subs.forEach((f) => f());
};
export const callStore = { get: () => state, subscribe: (f: () => void) => (subs.add(f), () => subs.delete(f)) };
export function useCall<T>(sel: (s: CallState) => T): T {
  return useSyncExternalStore(callStore.subscribe, () => sel(state));
}

const nameOf = (id: string | null) => humans.find((h) => h.id === id)?.name ?? id ?? '';

let noteTimer: ReturnType<typeof setTimeout> | undefined;
function note(melding: string | null, ms = 6000) {
  clearTimeout(noteTimer);
  set({ melding });
  if (melding) noteTimer = setTimeout(() => set({ melding: null }), ms);
}

// --- Berichten (signalering) ---

const SOORTEN = ['bellen', 'aanvaard', 'aanbod', 'antwoord', 'ice', 'geweigerd', 'bezet', 'ophangen', 'elders'] as const;
type Soort = (typeof SOORTEN)[number];

interface Bericht {
  van: string;
  /** Het tabblad (sessie) dat het stuurde, gezet door het kantoor (online) of de dev-server (lokaal). */
  vanSid: string | null;
  soort: Soort;
  data: unknown;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isId = (x: unknown): x is string => typeof x === 'string' && humans.some((h) => h.id === x);

function leesJson(raw: unknown): unknown {
  if (typeof raw !== 'string' || raw.length > 256_000) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Enkel gekende soorten van een gekende collega; de rest negeren we. */
function leesBericht(x: unknown): Bericht | null {
  if (!isObj(x) || typeof x.soort !== 'string') return null;
  const soort = SOORTEN.find((s) => s === x.soort);
  if (!soort) return null;
  const van = typeof x.van === 'string' ? x.van : '';
  // "elders" komt van het kantoor zelf (een ander tabblad nam op), soms zonder afzender.
  if (soort !== 'elders' && !isId(van)) return null;
  const vanSid = typeof x.vanSid === 'string' && x.vanSid.length <= 64 ? x.vanSid : null;
  return { van, vanSid, soort, data: x.data ?? null };
}

const MAX_SDP = 60_000;
/** Een aanbod of antwoord zoals de browser het maakt; anders niet naar setRemoteDescription. */
function alsSdp(x: unknown, type: 'offer' | 'answer'): RTCSessionDescriptionInit | null {
  if (!isObj(x) || x.type !== type || typeof x.sdp !== 'string') return null;
  if (x.sdp.length > MAX_SDP || !x.sdp.startsWith('v=0')) return null;
  return { type, sdp: x.sdp };
}

/** Een ICE-kandidaat zoals RTCIceCandidate.toJSON() hem geeft; anders niet naar addIceCandidate. */
function alsIce(x: unknown): RTCIceCandidateInit | null {
  if (!isObj(x) || typeof x.candidate !== 'string' || x.candidate.length > 2000) return null;
  const mid = x.sdpMid ?? null;
  const index = x.sdpMLineIndex ?? null;
  const frag = x.usernameFragment ?? null;
  if (mid !== null && (typeof mid !== 'string' || mid.length > 64)) return null;
  if (index !== null && (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > 63)) return null;
  if (frag !== null && (typeof frag !== 'string' || frag.length > 256)) return null;
  if (mid === null && index === null) return null;
  return { candidate: x.candidate, sdpMid: mid, sdpMLineIndex: index, usernameFragment: frag };
}

const SID_RE = /^[A-Za-z0-9-]{8,64}$/;

let es: EventSource | null = null;
/**
 * De sid van de laatste verbinding van dit tabblad (event "welkom" van het kantoor of de dev-server).
 * Lokaal gaat ze mee in elke POST (vanSid); bij een herverbinding gaat ze mee als ?vorige=, zodat het kantoor het
 * lopende gesprek aan de nieuwe verbinding koppelt. Blijft daarom staan als de verbinding wegvalt.
 */
let mijnSid: string | null = null;
let ws: WebSocket | null = null;
let wsRetry: ReturnType<typeof setTimeout> | undefined;
let wsPing: ReturnType<typeof setInterval> | undefined;
/** Mislukte pogingen na elkaar, voor de wachttijd (1 s → 30 s). */
let pogingen = 0;
let wachtOpnieuw = false;
/** Laatste teken van leven van het kantoor (elk bericht, ook "pong"). */
let laatstGehoord = 0;

let pc: RTCPeerConnection | null = null;
let pendingIce: RTCIceCandidateInit[] = [];
/** Een aanbod dat binnenkwam terwijl camera en microfoon nog gevraagd werden (na "aanvaard", zie accept). */
let wachtendAanbod: RTCSessionDescriptionInit | null = null;
/** Belde ik (dan maak ik de aanbiedingen), of nam ik op? */
let ikBel = false;
/** Wanneer de beller het laatst een ICE-herstart begon (zodat ICE de tijd krijgt om terug te komen). */
let laatsteHerstart = 0;
/**
 * Het tabblad (de verbinding) van de ander in dit gesprek. Andere tabbladen van die persoon mogen het gesprek niet
 * storen. Verbindt de ander opnieuw, dan meldt het kantoor de nieuwe sid met "verhuisd".
 */
let peerSid: string | null = null;
/**
 * Telt op bij elk nieuw gesprek en bij elk ophangen. Komt een camera of een antwoord binnen voor een gesprek
 * dat intussen voorbij is, dan herkennen we het daaraan (en zetten we de camera meteen weer uit).
 */
let gesprek = 0;
let ice: Promise<RTCIceServer[]> | null = null;
let ringTimer: ReturnType<typeof setTimeout> | undefined;
let verbindTimer: ReturnType<typeof setTimeout> | undefined;
let iceTimer: ReturnType<typeof setInterval> | undefined;

async function post(naar: string, soort: Soort, data: unknown = null, naarSid: string | null = peerSid) {
  if (ONLINE) {
    if (ws?.readyState !== WebSocket.OPEN) return false;
    if (soort === 'bellen' && !hqStore.get().online.includes(naar)) return false;
    try {
      ws.send(JSON.stringify({ naar, soort, data, ...(naarSid ? { naarSid } : {}) }));
      return true;
    } catch {
      return false;
    }
  }
  const r = await fetch('/hq/signaal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ van: state.me, naar, soort, data, ...(mijnSid ? { vanSid: mijnSid } : {}), ...(naarSid ? { naarSid } : {}) }),
  }).catch(() => null);
  return !!r?.ok;
}

// --- Wie ben je, en aanwezig zijn ---

/** Online: wie ben je volgens de login? 'verlopen' = niet (meer) ingelogd, 'fout' = even geen verbinding. */
async function vraagIk(): Promise<string | 'verlopen' | 'fout'> {
  try {
    // Met een tijdslimiet: een verzoek dat blijft hangen (na slaapstand) mag het herverbinden niet blokkeren.
    const r = await fetch(`/hq/ik${IK_QUERY}`, { redirect: 'manual', cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (loginVerlopen(r)) return 'verlopen';
    if (!r.ok) return 'fout';
    const d: unknown = await r.json();
    return isObj(d) && typeof d.wie === 'string' && ID_RE.test(d.wie) ? d.wie : 'fout';
  } catch {
    return 'fout';
  }
}

/** Lokaal: zelf kiezen wie je bent. Online kan dat niet, daar telt de login. */
export function setMe(id: string) {
  if (!ZELF_KIEZEN) return;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* privévenster */
  }
  hangup(false);
  set({ me: id });
  mijnSid = null; // iemand anders: geen herverbinding van het vorige tabblad
  connectPresence();
}

/** Aanmelden in het HQ bij het openen: online eerst vragen wie je bent, daarna verbinden. */
export async function startPresence() {
  if (!ONLINE || state.me) return connectPresence();
  if (hqStore.get().verlopen) return;
  const ik = await vraagIk();
  if (ik === 'verlopen') return meldVerlopen();
  if (ik === 'fout') return planOpnieuw();
  pogingen = 0;
  set({ me: ik });
  connectPresence();
}

/** Opnieuw proberen met een oplopende wachttijd (1 s → 30 s, met wat willekeur), nooit na een verlopen login. */
function planOpnieuw() {
  clearTimeout(wsRetry);
  if (hqStore.get().verlopen) return;
  const basis = Math.min(30_000, 1000 * 2 ** Math.min(pogingen, 5));
  pogingen++;
  wachtOpnieuw = true;
  wsRetry = setTimeout(opnieuwNu, basis * (0.75 + Math.random() * 0.5));
}

function opnieuwNu() {
  clearTimeout(wsRetry);
  wachtOpnieuw = false;
  if (state.me) connectPresence();
  else void startPresence();
}

function sluitVerbinding() {
  es?.close();
  es = null;
  clearTimeout(wsRetry);
  clearInterval(wsPing);
  wachtOpnieuw = false;
  if (ws) {
    const oud = ws;
    ws = null;
    oud.onopen = null;
    oud.onmessage = null;
    oud.onclose = null;
    try {
      oud.close();
    } catch {
      /* al dicht */
    }
  }
}

/**
 * Het adres van /hq/signaal. Na een herverbinding met de vorige sid van dit tabblad, en in een gesprek ook met wie
 * en met welk tabblad: zo koppelt het kantoor het gesprek terug (bijVerbinden in kantoor-logica.js).
 */
function signaalAdres(): string {
  const q = new URLSearchParams();
  if (!ONLINE && state.me) q.set('wie', state.me);
  if (IK_QUERY && urlIk) q.set('ik', urlIk);
  if (mijnSid) {
    q.set('vorige', mijnSid);
    if ((state.status === 'verbinden' || state.status === 'verbonden') && state.peer && peerSid) {
      q.set('peer', state.peer);
      q.set('peerSid', peerSid);
    }
  }
  const s = q.toString();
  return `/hq/signaal${s ? `?${s}` : ''}`;
}

function connectPresence() {
  sluitVerbinding();
  if (!state.me || hqStore.get().verlopen) return;
  if (ONLINE) return openSocket();
  const source = new EventSource(signaalAdres());
  es = source;
  source.addEventListener('welkom', (m) => {
    if (es === source) opWelkom(leesJson((m as MessageEvent).data));
  });
  source.addEventListener('verhuisd', (m) => opVerhuisd(leesJson((m as MessageEvent).data)));
  source.addEventListener('aanwezig', (m) => zetAanwezig(leesJson((m as MessageEvent).data)));
  source.addEventListener('bericht', (m) => {
    const b = leesBericht(leesJson((m as MessageEvent).data));
    if (b) void onMessage(b);
  });
}

function openSocket() {
  const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${signaalAdres()}`);
  ws = sock;
  let geopend = 0;
  /** Verbinding opgeven en opnieuw beginnen (zonder op de browser te wachten). */
  const opgeven = () => {
    if (ws !== sock) return;
    if (geopend && Date.now() - geopend > 10_000) pogingen = 0;
    sluitVerbinding();
    planOpnieuw();
  };
  sock.onopen = () => {
    geopend = laatstGehoord = Date.now();
    clearInterval(wsPing);
    // Hartslag: het kantoor antwoordt "pong" zonder wakker te worden. Zo blijft de verbinding open, en
    // merken we een half-open verbinding (na slaapstand of wifi-wissel) op.
    wsPing = setInterval(() => {
      if (ws !== sock || sock.readyState !== WebSocket.OPEN) return;
      if (Date.now() - laatstGehoord > 90_000) return opgeven();
      try {
        sock.send('ping');
      } catch {
        opgeven();
      }
    }, 25_000);
  };
  sock.onmessage = (m) => {
    laatstGehoord = Date.now();
    if (m.data === 'pong') return;
    onSocketBericht(leesJson(m.data));
  };
  sock.onclose = (e) => {
    if (ws !== sock) return;
    clearInterval(wsPing);
    ws = null;
    // 4000: het kantoor sloot dit tabblad, omdat het HQ in te veel tabbladen open staat. Niet opnieuw verbinden.
    if (e.code === 4000) return note('Het HQ staat in te veel tabbladen open. Dit tabblad is losgekoppeld: herlaad het om opnieuw te verbinden.', 20_000);
    if (geopend && Date.now() - geopend > 10_000) pogingen = 0;
    // 4001: de login van deze verbinding is verlopen. Lukt het verbinden herhaald niet, kijk dan ook of de login
    // verlopen is (een WebSocket toont de 401 zelf niet).
    if (e.code === 4001 || (!geopend && pogingen >= 1)) {
      void vraagIk().then((ik) => (ik === 'verlopen' ? meldVerlopen() : planOpnieuw()));
      return;
    }
    planOpnieuw();
  };
}

/** Terug in het tabblad of weer internet: niet wachten, meteen opnieuw verbinden. */
function wakker() {
  if (document.hidden || !wachtOpnieuw || hqStore.get().verlopen) return;
  pogingen = 0;
  opnieuwNu();
}
window.addEventListener('online', wakker);
document.addEventListener('visibilitychange', wakker);

/**
 * Het kantoor kent dit tabblad nu onder `sid`. Na een herverbinding vertelt het ook of de oproep nog loopt:
 * `belt` = wie dit tabblad nog belt, `oproepen` = wie mij nog belt. Wat niet meer loopt, stopt hier ook.
 */
function opWelkom(x: unknown) {
  if (!isObj(x) || typeof x.sid !== 'string' || !SID_RE.test(x.sid)) return;
  mijnSid = x.sid;
  const oproepen = Array.isArray(x.oproepen) ? x.oproepen.filter(isId) : [];
  const belt = isId(x.belt) ? x.belt : null;
  if (state.status === 'inkomend' && state.peer && !oproepen.includes(state.peer)) {
    const wie = nameOf(state.peer);
    cleanup();
    note(`Gemiste oproep van ${wie}.`);
  } else if (state.status === 'uitgaand' && belt !== state.peer) {
    cleanup();
    note('De verbinding met het HQ was even weg. Bel opnieuw.');
  } else if (state.status === 'verbinden' || state.status === 'verbonden') herstelNu();
}

/** Het tabblad van de ander is opnieuw verbonden (nieuwe sid): voortaan naar die verbinding sturen. */
function opVerhuisd(x: unknown) {
  if (!isObj(x) || !state.peer || x.wie !== state.peer || x.oud !== peerSid || typeof x.nieuw !== 'string' || !SID_RE.test(x.nieuw)) return;
  peerSid = x.nieuw;
  herstelNu();
}

function onSocketBericht(x: unknown) {
  if (!isObj(x)) return;
  if (x.event === 'aanwezig') return zetAanwezig(x.data);
  if (x.event === 'welkom') return opWelkom(x.data);
  if (x.event === 'verhuisd') return opVerhuisd(x.data);
  if (x.event === 'niet-online') {
    const d = isObj(x.data) ? x.data : {};
    const naar = typeof d.naar === 'string' ? d.naar : null;
    if (!naar || naar !== state.peer) return;
    // Enkel als de oproep zelf niet aankwam. Een aanbod of ICE-berichtje terwijl de ander even herverbindt, gaat
    // opnieuw na "verhuisd"; is de ander echt weg, dan stopt zetAanwezig het gesprek.
    if ((state.status === 'uitgaand' || state.status === 'verbinden') && (d.soort === 'bellen' || d.soort === 'aanvaard')) {
      cleanup();
      note(`${nameOf(naar)} is nu niet in het HQ.`);
    }
    return;
  }
  // Gewoon een bericht van een collega, of iets rechtstreeks van het kantoor (bv. {"soort":"elders"}).
  const b = leesBericht(x.event === 'bericht' ? x.data : x);
  if (b) void onMessage(b);
}

function zetAanwezig(x: unknown) {
  if (!Array.isArray(x)) return;
  const online = x.filter(isId);
  if (online.join() !== hqStore.get().online.join()) hqStore.set({ online });
  // Is de ander weg terwijl het belt of verbindt (tabblad dicht), dan niet blijven hangen.
  if (state.peer && !online.includes(state.peer) && (state.status === 'inkomend' || state.status === 'uitgaand' || state.status === 'verbinden')) {
    const wie = nameOf(state.peer);
    cleanup();
    note(`${wie} is nu niet in het HQ.`);
  }
}

// --- Camera en microfoon ---

/** Timers van de naamkaartjes, per stream (zodat een laat kaartje nooit de timer van een nieuw gesprek stopt). */
const kaartTimers = new WeakMap<MediaStream, ReturnType<typeof setInterval>>();

/** Camera en microfoon echt uit (het lampje gaat uit). */
function stopMedia(s: MediaStream | null) {
  if (!s) return;
  s.getTracks().forEach((t) => t.stop());
  clearInterval(kaartTimers.get(s));
  kaartTimers.delete(s);
}

/** Naamkaartje als videobeeld, als er geen camera is (of geen toestemming). */
function nameCardStream(): MediaStream {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 360;
  const g = c.getContext('2d')!;
  const who = nameOf(state.me);
  const draw = () => {
    const t = Date.now() / 1000;
    const grad = g.createLinearGradient(0, 0, 640, 360);
    grad.addColorStop(0, '#0b1526');
    grad.addColorStop(1, '#111825');
    g.fillStyle = grad;
    g.fillRect(0, 0, 640, 360);
    const ring = g.createLinearGradient(220, 0, 420, 0);
    ring.addColorStop(0, '#2f7bff');
    ring.addColorStop(0.48, '#13c7e6');
    ring.addColorStop(1, '#2ff0a6');
    g.strokeStyle = ring;
    g.lineWidth = 6;
    g.beginPath();
    g.arc(320, 160, 70 + Math.sin(t * 2) * 3, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = '700 64px Archivo, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(who.slice(0, 1).toUpperCase(), 320, 164);
    g.font = '500 26px Archivo, sans-serif';
    g.fillText(who, 320, 280);
    g.fillStyle = '#7c8a97';
    g.font = '500 16px "JetBrains Mono", monospace';
    g.fillText('CAMERA UIT', 320, 316);
  };
  draw();
  const s = c.captureStream(10);
  kaartTimers.set(s, setInterval(draw, 100));
  return s;
}

/** Een toestemmingsvraag die niemand beantwoordt, mag de call niet blokkeren. Komt de camera daarna toch, dan meteen weer uit. */
function mediaMetTimeout(p: Promise<MediaStream>, ms: number): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    let klaar = false;
    const t = setTimeout(() => {
      klaar = true;
      reject(new Error('timeout'));
    }, ms);
    p.then(
      (s) => {
        if (klaar) return stopMedia(s);
        klaar = true;
        clearTimeout(t);
        resolve(s);
      },
      (e) => {
        if (klaar) return;
        klaar = true;
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Camera en microfoon, of het naamkaartje (met microfoon als dat wel lukt). Faalt nooit. */
async function getMedia(): Promise<MediaStream> {
  try {
    return await mediaMetTimeout(
      navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: { echoCancellation: true, noiseSuppression: true } }),
      20_000,
    );
  } catch {
    const card = nameCardStream();
    try {
      const mic = await mediaMetTimeout(navigator.mediaDevices.getUserMedia({ audio: true }), 5_000);
      mic.getAudioTracks().forEach((t) => card.addTrack(t));
    } catch {
      /* ook geen microfoon: dan enkel beeld */
    }
    return card;
  }
}

// --- ICE-servers (STUN, en TURN als de Worker dat heeft) ---

/** Terugval: enkel STUN van Cloudflare (nooit van Google). */
const STUN: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];

function leesIceServers(x: unknown): RTCIceServer[] {
  if (!Array.isArray(x)) return [];
  const uit: RTCIceServer[] = [];
  for (const s of x.slice(0, 8)) {
    if (!isObj(s)) continue;
    const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u): u is string => typeof u === 'string' && /^(stun|turns?):/.test(u));
    if (!urls.length) continue;
    const server: RTCIceServer = { urls };
    if (typeof s.username === 'string') server.username = s.username;
    if (typeof s.credential === 'string') server.credential = s.credential;
    uit.push(server);
  }
  return uit;
}

async function haalIce(): Promise<RTCIceServer[]> {
  try {
    const r = await fetch(`/hq/ice${IK_QUERY}`, { redirect: 'manual', cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return STUN;
    const d: unknown = await r.json();
    const lijst = isObj(d) ? leesIceServers(d.iceServers) : [];
    return lijst.length ? lijst : STUN;
  } catch {
    return STUN;
  }
}

/** Eén keer per gesprek ophalen (TURN-gegevens zijn kort geldig), al bij het bellen zodat het klaar is bij het opnemen. */
const iceServers = () => (ice ??= haalIce());

// --- Het gesprek ---

/** De verbinding lukt niet: ophangen met een duidelijke melding. */
function mislukt() {
  hangup(true);
  note('Verbinding mislukt.');
}

/** Blijft het te lang op "verbinden" staan (de ander antwoordt nooit), dan ophangen. */
function startVerbindTimer(nr: number) {
  clearTimeout(verbindTimer);
  verbindTimer = setTimeout(() => {
    if (nr === gesprek && state.status === 'verbinden') mislukt();
  }, 60_000);
}

function makePeer(peer: string, local: MediaStream, servers: RTCIceServer[], beller: boolean) {
  const conn = new RTCPeerConnection({ iceServers: servers });
  local.getTracks().forEach((t) => conn.addTrack(t, local));
  conn.onicecandidate = (e) => {
    if (pc === conn && e.candidate) void post(peer, 'ice', e.candidate.toJSON());
  };
  conn.ontrack = (e) => {
    if (pc !== conn) return;
    clearTimeout(verbindTimer);
    set({ remote: e.streams[0] ?? new MediaStream([e.track]), status: 'verbonden' });
  };
  conn.oniceconnectionstatechange = () => {
    if (pc !== conn) return;
    clearInterval(iceTimer);
    const st = conn.iceConnectionState;
    if (st === 'failed') return mislukt();
    // Even weg (wifi-wissel): 5 s wachten, dan de ICE-verbinding opnieuw opbouwen. Dat herhalen zolang ze weg blijft:
    // het aanbod kan verloren gaan als ook de verbinding met het kantoor even weg was.
    if (st === 'disconnected') iceTimer = setInterval(() => void herstelIce(conn, peer, beller), 5000);
  };
  conn.onconnectionstatechange = () => {
    if (pc === conn && conn.connectionState === 'failed') mislukt();
  };
  pc = conn;
  return conn;
}

/** De weg naar de ander is terug (herverbonden, of de ander verhuisde): staat ICE nog op "disconnected", meteen herstellen. */
function herstelNu() {
  if (pc && state.peer && pc.iceConnectionState === 'disconnected') void herstelIce(pc, state.peer, ikBel);
}

/**
 * ICE opnieuw opbouwen. Enkel de beller maakt een aanbod, zodat ze nooit tegelijk een aanbod sturen.
 * Wacht er al een aanbod op antwoord (verloren omdat ook de verbinding met het kantoor weg was), dan gaat dat
 * opnieuw: localDescription bevat ook de ICE-kandidaten die intussen gevonden zijn. Een nieuwe herstart pas na 15 s,
 * zodat ICE de tijd krijgt om terug te komen.
 */
async function herstelIce(conn: RTCPeerConnection, peer: string, beller: boolean) {
  if (pc !== conn || conn.iceConnectionState !== 'disconnected') return;
  if (!beller) return conn.restartIce();
  try {
    const wacht = conn.localDescription;
    if (conn.signalingState === 'have-local-offer' && wacht?.type === 'offer') {
      await post(peer, 'aanbod', { type: 'offer', sdp: wacht.sdp });
      return;
    }
    if (conn.signalingState !== 'stable' || Date.now() - laatsteHerstart < 15_000) return;
    laatsteHerstart = Date.now();
    conn.restartIce();
    const offer = await conn.createOffer({ iceRestart: true });
    if (pc !== conn) return;
    await conn.setLocalDescription(offer);
    if (pc !== conn) return;
    await post(peer, 'aanbod', offer);
  } catch {
    /* lukt het niet, dan wordt de verbinding 'failed' en hangen we op */
  }
}

async function flushIce(conn: RTCPeerConnection) {
  const lijst = pendingIce;
  pendingIce = [];
  for (const c of lijst) await conn.addIceCandidate(c).catch(() => {});
}

function cleanup() {
  gesprek++;
  clearTimeout(ringTimer);
  clearTimeout(verbindTimer);
  clearInterval(iceTimer);
  wachtendAanbod = null;
  ikBel = false;
  laatsteHerstart = 0;
  if (pc) {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.oniceconnectionstatechange = null;
    pc.onconnectionstatechange = null;
    pc.close();
  }
  pc = null;
  pendingIce = [];
  peerSid = null;
  ice = null;
  stopMedia(state.local);
  set({ status: 'idle', peer: null, local: null, remote: null, muted: false, camOff: false, zonderCamera: false });
}

/** Camera en microfoon (en ICE-servers) voor gesprek `nr`. Is dat gesprek intussen voorbij, dan alles weer uit en null. */
async function mediaVoor(nr: number) {
  const [local, servers] = await Promise.all([getMedia(), iceServers()]);
  if (nr !== gesprek || state.status !== 'verbinden') {
    stopMedia(local);
    return null;
  }
  set({ local, zonderCamera: kaartTimers.has(local) });
  return { local, servers };
}

/** Bellen naar een collega (aankloppen bij het kantoor). */
export async function call(peer: string) {
  if (!state.me || state.status !== 'idle' || peer === state.me) return;
  const nr = ++gesprek;
  peerSid = null;
  ikBel = true;
  set({ status: 'uitgaand', peer });
  void iceServers();
  // Naar alle tabbladen van de ander: wie het eerst opneemt, krijgt het gesprek.
  const ok = await post(peer, 'bellen', null, null);
  if (nr !== gesprek) return;
  if (!ok) {
    cleanup();
    note(`${nameOf(peer)} is nu niet in het HQ.`);
    return;
  }
  ringTimer = setTimeout(() => {
    if (nr !== gesprek || state.status !== 'uitgaand') return;
    void post(peer, 'ophangen', null, null);
    cleanup();
    note(`${nameOf(peer)} neemt niet op.`);
  }, 45_000);
}

export async function accept() {
  if (state.status !== 'inkomend' || !state.peer) return;
  const peer = state.peer;
  const nr = gesprek;
  clearTimeout(ringTimer);
  set({ status: 'verbinden' });
  startVerbindTimer(nr);
  // Meteen "aanvaard", nog voor camera en microfoon: zo stopt de beller met wachten en stoppen de andere tabbladen
  // meteen met rinkelen, ook als de vraag om toestemming even openstaat (review R2). Een aanbod dat intussen
  // binnenkomt, wacht in wachtendAanbod.
  if (!(await post(peer, 'aanvaard'))) {
    if (nr === gesprek) mislukt();
    return;
  }
  const m = await mediaVoor(nr);
  if (!m) return;
  const conn = makePeer(peer, m.local, m.servers, false);
  const aanbod = wachtendAanbod;
  wachtendAanbod = null;
  if (aanbod) await beantwoord(conn, peer, aanbod);
}

/** Het aanbod van de beller beantwoorden (ook een nieuw aanbod voor een ICE-herstart). */
async function beantwoord(conn: RTCPeerConnection, peer: string, sdp: RTCSessionDescriptionInit) {
  try {
    await conn.setRemoteDescription(sdp);
    await flushIce(conn);
    const answer = await conn.createAnswer();
    if (pc !== conn) return;
    await conn.setLocalDescription(answer);
    if (pc !== conn) return;
    await post(peer, 'antwoord', answer);
  } catch {
    /* ongeldig of te laat: negeren */
  }
}

export function decline() {
  if (state.peer && state.status === 'inkomend') void post(state.peer, 'geweigerd');
  cleanup();
}

export function hangup(tell = true) {
  if (tell && state.peer && state.status !== 'idle') void post(state.peer, 'ophangen');
  cleanup();
}

export function toggleMute() {
  const muted = !state.muted;
  state.local?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  set({ muted });
}

export function toggleCam() {
  const camOff = !state.camOff;
  state.local?.getVideoTracks().forEach((t) => (t.enabled = !camOff));
  set({ camOff });
}

async function onMessage(m: Bericht) {
  const { van, vanSid, soort, data } = m;

  // Nog geen beeld of geluid uitgewisseld: de oproep loopt nog, er is geen gesprek om te beschermen.
  const nogGeenGesprek = state.status === 'inkomend' || (state.status === 'verbinden' && !pc?.remoteDescription);

  // Een ander tabblad van mezelf nam de oproep op (of weigerde ze): hier stoppen met rinkelen.
  if (soort === 'elders') {
    const vanBeller = van === state.peer && (!peerSid || !vanSid || vanSid === peerSid);
    if (state.status === 'inkomend' || (nogGeenGesprek && vanBeller)) {
      cleanup();
      note('Beantwoord in een ander tabblad.');
    }
    return;
  }
  if (van === state.me) return;
  // Online: na het opnemen telt enkel het tabblad van de ander dat in het gesprek zit. Een "ophangen" vóór er
  // een gesprek is (de beller haakte in), mag van elk tabblad van de beller komen.
  const anderTabblad = !!peerSid && !!vanSid && vanSid !== peerSid && !(soort === 'ophangen' && nogGeenGesprek);

  switch (soort) {
    case 'bellen': {
      if (state.status === 'inkomend' && state.peer === van) return;
      if (state.status !== 'idle') return void post(van, 'bezet', null, vanSid);
      const nr = ++gesprek;
      peerSid = vanSid;
      ikBel = false;
      set({ status: 'inkomend', peer: van });
      void iceServers();
      // Hangt de beller nooit op (tabblad dicht), dan blijft het hier niet eeuwig rinkelen.
      ringTimer = setTimeout(() => {
        if (nr !== gesprek || state.status !== 'inkomend') return;
        cleanup();
        note(`Gemiste oproep van ${nameOf(van)}.`);
      }, 50_000);
      return;
    }
    case 'aanvaard': {
      if (state.peer === van && peerSid && vanSid) {
        // Een tweede tabblad van de ander nam ook op: dat tabblad laten stoppen.
        if (vanSid !== peerSid) return void post(van, 'elders', null, vanSid);
        if (state.status !== 'uitgaand') return; // hetzelfde "aanvaard" nog eens: niets te doen
      }
      if (state.status !== 'uitgaand' || state.peer !== van) {
        // Een "aanvaard" voor een oproep die hier al voorbij is (bv. na een onderbreking): dat tabblad meteen laten
        // stoppen, anders blijft het met de camera aan op "verbinden" staan (review R4).
        if (vanSid) void post(van, 'ophangen', null, vanSid);
        return;
      }
      const nr = gesprek;
      peerSid = vanSid;
      clearTimeout(ringTimer);
      set({ status: 'verbinden' });
      startVerbindTimer(nr);
      const media = await mediaVoor(nr);
      if (!media) return;
      const conn = makePeer(van, media.local, media.servers, true);
      try {
        const offer = await conn.createOffer();
        if (pc !== conn) return;
        await conn.setLocalDescription(offer);
        if (pc !== conn) return;
        if (!(await post(van, 'aanbod', offer)) && pc === conn) mislukt();
      } catch {
        if (pc === conn) mislukt();
      }
      return;
    }
    case 'aanbod': {
      if (state.peer !== van || anderTabblad || ikBel) return;
      const sdp = alsSdp(data, 'offer');
      if (!sdp) return;
      // Nog geen verbinding: camera en microfoon worden nog gevraagd. accept() beantwoordt het daarna.
      if (!pc) {
        if (state.status === 'verbinden') wachtendAanbod = sdp;
        return;
      }
      await beantwoord(pc, van, sdp);
      return;
    }
    case 'antwoord': {
      if (!pc || state.peer !== van || anderTabblad || pc.signalingState !== 'have-local-offer') return;
      const sdp = alsSdp(data, 'answer');
      if (!sdp) return;
      const conn = pc;
      try {
        await conn.setRemoteDescription(sdp);
        await flushIce(conn);
      } catch {
        /* ongeldig of dubbel antwoord: negeren */
      }
      return;
    }
    case 'ice': {
      if (state.peer !== van || anderTabblad) return;
      const c = alsIce(data);
      if (!c) return;
      if (pc?.remoteDescription) await pc.addIceCandidate(c).catch(() => {});
      else if (pendingIce.length < 100) pendingIce.push(c);
      return;
    }
    case 'geweigerd':
    case 'bezet': {
      if (state.peer !== van || anderTabblad) return;
      // Nog aan het rinkelen bij de ander: ook de andere tabbladen van de ander laten stoppen.
      if (state.status === 'uitgaand') void post(van, 'ophangen', null, null);
      cleanup();
      note(soort === 'bezet' ? `${nameOf(van)} zit al in een gesprek.` : `${nameOf(van)} kan nu niet.`);
      return;
    }
    case 'ophangen': {
      if (state.peer !== van || anderTabblad) return;
      const gemist = state.status === 'inkomend';
      cleanup();
      note(gemist ? `Gemiste oproep van ${nameOf(van)}.` : `${nameOf(van)} heeft opgehangen.`);
      return;
    }
  }
}

export { nameOf };
