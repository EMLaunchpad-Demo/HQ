// Het HQ als warehouse: zwarte golfplaat op een stalen skelet, grote glaspartijen, een betonnen plint en cederhout
// rond de inkom. Binnen: gepolijst beton, betonnen wandpanelen, zwarte stalen spanten en luchtkokers.
// Kies je een ruimte, dan gaat het HQ in "Sims-modus": dak en plafonds weg, muren aan de camerakant omlaag. Onder een tussenverdieping die
// helemaal rond loopt, heeft elke afdeling een eigen glazen ruimte; in het midden een open arena met de War Room,
// de pooltafel en de pingpongtafel. Boven: de kantoren van de founders, de gaming room en het salon.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Billboard, RoundedBox, Text } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { FONT, FONT_MONO, FONT_REGULAR } from '../fonts';
import { brandGradientTex, carpetTex, cedarTex, concretePanelTex, concreteTex, corrugatedTex, screenTex, walnutTex, woodTex, zincTex } from '../textures';
import { config } from '../../config';
import { floors, isBusy, isOpen, isOverdue, livePct, takenStand, tasksByOwner, useHq, warRoomTasks, type FloorModel, type HqTaak, type LiveWork, type Occupant } from '../model';
import { ui, useUi } from '../ui';
import { useCall } from '../call';
import { Character, MOOD_COLOR, type Mood } from './Character';
import { Booth, Chair, CoffeeTable, Desk, MeetingTable, Plant, Planter, Rug, Shelf, Sofa } from './Furniture';
import { Gaming, PingPong, PoolTable } from './Lounge';
import { ArenaCourt, BrandWall, FacadeLogos, FloorLogo, Fitness, Kitchen, KitchenLounge, MezzLed, Studio } from './Extras';
import { TaskBoard } from './TaskBoard';
import { B, ROOM_H, glassMat, steelMat } from './dims';
import { CUT, CutContext, useCut, type Cut } from './cut';
import { DOOR_H, GlassFront, SlideDoor } from './parts';
import { walkPos } from '../walk';

const { W, D, H, RISE, MZ, MD } = B;
const IX = W / 2 - MD; // binnenrand van de tussenverdieping (x)
const IZ = D / 2 - MD; // binnenrand (z)
const LIVE_MS = 30 * 60_000;
const seatPos = new THREE.Vector3();
/** Plaats van de zijdeur van de kantoren (lokaal z), vlak achter de glazen voorkant. */
const OFFICE_DOOR_Z = 1.25;



/** `takenOk` = false als Notion niet bereikbaar is of de lijst verouderd: dan nooit "niets open", maar grijs (onbekend). */
export function moodOf(tasks: HqTaak[] = [], live?: LiveWork, takenOk = true): Mood {
  // Bezig zolang er tekens van leven komen (elke stap); na een half uur stilte niet meer.
  if (live && !live.done && Date.now() - (live.at ?? live.since) < LIVE_MS) return 'bezig';
  if (tasks.some(isBusy)) return 'bezig';
  if (tasks.some((t) => t.status === 'Volgende')) return 'volgende';
  if (tasks.some(isOpen)) return 'open';
  return takenOk ? 'rust' : 'offline';
}

const lighten = (hex: string, k: number) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k).getHexString();

// --- Waar elke ruimte ligt (lokale coördinaten, midden van de hal = 0, voorgevel = +z) ---

type Facing = 'z' | 'x' | '-x';
interface Room {
  x: number;
  z: number;
  w: number; // breedte langs de glazen voorkant
  d: number; // diepte
  facing: Facing; // waar de glazen voorkant naar kijkt
}

/** Vaste plaatsen voor de afdelingen; een nieuwe afdeling krijgt de vrije ruimte rechts. */
const ROOMS: Record<string, Room> = {
  sales: { x: -15, z: -IZ - MD / 2, w: 10, d: MD, facing: 'z' },
  marketing: { x: -5, z: -IZ - MD / 2, w: 10, d: MD, facing: 'z' },
  bouw: { x: 10, z: -IZ - MD / 2, w: 20, d: MD, facing: 'z' },
  strategie: { x: -IX - MD / 2, z: -3.5, w: 11, d: MD, facing: 'x' },
};
const SPARE: Room = { x: IX + MD / 2, z: -3.5, w: 11, d: MD, facing: '-x' };

/**
 * Plaats van de deur in de glazen voorkant (lokaal x). Sales en marketing wijken af: daar staan een kolom,
 * de muur van strategie of de belcabine op de standaardplek.
 */
const DOOR_X: Record<string, number> = { sales: 1.25, marketing: -1.25 };
function doorLocal(id: string, r: Room) {
  const n = Math.max(1, Math.round(r.w / 2.5));
  return DOOR_X[id] ?? -(r.w / 2 - r.w / n / 2);
}

/** Camera per ruimte: van waar je kijkt en waarnaar (lokaal). */
export type ZoneKind = 'dept' | 'inkom' | 'lounge' | 'directie' | 'studio' | 'keuken';

export function zoneView(zoneId: string, kind: ZoneKind): { pos: [number, number, number]; target: [number, number, number] } {
  // Sims-zicht: schuin van boven, dak weg en muren omlaag, zodat je in de ruimte kijkt.
  if (kind === 'inkom') return { pos: [10, 16, 17], target: [0, 0.6, 1.5] };
  if (kind === 'lounge') return { pos: [14, 17, 12], target: [-2, MZ * 0.6, -3] };
  if (kind === 'studio') return { pos: [15, 17, 27], target: [11, 0.5, 11.5] };
  if (kind === 'keuken') return { pos: [-2, 18, 23], target: [-13, 0.5, 8] };
  if (kind === 'directie') return { pos: [7, MZ + 11, 1.5], target: [0, MZ + 0.6, -IZ - MD / 2] };
  const r = ROOMS[zoneId] ?? SPARE;
  if (r.facing === 'z') return { pos: [r.x + 6, 12, r.z + 11.5], target: [r.x, 0.5, r.z + 0.3] };
  const s = r.facing === 'x' ? 1 : -1;
  return { pos: [r.x + s * 11.5, 12, r.z + 6], target: [r.x + s * 0.3, 0.5, r.z] };
}

export const zoneKind = (f: FloorModel): ZoneKind =>
  f.offices.length ? 'directie' : f.lounge ? 'lounge' : f.studio ? 'studio' : f.kitchen ? 'keuken' : f.groups.some((g) => g.members[0]?.kind === 'cos') ? 'inkom' : 'dept';

/** Kantoor van een founder op de tussenverdieping (x, lokaal). */
export function officeSlot(officeId: string) {
  const f = floors.find((x) => x.offices.some((o) => `kantoor-${o.id}` === officeId));
  if (!f) return null;
  const i = f.offices.findIndex((o) => `kantoor-${o.id}` === officeId);
  const span = 20;
  const w = span / f.offices.length;
  return { x: -span / 2 + w * (i + 0.5), w, level: f.level };
}

// --- Rondlopen: waar je start en hoe de plek heet ---

/** Startplek per ruimte, in wereldcoördinaten. yaw 0 = kijken naar de achtergevel. */
export function walkSpawn(spot: string): { x: number; y: number; z: number; yaw: number } {
  const at = (x: number, y: number, z: number, yaw: number) => ({ x, y, z: z + B.Z, yaw });
  const f = floors.find((x) => x.id === spot);
  if (!f) return at(0, 0, D / 2 + 7, 0); // buiten, voor de voordeur
  const kind = zoneKind(f);
  if (kind === 'inkom') return at(-3.6, 0, 9.4, -0.35);
  if (kind === 'lounge') return at(0, 0, -2.6, 0);
  if (kind === 'studio') return at(10.4, 0, 8.4, Math.PI);
  if (kind === 'keuken') return at(-11, 0, 8.3, Math.PI / 2 + 0.5);
  if (kind === 'directie') return at(-11.4, MZ, -11, -Math.PI / 2);
  const r = ROOMS[f.id] ?? SPARE;
  // Net binnen, aan de deur, met het gezicht naar de achterwand.
  const inward = 0.9;
  const dl = doorLocal(f.id, r);
  if (r.facing === 'z') return at(r.x + dl, 0, r.z + r.d / 2 - inward, 0);
  const s = r.facing === 'x' ? 1 : -1;
  return at(r.x + s * (r.d / 2 - inward), 0, r.z - s * dl, s * (Math.PI / 2));
}

