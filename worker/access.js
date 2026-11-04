// De Worker controleert zelf de login van Cloudflare Access (verdediging in de diepte, zie HQ-REVIEW W1 en V4).
// Access zet bij elk verzoek een ondertekend token (JWT) in de header Cf-Access-Jwt-Assertion en in de cookie
// CF_Authorization. We controleren de handtekening (RS256) met de publieke sleutels van ons Access-team, exp en nbf,
// de uitgever (iss), de app (aud) en of het e-mailadres van een founder is. Geen extra pakketten: enkel WebCrypto,
// dat zowel in Workers als in Node bestaat (zo test scripts/hq-worker-test.mjs dit met eigen sleutels).
//
// Instellingen (gewone vars in wrangler.jsonc, geen geheimen):
//   ACCESS_TEAM_DOMAIN  bv. weathered-boat-3ff0.cloudflareaccess.com
//   ACCESS_AUD          de Application Audience (AUD) van de Access-app
//   FOUNDERS            JSON-tekst: { "<e-mailadres>": "<founder-id>", ... }

/** Speling op exp en nbf, voor klokken die een beetje verschillen. */
const SPELING_S = 60;
/** Sleutels opnieuw ophalen: hoogstens één keer per minuut. */
const MIN_TUSSEN_OPHALEN_MS = 60_000;
/** Na een uur halen we de sleutels opnieuw op (Access roteert ze af en toe). */
const SLEUTELS_GELDIG_MS = 60 * 60_000;
const ID_PATROON = /^[a-z0-9-]{1,40}$/;

let foundersBron;
let foundersMap = new Map();

/** FOUNDERS (JSON-tekst of object) als Map van e-mailadres (kleine letters) naar founder-id. */
export function leesFounders(env) {
  const bron = env?.FOUNDERS;
  if (bron === foundersBron) return foundersMap;
  const map = new Map();
  try {
    const obj = typeof bron === 'string' ? JSON.parse(bron) : bron;
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const [email, wie] of Object.entries(obj)) {
        if (typeof wie === 'string' && ID_PATROON.test(wie) && email.includes('@')) map.set(email.trim().toLowerCase(), wie);
      }
    }
  } catch {
    console.error('HQ login: FOUNDERS is geen geldige JSON.');
  }
  foundersBron = bron;
  foundersMap = map;
  return map;
}

/** De founder-id's die in het HQ mogen (de waarden van FOUNDERS). */
export function founderIds(env) {
  return new Set(leesFounders(env).values());
}

/** Het token uit de header, anders uit de cookie CF_Authorization. */
export function haalToken(request) {
  const kop = request.headers.get('Cf-Access-Jwt-Assertion');
  if (kop && kop.trim()) return kop.trim();
  for (const deel of (request.headers.get('Cookie') ?? '').split(';')) {
    const i = deel.indexOf('=');
    if (i > 0 && deel.slice(0, i).trim() === 'CF_Authorization') return deel.slice(i + 1).trim() || null;
  }
  return null;
}

const normaliseerDomein = (d) =>
  String(d ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase();

function base64url(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('geen base64url');
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  const uit = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) uit[i] = bin.charCodeAt(i);
  return uit;
}
const leesJson = (deel) => JSON.parse(new TextDecoder().decode(base64url(deel)));

async function standaardCerts(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`certs ${res.status}`);
  return res.json();
}

/**
 * Maakt een login-controle. Tests geven eigen `haalCerts` (url → JSON met keys) en `nu` (ms) mee;
 * de Worker gebruikt de standaard (fetch naar https://<team>/cdn-cgi/access/certs en de echte klok).
 */
