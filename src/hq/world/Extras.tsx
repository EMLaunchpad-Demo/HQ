// Merk en extra ruimtes in het HQ: neon in de huisstijl, de pingpong-arena, content studio met podcast,
// de grote keuken met lounge, en de fitness boven. Coördinaten zijn lokaal in de hal (midden = 0, voorgevel = +z).
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { RoundedBox, Text } from '@react-three/drei';
import { FONT, FONT_MONO } from '../fonts';
import { brandGradientTex, carpetTex, glowTex, tileTex, walnutTex, woodTex } from '../textures';
import { Chair, Plant, Rug, Shelf, Sofa } from './Furniture';
import { B, ROOM_H, steelMat } from './dims';
import { CUT, useCut } from './cut';
import { GlassFront } from './parts';
import logoUrl from '../assets/em-logo-gevel.png';

const { W, D, MZ, MD } = B;
const IX = W / 2 - MD;
const IZ = D / 2 - MD;

export const BRAND = { blue: '#2f7bff', cyan: '#13c7e6', mint: '#2ff0a6', navy: '#0b1526' };

const M = {
  black: new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.4, metalness: 0.5 }),
  matte: new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.8 }),
  white: new THREE.MeshStandardMaterial({ color: '#f4f3f0', roughness: 0.7 }),
  cyc: new THREE.MeshStandardMaterial({ color: '#f7f7f5', roughness: 0.95, side: THREE.DoubleSide }),
  chrome: new THREE.MeshStandardMaterial({ color: '#d7dadd', roughness: 0.15, metalness: 1 }),
  stone: new THREE.MeshStandardMaterial({ color: '#e9e6e0', roughness: 0.35 }),
  dark: new THREE.MeshStandardMaterial({ color: '#2b2f35', roughness: 0.5, metalness: 0.2 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#1d2024', roughness: 0.95 }),
  navy: new THREE.MeshStandardMaterial({ color: '#122040', roughness: 0.7 }),
  felt: new THREE.MeshStandardMaterial({ color: '#2a3550', roughness: 1 }),
  mirror: new THREE.MeshStandardMaterial({ color: '#dfe6ea', roughness: 0.04, metalness: 1 }),
  screen: new THREE.MeshStandardMaterial({ color: '#05070b', emissive: '#13c7e6', emissiveIntensity: 0.35, roughness: 0.2 }),
  lamp: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff1d6', emissiveIntensity: 2 }),
  soft: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.4, side: THREE.DoubleSide }),
  leather: new THREE.MeshStandardMaterial({ color: '#6b4428', roughness: 0.55 }),
  boucle: new THREE.MeshStandardMaterial({ color: '#e6e0d6', roughness: 1 }),
};

// --- Neon ---

/** Neonletters: zelflichtend (niet getint door de belichting) met een zachte gloed erachter. */
export function Neon({ text, color, size = 0.5, font = FONT, glow = 1, ...g }: { text: string; color: string; size?: number; font?: string; glow?: number } & JSX.IntrinsicElements['group']) {
  const w = text.length * size * 0.72 + size * 1.6;
  return (
    <group {...g}>
      <mesh position-z={-0.01}>
        <planeGeometry args={[w, size * 2.6]} />
        <meshBasicMaterial map={glowTex()} color={color} transparent opacity={0.55 * glow} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <Text font={font} fontSize={size} letterSpacing={0.08} anchorY="middle" outlineWidth={size * 0.06} outlineColor={color} outlineBlur={size * 0.25} outlineOpacity={0.6}>
        {text}
        <meshBasicMaterial color={new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.55)} toneMapped={false} />
      </Text>
    </group>
  );
}

