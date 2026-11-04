// Videocall tussen de founders in het HQ: WebRTC rechtstreeks van pc naar pc (gratis).
// De dev-server (server/hq.ts) geeft alleen de berichtjes door om de verbinding op te zetten.
// Wie je bent onthoudt de browser (localStorage), of komt uit ?ik=<id> in de link.
import { useSyncExternalStore } from 'react';
import { hqStore, humans } from './model';

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

const KEY = 'hq-ik';
const fromUrl = new URLSearchParams(location.search).get('ik');
const stored = (() => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
})();
const initialMe = [fromUrl, stored].find((x) => x && humans.some((h) => h.id === x)) ?? null;

let state: CallState = { me: initialMe, status: 'idle', peer: null, local: null, remote: null, muted: false, camOff: false, melding: null, zonderCamera: false };
const subs = new Set<() => void>();
const set = (p: Partial<CallState>) => {
  state = { ...state, ...p };
  subs.forEach((f) => f());
};
export const callStore = { get: () => state, subscribe: (f: () => void) => (subs.add(f), () => subs.delete(f)) };
export function useCall<T>(sel: (s: CallState) => T): T {
  return useSyncExternalStore(callStore.subscribe, () => sel(state));
}

const nameOf = (id: string | null) => humans.find((h) => h.id === id)?.name ?? id ?? '';

let es: EventSource | null = null;
let pc: RTCPeerConnection | null = null;
let pendingIce: RTCIceCandidateInit[] = [];
let ringTimer: ReturnType<typeof setTimeout> | undefined;
let noteTimer: ReturnType<typeof setTimeout> | undefined;
let fakeTimer: ReturnType<typeof setInterval> | undefined;

function note(melding: string | null) {
  clearTimeout(noteTimer);
  set({ melding });
  if (melding) noteTimer = setTimeout(() => set({ melding: null }), 6000);
}

/**
 * Twee manieren om de berichtjes door te geven:
 * - lokaal (npm run dev): live-stroom + POST via de dev-server (server/hq.ts);
 * - online (gebouwde app op Cloudflare, zie hq-cloud/): één WebSocket naar het "kantoor".
 */
const ONLINE = import.meta.env.PROD;
let ws: WebSocket | null = null;
let wsRetry: ReturnType<typeof setTimeout> | undefined;

async function post(naar: string, soort: string, data: unknown = null) {
  if (ONLINE) {
    if (ws?.readyState !== WebSocket.OPEN) return false;
    if (soort === 'bellen' && !hqStore.get().online.includes(naar)) return false;
    ws.send(JSON.stringify({ naar, soort, data }));
    return true;
  }
  const r = await fetch('/hq/signaal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ van: state.me, naar, soort, data }),
  }).catch(() => null);
  return !!r?.ok;
}

export function setMe(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* privévenster */
  }
  hangup(false);
  set({ me: id });
  connectPresence();
}

