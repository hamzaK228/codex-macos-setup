import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify from 'fastify';

import type { AssetCache } from './clientMessageHandler.js';
import type { CodexNotifications } from './codexNotifications.js';
import { CodexObserver, ObserverReportError } from './codexObserver.js';
import type { CodexProject } from './codexProjects.js';
import { readLayoutFromFile } from './layoutPersistence.js';
import {
  bearerTokenValid,
  isAllowedWebSocketOrigin,
  privilegedHostnames,
  standaloneHandshakeVerdict,
} from './wsAuth.js';

export interface CodexObserverServerOptions {
  token: string;
  scopes: string[];
  port?: number;
  staticDir?: string;
  assetCache?: AssetCache;
  timeoutMs?: number;
  projectInventory?: () => CodexProject[];
  notifications?: CodexNotifications;
}
type Send = (message: Record<string, unknown>) => void;

/** Production sprites/layout and the existing UI message protocol, with no command surface. */
function handshake(send: Send, observer: CodexObserver, cache?: AssetCache) {
  send({ type: 'officeAccess', readOnly: true });
  send({
    type: 'providerCapabilities',
    readingTools: ['Read', 'read_file', 'view_image'],
    subagentToolNames: [],
  });
  send({
    type: 'terminalAvailability',
    available: false,
    reason: 'Codex observation only; terminals are disabled.',
  });
  if (cache?.characters)
    send({ type: 'characterSpritesLoaded', characters: cache.characters.characters });
  if (cache?.pets)
    send({
      type: 'petSpritesLoaded',
      pets: cache.pets.pets,
      petNames: cache.pets.manifests.map((p) => p.name),
    });
  if (cache?.floorTiles) send({ type: 'floorTilesLoaded', sprites: cache.floorTiles });
  if (cache?.wallTiles) send({ type: 'wallTilesLoaded', sets: cache.wallTiles });
  if (cache?.carpetTiles) send({ type: 'carpetTilesLoaded', sets: cache.carpetTiles });
  if (cache?.furniture)
    send({
      type: 'furnitureAssetsLoaded',
      catalog: cache.furniture.catalog,
      sprites: Object.fromEntries(cache.furniture.sprites),
    });
  send({
    type: 'settingsLoaded',
    soundEnabled: false,
    lastSeenVersion: '',
    extensionVersion: 'Codex observer',
    watchAllSessions: false,
    alwaysShowLabels: true,
    ghostHeadlessAgents: false,
    hooksEnabled: false,
    hooksInfoShown: true,
    externalAssetDirectories: [],
    showAreas: false,
    bypassPermissions: false,
    showHostDirectories: false,
  });
  send({ type: 'areaMappingsLoaded', mappings: {} });
  send({ type: 'directoriesLoaded', directories: [] });
  const states = [...observer.store.values()];
  send({
    type: 'existingAgents',
    agents: states.map((a) => a.id),
    agentMeta: Object.fromEntries(states.map((a) => [a.id, { palette: a.palette }])),
    directoryNames: Object.fromEntries(states.map((a) => [a.id, a.directoryName])),
    externalAgents: Object.fromEntries(states.map((a) => [a.id, true])),
  });
  send({ type: 'layoutLoaded', layout: readLayoutFromFile() ?? cache?.defaultLayout ?? null });
  for (const a of states) {
    send({ type: 'agentTeamInfo', id: a.id, agentName: a.agentName, leadAgentId: a.leadAgentId });
    for (const toolId of a.activeToolIds)
      send({
        type: 'agentToolStart',
        id: a.id,
        toolId,
        toolName: a.activeToolNames.get(toolId),
        status: a.activeToolStatuses.get(toolId),
      });
    send({
      type: 'agentStatus',
      id: a.id,
      status: a.isWaiting ? 'waiting' : 'active',
      awaitingInput: a.permissionSent,
    });
  }
  send({ type: 'observerStatus', ...observer.snapshot() });
}

