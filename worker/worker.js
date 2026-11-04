// Het HQ online (fase 2): zelfde app als lokaal, maar de dev-server wordt een Cloudflare Worker.
// /hq/taken    taken uit Notion (geheim NOTION_TOKEN), anders de momentopname die mee gebouwd werd.
// /hq/signaal  WebSocket naar het Durable Object "Kantoor": aanwezigheid en call-berichtjes.
// /activity    bestaat online niet (het activiteitslog staat op de pc); 204 = de browser stopt met proberen.
// Login: Cloudflare Access staat vóór het hele adres, deze Worker ziet enkel ingelogde mensen.
import { DurableObject } from 'cloudflare:workers';

const TAKEN_DB = '3f1d13408f3180a6905ed38d259f8345';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

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
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Notion-fout ${res.status}: ${data.message ?? res.statusText}`);
    out.push(...(data.results ?? []).map(toTaak));
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return out;
}

async function taken(request, env, ctx) {
  const cache = caches.default;
  const key = new Request(new URL('/hq/taken', request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  let fout;
  if (env.NOTION_TOKEN) {
    try {
      const lijst = await fetchNotion(env.NOTION_TOKEN);
      const res = json({ bron: 'notion', bijgewerkt: new Date().toISOString(), taken: lijst });
      const cached = new Response(res.clone().body, res);
      cached.headers.set('Cache-Control', 'max-age=60');
      ctx.waitUntil(cache.put(key, cached));
      return res;
    } catch (e) {
      fout = e.message;
    }
  }
  // Terugval: momentopname die bij de build in dist/ gezet werd (enkel achter Access bereikbaar).
  const snap = await env.ASSETS.fetch(new Request(new URL('/hq-momentopname.json', request.url)));
  if (snap.ok && (snap.headers.get('Content-Type') ?? '').includes('json')) {
    const d = await snap.json();
    return json({ bron: 'momentopname', bijgewerkt: d.bijgewerkt, taken: d.taken ?? [], fout });
  }
  return json({ bron: 'geen', bijgewerkt: null, taken: [], fout: fout ?? 'Geen NOTION_TOKEN en geen momentopname.' });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/activity') return new Response(null, { status: 204 });
    if (url.pathname === '/hq/taken') return taken(request, env, ctx);
    if (url.pathname === '/hq/signaal') {
      if (request.headers.get('Upgrade') !== 'websocket') return json({ fout: 'Verwacht een WebSocket.' }, 426);
      const stub = env.KANTOOR.get(env.KANTOOR.idFromName('hq'));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

/** Het kantoor: wie er is, en berichtjes van de ene founder naar de andere. */
export class Kantoor extends DurableObject {
  fetch(request) {
    const wie = (new URL(request.url).searchParams.get('wie') ?? '').toLowerCase();
    if (!/^[a-z0-9-]{1,40}$/.test(wie)) return json({ fout: 'Wie ben je?' }, 400);
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [wie]);
    this.broadcast();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /** `zonder` = de verbinding die net sluit (die telt niet meer mee). */
  broadcast(zonder) {
    const open = this.ctx.getWebSockets().filter((ws) => ws !== zonder);
    const msg = JSON.stringify({ event: 'aanwezig', data: [...new Set(open.flatMap((ws) => this.ctx.getTags(ws)))] });
    for (const ws of open) {
      try {
        ws.send(msg);
      } catch {
        /* al dicht */
      }
    }
  }

  webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    const van = this.ctx.getTags(ws)[0];
    const targets = this.ctx.getWebSockets(String(msg.naar ?? ''));
    if (!targets.length) return ws.send(JSON.stringify({ event: 'niet-online', data: { naar: msg.naar, soort: msg.soort } }));
    const out = JSON.stringify({ event: 'bericht', data: { van, soort: String(msg.soort ?? ''), data: msg.data ?? null } });
    for (const t of targets) t.send(out);
  }

  webSocketClose(ws, code) {
    try {
      ws.close(code, 'dicht');
    } catch {
      /* al dicht */
    }
    this.broadcast(ws);
  }

  webSocketError(ws) {
    this.broadcast(ws);
  }
}
