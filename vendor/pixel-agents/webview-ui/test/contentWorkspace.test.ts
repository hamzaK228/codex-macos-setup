import { describe, expect, it } from 'vitest';

import { MAX_TASK_ITEMS, moveWeek, parseTaskStore, TASK_STORAGE_KEY, type TaskItem, validDate, validTaskItem, weekDates } from '../src/components/contentWorkspaceModel.js';

const legacy = { id: 'one', projectId: 'project-a', title: 'First idea', channel: 'both', date: '2026-11-01', status: 'idea' };
const task: TaskItem = { id: 'one', projectId: 'project-a', title: 'Обновить БД', description: 'Проверить резервную копию', date: '2026-11-01', time: '10:30', assignee: 'Backend', tags: ['БД', 'Свой тип'], status: 'planned', result: '' };
const store = (items: unknown[], version = 2) => JSON.stringify({ version, items });
describe('universal tasks persistence', () => {
  it('keeps the existing storage location and starts empty without seeded tasks', () => {
    expect(TASK_STORAGE_KEY).toBe('pixel-office.content.v1');
    expect(parseTaskStore(null)).toEqual({ version: 2, items: [] });
  });
  it('migrates every legacy status and channel without losing task identity', () => {
    const entries = ['idea', 'draft', 'review', 'ready'].map((status, i) => ({ ...legacy, id: String(i), status, channel: i === 1 ? 'instagram' : i === 2 ? 'tiktok' : 'both' }));
    const migrated = parseTaskStore(store(entries, 1));
    expect(migrated.version).toBe(2);
    expect(migrated.items.map((item) => item.status)).toEqual(['planned', 'in_progress', 'review', 'done']);
    expect(migrated.items.map((item) => item.tags)).toEqual([['Instagram', 'TikTok'], ['Instagram'], ['TikTok'], ['Instagram', 'TikTok']]);
    expect(migrated.items[0]).toEqual({ id: '0', projectId: legacy.projectId, title: legacy.title, date: legacy.date, time: '', description: '', assignee: '', result: '', tags: ['Instagram', 'TikTok'], status: 'planned' });
  });
  it('round-trips arbitrary tasks with project isolation and no category requirement', () => {
    const first = { ...task, tags: [] };
    const saved = parseTaskStore(store([first, { ...task, id: 'two', projectId: 'project-b', title: 'Встреча' }]));
    expect(saved.items.filter((entry) => entry.projectId === 'project-a')).toEqual([first]);
    expect(parseTaskStore(JSON.stringify(saved))).toEqual(saved);
  });
  it('rejects entire corrupt stores rather than silently dropping records', () => {
    for (const raw of ['{', 'null', store([], 3), store([task, task]), store([legacy, { ...legacy, channel: 'unknown' }], 1), store([task, { ...task, id: 'two', description: null }]), 'x'.repeat(512_001)]) expect(() => parseTaskStore(raw)).toThrow();
    expect(() => parseTaskStore(store(Array.from({ length: MAX_TASK_ITEMS + 1 }, (_, id) => ({ ...task, id: String(id) }))))).toThrow();
    expect(() => parseTaskStore(store([legacy, legacy], 1))).toThrow();
  });
  it('accepts field boundaries and rejects oversized, missing or invalid fields', () => {
    expect(validTaskItem({ ...task, title: 'x'.repeat(160), description: 'x'.repeat(4000), result: 'x'.repeat(4000), assignee: 'x'.repeat(160), tags: Array(12).fill('x'.repeat(40)) })).toBe(true);
    for (const patch of [{ id: '' }, { projectId: '' }, { title: ' ' }, { title: 'x'.repeat(161) }, { description: 'x'.repeat(4001) }, { result: 'x'.repeat(4001) }, { assignee: 'x'.repeat(161) }, { tags: Array(13).fill('tag') }, { tags: ['x'.repeat(41)] }, { tags: [' '] }, { tags: [12] }, { tags: 'tag' }, { description: undefined }, { status: '__proto__' }, { status: 'ready' }]) expect(validTaskItem({ ...task, ...patch })).toBe(false);
  });
  it('requires real calendar dates and valid optional local time with a date', () => {
    expect(validTaskItem({ ...task, date: '', time: '' })).toBe(true);
    expect(validTaskItem({ ...task, time: '00:00' })).toBe(true);
    expect(validTaskItem({ ...task, time: '23:59' })).toBe(true);
    for (const patch of [{ date: '2026-02-30' }, { date: '', time: '12:00' }, { time: '24:00' }, { time: '09:60' }, { time: '9:30' }, { time: null }]) expect(validTaskItem({ ...task, ...patch })).toBe(false);
    expect(validDate('2028-02-29')).toBe(true);
    expect(validDate('2026-02-29')).toBe(false);
  });
  it('builds local weeks across month and year boundaries', () => {
    expect(weekDates('2026-11-01')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    expect(weekDates('2027-01-01')[0]).toBe('2026-12-28');
    expect(moveWeek('2026-12-28', 1)).toBe('2027-01-04');
    expect(weekDates('bad')).toEqual([]);
  });
});
