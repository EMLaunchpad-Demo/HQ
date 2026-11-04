import raw from '../team.config.json';
import type { Agent, TeamConfig } from './types';

export const config = raw as TeamConfig;
export const cos = config.chiefOfStaff;
export const allAgents: Agent[] = [cos, ...config.departments.map((d) => d.agent)];
export const agentById = (id: string) => allAgents.find((a) => a.id === id);
export const deptOf = (agentId: string) => config.departments.find((d) => d.agent.id === agentId);
export const founderById = (id?: string) => config.founders.find((f) => f.id === id);
/** Pad uit de config ("avatars/x.png") naar URL in public/. */
export const fileUrl = (projectPath: string) => `/${projectPath.replace(/^\/+/, '')}`;
