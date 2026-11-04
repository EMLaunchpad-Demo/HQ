// Groot scherm aan de muur van een verdieping: de taken van die afdeling, live uit Notion.
import { useMemo } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { FONT, FONT_MONO, FONT_REGULAR } from '../fonts';
import { brandGradientTex, screenTex } from '../textures';
import { useUi } from '../ui';
import { isBusy, isOpen, isOverdue, progress, type HqTaak } from '../model';

const STATUS_COLOR: Record<string, string> = {
  'In uitvoering': '#2ff0a6',
  Volgende: '#ffd23f',
  'Niet gestart': '#7c8a97',
  Done: '#2f7bff',
};

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

export function TaskBoard({ title, subtitle, tasks, w = 3.6, h = 2.1 }: { title: string; subtitle: string; tasks: HqTaak[]; w?: number; h?: number }) {
  const p = progress(tasks);
  const top = useMemo(() => tasks.filter(isOpen).slice(0, 5), [tasks]);
  const grad = brandGradientTex();
  const bg = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0b1526', emissive: '#0b1526', emissiveIntensity: 0.6, roughness: 0.3 }), []);
  const pad = 0.16;
  const left = -w / 2 + pad;
  const overdue = tasks.filter(isOverdue).length;
  // Van buiten (door het glas) is de tekst onleesbaar: dan enkel een oplichtend scherm, veel minder tekenwerk.
  const level = useUi((s) => s.level);
  const far = level < 0;

  if (far)
    return (
      <group>
        <mesh position-z={-0.03}>
          <boxGeometry args={[w + 0.12, h + 0.12, 0.05]} />
          <meshStandardMaterial color="#111825" roughness={0.4} metalness={0.5} />
        </mesh>
        <mesh>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial color="#000000" emissive="#ffffff" emissiveMap={screenTex('#13c7e6')} emissiveIntensity={0.8} />
        </mesh>
      </group>
    );

  return (
    <group>
      <mesh position-z={-0.03}>
        <boxGeometry args={[w + 0.12, h + 0.12, 0.05]} />
        <meshStandardMaterial color="#111825" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh material={bg}>
        <planeGeometry args={[w, h]} />
      </mesh>
      <mesh position={[0, h / 2 - 0.025, 0.002]}>
        <planeGeometry args={[w, 0.05]} />
        <meshBasicMaterial map={grad} toneMapped={false} />
      </mesh>
      <Text font={FONT_MONO} fontSize={0.075} color="#7c8a97" anchorX="left" anchorY="top" position={[left, h / 2 - 0.12, 0.01]} letterSpacing={0.1}>
        {subtitle.toUpperCase()}
      </Text>
      <Text font={FONT} fontSize={0.17} color="#ffffff" anchorX="left" anchorY="top" position={[left, h / 2 - 0.24, 0.01]}>
        {title}
      </Text>
      <Text font={FONT_MONO} fontSize={0.075} color="#aab8c2" anchorX="right" anchorY="top" position={[w / 2 - pad, h / 2 - 0.12, 0.01]}>
        {`${p.busy} BEZIG · ${p.open} OPEN · ${p.done} KLAAR${overdue ? ` · ${overdue} TE LAAT` : ''}`}
      </Text>
      {/* Voortgang */}
      <mesh position={[0, h / 2 - 0.55, 0.004]}>
        <planeGeometry args={[w - pad * 2, 0.035]} />
        <meshBasicMaterial color="#1e2a3a" />
      </mesh>
      {p.total > 0 && (
        <mesh position={[left + ((w - pad * 2) * p.pct) / 200, h / 2 - 0.55, 0.006]}>
          <planeGeometry args={[((w - pad * 2) * p.pct) / 100 || 0.001, 0.035]} />
          <meshBasicMaterial map={grad} toneMapped={false} />
        </mesh>
      )}
      {top.length === 0 && (
        <Text font={FONT_REGULAR} fontSize={0.1} color="#7c8a97" anchorX="left" anchorY="top" position={[left, h / 2 - 0.7, 0.01]}>
          Geen open taken. Alles is bij.
        </Text>
      )}
      {top.map((t, i) => {
        const y = h / 2 - 0.7 - i * 0.26;
        const c = STATUS_COLOR[t.status] ?? '#7c8a97';
        return (
          <group key={t.id} position={[0, y, 0.01]}>
            <mesh position={[left + 0.04, -0.06, 0]}>
              <circleGeometry args={[0.035, 16]} />
              <meshBasicMaterial color={c} toneMapped={false} />
            </mesh>
            <Text font={FONT_REGULAR} fontSize={0.092} color={isBusy(t) ? '#ffffff' : '#d6dee4'} anchorX="left" anchorY="top" position={[left + 0.13, 0, 0]}>
              {cut(t.naam, Math.round(w * 11))}
            </Text>
            <Text font={FONT_MONO} fontSize={0.062} color={isOverdue(t) ? '#ff8a6a' : '#7c8a97'} anchorX="right" anchorY="top" position={[w / 2 - pad, -0.015, 0]}>
              {`${t.status.toUpperCase()}${t.vervaldatum ? ' · ' + t.vervaldatum.slice(8, 10) + '/' + t.vervaldatum.slice(5, 7) : ''}`}
            </Text>
          </group>
        );
      })}
    </group>
  );
}
