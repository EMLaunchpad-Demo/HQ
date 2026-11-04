// Het HQ online (fase 2): zelfde app als lokaal, maar de dev-server wordt een Cloudflare Worker.
// Elk verzoek gaat eerst langs de login-controle (access.js), ook de statische bestanden (run_worker_first: true).
// Cloudflare Access staat vóór het adres; deze Worker controleert het token van Access nog eens zelf, zodat het HQ
// dicht blijft als Access ooit verkeerd ingesteld staat.
//
// /hq/ik       wie je bent (uit de login): { wie, email }
// /hq/taken    taken uit Notion (geheim NOTION_TOKEN); bij een Notion-fout de laatst goede lijst, gemarkeerd als verouderd
// /hq/ice      ICE-servers voor de videocall: TURN van Cloudflare als TURN_KEY_ID en TURN_KEY_API_TOKEN gezet zijn, anders enkel STUN
// /hq/signaal  WebSocket naar het Durable Object "Kantoor": aanwezigheid en call-berichtjes (regels in kantoor-logica.js)
// /activity    bestaat online niet (het activiteitslog staat op de pc); 204 = de browser stopt met proberen.
import { DurableObject } from 'cloudflare:workers';
import { founderIds, verifyAccess } from './access.js';
import { aanwezig, bijSluiten, nieuweVerbinding, normaliseerIce, routeer, SID_PATROON, SLUIT_TE_VEEL, teSluiten, valideerBericht } from './kantoor-logica.js';

const TAKEN_DB = '3f1d13408f3180a6905ed38d259f8345';
const PRODUCTIE = 'https://hq.emlaunchpad.com';
const LOKAAL = new Set(['localhost', '127.0.0.1', '[::1]']);
const STUN = [{ urls: 'stun:stun.cloudflare.com:3478' }];
const OPEN = 1; // WebSocket.READY_STATE_OPEN

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
const nietToegestaan = () => json({ fout: 'Niet toegestaan.' }, 405, { Allow: 'GET' });

const GEEN_TOEGANG = `<!doctype html>
<html lang="nl-BE">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>EM Launchpad HQ</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b1526; color: #e8eef5; font: 16px/1.5 system-ui, sans-serif; }
      main { padding: 24px 16px; text-align: center; }
      a { color: #13c7e6; }
    </style>
  </head>
  <body>
    <main>
      <h1 style="font-size: 20px; margin: 0 0 12px">Geen toegang. Log opnieuw in.</h1>
      <p><a href="/cdn-cgi/access/logout">Afmelden en opnieuw inloggen</a></p>
    </main>
  </body>
</html>
`;

