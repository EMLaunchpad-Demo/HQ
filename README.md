# EM Launchpad HQ

Het virtuele hoofdkantoor van EM Launchpad in 3D: een warehouse met een glazen ruimte per afdeling van het AI-team, een arena met de War Room, een lounge en de kantoren van de founders. Het toont live de taken uit Notion, en de founders kunnen elkaar bellen vanuit hun kantoor (WebRTC, rechtstreeks van pc naar pc).

Gebouwd met React, Three.js (React Three Fiber) en Tailwind. Online draait het als Cloudflare Worker **`hq`** met statische bestanden en een Durable Object voor de videocall, achter Cloudflare Access. Alles op het gratis plan.

> Deze repo wordt aangemaakt vanuit de map `ai-team` met `npm run hq:export`. Pas het HQ daar aan en exporteer opnieuw; wijzigingen rechtstreeks hier worden bij de volgende export overschreven.

## Lokaal draaien
```bash
npm install
npm run dev
```
Open `http://localhost:5173`. Lokaal is er geen login: je kiest zelf wie je bent. Met een `NOTION_TOKEN` in een lokaal `.env`-bestand (nooit in de repo) komen de taken live uit Notion.

## Online (Workers Builds)
- Cloudflare bouwt en zet online bij elke push naar `main`: build `npm run build`, deploy `npx wrangler deploy`, Worker `hq`, adres `hq.emlaunchpad.com` (eigen domein, staat in `wrangler.jsonc`). Er is geen andere weg naar online.
- **Login:** Cloudflare Access staat voor het hele adres. De Worker controleert het login-token van Access zelf nog eens (handtekening, AUD-tag, vervaldatum) en zet het e-mailadres om naar wie je bent (`FOUNDERS` in `wrangler.jsonc`). Zonder geldige login: geen toegang.
- **Secrets** (enkel in het dashboard: Worker `hq` → Settings → Variables and Secrets, type Secret):
  - `NOTION_TOKEN`: de taken uit Notion. Zonder token toont het HQ "Notion is niet bereikbaar".
  - `TURN_KEY_ID` en `TURN_KEY_API_TOKEN` (optioneel): TURN van Cloudflare voor de videocall. Zonder enkel STUN.
- Het stappenplan en de uitleg staan in `ai-team` (`HQ.md` en `HQ-STAPPENPLAN-MARTIJN.md`).

## Veiligheid
- `workers_dev` en `preview_urls` staan uit in `wrangler.jsonc`, en `run_worker_first` staat aan: elk verzoek gaat eerst langs de login-controle. Zet dat niet anders.
- Geen geheimen in de repo. Tokens staan enkel als Secret in Cloudflare (en lokaal in `.env`, dat genegeerd wordt).
- Geen taken of klantgegevens in de repo: de taken komen enkel live uit Notion, achter de login. Het enige persoonsgegeven zijn de e-mailadressen van de founders in `FOUNDERS` (`wrangler.jsonc`). Hou de repo daarom privé.