/** Naam van de plek waar je staat (wereldcoördinaten), voor het label bovenaan. */
export function walkLabel(wx: number, wy: number, wz: number): string {
  const x = wx;
  const z = wz - B.Z;
  if (Math.abs(x) > W / 2 + 0.3 || Math.abs(z) > D / 2 + 0.3) return 'Buiten';
  if (wy > MZ - 0.4) {
    const dir = floors.find((f) => zoneKind(f) === 'directie');
    if (z < -IZ - 0.25 && dir && Math.abs(x) < 10) {
      const slot = dir.offices.find((o) => {
        const s = officeSlot(`kantoor-${o.id}`);
        return s && Math.abs(x - s.x) <= s.w / 2;
      });
      if (slot) return `Kantoor ${slot.name}`;
    }
    if (x < -IX && z > -IZ && z < IZ) return 'Gaming room';
    if (x > IX && z > -IZ && z < 0) return 'Fitness';
    return 'Tussenverdieping';
  }
  if (wy > 0.6) return 'Trap';
  for (const f of floors) {
    if (zoneKind(f) !== 'dept') continue;
    const r = ROOMS[f.id];
    if (!r) continue;
    const hw = r.facing === 'z' ? r.w / 2 : r.d / 2;
    const hd = r.facing === 'z' ? r.d / 2 : r.w / 2;
    if (Math.abs(x - r.x) <= hw && Math.abs(z - r.z) <= hd) return f.label;
  }
  if (Math.abs(x - SPARE.x) <= SPARE.d / 2 && Math.abs(z - SPARE.z) <= SPARE.w / 2) return 'Vergaderzaal';
  if (z > IZ && x > 3.4) return x < 9 ? 'Podcast' : 'Content studio';
  if (x < -9 && z > 3.5) return 'Keuken & lounge';
  if (z > 5) return 'Inkom';
  if (z > -1.6 && Math.abs(x) < 7) return 'War Room';
  return 'Arena';
}

// --- Gedeelde kleine onderdelen ---

interface Ctx {
  byOwner: Record<string, HqTaak[]>;
  live: Record<string, LiveWork>;
  active: boolean;
  focus: string | null;
  level: number;
  /** Zijn de taken te geloven (zie takenStand in model.ts)? */
  takenOk: boolean;
  /** Rondloopmodus: alles op volle detail en al het glas op zijn plaats. */
  walk: boolean;
}

const click = (id: string, level: number) => (e: ThreeEvent<MouseEvent>) => {
  if (e.delta > 6) return;
  e.stopPropagation();
  ui.set({ focus: id, level });
};

/** Wat er live onder de naam staat: "60% · zoekt in Apollo", enkel zolang de agent werkt. */
function liveStatus(w: LiveWork | undefined, mood: Mood) {
  if (!w || w.done || mood !== 'bezig') return undefined;
  const pct = livePct(w);
  const parts = [pct !== null ? `${pct}%` : null, w.doing ?? null].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'bezig';
}

function Seat({ o, mood, ctx, big, pose = 'zit' }: { o: Occupant; mood: Mood; ctx: Ctx; big?: boolean; pose?: 'zit' | 'staat' }) {
  const status = o.kind === 'rol' ? undefined : liveStatus(ctx.live[o.id], mood);
  // Tijdens het rondlopen krijgt enkel wie in je buurt is alle detail en een naamkaartje.
  const root = useRef<THREE.Group>(null);
  const [near, setNear] = useState(false);
  useFrame(() => {
    if (!ctx.walk || !root.current) return;
    root.current.getWorldPosition(seatPos);
    const d = Math.hypot(seatPos.x - walkPos.x, seatPos.z - walkPos.z) + Math.abs(seatPos.y - walkPos.y) * 2;
    if (near ? d > 9 : d < 7.5) setNear(!near);
  });
  const shown = ctx.walk ? near : ctx.active;
  return (
    <group ref={root} position-z={pose === 'zit' ? 0.62 : 0} userData={{ noMerge: true }}>
      <Character
        id={o.id}
        name={o.name}
        shirt={o.color}
        mood={mood}
        pose={pose}
        working={mood === 'bezig'}
        label={ctx.walk ? near && o.kind !== 'rol' : !!status || (ctx.active && (o.kind === 'hoofd' || o.kind === 'cos' || o.kind === 'mens'))}
        status={status}
        big={big}
        selected={ctx.focus === o.id}
        lite={!shown}
        onClick={click(o.id, ctx.level)}
      />
    </group>
  );
}

const M = {
  white: new THREE.MeshStandardMaterial({ color: '#f1efea', roughness: 0.85 }),
  black: new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.4, metalness: 0.5 }),
  silver: new THREE.MeshStandardMaterial({ color: '#b9bec4', roughness: 0.35, metalness: 0.9 }),
  oak: new THREE.MeshStandardMaterial({ color: '#b88a5c', roughness: 0.55 }),
  brass: new THREE.MeshStandardMaterial({ color: '#c9a24a', roughness: 0.3, metalness: 1 }),
  lamp: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffe6bf', emissiveIntensity: 2.2 }),
};

/** Donker plafond met lange lichtlijnen, zoals in de glazen ruimtes op de referentiefoto's. */
function DarkCeiling({ w, d }: { w: number; d: number }) {
  if (useCut() === 'beneden') return null;
  return (
    <group position-y={ROOM_H - 0.01}>
      <mesh rotation-x={Math.PI / 2}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#1a1c20" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {[-d / 4, 0, d / 4].map((z) => (
        <mesh key={z} position={[0, -0.02, z]} rotation-x={Math.PI / 2} material={M.lamp}>
          <planeGeometry args={[w - 1, 0.06]} />
        </mesh>
      ))}
    </group>
  );
}

/** Vergaderzaal naar de referentiefoto: glas rondom, lange eiken tafel, groene stoelen, hanglampen en een scherm. */
function MeetingRoom({ room, ctx }: { room: Room; ctx: Ctx }) {
  const rh = useCut() === 'beneden' ? CUT : ROOM_H;
  const rot = room.facing === 'z' ? 0 : room.facing === 'x' ? Math.PI / 2 : -Math.PI / 2;
  const seats = 10;
  const len = Math.min(room.w - 3, 6.5);
  return (
    <group position={[room.x, 0, room.z]} rotation-y={rot}>
      <DarkCeiling w={room.w} d={room.d} />
      {[-1, 1].map((s) => (
        <group key={s} position-x={(s * room.w) / 2} rotation-y={Math.PI / 2}>
          <GlassFront w={room.d} h={rh} every={2.5} door={false} />
        </group>
      ))}
      <group position-z={room.d / 2}>
        <GlassFront w={room.w} h={rh} every={2.2} doorSide={-1} hidePane={ctx.active && !ctx.walk} />
      </group>
      {/* Tafel en stoelen */}
      <mesh position={[0, 0.75, 0]} material={M.oak} castShadow>
        <boxGeometry args={[len, 0.06, 1.4]} />
      </mesh>
      {[-len / 2 + 0.8, len / 2 - 0.8].map((x) => (
        <mesh key={x} position={[x, 0.36, 0]} material={M.oak}>
          <boxGeometry args={[0.12, 0.72, 0.9]} />
        </mesh>
      ))}
      {Array.from({ length: seats / 2 }, (_, i) => {
        const x = (i / (seats / 2 - 1) - 0.5) * (len - 1.2);
        return [1, -1].map((s) => (
          <group key={`${i}${s}`} position={[x, 0, s * 0.2]} rotation-y={s > 0 ? 0 : Math.PI}>
            <Chair color="#2f6b3a" lite={!ctx.active} />
          </group>
        ));
      })}
      {[-len / 3, 0, len / 3].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position-y={ROOM_H - 0.55} material={M.black}>
            <cylinderGeometry args={[0.004, 0.004, 1.1, 4]} />
          </mesh>
          <mesh position-y={2.25} material={M.lamp}>
            <cylinderGeometry args={[0.28, 0.28, 0.02, 24]} />
          </mesh>
        </group>
      ))}
      {/* Scherm aan de achtermuur */}
      <mesh position={[0, ROOM_H / 2, -room.d / 2 + 0.02]} material={M.white}>
        <planeGeometry args={[room.w, ROOM_H]} />
      </mesh>
      <group position={[room.w / 2 - 2.4, 1.7, -room.d / 2 + 0.08]}>
        <mesh material={M.black}>
          <boxGeometry args={[2.4, 1.4, 0.06]} />
        </mesh>
        <mesh position-z={0.032}>
          <planeGeometry args={[2.3, 1.3]} />
          <meshStandardMaterial color="#000000" emissive="#ffffff" emissiveMap={screenTex('#2ff0a6')} emissiveIntensity={0.85} />
        </mesh>
      </group>
      <Text font={FONT} fontSize={0.3} letterSpacing={0.2} color="#0b1526" position={[-room.w / 2 + 0.5, ROOM_H - 0.5, -room.d / 2 + 0.04]} anchorX="left">
        VERGADERZAAL
      </Text>
      <group position={[-room.w / 2 + 0.6, 0, -room.d / 2 + 0.6]}>
        <Plant tall scale={1.2} />
      </group>
    </group>
  );
}

