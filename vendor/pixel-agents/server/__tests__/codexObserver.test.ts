import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CodexObserver } from '../src/codexObserver.js';
import { parseObserverArgs } from '../src/codexObserverCli.js';

let scope: string;
let now: number;
let seq: number;
let observer: CodexObserver;
function event(name: string, fields: Record<string, unknown> = {}) {
  return {
    hook_event_name: name,
    session_id: 'parent-session',
    cwd: scope,
    event_id: `e${++seq}`,
    timestamp: now++,
    ...fields,
  };
}
beforeEach(() => {
  scope = mkdtempSync(path.join(os.tmpdir(), 'codex-observer-'));
  now = Date.now() - 10000;
  seq = 0;
  observer = new CodexObserver([scope], 100, () => now);
});
afterEach(() => rmSync(scope, { recursive: true, force: true }));

describe('Codex metadata observation', () => {
  it('keeps root and two distinct children with ambiguous tools attributed to session', () => {
    observer.receive(event('SessionStart'));
    observer.receive(event('SubagentStart', { agent_id: 'child-a', agent_type: 'reviewer' }));
    observer.receive(event('SubagentStart', { agent_id: 'child-b' }));
    observer.receive(
      event('PreToolUse', { tool_use_id: 'tool-parent', tool_name: 'exec_command' }),
    );
    observer.receive(
      event('PreToolUse', {
        agent_id: 'child-b',
        tool_use_id: 'tool-child',
        tool_name: 'read_file',
      }),
    );
    const agents = observer.snapshot().agents;
    expect(agents.map((a) => a.activeToolCount)).toEqual([1, 0, 1]);
    expect(agents.map((a) => a.status)).toEqual(['working', 'working', 'working']);
    expect(agents[1].parentAgentId).toBe(agents[0].id);
    observer.receive(event('SubagentStop', { agent_id: 'child-a' }));
    expect(observer.snapshot().agents.map((a) => a.status)).toEqual([
      'working',
      'stopped',
      'working',
    ]);
  });
  it('correlates concurrent tools by true IDs and makes duplicate events idempotent', () => {
    const first = event('PreToolUse', { tool_use_id: 'a', tool_name: 'exec_command' });
    observer.receive(first);
    observer.receive(event('PreToolUse', { tool_use_id: 'b', tool_name: 'exec_command' }));
    expect(observer.receive(first)).toEqual({ accepted: false, duplicate: true });
    observer.receive(event('PostToolUse', { tool_use_id: 'a' }));
    expect([...observer.store.get(1)!.activeToolIds]).toEqual(['b']);
    expect(observer.snapshot().duplicateEvents).toBe(1);
  });
  it('handles end-before-start and old events after interrupt without phantom ongoing tools', () => {
    const started = event('PreToolUse', { tool_use_id: 'a', tool_name: 'exec_command' });
    observer.receive(event('PostToolUse', { tool_use_id: 'a' }));
    expect(observer.receive(started).accepted).toBe(false);
    observer.receive(event('PreToolUse', { tool_use_id: 'b', tool_name: 'exec_command' }));
    observer.receive(event('SubagentStart', { agent_id: 'child' }));
    const oldStart = event('PreToolUse', { tool_use_id: 'c', tool_name: 'exec_command' });
    observer.receive(event('Interrupt'));
    observer.receive(oldStart);
    observer.receive(event('PostToolUse', { tool_use_id: 'b' }));
    expect(observer.snapshot().agents.map((a) => a.status)).toEqual(['interrupted', 'interrupted']);
    expect(observer.snapshot().agents.map((a) => a.activeToolCount)).toEqual([0, 0]);
  });
  it('sets permission and expires silence to disconnected, clearing tools', () => {
    observer.receive(event('PreToolUse', { tool_use_id: 'a', tool_name: 'exec_command' }));
    observer.receive(event('PermissionRequest'));
    expect(observer.snapshot().agents[0].status).toBe('permission');
    now += 101;
    observer.tick();
    expect(observer.snapshot().agents[0].status).toBe('disconnected');
    expect(observer.store.get(1)!.activeToolIds.size).toBe(0);
  });
  it('rejects source text, missing IDs, unknown events, future time, sibling paths and escaping symlinks', () => {
    for (const value of [
      event('PreToolUse', { tool_name: 'exec_command' }),
      event('SubagentStart'),
      event('Other'),
      event('SessionStart', { prompt: 'private' }),
      event('SessionStart', { timestamp: now + 100000 }),
      event('SessionStart', { cwd: os.tmpdir() }),
      event('SessionStart', { cwd: scope + '-other' }),
    ]) {
      expect(() => observer.receive(value)).toThrow();
    }
    symlinkSync(os.tmpdir(), path.join(scope, 'escape'));
    expect(() =>
      observer.receive(event('SessionStart', { cwd: path.join(scope, 'escape') })),
    ).toThrow();
    expect(observer.store.size).toBe(0);
    const child = path.join(scope, 'child');
    mkdirSync(child);
    expect(observer.receive(event('SessionStart', { cwd: child })).accepted).toBe(true);
  });
  it('rejects out-of-order stops and never conflates same child IDs across sessions', () => {
    const oldStop = event('SubagentStop', { agent_id: 'same' });
    observer.receive(event('SubagentStart', { agent_id: 'same' }));
    observer.receive(oldStop);
    observer.receive(event('SubagentStart', { session_id: 'another-session', agent_id: 'same' }));
    expect(observer.snapshot().agents.filter((a) => a.sourceAgentId === 'same')).toHaveLength(2);
    expect(observer.snapshot().agents[1].status).toBe('working');
  });
  it('observes existing and newly created projects with an explicitly approved filesystem root scope', () => {
    const globalObserver = new CodexObserver([path.parse(scope).root], 100, () => now);
    expect(globalObserver.receive(event('SessionStart')).accepted).toBe(true);
    const newProject = path.join(scope, 'future-project');
    mkdirSync(newProject);
    expect(globalObserver.receive(event('SessionStart', { cwd: newProject, session_id: 'new-project' })).accepted).toBe(true);
    expect(globalObserver.snapshot().agents).toHaveLength(2);
  });
  it('groups canonical project paths without exposing them or conflating equal basenames', () => {
    const first = path.join(scope, 'one', 'project');
    const second = path.join(scope, 'two', 'project');
    mkdirSync(first, { recursive: true });
    mkdirSync(second, { recursive: true });
    const alias = path.join(scope, 'alias');
    symlinkSync(first, alias);
    observer.receive(event('SessionStart', { cwd: first, session_id: 'one' }));
    observer.receive(event('SubagentStart', { cwd: first, session_id: 'one', agent_id: 'child' }));
    observer.receive(event('SessionStart', { cwd: alias, session_id: 'alias' }));
    observer.receive(event('SessionStart', { cwd: second, session_id: 'two' }));
    const agents = observer.snapshot().agents;
    expect(agents.map((agent) => agent.projectName)).toEqual(Array(4).fill('project'));
    expect(agents[0].projectId).toMatch(/^[a-f0-9]{64}$/);
    expect(agents[1].projectId).toBe(agents[0].projectId);
    expect(agents[2].projectId).toBe(agents[0].projectId);
    expect(agents[3].projectId).not.toBe(agents[0].projectId);
    expect(JSON.stringify(observer.snapshot())).not.toContain(scope);
  });
  it('uses truthful fallback roles and retains or updates source roles across stops', () => {
    observer.receive(event('SubagentStop', { agent_id: 'child' }));
    expect(observer.snapshot().agents.map((agent) => agent.role)).toEqual(['coordinator', 'agent']);
    observer.receive(event('SubagentStart', { agent_id: 'child', agent_type: 'reviewer' }));
    observer.receive(event('SubagentStop', { agent_id: 'child' }));
    expect(observer.snapshot().agents[1].role).toBe('reviewer');
    expect(observer.snapshot().agents[0].role).toBe('coordinator');
    observer.receive(event('SubagentStart', { agent_id: 'child', agent_type: 'developer' }));
    expect(observer.snapshot().agents[1].role).toBe('developer');
    expect(observer.store.get(2)!.agentName).toBe('developer');
  });
  it('keeps only forty accepted activity records with metadata and no synthetic timeout events', () => {
    for (let i = 0; i < 45; i++) {
      observer.receive(event('PreToolUse', { tool_use_id: `tool-${i}`, tool_name: 'read_file' }));
    }
    const last = event('SubagentStop', { agent_id: 'child', reason: 'private reason' });
    observer.receive(last);
    observer.receive(last);
    observer.receive(event('SessionStart', { timestamp: 1 }));
    expect(() => observer.receive(event('SessionStart', { output: 'private output' }))).toThrow();
    const snapshot = observer.snapshot();
    expect(snapshot.activity).toHaveLength(40);
    expect(snapshot.activity[0]).toEqual({
      eventName: 'PreToolUse', agentId: 1, timestamp: last.timestamp - 39, toolName: 'read_file',
    });
    expect(snapshot.activity.at(-1)).toEqual({ eventName: 'SubagentStop', agentId: 2, timestamp: last.timestamp });
    const serialized = JSON.stringify(snapshot.activity);
    expect(serialized).not.toContain('private');
    expect(serialized).not.toContain(scope);
    snapshot.activity[0].eventName = 'mutated';
    now += 101;
    observer.tick();
    expect(observer.snapshot().activity).toHaveLength(40);
    expect(observer.snapshot().activity[0].eventName).toBe('PreToolUse');
    expect(observer.snapshot().activity.at(-1)?.eventName).toBe('SubagentStop');
  });
  it('requires explicit scopes and refuses unsupported CLI options', () => {
    expect(() => parseObserverArgs([])).toThrow();
    expect(() => parseObserverArgs(['--scope', scope, '--host', '0.0.0.0'])).toThrow();
    expect(parseObserverArgs(['--scope', scope, '--port', '4312'])).toEqual({
      scopes: [scope],
      port: 4312,
    });
  });
});

