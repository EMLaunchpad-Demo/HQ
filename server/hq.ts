// Het virtuele hoofdkantoor (#/hq): taken uit Notion en de signalering voor de videocall.
// Draait als middleware in de Vite-dev-server (zie vite.config.ts), dus geen extra server of kosten.
// Online doet de Worker hetzelfde (hq-cloud/src/worker.js); dit is de lokale versie, zonder login.
//
// /hq/ik       wie je bent: lokaal uit ?ik= (of de pagina met ?ik=), anders "martijn"
// /hq/taken    de open taken (en die van de laatste 7 dagen) uit de Notion-database Taken.
//              Live via NOTION_TOKEN als die er is; anders de laatste momentopname in data/hq-taken.json (als verouderd).
// /hq/ice      ICE-servers voor de videocall: lokaal enkel de STUN van Cloudflare
// /hq/signaal  WebSocket zoals online (ping/pong, sessie-id per tabblad), of de oudere manier:
//              GET = live-stroom (aanwezigheid + berichten), POST = bericht naar een collega.
//              Dezelfde regels als het Durable Object online: hq-cloud/src/kantoor-logica.js.
//              Het beeld en geluid zelf gaan rechtstreeks van pc naar pc (peer-to-peer), niet via deze server.
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Database Taken (zie NOTION.md). */
const TAKEN_DB = '3f1d13408f3180a6905ed38d259f8345';
const CACHE_MS = 60_000;
const STUN = [{ urls: 'stun:stun.cloudflare.com:3478' }];
const LOKAAL = new Set(['localhost', '127.0.0.1', '[::1]']);
/** Grootste WebSocket-bericht dat we lokaal lezen; de regels zelf laten maar 64 KB door. */
const MAX_FRAME = 1024 * 1024;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

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

type Json = Record<string, any>;

// --- De regels van het kantoor (hq-cloud/src/kantoor-logica.js; in de HQ-repo worker/kantoor-logica.js) ---

interface Verbinding {
  wie: string;
  sid: string;
  sinds: number;
  belt: string | null;
  gesprek: { wie: string; sid: string } | null;
}
interface Uitgaand {
  event: string;
  data: unknown;
}
interface Gevolg {
  leveringen: { sid: string; bericht: Uitgaand }[];
  wijzigingen: (Partial<Verbinding> & { sid: string })[];
}
interface Bericht {
  naar: string;
  soort: string;
  naarSid: string | null;
  data: unknown;
}
interface KantoorLogica {
  SLUIT_TE_VEEL: number;
  nieuweVerbinding(wie: string, sid: string): Verbinding;
  valideerBericht(raw: string, van: string, bekend: Set<string>): Bericht | null;
  routeer(lijst: Verbinding[], vanSid: string, b: Bericht): Gevolg;
  bijSluiten(anderen: Verbinding[], dicht: Verbinding): Gevolg;
  teSluiten(lijst: Verbinding[], wie: string): string[];
  aanwezig(lijst: Verbinding[]): string[];
}

/** Laadt de gedeelde regels als JavaScript-module, zodat online en lokaal precies hetzelfde doen. */
function laadLogica(root: string): Promise<KantoorLogica> {
  const kandidaten = [path.join(root, 'hq-cloud', 'src', 'kantoor-logica.js'), path.join(root, 'worker', 'kantoor-logica.js')];
  const bestand = kandidaten.find((k) => existsSync(k));
  if (!bestand) return Promise.reject(new Error('kantoor-logica.js niet gevonden (hq-cloud/src of worker/).'));
  return import(/* @vite-ignore */ pathToFileURL(bestand).href) as Promise<KantoorLogica>;
}

/** De founders die mogen bellen (team.config.json), zoals FOUNDERS online. */
function leesFounderIds(root: string): Set<string> {
  try {
    const config = JSON.parse(readFileSync(path.join(root, 'team.config.json'), 'utf8')) as { founders?: { id?: unknown }[] };
    const ids = (config.founders ?? []).map((f) => f.id).filter((id): id is string => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id));
    if (ids.length) return new Set(ids);
  } catch {
    /* geen of kapotte config: hieronder de vaste twee */
  }
  return new Set(['ebert', 'martijn']);
}

// --- Taken uit Notion ---