export function maakAccessControle({ haalCerts = standaardCerts, nu = () => Date.now() } = {}) {
  /** Per teamdomein: de ingelezen sleutels (kid → CryptoKey). Blijft in het geheugen van de isolate. */
  const opslag = new Map();

  async function vernieuw(c, domein) {
    if (!c.bezig) {
      c.poging = nu();
      c.bezig = (async () => {
        try {
          const data = await haalCerts(`https://${domein}/cdn-cgi/access/certs`);
          const nieuw = new Map();
          for (const jwk of Array.isArray(data?.keys) ? data.keys : []) {
            if (jwk?.kty !== 'RSA' || typeof jwk.kid !== 'string' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') continue;
            try {
              const sleutel = await crypto.subtle.importKey(
                'jwk',
                { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
                { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
                false,
                ['verify'],
              );
              nieuw.set(jwk.kid, sleutel);
            } catch {
              /* onbruikbare sleutel overslaan */
            }
          }
          if (nieuw.size) {
            c.sleutels = nieuw;
            c.opgehaald = nu();
          } else console.error('HQ login: geen bruikbare sleutels bij Access.');
        } catch (e) {
          // Lukt het niet, dan blijven de vorige sleutels gelden; zonder sleutels komt niemand binnen.
          console.error('HQ login: sleutels van Access niet op te halen:', e instanceof Error ? e.message : 'onbekend');
        } finally {
          c.bezig = null;
        }
      })();
    }
    await c.bezig;
  }

  async function sleutelVoor(domein, kid) {
    let c = opslag.get(domein);
    if (!c) {
      c = { sleutels: new Map(), opgehaald: 0, poging: -Infinity, bezig: null };
      opslag.set(domein, c);
    }
    const oud = nu() - c.opgehaald > SLEUTELS_GELDIG_MS;
    if ((!c.sleutels.has(kid) || oud) && (c.bezig || nu() - c.poging >= MIN_TUSSEN_OPHALEN_MS)) await vernieuw(c, domein);
    return c.sleutels.get(kid) ?? null;
  }

  /** Controleert één token. Geeft { ok: true, email, wie } of { ok: false, reden } (de reden is voor de logs en tests). */
  async function controleerToken(token, env) {
    const nee = (reden) => ({ ok: false, reden });
    const domein = normaliseerDomein(env?.ACCESS_TEAM_DOMAIN);
    const aud = String(env?.ACCESS_AUD ?? '').trim();
    const founders = leesFounders(env);
    if (!domein || !aud || !founders.size) return nee('instellingen ontbreken');
    if (!token) return nee('geen token');
    const delen = token.split('.');
    if (delen.length !== 3) return nee('vorm');
    let kop, inhoud, handtekening;
    try {
      kop = leesJson(delen[0]);
      inhoud = leesJson(delen[1]);
      handtekening = base64url(delen[2]);
    } catch {
      return nee('vorm');
    }
    if (!kop || typeof kop !== 'object' || kop.alg !== 'RS256' || typeof kop.kid !== 'string') return nee('algoritme');
    if (!inhoud || typeof inhoud !== 'object' || Array.isArray(inhoud)) return nee('vorm');

    const sleutel = await sleutelVoor(domein, kop.kid);
    if (!sleutel) return nee('onbekende sleutel');
    const echt = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', sleutel, handtekening, new TextEncoder().encode(`${delen[0]}.${delen[1]}`));
    if (!echt) return nee('handtekening');

    const t = nu() / 1000;
    if (typeof inhoud.exp !== 'number' || t > inhoud.exp + SPELING_S) return nee('verlopen');
    if (inhoud.nbf != null && (typeof inhoud.nbf !== 'number' || t + SPELING_S < inhoud.nbf)) return nee('nog niet geldig');
    if (inhoud.iss !== `https://${domein}`) return nee('uitgever');
    const auds = Array.isArray(inhoud.aud) ? inhoud.aud : [inhoud.aud];
    if (!auds.includes(aud)) return nee('aud');
    const email = typeof inhoud.email === 'string' ? inhoud.email.trim().toLowerCase() : '';
    const wie = founders.get(email);
    if (!wie) return nee('onbekend e-mailadres');
    return { ok: true, email, wie };
  }

  /** Het verzoek van een ingelogde founder? Geeft { email, wie } of null. */
  async function verifyAccess(request, env) {
    const r = await controleerToken(haalToken(request), env);
    if (!r.ok) {
      if (r.reden !== 'geen token') console.error('HQ login geweigerd:', r.reden);
      return null;
    }
    return { email: r.email, wie: r.wie };
  }

  return { verifyAccess, controleerToken };
}

const standaard = maakAccessControle();
/** verifyAccess(request, env) → { email, wie } of null. */
export const verifyAccess = standaard.verifyAccess;
