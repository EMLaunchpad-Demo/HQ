import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createHq } from './server/hq';

/** Lokaal ontwikkelen: /hq/ik, /hq/taken, /hq/ice en /hq/signaal zoals online (de Worker doet dat in productie). */
function hq(): Plugin {
  return {
    name: 'hoofdkantoor',
    configureServer(server) {
      const { NOTION_TOKEN } = loadEnv(server.config.mode, server.config.root, '');
      const h = createHq(server.config.root, NOTION_TOKEN || undefined);
      server.middlewares.use((req, res, next) => h.middleware(req, res, next));
      server.middlewares.use('/activity', (_req, res) => void res.writeHead(204).end());
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), hq()],
  // Het HQ staat los: geen link terug naar het organigram van het dashboard.
  define: { 'import.meta.env.VITE_HQ_LOS': JSON.stringify('1') },
});
