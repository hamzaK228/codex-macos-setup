import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import * as path from 'node:path';

import { createAgentState } from './agentState.js';
import { AgentStateStore } from './agentStateStore.js';

const EVENTS = new Set([
  'SessionStart',
  'SubagentStart',
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'UserPromptSubmit',
  'SubagentStop',
  'Stop',
  'Interrupt',
  'SessionEnd',
]);
const FIELDS = new Set([
  'hook_event_name',
  'session_id',
  'turn_id',
  'cwd',
  'tool_name',
  'tool_use_id',
  'agent_id',
  'agent_type',
  'reason',
  'event_id',
  'timestamp',
]);
export interface CodexEvent {
  hook_event_name: string;
  session_id: string;
  cwd: string;
  event_id: string;
  timestamp: number;
  turn_id?: string;
  tool_name?: string;
  tool_use_id?: string;
  agent_id?: string;
  agent_type?: string;
  reason?: string;
}
export type ObserverStatus =
  'idle' | 'working' | 'permission' | 'stopped' | 'interrupted' | 'ended' | 'disconnected';
export class ObserverReportError extends Error {
  constructor(readonly statusCode: 400 | 409) {
    super('Invalid or unmatched agent report');
  }
}
interface AgentWork {
  done: string;
  current: string;
  next: string;
  updatedAt: number;
  source: 'agent-report';
}
interface ObservedAgent {
  id: number;
  sourceSessionId: string;
  sourceAgentId?: string;
  parentAgentId?: number;
  name: string;
  role: string;
  projectName: string;
  projectId: string;
  status: ObserverStatus;
  lastEventAt: number;
  lastReceivedAt: number;
  barrierAt: number;
  toolTimes: Map<string, number>;
  toolDone: Set<string>;
  retiredToolThrough: number;
  work?: AgentWork;
  workBarrierAt: number;
  reportReceivedAt?: number;
}

interface ObserverActivity {
  eventName: string;
  agentId: number;
  timestamp: number;
  toolName?: string;
}