/** Rechte neonbuis (ledstrip) in een merkkleur of het merkverloop. */
export function NeonBar({ len, color, thick = 0.05, ...g }: { len: number; color?: string; thick?: number } & JSX.IntrinsicElements['group']) {
  return (
    <group {...g}>
      <mesh>
        <boxGeometry args={[len, thick, thick]} />
        {color ? <meshBasicMaterial color={color} toneMapped={false} /> : <meshBasicMaterial map={brandGradientTex()} toneMapped={false} />}
      </mesh>
      <mesh position-z={-0.005}>
        <planeGeometry args={[len + thick * 8, thick * 9]} />
        <meshBasicMaterial map={glowTex()} color={color ?? BRAND.cyan} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Groot neonlogo op de achtergevel, boven de kantoren: blijft in elke weergave staan. */
export function BrandWall() {
  return (
    <group position={[0, 0, -D / 2 + 0.05]}>
      <mesh position={[0, 7.75, -0.02]}>
        <planeGeometry args={[21, 2.6]} />
        <meshStandardMaterial color="#0d131d" roughness={0.6} metalness={0.3} />
      </mesh>
      <Neon text="EM LAUNCHPAD" color={BRAND.cyan} size={1.05} position={[0, 8.15, 0]} />
      <NeonBar len={15} position={[0, 7.3, 0.02]} thick={0.07} />
      <Text font={FONT_MONO} fontSize={0.27} letterSpacing={0.18} color="#cfe9f2" position={[0, 6.92, 0.02]} anchorY="middle">
        JIJ DOET JE VAK. JE SYSTEEM DOET DE REST.
        <meshBasicMaterial color="#cfe9f2" toneMapped={false} />
      </Text>
    </group>
  );
}

/** Ledstrip in het merkverloop langs de rand van de tussenverdieping, rondom de arena. */
export function MezzLed() {
  const y = MZ - 0.3;
  return (
    <group>
      <NeonBar len={IX * 2} position={[0, y, -IZ + 0.07]} />
      <NeonBar len={IX * 2} position={[0, y, IZ - 0.07]} rotation-y={Math.PI} />
      <NeonBar len={IZ * 2} position={[-IX + 0.07, y, 0]} rotation-y={Math.PI / 2} />
      <NeonBar len={IZ * 2} position={[IX - 0.07, y, 0]} rotation-y={-Math.PI / 2} />
    </group>
  );
}

/** Logo in de betonvloer tussen de inkom en de War Room. */
export function FloorLogo() {
  return (
    <group position={[0, 0.045, 7.1]} rotation-x={-Math.PI / 2}>
      <Text font={FONT} fontSize={0.6} letterSpacing={0.3} color="#1c2a3d" anchorY="middle">
        EM LAUNCHPAD
      </Text>
      <mesh position-y={-0.5}>
        <planeGeometry args={[6.4, 0.06]} />
        <meshBasicMaterial map={brandGradientTex()} toneMapped={false} />
      </mesh>
    </group>
  );
}

// --- Logo op de gevel ---

const LOGO_BG = '#171b25';
const LOGO_RATIO = 296 / 428;
let logoTex: THREE.CanvasTexture | null = null;
let logoWait: Promise<THREE.CanvasTexture> | null = null;

/** Het logo als textuur; de randen lopen over in de kleur van het bord, zodat er geen kader van de foto zichtbaar is. */
function loadLogo() {
  logoWait ??= new Promise((done) => {
    const img = new Image();
    img.onload = () => {
      const w = 1024;
      const h = Math.round(w * LOGO_RATIO);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!;
      g.fillStyle = LOGO_BG;
      g.fillRect(0, 0, w, h);
      g.drawImage(img, 0, 0, w, h);
      const edge = (x0: number, y0: number, x1: number, y1: number) => {
        const grd = g.createLinearGradient(x0, y0, x1, y1);
        grd.addColorStop(0, LOGO_BG);
        grd.addColorStop(1, 'rgba(23,27,37,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, w, h);
      };
      const m = w * 0.05;
      edge(0, 0, m, 0);
      edge(w, 0, w - m, 0);
      edge(0, 0, 0, m);
      edge(0, h, 0, h - m);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      logoTex = t;
      done(t);
    };
    img.src = logoUrl;
  });
  return logoWait;
}

function useLogo() {
  const [tex, setTex] = useState(logoTex);
  useEffect(() => {
    if (!tex) void loadLogo().then(setTex);
  }, [tex]);
  return tex;
}

/** Verlicht lichtbakbord met het logo: zwart stalen kader, het logo zelflichtend, een gloed op de muur erachter. */
export function LogoSign({ w, ...g }: { w: number } & JSX.IntrinsicElements['group']) {
  const tex = useLogo();
  const h = w * LOGO_RATIO;
  return (
    <group {...g}>
      <mesh position-z={-0.02}>
        <planeGeometry args={[w * 1.5, h * 1.6]} />
        <meshBasicMaterial map={glowTex()} color={BRAND.cyan} transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position-z={0.08} material={steelMat} castShadow>
        <boxGeometry args={[w + 0.24, h + 0.24, 0.16]} />
      </mesh>
      <mesh position-z={0.165}>
        <planeGeometry args={[w, h]} />
        {tex ? <meshBasicMaterial map={tex} toneMapped={false} /> : <meshBasicMaterial color={LOGO_BG} />}
      </mesh>
      <NeonBar len={w + 0.24} thick={0.03} position={[0, -h / 2 - 0.16, 0.12]} />
    </group>
  );
}

/** Het logo buiten: groot op de zijgevel naar de parking, op de cederhouten kop van de voorgevel en naast de naam op de daklijst. */
export function FacadeLogos() {
  if (useCut() !== 'geen') return null;
  return (
    <group>
      <LogoSign w={6} position={[W / 2 + 0.5, 3.05, 0]} rotation-y={Math.PI / 2} />
      <LogoSign w={2.9} position={[W / 2 - 1.6, 6.3, D / 2 + 0.37]} />
      <LogoSign w={0.62} position={[-3.3, B.H - 0.33, D / 2 + 0.16]} />
    </group>
  );
}

// --- Pingpong-arena ---

/** Neon-arena rond de pingpongtafel: donkere sportvloer, lichtlijnen, palen, een portaal met de naam en een tribune. */
export function ArenaCourt({ position }: { position: [number, number, number] }) {
  const cw = 6.8;
  const cd = 5.4;
  const posts: [number, number, string][] = [
    [-cw / 2, -cd / 2, BRAND.blue],
    [cw / 2, -cd / 2, BRAND.mint],
    [-cw / 2, cd / 2, BRAND.cyan],
    [cw / 2, cd / 2, BRAND.blue],
  ];
  return (
    <group position={position}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.035} receiveShadow material={M.navy}>
        <planeGeometry args={[cw, cd]} />
      </mesh>
      {/* Lichtlijnen in de vloer */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, (s * cd) / 2]}>
            <planeGeometry args={[cw, 0.07]} />
            <meshBasicMaterial map={brandGradientTex()} toneMapped={false} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} rotation-z={Math.PI / 2} position={[(s * cw) / 2, 0.04, 0]}>
            <planeGeometry args={[cd, 0.07]} />
            <meshBasicMaterial color={s < 0 ? BRAND.blue : BRAND.mint} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <mesh rotation-x={-Math.PI / 2} position-y={0.04}>
        <ringGeometry args={[1.95, 2.0, 64]} />
        <meshBasicMaterial color={BRAND.cyan} toneMapped={false} transparent opacity={0.8} />
      </mesh>
      {/* Neonpalen op de hoeken */}
      {posts.map(([x, z, c]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh position-y={1.1}>
            <cylinderGeometry args={[0.04, 0.04, 2.2, 8]} />
            <meshBasicMaterial color={c} toneMapped={false} />
          </mesh>
          <mesh position-y={0.04} material={M.black}>
            <cylinderGeometry args={[0.14, 0.16, 0.08, 16]} />
          </mesh>
        </group>
      ))}
      {/* Portaal achteraan met de naam en een scorebord */}
      <group position-z={-cd / 2 - 0.15}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (cw / 2 - 0.4), 1.5, 0]} material={steelMat} castShadow>
            <boxGeometry args={[0.16, 3, 0.16]} />
          </mesh>
        ))}
        <mesh position={[0, 2.95, 0]} material={steelMat}>
          <boxGeometry args={[cw - 0.6, 0.18, 0.2]} />
        </mesh>
        <mesh position={[0, 2.35, -0.06]}>
          <boxGeometry args={[4.6, 0.95, 0.06]} />
          <meshStandardMaterial color="#070b13" roughness={0.5} />
        </mesh>
        <Neon text="EML ARENA" color={BRAND.cyan} size={0.46} position={[-0.45, 2.36, 0]} />
        <group position={[1.75, 2.35, 0]}>
          <mesh position-z={-0.01}>
            <planeGeometry args={[0.9, 0.62]} />
            <meshBasicMaterial color="#03060a" />
          </mesh>
          <Text font={FONT_MONO} fontSize={0.24} position-z={0.01} anchorY="middle">
            11 : 9
            <meshBasicMaterial color={BRAND.mint} toneMapped={false} />
          </Text>
        </group>
        <NeonBar len={cw - 1} position={[0, 2.82, 0.12]} thick={0.04} />
      </group>
      {/* Tribune aan de zijkant */}
      <group position={[cw / 2 + 1.1, 0, 0]} rotation-y={-Math.PI / 2}>
        {[0, 1, 2].map((i) => (
          <group key={i} position={[0, 0, -i * 0.5]}>
            <mesh position-y={(i + 1) * 0.2} material={M.dark} castShadow receiveShadow>
              <boxGeometry args={[4.2, (i + 1) * 0.4, 0.5]} />
            </mesh>
            <mesh position={[0, (i + 1) * 0.4 + 0.03, 0]} material={M.navy}>
              <boxGeometry args={[4.1, 0.06, 0.42]} />
            </mesh>
            <NeonBar len={4.2} color={i === 1 ? BRAND.mint : BRAND.cyan} thick={0.025} position={[0, (i + 1) * 0.4 - 0.05, 0.26]} />
          </group>
        ))}
      </group>
      <pointLight position={[0, 2.4, 0]} color={BRAND.cyan} intensity={7} distance={8} decay={2} />
    </group>
  );
}

