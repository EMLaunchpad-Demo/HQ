// Inrichting voor de ontspanning in het HQ: gaming, biljart, pingpong en salon.
import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { brandGradientTex } from '../textures';
import { Plant, Rug } from './Furniture';
const M = {
  oak: new THREE.MeshStandardMaterial({ color: '#b88a5c', roughness: 0.55 }),
  walnut: new THREE.MeshStandardMaterial({ color: '#5b3b26', roughness: 0.45 }),
  black: new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.35, metalness: 0.4 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#d7dadd', roughness: 0.15, metalness: 1 }),
  felt: new THREE.MeshStandardMaterial({ color: '#0f4a3a', roughness: 0.95 }),
  feltBlue: new THREE.MeshStandardMaterial({ color: '#16406e', roughness: 0.6 }),
  leather: new THREE.MeshStandardMaterial({ color: '#6b4428', roughness: 0.55 }),
  boucle: new THREE.MeshStandardMaterial({ color: '#e6e0d6', roughness: 1 }),
  stone: new THREE.MeshStandardMaterial({ color: '#8f8b85', roughness: 0.8 }),
  white: new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.5 }),
};

export function PoolTable() {
  return (
    <group>
      <RoundedBox args={[2.7, 0.2, 1.5]} radius={0.06} position-y={0.78} material={M.walnut} castShadow />
      <mesh position-y={0.885} material={M.felt}>
        <boxGeometry args={[2.4, 0.02, 1.2]} />
      </mesh>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 1.15, 0.36, sz * 0.55]} material={M.walnut}>
            <cylinderGeometry args={[0.09, 0.12, 0.72, 12]} />
          </mesh>
        )),
      )}
      {/* Ballen in een driehoek en de witte bal */}
      {Array.from({ length: 10 }, (_, i) => {
        const row = Math.floor((Math.sqrt(8 * i + 1) - 1) / 2);
        const col = i - (row * (row + 1)) / 2;
        return (
          <mesh key={i} position={[0.55 + row * 0.052, 0.92, (col - row / 2) * 0.06]}>
            <sphereGeometry args={[0.028, 14, 10]} />
            <meshPhysicalMaterial color={['#f2c200', '#1d4ed8', '#c0262d', '#5b2a86', '#e86a14', '#0f7a3a', '#7a1f1f', '#111111', '#f2c200', '#1d4ed8'][i]} roughness={0.15} clearcoat={1} />
          </mesh>
        );
      })}
      <mesh position={[-0.7, 0.92, 0]}>
        <sphereGeometry args={[0.028, 14, 10]} />
        <meshPhysicalMaterial color="#f5f3ee" roughness={0.15} clearcoat={1} />
      </mesh>
      <mesh position={[-0.3, 0.93, 0.25]} rotation={[0, 0.3, Math.PI / 2 - 0.05]} material={M.oak}>
        <cylinderGeometry args={[0.008, 0.015, 1.45, 8]} />
      </mesh>
      {/* Hanglamp */}
      <mesh position-y={1.9} material={M.black}>
        <boxGeometry args={[1.8, 0.12, 0.3]} />
      </mesh>
      <mesh position-y={1.84} rotation-x={Math.PI / 2}>
        <planeGeometry args={[1.7, 0.24]} />
        <meshStandardMaterial color="#ffffff" emissive="#fff1d6" emissiveIntensity={2} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function PingPong() {
  return (
    <group>
      <mesh position-y={0.76} material={M.feltBlue} castShadow>
        <boxGeometry args={[2.74, 0.03, 1.525]} />
      </mesh>
      <mesh position={[0, 0.776, 0]} material={M.white}>
        <boxGeometry args={[2.74, 0.002, 0.02]} />
      </mesh>
      <mesh position={[0, 0.84, 0]}>
        <boxGeometry args={[0.01, 0.15, 1.7]} />
        <meshStandardMaterial color="#f1efe9" transparent opacity={0.6} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.9, 0.37, 0]} material={M.black}>
          <boxGeometry args={[0.06, 0.74, 1.2]} />
        </mesh>
      ))}
      {[-0.6, 0.7].map((x, i) => (
        <group key={x} position={[x, 0.79, i ? -0.3 : 0.35]} rotation-y={i ? 0.6 : -0.4}>
          <mesh rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.08, 20]} />
            <meshStandardMaterial color={i ? '#c0262d' : '#111111'} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0.12, 0.005, 0]} material={M.oak}>
            <boxGeometry args={[0.1, 0.015, 0.03]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0.2, 0.8, 0.1]}>
        <sphereGeometry args={[0.02, 12, 8]} />
        <meshStandardMaterial color="#ff9a2e" />
      </mesh>
    </group>
  );
}

