// Texturen getekend op een canvas: geen downloads, geen licenties, en scherp genoeg voor de Sims-look.
import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

/** Vast zaadje, zodat het gebouw er bij elke reload hetzelfde uitziet. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function make(key: string, size: number, draw: (g: CanvasRenderingContext2D, r: () => number, s: number) => void, repeat: [number, number] = [1, 1], color = true) {
  const k = `${key}:${repeat.join('x')}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, rng([...key].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261) + size), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(k, t);
  return t;
}

const speckle = (g: CanvasRenderingContext2D, r: () => number, s: number, n: number, colors: string[], min = 1, max = 3) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    const w = min + r() * (max - min);
    g.fillRect(r() * s, r() * s, w, w);
  }
};

export const grassTex = (rep: [number, number]) =>
  make('gras', 512, (g, r, s) => {
    g.fillStyle = '#56813a';
    g.fillRect(0, 0, s, s);
    // Grote, zachte vlekken: echt gras is nooit egaal.
    for (let i = 0; i < 40; i++) {
      const x = r() * s;
      const y = r() * s;
      const rad = 40 + r() * 90;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, r() > 0.5 ? 'rgba(120,150,60,0.22)' : 'rgba(40,70,30,0.22)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // Grassprieten.
    for (let i = 0; i < 26000; i++) {
      const x = r() * s;
      const y = r() * s;
      g.strokeStyle = ['#4a7431', '#628f42', '#6f9a4a', '#3f652b', '#7ea456', '#557d38'][Math.floor(r() * 6)];
      g.lineWidth = 0.8 + r() * 0.8;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 4);
      g.stroke();
    }
    // Zachte maaistroken zoals een verzorgd gazon.
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.03)';
      g.fillRect(0, (i * s) / 8, s, s / 8);
    }
  }, rep);

export const gravelTex = (rep: [number, number]) =>
  make('grind', 512, (g, r, s) => {
    g.fillStyle = '#b9b2a6';
    g.fillRect(0, 0, s, s);
    speckle(g, r, s, 14000, ['#a7a094', '#cac4b8', '#d8d3c9', '#958e83', '#c0b49e', '#e3dfd8'], 1.5, 4);
  }, rep);

/** Kasseien in waaiervorm, zoals aan de straatkant van de oprit. */
export const cobbleTex = (rep: [number, number]) =>
  make('kassei', 512, (g, r, s) => {
    g.fillStyle = '#6d6a64';
    g.fillRect(0, 0, s, s);
    const tones = ['#8a857c', '#9a948a', '#7f7a72', '#a39d92', '#8f8a80', '#b0a99c'];
    const R = s / 2;
    for (const [cx, cy] of [
      [0, s], [s, s], [s / 2, s / 2], [0, 0], [s, 0], [-s / 2, s / 2], [(s * 3) / 2, s / 2],
    ] as [number, number][]) {
      for (let ring = 1; ring < 9; ring++) {
        const rad = (ring / 9) * R;
        const n = Math.max(3, Math.floor((Math.PI * rad) / 18));
        for (let i = 0; i < n; i++) {
          const a = Math.PI + (i / n) * Math.PI;
          const x = cx + Math.cos(a) * rad;
          const y = cy + Math.sin(a) * rad;
          g.save();
          g.translate(x, y);
          g.rotate(a + Math.PI / 2);
          g.fillStyle = tones[Math.floor(r() * tones.length)];
          g.beginPath();
          g.roundRect(-8, -6, 16, 12, 4);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.08)';
          g.fillRect(-6, -5, 10, 3);
          g.restore();
        }
      }
    }
  }, rep);

export const brickTex = (rep: [number, number], tint: 'rood' | 'donker' | 'wit' = 'rood') =>
  make(`baksteen-${tint}`, 512, (g, r, s) => {
    const mortar = tint === 'wit' ? '#d9d4cb' : '#cfc6b8';
    const tones =
      tint === 'donker'
        ? ['#4a3b33', '#5a463b', '#3f332d', '#54443a', '#62503f']
        : tint === 'wit'
          ? ['#ece8e1', '#e3ded5', '#f2efe9', '#dcd6cc']
          : ['#9a5a3c', '#a8653f', '#8c4f36', '#b06f48', '#9f5e45', '#87513a', '#b87a52'];
    g.fillStyle = mortar;
    g.fillRect(0, 0, s, s);
    const rows = 16;
    const h = s / rows;
    const w = s / 4;
    for (let y = 0; y < rows; y++) {
      const off = y % 2 ? w / 2 : 0;
      for (let x = -1; x < 5; x++) {
        g.fillStyle = tones[Math.floor(r() * tones.length)];
        g.fillRect(x * w + off + 2, y * h + 2, w - 4, h - 4);
        g.fillStyle = 'rgba(0,0,0,0.06)';
        g.fillRect(x * w + off + 2, y * h + h - 5, w - 4, 3);
      }
    }
  }, rep);