/** Geen geldige login: de app krijgt 401 (zodat ze "login verlopen" toont), een pagina krijgt 403. */
function geenToegang(url) {
  if (url.pathname.startsWith('/hq/') || url.pathname === '/activity') return json({ fout: 'login' }, 401);
  return new Response(GEEN_TOEGANG, { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/**
 * Wie is het? Online altijd uit de login van Access. Enkel lokaal (wrangler dev op localhost, met DEV_ZONDER_LOGIN=1
 * in .dev.vars, nooit in wrangler.jsonc) mag het zonder login: dan uit ?ik= (van het adres of de pagina) of "martijn".
 */
async function wieBenJe(request, env, url) {
  if (env.DEV_ZONDER_LOGIN === '1' && LOKAAL.has(url.hostname)) {
    const ids = founderIds(env);
    let gevraagd = url.searchParams.get('ik');
    if (!gevraagd) {
      try {
        gevraagd = new URL(request.headers.get('Referer') ?? '').searchParams.get('ik');
      } catch {
        /* geen pagina-adres */
      }
    }
    const wie = gevraagd && ids.has(gevraagd.toLowerCase()) ? gevraagd.toLowerCase() : 'martijn';
    return { email: `${wie}@localhost`, wie };
  }
  return verifyAccess(request, env);
}

// --- Taken uit Notion ---

const plain = (rich) => (rich ?? []).map((r) => r.plain_text ?? '').join('');
/** Zelfde huisregels als server/hq.ts: geen emoji, "ons platform" in plaats van de naam van het platform. */
const clean = (s) =>
  s
    .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
    .replace(/\b(GoHighLevel|GHL)(-|\b)/gi, 'ons platform ')
    .replace(/\s+/g, ' ')
    .trim();

function toTaak(p) {
  const pr = p.properties ?? {};
  const sel = (k) => pr[k]?.select?.name ?? '';
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

async function fetchNotion(token) {
  const sinds = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const filter = {
    or: [
      { property: 'Status', status: { does_not_equal: 'Done' } },
      { timestamp: 'last_edited_time', last_edited_time: { on_or_after: sinds } },
    ],
  };
  const out = [];
  let cursor;
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`https://api.notion.com/v1/databases/${TAKEN_DB}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter, page_size: 100, start_cursor: cursor }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Enkel de statuscode: de tekst van Notion gaat niet naar de browser of de logs.
      const fout = new Error(`Notion ${res.status}`);
      fout.status = res.status;
      throw fout;
    }
    out.push(...(data.results ?? []).map(toTaak));
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return out;
}

/** Korte uitleg voor in het HQ, zonder details van Notion. */
function korteFout(e) {
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'Notion antwoordt niet.';
  const s = e?.status;
  if (s === 401 || s === 403) return 'Notion weigert de toegang.';
  if (s === 404) return 'De takenlijst is niet gedeeld met het HQ.';
  if (s === 429) return 'Notion is even te druk.';
  return 'Notion is niet bereikbaar.';
}

/** Laatst goede lijst in het geheugen van deze isolate (de cache hieronder is per datacenter). */
let laatstGoed = null;

async function taken(request, env, ctx) {
  const cache = caches.default;
  // Sleutels onder /hq/: dat pad komt altijd eerst langs de Worker, de cache wordt nooit rechtstreeks geserveerd.
  const sleutel = (naam) => new Request(new URL(`/hq/_cache/${naam}`, request.url).toString());
  const vers = await cache.match(sleutel('taken'));
  if (vers) {
    const body = await vers.json().catch(() => null);
    if (body) return json(body);
  }
  if (!env.NOTION_TOKEN) return json({ bron: 'geen', bijgewerkt: null, taken: [], fout: 'Notion is niet gekoppeld (NOTION_TOKEN ontbreekt).' });
  try {
    const lijst = await fetchNotion(env.NOTION_TOKEN);
    const body = { bron: 'notion', bijgewerkt: new Date().toISOString(), taken: lijst };
    laatstGoed = body;
    const tekst = JSON.stringify(body);
    const bewaar = (naam, sec) =>
      cache.put(sleutel(naam), new Response(tekst, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `max-age=${sec}` } }));
    ctx.waitUntil(Promise.all([bewaar('taken', 60), bewaar('laatst-goed', 7 * 86400)]).catch(() => {}));
    return json(body);
  } catch (e) {
    console.error('HQ /hq/taken:', e?.name === 'TimeoutError' ? 'timeout' : e instanceof Error ? e.message : 'onbekende fout');
    const fout = korteFout(e);
    let oud = laatstGoed;
    if (!oud) {
      const hit = await cache.match(sleutel('laatst-goed'));
      oud = hit ? await hit.json().catch(() => null) : null;
    }
    if (oud?.taken) return json({ bron: oud.bron ?? 'notion', bijgewerkt: oud.bijgewerkt, taken: oud.taken, verouderd: true, sinds: oud.bijgewerkt, fout });
    return json({ bron: 'geen', bijgewerkt: null, taken: [], fout });
  }
}

// --- ICE-servers voor de videocall ---

/** TURN-gegevens 10 minuten hergebruiken (ze zijn 1 uur geldig). */
let iceCache = null;

async function ice(env) {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return json({ iceServers: STUN });
  if (iceCache && iceCache.tot > Date.now()) return json({ iceServers: iceCache.iceServers });
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 3600 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`TURN ${res.status}`);
    const iceServers = normaliseerIce((await res.json())?.iceServers);
    if (!iceServers.length) throw new Error('TURN gaf geen bruikbare servers');
    iceCache = { tot: Date.now() + 10 * 60_000, iceServers };
    return json({ iceServers });
  } catch (e) {
    console.error('HQ /hq/ice:', e instanceof Error ? e.message : 'onbekende fout');
    return json({ iceServers: STUN });
  }
}

// --- Signalering ---

/** Enkel onze eigen pagina mag een WebSocket openen (tegen cross-site WebSocket hijacking, review V11). */
function origineOk(origin, url) {
  if (origin === PRODUCTIE) return true;
  if (!origin || !LOKAAL.has(url.hostname)) return false;
  try {
    return LOKAAL.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function signaal(request, env, url, ik) {
  if (request.method !== 'GET' || (request.headers.get('Upgrade') ?? '').toLowerCase() !== 'websocket') return json({ fout: 'Verwacht een WebSocket.' }, 426);
  if (!origineOk(request.headers.get('Origin'), url)) return json({ fout: 'Niet toegestaan.' }, 403);
  // Wie je bent zet de Worker zelf (uit de login); ?wie= of eigen headers van de browser tellen niet.
  const headers = new Headers(request.headers);
  for (const h of ['Cookie', 'Cf-Access-Jwt-Assertion', 'X-HQ-Wie', 'X-HQ-Sid']) headers.delete(h);
  headers.set('X-HQ-Wie', ik.wie);
  headers.set('X-HQ-Sid', crypto.randomUUID());
  const stub = env.KANTOOR.get(env.KANTOOR.idFromName('hq'));
  return stub.fetch(new Request('https://kantoor.intern/signaal', { headers }));
}

async function hq(request, env, ctx, url, ik) {
  switch (url.pathname) {
    case '/hq/ik':
      return request.method === 'GET' ? json({ wie: ik.wie, email: ik.email }) : nietToegestaan();
    case '/hq/taken':
      return request.method === 'GET' ? taken(request, env, ctx) : nietToegestaan();
    case '/hq/ice':
      return request.method === 'GET' ? ice(env) : nietToegestaan();
    case '/hq/signaal':
      return signaal(request, env, url, ik);
    default:
      return json({ fout: 'Niet gevonden.' }, 404);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const ik = await wieBenJe(request, env, url);
    if (!ik) return geenToegang(url);
    if (url.pathname.startsWith('/hq/')) return hq(request, env, ctx, url, ik);
    if (url.pathname === '/activity') return new Response(null, { status: 204 });
    // De takenlijst hoort nooit bij de statische bestanden, ook niet per ongeluk.
    if (url.pathname === '/hq-momentopname.json') return new Response('Niet gevonden.', { status: 404 });
    return env.ASSETS.fetch(request);
  },
};

function stuur(ws, tekst) {
  try {
    if (ws.readyState === OPEN) ws.send(tekst);
  } catch {
    /* al dicht */
  }
}

/**
 * Het kantoor: wie er is, en berichtjes van de ene founder naar de andere.
 * Per tabblad één WebSocket met als bijlage { wie, sid, sinds, belt, gesprek } (overleeft de slaap van het DO).
 */
export class Kantoor extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // "ping" van de browser krijgt meteen "pong", zonder het kantoor wakker te maken.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  /** De open verbindingen: bijlage plus de socket zelf. `zonder` = de verbinding die net sluit. */
  verbindingen(zonder) {
    const uit = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === zonder || ws.readyState !== OPEN) continue;
      const a = ws.deserializeAttachment();
      if (a?.wie && a?.sid) uit.push({ a, ws });
    }
    return uit;
  }

  /** Voert het resultaat van routeer/bijSluiten uit: eerst de bijlagen bijwerken, dan versturen. */
  voerUit({ leveringen, wijzigingen }, open) {
    const perSid = new Map(open.map((v) => [v.a.sid, v]));
    for (const { sid, ...velden } of wijzigingen) {
      const v = perSid.get(sid);
      if (!v) continue;
      v.a = { ...v.a, ...velden };
      try {
        v.ws.serializeAttachment(v.a);
      } catch (e) {
        console.error('HQ kantoor: bijlage niet bewaard:', e instanceof Error ? e.message : 'onbekend');
      }
    }
    for (const { sid, bericht } of leveringen) {
      const v = perSid.get(sid);
      if (v) stuur(v.ws, JSON.stringify(bericht));
    }
  }

  fetch(request) {
    const wie = request.headers.get('X-HQ-Wie') ?? '';
    const sid = request.headers.get('X-HQ-Sid') ?? '';
    if (!founderIds(this.env).has(wie) || !SID_PATROON.test(sid)) return json({ fout: 'Geen toegang.' }, 403);
    if ((request.headers.get('Upgrade') ?? '').toLowerCase() !== 'websocket') return json({ fout: 'Verwacht een WebSocket.' }, 426);

    // Hoogstens 3 tabbladen per persoon: het oudste gaat dicht (code 4000, de browser verbindt dan niet opnieuw).
    const open = this.verbindingen();
    for (const oudSid of teSluiten(open.map((v) => v.a), wie)) {
      const oud = open.find((v) => v.a.sid === oudSid);
      if (oud) this.sluit(oud, open, SLUIT_TE_VEEL, 'Te veel tabbladen open.');
    }

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [wie, sid]);
    server.serializeAttachment(nieuweVerbinding(wie, sid));
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Een verbinding zelf sluiten: eerst opruimen (rinkelen stoppen), dan dicht. */
  sluit(v, open, code, reden) {
    const anderen = open.filter((x) => x !== v);
    this.voerUit(bijSluiten(anderen.map((x) => x.a), v.a), anderen);
    try {
      v.ws.serializeAttachment({ ...v.a, belt: null, gesprek: null });
      v.ws.close(code, reden);
    } catch {
      /* al dicht */
    }
  }

  /** `zonder` = de verbinding die net sluit (die telt niet meer mee). */
  broadcast(zonder) {
    const open = this.verbindingen(zonder);
    const msg = JSON.stringify({ event: 'aanwezig', data: aanwezig(open.map((v) => v.a)) });
    for (const v of open) stuur(v.ws, msg);
  }

  webSocketMessage(ws, raw) {
    if (raw === 'ping') return stuur(ws, 'pong'); // normaal beantwoordt de auto-response dit al
    const ik = ws.deserializeAttachment();
    if (!ik?.wie || !ik?.sid) return;
    const bericht = valideerBericht(raw, ik.wie, founderIds(this.env));
    if (!bericht) return; // ongeldig of onbekend: negeren
    const open = this.verbindingen();
    const gevolg = routeer(
      open.map((v) => v.a),
      ik.sid,
      bericht,
    );
    this.voerUit(gevolg, open);
  }

  weg(ws) {
    const dicht = ws.deserializeAttachment();
    const anderen = this.verbindingen(ws);
    if (dicht?.sid) this.voerUit(bijSluiten(anderen.map((v) => v.a), dicht), anderen);
    this.broadcast(ws);
  }

  webSocketClose(ws) {
    // Met compatibility_date na 2026-04-07 sluit de runtime zelf netjes af (web_socket_auto_reply_to_close).
    this.weg(ws);
  }

  webSocketError(ws, fout) {
    console.error('HQ kantoor: WebSocket-fout:', fout instanceof Error ? fout.message : 'onbekend');
    this.weg(ws);
  }
}