// --- Content studio en podcast (gelijkvloers, rechts vooraan) ---

/** Studiomicrofoon aan een arm, vast aan de tafelrand. */
function MicArm({ angle }: { angle: number }) {
  return (
    <group rotation-y={angle}>
      <group position={[0, 0.78, 0.55]}>
        <mesh position-y={0.12} material={M.black}>
          <cylinderGeometry args={[0.012, 0.012, 0.24, 6]} />
        </mesh>
        <mesh position={[0, 0.3, 0.12]} rotation-x={0.9} material={M.black}>
          <cylinderGeometry args={[0.01, 0.01, 0.34, 6]} />
        </mesh>
        <mesh position={[0, 0.36, 0.28]} rotation-x={-0.5} material={M.dark}>
          <cylinderGeometry args={[0.035, 0.035, 0.16, 12]} />
        </mesh>
        <mesh position={[0, 0.06, -0.12]} rotation-x={-Math.PI / 2} material={M.black}>
          <torusGeometry args={[0.08, 0.018, 6, 16, Math.PI]} />
        </mesh>
      </group>
    </group>
  );
}

function Softbox({ ...g }: JSX.IntrinsicElements['group']) {
  return (
    <group {...g}>
      <mesh position-y={0.9} material={M.black}>
        <cylinderGeometry args={[0.015, 0.015, 1.8, 6]} />
      </mesh>
      {[0, 2.1, 4.2].map((a) => (
        <mesh key={a} position={[Math.sin(a) * 0.25, 0.15, Math.cos(a) * 0.25]} rotation={[Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9]} material={M.black}>
          <cylinderGeometry args={[0.01, 0.01, 0.42, 4]} />
        </mesh>
      ))}
      <group position-y={1.85} rotation-x={-0.25}>
        <mesh material={M.black}>
          <boxGeometry args={[0.7, 0.9, 0.3]} />
        </mesh>
        <mesh position-z={0.16} material={M.soft}>
          <planeGeometry args={[0.64, 0.84]} />
        </mesh>
      </group>
    </group>
  );
}

