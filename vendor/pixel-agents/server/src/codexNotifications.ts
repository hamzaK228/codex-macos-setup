import { createHash, randomBytes } from 'node:crypto';
import { chmodSync,closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

export interface NotificationTask { id: string; title: string; dueAt: number; status: string }
export interface NotificationStatus {
  enabled: boolean; tokenConfigured: boolean; chatId: string | null;
  lastError: string | null; lastSentAt: number | null; pendingCount: number;
}
interface Delivery { key: string; message: string; createdAt: number; attempts: number; nextAt: number; state: 'pending' | 'sent' | 'failed' }
interface State {
  version: 1; botToken: string; chatId: string; enabled: boolean;
  tasks: Record<string, NotificationTask[]>; deliveries: Delivery[];
  lastError: string | null; lastSentAt: number | null;
}
const blank = (): State => ({ version: 1, botToken: '', chatId: '', enabled: false, tasks: {}, deliveries: [], lastError: null, lastSentAt: null });
const tokenValid = (value: unknown): value is string => typeof value === 'string' && /^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(value);
const chatValid = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const DAY = 86_400_000;

/** Single-process, private persistent notifications. Telegram does not provide send idempotency:
 * a crash after Telegram accepts a message but before saving can cause one duplicate. */
export class CodexNotifications {
  private state = blank();
  private readonly file: string;
  private readonly fetcher: typeof fetch;
  private readonly clock: () => number;
  private queue: Promise<unknown> = Promise.resolve();
  private challenge: { code: string; expiresAt: number; startedAt: number } | null = null;
  constructor(options: { directory: string; fetch?: typeof fetch; now?: () => number }) {
    this.fetcher = options.fetch ?? fetch;
    this.clock = options.now ?? Date.now;
    mkdirSync(options.directory, { recursive: true, mode: 0o700 });
    const dir = lstatSync(options.directory);
    if (!dir.isDirectory() || dir.isSymbolicLink()) throw new Error('Notification storage must be a private directory');
    chmodSync(options.directory, 0o700);
    this.file = path.join(options.directory, 'notifications.json');
    if (existsSync(this.file)) {
      const info = lstatSync(this.file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024) throw new Error('Notification storage is invalid; original file preserved');
      try {
        const value: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
        if (!this.validState(value)) throw new Error('invalid');
        this.state = value;
        chmodSync(this.file, 0o600);
      } catch { throw new Error('Notification storage is invalid; original file preserved'); }
    }
  }
  private validState(value: unknown): value is State {
    if (!value || typeof value !== 'object') return false;
    const s = value as State;
    return s.version === 1 && typeof s.botToken === 'string' && (!s.botToken || tokenValid(s.botToken))
      && typeof s.chatId === 'string' && (!s.chatId || chatValid(s.chatId)) && typeof s.enabled === 'boolean'
      && (!s.enabled || !!(s.botToken && s.chatId))
      && (s.lastError === null || s.lastError === 'Telegram delivery failed' || s.lastError === 'Telegram connection failed')
      && (s.lastSentAt === null || Number.isFinite(s.lastSentAt))
      && !!s.tasks && typeof s.tasks === 'object' && !Array.isArray(s.tasks)
      && Object.entries(s.tasks).length <= 300 && Object.entries(s.tasks).every(([id, tasks]) => this.validProject(id) && this.validTasks(tasks))
      && Object.values(s.tasks).flat().length <= 300
      && Array.isArray(s.deliveries) && s.deliveries.length <= 2000 && s.deliveries.every((d) => d && /^[a-f0-9]{64}$/.test(d.key) && typeof d.message === 'string' && d.message.length <= 1000 && Number.isFinite(d.createdAt) && Number.isFinite(d.nextAt) && Number.isInteger(d.attempts) && d.attempts >= 0 && d.attempts <= 3 && ['pending', 'sent', 'failed'].includes(d.state));
  }
  private validProject(id: string) { return /^[a-zA-Z0-9_-]{1,128}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id); }
  private validTasks(tasks: unknown): tasks is NotificationTask[] {
    return Array.isArray(tasks) && tasks.length <= 300 && tasks.every((t: NotificationTask) => t && typeof t.id === 'string' && t.id.length > 0 && t.id.length <= 200 && typeof t.title === 'string' && t.title.length <= 300 && Number.isFinite(t.dueAt) && t.dueAt > 0 && typeof t.status === 'string' && t.status.length <= 40) && new Set(tasks.map((t: NotificationTask) => t.id)).size === tasks.length;
  }
  private persist() {
    if (existsSync(this.file) && lstatSync(this.file).isSymbolicLink()) throw new Error('Notification storage is invalid');
    const temp = `${this.file}.${randomBytes(8).toString('hex')}.tmp`;
    let fd: number | undefined;
    try {
      fd = openSync(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      writeFileSync(fd, JSON.stringify(this.state));
      fsyncSync(fd);
      closeSync(fd); fd = undefined;
      renameSync(temp, this.file);
    } finally { if (fd !== undefined) closeSync(fd); if (existsSync(temp)) unlinkSync(temp); }
  }
  private serial<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  status(): NotificationStatus {
    return { enabled: this.state.enabled, tokenConfigured: !!this.state.botToken, chatId: this.state.chatId || null, lastError: this.state.lastError, lastSentAt: this.state.lastSentAt, pendingCount: this.state.deliveries.filter((d) => d.state === 'pending').length };
  }
  configure(input: { botToken?: string; chatId?: string; enabled: boolean }): Promise<NotificationStatus> {
    return this.serial(() => {
      if (typeof input.enabled !== 'boolean' || (input.botToken !== undefined && !tokenValid(input.botToken)) || (input.chatId !== undefined && !chatValid(input.chatId))) throw new Error('Invalid Telegram configuration');
      const botToken = input.botToken ?? this.state.botToken;
      const tokenChanged = botToken !== this.state.botToken;
      const chatId = input.chatId ?? (tokenChanged ? '' : this.state.chatId);
      if (input.enabled && (!botToken || !chatId)) throw new Error('Connect a bot and private chat before enabling notifications');
      this.state = { ...this.state, botToken, chatId, enabled: input.enabled, lastError: null,
        deliveries: tokenChanged || chatId !== this.state.chatId ? [] : this.state.deliveries };
      if (tokenChanged) this.challenge = null;
      this.persist(); return this.status();
    });
  }
  beginPair(): { code: string; expiresAt: number } {
    if (!this.state.botToken) throw new Error('Configure the bot first');
    this.challenge = { code: randomBytes(12).toString('hex'), startedAt: this.clock(), expiresAt: this.clock() + 10 * 60_000 };
    return { code: this.challenge.code, expiresAt: this.challenge.expiresAt };
  }
  pair(): Promise<NotificationStatus> {
    return this.serial(async () => {
      const c = this.challenge;
      if (!c || c.expiresAt <= this.clock()) throw new Error('Pairing code expired; generate another code');
      const chats = new Set<string>();
      let offset: number | undefined;
      let exhausted = false;
      // Dedicated office bot: offsets acknowledge older updates without retaining their text.
      for (let page = 0; page < 10; page++) {
        const result = await this.api('getUpdates', { timeout: 0, limit: 100, allowed_updates: ['message'], ...(offset === undefined ? {} : { offset }) });
        if (!Array.isArray(result)) throw new Error('Telegram connection failed');
        let nextOffset = offset ?? 0;
        for (const update of result) {
          if (Number.isSafeInteger(update?.update_id) && update.update_id >= 0) nextOffset = Math.max(nextOffset, update.update_id + 1);
          const m = update?.message;
          if (m?.chat?.type === 'private' && m.text === `/start ${c.code}` && Number.isFinite(m.date) && m.date * 1000 >= c.startedAt - 1000 && m.date * 1000 <= this.clock() + 30_000 && chatValid(String(m.chat.id))) chats.add(String(m.chat.id));
        }
        if (result.length < 100) { exhausted = true; break; }
        if (nextOffset <= (offset ?? 0)) throw new Error('Telegram connection failed');
        offset = nextOffset;
      }
      if (!exhausted) throw new Error('Too many pending bot updates; retry pairing');
      if (chats.size !== 1) throw new Error(chats.size > 1 ? 'Multiple chats matched; generate another pairing code' : 'Send the exact pairing command to your bot, then retry');
      this.state.chatId = [...chats][0]; this.state.enabled = false; this.state.deliveries = []; this.challenge = null;
      this.persist(); return this.status();
    });
  }
  private async api(method: 'sendMessage' | 'getUpdates', body: Record<string, unknown>): Promise<unknown> {
    if (!this.state.botToken) throw new Error('Configure the bot first');
    try {
      const response = await this.fetcher(`https://api.telegram.org/bot${this.state.botToken}/${method}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000), headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error('failed');
      const json = await response.json() as { ok?: boolean; result?: unknown };
      if (json.ok !== true) throw new Error('failed');
      return json.result;
    } catch { throw new Error('Telegram connection failed'); }
  }
  test(): Promise<NotificationStatus> {
    return this.serial(async () => {
      if (!this.state.chatId) throw new Error('Connect a private chat first');
      try { await this.api('sendMessage', { chat_id: this.state.chatId, text: 'Pixel Office: Telegram notifications are connected.', protect_content: true }); this.state.lastSentAt = this.clock(); this.state.lastError = null; }
      catch { this.state.lastError = 'Telegram connection failed'; this.persist(); throw new Error(this.state.lastError); }
      this.persist(); return this.status();
    });
  }
  syncTasks(projectId: string, tasks: NotificationTask[]): Promise<void> {
    return this.serial(() => {
      if (!this.validProject(projectId) || !this.validTasks(tasks)) throw new Error('Invalid notification tasks');
      if (Object.entries(this.state.tasks).filter(([id]) => id !== projectId).reduce((n, [, list]) => n + list.length, tasks.length) > 300) throw new Error('Notification task limit reached');
      const pendingKeys = new Set((this.state.tasks[projectId] ?? []).flatMap((task) => ['soon', 'overdue'].map((kind) => hash(`task:${projectId}:${task.id}:${task.dueAt}:${kind}`))));
      const retainedKeys = new Set(tasks.filter((task) => !['done', 'completed', 'cancelled'].includes(task.status)).flatMap((task) => ['soon', 'overdue'].map((kind) => hash(`task:${projectId}:${task.id}:${task.dueAt}:${kind}`))));
      this.state.deliveries = this.state.deliveries.filter((delivery) => delivery.state !== 'pending' || !pendingKeys.has(delivery.key) || retainedKeys.has(delivery.key));
      if (tasks.length) this.state.tasks[projectId] = tasks.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt, status: t.status }));
      else delete this.state.tasks[projectId];
      this.persist();
    });
  }
  private enqueue(key: string, message: string, now: number) {
    if (!this.state.enabled) return;
    if (typeof key !== 'string' || key.length > 1000 || !key || typeof message !== 'string' || !message || message.length > 1000 || message.includes(this.state.botToken)) throw new Error('Invalid notification');
    const digest = hash(key);
    this.state.deliveries = this.state.deliveries.filter((d) => now - d.createdAt <= 30 * DAY);
    if (this.state.deliveries.some((d) => d.key === digest)) return;
    if (this.state.deliveries.length >= 2000) this.state.deliveries.shift();
    this.state.deliveries.push({ key: digest, message, createdAt: now, attempts: 0, nextAt: now, state: 'pending' });
  }
  notify(key: string, message: string): Promise<void> {
    return this.serial(() => { this.enqueue(key, message, this.clock()); this.persist(); });
  }
  pump(now = this.clock()): Promise<void> {
    return this.serial(async () => {
      if (!this.state.enabled) return;
      for (const [project, tasks] of Object.entries(this.state.tasks)) for (const task of tasks) {
        if (['done', 'completed', 'cancelled'].includes(task.status)) continue;
        const prefix = `task:${project}:${task.id}:${task.dueAt}`;
        if (now >= task.dueAt) {
          const soonKey = hash(`${prefix}:soon`);
          this.state.deliveries = this.state.deliveries.filter((delivery) => delivery.state !== 'pending' || delivery.key !== soonKey);
          this.enqueue(`${prefix}:overdue`, `Pixel Office: task overdue — ${task.title}`, now);
        }
        else if (now >= task.dueAt - 15 * 60_000) this.enqueue(`${prefix}:soon`, `Pixel Office: task due within 15 minutes — ${task.title}`, now);
      }
      this.persist();
      for (const item of this.state.deliveries.filter((d) => d.state === 'pending' && d.nextAt <= now).slice(0, 10)) {
        item.attempts++;
        // Save attempt before I/O so repeated crashes cannot retry indefinitely.
        if (item.attempts >= 3) item.state = 'failed';
        this.persist();
        try {
          await this.api('sendMessage', { chat_id: this.state.chatId, text: item.message, protect_content: true });
          item.state = 'sent'; this.state.lastSentAt = this.clock(); this.state.lastError = null;
        } catch {
          this.state.lastError = 'Telegram delivery failed';
          item.nextAt = now + 30_000 * 2 ** (item.attempts - 1);
        }
        this.persist();
      }
    });
  }
}