/** Rij bureaus met de mensen naar het glas toe (je ziet hun gezicht vanuit de arena). */
function DeskRow({ group, cx, ctx }: { group: FloorModel['groups'][number]; cx: number; ctx: Ctx }) {
  const [head, ...roles] = group.members;
  const tasks = ctx.byOwner[head.id] ?? [];
  const headMood = moodOf(tasks, ctx.live[head.id], ctx.takenOk);
  const people = [head, ...roles];
  const gap = 1.9;
  return (
    <group position-x={cx}>
      {people.map((p, i) => {
        const x = (i - (people.length - 1) / 2) * gap;
        const mood = p.kind === 'rol' ? (moodOf([], ctx.live[p.id]) === 'bezig' || headMood === 'bezig' ? 'bezig' : headMood === 'rust' || headMood === 'offline' ? headMood : 'open') : headMood;
        return (
          <group key={p.id} position={[x, 0, 0.1]}>
            <Desk screen={MOOD_COLOR[mood]} wide={p.kind === 'hoofd'} lite={!ctx.active} />
            <Seat o={p} mood={mood} ctx={ctx} big={p.kind === 'hoofd'} />
          </group>
        );
      })}
    </group>
  );
}

// --- Inrichting per afdeling: elke ruimte een eigen sfeer ---

function Gong() {
  return (
    <group>
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, 0.85, 0]} material={M.black}>
          <boxGeometry args={[0.06, 1.7, 0.06]} />
        </mesh>
      ))}
      <mesh position-y={1.68} material={M.black}>
        <boxGeometry args={[1.2, 0.06, 0.06]} />
      </mesh>
      <mesh position-y={1.05} rotation-x={Math.PI / 2} material={M.brass}>
        <cylinderGeometry args={[0.42, 0.42, 0.04, 36]} />
      </mesh>
    </group>
  );
}

function RingLightSet() {
  return (
    <group>
      <mesh position-y={0.8} material={M.black}>
        <cylinderGeometry args={[0.015, 0.015, 1.6, 8]} />
      </mesh>
      <mesh position-y={1.65}>
        <torusGeometry args={[0.28, 0.03, 10, 32]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} />
      </mesh>
      <group position={[0.9, 0, 0.3]}>
        <mesh position-y={0.7} material={M.black}>
          <cylinderGeometry args={[0.012, 0.03, 1.4, 6]} />
        </mesh>
        <mesh position={[0, 1.45, 0]} material={M.black}>
          <boxGeometry args={[0.2, 0.14, 0.12]} />
        </mesh>
      </group>
      {/* Achtergrondrol */}
      <mesh position={[0.3, 1.4, -1.0]} material={M.white}>
        <planeGeometry args={[2.2, 2.6]} />
      </mesh>
    </group>
  );
}

function ServerRack() {
  const blink = useMemo(() => new THREE.MeshStandardMaterial({ color: '#000', emissive: '#2ff0a6', emissiveIntensity: 1.6 }), []);
  return (
    <group>
      <mesh position-y={1} material={M.black}>
        <boxGeometry args={[0.7, 2, 0.8]} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[-0.2 + (i % 2) * 0.12, 0.4 + i * 0.2, 0.405]} material={blink}>
          <planeGeometry args={[0.05, 0.02]} />
        </mesh>
      ))}
    </group>
  );
}

function Whiteboard() {
  return (
    <group>
      <mesh position-y={1.5} material={M.white}>
        <boxGeometry args={[2.6, 1.3, 0.04]} />
      </mesh>
      {[0.35, 0.6, 0.5, 0.85, 1.0].map((hh, i) => (
        <mesh key={i} position={[-0.8 + i * 0.38, 0.95 + hh / 2, 0.025]}>
          <planeGeometry args={[0.24, hh]} />
          <meshBasicMaterial color={['#2f7bff', '#13c7e6', '#2ff0a6', '#13c7e6', '#2f7bff'][i]} />
        </mesh>
      ))}
    </group>
  );
}

function MoodBoard() {
  const colors = ['#e9c46a', '#2f7bff', '#f4a261', '#2ff0a6', '#e76f51', '#13c7e6', '#ffffff', '#264653'];
  return (
    <group>
      {colors.map((c, i) => (
        <mesh key={i} position={[(i % 4) * 0.5 - 0.75, 1.3 + Math.floor(i / 4) * 0.55, 0]} rotation-z={((i * 37) % 10) / 80 - 0.06}>
          <planeGeometry args={[0.42, 0.42]} />
          <meshStandardMaterial color={c} />
        </mesh>
      ))}
    </group>
  );
}

const THEME: Record<string, { floor: 'hout' | 'tapijt'; wall: string; sign: string }> = {
  sales: { floor: 'tapijt', wall: '#2f7bff', sign: 'SALES' },
  marketing: { floor: 'hout', wall: '#2ff0a6', sign: 'CONTENT' },
  bouw: { floor: 'tapijt', wall: '#add78f', sign: 'BUILD' },
  strategie: { floor: 'hout', wall: '#13c7e6', sign: 'STRATEGY' },
};

/** Een afdelingsruimte onder de tussenverdieping. Lokaal: glazen voorkant op +z, achtermuur op -z. */
function DeptRoom({ floor, room, ctx }: { floor: FloorModel; room: Room; ctx: Ctx }) {
  const rh = useCut() === 'beneden' ? CUT : ROOM_H;
  const theme = THEME[floor.id] ?? { floor: 'hout', wall: floor.groups[0]?.color ?? '#13c7e6', sign: floor.label.toUpperCase() };
  const rot = room.facing === 'z' ? 0 : room.facing === 'x' ? Math.PI / 2 : -Math.PI / 2;
  const groups = floor.groups;
  const wood = useMemo(() => woodTex([room.w / 4, room.d / 4]), [room.w, room.d]);
  const carpet = useMemo(() => carpetTex([room.w / 3, room.d / 3], '#3a4250'), [room.w, room.d]);
  const accent = lighten(theme.wall, 0.55);
  const zoneLevel = floor.level;
  const boardTasks = ctx.byOwner[groups[0]?.members[0]?.id ?? ''] ?? [];
  return (
    <group position={[room.x, 0, room.z]} rotation-y={rot}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.05} receiveShadow>
        <planeGeometry args={[room.w, room.d]} />
        {theme.floor === 'hout' ? <meshStandardMaterial map={wood} roughness={0.6} /> : <meshStandardMaterial map={carpet} roughness={1} />}
      </mesh>
      {/* Achtermuur met accentkleur en naam van de afdeling */}
      <mesh position={[0, ROOM_H / 2, -room.d / 2 + 0.02]}>
        <planeGeometry args={[room.w, ROOM_H]} />
        <meshStandardMaterial color={accent} roughness={0.9} />
      </mesh>
      <Text font={FONT} fontSize={0.42} letterSpacing={0.2} color="#0b1526" position={[-room.w / 2 + 0.6, ROOM_H - 0.55, -room.d / 2 + 0.04]} anchorX="left">
        {theme.sign}
      </Text>
      <mesh position={[-room.w / 2 + 0.6 + 1.4, ROOM_H - 0.85, -room.d / 2 + 0.04]}>
        <planeGeometry args={[2.8, 0.04]} />
        <meshBasicMaterial map={brandGradientTex()} toneMapped={false} />
      </mesh>
      {/* Zijwanden (gedeeld met de buren) */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * room.w) / 2, rh / 2, 0]} material={M.white}>
          <boxGeometry args={[0.12, rh, room.d]} />
        </mesh>
      ))}
      <DarkCeiling w={room.w} d={room.d} />
      <group position-z={room.d / 2}>
        <GlassFront w={room.w} h={rh} doorX={doorLocal(floor.id, room)} hidePane={ctx.active && !ctx.walk} />
      </group>
      {/* Takenbord aan de achtermuur */}
      <group position={[room.w / 2 - 2.6, 1.95, -room.d / 2 + 0.08]}>
        <TaskBoard title={groups[0]?.label ?? floor.label} subtitle={`${groups[0]?.members[0]?.name ?? ''} · ${floor.label}`} tasks={boardTasks} w={3.8} h={2.1} />
      </group>
      {groups.length > 1 && (
        <group position={[-room.w / 2 + 3.4, 1.95, -room.d / 2 + 0.08]}>
          <TaskBoard title={groups[1].label} subtitle={groups[1].members[0]?.name ?? ''} tasks={ctx.byOwner[groups[1].members[0]?.id ?? ''] ?? []} w={3.8} h={2.1} />
        </group>
      )}
      {/* Bureaus */}
      {groups.slice(0, 2).map((g, i) => (
        <DeskRow key={g.id} group={g} cx={groups.length > 1 ? (i ? room.w / 4 : -room.w / 4) : -0.8} ctx={ctx} />
      ))}
      {/* Eigen sfeer per afdeling */}
      {floor.id === 'sales' && (
        <>
          <group position={[room.w / 2 - 1.1, 0, 1.3]} rotation-y={Math.PI}>
            <Booth color={theme.wall} />
          </group>
          <group position={[-room.w / 2 + 0.9, 0, -1.6]}>
            <Gong />
          </group>
        </>
      )}
      {floor.id === 'marketing' && (
        <>
          <group position={[room.w / 2 - 1.6, 0, 0.4]} rotation-y={-0.4}>
            <RingLightSet />
          </group>
          <group position={[-room.w / 2 + 1.4, 0, -room.d / 2 + 0.06]}>
            <MoodBoard />
          </group>
        </>
      )}
      {floor.id === 'bouw' && (
        <>
          {[0, 0.8].map((x) => (
            <group key={x} position={[-room.w / 2 + 0.6 + x, 0, -1.8]}>
              <ServerRack />
            </group>
          ))}
          <mesh position={[room.w / 2 - 1.6, 0.47, -1.7]} material={M.oak}>
            <boxGeometry args={[2.2, 0.94, 0.8]} />
          </mesh>
        </>
      )}
      {floor.id === 'strategie' && (
        <>
          <group position={[-room.w / 2 + 2, 0, -room.d / 2 + 0.06]}>
            <Whiteboard />
          </group>
          <group position={[room.w / 2 - 1.3, 0, -room.d / 2 + 0.35]}>
            <Shelf w={1.8} />
          </group>
        </>
      )}
      <group position={[room.w / 2 - 0.5, 0, room.d / 2 - 0.6]}>
        <Plant tall scale={1.1} />
      </group>
      {/* Klikvlak: deze ruimte bekijken */}
      <mesh position={[0, ROOM_H / 2, 0]} onClick={(e) => (e.delta < 6 && !ctx.active ? (e.stopPropagation(), ui.go(zoneLevel)) : undefined)}>
        <boxGeometry args={[room.w, ROOM_H, room.d]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  );
}