function CameraRig({ ...g }: JSX.IntrinsicElements['group']) {
  return (
    <group {...g}>
      {[0, 2.1, 4.2].map((a) => (
        <mesh key={a} position={[Math.sin(a) * 0.22, 0.6, Math.cos(a) * 0.22]} rotation={[Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35]} material={M.black}>
          <cylinderGeometry args={[0.012, 0.012, 1.25, 4]} />
        </mesh>
      ))}
      <mesh position={[0, 1.3, 0]} material={M.black}>
        <boxGeometry args={[0.16, 0.12, 0.22]} />
      </mesh>
      <mesh position={[0, 1.3, 0.16]} rotation-x={Math.PI / 2} material={M.dark}>
        <cylinderGeometry args={[0.045, 0.05, 0.12, 14]} />
      </mesh>
      {/* Teleprompter voor de lens */}
      <mesh position={[0, 1.32, 0.34]} rotation-x={-0.78} material={M.screen}>
        <planeGeometry args={[0.32, 0.26]} />
      </mesh>
      <mesh position={[0.11, 1.42, -0.08]} material={M.black}>
        <boxGeometry args={[0.12, 0.08, 0.02]} />
      </mesh>
    </group>
  );
}

/** Podcastruimte (links) en content studio met witte cyclorama (rechts), vooraan in de hal. */
export function Studio() {
  const cut = useCut();
  const wallH = cut === 'beneden' ? CUT + 0.6 : ROOM_H;
  const z0 = IZ + 0.12; // glaswand aan de kant van de hal
  const z1 = D / 2 - 0.15; // voorgevel
  const px = [3.4, 9.0]; // podcast
  const sx = [9.0, W / 2 - 0.2]; // studio
  const zc = (z0 + z1) / 2;
  const carpet = useMemo(() => carpetTex([3, 3], '#24283a'), []);
  const panels = useMemo(() => {
    const out: [number, number, string][] = [];
    const cols = ['#1c2a44', '#13c7e6', '#22304d', '#2f7bff', '#1c2a44', '#2ff0a6'];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) out.push([z0 + 0.6 + c * 0.82, 0.75 + r * 0.72, cols[(r * 5 + c * 2) % cols.length]]);
    return out;
  }, [z0]);
  return (
    <group>
      {/* Podcast */}
      <mesh rotation-x={-Math.PI / 2} position={[(px[0] + px[1]) / 2, 0.05, zc]} receiveShadow>
        <planeGeometry args={[px[1] - px[0], z1 - z0]} />
        <meshStandardMaterial map={carpet} roughness={1} />
      </mesh>
      <group position={[(px[0] + px[1]) / 2, 0, z0]} rotation-y={Math.PI}>
        <GlassFront w={px[1] - px[0]} h={wallH} doorSide={-1} />
      </group>
      {/* Zijwand met akoestische panelen en neon */}
      <mesh position={[px[0] - 0.06, wallH / 2, zc]} material={M.matte}>
        <boxGeometry args={[0.12, wallH, z1 - z0]} />
      </mesh>
      {panels.map(([z, y, c]) => (
        <RoundedBox key={`${z}${y}`} args={[0.08, 0.64, 0.74]} radius={0.03} position={[px[0] + 0.04, Math.min(y, wallH - 0.4), z]}>
          <meshStandardMaterial color={c} roughness={1} />
        </RoundedBox>
      ))}
      {<Neon text="EML PODCAST" color={BRAND.blue} size={0.26} position={[px[0] + 0.1, Math.min(3.0, wallH - 0.25), zc]} rotation-y={Math.PI / 2} />}
      {/* Ronde tafel met drie micro's */}
      <group position={[6.4, 0, zc + 0.1]}>
        <mesh position-y={0.74} material={walnutMat()} castShadow>
          <cylinderGeometry args={[0.8, 0.8, 0.05, 40]} />
        </mesh>
        <mesh position-y={0.37} material={M.black}>
          <cylinderGeometry args={[0.08, 0.3, 0.72, 16]} />
        </mesh>
        {[0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].map((a) => (
          <group key={a}>
            <MicArm angle={a} />
            <group position={[Math.sin(a) * 1.15, 0, Math.cos(a) * 1.15]} rotation-y={a + Math.PI}>
              <Chair color="#2a2f3a" />
            </group>
          </group>
        ))}
        <mesh position={[0.25, 0.78, -0.1]} material={M.screen}>
          <boxGeometry args={[0.3, 0.02, 0.22]} />
        </mesh>
      </group>
      {/* ON AIR boven de deur, naar de hal */}
      <group position={[px[1] - 1.2, Math.min(2.75, wallH - 0.25), z0 - 0.08]} rotation-y={Math.PI}>
        <mesh position-z={-0.02}>
          <boxGeometry args={[1.0, 0.34, 0.06]} />
          <meshStandardMaterial color="#1a0606" roughness={0.5} />
        </mesh>
        <Neon text="ON AIR" color="#ff3b4a" size={0.17} font={FONT_MONO} position-z={0.02} />
      </group>
      <group position={[px[1] - 0.6, 0, z1 - 0.5]}>
        <Plant tall />
      </group>

      {/* Content studio: vloer, cyclorama en licht */}
      <mesh rotation-x={-Math.PI / 2} position={[(sx[0] + sx[1]) / 2, 0.05, zc]} receiveShadow>
        <planeGeometry args={[sx[1] - sx[0], z1 - z0]} />
        <meshStandardMaterial color="#d9d7d2" roughness={0.6} />
      </mesh>
      <group position-x={(sx[0] + sx[1]) / 2 + 1.2}>
        {/* Witte achtergrond met holle overgang naar de vloer */}
        <mesh position={[0, 0.8 + (wallH - 0.8) / 2, z0 + 0.1]} material={M.cyc}>
          <planeGeometry args={[6.4, wallH - 0.8]} />
        </mesh>
        <mesh position={[0, 0.8, z0 + 0.1 + 0.8]} rotation-z={Math.PI / 2} material={M.cyc}>
          <cylinderGeometry args={[0.8, 0.8, 6.4, 20, 1, true, Math.PI, Math.PI / 2]} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.055, z0 + 0.9 + 0.9]} material={M.cyc}>
          <planeGeometry args={[6.4, 1.8]} />
        </mesh>
        {/* Achterkant van de cyclorama, naar de hal: naam in neon */}
        <mesh position={[0, wallH / 2, z0 + 0.05]} material={M.matte}>
          <boxGeometry args={[6.5, wallH, 0.06]} />
        </mesh>
        {<Neon text="CONTENT STUDIO" color={BRAND.mint} size={0.32} position={[0, Math.min(2.55, wallH - 0.3), z0 - 0.0]} rotation-y={Math.PI} />}
        {/* Kruk en tafeltje voor wie spreekt */}
        <group position={[0, 0, z0 + 1.5]}>
          <mesh position-y={0.38} material={M.chrome}>
            <cylinderGeometry args={[0.02, 0.02, 0.76, 8]} />
          </mesh>
          <mesh position-y={0.78} material={M.black}>
            <cylinderGeometry args={[0.2, 0.2, 0.06, 20]} />
          </mesh>
          <mesh position-y={0.03} material={M.chrome}>
            <cylinderGeometry args={[0.22, 0.22, 0.03, 20]} />
          </mesh>
        </group>
        <Softbox position={[-2.2, 0, z0 + 2.6]} rotation-y={0.6 + Math.PI} />
        <Softbox position={[2.2, 0, z0 + 2.6]} rotation-y={-0.6 + Math.PI} />
        <CameraRig position={[0, 0, z0 + 3.6]} rotation-y={Math.PI} />
        {/* Ringlamp */}
        <group position={[0.9, 0, z0 + 3.3]}>
          <mesh position-y={0.75} material={M.black}>
            <cylinderGeometry args={[0.012, 0.012, 1.5, 6]} />
          </mesh>
          <mesh position-y={1.55} material={M.soft}>
            <torusGeometry args={[0.24, 0.025, 8, 32]} />
          </mesh>
        </group>
      </group>
      {/* Montageplek tegen de zijwand */}
      <group position={[sx[0] + 0.7, 0, zc + 0.4]} rotation-y={Math.PI / 2}>
        <mesh position-y={0.74} material={M.white} castShadow>
          <boxGeometry args={[1.8, 0.05, 0.75]} />
        </mesh>
        {[-0.85, 0.85].map((x) => (
          <mesh key={x} position={[x, 0.37, 0]} material={M.black}>
            <boxGeometry args={[0.05, 0.72, 0.7]} />
          </mesh>
        ))}
        {[-0.45, 0.45].map((x) => (
          <mesh key={x} position={[x, 1.05, -0.22]} rotation-y={-x * 0.4} material={M.screen}>
            <boxGeometry args={[0.8, 0.46, 0.03]} />
          </mesh>
        ))}
        <group position={[0, 0, 0.7]} rotation-y={Math.PI}>
          <Chair color="#2f7bff" />
        </group>
      </group>
      {/* Tussenwand podcast | studio */}
      <group position={[px[1], 0, zc]} rotation-y={Math.PI / 2}>
        <GlassFront w={z1 - z0} h={wallH} door={false} />
      </group>
    </group>
  );
}

