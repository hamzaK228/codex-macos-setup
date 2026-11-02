import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync,writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { CodexNotifications } from '../src/codexNotifications.js';
const token = '123456789:abcdefghijklmnopqrstuvwx';
const folders: string[] = [];
const directory = () => { const dir = mkdtempSync(path.join(os.tmpdir(), 'notifications-test-')); folders.push(dir); return dir; };
afterEach(() => folders.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const ok = (result: unknown = {}) => new Response(JSON.stringify({ ok: true, result }));
it('persists private configuration and redacts token; disabled background makes no calls', async () => {
  const dir = directory(); const fetcher = vi.fn(async () => ok());
  const engine = new CodexNotifications({ directory: dir, fetch: fetcher });
  await engine.configure({ botToken: token, chatId: '12345', enabled: false });
  await engine.notify('a', 'hello'); await engine.pump(); expect(fetcher).not.toHaveBeenCalled();
  expect(statSync(dir).mode & 0o777).toBe(0o700);
  expect(statSync(path.join(dir, 'notifications.json')).mode & 0o777).toBe(0o600);
  const restored = new CodexNotifications({ directory: dir, fetch: fetcher });
  expect(restored.status()).toMatchObject({ tokenConfigured: true, enabled: false, chatId: '12345' });
  expect(JSON.stringify(restored.status())).not.toContain(token);
  await restored.test(); expect(fetcher).toHaveBeenCalledTimes(1);
});
it('serializes duplicates and preserves deduplication over restart', async () => {
  const dir = directory(); const fetcher = vi.fn(async () => ok());
  let engine = new CodexNotifications({ directory: dir, fetch: fetcher });
  await engine.configure({ botToken: token, chatId: '12345', enabled: true });
  await Promise.all([engine.notify('event', 'Permission'), engine.notify('event', 'Permission')]);
  await Promise.all([engine.pump(), engine.pump()]); expect(fetcher).toHaveBeenCalledTimes(1);
  engine = new CodexNotifications({ directory: dir, fetch: fetcher });
  await engine.notify('event', 'Permission'); await engine.pump(); expect(fetcher).toHaveBeenCalledTimes(1);
});
it('retries three times without exposing upstream errors', async () => {
  let now = 100_000;
  const fetcher = vi.fn(async () => { throw new Error(`secret ${token}`); });
  const engine = new CodexNotifications({ directory: directory(), fetch: fetcher, now: () => now });
  await engine.configure({ botToken: token, chatId: '12345', enabled: true }); await engine.notify('fail', 'Failure');
  await engine.pump(); await engine.pump(); expect(fetcher).toHaveBeenCalledTimes(1);
  now += 30_000; await engine.pump(); now += 60_000; await engine.pump(); now += 500_000; await engine.pump();
  expect(fetcher).toHaveBeenCalledTimes(3); expect(engine.status().pendingCount).toBe(0);
  expect(engine.status().lastError).toBe('Telegram delivery failed'); expect(JSON.stringify(engine.status())).not.toContain(token);
});
it('sends due and overdue once and skips completed tasks across projects', async () => {
  let now = 1_000_000; const messages: string[] = [];
  const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => { messages.push(JSON.parse(String(init?.body)).text); return ok(); });
  const engine = new CodexNotifications({ directory: directory(), fetch: fetcher, now: () => now });
  await engine.syncTasks('a', [{ id: 'a', title: 'Update DB', dueAt: now + 600_000, status: 'planned' }]);
  await engine.syncTasks('b', [{ id: 'b', title: 'Completed', dueAt: now - 1, status: 'done' }]);
  await engine.pump(); expect(messages).toEqual([]);
  await engine.configure({ botToken: token, chatId: '12345', enabled: true });
  await engine.pump(); await engine.pump(); expect(messages).toHaveLength(1);
  now += 600_000; await engine.pump(); await engine.pump(); expect(messages).toHaveLength(2);
  expect(messages[0]).toContain('15 minutes'); expect(messages[1]).toContain('overdue'); expect(messages.join()).not.toContain('Completed');
  await expect(engine.syncTasks('__proto__', [])).rejects.toThrow('Invalid');
});
it('pairs only an exact fresh challenge from one private chat', async () => {
  const now = 1_000_000; let updates: unknown[] = [];
  const engine = new CodexNotifications({ directory: directory(), fetch: vi.fn(async () => ok(updates)), now: () => now });
  await engine.configure({ botToken: token, enabled: false }); const c = engine.beginPair();
  const msg = (id: number, text: string, type = 'private', date = now / 1000) => ({ message: { chat: { id, type }, text, date } });
  updates = [msg(12, '/start'), msg(12, `/start ${c.code}`, 'group'), msg(12, `/start ${c.code}`, 'private', 0)];
  await expect(engine.pair()).rejects.toThrow('exact pairing command');
  updates = [msg(12, `/start ${c.code}`), msg(13, `/start ${c.code}`)]; await expect(engine.pair()).rejects.toThrow('Multiple');
  updates = [msg(12, `/start ${c.code}`)]; expect(await engine.pair()).toMatchObject({ chatId: '12', enabled: false });
  await expect(engine.pair()).rejects.toThrow('expired');
});
it('preserves malformed files and rejects symlink directories', () => {
  const dir = directory(); const file = path.join(dir, 'notifications.json'); writeFileSync(file, '{broken');
  expect(() => new CodexNotifications({ directory: dir })).toThrow('original file preserved'); expect(readFileSync(file, 'utf8')).toBe('{broken');
  const link = path.join(directory(), 'link'); symlinkSync(dir, link); expect(() => new CodexNotifications({ directory: link })).toThrow('private directory');
});
it('cancels pending reminders when tasks finish and supersedes stale due-soon retries', async () => {
  let now = 1_000_000; let fail = true; const messages: string[] = [];
  const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => { if (fail) throw new Error('offline'); messages.push(JSON.parse(String(init?.body)).text); return ok(); });
  const engine = new CodexNotifications({ directory: directory(), fetch: fetcher, now: () => now });
  await engine.configure({ botToken: token, chatId: '12345', enabled: true });
  await engine.syncTasks('a', [{ id: 'a', title: 'Task', dueAt: now + 1000, status: 'planned' }]);
  await engine.pump(); expect(engine.status().pendingCount).toBe(1);
  await engine.syncTasks('a', [{ id: 'a', title: 'Task', dueAt: now + 1000, status: 'done' }]);
  expect(engine.status().pendingCount).toBe(0);
  await engine.syncTasks('b', [{ id: 'b', title: 'Task2', dueAt: now + 1000, status: 'planned' }]);
  await engine.pump(); now += 60_000; fail = false; await engine.pump();
  expect(messages).toHaveLength(1); expect(messages[0]).toContain('overdue');
});
it('bounds each delivery batch to ten without overlapping sends', async () => {
  let concurrent = 0; let maximum = 0;
  const fetcher = vi.fn(async () => { concurrent++; maximum = Math.max(maximum, concurrent); await Promise.resolve(); concurrent--; return ok(); });
  const engine = new CodexNotifications({ directory: directory(), fetch: fetcher });
  await engine.configure({ botToken: token, chatId: '12345', enabled: true });
  await Promise.all(Array.from({ length: 12 }, (_, id) => engine.notify(String(id), 'Attention')));
  await engine.pump(); expect(fetcher).toHaveBeenCalledTimes(10); expect(engine.status().pendingCount).toBe(2);
  await engine.pump(); expect(fetcher).toHaveBeenCalledTimes(12); expect(maximum).toBe(1);
});
it('finds pairing behind a full page of older updates using a bounded offset', async () => {
  const now = 1_000_000;
  let code = '';
  const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    if (request.offset === undefined) return ok(Array.from({ length: 100 }, (_, update_id) => ({ update_id, message: { text: 'unrelated private text' } })));
    expect(request.offset).toBe(100);
    return ok([{ update_id: 100, message: { chat: { id: 12345, type: 'private' }, text: `/start ${code}`, date: now / 1000 } }]);
  });
  const engine = new CodexNotifications({ directory: directory(), fetch: fetcher, now: () => now });
  await engine.configure({ botToken: token, enabled: false }); code = engine.beginPair().code;
  expect(await engine.pair()).toMatchObject({ chatId: '12345', enabled: false });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
