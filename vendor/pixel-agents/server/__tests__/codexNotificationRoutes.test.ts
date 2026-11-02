import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, it, vi } from 'vitest';

import { CodexNotifications } from '../src/codexNotifications.js';
import { createCodexObserverServer } from '../src/codexObserverServer.js';

vi.mock('../src/layoutPersistence.js', () => ({ readLayoutFromFile: () => null }));
it('protects Telegram settings, redacts credentials and accepts schedules only for known projects', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'notification-routes-'));
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: [] }))) as unknown as typeof fetch;
  const notifications = new CodexNotifications({ directory: path.join(dir, 'private'), fetch: fetcher });
  const server = await createCodexObserverServer({ token: 'private-server-test-token', scopes: [dir], notifications,
    projectInventory: () => [{ projectId: 'known-project', projectName: 'Test', source: 'codex-project' }] });
  const headers = { authorization: 'Bearer private-server-test-token' };
  const config = { botToken: '123456:abcdefghijklmnopqrstuvwxyz123456', enabled: false };
  try {
    expect((await server.app.inject({ method: 'GET', url: '/api/notifications/status' })).statusCode).toBe(401);
    expect((await server.app.inject({ method: 'POST', url: '/api/notifications/config', headers: { ...headers, origin: 'https://evil.invalid' }, payload: config })).statusCode).toBe(403);
    expect((await server.app.inject({ method: 'POST', url: '/api/notifications/config', headers, payload: { botToken: [config.botToken], enabled: false } })).statusCode).toBe(400);
    const response = await server.app.inject({ method: 'POST', url: '/api/notifications/config', headers, payload: config });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(config.botToken);
    expect(response.json().tokenConfigured).toBe(true);
    expect((await server.app.inject({ method: 'POST', url: '/api/notifications/config', headers, payload: { enabled: true } })).statusCode).toBe(400);
    expect((await server.app.inject({ method: 'POST', url: '/api/notifications/tasks', headers, payload: { projectId: 'foreign', tasks: [] } })).statusCode).toBe(400);
    expect((await server.app.inject({ method: 'POST', url: '/api/notifications/tasks', headers, payload: { projectId: 'known-project', tasks: [{ id: 'one', title: 'Test', dueAt: Date.now() + 60000, status: 'planned' }] } })).statusCode).toBe(200);
    expect((await server.app.inject({ method: 'POST', url: '/api/notifications/tasks', headers, payload: { projectId: 'known-project', tasks: [{ id: 'bad', title: 'Bad', dueAt: 'wrong', status: 'planned' }] } })).statusCode).toBe(400);
    await notifications.pump(); expect(fetcher).not.toHaveBeenCalled();
    const pairing = await server.app.inject({ method: 'POST', url: '/api/notifications/pair/start', headers, payload: {} });
    expect(pairing.statusCode).toBe(200); expect(pairing.json().code).toMatch(/^[a-f0-9]{24}$/);
    expect((await server.app.inject({ method: 'GET', url: '/api/notifications/status', headers })).body).not.toContain(config.botToken);
  } finally { await server.app.close(); rmSync(dir, { recursive: true, force: true }); }
});
