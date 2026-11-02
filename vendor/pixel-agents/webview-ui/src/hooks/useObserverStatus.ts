import { useEffect, useState } from 'react';

import { transport } from '../transport/index.js';
import type { TransportState } from '../transport/types.js';

export interface ObserverAgent {
  id: number;
  sourceSessionId: string;
  sourceAgentId?: string;
  parentAgentId?: number;
  name: string;
  projectId?: string;
  projectName?: string;
  role?: string;
  status: 'idle' | 'working' | 'permission' | 'stopped' | 'interrupted' | 'ended' | 'disconnected';
  activeToolCount: number;
  lastEventAt: string | number;
  attribution: 'session' | 'agent';
  work?: {
    done: string;
    current: string;
    next: string;
    updatedAt: number;
    source: 'agent-report';
  };
}

export interface ObserverSnapshot {
  mode: 'codex-observer';
  agents: ObserverAgent[];
  projects?: { projectId: string; projectName: string; source: 'codex-project'; status: 'no-events' | 'events-received'; agentCount: number }[];
  activity?: { eventName: string; agentId: number; timestamp: string | number; toolName?: string }[];
  acceptedEvents: number;
  duplicateEvents: number;
  outOfOrderEvents: number;
  rejectedEvents: number;
  lastEvent?: {
    eventId: string;
    eventName: string;
    timestamp: string | number;
    receivedAt: string | number;
  } | null;
}

export function useObserverStatus() {
  const [snapshot, setSnapshot] = useState<ObserverSnapshot | null>(null);
  const [connection, setConnection] = useState<TransportState>(transport.state);
  useEffect(() => {
    const unsubscribe = transport.onMessage((message) => {
      // Prototype extension stays local to this surface; generated core protocol is unchanged.
      const custom = message as unknown as { type?: string; snapshot?: unknown };
      if (custom.type !== 'observerStatus') return;
      const next = (custom.snapshot ?? custom) as ObserverSnapshot;
      if (next.mode === 'codex-observer' && Array.isArray(next.agents)) setSnapshot(next);
    });
    setConnection(transport.state);
    const unsubscribeState = transport.onStateChange(setConnection);
    return () => {
      unsubscribe();
      unsubscribeState();
    };
  }, []);
  return { snapshot, connection };
}