describe('explicit agent work reports', () => {
  function report(fields: Record<string, unknown> = {}) {
    return { thread_id: 'parent-session', cwd: scope, event_id: `r${++seq}`, timestamp: now++,
      done: 'Проверил входные данные', current: 'Добавляю отчёты', next: 'Запущу проверки', ...fields };
  }
  it('maps real thread IDs to root and child, broadcasts and preserves tools/liveness ordering', () => {
    observer.receive(event('UserPromptSubmit'));
    observer.receive(event('SubagentStart', { agent_id: 'child' }));
    const messages: Record<string, unknown>[] = [];
    observer.store.on('broadcast', (message) => messages.push(message));
    const before = observer.snapshot();
    expect(observer.receiveReport(report()).accepted).toBe(true);
    expect(observer.receiveReport(report({ thread_id: 'child', done: 'Child done' })).accepted).toBe(true);
    expect(observer.snapshot().agents.map((agent) => agent.work?.done)).toEqual(['Проверил входные данные', 'Child done']);
    expect(observer.snapshot().agents[0].lastEventAt).toBe(before.agents[0].lastEventAt);
    expect(messages.filter((message) => message.type === 'observerStatus')).toHaveLength(2);
    expect(messages.some((message) => message.type === 'agentStatus')).toBe(false);
    observer.receive(event('PreToolUse', { tool_use_id: 'one', tool_name: 'read_file' }));
    observer.receive(event('PostToolUse', { tool_use_id: 'one' }));
    expect(observer.snapshot().agents[0].work?.current).toBe('Добавляю отчёты');
    const snapshot = observer.snapshot();
    snapshot.agents[0].work!.done = 'mutated';
    expect(observer.snapshot().agents[0].work?.done).toBe('Проверил входные данные');
  });
  it('rejects unknown, ambiguous, and wrong-project senders without creating agents', () => {
    expect(() => observer.receiveReport(report())).toThrow();
    expect(observer.store.size).toBe(0);
    observer.receive(event('UserPromptSubmit'));
    const nested = path.join(scope, 'other'); mkdirSync(nested);
    expect(() => observer.receiveReport(report({ cwd: nested }))).toThrow();
    observer.receive(event('SubagentStart', { agent_id: 'same' }));
    observer.receive(event('SubagentStart', { session_id: 'other-session', agent_id: 'same' }));
    expect(() => observer.receiveReport(report({ thread_id: 'same' }))).toThrow();
    expect(observer.snapshot().agents.every((agent) => !agent.work)).toBe(true);
  });
  it('validates strict shape, bounded single line text, canonical cwd and source time', () => {
    observer.receive(event('UserPromptSubmit'));
    for (const fields of [{ prompt: 'private' }, { done: undefined }, { current: 'x'.repeat(281) },
      { next: 'two\nlines' }, { done: 'bad\x7f' }, { timestamp: now + 100000 }, { timestamp: null },
      { cwd: '.' }, { thread_id: '' }])
      expect(() => observer.receiveReport(report(fields))).toThrow();
    const alias = path.join(scope, 'alias'); symlinkSync(scope, alias);
    expect(observer.receiveReport(report({ cwd: alias, done: 'x'.repeat(280), current: '', next: '' })).accepted).toBe(true);
    expect(JSON.stringify(observer.snapshot())).not.toContain(scope);
  });
  it('deduplicates, rejects older reports, clears current on new prompts and never revives finished agents', () => {
    observer.receive(event('UserPromptSubmit'));
    const old = report();
    const latest = report({ timestamp: now + 1 });
    observer.receiveReport(latest);
    expect(observer.receiveReport(latest)).toEqual({ accepted: false, duplicate: true });
    expect(observer.receiveReport(old)).toEqual({ accepted: false, outOfOrder: true });
    now += 5;
    observer.receive(event('UserPromptSubmit'));
    expect(observer.snapshot().agents[0].work?.current).toBe('');
    expect(observer.receiveReport(report({ timestamp: latest.timestamp + 1 }))).toEqual({ accepted: false, outOfOrder: true });
    observer.receiveReport(report());
    observer.receive(event('Stop'));
    expect(observer.snapshot().agents[0].work).toMatchObject({ done: old.done, current: '', next: old.next });
    observer.receiveReport(report({ done: 'Закончено', current: 'Must stay hidden' }));
    expect(observer.snapshot().agents[0]).toMatchObject({ status: 'stopped', work: { done: 'Закончено', current: '' } });
    observer.receive(event('UserPromptSubmit'));
    observer.receiveReport(report());
    observer.receive(event('Interrupt'));
    expect(observer.snapshot().agents[0].work?.current).toBe('');
  });
  it('reports cannot postpone disconnection and retain only explicit done/next', () => {
    observer.receive(event('UserPromptSubmit'));
    now += 101;
    observer.receiveReport(report({ done: '', next: '' }));
    observer.tick();
    expect(observer.snapshot().agents[0]).toMatchObject({ status: 'disconnected', work: { done: '', current: '', next: '' } });
  });
});

