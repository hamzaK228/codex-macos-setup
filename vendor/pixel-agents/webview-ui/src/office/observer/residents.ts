import { projectIdentity, type ProjectRoomAgent } from './projectRooms.js';

export function isSpecialist(agent: ProjectRoomAgent): boolean { return agent.parentAgentId !== undefined; }
function eventTime(agent: ProjectRoomAgent): number {
  if (typeof agent.lastEventAt === 'number') return agent.lastEventAt;
  const parsed = Date.parse(agent.lastEventAt ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

/** One genuine root source represents a project. This selects a visible
 * coordinator, never starts a runtime or changes any source session status. */
export function reconcileResidents(previous: Map<string, number>, agents: ProjectRoomAgent[]): Map<string, number> {
  const roots = new Map<string, ProjectRoomAgent[]>();
  for (const agent of agents) {
    if (isSpecialist(agent) || agent.status === 'disconnected') continue;
    const project = projectIdentity(agent);
    const candidates = roots.get(project) ?? [];
    candidates.push(agent);
    roots.set(project, candidates);
  }
  const next = new Map<string, number>();
  for (const [project, candidates] of roots) {
    const current = candidates.find((agent) => agent.id === previous.get(project));
    const sorted = [...candidates].sort((a, b) => eventTime(b) - eventTime(a) || b.id - a.id);
    const chosen = current?.status === 'working' ? current : sorted.find((agent) => agent.status === 'working') ?? sorted[0];
    next.set(project, chosen.id);
  }
  return next;
}