const walnutMat = (() => {
  let m: THREE.MeshStandardMaterial | null = null;
  return () => (m ??= new THREE.MeshStandardMaterial({ map: walnutTex([1, 1]), roughness: 0.45 }));
})();

// --- Keuken en lounge (gelijkvloers, links) ---

function Stool({ ...g }: JSX.IntrinsicElements['group']) {
  return (
    <group {...g}>
      <mesh position-y={0.36} material={M.black}>
        <cylinderGeometry args={[0.02, 0.025, 0.72, 8]} />
      </mesh>
      <mesh position-y={0.02} material={M.black}>
        <cylinderGeometry args={[0.18, 0.18, 0.03, 16]} />
      </mesh>
      <RoundedBox args={[0.38, 0.07, 0.38]} radius={0.03} position-y={0.75} material={M.leather} />
    </group>
  );
}

/** Ruime keuken langs de linkermuur, met een groot eiland, een tv-wand en een lange eettafel. */
export function Kitchen() {
  const tiles = useMemo(() => tileTex([4, 1]), []);
  const oak = useMemo(() => new THREE.MeshStandardMaterial({ map: woodTex([2, 1]), color: '#d2b38f', roughness: 0.55 }), []);
  const front = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1f2429', roughness: 0.55, metalness: 0.15 }), []);
  const xw = -W / 2 + 0.05; // muur
  const z0 = 4.4;
  const z1 = 8.7;
  const zc = (z0 + z1) / 2;
  const len = z1 - z0;
  return (
    <group>
      {/* Onderkasten, werkblad, spatwand en bovenkasten */}
      <mesh position={[xw + 0.32, 0.45, zc]} material={front} castShadow>
        <boxGeometry args={[0.62, 0.9, len]} />
      </mesh>
      <mesh position={[xw + 0.34, 0.92, zc]} material={M.stone}>
        <boxGeometry args={[0.68, 0.05, len + 0.04]} />
      </mesh>
      <mesh position={[xw + 0.01, 1.3, zc]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[len, 0.75]} />
        <meshStandardMaterial map={tiles} roughness={0.3} />
      </mesh>
      <mesh position={[xw + 0.2, 2.15, zc - 0.6]} material={front}>
        <boxGeometry args={[0.38, 0.8, len - 1.2]} />
      </mesh>
      <NeonBar len={len - 1.2} color="#fff1d6" thick={0.02} position={[xw + 0.4, 1.73, zc - 0.6]} rotation-y={Math.PI / 2} />
      {/* Spoelbak, kraan, kookplaat en dampkap */}
      <mesh position={[xw + 0.36, 0.95, zc + 0.8]} material={M.chrome}>
        <boxGeometry args={[0.42, 0.02, 0.6]} />
      </mesh>
      <mesh position={[xw + 0.15, 1.12, zc + 0.8]} material={M.chrome}>
        <cylinderGeometry args={[0.015, 0.015, 0.34, 8]} />
      </mesh>
      <mesh position={[xw + 0.38, 0.95, zc - 0.9]} material={M.black}>
        <boxGeometry args={[0.5, 0.01, 0.7]} />
      </mesh>
      {/* Hoge kasten: koelkast, ovens, koffiemachine */}
      <group position={[xw + 0.34, 0, z0 - 0.75]}>
        <mesh position-y={1.2} material={front} castShadow>
          <boxGeometry args={[0.68, 2.4, 1.5]} />
        </mesh>
        <mesh position={[0.35, 1.25, 0.38]} material={M.dark}>
          <boxGeometry args={[0.01, 0.48, 0.6]} />
        </mesh>
        <mesh position={[0.351, 1.25, 0.38]} rotation-y={Math.PI / 2}>
          <planeGeometry args={[0.56, 0.4]} />
          <meshStandardMaterial color="#05070b" emissive="#ff9a4d" emissiveIntensity={0.25} />
        </mesh>
        <mesh position={[0.36, 1.2, -0.38]} material={M.chrome}>
          <boxGeometry args={[0.02, 1.6, 0.03]} />
        </mesh>
      </group>
      {/* Tv-wand die de keuken van de strategiekamer scheidt */}
      <group position={[-IX - MD / 2, 0, 2.4]}>
        <mesh position-y={1.35} castShadow>
          <boxGeometry args={[MD - 0.3, 2.7, 0.18]} />
          <meshStandardMaterial map={walnutTex([2, 1.4])} roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.55, 0.1]} material={M.black}>
          <boxGeometry args={[2.3, 1.32, 0.05]} />
        </mesh>
        <mesh position={[0, 1.55, 0.13]}>
          <planeGeometry args={[2.2, 1.22]} />
          <meshBasicMaterial map={brandGradientTex()} color="#7aa6c8" toneMapped={false} />
        </mesh>
        <Text font={FONT} fontSize={0.16} position={[0, 1.62, 0.14]} anchorY="middle">
          HQ TV · EM LAUNCHPAD
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </Text>
        <Text font={FONT_MONO} fontSize={0.07} position={[0, 1.4, 0.14]} anchorY="middle" letterSpacing={0.12}>
          NIEUWE DEMO · VANDAAG 17U
          <meshBasicMaterial color="#e8f7fb" toneMapped={false} />
        </Text>
        <Neon text="EML KITCHEN" color={BRAND.cyan} size={0.2} position={[0, 2.5, 0.12]} />
      </group>
      {/* Eiland met krukken en hanglampen */}
      <group position={[-17.1, 0, 6.5]}>
        <mesh position-y={0.46} material={front} castShadow>
          <boxGeometry args={[0.95, 0.92, 3.2]} />
        </mesh>
        <mesh position-y={0.94} material={M.stone}>
          <boxGeometry args={[1.15, 0.06, 3.35]} />
        </mesh>
        {[-1, 0, 1].map((i) => (
          <Stool key={i} position={[0.9, 0, i * 1.0]} rotation-y={-Math.PI / 2} />
        ))}
        {[-1, 0, 1].map((i) => (
          <group key={i} position={[0, 0, i * 1.0]}>
            <mesh position-y={ROOM_H - 0.4} material={M.black}>
              <cylinderGeometry args={[0.005, 0.005, 0.8, 4]} />
            </mesh>
            <mesh position-y={ROOM_H - 0.85} material={M.black}>
              <sphereGeometry args={[0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
            <mesh position-y={ROOM_H - 0.86} rotation-x={Math.PI / 2} material={M.lamp}>
              <circleGeometry args={[0.12, 16]} />
            </mesh>
          </group>
        ))}
        <mesh position={[0.1, 1.02, -0.8]} material={M.white}>
          <cylinderGeometry args={[0.18, 0.12, 0.1, 20]} />
        </mesh>
      </group>
      {/* Lange eettafel */}
      <group position={[-9.4, 0, 6.2]}>
        <mesh position-y={0.74} material={oak} castShadow>
          <boxGeometry args={[3.4, 0.06, 1.05]} />
        </mesh>
        {[-1.5, 1.5].map((x) => (
          <mesh key={x} position={[x, 0.37, 0]} material={M.black}>
            <boxGeometry args={[0.06, 0.72, 0.9]} />
          </mesh>
        ))}
        {[-1.1, 0, 1.1].flatMap((x) =>
          [-1, 1].map((s) => (
            <group key={`${x}${s}`} position={[x, 0, s * 0.75]} rotation-y={s > 0 ? Math.PI : 0}>
              <Chair color="#c9c2b6" />
            </group>
          )),
        )}
        <group position={[0, 0.77, 0]}>
          <Plant scale={0.35} />
        </group>
      </group>
    </group>
  );
}