/** Videobeeld van een lopende call op het scherm in het kantoor. */
function VideoScreen({ stream }: { stream: MediaStream }) {
  const tex = useMemo(() => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.srcObject = stream;
    void v.play().catch(() => {});
    const t = new THREE.VideoTexture(v);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [stream]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh>
      <planeGeometry args={[2.4, 1.35]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

const W_MAT = {
  walnut: new THREE.MeshStandardMaterial({ color: '#5c3720', roughness: 0.45 }),
  cognac: new THREE.MeshStandardMaterial({ color: '#b0602a', roughness: 0.42 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#d9dcdf', roughness: 0.15, metalness: 1 }),
  frame: new THREE.MeshStandardMaterial({ color: '#2a1a10', roughness: 0.5 }),
  paper: new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 0.9 }),
};

/** Cognac-lederen bureaustoel met hoge rug en verchroomde voet. */
function LeatherChair() {
  return (
    <group>
      <RoundedBox args={[0.62, 0.16, 0.6]} radius={0.07} position-y={0.48} material={W_MAT.cognac} />
      <RoundedBox args={[0.6, 0.72, 0.16]} radius={0.08} position={[0, 0.9, 0.27]} rotation-x={-0.18} material={W_MAT.cognac} />
      <RoundedBox args={[0.5, 0.22, 0.14]} radius={0.06} position={[0, 1.32, 0.33]} rotation-x={-0.25} material={W_MAT.cognac} />
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[0.08, 0.06, 0.48]} radius={0.03} position={[s * 0.34, 0.68, 0.02]} material={W_MAT.walnut} />
      ))}
      <mesh position-y={0.24} material={W_MAT.chrome}>
        <cylinderGeometry args={[0.035, 0.035, 0.4, 10]} />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position-y={0.04} rotation-y={(i / 5) * Math.PI * 2} material={W_MAT.chrome}>
          <boxGeometry args={[0.6, 0.03, 0.05]} />
        </mesh>
      ))}
    </group>
  );
}

/** Boekenwand in notenhout, vol boeken, met een globe en ingelijste foto's. */
function BookWall({ w, h }: { w: number; h: number }) {
  const cols = Math.max(2, Math.round(w / 0.95));
  const rows = 5;
  const books = useRef<THREE.InstancedMesh>(null);
  const perShelf = 9;
  const n = cols * (rows - 1) * perShelf;
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    const tones = ['#7a2e24', '#1f3a5a', '#2e4a2e', '#c9b38a', '#3a2a20', '#8a6a3a', '#efe6d2', '#4a2a3a', '#2a4a5a'];
    let i = 0;
    for (let c = 0; c < cols; c++)
      for (let r = 1; r < rows; r++)
        for (let k = 0; k < perShelf; k++) {
          const seed = Math.sin(i * 12.9898) * 43758.5453;
          const rnd = seed - Math.floor(seed);
          const bh = 0.22 + rnd * 0.12;
          const skip = (c + r) % 3 === 0 && k > 5; // ruimte voor een globe of fotolijst
          p.set(-w / 2 + (c + 0.12) * (w / cols) + k * ((w / cols) * 0.085), (r * h) / rows + bh / 2 + 0.03, 0.02);
          sc.set(skip ? 0.0001 : 1, bh / 0.3, 1);
          m.compose(p, q, sc);
          books.current!.setMatrixAt(i, m);
          books.current!.setColorAt(i, col.set(tones[Math.floor(rnd * tones.length)]));
          i++;
        }
    books.current!.instanceMatrix.needsUpdate = true;
    if (books.current!.instanceColor) books.current!.instanceColor.needsUpdate = true;
  }, [cols, w, h, n]);
  return (
    <group>
      <mesh position={[0, h / 2, -0.18]} material={W_MAT.frame}>
        <boxGeometry args={[w, h, 0.04]} />
      </mesh>
      {Array.from({ length: rows + 1 }, (_, r) => (
        <mesh key={`p${r}`} position={[0, (r * h) / rows, 0]} material={W_MAT.walnut}>
          <boxGeometry args={[w, 0.04, 0.36]} />
        </mesh>
      ))}
      {Array.from({ length: cols + 1 }, (_, c) => (
        <mesh key={`s${c}`} position={[-w / 2 + (c * w) / cols, h / 2, 0]} material={W_MAT.walnut}>
          <boxGeometry args={[0.04, h, 0.36]} />
        </mesh>
      ))}
      <instancedMesh ref={books} args={[undefined, undefined, n]}>
        <boxGeometry args={[0.06, 0.3, 0.26]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      {/* Globe en fotolijstjes in de open vakken */}
      <group position={[-w / 2 + (w / cols) * 0.8, (2 * h) / rows + 0.17, 0]}>
        <mesh>
          <sphereGeometry args={[0.13, 20, 14]} />
          <meshStandardMaterial color="#b89a5a" roughness={0.5} metalness={0.3} />
        </mesh>
      </group>
      <group position={[-w / 2 + (w / cols) * 2.8, (3 * h) / rows + 0.17, 0.05]}>
        <mesh material={W_MAT.frame}>
          <boxGeometry args={[0.28, 0.22, 0.02]} />
        </mesh>
        <mesh position-z={0.012} material={W_MAT.paper}>
          <planeGeometry args={[0.22, 0.16]} />
        </mesh>
      </group>
    </group>
  );
}