export const roofTex = (rep: [number, number]) =>
  make('dakpan', 512, (g, r, s) => {
    g.fillStyle = '#8f3b26';
    g.fillRect(0, 0, s, s);
    const rows = 12;
    const h = s / rows;
    const cols = 10;
    const w = s / cols;
    const tones = ['#b5543a', '#a84a32', '#c0603f', '#9c442e', '#b85c40', '#a5503a'];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const grad = g.createLinearGradient(0, y * h, 0, y * h + h);
        const c = tones[Math.floor(r() * tones.length)];
        grad.addColorStop(0, c);
        grad.addColorStop(1, '#6e2b1c');
        g.fillStyle = grad;
        g.beginPath();
        g.roundRect(x * w + 1, y * h, w - 2, h - 1, [0, 0, w / 2, w / 2]);
        g.fill();
      }
    }
  }, rep);

export const asphaltTex = (rep: [number, number]) =>
  make('asfalt', 512, (g, r, s) => {
    g.fillStyle = '#8d8f91';
    g.fillRect(0, 0, s, s);
    speckle(g, r, s, 12000, ['#7f8183', '#9a9c9e', '#868889', '#a3a5a6'], 1, 2.5);
  }, rep);

export const woodTex = (rep: [number, number]) =>
  make('parket', 512, (g, r, s) => {
    const tones = ['#c99e6e', '#bf9363', '#d3a978', '#b98c5c', '#cfa273'];
    const plank = s / 8;
    for (let i = 0; i < 8; i++) {
      let y = -r() * 200;
      while (y < s) {
        const len = 160 + r() * 200;
        g.fillStyle = tones[Math.floor(r() * tones.length)];
        g.fillRect(i * plank, y, plank - 2, len - 2);
        g.fillStyle = 'rgba(80,50,20,0.06)';
        for (let k = 0; k < 6; k++) g.fillRect(i * plank + r() * plank, y, 1, len);
        y += len;
      }
    }
  }, rep);

export const concreteTex = (rep: [number, number]) =>
  make('beton', 256, (g, r, s) => {
    g.fillStyle = '#c9c6c0';
    g.fillRect(0, 0, s, s);
    speckle(g, r, s, 3000, ['#c1beb8', '#d1cec8', '#bcb9b3'], 1, 3);
  }, rep);

export const carpetTex = (rep: [number, number], base: string) =>
  make(`tapijt-${base}`, 256, (g, r, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    speckle(g, r, s, 5000, ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.06)'], 1, 2);
  }, rep);

const LEAF = {
  groen: ['#46703a', ['#527f3e', '#3c6430', '#5e8a45', '#335727', '#6a944f']],
  donker: ['#2f4f2a', ['#284524', '#365a2f', '#3f6435', '#1f381b']],
  // Rode beuk, zoals de haag aan de straatkant.
  koper: ['#7a3f2c', ['#8e4a32', '#6b3424', '#a35a3c', '#5c2d20', '#9a6a4a']],
} as const;

export const leafTex = (rep: [number, number], kind: keyof typeof LEAF = 'groen') =>
  make(`blad-${kind}`, 256, (g, r, s) => {
    const [base, tones] = LEAF[kind];
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2200; i++) {
      g.fillStyle = tones[Math.floor(r() * tones.length)];
      g.beginPath();
      g.ellipse(r() * s, r() * s, 2 + r() * 4, 1.5 + r() * 2.5, r() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  }, rep);

/** Zachte gloed achter neon: wit in het midden, doorzichtig naar de randen (wordt ingekleurd). */
export const glowTex = () =>
  make('gloed', 256, (g, _r, s) => {
    g.clearRect(0, 0, s, s);
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  });

/** Witte tegels met donkere voeg (spatwand in de keuken). */
export const tileTex = (rep: [number, number]) =>
  make('tegels', 256, (g, r, s) => {
    g.fillStyle = '#8c8f93';
    g.fillRect(0, 0, s, s);
    const n = 8;
    const t = s / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n * 2; x++) {
        const off = y % 2 ? t / 2 : 0;
        g.fillStyle = ['#f3f3f1', '#eeeeec', '#f6f6f4'][Math.floor(r() * 3)];
        g.fillRect(x * (t / 2) * 2 - off + 1, y * t + 1, t - 2, t - 2);
      }
  }, rep);

