import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import * as path from 'node:path';

export interface CodexProject { projectId: string; projectName: string; source: 'codex-project' }

/** Read only the saved local project index, never thread bodies/transcripts.
 * Unknown formats fail empty; existing agent events still work independently. */
export function readCodexProjects(file: string, scopes: string[]): CodexProject[] {
  try {
    if (statSync(file).size > 4 * 1024 * 1024) return [];
    const state = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    const entries = state['local-projects'];
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return [];
    const order = state['project-order'];
    const pinned = state['pinned-project-ids'];
    if (!Array.isArray(order) || !Array.isArray(pinned)) return [];
    const ids = [...new Set([...order, ...pinned].filter((id): id is string => typeof id === 'string'))].slice(0, 128);
    const roots = scopes.map((scope) => realpathSync(scope));
    const result = new Map<string, CodexProject>();
    for (const id of ids) {
      const item = (entries as Record<string, unknown>)[id];
      if (!item || typeof item !== 'object') continue;
      const { name, rootPaths } = item as { name?: unknown; rootPaths?: unknown };
      if (typeof name !== 'string' || !name.trim() || name.length > 160 || /[\x00-\x1f\x7f]/.test(name) || !Array.isArray(rootPaths)) continue;
      for (const root of rootPaths.slice(0, 8)) {
        if (typeof root !== 'string' || !path.isAbsolute(root)) continue;
        try {
          const cwd = realpathSync(root);
          if (!statSync(cwd).isDirectory() || !roots.some((scope) => cwd === scope || cwd.startsWith(scope.endsWith(path.sep) ? scope : scope + path.sep))) continue;
          const projectId = createHash('sha256').update(cwd).digest('hex');
          result.set(projectId, { projectId, projectName: name.trim(), source: 'codex-project' });
        } catch { /* Missing project roots stay unknown, not fabricated. */ }
      }
    }
    return [...result.values()];
  } catch { return []; }
}

export function cachedCodexProjects(file: string, scopes: string[], now = Date.now) {
  let nextRead = 0;
  let cached: CodexProject[] = [];
  let mtime = -1;
  return () => {
    if (now() < nextRead) return cached;
    nextRead = now() + 15_000;
    try {
      const current = statSync(file).mtimeMs;
      if (current !== mtime) { cached = readCodexProjects(file, scopes); mtime = current; }
    } catch { cached = []; mtime = -1; }
    return cached;
  };
}
