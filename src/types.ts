export type AvatarMode = 'photo' | 'illustration';
export type Status = 'idle' | 'bezig' | 'klaar';

export interface Agent {
  id: string;
  name: string;
  title: string;
  subtitle?: string;
  /** Korte zin die in de naam-reveal getypt wordt. */
  tagline?: string;
  /** Hexkleur, of "gradient" voor de merkgradient (blauw → cyaan → mint). */
  color: string;
  avatarMode?: AvatarMode;
  avatar?: string;
  /** Waar het gezicht zit in de foto (CSS object-position), bv. "50% 20%". */
  avatarFocus?: string;
  /** Hoeveel er op het gezicht ingezoomd wordt (1 = hele foto). */
  avatarZoom?: number;
  skills: string[];
}

export interface Department {
  id: string;
  label: string;
  /** Id van de founder onder wie dit departement valt. */
  founder?: string;
  /** Echte Claude Code-agents (.claude/agents) die in het organigram als dit departement verschijnen. */
  werkAgents?: string[];
  agent: Agent;
}

export interface Founder {
  id: string;
  name: string;
  title: string;
}

/** Wat het bot-programma live naar het dashboard stuurt. */
export type LiveEvent =
  | { t: 'founder'; founder: string; text: string }
  | { t: 'start'; agent: string; task: string; skill?: number }
  | { t: 'delegate'; to: string; task: string; skill?: number }
  | { t: 'tool'; agent: string; tool: string }
  | { t: 'memory'; agent: string; file: string }
  | { t: 'done'; agent: string; result: string }
  | { t: 'error'; agent: string; message: string };

/** Eén bericht in een chat van de team-app. */
export interface ChatMessage {
  id: string;
  /** user = founder, agent = antwoord van de agent, system = overdracht/melding. */
  role: 'user' | 'agent' | 'system';
  /** Wie er spreekt (agent-id), of de founder bij role "user". */
  from: string;
  text: string;
  /** Volledige uitwerking (bv. het resultaat van een collega), ingeklapt getoond. */
  detail?: string;
  tijd: string;
  approval?: { id: string; to: string; subject: string; preview: string; status: 'open' | 'verzonden' | 'niet verzonden' | 'fout' };
}

export interface TeamConfig {
  company: { name: string; tagline: string; logo?: string };
  showDisclaimer: boolean;
  disclaimer?: string;
  memoryCount: number;
  demo: { hook: string; cta: string; revealOrder?: string[] };
  founders: Founder[];
  chiefOfStaff: Agent;
  departments: Department[];
  /** Het virtuele hoofdkantoor (#/hq): welke verdieping wie huisvest. */
  hq?: HqConfig;
  /** Alleen in democonfigs (content/demos): het script van de demo, vervangt src/demo/scenario.ts. */
  scenario?: DemoScenario;
}

export interface HqFloor {
  id: string;
  label: string;
  /** Departementen (id uit departments) die samen in de open ruimte van deze verdieping zitten. */
  departments?: string[];
  /** Losse agents (bv. de Chief of Staff in de War Room). */
  agents?: string[];
  /** Ruimte met een eigen kantoor per founder (en per persoon met kantoor: true). */
  offices?: boolean;
  /** Ontspanningsruimte (pingpong-arena, biljart, gaming, fitness). */
  lounge?: boolean;
  /** Content studio met podcastruimte. */
  studio?: boolean;
  /** Keuken met lounge en tv. */
  kitchen?: boolean;
}

/** Een menselijk teamlid naast de founders. Met office: true krijgt die een kantoor op de directieverdieping, anders een bureau op `floor`. */
export interface HqPerson {
  id: string;
  name: string;
  title: string;
  floor?: string;
  office?: boolean;
}

export interface HqConfig {
  floors: HqFloor[];
  people?: HqPerson[];
  /** Inrichting van een kantoor per persoon (id), bv. { "ebert": "walnoot" }. Zonder waarde: modern. */
  officeStyles?: Record<string, 'walnoot' | 'modern'>;
}

export interface DemoScenario {
  proof?: {
    command: string;
    cos: { task: string; result: string; skills: number[] };
    jobs: { agentId: string; skills: number[]; task: string; result: string; delay: number }[];
  };
  memoryGain?: number;
  randomDay?: Record<string, [number, string, string][]>;
}