export async function createCodexObserverServer(options: CodexObserverServerOptions) {
  const observer = new CodexObserver(options.scopes, options.timeoutMs);
  const projects = (agents: Array<{ projectId: string }>) => {
    return (options.projectInventory?.() ?? []).map((project) => {
      const agentCount = agents.filter((agent) => agent.projectId === project.projectId).length;
      return { ...project, agentCount, status: agentCount ? 'events-received' : 'no-events' };
    });
  };
  const snapshot = () => {
    const current = observer.snapshot();
    return { ...current, projects: projects(current.agents) };
  };
  const app = Fastify({ logger: false, bodyLimit: 16_384 });
  await app.register(fastifyWebsocket);
  if (options.staticDir) {
    await app.register(fastifyStatic, { root: options.staticDir, prefix: '/' });
    app.setNotFoundHandler((request, reply) => {
      if (
        request.method === 'GET' &&
        !request.url.startsWith('/api/') &&
        !request.url.startsWith('/terminal')
      )
        return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'not found' });
    });
  }
  // Auth is enforced before parsing metadata; browser cross-origin mutation is refused too.
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    if (!bearerTokenValid(request.headers.authorization, options.token))
      return reply.code(401).send({ error: 'unauthorized' });
    if (
      request.headers.origin &&
      !isAllowedWebSocketOrigin(request.headers.origin, request.headers.host)
    )
      return reply.code(403).send({ error: 'forbidden origin' });
  });
  app.get('/api/health', async () => ({ status: 'ok', mode: 'codex-observer' }));
  app.get('/api/observer/status', async () => snapshot());
  if (options.notifications) {
    const notifications = options.notifications;
    app.get('/api/notifications/status', async () => notifications.status());
    app.post('/api/notifications/config', async (request, reply) => {
      try { return await notifications.configure(request.body as Parameters<CodexNotifications['configure']>[0]); }
      catch { return reply.code(400).send({ error: 'Не удалось сохранить настройки Telegram. Проверьте токен и чат.' }); }
    });
    app.post('/api/notifications/pair/start', async (_request, reply) => {
      try { return notifications.beginPair(); }
      catch { return reply.code(400).send({ error: 'Сначала сохраните токен бота.' }); }
    });
    app.post('/api/notifications/pair/confirm', async (_request, reply) => {
      try { return await notifications.pair(); }
      catch { return reply.code(400).send({ error: 'Не найдено сообщение с кодом. Отправьте его боту в личном чате и попробуйте снова.' }); }
    });
    app.post('/api/notifications/test', async (_request, reply) => {
      try { return await notifications.test(); }
      catch { return reply.code(400).send({ error: 'Тест не доставлен. Проверьте подключение и настройки Telegram.' }); }
    });
    app.post('/api/notifications/tasks', { bodyLimit: 131072 }, async (request, reply) => {
      const input = request.body as { projectId?: unknown; tasks?: unknown } | null;
      const known = new Set([...snapshot().agents.map((agent) => agent.projectId), ...(options.projectInventory?.() ?? []).map((project) => project.projectId)]);
      if (!input || typeof input.projectId !== 'string' || !known.has(input.projectId) || !Array.isArray(input.tasks)) return reply.code(400).send({ error: 'Неизвестный проект или неверные напоминания.' });
      try { await notifications.syncTasks(input.projectId, input.tasks); return { ok: true }; }
      catch { return reply.code(400).send({ error: 'Не удалось сохранить напоминания.' }); }
    });
  }

  app.post('/api/hooks/codex', async (request, reply) => {
    try {
      const result = observer.receive(request.body);
      const input = request.body as { hook_event_name?: string; event_id?: string };
      if (result.accepted && options.notifications && input.hook_event_name === 'Interrupt' && typeof input.event_id === 'string') {
        void options.notifications.notify(`interruption:${input.event_id}`, 'AI Office: работа Codex прервана. Откройте чат и проверьте состояние задачи.').catch(() => undefined);
      }
      return result;
    } catch {
      return reply.code(400).send({ error: 'Invalid or out-of-scope Codex metadata' });
    }
  });
  app.post('/api/observer/report', async (request, reply) => {
    try {
      return observer.receiveReport(request.body);
    } catch (error) {
      return reply.code(error instanceof ObserverReportError ? error.statusCode : 400)
        .send({ error: 'Invalid or unmatched agent report' });
    }
  });
  app.get('/ws', { websocket: true }, (socket, request) => {
    const trusted =
      isAllowedWebSocketOrigin(request.headers.origin, request.headers.host) &&
      standaloneHandshakeVerdict(
        request.url,
        request.headers.host,
        options.token,
        privilegedHostnames('127.0.0.1', []),
      ) === 'privileged';
    if (!trusted) {
      socket.close(4401, 'unauthorized');
      return;
    }
    const send: Send = (message) => {
      if (socket.readyState === 1) socket.send(JSON.stringify(message.type === 'observerStatus' ? { ...message, projects: projects((message.agents ?? []) as Array<{ projectId: string }>) } : message));
    };
    const onAdded = (id: number) => {
      const a = observer.store.get(id)!;
      send({
        type: 'agentCreated',
        id,
        directoryName: a.directoryName,
        isExternal: true,
        hooksOnly: true,
        teammateName: a.agentName,
        parentAgentId: a.leadAgentId,
        isTeammate: a.leadAgentId !== undefined,
        palette: a.palette,
      });
      send({ type: 'agentTeamInfo', id, agentName: a.agentName, leadAgentId: a.leadAgentId });
      send({ type: 'agentStatus', id, status: a.isWaiting ? 'waiting' : 'active' });
    };
    observer.store.on('agentAdded', onAdded);
    observer.store.on('broadcast', send);
    socket.on('message', (data) => {
      if (Buffer.byteLength(data.toString()) > 16_384) {
        socket.close(4400, 'message too large');
        return;
      }
      try {
        const message = JSON.parse(data.toString()) as { type?: string };
        if (message.type === 'webviewReady') handshake(send, observer, options.assetCache);
        else
          send({
            type: 'observerActionRejected',
            action: typeof message.type === 'string' ? message.type.slice(0, 80) : 'unknown',
            reason: 'Codex observation only; actions are disabled.',
          });
      } catch {
        send({ type: 'observerActionRejected', reason: 'Invalid message' });
      }
    });
    socket.on('close', () => {
      observer.store.off('agentAdded', onAdded);
      observer.store.off('broadcast', send);
    });
  });
  const permissionStates = new Set<number>();
  const onNotificationSnapshot = () => {
    if (!options.notifications) return;
    if (!options.notifications.status().enabled) { permissionStates.clear(); return; }
    const observedAgents = observer.snapshot().agents;
    for (const agent of observedAgents) {
      if (agent.status === 'permission' && !permissionStates.has(agent.id)) {
        permissionStates.add(agent.id);
        void options.notifications.notify(`permission:${agent.id}:${agent.lastEventAt}`, `AI Office: требуется разрешение в Codex. Проект: ${agent.projectName || 'Без проекта'}. Агент #${agent.id}.`).catch(() => undefined);
      } else if (agent.status !== 'permission') permissionStates.delete(agent.id);
    }
    const retained = new Set(observedAgents.map((agent) => agent.id));
    for (const id of permissionStates) if (!retained.has(id)) permissionStates.delete(id);
  };
  observer.store.on('broadcast', onNotificationSnapshot);
  let pumping = false;
  const notificationTimer = options.notifications ? setInterval(() => {
    if (pumping) return;
    pumping = true;
    onNotificationSnapshot();
    void options.notifications!.pump().catch(() => undefined).finally(() => { pumping = false; });
  }, 15000) : null;
  notificationTimer?.unref();
  let projectSignature = '';
  const timer = setInterval(() => {
    observer.tick();
    const next = JSON.stringify(options.projectInventory?.() ?? []);
    if (next !== projectSignature) {
      projectSignature = next;
      observer.store.broadcast({ type: 'observerStatus', ...snapshot() });
    }
  }, 1000);
  timer.unref();
  app.addHook('onClose', async () => {
    clearInterval(timer);
    if (notificationTimer) clearInterval(notificationTimer);
    observer.store.off('broadcast', onNotificationSnapshot);
    observer.store.dispose();
  });
  await app.listen({ host: '127.0.0.1', port: options.port ?? 0 });
  const address = app.server.address();
  return { app, observer, port: typeof address === 'object' ? address!.port : 0 };
}