/** Metadata only. This adapter never opens a transcript or owns an agent process. */
export class CodexObserver {
  readonly store = new AgentStateStore();
  private readonly agents = new Map<string, ObservedAgent>();
  private readonly seen = new Map<string, number>();
  private readonly seenReports = new Set<string>();
  private readonly scopes: string[];
  private readonly activity: ObserverActivity[] = [];
  private retiredAgentThrough = 0;
  private acceptedEvents = 0;
  private duplicateEvents = 0;
  private outOfOrderEvents = 0;
  private rejectedEvents = 0;
  private lastEvent: Record<string, unknown> | null = null;
  constructor(
    scopes: string[],
    private readonly timeoutMs = 300_000,
    private readonly now = Date.now,
  ) {
    if (!scopes.length) throw new Error('At least one observation scope is required');
    this.scopes = scopes.map((scope) => realpathSync(scope));
  }
  private key(session: string, agent?: string) {
    return JSON.stringify([session, agent ?? null]);
  }
  private parse(raw: unknown): CodexEvent {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('Expected metadata object');
    const data = raw as Record<string, unknown>;
    for (const [key, value] of Object.entries(data)) {
      if (!FIELDS.has(key)) throw new Error('Unexpected metadata field');
      if (
        key !== 'timestamp' &&
        (typeof value !== 'string' || value.length > 4096 || /[\x00-\x1f]/.test(value))
      )
        throw new Error('Invalid metadata value');
    }
    for (const key of ['hook_event_name', 'session_id', 'cwd', 'event_id']) {
      if (typeof data[key] !== 'string' || !(data[key] as string).length)
        throw new Error('Missing metadata field');
    }
    if (!EVENTS.has(data.hook_event_name as string)) throw new Error('Unsupported event');
    const timestamp =
      typeof data.timestamp === 'string' ? Date.parse(data.timestamp) : data.timestamp;
    if (
      typeof timestamp !== 'number' ||
      !Number.isFinite(timestamp) ||
      timestamp <= 0 ||
      timestamp > this.now() + 60_000
    )
      throw new Error('Invalid timestamp');
    if (!path.isAbsolute(data.cwd as string)) throw new Error('Absolute cwd required');
    const cwd = realpathSync(data.cwd as string);
    if (!this.scopes.some((scope) => cwd === scope || cwd.startsWith(scope.endsWith(path.sep) ? scope : scope + path.sep)))
      throw new Error('Directory outside observation scope');
    const event = { ...data, timestamp, cwd } as unknown as CodexEvent;
    if (['SubagentStart', 'SubagentStop'].includes(event.hook_event_name) && !event.agent_id)
      throw new Error('Source agent id required');
    if (['PreToolUse', 'PostToolUse'].includes(event.hook_event_name) && !event.tool_use_id)
      throw new Error('Source tool id required');
    if (event.hook_event_name === 'PreToolUse' && !event.tool_name)
      throw new Error('Source tool name required');
    return event;
  }
  receive(raw: unknown): { accepted: boolean; duplicate?: boolean; outOfOrder?: boolean } {
    let e: CodexEvent;
    try {
      e = this.parse(raw);
    } catch (error) {
      this.rejectedEvents++;
      throw error;
    }
    const dedupKey = JSON.stringify([e.session_id, e.event_id]);
    if (this.seen.has(dedupKey)) {
      this.duplicateEvents++;
      return { accepted: false, duplicate: true };
    }
    this.seen.set(dedupKey, e.timestamp);
    // Bound in-memory history. No source payloads are written to disk.
    if (this.seen.size > 20_000) this.seen.delete(this.seen.keys().next().value!);
    // Once history is retired, old metadata must not recreate forgotten state.
    if (!this.agents.has(this.key(e.session_id, e.agent_id)) && e.timestamp <= this.retiredAgentThrough) {
      this.outOfOrderEvents++;
      return { accepted: false, outOfOrder: true };
    }
    const parent = this.ensure(e, undefined);
    const agent = e.agent_id ? this.ensure(e, e.agent_id, parent.id) : parent;
    const kind = e.hook_event_name;
    const isTool = kind === 'PreToolUse' || kind === 'PostToolUse';
    const toolId = e.tool_use_id;
    if (
      (isTool &&
        (e.timestamp <= agent.barrierAt ||
          (toolId && !this.store.get(agent.id)!.activeToolIds.has(toolId) &&
            e.timestamp <= agent.retiredToolThrough) ||
          (toolId && e.timestamp < (agent.toolTimes.get(toolId) ?? 0)))) ||
      (!isTool && e.timestamp < agent.lastEventAt)
    ) {
      this.outOfOrderEvents++;
      return { accepted: false, outOfOrder: true };
    }
    this.acceptedEvents++;
    // A stop may omit type; retain the last source-provided role until one arrives.
    if (e.agent_type) {
      agent.role = e.agent_type;
      if (agent.sourceAgentId) {
        agent.name = e.agent_type;
        this.store.get(agent.id)!.agentName = agent.name;
        this.store.broadcast({
          type: 'agentTeamInfo', id: agent.id, agentName: agent.name,
          leadAgentId: agent.parentAgentId,
        });
      }
    }
    this.activity.push({
      eventName: kind,
      agentId: agent.id,
      timestamp: e.timestamp,
      ...(e.tool_name ? { toolName: e.tool_name } : {}),
    });
    if (this.activity.length > 40) this.activity.shift();
    this.lastEvent = {
      eventId: e.event_id,
      eventName: kind,
      timestamp: e.timestamp,
      receivedAt: this.now(),
    };
    agent.lastEventAt = Math.max(agent.lastEventAt, e.timestamp);
    agent.lastReceivedAt = this.now();
    if (kind === 'UserPromptSubmit') {
      agent.workBarrierAt = Math.max(agent.workBarrierAt, e.timestamp);
      if (agent.work) agent.work.current = '';
    }
    const state = this.store.get(agent.id)!;
    state.lastDataAt = agent.lastReceivedAt;
    state.hookDelivered = true;
    if (isTool && toolId) {
      agent.toolTimes.set(toolId, e.timestamp);
      if (kind === 'PreToolUse') {
        // An end seen first is a tombstone: late starts cannot resurrect the tool.
        if (!agent.toolDone.has(toolId) && !state.activeToolIds.has(toolId)) {
          state.activeToolIds.add(toolId);
          state.activeToolNames.set(toolId, e.tool_name!);
          state.activeToolStatuses.set(toolId, e.tool_name!);
          this.store.broadcast({
            type: 'agentToolStart',
            id: agent.id,
            toolId,
            toolName: e.tool_name,
            status: e.tool_name,
          });
        }
      } else {
        agent.toolDone.add(toolId);
        this.endTool(agent, toolId);
      }
      this.trimTools(agent);
      if (kind === 'PreToolUse' || ['working', 'permission', 'idle'].includes(agent.status))
        agent.status = 'working';
    } else if (kind === 'PermissionRequest') {
      agent.status = 'permission';
      this.store.broadcast({ type: 'agentToolPermission', id: agent.id });
    } else if (['Stop', 'Interrupt', 'SessionEnd', 'SubagentStop'].includes(kind)) {
      this.finish(
        agent,
        kind === 'Interrupt' ? 'interrupted' : kind === 'SessionEnd' ? 'ended' : 'stopped',
        e.timestamp,
      );
      if (!e.agent_id && (kind === 'SessionEnd' || kind === 'Interrupt')) {
        for (const child of this.agents.values())
          if (child.parentAgentId === agent.id)
            this.finish(child, kind === 'Interrupt' ? 'interrupted' : 'ended', e.timestamp);
      }
    } else {
      agent.status = kind === 'SessionStart' ? 'idle' : 'working';
    }
    this.pruneHistory();
    this.publish(agent);
    return { accepted: true };
  }
  /** Explicit, ephemeral self-reports; never evidence of process liveness. */
  receiveReport(raw: unknown): { accepted: boolean; duplicate?: boolean; outOfOrder?: boolean } {
    const invalid = () => { throw new ObserverReportError(400); };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid();
    const data = raw as Record<string, unknown>;
    const fields = ['thread_id', 'cwd', 'event_id', 'timestamp', 'done', 'current', 'next'];
    if (Object.keys(data).length !== fields.length || fields.some((field) => !Object.hasOwn(data, field))) invalid();
    for (const field of fields.filter((field) => field !== 'timestamp')) {
      const value = data[field];
      const isText = ['done', 'current', 'next'].includes(field);
      if (typeof value !== 'string' || value.length > (isText ? 280 : 4096) ||
        (!isText && !value.length) || /[\x00-\x1f\x7f\u2028\u2029]/.test(value)) invalid();
    }
    const timestamp = typeof data.timestamp === 'string' ? Date.parse(data.timestamp) : data.timestamp;
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0 || timestamp > this.now() + 60_000) invalid();
    let cwd: string;
    try {
      if (!path.isAbsolute(data.cwd as string)) invalid();
      cwd = realpathSync(data.cwd as string);
    } catch { return invalid(); }
    const projectId = createHash('sha256').update(cwd).digest('hex');
    const children = [...this.agents.values()].filter((agent) => agent.sourceAgentId === data.thread_id);
    const matches = children.length ? children : [...this.agents.values()].filter(
      (agent) => !agent.sourceAgentId && agent.sourceSessionId === data.thread_id,
    );
    if (matches.length !== 1) throw new ObserverReportError(409);
    const agent = matches[0];
    if (agent.projectId !== projectId) invalid();
    const dedupKey = JSON.stringify([data.thread_id, data.event_id]);
    if (this.seenReports.has(dedupKey)) return { accepted: false, duplicate: true };
    this.seenReports.add(dedupKey);
    if (this.seenReports.size > 20_000) this.seenReports.delete(this.seenReports.values().next().value!);
    const sourceTime = timestamp as number;
    if (sourceTime < agent.workBarrierAt || (agent.work && sourceTime <= agent.work.updatedAt))
      return { accepted: false, outOfOrder: true };
    agent.work = {
      done: data.done as string,
      current: ['working', 'permission'].includes(agent.status) ? data.current as string : '',
      next: data.next as string,
      updatedAt: sourceTime,
      source: 'agent-report',
    };
    agent.reportReceivedAt = this.now();
    this.store.broadcast({ type: 'observerStatus', ...this.snapshot() });
    return { accepted: true };
  }
  private ensure(e: CodexEvent, sourceAgentId?: string, parentAgentId?: number): ObservedAgent {
    const key = this.key(e.session_id, sourceAgentId);
    let agent = this.agents.get(key);
    if (agent) return agent;
    const id = this.store.nextAgentId.current++;
    agent = {
      id,
      sourceSessionId: e.session_id,
      sourceAgentId,
      parentAgentId,
      name: sourceAgentId ? e.agent_type || 'Codex subagent' : 'Codex',
      role: sourceAgentId ? e.agent_type || 'agent' : 'coordinator',
      projectName: path.basename(e.cwd),
      projectId: createHash('sha256').update(e.cwd).digest('hex'),
      status: 'idle',
      lastEventAt: 0,
      lastReceivedAt: this.now(),
      barrierAt: 0,
      toolTimes: new Map(),
      toolDone: new Set(),
      retiredToolThrough: 0,
      workBarrierAt: 0,
    };
    this.agents.set(key, agent);
    this.store.set(
      id,
      createAgentState({
        id,
        sessionId: e.session_id,
        projectDir: e.cwd,
        jsonlFile: '',
        isExternal: true,
        hooksOnly: true,
        providerId: 'codex',
        isWaiting: true,
        directoryName: path.basename(e.cwd),
        agentName: agent.name,
        leadAgentId: parentAgentId,
        palette: (id - 1) % 6,
      }),
    );
    return agent;
  }
  private endTool(agent: ObservedAgent, toolId: string) {
    const state = this.store.get(agent.id)!;
    if (state.activeToolIds.delete(toolId))
      this.store.broadcast({ type: 'agentToolDone', id: agent.id, toolId });
    state.activeToolNames.delete(toolId);
    state.activeToolStatuses.delete(toolId);
  }
  private trimTools(agent: ObservedAgent) {
    while (agent.toolDone.size > 512) {
      const toolId = agent.toolDone.values().next().value!;
      agent.retiredToolThrough = Math.max(agent.retiredToolThrough, agent.toolTimes.get(toolId) ?? 0);
      agent.toolDone.delete(toolId);
      agent.toolTimes.delete(toolId);
    }
  }
  private pruneHistory() {
    const completed = [...this.agents.entries()]
      .filter(([, agent]) => !['working', 'permission', 'idle'].includes(agent.status))
      .sort((a, b) => a[1].lastReceivedAt - b[1].lastReceivedAt);
    let count = completed.length;
    let removed = false;
    // Keep parents while any child remains; active state is never silently evicted.
    for (const [key, agent] of completed) {
      const recent = Math.max(agent.lastReceivedAt, agent.reportReceivedAt ?? 0);
      if (count <= 200 && this.now() - recent <= 3_600_000) continue;
      if ([...this.agents.values()].some((child) => child.parentAgentId === agent.id)) continue;
      this.retiredAgentThrough = Math.max(this.retiredAgentThrough, agent.lastEventAt);
      this.agents.delete(key);
      this.store.delete(agent.id);
      this.store.broadcast({ type: 'agentClosed', id: agent.id });
      removed = true;
      count--;
    }
    return removed;
  }
  private finish(agent: ObservedAgent, status: ObserverStatus, timestamp: number) {
    if (timestamp < agent.lastEventAt) return;
    const state = this.store.get(agent.id)!;
    for (const toolId of state.activeToolIds) {
      agent.toolDone.add(toolId);
      this.endTool(agent, toolId);
    }
    this.store.broadcast({ type: 'agentToolsClear', id: agent.id });
    agent.status = status;
    agent.workBarrierAt = Math.max(agent.workBarrierAt, timestamp);
    if (agent.work) agent.work.current = '';
    agent.barrierAt = timestamp;
    // The barrier replaces individual tombstones for tools closed by this stop.
    agent.toolTimes.clear();
    agent.toolDone.clear();
    agent.lastEventAt = Math.max(timestamp, agent.lastEventAt);
    this.publish(agent);
  }
  private publish(agent: ObservedAgent) {
    const state = this.store.get(agent.id)!;
    state.isWaiting = agent.status !== 'working';
    state.permissionSent = agent.status === 'permission';
    this.store.broadcast({
      type: 'agentStatus',
      id: agent.id,
      status: state.isWaiting ? 'waiting' : 'active',
      awaitingInput: agent.status === 'permission',
    });
    this.store.broadcast({ type: 'observerStatus', ...this.snapshot() });
  }
  tick() {
    const now = this.now();
    for (const agent of this.agents.values()) {
      if (
        ['working', 'permission', 'idle'].includes(agent.status) &&
        now - agent.lastReceivedAt > this.timeoutMs
      ) {
        this.finish(agent, 'disconnected', agent.lastEventAt);
      }
    }
    if (this.pruneHistory()) this.store.broadcast({ type: 'observerStatus', ...this.snapshot() });
  }
  snapshot() {
    return {
      mode: 'codex-observer',
      acceptedEvents: this.acceptedEvents,
      duplicateEvents: this.duplicateEvents,
      outOfOrderEvents: this.outOfOrderEvents,
      rejectedEvents: this.rejectedEvents,
      lastEvent: this.lastEvent,
      timeoutMs: this.timeoutMs,
      activity: this.activity.map((entry) => ({ ...entry })),
      agents: [...this.agents.values()].map((a) => ({
        id: a.id,
        sourceSessionId: a.sourceSessionId,
        sourceAgentId: a.sourceAgentId,
        parentAgentId: a.parentAgentId,
        name: a.name,
        role: a.role,
        projectName: a.projectName,
        projectId: a.projectId,
        status: a.status,
        lastEventAt: a.lastEventAt,
        ...(a.work ? { work: { ...a.work } } : {}),
        activeToolCount: this.store.get(a.id)!.activeToolIds.size,
        attribution: a.sourceAgentId ? 'agent' : 'session',
      })),
    };
  }
}