/** Lounge vooraan links: hoekbank rond een salontafel, met een mediawand en grote tv. */
export function KitchenLounge() {
  const zc = 11.6;
  return (
    <group>
      <group position={[-11.2, 0, zc]}>
        <Rug w={5.6} d={4.2} color="#c9bfae" />
      </group>
      {/* Mediawand tegen de hoek, met tv en neon */}
      <group position={[-IX - 0.1, 0, zc]} rotation-y={Math.PI / 2}>
        <mesh position-y={1.45} castShadow>
          <boxGeometry args={[4.4, 2.9, 0.2]} />
          <meshStandardMaterial map={walnutTex([2, 1.5])} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.28, 0.32]} material={M.black}>
          <boxGeometry args={[3.2, 0.5, 0.42]} />
        </mesh>
        <mesh position={[0, 1.5, 0.12]} material={M.black}>
          <boxGeometry args={[2.6, 1.48, 0.05]} />
        </mesh>
        <mesh position={[0, 1.5, 0.15]} material={M.screen}>
          <planeGeometry args={[2.5, 1.38]} />
        </mesh>
        <Text font={FONT} fontSize={0.2} position={[0, 1.55, 0.16]} anchorY="middle">
          EM LAUNCHPAD
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </Text>
        <NeonBar len={2.2} position={[0, 1.3, 0.16]} thick={0.03} />
        <Neon text="EML LOUNGE" color={BRAND.mint} size={0.2} position={[0, 2.55, 0.12]} />
        {[-1.9, 1.9].map((x) => (
          <group key={x} position={[x, 0, 0.5]}>
            <Plant tall />
          </group>
        ))}
      </group>
      {/* Hoekbank naar de tv */}
      <group position={[-9.2, 0, zc - 0.2]} rotation-y={-Math.PI / 2}>
        <Sofa color="#3d4656" w={3} />
      </group>
      <group position={[-11.3, 0, zc + 1.6]} rotation-y={Math.PI}>
        <Sofa color="#3d4656" w={2.4} />
      </group>
      {/* Salontafel en fauteuils */}
      <group position={[-11.4, 0, zc - 0.1]}>
        <mesh position-y={0.36} material={walnutMat()}>
          <boxGeometry args={[1.5, 0.08, 0.85]} />
        </mesh>
        <mesh position-y={0.17} material={M.black}>
          <boxGeometry args={[1.3, 0.34, 0.65]} />
        </mesh>
      </group>
      {[-12.4, -10.8].map((x, i) => (
        <group key={x} position={[x, 0, zc - 1.8]} rotation-y={i ? -0.25 : 0.25}>
          <RoundedBox args={[0.8, 0.4, 0.8]} radius={0.1} position-y={0.3} material={M.boucle} />
          <RoundedBox args={[0.8, 0.5, 0.2]} radius={0.08} position={[0, 0.62, -0.3]} material={M.boucle} />
        </group>
      ))}
      {/* Boekenkast en plant in de hoek */}
      <group position={[-17.5, 0, D / 2 - 0.5]} rotation-y={Math.PI}>
        <Shelf w={3.4} />
      </group>
      <group position={[-17.5, 0, 11]}>
        <Plant tall scale={1.2} />
      </group>
    </group>
  );
}