/** Mid-century kantoor (Ebert): notenhout, boekenwand, cognac leder, warm licht. */
function WalnutOffice({ o, w, d, h, mood, ctx, online, doorSide }: { o: Occupant; w: number; d: number; h: number; mood: Mood; ctx: Ctx; online: boolean; doorSide: 1 | -1 }) {
  const panel = useMemo(() => walnutTex([w / 2.5, h / 2.5]), [w, h]);
  const panelSide = useMemo(() => walnutTex([d / 2.5, h / 2.5]), [d, h]);
  const ceil = useMemo(() => walnutTex([w / 2.5, d / 2.5]), [w, d]);
  const screen = useMemo(() => new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: screenTex(MOOD_COLOR[mood]), emissiveIntensity: 0.9 }), [mood]);
  const open = useCut() === 'boven'; // Sims-modus: plafond weg, zijwanden laag
  const sh = open ? CUT : h;
  return (
    <group>
      {/* Lambrisering en houten plafond */}
      <mesh position={[0, h / 2, -d / 2 + 0.03]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={panel} roughness={0.5} />
      </mesh>
      {[-1, 1].map((s) =>
        s === doorSide && sh > DOOR_H + 0.2 ? (
          <group key={s}>
            {[
              { z: (-d / 2 + OFFICE_DOOR_Z - 0.6) / 2, len: OFFICE_DOOR_Z - 0.6 + d / 2 },
              { z: (d / 2 + OFFICE_DOOR_Z + 0.6) / 2, len: d / 2 - OFFICE_DOOR_Z - 0.6 },
            ].map((p) => (
              <mesh key={p.z} position={[s * (w / 2 - 0.06), sh / 2, p.z]} rotation-y={-s * (Math.PI / 2)}>
                <planeGeometry args={[p.len, sh]} />
                <meshStandardMaterial map={panelSide} roughness={0.5} />
              </mesh>
            ))}
            <mesh position={[s * (w / 2 - 0.06), (DOOR_H + sh) / 2, OFFICE_DOOR_Z]} rotation-y={-s * (Math.PI / 2)}>
              <planeGeometry args={[1.2, sh - DOOR_H]} />
              <meshStandardMaterial map={panelSide} roughness={0.5} />
            </mesh>
          </group>
        ) : (
          <mesh key={s} position={[s * (w / 2 - 0.06), sh / 2, 0]} rotation-y={-s * (Math.PI / 2)}>
            <planeGeometry args={[d, sh]} />
            <meshStandardMaterial map={panelSide} roughness={0.5} />
          </mesh>
        ),
      )}
      {!open && (
        <mesh position-y={h} rotation-x={Math.PI / 2}>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial map={ceil} roughness={0.55} side={THREE.DoubleSide} />
        </mesh>
      )}
      <mesh position-y={h - 0.25}>
        <sphereGeometry args={[0.22, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        <meshStandardMaterial color="#ffffff" emissive="#fff1d6" emissiveIntensity={1.4} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[0, h - 0.5, 0]} intensity={4} distance={7} decay={2} color="#ffdcaa" />
      {/* Boekenwand */}
      <group position={[-w / 2 + 2.3, 0, -d / 2 + 0.22]}>
        <BookWall w={4.2} h={h - 0.2} />
      </group>
      {/* Bureau in notenhout met ladekast, scherm en lamp */}
      <group position={[0.2, 0, 0.1]} rotation-y={Math.PI - 0.35}>
        <mesh position-y={0.74} material={W_MAT.walnut}>
          <boxGeometry args={[2.1, 0.06, 0.85]} />
        </mesh>
        <mesh position={[0.68, 0.37, 0]} material={W_MAT.walnut}>
          <boxGeometry args={[0.62, 0.72, 0.8]} />
        </mesh>
        {[0.16, 0.4, 0.62].map((y) => (
          <mesh key={y} position={[0.68, y, -0.405]} material={W_MAT.chrome}>
            <boxGeometry args={[0.18, 0.02, 0.02]} />
          </mesh>
        ))}
        <mesh position={[-0.98, 0.37, 0]} material={W_MAT.walnut}>
          <boxGeometry args={[0.06, 0.72, 0.8]} />
        </mesh>
        <group position={[0, 0.77, -0.2]}>
          <mesh position-y={0.04} material={W_MAT.chrome}>
            <boxGeometry args={[0.2, 0.02, 0.16]} />
          </mesh>
          <mesh position-y={0.36} material={W_MAT.chrome}>
            <boxGeometry args={[0.82, 0.5, 0.03]} />
          </mesh>
          <mesh position={[0, 0.38, 0.017]} material={screen}>
            <planeGeometry args={[0.76, 0.42]} />
          </mesh>
        </group>
        <group position={[-0.7, 0.77, -0.2]}>
          <mesh position-y={0.2} rotation-z={0.4} material={W_MAT.frame}>
            <cylinderGeometry args={[0.01, 0.01, 0.42, 6]} />
          </mesh>
          <mesh position={[0.1, 0.4, 0]} rotation-z={-0.6} material={W_MAT.frame}>
            <coneGeometry args={[0.09, 0.14, 16, 1, true]} />
          </mesh>
        </group>
        <group position-z={0.62}>
          <LeatherChair />
        </group>
        {online && <Seat o={o} mood={mood} ctx={ctx} big />}
      </group>
      {/* Lederen fauteuil voor bezoekers, staande lamp en kunst aan de muur */}
      <group position={[2.6, 0, 1.2]} rotation-y={Math.PI + 0.5}>
        <RoundedBox args={[0.85, 0.4, 0.8]} radius={0.12} position-y={0.32} material={W_MAT.cognac} />
        <RoundedBox args={[0.85, 0.55, 0.2]} radius={0.1} position={[0, 0.66, 0.3]} rotation-x={-0.2} material={W_MAT.cognac} />
      </group>
      <group position={[w / 2 - 0.6, 0, -d / 2 + 0.8]}>
        <mesh position-y={0.8} material={W_MAT.frame}>
          <cylinderGeometry args={[0.012, 0.012, 1.6, 6]} />
        </mesh>
        <mesh position-y={1.65} material={W_MAT.frame}>
          <coneGeometry args={[0.18, 0.22, 18, 1, true]} />
        </mesh>
        <mesh position-y={1.58} rotation-x={Math.PI / 2} material={M.lamp}>
          <circleGeometry args={[0.13, 16]} />
        </mesh>
      </group>
      <group position={[w / 2 - 0.08, 1.7, -0.6]} rotation-y={-Math.PI / 2}>
        <mesh material={W_MAT.frame}>
          <boxGeometry args={[0.9, 1.1, 0.04]} />
        </mesh>
        <mesh position-z={0.022}>
          <planeGeometry args={[0.74, 0.94]} />
          <meshStandardMaterial color="#d8d2c6" roughness={0.9} />
        </mesh>
        <mesh position={[0.05, -0.05, 0.024]}>
          <planeGeometry args={[0.4, 0.56]} />
          <meshStandardMaterial color="#2b2b2b" roughness={0.9} />
        </mesh>
      </group>
      <group position={[-w / 2 + 0.7, 0, -0.5]}>
        <Plant tall scale={1.2} />
      </group>
      <group position-y={0.005}>
        <Rug w={3.2} d={2.4} color="#8a6a4a" />
      </group>
    </group>
  );
}

/** Kantoor van een founder op de tussenverdieping, glas naar de arena. */
function Office({ o, x, w, ctx, online }: { o: Occupant; x: number; w: number; ctx: Ctx; online: boolean }) {
  const doorSide: 1 | -1 = x < 0 ? -1 : 1;
  const tasks = ctx.byOwner[o.id] ?? [];
  const mood: Mood = online ? moodOf(tasks, undefined, ctx.takenOk) : 'offline';
  const call = useCall((s) => (s.peer === o.id && s.status === 'verbonden' ? s.remote : null));
  const d = MD;
  const h = 3;
  const wh = useCut() === 'boven' ? CUT : h; // muren omlaag in Sims-modus
  const wood = useMemo(() => woodTex([w / 4, d / 4]), [w, d]);
  // Stijl van het kantoor uit team.config.json (hq.officeStyles), bv. "walnoot" voor Ebert.
  const walnoot = config.hq?.officeStyles?.[o.id] === 'walnoot';
  return (
    <group position={[x, MZ, -IZ - MD / 2]} onClick={click(`kantoor-${o.id}`, ctx.level)}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.012} receiveShadow>
        <planeGeometry args={[w - 0.1, d - 0.1]} />
        <meshStandardMaterial map={wood} roughness={0.55} color={ctx.focus === `kantoor-${o.id}` ? '#fff7ea' : '#ffffff'} />
      </mesh>
      {[-1, 1].map((s) =>
        // De voorkant ligt tegen de balustrade: je komt binnen langs een schuifdeur in de buitenste zijwand.
        s === doorSide && wh > DOOR_H + 0.2 ? (
          <group key={s}>
            {[
              { z: (-d / 2 + OFFICE_DOOR_Z - 0.6) / 2, len: OFFICE_DOOR_Z - 0.6 + d / 2 },
              { z: (d / 2 + OFFICE_DOOR_Z + 0.6) / 2, len: d / 2 - OFFICE_DOOR_Z - 0.6 },
            ].map((p) => (
              <mesh key={p.z} position={[(s * w) / 2, wh / 2, p.z]} material={M.white}>
                <boxGeometry args={[0.1, wh, p.len]} />
              </mesh>
            ))}
            <mesh position={[(s * w) / 2, (DOOR_H + wh) / 2, OFFICE_DOOR_Z]} material={M.white}>
              <boxGeometry args={[0.1, wh - DOOR_H, 1.2]} />
            </mesh>
            <group position={[(s * w) / 2, 0, OFFICE_DOOR_Z]} rotation-y={Math.PI / 2}>
              <SlideDoor w={1.2} />
            </group>
          </group>
        ) : (
          <mesh key={s} position={[(s * w) / 2, wh / 2, 0]} material={M.white}>
            <boxGeometry args={[0.1, wh, d]} />
          </mesh>
        ),
      )}
      <group position-z={d / 2 - 0.3}>
        <GlassFront w={w} h={wh} door={false} hidePane={ctx.active && !ctx.walk} />
      </group>
      {walnoot && <WalnutOffice o={o} w={w} d={d} h={h} mood={mood} ctx={ctx} online={online} doorSide={doorSide} />}
      {!walnoot && (
        <group position={[0.4, 0, 0.3]} rotation-y={Math.PI - 0.6}>
          <Desk wide screen={MOOD_COLOR[mood]} lite={!ctx.active} />
          {online && <Seat o={o} mood={mood} ctx={ctx} big />}
        </group>
      )}
      <Text font={FONT} fontSize={0.12} color="#0b1526" position={[0, 0.62, 0.72]} anchorY="middle">
        {o.name}
      </Text>
      {!walnoot && (
        <>
          {[-0.7, 0.7].map((dx) => (
            <group key={dx} position={[dx, 0, 1.6]}>
              <Sofa color="#6b4428" w={0.95} />
            </group>
          ))}
          <group position={[w / 2 - 0.7, 0, -d / 2 + 0.7]}>
            <Plant tall scale={1.1} />
          </group>
          <group position={[-w / 2 + 1.2, 0, -d / 2 + 0.3]}>
            <Shelf w={1.8} />
          </group>
        </>
      )}
      <group position={walnoot ? [2.3, 1.75, -d / 2 + 0.1] : [0.9, 1.75, -d / 2 + 0.08]}>
        {call ? (
          <VideoScreen stream={call} />
        ) : (
          <TaskBoard title={`Kantoor ${o.name}`} subtitle={o.name} tasks={tasks} w={3.2} h={1.8} />
        )}
      </group>
      {!online && ctx.active && (
        <Billboard position={[0, 1.6, 0.9]}>
          <Text font={FONT_REGULAR} fontSize={0.16} color="#ffffff" outlineWidth={0.02} outlineColor="#0b1526">
            {`${o.name} is niet in het HQ`}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

// --- De hal zelf ---

/** Balustrade: zwarte stalen palen, glas en een leuning, langs een lijn. */
function Railing({ from, to }: { from: [number, number]; to: [number, number] }) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const ang = Math.atan2(-(to[1] - from[1]), to[0] - from[0]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const n = Math.max(2, Math.round(len / 1.5) + 1);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      m.makeTranslation((i / (n - 1) - 0.5) * len, 0.55, 0);
      ref.current!.setMatrixAt(i, m);
    }
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [n, len]);
  return (
    <group position={[(from[0] + to[0]) / 2, MZ, (from[1] + to[1]) / 2]} rotation-y={ang}>
      <instancedMesh ref={ref} args={[undefined, steelMat, n]}>
        <boxGeometry args={[0.05, 1.1, 0.05]} />
      </instancedMesh>
      <mesh position-y={1.1} material={steelMat}>
        <boxGeometry args={[len, 0.06, 0.08]} />
      </mesh>
      <mesh position-y={0.55} material={glassMat}>
        <planeGeometry args={[len, 0.9]} />
      </mesh>
      {/* Stalen rand van de vloerplaat */}
      <mesh position-y={-0.18} material={steelMat}>
        <boxGeometry args={[len, 0.36, 0.06]} />
      </mesh>
    </group>
  );
}

/** Zwarte stalen trap van de arena naar de tussenverdieping. */
function Stair({ x, side }: { x: number; side: 1 | -1 }) {
  const steps = 20;
  const run = 6.2;
  const width = 1.3;
  const z0 = 7.4; // onderaan
  const tread = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < steps; i++) {
      m.makeTranslation(0, ((i + 1) / steps) * MZ - 0.03, z0 - (i / steps) * run - run / steps / 2);
      tread.current!.setMatrixAt(i, m);
    }
    tread.current!.instanceMatrix.needsUpdate = true;
  }, []);
  const ang = Math.atan2(MZ, run);
  const len = Math.hypot(MZ, run);
  return (
    <group position-x={x}>
      <instancedMesh ref={tread} args={[undefined, M.oak, steps]} castShadow>
        <boxGeometry args={[width, 0.06, run / steps + 0.05]} />
      </instancedMesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[(s * width) / 2, MZ / 2 - 0.1, z0 - run / 2]} rotation-x={ang} material={steelMat}>
            <boxGeometry args={[0.06, 0.3, len]} />
          </mesh>
          <mesh position={[(s * width) / 2, MZ / 2 + 0.9, z0 - run / 2]} rotation-x={ang} material={steelMat}>
            <boxGeometry args={[0.04, 0.05, len]} />
          </mesh>
        </group>
      ))}
      {/* Bordes bovenaan, aansluitend op de tussenverdieping */}
      <mesh position={[side * 0.1, MZ - 0.12, z0 - run - 0.6]} material={steelMat}>
        <boxGeometry args={[width + 0.4, 0.24, 1.2]} />
      </mesh>
      {/* Leuning rond het bordes: je kan er enkel naar de tussenverdieping af */}
      <group position-x={-x}>
        <Railing from={[x + side * 0.1 - 0.85, z0 - run - 1.2]} to={[x + side * 0.1 + 0.85, z0 - run - 1.2]} />
        <Railing from={[x + side * 0.1 - side * 0.85, z0 - run - 1.2]} to={[x + side * 0.1 - side * 0.85, z0 - run]} />
      </group>
    </group>
  );
}