export function GamingChair({ color = '#2f7bff' }: { color?: string }) {
  const acc = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.5 }), [color]);
  return (
    <group>
      <RoundedBox args={[0.55, 0.12, 0.55]} radius={0.04} position-y={0.48} material={M.black} />
      <RoundedBox args={[0.55, 0.85, 0.12]} radius={0.05} position={[0, 0.95, 0.24]} rotation-x={-0.12} material={M.black} />
      <mesh position={[0, 1.0, 0.18]} rotation-x={-0.12} material={acc}>
        <boxGeometry args={[0.1, 0.7, 0.02]} />
      </mesh>
      <mesh position-y={0.22} material={M.chrome}>
        <cylinderGeometry args={[0.03, 0.03, 0.42, 8]} />
      </mesh>
      <mesh position-y={0.03} material={M.black}>
        <cylinderGeometry args={[0.3, 0.3, 0.04, 5]} />
      </mesh>
    </group>
  );
}

/** Gaming room: groot scherm aan de muur, sofa en gamingstoelen, en een arcadekast. */
export function Gaming() {
  const screen = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 288;
    const g = c.getContext('2d')!;
    const sky = g.createLinearGradient(0, 0, 0, 288);
    sky.addColorStop(0, '#1b2d55');
    sky.addColorStop(1, '#e0794a');
    g.fillStyle = sky;
    g.fillRect(0, 0, 512, 288);
    g.fillStyle = '#10141c';
    for (let x = 0; x < 512; x += 28) g.fillRect(x, 190 - ((x * 37) % 60), 24, 120);
    g.fillStyle = '#2f3a2a';
    g.fillRect(0, 250, 512, 40);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = '700 22px Archivo, sans-serif';
    g.fillText('EML RACING CUP', 18, 34);
    g.fillStyle = '#2ff0a6';
    g.fillRect(18, 44, 120, 6);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <group>
      <Rug w={4} d={3.4} color="#20242b" />
      {/* Tv aan de linkermuur */}
      <group position={[-1.9, 1.55, 0]} rotation-y={Math.PI / 2}>
        <mesh material={M.black}>
          <boxGeometry args={[2.6, 1.5, 0.06]} />
        </mesh>
        <mesh position-z={0.032}>
          <planeGeometry args={[2.5, 1.4]} />
          <meshStandardMaterial color="#000000" emissive="#ffffff" emissiveMap={screen} emissiveIntensity={1.1} />
        </mesh>
      </group>
      <mesh position={[-1.75, 0.25, 0]} material={M.walnut}>
        <boxGeometry args={[0.45, 0.5, 2.4]} />
      </mesh>
      <mesh position={[-1.75, 0.53, 0.5]} material={M.white}>
        <boxGeometry args={[0.3, 0.06, 0.25]} />
      </mesh>
      {/* Ledlijn achter de tv in de huisstijl */}
      <mesh position={[-1.96, 1.55, 0]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[2.8, 1.7]} />
        <meshBasicMaterial map={brandGradientTex()} toneMapped={false} transparent opacity={0.35} />
      </mesh>
      {[-0.55, 0.55].map((z, i) => (
        <group key={z} position={[0.3, 0, z]} rotation-y={-Math.PI / 2}>
          <GamingChair color={i ? '#2ff0a6' : '#2f7bff'} />
        </group>
      ))}
      <group position={[1.4, 0, 0]} rotation-y={-Math.PI / 2}>
        <RoundedBox args={[2.4, 0.42, 0.95]} radius={0.12} position-y={0.3} material={M.boucle} />
        <RoundedBox args={[2.4, 0.6, 0.25]} radius={0.12} position={[0, 0.62, 0.38]} material={M.boucle} />
      </group>
      {/* Arcadekast */}
      <group position={[-1.3, 0, -1.9]}>
        <mesh position-y={0.9} material={M.black}>
          <boxGeometry args={[0.7, 1.8, 0.7]} />
        </mesh>
        <mesh position={[0, 1.3, 0.352]}>
          <planeGeometry args={[0.55, 0.45]} />
          <meshStandardMaterial color="#000" emissive="#13c7e6" emissiveIntensity={0.8} />
        </mesh>
        <mesh position={[0, 1.72, 0.352]}>
          <planeGeometry args={[0.62, 0.12]} />
          <meshBasicMaterial map={brandGradientTex()} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** Living met salon: L-bank, fauteuils, salontafel, open haard, staande lamp en een bar. */
export function Salon() {
  return (
    <group>
      <Rug w={4.2} d={3.8} color="#cfc5b4" />
      <group position={[-0.4, 0, -1.2]}>
        <RoundedBox args={[3, 0.42, 0.95]} radius={0.12} position-y={0.3} material={M.boucle} />
        <RoundedBox args={[3, 0.55, 0.25]} radius={0.12} position={[0, 0.6, -0.36]} material={M.boucle} />
        <RoundedBox args={[0.95, 0.42, 1.8]} radius={0.12} position={[-1.03, 0.3, 0.9]} material={M.boucle} />
        {[0.6, -0.2].map((x) => (
          <RoundedBox key={x} args={[0.45, 0.4, 0.12]} radius={0.05} position={[x, 0.72, -0.2]} rotation-x={-0.25}>
            <meshStandardMaterial color="#2f7bff" roughness={0.9} />
          </RoundedBox>
        ))}
      </group>
      {[0.6, 1.6].map((x) => (
        <group key={x} position={[x, 0, 1.4]} rotation-y={Math.PI + (x > 1 ? -0.3 : 0.2)}>
          <RoundedBox args={[0.8, 0.4, 0.8]} radius={0.1} position-y={0.3} material={M.leather} />
          <RoundedBox args={[0.8, 0.5, 0.2]} radius={0.08} position={[0, 0.62, 0.3]} material={M.leather} />
        </group>
      ))}
      <group position={[0.3, 0, 0.1]}>
        <mesh position-y={0.38} material={M.stone}>
          <cylinderGeometry args={[0.6, 0.6, 0.08, 36]} />
        </mesh>
        <mesh position-y={0.17} material={M.black}>
          <cylinderGeometry args={[0.35, 0.4, 0.34, 24]} />
        </mesh>
        <mesh position={[0.15, 0.48, 0.1]} material={M.white}>
          <boxGeometry args={[0.28, 0.12, 0.2]} />
        </mesh>
      </group>
      {/* Open haard tegen de rechtermuur */}
      <group position={[1.85, 0, 0]} rotation-y={-Math.PI / 2}>
        <mesh position-y={1.2} material={M.stone}>
          <boxGeometry args={[2.2, 2.4, 0.4]} />
        </mesh>
        <mesh position={[0, 0.6, 0.21]} material={M.black}>
          <boxGeometry args={[1.2, 0.55, 0.02]} />
        </mesh>
        <mesh position={[0, 0.5, 0.22]}>
          <planeGeometry args={[1, 0.25]} />
          <meshStandardMaterial color="#000" emissive="#ff8a3d" emissiveIntensity={2.2} />
        </mesh>
        <pointLight position={[0, 0.6, 0.6]} color="#ff9a4d" intensity={3} distance={4} decay={2} />
      </group>
      {/* Staande lamp */}
      <group position={[-1.9, 0, -2]}>
        <mesh position-y={0.8} material={M.black}>
          <cylinderGeometry args={[0.015, 0.015, 1.6, 8]} />
        </mesh>
        <mesh position-y={1.65}>
          <coneGeometry args={[0.22, 0.25, 20, 1, true]} />
          <meshStandardMaterial color="#f3e9d6" emissive="#ffe2b0" emissiveIntensity={0.8} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {/* Bar met krukken */}
      <group position={[1.2, 0, -2.4]}>
        <mesh position-y={0.55} material={M.walnut}>
          <boxGeometry args={[1.8, 1.1, 0.5]} />
        </mesh>
        <mesh position-y={1.12} material={M.stone}>
          <boxGeometry args={[1.9, 0.05, 0.6]} />
        </mesh>
        {[-0.5, 0.1, 0.6].map((x, i) => (
          <mesh key={x} position={[x, 1.2, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.12 + i * 0.03, 12]} />
            <meshPhysicalMaterial color={['#2c5e3a', '#7a2a1d', '#c9a86b'][i]} transparent opacity={0.85} roughness={0.05} />
          </mesh>
        ))}
      </group>
      <group position={[2.1, 0, 2.1]}>
        <Plant tall scale={1.3} />
      </group>
    </group>
  );
}