// --- Fitness (boven rechts) ---

function Treadmill({ ...g }: JSX.IntrinsicElements['group']) {
  return (
    <group {...g}>
      <mesh position-y={0.12} material={M.dark} castShadow>
        <boxGeometry args={[0.75, 0.22, 1.9]} />
      </mesh>
      <mesh position-y={0.235} material={M.rubber}>
        <boxGeometry args={[0.55, 0.02, 1.7]} />
      </mesh>
      {[-0.34, 0.34].map((x) => (
        <mesh key={x} position={[x, 0.75, -0.8]} rotation-x={-0.15} material={M.dark}>
          <boxGeometry args={[0.05, 1.1, 0.07]} />
        </mesh>
      ))}
      <mesh position={[0, 1.3, -0.88]} rotation-x={-0.5} material={M.dark}>
        <boxGeometry args={[0.75, 0.08, 0.32]} />
      </mesh>
      <mesh position={[0, 1.34, -0.86]} rotation-x={-0.5 - Math.PI / 2} material={M.screen}>
        <planeGeometry args={[0.36, 0.2]} />
      </mesh>
    </group>
  );
}

function Bike({ ...g }: JSX.IntrinsicElements['group']) {
  return (
    <group {...g}>
      <mesh position-y={0.03} material={M.dark}>
        <boxGeometry args={[0.5, 0.06, 1.1]} />
      </mesh>
      <mesh position={[0, 0.45, -0.3]} rotation-y={Math.PI / 2} material={M.black}>
        <torusGeometry args={[0.24, 0.05, 8, 24]} />
      </mesh>
      <mesh position={[0, 0.55, 0.1]} rotation-x={0.4} material={M.dark}>
        <boxGeometry args={[0.07, 1, 0.07]} />
      </mesh>
      <mesh position={[0, 1.0, 0.28]} material={M.black}>
        <boxGeometry args={[0.18, 0.06, 0.3]} />
      </mesh>
      <mesh position={[0, 0.8, -0.4]} rotation-x={-0.3} material={M.dark}>
        <boxGeometry args={[0.06, 0.9, 0.06]} />
      </mesh>
      <mesh position={[0, 1.22, -0.5]} rotation-z={Math.PI / 2} material={M.black}>
        <cylinderGeometry args={[0.02, 0.02, 0.5, 6]} />
      </mesh>
      <NeonBar len={0.3} color={BRAND.cyan} thick={0.02} position={[0, 1.16, -0.48]} />
    </group>
  );
}