/** Zwarte golfplaat (gevelbekleding van een warehouse): verticale ribben met licht en schaduw. */
export const corrugatedTex = (rep: [number, number]) =>
  make('golfplaat', 512, (g, _r, s) => {
    const ribs = 16;
    const rw = s / ribs;
    for (let i = 0; i < ribs; i++) {
      const grad = g.createLinearGradient(i * rw, 0, (i + 1) * rw, 0);
      grad.addColorStop(0, '#1c1f23');
      grad.addColorStop(0.35, '#3a3f45');
      grad.addColorStop(0.5, '#4a5057');
      grad.addColorStop(0.65, '#33383e');
      grad.addColorStop(1, '#1a1d21');
      g.fillStyle = grad;
      g.fillRect(i * rw, 0, rw, s);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, s - 3, s, 3);
  }, rep);

/** Houten gevelbekleding (ceder), verticale planken. */
export const cedarTex = (rep: [number, number]) =>
  make('ceder', 512, (g, r, s) => {
    const tones = ['#a8704a', '#b77c52', '#9c6644', '#c08658', '#a36b47'];
    const n = 12;
    const pw = s / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = tones[Math.floor(r() * tones.length)];
      g.fillRect(i * pw, 0, pw, s);
      for (let k = 0; k < 10; k++) {
        g.strokeStyle = `rgba(70,40,20,${0.08 + r() * 0.1})`;
        g.lineWidth = 0.8;
        g.beginPath();
        const x = i * pw + r() * pw;
        g.moveTo(x, 0);
        g.lineTo(x + (r() - 0.5) * 6, s);
        g.stroke();
      }
      g.fillStyle = 'rgba(30,15,5,0.5)';
      g.fillRect(i * pw + pw - 3, 0, 3, s);
    }
  }, rep);

/** Betonnen wandpanelen met naden en bekistingsgaatjes (binnenkant van het warehouse). */
export const concretePanelTex = (rep: [number, number]) =>
  make('betonpaneel', 512, (g, r, s) => {
    g.fillStyle = '#b9b6b0';
    g.fillRect(0, 0, s, s);
    speckle(g, r, s, 6000, ['#b1aea8', '#c2bfb9', '#aaa7a1', '#bdbab4'], 1, 3);
    for (let i = 0; i < 18; i++) {
      const x = r() * s;
      const y = r() * s;
      const rad = 30 + r() * 80;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, r() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.fillStyle = 'rgba(60,58,55,0.55)';
    g.fillRect(0, 0, s, 3);
    g.fillRect(0, 0, 3, s);
    g.fillStyle = 'rgba(70,68,65,0.6)';
    for (const [x, y] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]] as [number, number][]) {
      g.beginPath();
      g.arc(x * s, y * s, 4, 0, Math.PI * 2);
      g.fill();
    }
  }, rep);

