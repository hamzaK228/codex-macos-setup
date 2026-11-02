import { CHARACTER_SITTING_OFFSET_PX, TOOL_OVERLAY_VERTICAL_OFFSET } from '../constants.js';
import { useObserverOverlayFrame } from '../hooks/useObserverOverlayFrame.js';
import type { ObserverAgent } from '../hooks/useObserverStatus.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { overlayProjection } from '../office/projection.js';
import { CharacterState } from '../office/types.js';
import { agentDisplayName } from './observerDisplay.js';

export function ObserverLabels({ agents, officeState, containerRef, zoom, panRef }: {
  agents: ObserverAgent[]; officeState: OfficeState;
  containerRef: React.RefObject<HTMLDivElement | null>; zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
}) {
  useObserverOverlayFrame();
  const element = containerRef.current;
  if (!element) return null;
  const dpr = window.devicePixelRatio || 1;
  const projection = overlayProjection(officeState.getLayout(), element.getBoundingClientRect(), zoom, panRef.current, dpr);
  const characters = new Map(officeState.getCharacters().map((character) => [character.id, character]));
  return <div className="observer-labels" aria-hidden="true">{agents.map((agent) => {
    // Wide room views keep project headings readable; show individual labels up close.
    if (zoom / dpr < 1.25 && officeState.selectedAgentId !== agent.id) return null;
    const character = characters.get(agent.id);
    if (!character) return null;
    const sitting = character.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
    return <div className="observer-character-label" data-focused={officeState.selectedAgentId === agent.id} key={agent.id} style={{ left: projection.toScreenX(character.x), top: projection.toScreenY(character.y + sitting - TOOL_OVERLAY_VERTICAL_OFFSET) - 10 }}>
      <strong>{agentDisplayName(agent, officeState.observerPresence.get(agent.id)?.resident === true)}</strong><span>{agent.projectName ?? 'Без проекта'}</span>
    </div>;
  })}</div>;
}