/** Stalen kolommen als lage stompjes, wanneer de tussenverdieping weg is (Sims-modus gelijkvloers). */
function Columns() {
  const cols: [number, number][] = [];
  for (const x of [-IX, -9, -3, 3, 9, IX]) cols.push([x, -IZ], [x, IZ]);
  for (const z of [-3, 3]) cols.push([-IX, z], [IX, z]);
  return (
    <group>
      {cols.map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, CUT / 2, z]} material={steelMat}>
          <boxGeometry args={[0.28, CUT, 0.28]} />
        </mesh>
      ))}
    </group>
  );
}

function Mezzanine() {
  const concrete = useMemo(() => concreteTex([10, 2]), []);
  const strips: [number, number, number, number][] = [
    [0, -IZ - MD / 2, W, MD], // achter
    [0, IZ + MD / 2, W, MD], // voor
    [-IX - MD / 2, 0, MD, IZ * 2], // links
    [IX + MD / 2, 0, MD, IZ * 2], // rechts
  ];
  const cols: [number, number][] = [];
  for (const x of [-IX, -9, -3, 3, 9, IX]) cols.push([x, -IZ], [x, IZ]);
  for (const z of [-3, 3]) cols.push([-IX, z], [IX, z]);
  const gap = 1.3; // opening bovenaan de trappen
  return (
    <group>
      {strips.map(([x, z, w, d], i) => (
        <group key={i}>
          <mesh position={[x, MZ - 0.175, z]} castShadow receiveShadow>
            <boxGeometry args={[w, 0.35, d]} />
            <meshStandardMaterial map={concrete} color="#cfcbc4" roughness={0.6} />
          </mesh>
        </group>
      ))}
      {cols.map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, MZ / 2, z]} material={steelMat} castShadow>
          <boxGeometry args={[0.28, MZ, 0.28]} />
        </mesh>
      ))}
      <Railing from={[-IX, IZ]} to={[IX, IZ]} />
      <Railing from={[-IX, -IZ]} to={[IX, -IZ]} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Railing from={[s * IX, -IZ]} to={[s * IX, 0.6 - gap / 2]} />
          <Railing from={[s * IX, 0.6 + gap / 2]} to={[s * IX, IZ]} />
        </group>
      ))}
    </group>
  );
}