/** Aanmelden in het HQ: zo zien de anderen dat je er bent, en kan je gebeld worden. */
export function connectPresence() {
  es?.close();
  es = null;
  clearTimeout(wsRetry);
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  if (!state.me) return;
  if (ONLINE) {
    const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/hq/signaal?wie=${encodeURIComponent(state.me)}`);
    ws = sock;
    sock.onmessage = (m) => {
      const { event, data } = JSON.parse(m.data);
      if (event === 'aanwezig') hqStore.set({ online: data });
      else if (event === 'bericht') void onMessage(data);
      else if (event === 'niet-online' && data?.naar === state.peer && state.status === 'uitgaand') {
        cleanup();
        note(`${nameOf(data.naar)} is nu niet in het HQ.`);
      }
    };
    // Verbinding weg (wifi, slaapstand): stil opnieuw proberen.
    sock.onclose = () => {
      if (ws === sock) wsRetry = setTimeout(connectPresence, 3000);
    };
    return;
  }
  const source = new EventSource(`/hq/signaal?wie=${encodeURIComponent(state.me)}`);
  es = source;
  source.addEventListener('aanwezig', (m) => hqStore.set({ online: JSON.parse((m as MessageEvent).data) }));
  source.addEventListener('bericht', (m) => void onMessage(JSON.parse((m as MessageEvent).data)));
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
  fakeTimer = setInterval(draw, 100);
  return c.captureStream(10);
}

/** Een toestemmingsvraag die niemand beantwoordt, mag de call niet blokkeren. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

async function getMedia(): Promise<MediaStream> {
  try {
    const s = await withTimeout(
      navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: { echoCancellation: true, noiseSuppression: true } }),
      20_000,
    );
    set({ zonderCamera: false });
    return s;
  } catch {
    const card = nameCardStream();
    set({ zonderCamera: true });
    try {
      const mic = await withTimeout(navigator.mediaDevices.getUserMedia({ audio: true }), 5_000);
      mic.getAudioTracks().forEach((t) => card.addTrack(t));
    } catch {
      /* ook geen microfoon: dan enkel beeld */
    }
    return card;
  }
}

function makePeer(peer: string, local: MediaStream) {
  const conn = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] });
  local.getTracks().forEach((t) => conn.addTrack(t, local));
  conn.onicecandidate = (e) => {
    if (e.candidate) void post(peer, 'ice', e.candidate.toJSON());
  };
  conn.ontrack = (e) => {
    const remote = e.streams[0] ?? new MediaStream([e.track]);
    set({ remote, status: 'verbonden' });
  };
  conn.onconnectionstatechange = () => {
    if (conn.connectionState === 'failed') {
      note('De verbinding is weggevallen.');
      hangup(true);
    }
  };
  pc = conn;
  return conn;
}

async function flushIce() {
  for (const c of pendingIce) await pc?.addIceCandidate(c).catch(() => {});
  pendingIce = [];
}

function cleanup() {
  clearTimeout(ringTimer);
  clearInterval(fakeTimer);
  pc?.close();
  pc = null;
  pendingIce = [];
  state.local?.getTracks().forEach((t) => t.stop());
  set({ status: 'idle', peer: null, local: null, remote: null, muted: false, camOff: false });
}

/** Bellen naar een collega (aankloppen bij het kantoor). */
export async function call(peer: string) {
  if (!state.me || state.status !== 'idle') return;
  set({ status: 'uitgaand', peer });
  const ok = await post(peer, 'bellen');
  if (!ok) {
    cleanup();
    note(`${nameOf(peer)} is nu niet in het HQ.`);
    return;
  }
  ringTimer = setTimeout(() => {
    if (state.status === 'uitgaand') {
      void post(peer, 'ophangen');
      cleanup();
      note(`${nameOf(peer)} neemt niet op.`);
    }
  }, 45_000);
}

export async function accept() {
  if (state.status !== 'inkomend' || !state.peer) return;
  const peer = state.peer;
  set({ status: 'verbinden' });
  const local = await getMedia();
  set({ local });
  makePeer(peer, local);
  await post(peer, 'aanvaard');
}

export function decline() {
  if (state.peer) void post(state.peer, 'geweigerd');
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

async function onMessage(m: { van: string; soort: string; data: any }) {
  const { van, soort, data } = m;
  switch (soort) {
    case 'bellen':
      if (state.status !== 'idle') return void post(van, 'bezet');
      set({ status: 'inkomend', peer: van });
      return;
    case 'aanvaard': {
      if (state.status !== 'uitgaand' || state.peer !== van) return;
      clearTimeout(ringTimer);
      set({ status: 'verbinden' });
      const local = await getMedia();
      set({ local });
      const conn = makePeer(van, local);
      const offer = await conn.createOffer();
      await conn.setLocalDescription(offer);
      await post(van, 'aanbod', offer);
      return;
    }
    case 'aanbod':
      if (!pc || state.peer !== van) return;
      await pc.setRemoteDescription(data);
      await flushIce();
      {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await post(van, 'antwoord', answer);
      }
      return;
    case 'antwoord':
      if (!pc || state.peer !== van) return;
      await pc.setRemoteDescription(data);
      await flushIce();
      return;
    case 'ice':
      if (state.peer !== van) return;
      if (pc?.remoteDescription) await pc.addIceCandidate(data).catch(() => {});
      else pendingIce.push(data);
      return;
    case 'geweigerd':
      if (state.peer !== van) return;
      cleanup();
      note(`${nameOf(van)} kan nu niet.`);
      return;
    case 'bezet':
      if (state.peer !== van) return;
      cleanup();
      note(`${nameOf(van)} zit al in een gesprek.`);
      return;
    case 'ophangen':
      if (state.peer !== van) return;
      cleanup();
      note(`${nameOf(van)} heeft opgehangen.`);
      return;
  }
}

export { nameOf };
