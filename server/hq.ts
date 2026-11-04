// Het virtuele hoofdkantoor (#/hq): taken uit Notion en de signalering voor de videocall.
// Draait als middleware in de Vite-dev-server (zie vite.config.ts), dus geen extra server of kosten.
//
// /hq/taken    de open taken (en die van de laatste 7 dagen) uit de Notion-database Taken.
//              Live via NOTION_TOKEN als die er is; anders de laatste momentopname in data/hq-taken.json.
// /hq/signaal  GET = live-stroom (aanwezigheid + berichten), POST = bericht naar een collega (WebRTC-aanbod, antwoord, ICE).
//              Het beeld en geluid zelf gaan rechtstreeks van pc naar pc (peer-to-peer), niet via deze server.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Database Taken (zie NOTION.md). */
const TAKEN_DB = '3f1d13408f3180a6905ed38d259f8345';
const CACHE_MS = 60_000;

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
    });
    const data = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok) throw new Error(`Notion-fout ${res.status}: ${data.message ?? res.statusText}`);
    out.push(...(data.results ?? []).map(toTaak));
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return out;
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<Json> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => {
      if (body.length < 200_000) body += c;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

/** Maakt de handlers; `root` is de map van ai-team, `notionToken` komt uit .env (wordt nooit naar de browser gestuurd). */
export function createHq(root: string, notionToken?: string) {
  const snapshot = path.join(root, 'data', 'hq-taken.json');
  let cache: { at: number; body: Json } | null = null;

  async function taken(_req: IncomingMessage, res: ServerResponse) {
    if (cache && Date.now() - cache.at < CACHE_MS) return send(res, 200, cache.body);
    let fout: string | undefined;
    if (notionToken) {
      try {
        const lijst = await fetchNotion(notionToken);
        const body = { bron: 'notion', bijgewerkt: new Date().toISOString(), taken: lijst };
        cache = { at: Date.now(), body };
        // Momentopname bijhouden, zodat het HQ ook zonder verbinding de laatste stand toont.
        mkdirSync(path.dirname(snapshot), { recursive: true });
        writeFileSync(snapshot, JSON.stringify({ bijgewerkt: body.bijgewerkt, taken: lijst }, null, 1));
        return send(res, 200, body);
      } catch (e) {
        fout = (e as Error).message;
      }
    }
    if (existsSync(snapshot)) {
      const snap = JSON.parse(readFileSync(snapshot, 'utf8'));
      const body = { bron: 'momentopname', bijgewerkt: snap.bijgewerkt, taken: snap.taken ?? [], fout };
      cache = { at: Date.now(), body };
      return send(res, 200, body);
    }
    return send(res, 200, { bron: 'geen', bijgewerkt: null, taken: [], fout: fout ?? 'Geen NOTION_TOKEN en nog geen momentopname.' });
  }

  // --- Signalering voor de videocall ---
  const clients = new Map<string, Set<ServerResponse>>();
  const presence = () => [...clients.entries()].filter(([, s]) => s.size).map(([id]) => id);
  const push = (res: ServerResponse, event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const broadcast = () => {
    const online = presence();
    for (const set of clients.values()) for (const r of set) push(r, 'aanwezig', online);
  };

  function stream(req: IncomingMessage, res: ServerResponse, wie: string) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': verbonden\n\n');
    const set = clients.get(wie) ?? new Set();
    set.add(res);
    clients.set(wie, set);
    broadcast();
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => {
      clearInterval(ping);
      set.delete(res);
      broadcast();
    });
  }

  async function signaal(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');
    if (req.method === 'GET') {
      const wie = (url.searchParams.get('wie') ?? '').toLowerCase();
      if (!/^[a-z0-9-]{1,40}$/.test(wie)) return send(res, 400, { fout: 'Wie ben je?' });
      return stream(req, res, wie);
    }
    if (req.method === 'POST') {
      const msg = await readBody(req);
      const naar = String(msg.naar ?? '');
      const targets = clients.get(naar);
      if (!targets?.size) return send(res, 404, { fout: 'Niet online.' });
      for (const r of targets) push(r, 'bericht', { van: String(msg.van ?? ''), soort: String(msg.soort ?? ''), data: msg.data ?? null });
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { fout: 'Niet toegestaan.' });
  }

  return { taken, signaal };
}