describe('bounded observer history', () => {
  it('bounds completed tool tombstones without resurrecting evicted stale tools or losing active tools', () => {
    const stale = event('PreToolUse', { tool_use_id: 'old', tool_name: 'read' });
    observer.receive(event('PostToolUse', { tool_use_id: 'old' }));
    observer.receive(event('PreToolUse', { tool_use_id: 'ongoing', tool_name: 'read' }));
    for (let i = 0; i < 1500; i++) observer.receive(event('PostToolUse', { tool_use_id: `closed-${i}` }));
    const retained = (observer as any).agents.values().next().value;
    expect(retained.toolDone.size).toBeLessThanOrEqual(512);
    expect(retained.toolTimes.size).toBeLessThanOrEqual(513);
    expect(observer.receive(stale)).toEqual({ accepted: false, outOfOrder: true });
    expect(observer.snapshot().agents[0].activeToolCount).toBe(1);
    observer.receive(event('PostToolUse', { tool_use_id: 'ongoing' }));
    expect(observer.snapshot().agents[0].activeToolCount).toBe(0);
  });
  it('bounds completed agents and rejects stale resurrection', () => {
    const stale = event('SessionStart', { session_id: 'closed-0' });
    for (let i = 0; i < 250; i++) {
      observer.receive(event('SessionStart', { session_id: `closed-${i}` }));
      observer.receive(event('SessionEnd', { session_id: `closed-${i}` }));
    }
    expect(observer.snapshot().agents.length).toBeLessThanOrEqual(200);
    expect(observer.store.size).toBeLessThanOrEqual(200);
    expect(observer.receive(stale)).toEqual({ accepted: false, outOfOrder: true });
    expect(observer.snapshot().agents.some((a) => a.sourceSessionId === 'closed-0')).toBe(false);
  });
  it('expires completed history after the timeout', () => {
    observer.receive(event('SubagentStart', { agent_id: 'child' }));
    observer.receive(event('Stop'));
    now += 3600001;
    observer.tick();
    // Both become eligible after the child is disconnected by the timeout.
    expect(observer.store.size).toBeLessThanOrEqual(1);
    observer.tick();
    expect(observer.store.size).toBe(0);
  });

  it('does not evict completed parents with a working child, and retains recent work reports', () => {
    observer.receive(event('SubagentStart', { agent_id: 'child' }));
    observer.receive(event('Stop'));
    now += 3_600_001;
    observer.receive(event('UserPromptSubmit', { agent_id: 'child' }));
    observer.tick();
    expect(observer.snapshot().agents.length).toBe(2);
    observer.receiveReport({thread_id:'child',cwd:scope,event_id:'report',timestamp:now++,done:'Verified result',current:'Working',next:'Review'});
    expect(observer.snapshot().agents[1].work?.done).toBe('Verified result');
  });
});