function Dumbbell({ ...g }: JSX.IntrinsicElements['group']) {
  return (
    <group {...g} rotation-z={Math.PI / 2}>
      <mesh material={M.chrome}>
        <cylinderGeometry args={[0.015, 0.015, 0.3, 6]} />
      </mesh>
      {[-0.12, 0.12].map((y) => (
        <mesh key={y} position-y={y} material={M.black}>
          <cylinderGeometry args={[0.06, 0.06, 0.07, 8]} />
        </mesh>
      ))}
    </group>
  );
}

/** Fitnessruimte op de tussenverdieping rechts: loopbanden, fiets, rek, bank, halters en een spiegelwand. */
export function Fitness() {
  const z0 = -IZ + 0.3;
  const z1 = -0.4;
  const zc = (z0 + z1) / 2;
  const x0 = IX + 0.2;
  const x1 = W / 2 - 0.15;
  const xc = (x0 + x1) / 2;
  return (
    <group position-y={MZ}>
      <mesh rotation-x={-Math.PI / 2} position={[xc, 0.02, zc]} material={M.rubber} receiveShadow>
        <planeGeometry args={[x1 - x0, z1 - z0]} />
      </mesh>
      {/* Spiegelwand achteraan, met neon erboven. Links blijft een doorgang naar de achterste tussenverdieping. */}
      <mesh position={[xc + 0.7, 1.25, z0 + 0.03]} material={M.mirror}>
        <planeGeometry args={[x1 - x0 - 1.7, 2.1]} />
      </mesh>
      <mesh position={[xc + 0.7, 1.25, z0]} material={M.black}>
        <boxGeometry args={[x1 - x0 - 1.6, 2.2, 0.04]} />
      </mesh>
      <Neon text="EML FIT" color={BRAND.mint} size={0.3} position={[xc + 0.7, 2.62, z0 + 0.05]} />
      <Treadmill position={[x0 + 1.1, 0, z0 + 1.6]} />
      <Treadmill position={[x0 + 2.7, 0, z0 + 1.6]} />
      <Bike position={[x0 + 1.1, 0, z0 + 3.8]} />
      <Bike position={[x0 + 2.2, 0, z0 + 3.8]} />
      {/* Halterrek tegen de gevel */}
      <group position={[x1 - 0.35, 0, z0 + 4.4]} rotation-y={-Math.PI / 2}>
        <mesh position-y={0.4} material={M.dark}>
          <boxGeometry args={[2, 0.05, 0.45]} />
        </mesh>
        <mesh position-y={0.75} material={M.dark}>
          <boxGeometry args={[2, 0.05, 0.4]} />
        </mesh>
        {[-0.95, 0.95].map((x) => (
          <mesh key={x} position={[x, 0.42, 0]} material={M.black}>
            <boxGeometry args={[0.05, 0.84, 0.45]} />
          </mesh>
        ))}
        {[-0.7, -0.35, 0, 0.35, 0.7].map((x) => (
          <group key={x}>
            <Dumbbell position={[x, 0.48, 0.08]} />
            <Dumbbell position={[x, 0.82, 0.06]} />
          </group>
        ))}
      </group>
      {/* Squatrek met halterstang en bank */}
      <group position={[x0 + 1.6, 0, z1 - 1.5]}>
        {[-0.6, 0.6].flatMap((x) =>
          [-0.5, 0.5].map((z) => (
            <mesh key={`${x}${z}`} position={[x, 1.1, z]} material={M.black}>
              <boxGeometry args={[0.07, 2.2, 0.07]} />
            </mesh>
          )),
        )}
        <mesh position={[0, 2.2, 0]} material={M.black}>
          <boxGeometry args={[1.27, 0.07, 1.07]} />
        </mesh>
        <mesh position={[0, 1.4, -0.5]} rotation-z={Math.PI / 2} material={M.chrome}>
          <cylinderGeometry args={[0.018, 0.018, 2, 8]} />
        </mesh>
        {[-0.85, 0.85].map((x) => (
          <mesh key={x} position={[x, 1.4, -0.5]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.22, 0.22, 0.06, 24]} />
            <meshStandardMaterial color={BRAND.blue} roughness={0.6} />
          </mesh>
        ))}
        <mesh position={[0, 0.45, 0.2]} material={M.leather}>
          <boxGeometry args={[0.3, 0.1, 1.2]} />
        </mesh>
        <mesh position={[0, 0.22, 0.2]} material={M.black}>
          <boxGeometry args={[0.08, 0.42, 1.0]} />
        </mesh>
      </group>
      {/* Matten en kettlebells */}
      {[0, 1].map((i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[x1 - 0.9, 0.03, z1 - 0.9 - i * 0.8]}>
          <planeGeometry args={[1.6, 0.6]} />
          <meshStandardMaterial color={i ? BRAND.cyan : '#3a4253'} roughness={1} />
        </mesh>
      ))}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[x1 - 0.3, 0.12, z1 - 2.6 - i * 0.35]} material={M.black}>
          <sphereGeometry args={[0.12, 12, 10]} />
        </mesh>
      ))}
      <group position={[x1 - 0.5, 0, z1 - 0.4]}>
        <Plant scale={1.1} />
      </group>
      {/* Rubberen rand in het merkverloop */}
      <NeonBar len={z1 - z0} thick={0.03} position={[x0 + 0.05, 0.05, zc]} rotation-y={Math.PI / 2} />
    </group>
  );
}