const plain = (rich?: Json[]) => (rich ?? []).map((r) => r.plain_text ?? '').join('');
/** Huisregels voor wat in beeld komt: geen emoji, en "ons platform" in plaats van de naam van het platform. */
const clean = (s: string) =>
  s
    .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
    .replace(/\b(GoHighLevel|GHL)(-|\b)/gi, 'ons platform ')
    .replace(/\s+/g, ' ')
    .trim();

function toTaak(p: Json): HqTaak {
  const pr = p.properties ?? {};
  const sel = (k: string) => pr[k]?.select?.name ?? '';
  return {
    id: p.id,
    naam: clean(plain(pr.Naam?.title)) || '(zonder titel)',
    status: pr.Status?.status?.name ?? 'Niet gestart',
    uitvoerder: sel('Uitvoerder'),
    afdeling: sel('Afdeling'),
    prioriteit: sel('Prioriteit'),
    bron: sel('Bron'),
    voorstel: !!pr.Voorstel?.checkbox,
    vervaldatum: pr.Vervaldatum?.date?.start ?? null,
    aangemaakt: p.created_time,
    bewerkt: p.last_edited_time,
    url: p.url,
  };
}

class NotionFout extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(`Notion-fout ${status}: ${detail}`);
    this.status = status;
  }
}

