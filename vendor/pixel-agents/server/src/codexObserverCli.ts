#!/usr/bin/env node
import { lstatSync, readFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { buildAssetCache } from './assetReload.js';
import { CodexNotifications } from './codexNotifications.js';
import { createCodexObserverServer } from './codexObserverServer.js';
import { cachedCodexProjects } from './codexProjects.js';
import { readConfig } from './configPersistence.js';

export function parseObserverArgs(argv: string[], envScopes?: string) {
  let port = 4312;
  const scopes: string[] = [];
  if (envScopes) {
    const parsed: unknown = JSON.parse(envScopes);
    if (!Array.isArray(parsed) || parsed.some((p) => typeof p !== 'string'))
      throw new Error('PIXEL_CODEX_SCOPES must be a JSON array of paths');
    scopes.push(...(parsed as string[]));
  }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') {
      port = Number(argv[++i]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid --port');
    } else if (argv[i] === '--scope' && argv[i + 1]) scopes.push(argv[++i]);
    else
      throw new Error(
        'Usage: codex-observer --scope /absolute/project [--scope /another/project] [--port 4312]',
      );
  }
  if (!scopes.length || scopes.some((p) => !path.isAbsolute(p)))
    throw new Error('At least one absolute --scope is required');
  return { port, scopes };
}
export function readObserverToken(
  file = process.env.PIXEL_CODEX_TOKEN_FILE ??
    path.join(os.homedir(), '.config', 'pixel-agents-codex', 'token'),
) {
  const stat = lstatSync(file);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0)
    throw new Error('Observer token must be a private regular file');
  const token = readFileSync(file, 'utf8').trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) throw new Error('Invalid observer token');
  return token;
}
async function main() {
  const args = parseObserverArgs(process.argv.slice(2), process.env.PIXEL_CODEX_SCOPES);
  const assetCache = await buildAssetCache(__dirname, readConfig().externalAssetDirectories);
  const token = readObserverToken();
  const { app, port } = await createCodexObserverServer({
    ...args,
    token,
    assetCache,
    notifications: new CodexNotifications({ directory: path.join(os.homedir(), '.config', 'pixel-agents-codex', 'notifications') }),
    projectInventory: cachedCodexProjects(path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), '.codex-global-state.json'), args.scopes),
    staticDir: path.join(__dirname, 'webview'),
  });
  console.log(
    `[Pixel Agents] Codex observer on http://127.0.0.1:${port}; terminal disabled. Token remains in the private observer token file.`,
  );
  const shutdown = async () => {
    await app.close();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}
if (require.main === module)
  void main().catch(() => {
    console.error(
      '[Pixel Agents] Codex observer failed to start; check scopes, assets, token and port.',
    );
    process.exitCode = 1;
  });