/** Buitenschil: rode baksteen buiten, witte baksteen binnen, glazen voorgevel, zinken dak met lichtstraten. */
function Shell() {
  const cut = useCut();
  // Muurhoogte: volledig van buiten, laag in Sims-modus (gelijkvloers), of tot net boven de tussenverdieping.
  const wallH = cut === 'beneden' ? CUT : cut === 'boven' ? MZ + CUT : H;
  const plinth = 0.9;
  const ribbon = [5.2, 8.0]; // lichtstrook in de zijgevels
  const clad = useMemo(() => corrugatedTex([W / 2.4, (H - plinth) / 2.4]), []);
  const cladSide = useMemo(() => corrugatedTex([D / 2.4, 2]), []);
  const inner = useMemo(() => concretePanelTex([W / 3, H / 3]), []);
  const innerSide = useMemo(() => concretePanelTex([D / 3, H / 3]), []);
  const cedar = useMemo(() => cedarTex([1.6, H / 2.5]), []);
  const slope = Math.hypot(D / 2, RISE);
  const ang = Math.atan2(RISE, D / 2);
  const zinc = useMemo(() => zincTex([slope / 3, (W + 1) / 3]), [slope]);
  const gable = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-D / 2 - 0.3, 0);
    s.lineTo(D / 2 + 0.3, 0);
    s.lineTo(0, RISE);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false });
  }, []);
  const gableClad = useMemo(() => corrugatedTex([D / 2.4, RISE / 2.4]), []);
  const concrete = useMemo(() => new THREE.MeshStandardMaterial({ map: concreteTex([W / 4, 1]), color: '#a9a59e', roughness: 0.9 }), []);
  const cladMat = useMemo(() => new THREE.MeshStandardMaterial({ map: clad, bumpMap: clad, bumpScale: 3, roughness: 0.55, metalness: 0.55 }), [clad]);
  const cladSideMat = useMemo(() => new THREE.MeshStandardMaterial({ map: cladSide, bumpMap: cladSide, bumpScale: 3, roughness: 0.55, metalness: 0.55 }), [cladSide]);
  const sky = useMemo(() => new THREE.MeshStandardMaterial({ color: '#cfe6f5', emissive: '#bfe0f7', emissiveIntensity: 0.25, roughness: 0.1, metalness: 0.3 }), []);
  // Stuk zijgevel tussen twee hoogtes (golfplaat), afgesneden op de muurhoogte.
  const sidePart = (s: number, y0: number, y1: number, key: string) => {
    const top = Math.min(y1, wallH);
    if (top <= y0) return null;
    return (
      <mesh key={key} position={[s * (W / 2 + 0.15), (y0 + top) / 2, 0]} castShadow receiveShadow material={cladSideMat}>
        <boxGeometry args={[0.3, top - y0, D + 0.6]} />
      </mesh>
    );
  };
  const frontH = Math.min(wallH, H);
  return (
    <group>
      {/* Sokkel en betonnen plint rondom */}
      <mesh position-y={-0.05} receiveShadow>
        <boxGeometry args={[W + 1.6, 0.12, D + 1.6]} />
        <meshStandardMaterial color="#a9a49b" roughness={0.9} />
      </mesh>
      <mesh position={[0, plinth / 2, -D / 2 - 0.15]} material={concrete} castShadow receiveShadow>
        <boxGeometry args={[W + 0.6, plinth, 0.32]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (W / 2 + 0.15), plinth / 2, 0]} material={concrete} castShadow receiveShadow>
          <boxGeometry args={[0.32, plinth, D + 0.6]} />
        </mesh>
      ))}
      {/* Achtergevel: golfplaat, blijft altijd staan (zoals de achterste muur in De Sims) */}
      <mesh position={[0, plinth + (H - plinth) / 2, -D / 2 - 0.15]} castShadow receiveShadow material={cladMat}>
        <boxGeometry args={[W + 0.6, H - plinth, 0.3]} />
      </mesh>
      <mesh position={[0, H / 2, -D / 2 + 0.01]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial map={inner} roughness={0.92} />
      </mesh>
      {/* Zijgevels: golfplaat met een lange lichtstrook boven de tussenverdieping */}
      {[-1, 1].map((s) => (
        <group key={s}>
          {sidePart(s, plinth, ribbon[0], 'onder')}
          {sidePart(s, ribbon[1], H, 'boven')}
          {wallH > ribbon[0] && (
            <group position={[s * (W / 2 + 0.16), ribbon[0], 0]} rotation-y={(s * Math.PI) / 2}>
              <GlassFront w={D} h={Math.min(ribbon[1], wallH) - ribbon[0]} every={2.8} door={false} />
            </group>
          )}
          <mesh position={[s * (W / 2 - 0.01), Math.min(wallH, H) / 2, 0]} rotation-y={-s * (Math.PI / 2)}>
            <planeGeometry args={[D, Math.min(wallH, H)]} />
            <meshStandardMaterial map={innerSide} roughness={0.92} />
          </mesh>
          {cut === 'geen' && (
            <mesh geometry={gable} position={[s * (W / 2 + (s > 0 ? 0 : 0.3)), H, 0]} rotation-y={Math.PI / 2} castShadow>
              <meshStandardMaterial map={gableClad} roughness={0.55} metalness={0.55} />
            </mesh>
          )}
          {/* Zwarte stalen kolommen buiten op de gevel */}
          {[-12, -4, 4, 12].map((z) => (
            <mesh key={z} position={[s * (W / 2 + 0.38), wallH / 2, z]} material={steelMat} castShadow>
              <boxGeometry args={[0.22, wallH, 0.34]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Voorgevel: glas over de volle hoogte tussen cederhouten koppen */}
      <group position-z={D / 2 + 0.05}>
        <GlassFront w={W - 7} h={frontH} every={2.5} door={false} wide />
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (W / 2 - 1.6), frontH / 2, 0.1]} castShadow receiveShadow>
            <boxGeometry args={[3.6, frontH, 0.4]} />
            <meshStandardMaterial map={cedar} roughness={0.75} />
          </mesh>
        ))}
        {frontH > MZ && (
          <mesh position-y={MZ} material={steelMat}>
            <boxGeometry args={[W - 7, 0.35, 0.12]} />
          </mesh>
        )}
        {frontH > 7 && (
          <mesh position-y={7} material={steelMat}>
            <boxGeometry args={[W - 7, 0.1, 0.1]} />
          </mesh>
        )}
        {/* Inkom: cederhouten portaal met glazen deuren en stalen luifel */}
        {frontH <= DOOR_H + 0.2 && (
          <mesh position={[0, frontH / 2, 0.05]} material={steelMat}>
            <boxGeometry args={[3.4, frontH, 0.1]} />
          </mesh>
        )}
        {cut === 'geen' && (
          <>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 2.1, 1.7, 0.45]} castShadow>
                <boxGeometry args={[0.5, 3.4, 0.9]} />
                <meshStandardMaterial map={cedar} roughness={0.75} />
              </mesh>
            ))}
            <mesh position={[0, 3.25, 1.6]} castShadow material={steelMat}>
              <boxGeometry args={[9, 0.3, 3.2]} />
            </mesh>
            {/* Naam op de daklijst */}
            <mesh position={[0, H - 0.35, 0.12]} material={steelMat}>
              <boxGeometry args={[W + 0.8, 0.7, 0.16]} />
            </mesh>
            <Text font={FONT} fontSize={0.42} letterSpacing={0.3} color="#ffffff" position={[0, H - 0.35, 0.21]} anchorY="middle">
              EM LAUNCHPAD
            </Text>
            <mesh position={[0, H - 0.72, 0.2]}>
              <planeGeometry args={[W + 0.8, 0.06]} />
              <meshBasicMaterial map={brandGradientTex()} toneMapped={false} />
            </mesh>
          </>
        )}
      </group>
      {/* Dak: zink met lichtstraten; verdwijnt in Sims-modus zodat je binnen kijkt */}
      {cut === 'geen' && (
        <group position-y={H}>
          {[1, -1].map((s) => (
            <group key={s}>
              <mesh position={[0, RISE / 2 + 0.12, (s * D) / 4]} rotation-x={s * ang} receiveShadow>
                <boxGeometry args={[W + 1.4, 0.24, slope + 0.9]} />
                <meshStandardMaterial map={zinc} bumpMap={zinc} bumpScale={2} roughness={0.42} metalness={0.5} />
              </mesh>
              {[-12, -4, 4, 12].map((x) => (
                <mesh key={x} position={[x, RISE / 2 + 0.25, (s * D) / 4]} rotation-x={s * ang} material={sky}>
                  <boxGeometry args={[3, 0.04, slope * 0.7]} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      )}
    </group>
  );
}

/** Industriële binnenkant: stalen spanten, luchtkokers en hanglampen boven de arena. */
function Ceiling() {
  const pend = useMemo(() => {
    const out: [number, number][] = [];
    for (const x of [-9, -4.5, 0, 4.5, 9]) for (const z of [-4.5, 0.5, 5]) out.push([x, z]);
    return out;
  }, []);
  return (
    <group>
      {[-16, -8, 0, 8, 16].map((x) => (
        <group key={x} position-x={x}>
          <mesh position={[0, H - 0.25, 0]} material={steelMat}>
            <boxGeometry args={[0.3, 0.5, D]} />
          </mesh>
          <mesh position={[0, H + RISE / 2 - 0.3, 0]} material={steelMat}>
            <boxGeometry args={[0.18, RISE, 0.18]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, H + RISE / 2 - 0.25, (s * D) / 4]} rotation-x={s * Math.atan2(RISE, D / 2)} material={steelMat}>
              <boxGeometry args={[0.22, 0.32, Math.hypot(D / 2, RISE)]} />
            </mesh>
          ))}
        </group>
      ))}
      {[-5, 5].map((z) => (
        <mesh key={z} position={[0, H - 1.1, z]} rotation-z={Math.PI / 2} material={M.silver}>
          <cylinderGeometry args={[0.38, 0.38, W - 1, 20]} />
        </mesh>
      ))}
      {pend.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh position-y={H - 2.2} material={M.black}>
            <cylinderGeometry args={[0.006, 0.006, 4.2, 4]} />
          </mesh>
          <mesh position-y={5.0} material={M.black}>
            <coneGeometry args={[0.3, 0.32, 18, 1, true]} />
          </mesh>
          <mesh position-y={4.86} rotation-x={Math.PI / 2} material={M.lamp}>
            <circleGeometry args={[0.22, 18]} />
          </mesh>
        </group>
      ))}
      {/* Warm licht in de hal (zonder schaduw, voor de sfeer) */}
      <pointLight position={[-8, 6.5, 0]} intensity={30} distance={22} decay={2} color="#ffe2b8" />
      <pointLight position={[8, 6.5, 0]} intensity={30} distance={22} decay={2} color="#ffe2b8" />
    </group>
  );
}

