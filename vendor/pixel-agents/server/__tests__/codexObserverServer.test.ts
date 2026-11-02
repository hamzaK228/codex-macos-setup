import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { createCodexObserverServer } from '../src/codexObserverServer.js';

vi.mock('../src/layoutPersistence.js', () => ({ readLayoutFromFile: () => null }));

const token = 'test-token-private-codex-observer';
let scope: string;
let server: Awaited<ReturnType<typeof createCodexObserverServer>>;
beforeEach(async () => {
  scope = mkdtempSync(path.join(os.tmpdir(), 'observer-http-'));
  server = await createCodexObserverServer({ token, scopes: [scope] });
});
afterEach(async () => {
  await server.app.close();
  rmSync(scope, { recursive: true, force: true });
});

it('authenticates and validates ingestion/status without revealing source payloads or tokens', async () => {
  const payload = {
    hook_event_name: 'SessionStart',
    session_id: 'actual-id',
    cwd: scope,
    event_id: 'one',
    timestamp: Date.now(),
  };
  expect(
    (await server.app.inject({ method: 'POST', url: '/api/hooks/codex', payload })).statusCode,
  ).toBe(401);
  const headers = { authorization: `Bearer ${token}` };
  expect(
    (
      await server.app.inject({
        method: 'POST',
        url: '/api/hooks/codex',
        headers: { ...headers, origin: 'https://evil.invalid' },
        payload,
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (await server.app.inject({ method: 'POST', url: '/api/hooks/codex', headers, payload }))
      .statusCode,
  ).toBe(200);
  expect(
    (
      await server.app.inject({
        method: 'POST',
        url: '/api/hooks/codex',
        headers,
        payload: { ...payload, event_id: 'two', tool_input: 'private' },
      })
    ).statusCode,
  ).toBe(400);
  const response = await server.app.inject({ method: 'GET', url: '/api/observer/status', headers });
  expect(response.json().agents).toHaveLength(1);
  expect(response.json().agents[0]).toMatchObject({
    projectName: path.basename(scope), role: 'coordinator',
  });
  expect(response.json().agents[0].projectId).toMatch(/^[a-f0-9]{64}$/);
  expect(response.json().activity).toEqual([
    { eventName: 'SessionStart', agentId: 1, timestamp: payload.timestamp },
  ]);
  expect(response.body).not.toContain(token);
  expect(response.body).not.toContain(scope);
  expect(response.body).not.toContain('private');
  expect((await server.app.inject({ method: 'GET', url: '/api/observer/status' })).statusCode).toBe(
    401,
  );
  expect(
    (await server.app.inject({ method: 'POST', url: '/api/hooks/claude', headers, payload }))
      .statusCode,
  ).toBe(404);
  expect((await server.app.inject({ method: 'GET', url: '/terminal/1' })).statusCode).toBe(404);
});

it('uses the real websocket protocol, refuses launch/hook actions, and replays state on reconnect', async () => {
  server.observer.receive({
    hook_event_name: 'SubagentStart',
    session_id: 'parent',
    agent_id: 'child',
    cwd: scope,
    event_id: 'one',
    timestamp: Date.now(),
  });
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=${token}`);
  await once(socket, 'open');
  const messages: Record<string, unknown>[] = [];
  socket.on('message', (data) => messages.push(JSON.parse(data.toString())));
  socket.send(JSON.stringify({ type: 'webviewReady' }));
  await new Promise<void>((resolve) => {
    socket.on('message', (data) => {
      if (JSON.parse(data.toString()).type === 'observerStatus') resolve();
    });
  });
  expect(messages.some((m) => m.type === 'hooksConsentRequest')).toBe(false);
  expect(messages.find((m) => m.type === 'existingAgents')!.agents).toEqual([1, 2]);
  expect(messages.find((m) => m.type === 'officeAccess')!.readOnly).toBe(true);
  const snapshot = messages.find((m) => m.type === 'observerStatus')!;
  expect(snapshot.agents).toEqual(server.observer.snapshot().agents);
  expect(snapshot.activity).toEqual(server.observer.snapshot().activity);
  expect(JSON.stringify(snapshot)).not.toContain(scope);
  const reportBroadcast = once(socket, 'message');
  const reportResponse = await server.app.inject({
    method: 'POST', url: '/api/observer/report',
    headers: { authorization: `Bearer ${token}` },
    payload: { thread_id: 'child', cwd: scope, event_id: 'report-child', timestamp: Date.now(),
      done: 'Reviewed', current: 'Checking', next: 'Summarize' },
  });
  expect(reportResponse.json()).toEqual({ accepted: true });
  const reportMessage = JSON.parse((await reportBroadcast)[0].toString());
  expect(reportMessage.type).toBe('observerStatus');
  expect(reportMessage.agents[1].work).toMatchObject({ done: 'Reviewed', current: 'Checking' });
  for (const type of ['launchAgent', 'setHooksEnabled', 'hooksConsentResponse']) {
    const next = once(socket, 'message');
    socket.send(JSON.stringify({ type, enabled: true }));
    expect(JSON.parse((await next)[0].toString()).type).toBe('observerActionRejected');
  }
  const closed = once(socket, 'close');
  socket.close();
  await closed;
  expect(server.observer.store.size).toBe(2);
});

it('refuses websocket clients missing the token', async () => {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
  const [code] = await once(socket, 'close');
  expect(code).toBe(4401);
});

it('protects reports with auth/origin, strict validation and the existing body size limit', async () => {
  const payload = { thread_id: 'actual-id', cwd: scope, event_id: 'report', timestamp: Date.now(), done: '', current: 'Working', next: '' };
  const headers = { authorization: `Bearer ${token}` };
  const post = (body = payload, extraHeaders = {}) => server.app.inject({ method: 'POST', url: '/api/observer/report', headers: { ...headers, ...extraHeaders }, payload: body });
  expect((await server.app.inject({ method: 'POST', url: '/api/observer/report', payload })).statusCode).toBe(401);
  expect((await post(payload, { origin: 'https://evil.invalid' })).statusCode).toBe(403);
  expect((await post()).statusCode).toBe(409);
  server.observer.receive({ hook_event_name: 'UserPromptSubmit', session_id: 'actual-id', cwd: scope, event_id: 'start', timestamp: payload.timestamp - 1 });
  expect((await post({ ...payload, current: 'x'.repeat(281) })).statusCode).toBe(400);
  expect((await post({ ...payload, current: 'x'.repeat(20_000) })).statusCode).toBe(413);
  expect((await post()).json()).toEqual({ accepted: true });
  expect((await post()).json()).toEqual({ accepted: false, duplicate: true });
  expect(server.observer.snapshot().agents[0]).toMatchObject({ status: 'working', work: { current: 'Working', source: 'agent-report' } });
});
