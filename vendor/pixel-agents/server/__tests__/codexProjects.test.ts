import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { createCodexObserverServer } from '../src/codexObserverServer.js';
import { cachedCodexProjects, readCodexProjects } from '../src/codexProjects.js';

const temporary: string[] = [];
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codex-projects-')); temporary.push(root);
  const jan = path.join(root, 'Jan platform'); const sat = path.join(root, 'SAThack');
  mkdirSync(jan); mkdirSync(sat);
  const file = path.join(root, 'state.json');
  const state = { 'local-projects': { jan: { name: 'Jan platform', rootPaths: [jan] }, sat: { name: 'SAThack', rootPaths: [sat] }, hidden: { name:'not-visible',rootPaths:[root] } }, 'project-order': ['jan'], 'pinned-project-ids': ['sat'], 'queued-prompts': 'PRIVATE_CONTENT' };
  writeFileSync(file, JSON.stringify(state)); return { root, file, state, jan };
}
afterEach(() => { for (const root of temporary.splice(0)) rmSync(root,{recursive:true,force:true}); });
it('discovers real visible/pinned projects without source content or paths', () => {
  const f=fixture(); const projects=readCodexProjects(f.file,[f.root]);
  expect(projects.map(p=>p.projectName)).toEqual(['Jan platform','SAThack']);
  expect(projects[0].projectId).toBe(createHash('sha256').update(f.jan).digest('hex'));
  expect(JSON.stringify(projects)).not.toContain(f.root); expect(JSON.stringify(projects)).not.toContain('PRIVATE');
  expect(readCodexProjects(f.file,[f.jan])).toHaveLength(1);
});
it('fails empty for malformed, missing or oversized metadata and caches bounded reads', () => {
  const f=fixture(); let now=1;const load=cachedCodexProjects(f.file,[f.root],()=>now);
  expect(load()).toHaveLength(2); writeFileSync(f.file,'{');expect(load()).toHaveLength(2);
  now+=16_000;expect(load()).toEqual([]);
  writeFileSync(f.file,'x'.repeat(4*1024*1024+1));expect(readCodexProjects(f.file,[f.root])).toEqual([]);
  expect(readCodexProjects(path.join(f.root,'missing'),[f.root])).toEqual([]);
});
it('reports empty project metadata over authenticated API without creating live agents', async () => {
  const f=fixture();const app=await createCodexObserverServer({token:'test-only-token-for-projects',scopes:[f.root],projectInventory:()=>readCodexProjects(f.file,[f.root])});
  try {
    const response=await app.app.inject({url:'/api/observer/status',headers:{authorization:'Bearer test-only-token-for-projects'}});
    expect(response.json().projects).toHaveLength(2);expect(response.json().projects[0].status).toBe('no-events');
    expect(response.json().agents).toEqual([]);expect(response.json().acceptedEvents).toBe(0);
    expect((await app.app.inject({url:'/api/observer/status'})).statusCode).toBe(401);
  } finally {await app.app.close();}
});
