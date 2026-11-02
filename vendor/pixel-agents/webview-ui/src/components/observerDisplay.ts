import { roleLabel } from '../agencyCatalog.js';
import type { ObserverAgent } from '../hooks/useObserverStatus.js';

export function agentDisplayName(agent: ObserverAgent, resident = false): string {
  if (resident) return 'Главный агент проекта';
  if (agent.name === 'Codex' || (agent.attribution === 'session' && !agent.parentAgentId)) return `Агент чата #${agent.id}`;
  if (agent.name === 'default') return `Агент #${agent.id}`;
  const label = roleLabel(agent.name);
  return label !== agent.name ? `${label} #${agent.id}` : agent.name;
}
