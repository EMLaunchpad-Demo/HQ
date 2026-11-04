# EM Launchpad HQ

Het virtuele hoofdkantoor van EM Launchpad in 3D: een warehouse met een glazen ruimte per afdeling van het AI-team, een arena met de War Room, een lounge en de kantoren van de founders. Het toont live de taken uit Notion, en de founders kunnen elkaar bellen vanuit hun kantoor (WebRTC, rechtstreeks van pc naar pc).

Gebouwd met React, Three.js (React Three Fiber) en Tailwind. Online draait het als Cloudflare Worker met statische bestanden en een Durable Object voor de videocall. Alles op het gratis plan.

> Deze repo wordt aangemaakt vanuit de map `ai-team` met `node scripts/hq-export.mjs`. Pas het HQ daar aan en exporteer opnieuw; wijzigingen rechtstreeks hier worden bij de volgende export overschreven.

## Lokaal draaien
```bash
npm install
npm run dev
```
Open `http://localhost:5173`. Met een `NOTION_TOKEN` in een lokaal `.env`-bestand (nooit in de repo) komen de taken live uit Notion.

## Cloudflare koppelen (Workers Builds)
**Eerst de login, dan pas koppelen.** Anders staat het HQ even zonder login online.

1. **Login instellen:** stappen 1 tot 3 in `HQ-STAPPENPLAN-MARTIJN.md`, in de gedeelde map `ai-team`.
   - Microsoft Entra-app aanmaken.
   - Microsoft als loginmethode in Cloudflare Zero Trust.
   - Access-applicatie op `hq.emlaunchpad.com`, enkel voor de founders.
2. **Repo koppelen:** Cloudflare-dashboard → **Workers & Pages → Create → Import a repository** → GitHub-account `EMLaunchpad-Demo` → repo `HQ`.
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Root directory: `/` (leeg laten)
3. **Geheim toevoegen:** na de eerste build, bij de Worker `em-launchpad-hq` → **Settings → Variables and Secrets** → **Secret** `NOTION_TOKEN`, met het token van de interne Notion-integratie `EM Launchpad HQ`.
   - Zonder token toont het HQ online geen taken.
4. **Adres:** `hq.emlaunchpad.com` staat in `wrangler.jsonc` en wordt bij de eerste deploy als eigen domein gekoppeld. `emlaunchpad.com` moet in hetzelfde Cloudflare-account zitten.

Elke push naar de hoofdbranch zet daarna automatisch de nieuwe versie online.

## Veiligheid
- `workers_dev` en `preview_urls` staan uit in `wrangler.jsonc`. Zet ze niet aan: het HQ is enkel bedoeld achter de login (Cloudflare Access).
- Geen geheimen in de repo. Het Notion-token staat enkel als Secret in Cloudflare (en lokaal in `.env`, dat genegeerd wordt).
- De repo bevat geen taken, klantgegevens of persoonsgegevens. De taken komen bij het openen live uit Notion.