async function fetchNotion(token: string): Promise<HqTaak[]> {
  const sinds = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const filter = {
    or: [
      { property: 'Status', status: { does_not_equal: 'Done' } },
      { timestamp: 'last_edited_time', last_edited_time: { on_or_after: sinds } },
    ],
  };
  const out: HqTaak[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`https://api.notion.com/v1/databases/${TAKEN_DB}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter, page_size: 100, start_cursor: cursor }),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok) throw new NotionFout(res.status, data.message ?? res.statusText);
    out.push(...(data.results ?? []).map(toTaak));
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return out;
}

/** Korte uitleg voor in het HQ (zoals online); de details staan in de terminal. */
function korteFout(e: unknown): string {
  if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) return 'Notion antwoordt niet.';
  const s = e instanceof NotionFout ? e.status : 0;
  if (s === 401 || s === 403) return 'Notion weigert de toegang.';
  if (s === 404) return 'De takenlijst is niet gedeeld met het HQ.';
  if (s === 429) return 'Notion is even te druk.';
  return 'Notion is niet bereikbaar.';
}

function send(res: ServerResponse, status: number, data: unknown, extra: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }).end(JSON.stringify(data));
}

function readRaw(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    let teGroot = false;
    req.on('data', (c) => {
      if (body.length < 200_000) body += c;
      else teGroot = true;
    });
    req.on('end', () => resolve(teGroot ? '' : body));
    req.on('error', () => resolve(''));
  });
}

const isLokaal = (adres: string) => {
  try {
    return LOKAAL.has(new URL(adres).hostname);
  } catch {
    return false;
  }
};

/** Kleine WebSocket-server voor lokaal (RFC 6455, enkel wat het HQ nodig heeft): tekstberichten, ping/pong en sluiten. */
class DevSocket {
  private buf: Buffer = Buffer.alloc(0);
  private delen: Buffer[] = [];
  private grootte = 0;
  private dicht = false;
  private klaar = false;
  private readonly socket: Duplex;
  private readonly opTekst: (tekst: string) => void;
  private readonly opDicht: () => void;

  constructor(socket: Duplex, opTekst: (tekst: string) => void, opDicht: () => void) {
    this.socket = socket;
    this.opTekst = opTekst;
    this.opDicht = opDicht;
    socket.on('data', (d: Buffer) => this.lees(d));
    socket.on('close', () => this.weg());
    socket.on('error', () => this.weg());
  }

  lees(d: Buffer) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (!this.dicht && this.buf.length >= 2) {
      const b0 = this.buf[0];
      const b1 = this.buf[1];
      const op = b0 & 0x0f;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        const groot = this.buf.readBigUInt64BE(2);
        if (groot > BigInt(MAX_FRAME)) return this.sluit(1009, 'Te groot.');
        len = Number(groot);
        off = 10;
      }
      if (len > MAX_FRAME) return this.sluit(1009, 'Te groot.');
      if ((b1 & 0x80) === 0) return this.sluit(1002, 'Niet gemaskeerd.'); // een browser maskeert altijd
      if (this.buf.length < off + 4 + len) return;
      const masker = this.buf.subarray(off, off + 4);
      const data = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= masker[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      if (op === 0x8) return this.sluit(1000, '');
      if (op === 0x9) {
        this.frame(0xa, data);
        continue;
      }
      if (op === 0xa) continue;
      if (op > 0x2) return this.sluit(1002, 'Onbekend frame.');
      this.grootte += data.length;
      if (this.grootte > MAX_FRAME) return this.sluit(1009, 'Te groot.');
      this.delen.push(data);
      if (b0 & 0x80) {
        const bericht = Buffer.concat(this.delen);
        this.delen = [];
        this.grootte = 0;
        this.opTekst(bericht.toString('utf8'));
      }
    }
  }

  private frame(op: number, data: Buffer) {
    if (this.dicht || this.socket.destroyed) return;
    const n = data.length;
    const kop = Buffer.alloc(n < 126 ? 2 : n < 65536 ? 4 : 10);
    kop[0] = 0x80 | op;
    if (n < 126) kop[1] = n;
    else if (n < 65536) {
      kop[1] = 126;
      kop.writeUInt16BE(n, 2);
    } else {
      kop[1] = 127;
      kop.writeBigUInt64BE(BigInt(n), 2);
    }
    this.socket.write(Buffer.concat([kop, data]));
  }

  stuur(tekst: string) {
    this.frame(0x1, Buffer.from(tekst, 'utf8'));
  }

  sluit(code: number, reden: string) {
    if (this.dicht) return;
    const r = Buffer.from(reden, 'utf8').subarray(0, 120);
    const p = Buffer.alloc(2 + r.length);
    p.writeUInt16BE(code, 0);
    r.copy(p, 2);
    this.frame(0x8, p);
    this.dicht = true;
    this.socket.end();
    this.weg();
  }

  private weg() {
    if (this.klaar) return;
    this.klaar = true;
    this.dicht = true;
    this.opDicht();
  }
}

/** Maakt de handlers; `root` is de map van ai-team, `notionToken` komt uit .env (wordt nooit naar de browser gestuurd). */
export function createHq(root: string, notionToken?: string) {
  const snapshot = path.join(root, 'data', 'hq-taken.json');
  const bekend = leesFounderIds(root);
  const logica = laadLogica(root);
  logica.catch((e: Error) => console.error(`[hq] ${e.message}`));
  let cache: { at: number; body: Json } | null = null;
  let laatstGoed: Json | null = null;

  /** Lokaal is er geen login: wie je bent komt uit ?ik= (of ?wie=), anders uit de pagina, anders "martijn". */
  function kiesWie(q: URLSearchParams, pagina?: string): string {
    const bronnen = [q.get('ik'), q.get('wie')];
    try {
      if (pagina) bronnen.push(new URL(pagina).searchParams.get('ik'));
    } catch {
      /* geen pagina-adres */
    }
    for (const b of bronnen) if (b && bekend.has(b.toLowerCase())) return b.toLowerCase();
    return bekend.has('martijn') ? 'martijn' : ([...bekend][0] ?? 'martijn');
  }

  // --- De WebSocket hangt aan de http-server van Vite; die halen we uit het eerste /hq-verzoek. ---
  const gekoppeld = new WeakSet<Server>();
  /** Koppelt /hq/signaal als WebSocket aan een http-server (gebeurt ook vanzelf bij het eerste /hq-verzoek). */
  function koppel(server: Server) {
    if (gekoppeld.has(server)) return;
    gekoppeld.add(server);
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (new URL(req.url ?? '/', 'http://x').pathname !== '/hq/signaal') return; // niet van ons (bv. de HMR van Vite)
      logica.then(
        (L) => upgrade(L, req, socket, head),
        () => socket.destroy(),
      );
    });
  }
  function koppelVia(req: IncomingMessage) {
    const server = (req.socket as unknown as { server?: Server }).server;
    if (server && typeof server.on === 'function') koppel(server);
  }

  async function taken(req: IncomingMessage, res: ServerResponse) {
    koppelVia(req);
    if (req.method !== 'GET') return send(res, 405, { fout: 'Niet toegestaan.' }, { Allow: 'GET' });
    if (cache && Date.now() - cache.at < CACHE_MS) return send(res, 200, cache.body);
    let fout: string;
    if (notionToken) {
      try {
        const lijst = await fetchNotion(notionToken);
        const body = { bron: 'notion', bijgewerkt: new Date().toISOString(), taken: lijst };
        cache = { at: Date.now(), body };
        laatstGoed = body;
        // Momentopname bijhouden, zodat het HQ ook zonder verbinding de laatste stand toont.
        mkdirSync(path.dirname(snapshot), { recursive: true });
        writeFileSync(snapshot, JSON.stringify({ bijgewerkt: body.bijgewerkt, taken: lijst }, null, 1));
        return send(res, 200, body);
      } catch (e) {
        console.error(`[hq] ${(e as Error).message}`);
        fout = korteFout(e);
      }
    } else fout = 'Notion is niet gekoppeld (geen NOTION_TOKEN in .env).';
    // Laatst goede lijst: uit het geheugen, anders de momentopname op schijf. Altijd als verouderd gemarkeerd.
    let oud = laatstGoed;
    let bron = 'notion';
    if (!oud && existsSync(snapshot)) {
      try {
        oud = JSON.parse(readFileSync(snapshot, 'utf8')) as Json;
        bron = 'momentopname';
      } catch {
        oud = null;
      }
    }
    const body = oud
      ? { bron, bijgewerkt: oud.bijgewerkt ?? null, taken: oud.taken ?? [], verouderd: true, sinds: oud.bijgewerkt ?? null, fout }
      : { bron: 'geen', bijgewerkt: null, taken: [], fout };
    cache = { at: Date.now(), body };
    return send(res, 200, body);
  }

  function ik(req: IncomingMessage, res: ServerResponse) {
    koppelVia(req);
    if (req.method !== 'GET') return send(res, 405, { fout: 'Niet toegestaan.' }, { Allow: 'GET' });
    const wie = kiesWie(new URL(req.url ?? '/', 'http://x').searchParams, req.headers.referer);
    return send(res, 200, { wie, email: `${wie}@localhost` });
  }

  function ice(req: IncomingMessage, res: ServerResponse) {
    koppelVia(req);
    if (req.method !== 'GET') return send(res, 405, { fout: 'Niet toegestaan.' }, { Allow: 'GET' });
    return send(res, 200, { iceServers: STUN });
  }

  // --- Het kantoor: elk tabblad is een verbinding (WebSocket of live-stroom) met een eigen sessie-id ---
  interface Kanaal {
    stuur(b: Uitgaand): void;
    sluit(code: number, reden: string): void;
  }
  const kamer = new Map<string, { v: Verbinding; kanaal: Kanaal }>();
  const lijst = () => [...kamer.values()].map((x) => x.v);

  function voerUit(g: Gevolg) {
    for (const { sid, ...velden } of g.wijzigingen) {
      const x = kamer.get(sid);
      if (x) Object.assign(x.v, velden);
    }
    for (const { sid, bericht } of g.leveringen) kamer.get(sid)?.kanaal.stuur(bericht);
  }

  function broadcast(L: KantoorLogica) {
    const b = { event: 'aanwezig', data: L.aanwezig(lijst()) };
    for (const x of kamer.values()) x.kanaal.stuur(b);
  }

  function verbind(L: KantoorLogica, wie: string, kanaal: Kanaal): string {
    // Hoogstens 3 tabbladen per persoon: het oudste gaat dicht (code 4000).
    for (const oud of L.teSluiten(lijst(), wie)) {
      const x = kamer.get(oud);
      if (!x) continue;
      weg(L, oud);
      x.kanaal.sluit(L.SLUIT_TE_VEEL, 'Te veel tabbladen open.');
    }
    const sid = randomUUID();
    kamer.set(sid, { v: L.nieuweVerbinding(wie, sid), kanaal });
    broadcast(L);
    return sid;
  }

  function weg(L: KantoorLogica, sid: string) {
    const x = kamer.get(sid);
    if (!x) return;
    kamer.delete(sid);
    voerUit(L.bijSluiten(lijst(), x.v));
    broadcast(L);
  }

  function ontvang(L: KantoorLogica, sid: string, raw: string): Gevolg | null {
    const x = kamer.get(sid);
    if (!x) return null;
    const b = L.valideerBericht(raw, x.v.wie, bekend);
    if (!b) return null; // ongeldig of onbekend: negeren
    const g = L.routeer(lijst(), sid, b);
    voerUit(g);
    return g;
  }

  function upgrade(L: KantoorLogica, req: IncomingMessage, socket: Duplex, head: Buffer) {
    const weiger = (code: number, tekst: string) => socket.end(`HTTP/1.1 ${code} ${tekst}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    // Enkel een pagina van deze pc mag verbinden (zoals online enkel https://hq.emlaunchpad.com).
    const origin = req.headers.origin;
    if (origin && !isLokaal(origin)) return weiger(403, 'Forbidden');
    const key = req.headers['sec-websocket-key'];
    if (typeof key !== 'string' || String(req.headers.upgrade ?? '').toLowerCase() !== 'websocket') return weiger(400, 'Bad Request');
    const accept = createHash('sha1')
      .update(key + WS_GUID)
      .digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const wie = kiesWie(new URL(req.url ?? '/', 'http://x').searchParams, req.headers.referer);
    let sid = '';
    const ws = new DevSocket(
      socket,
      (tekst) => {
        if (tekst === 'ping') ws.stuur('pong'); // zoals de auto-response van het Durable Object
        else ontvang(L, sid, tekst);
      },
      () => weg(L, sid),
    );
    sid = verbind(L, wie, { stuur: (b) => ws.stuur(JSON.stringify(b)), sluit: (code, reden) => ws.sluit(code, reden) });
    if (head?.length) ws.lees(head);
  }

  /** De jongste verbinding van iemand (voor een POST zonder vanSid). */
  function jongsteVan(wie: string): string | null {
    let beste: Verbinding | null = null;
    for (const { v } of kamer.values()) if (v.wie === wie && (!beste || v.sinds >= beste.sinds)) beste = v;
    return beste?.sid ?? null;
  }

  async function signaal(req: IncomingMessage, res: ServerResponse) {
    koppelVia(req);
    let L: KantoorLogica;
    try {
      L = await logica;
    } catch {
      return send(res, 500, { fout: 'De regels van het kantoor ontbreken.' });
    }
    const url = new URL(req.url ?? '/', 'http://x');
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': verbonden\n\n');
      const open = () => !res.writableEnded && !res.destroyed;
      const kanaal: Kanaal = {
        stuur: (b) => {
          if (open()) res.write(`event: ${b.event}\ndata: ${JSON.stringify(b.data)}\n\n`);
        },
        // Te veel tabbladen: de live-stroom stopt, en de browser probeert het niet meteen opnieuw.
        sluit: () => {
          if (open()) res.end('retry: 86400000\n\n');
        },
      };
      const wie = kiesWie(url.searchParams, req.headers.referer);
      const sid = verbind(L, wie, kanaal);
      kanaal.stuur({ event: 'welkom', data: { wie, sid } });
      const ping = setInterval(() => open() && res.write(': ping\n\n'), 20_000);
      req.on('close', () => {
        clearInterval(ping);
        weg(L, sid);
      });
      return;
    }
    if (req.method === 'POST') {
      const raw = await readRaw(req);
      let kop: Json = {};
      try {
        kop = JSON.parse(raw) as Json;
      } catch {
        return send(res, 400, { fout: 'Ongeldig bericht.' });
      }
      // Van welk tabblad? De vanSid uit "welkom" van de live-stroom, anders het jongste tabblad van "van".
      const vanSid = typeof kop.vanSid === 'string' && kamer.has(kop.vanSid) ? kop.vanSid : jongsteVan(String(kop.van ?? ''));
      if (!vanSid) return send(res, 409, { fout: 'Niet verbonden.' });
      const g = ontvang(L, vanSid, raw);
      if (!g) return send(res, 400, { fout: 'Ongeldig bericht.' });
      const nietOnline = g.leveringen.some((l) => l.sid === vanSid && l.bericht.event === 'niet-online');
      return nietOnline ? send(res, 404, { fout: 'Niet online.' }) : send(res, 200, { ok: true });
    }
    return send(res, 405, { fout: 'Niet toegestaan.' }, { Allow: 'GET, POST' });
  }

  /** Alles onder /hq in één middleware: server.middlewares.use('/hq', h.middleware) of zonder pad. */
  function middleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const volledig = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? '/';
    const pad = new URL(volledig, 'http://x').pathname;
    if (pad === '/hq/ik') return ik(req, res);
    if (pad === '/hq/taken') return void taken(req, res);
    if (pad === '/hq/ice') return ice(req, res);
    if (pad === '/hq/signaal') return void signaal(req, res);
    return next();
  }

  return { taken, signaal, ik, ice, middleware, koppel };
}