/** Arena: War Room met Boma, receptie aan de inkom, en de ontspanning vooraan. */
function Arena({ inkom, lounge, ctx, loungeCtx, taken }: { inkom?: FloorModel; lounge?: FloorModel; ctx: Ctx; loungeCtx: Ctx; taken: HqTaak[] }) {
  const cos = inkom?.groups[0]?.members[0];
  const war = useMemo(() => warRoomTasks(taken), [taken]);
  const hot = useMemo(() => taken.filter((t) => isOpen(t) && (isOverdue(t) || t.prioriteit === 'Hoog' || isBusy(t))).sort((a, b) => Number(isBusy(b)) - Number(isBusy(a))), [taken]);
  const mood = moodOf(war, cos ? ctx.live[cos.id] : undefined, ctx.takenOk);
  return (
    <group>
      {/* War Room, vooraan in de arena met de schermen naar de inkom */}
      <group position-z={1.9}>
        <Rug w={9} d={6} color="#1c2a3d" />
      </group>
      <group position={[0, 0, 2.7]}>
        <MeetingTable length={5} seats={10} />
      </group>
      {cos && (
        <group position={[0, 0, -0.2]} rotation-y={Math.PI}>
          <Seat o={cos} mood={mood} ctx={ctx} big pose="staat" />
        </group>
      )}
      {/* Vrijstaande schermen achter de War Room */}
      {[
        [-2.6, 'War Room · wat het AI-team doet', `${cos?.name ?? 'Boma'} · Chief of Staff`, war],
        [2.6, 'Prioriteiten van het team', 'Hoog, bezig of te laat', hot],
      ].map(([x, title, sub, tasks]) => (
        <group key={x as number} position={[x as number, 0, -1.1]}>
          {[-2, 2].map((px) => (
            <mesh key={px} position={[px, 1.2, -0.05]} material={steelMat}>
              <boxGeometry args={[0.08, 2.4, 0.08]} />
            </mesh>
          ))}
          <group position-y={2.3}>
            <TaskBoard title={title as string} subtitle={sub as string} tasks={tasks as HqTaak[]} w={4.2} h={2.3} />
          </group>
        </group>
      ))}
      {/* Receptie aan de inkom */}
      <group position={[0, 0, IZ + 1.6]}>
        <RoundedBox args={[4, 1.05, 0.85]} radius={0.12} position-y={0.52} castShadow>
          <meshStandardMaterial color="#1c1f24" roughness={0.4} metalness={0.4} />
        </RoundedBox>
        <mesh position={[0, 1.07, 0]} material={M.oak}>
          <boxGeometry args={[4.1, 0.05, 0.95]} />
        </mesh>
        <mesh position={[0, 0.55, 0.43]}>
          <planeGeometry args={[3.6, 0.05]} />
          <meshBasicMaterial map={brandGradientTex()} toneMapped={false} />
        </mesh>
        <Text font={FONT_MONO} fontSize={0.11} color="#ffffff" position={[0, 0.78, 0.43]} letterSpacing={0.16}>
          WELKOM BIJ EM LAUNCHPAD
        </Text>
      </group>
      {/* Ontspanning vooraan in de arena */}
      <group position={[-7.5, 0, -5.2]}>
        <Rug w={4.4} d={3.2} color="#2a2f36" />
        <PoolTable />
      </group>
      <ArenaCourt position={[7.5, 0, -5.2]} />
      <group position={[7.5, 0, -5.2]}>
        <PingPong />
      </group>
      {[[-12.2, 7.8], [12.2, 7.8], [-13.6, -3], [13.6, -3]].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <Plant tall scale={1.35} />
        </group>
      ))}
      {/* Klikvlakken */}
      {inkom && (
        <mesh position={[0, 1.5, 1.6]} onClick={(e) => (e.delta < 6 && !ctx.active ? (e.stopPropagation(), ui.go(inkom.level)) : undefined)}>
          <boxGeometry args={[10, 3, 9]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      )}
      {lounge && (
        <mesh position={[0, 1, -5.2]} onClick={(e) => (e.delta < 6 && !loungeCtx.active ? (e.stopPropagation(), ui.go(lounge.level)) : undefined)}>
          <boxGeometry args={[22, 2, 5]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** Boven: gaming room links, fitness rechts (eigen component), zithoeken vooraan. */
function UpperLounge() {
  return (
    <group position-y={MZ}>
      <group position={[-IX - MD / 2 - 0.1, 0, -3.5]}>
        <Gaming />
      </group>
      {[-12, -4, 4, 12].map((x) => (
        <group key={x} position={[x, 0, IZ + 0.5]}>
          <Planter />
        </group>
      ))}
      {[-8, 8].map((x) => (
        <group key={x} position={[x, 0, IZ + 2.8]} rotation-y={Math.PI}>
          <Sofa color="#6b4428" w={2.2} />
          <group position={[0, 0, -1.1]}>
            <CoffeeTable />
          </group>
        </group>
      ))}
      {/* Vergaderhoek en bibliotheek op de achterste verdieping, naast de kantoren */}
      <group position={[-15, 0, -IZ - MD / 2]}>
        <MeetingTable length={3.4} seats={6} />
      </group>
      <group position={[15, 0, -IZ - 2.2]}>
        <Shelf w={2.4} />
      </group>
    </group>
  );
}

function HitShell() {
  return (
    <mesh
      position={[0, H / 2, 0]}
      onClick={(e) => {
        if (e.delta > 6) return;
        e.stopPropagation();
        const inkom = floors.find((f) => zoneKind(f) === 'inkom');
        ui.go(inkom?.level ?? 0);
      }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <boxGeometry args={[W + 1, H + RISE, D + 1]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  );
}

export function Warehouse() {
  const level = useUi((s) => s.level);
  const focus = useUi((s) => s.focus);
  const walk = useUi((s) => s.walk);
  const taken = useHq((s) => s.taken);
  const live = useHq((s) => s.live);
  const online = useHq((s) => s.online);
  const takenOk = useHq((s) => takenStand(s).ok);
  const byOwner = useMemo(() => tasksByOwner(taken), [taken]);
  const ctxFor = (f?: FloorModel): Ctx => ({ byOwner, live, active: walk || (!!f && f.level === level), focus, level: f?.level ?? 0, takenOk, walk });
  const inkom = floors.find((f) => zoneKind(f) === 'inkom');
  const lounge = floors.find((f) => zoneKind(f) === 'lounge');
  const directie = floors.find((f) => zoneKind(f) === 'directie');
  const depts = floors.filter((f) => zoneKind(f) === 'dept');
  const floorTex = useMemo(() => concreteTex([12, 8]), []);
  const chosen = walk ? undefined : floors.find((f) => f.level === level);
  const kind = chosen ? zoneKind(chosen) : null;
  const cut: Cut = !chosen ? 'geen' : kind === 'directie' || (kind === 'lounge' && focus !== 'beneden') ? 'boven' : 'beneden';
  const upper = cut !== 'beneden'; // tussenverdieping tonen
  let spare = false;
  return (
    <CutContext.Provider value={cut}>
    <group position={[0, 0, B.Z]}>
      <Shell />
      <FacadeLogos />
      {cut === 'geen' && <Ceiling />}
      <mesh rotation-x={-Math.PI / 2} position-y={0.02} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial map={floorTex} color="#c4c0b9" roughness={0.32} metalness={0.05} />
      </mesh>
      {upper ? <Mezzanine /> : <Columns />}
      {upper && <Stair x={-IX + 0.85} side={-1} />}
      {upper && <Stair x={IX - 0.85} side={1} />}
      {depts.map((f) => {
        let room = ROOMS[f.id];
        if (!room) {
          if (spare) return null; // meer afdelingen dan ruimtes: uitbreiden in ROOMS
          spare = true;
          room = SPARE;
        }
        return <DeptRoom key={f.id} floor={f} room={room} ctx={ctxFor(f)} />;
      })}
      {depts.every((f) => ROOMS[f.id]) && <MeetingRoom room={SPARE} ctx={ctxFor(undefined)} />}
      <Arena inkom={inkom} lounge={lounge} ctx={ctxFor(inkom)} loungeCtx={ctxFor(lounge)} taken={taken} />
      <Kitchen />
      <KitchenLounge />
      <Studio />
      <BrandWall />
      <FloorLogo />
      {upper && <MezzLed />}
      {upper && <UpperLounge />}
      {upper && <Fitness />}
      {upper &&
        directie &&
        directie.offices.map((o) => {
          const slot = officeSlot(`kantoor-${o.id}`)!;
          return <Office key={o.id} o={o} x={slot.x} w={slot.w} ctx={ctxFor(directie)} online={online.includes(o.id)} />;
        })}
      {level < 0 && !walk && <HitShell />}
    </group>
    </CutContext.Provider>
  );
}