/** Notenhouten lambrisering: verticale latten met nerf, warm en donker (mid-century). */
export const walnutTex = (rep: [number, number]) =>
  make('noten', 512, (g, r, s) => {
    const tones = ['#6b4228', '#734a2d', '#5f3a23', '#7a4f31', '#68412a'];
    const n = 10;
    const pw = s / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = tones[Math.floor(r() * tones.length)];
      g.fillRect(i * pw, 0, pw, s);
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(40,22,12,${0.08 + r() * 0.12})`;
        g.lineWidth = 0.6 + r() * 1.2;
        g.beginPath();
        const x = i * pw + r() * pw;
        g.moveTo(x, 0);
        g.bezierCurveTo(x + (r() - 0.5) * 8, s / 3, x + (r() - 0.5) * 8, (2 * s) / 3, x + (r() - 0.5) * 6, s);
        g.stroke();
      }
      g.fillStyle = 'rgba(20,10,5,0.55)';
      g.fillRect(i * pw + pw - 2, 0, 2, s);
    }
  }, rep);

/** Computerscherm met een donkere interface: zijbalk, vensters en tekstregels, met een accent in de statuskleur. */
export const screenTex = (accent: string) =>
  make(`scherm-${accent}`, 256, (g, r, s) => {
    g.fillStyle = '#0d1420';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#121c2b';
    g.fillRect(0, 0, s * 0.18, s);
    g.fillStyle = accent;
    g.fillRect(0, 0, s, s * 0.035);
    for (let i = 0; i < 7; i++) {
      g.fillStyle = i === 1 ? accent : 'rgba(170,184,194,0.35)';
      g.fillRect(s * 0.03, s * (0.1 + i * 0.07), s * 0.12, s * 0.02);
    }
    const cards: [number, number, number, number][] = [
      [0.22, 0.08, 0.36, 0.3],
      [0.61, 0.08, 0.36, 0.3],
      [0.22, 0.43, 0.75, 0.5],
    ];
    for (const [x, y, w, hh] of cards) {
      g.fillStyle = '#16233a';
      g.fillRect(x * s, y * s, w * s, hh * s);
      for (let l = 0; l < 5; l++) {
        g.fillStyle = l === 0 ? 'rgba(255,255,255,0.75)' : 'rgba(170,184,194,0.4)';
        g.fillRect((x + 0.02) * s, (y + 0.04 + l * 0.05) * s, (w - 0.04) * s * (0.4 + r() * 0.6), s * 0.015);
      }
    }
    g.fillStyle = accent;
    for (let b = 0; b < 10; b++) {
      const bh = 0.05 + r() * 0.18;
      g.globalAlpha = 0.8;
      g.fillRect((0.26 + b * 0.068) * s, (0.9 - bh) * s, s * 0.04, bh * s);
    }
    g.globalAlpha = 1;
  });

/** Zachte stapelwolk (doorzichtige randen), voor sprites aan de hemel. */
export const cloudTex = (variant = 0) =>
  make(`wolk-${variant}`, 512, (g, r, s) => {
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      const x = s * (0.18 + r() * 0.64);
      const y = s * (0.38 + r() * 0.3 - (Math.abs(x / s - 0.5) < 0.2 ? 0.08 : 0));
      const rad = s * (0.06 + r() * 0.12);
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      const shade = 235 + Math.floor(r() * 20);
      grd.addColorStop(0, `rgba(${shade},${shade},${shade + 5},0.55)`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  });

/** Antraciet staande-naaddak van het HQ. */
export const zincTex = (rep: [number, number]) =>
  make('zink', 256, (g, r, s) => {
    g.fillStyle = '#3d434a';
    g.fillRect(0, 0, s, s);
    speckle(g, r, s, 1500, ['#41474e', '#393f46'], 1, 3);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = '#2c3137';
      g.fillRect(0, (i * s) / 8, s, 3);
      g.fillStyle = '#545b63';
      g.fillRect(0, (i * s) / 8 + 3, s, 2);
    }
  }, rep);

/** Het merkverloop blauw → cyaan → mint, voor de ledstrips in de gevel. */
export const brandGradientTex = () =>
  make('merk', 256, (g, _r, s) => {
    const grad = g.createLinearGradient(0, 0, s, 0);
    grad.addColorStop(0, '#2f7bff');
    grad.addColorStop(0.48, '#13c7e6');
    grad.addColorStop(1, '#2ff0a6');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });

/** Omgeploegde akker: bruine aarde met voren en trekkersporen. */
export const plowedTex = (rep: [number, number]) =>
  make('akker', 512, (g, r, s) => {
    g.fillStyle = '#8a6a4c';
    g.fillRect(0, 0, s, s);
    speckle(g, r, s, 9000, ['#7c5e42', '#977658', '#6f5339', '#a0805f'], 1, 3);
    const rows = 22;
    for (let i = 0; i < rows; i++) {
      const y = (i / rows) * s;
      g.fillStyle = 'rgba(60,40,24,0.35)';
      g.fillRect(0, y, s, s / rows / 3);
      g.fillStyle = 'rgba(190,160,120,0.18)';
      g.fillRect(0, y + s / rows / 2, s, s / rows / 5);
    }
  }, rep);

/** Rijp graan: goudgeel met lichte zaairijen. */
export const wheatTex = (rep: [number, number]) =>
  make('graan', 512, (g, r, s) => {
    g.fillStyle = '#c9b06a';
    g.fillRect(0, 0, s, s);
    speckle(g, r, s, 14000, ['#bfa45c', '#d6bf7c', '#b39a54', '#dcc88a'], 1, 2.5);
    for (let i = 0; i < 32; i++) {
      g.fillStyle = 'rgba(150,120,60,0.16)';
      g.fillRect(0, (i / 32) * s, s, 3);
    }
  }, rep);

/** Jong gewas: groene zaairijen op lichte grond. */
export const cropTex = (rep: [number, number]) =>
  make('gewas', 512, (g, r, s) => {
    g.fillStyle = '#7c9a4a';
    g.fillRect(0, 0, s, s);
    speckle(g, r, s, 9000, ['#6f8d40', '#8aa858', '#678537'], 1, 2.5);
    for (let i = 0; i < 28; i++) {
      g.fillStyle = 'rgba(120,100,60,0.22)';
      g.fillRect(0, (i / 28) * s, s, 4);
    }
  }, rep);

/** Leien dak: donkergrijze schubben in rijen. */
export const slateTex = (rep: [number, number]) =>
  make('leien', 512, (g, r, s) => {
    g.fillStyle = '#3d4248';
    g.fillRect(0, 0, s, s);
    const rows = 16;
    const h = s / rows;
    const cols = 12;
    const w = s / cols;
    const tones = ['#4a5057', '#41464c', '#52585f', '#3a3f45'];
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * (w / 2);
      for (let x = -1; x < cols; x++) {
        g.fillStyle = tones[Math.floor(r() * tones.length)];
        g.fillRect(x * w + off + 1, y * h, w - 2, h - 1.5);
      }
    }
  }, rep);
