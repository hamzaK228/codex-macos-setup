export const TASK_STORAGE_KEY = 'pixel-office.content.v1';
export const MAX_TASK_ITEMS = 300;
export const taskStatuses = { planned: 'Запланировано', in_progress: 'Выполняется', review: 'На проверке', done: 'Готово' } as const;
export interface TaskItem {
  id: string;
  projectId: string;
  title: string;
  description: string;
  date: string;
  time: string;
  assignee: string;
  tags: string[];
  status: keyof typeof taskStatuses;
  result: string;
}
export interface TaskStore { version: 2; items: TaskItem[] }
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && localDate(date) === value;
}
function boundedText(value: unknown, max: number, required = false): value is string {
  return typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
}
export function validTaskItem(value: unknown): value is TaskItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as TaskItem;
  return boundedText(item.id, 80, true) && boundedText(item.projectId, 256, true)
    && boundedText(item.title, 160, true) && boundedText(item.description, 4000)
    && boundedText(item.result, 4000) && boundedText(item.assignee, 160)
    && (item.date === '' || validDate(item.date))
    && typeof item.time === 'string' && (item.time === '' || (item.date !== '' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.time)))
    && Array.isArray(item.tags) && item.tags.length <= 12 && item.tags.every((tag) => boundedText(tag, 40, true))
    && typeof item.status === 'string' && Object.hasOwn(taskStatuses, item.status);
}
const legacyChannels = { instagram: ['Instagram'], tiktok: ['TikTok'], both: ['Instagram', 'TikTok'] } as const;
const legacyStatuses = { idea: 'planned', draft: 'in_progress', review: 'review', ready: 'done' } as const;
function migrateLegacyItem(value: unknown): TaskItem {
  if (!value || typeof value !== 'object') throw new Error('Неверная задача в сохранённом плане.');
  const item = value as Record<string, unknown>;
  if (typeof item.channel !== 'string' || !Object.hasOwn(legacyChannels, item.channel)
    || typeof item.status !== 'string' || !Object.hasOwn(legacyStatuses, item.status)) {
    throw new Error('Неверный формат старого контент-плана.');
  }
  const migrated = { id: item.id, projectId: item.projectId, title: item.title, date: item.date,
    description: '', time: '', assignee: '', result: '',
    tags: [...legacyChannels[item.channel as keyof typeof legacyChannels]],
    status: legacyStatuses[item.status as keyof typeof legacyStatuses] };
  if (!validTaskItem(migrated)) throw new Error('Неверная задача в сохранённом плане.');
  return migrated;
}
export function parseTaskStore(raw: string | null): TaskStore {
  if (raw === null) return { version: 2, items: [] };
  if (raw.length > 512_000) throw new Error('Слишком большой файл задач.');
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('Неверный формат плана задач.');
  const store = value as { version?: unknown; items?: unknown };
  if ((store.version !== 1 && store.version !== 2) || !Array.isArray(store.items) || store.items.length > MAX_TASK_ITEMS) {
    throw new Error('Не удалось прочитать сохранённые задачи.');
  }
  const items: TaskItem[] = store.version === 1 ? store.items.map(migrateLegacyItem) : store.items.map((item: unknown) => {
    if (!validTaskItem(item)) throw new Error('Неверная задача в сохранённом плане.');
    const { id, projectId, title, description, date, time, assignee, tags, status, result } = item;
    return { id, projectId, title, description, date, time, assignee, tags: [...tags], status, result };
  });
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error('Повторяющиеся задачи в плане.');
  return { version: 2, items };
}
export function weekDates(anchor: string): string[] {
  if (!validDate(anchor)) return [];
  const date = new Date(`${anchor}T12:00:00`);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(date);
    day.setDate(day.getDate() + offset);
    return localDate(day);
  });
}
export function moveWeek(anchor: string, offset: number): string {
  const date = new Date(`${anchor}T12:00:00`);
  date.setDate(date.getDate() + offset * 7);
  return localDate(date);
}
