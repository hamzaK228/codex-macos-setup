import './contentWorkspace.css';

import type { FormEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

import type { TaskItem, TaskStore } from './contentWorkspaceModel.js';
import { localDate, MAX_TASK_ITEMS, moveWeek, parseTaskStore, TASK_STORAGE_KEY, taskStatuses, validTaskItem, weekDates } from './contentWorkspaceModel.js';
import { notificationRequest } from './notificationsApi.js';

interface Props { projectId?: string | null; projectName?: string }
type Draft = Omit<TaskItem, 'id' | 'projectId' | 'tags'> & { tagsText: string };
const emptyDraft = (): Draft => ({ title: '', description: '', date: '', time: '', assignee: '', tagsText: '', status: 'planned', result: '' });
function readStore(): { store: TaskStore; error: string } {
  try { return { store: parseTaskStore(localStorage.getItem(TASK_STORAGE_KEY)), error: '' }; }
  catch { return { store: { version: 2, items: [] }, error: 'Не удалось открыть сохранённые задачи. Проверьте доступ к хранилищу браузера. Существующие данные не изменены.' }; }
}
function dateLabel(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString('ru', { day: 'numeric', month: 'long' }); }
export function ContentWorkspace({ projectId, projectName }: Props) {
  return <section className="content-workspace" aria-label="Задачи и календарь">
    <header className="content-heading"><h2>Задачи</h2><p>{projectName ? `План проекта ${projectName}` : 'Выберите комнату проекта, чтобы открыть его план.'}</p></header>
    {projectId ? <ProjectTasks key={projectId} projectId={projectId} /> : <p className="content-empty">У каждого проекта свой календарь и список любых задач.</p>}
  </section>;
}
function ProjectTasks({ projectId }: { projectId: string }) {
  const [initial] = useState(readStore);
  const [store, setStore] = useState(initial.store);
  const [error, setError] = useState(initial.error);
  const [saved, setSaved] = useState('');
  const [reminderError, setReminderError] = useState('');
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [anchor, setAnchor] = useState(localDate);
  const [filter, setFilter] = useState('');
  const addRef = useRef<HTMLButtonElement>(null);
  const formId = useId();
  useEffect(() => {
    if (initial.error) return;
    let live = true;
    const tasks = store.items.filter((item) => item.projectId === projectId && item.date).map((item) => ({ id: item.id, title: item.title, dueAt: new Date(`${item.date}T${item.time || '09:00'}:00`).getTime(), status: item.status }));
    void notificationRequest('tasks', { projectId, tasks }).then(() => { if (live) setReminderError(''); }).catch(() => { if (live) setReminderError('План сохранён в браузере, но напоминания не синхронизированы. Откройте проект снова после восстановления локального сервиса.'); });
    return () => { live = false; };
  }, [store, projectId, initial.error]);

  const days = weekDates(anchor);
  const items = store.items.filter((item) => item.projectId === projectId);
  const queue = items.filter((item) => !filter || item.status === filter).sort((a, b) => `${a.date || '9999'} ${a.time}`.localeCompare(`${b.date || '9999'} ${b.time}`));
  function closeForm() { setFormOpen(false); setEditing(null); setDraft(emptyDraft()); addRef.current?.focus(); }
  function persist(item: TaskItem | null, deleteId?: string) {
    try {
      // Re-read before writing: preserve other projects and migrate legacy records together.
      const latest = parseTaskStore(localStorage.getItem(TASK_STORAGE_KEY));
      const next = { version: 2 as const, items: latest.items.filter((old) => old.id !== (item?.id ?? deleteId)) };
      if (item) next.items.push(item);
      const validated = parseTaskStore(JSON.stringify(next));
      localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(validated));
      setStore(validated); setError(''); setSaved('Сохранено в этом браузере');
      return true;
    } catch { setSaved(''); setError('Не удалось сохранить задачи. Проверьте свободное место и доступ к хранилищу браузера. Введённые данные остаются на экране.'); return false; }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const { tagsText, ...fields } = draft;
    const item: TaskItem = { ...fields, title: fields.title.trim(), assignee: fields.assignee.trim(), tags: [...new Set(tagsText.split(',').map((tag) => tag.trim()).filter(Boolean))], id: editing ?? crypto.randomUUID(), projectId };
    if (!validTaskItem(item)) { setError('Проверьте поля: название до 160 символов, не более 12 меток по 40 символов. Для времени укажите дату.'); return; }
    if (!editing && store.items.length >= MAX_TASK_ITEMS) { setError('Сохранено 300 задач. Удалите ненужные, чтобы добавить новую.'); return; }
    if (persist(item)) closeForm();
  }
  function edit(item: TaskItem) {
    setDraft({ title: item.title, description: item.description, date: item.date, time: item.time, assignee: item.assignee, tagsText: item.tags.join(', '), status: item.status, result: item.result });
    setEditing(item.id); setFormOpen(true); setSaved('');
  }
  return <>
    <p className="content-caption">Любые дела и встречи. Запись в плане не запускает агента.</p>
    {error && <p className="content-error" role="alert">{error}</p>}
    {reminderError && <p className="content-error" role="status">{reminderError}</p>}
    <p className="content-saved" role="status">{saved}</p>
    <div className="content-toolbar"><h3>На неделю</h3><button ref={addRef} type="button" onClick={() => { setFormOpen(true); setEditing(null); setDraft(emptyDraft()); setSaved(''); }}>Добавить задачу</button></div>
    <div className="content-week-nav"><button type="button" aria-label="Предыдущая неделя" onClick={() => setAnchor(moveWeek(anchor, -1))}>Назад</button><span>{new Date(`${days[0]}T12:00:00`).toLocaleDateString('ru', { day: 'numeric', month: 'short' })} — {new Date(`${days[6]}T12:00:00`).toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' })}</span><button type="button" aria-label="Следующая неделя" onClick={() => setAnchor(moveWeek(anchor, 1))}>Дальше</button></div>
    <ol className="content-week" aria-label="Календарь недели">{days.map((day) => <li key={day} data-today={day === localDate()}><time dateTime={day}>{new Date(`${day}T12:00:00`).toLocaleDateString('ru', { weekday: 'short', day: 'numeric' })}</time>{items.filter((item) => item.date === day).sort((a, b) => a.time.localeCompare(b.time)).map((item) => <button type="button" key={item.id} onClick={() => edit(item)}>{item.time && <span>{item.time} · </span>}{item.title}<small>{taskStatuses[item.status]}</small></button>)}{!items.some((item) => item.date === day) && <span className="content-day-empty">Нет планов</span>}</li>)}</ol>
    {formOpen && <form className="content-form" onSubmit={submit} aria-label={editing ? 'Редактирование задачи' : 'Новая задача'}>
      <h3>{editing ? 'Редактировать задачу' : 'Новая задача'}</h3><p className="content-caption">Обязательно только название.</p>
      <label htmlFor={`${formId}-title`}>Название<input autoFocus id={`${formId}-title`} required maxLength={160} value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} placeholder="Что нужно сделать? Любая задача" /></label>
      <div className="content-form-fields"><label htmlFor={`${formId}-date`}>Дата · необязательно<input id={`${formId}-date`} type="date" value={draft.date} onChange={(event) => setDraft((value) => ({ ...value, date: event.target.value, time: event.target.value ? value.time : '' }))} /></label>
      <label htmlFor={`${formId}-time`}>Время · необязательно<input id={`${formId}-time`} type="time" value={draft.time} onChange={(event) => setDraft((value) => ({ ...value, time: event.target.value }))} /><small>По времени вашего устройства</small></label>
      <label htmlFor={`${formId}-status`}>Статус в плане<select id={`${formId}-status`} value={draft.status} onChange={(event) => setDraft((value) => ({ ...value, status: event.target.value as Draft['status'] }))}>{Object.entries(taskStatuses).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label></div>
      <details className="task-extra-fields" open={editing !== null}><summary>Описание, ответственный, метки и результат</summary>
      <label htmlFor={`${formId}-description`}>Описание · необязательно<textarea id={`${formId}-description`} maxLength={4000} rows={3} value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} placeholder="Подробности, требования и ссылки" /></label>
      <div className="task-form-pair"><label htmlFor={`${formId}-assignee`}>Ответственный · необязательно<input id={`${formId}-assignee`} maxLength={160} value={draft.assignee} onChange={(event) => setDraft((value) => ({ ...value, assignee: event.target.value }))} placeholder="Ваше имя или роль агента" /></label>
      <label htmlFor={`${formId}-tags`}>Свои метки · через запятую<input id={`${formId}-tags`} maxLength={600} value={draft.tagsText} onChange={(event) => setDraft((value) => ({ ...value, tagsText: event.target.value }))} placeholder="Например: БД, встреча, личное" /></label></div>
      <label htmlFor={`${formId}-result`}>Результат · необязательно<textarea id={`${formId}-result`} maxLength={4000} rows={3} value={draft.result} onChange={(event) => setDraft((value) => ({ ...value, result: event.target.value }))} placeholder="Что сделано, ссылка на результат или выводы" /></label>
      </details>
      <div className="content-form-actions"><button type="submit">Сохранить задачу</button><button type="button" onClick={closeForm}>Отмена</button></div>
    </form>}
    <div className="content-queue-heading"><h3>Все задачи <span>{items.length}</span></h3><label htmlFor={`${formId}-filter`}>Статус<select id={`${formId}-filter`} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">Все статусы</option>{Object.entries(taskStatuses).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label></div>
    {!queue.length && <p className="content-empty">{items.length ? 'С этим статусом пока нет задач.' : 'Добавьте любую задачу. Дата, ответственный и метки необязательны — можно начать только с названия.'}</p>}
    <ul className="content-queue">{queue.map((item) => <li key={item.id}><div className="task-item-body"><strong>{item.title}</strong><p>{item.date ? dateLabel(item.date) : 'Без даты'}{item.time ? ` в ${item.time}` : ''} · <span>{taskStatuses[item.status]}</span>{item.assignee ? ` · ${item.assignee}` : ''}</p>{item.tags.length > 0 && <p className="task-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</p>}{(item.description || item.result) && <details className="task-details"><summary>Описание и результат</summary>{item.description && <p className="task-text">{item.description}</p>}{item.result && <div><h4>Результат</h4><p className="task-text">{item.result}</p></div>}</details>}</div><div className="content-item-actions"><button type="button" aria-label={`Изменить: ${item.title}`} onClick={() => edit(item)}>Изменить</button>{deleting === item.id ? <><button type="button" onClick={() => { if (persist(null, item.id)) { setDeleting(null); addRef.current?.focus(); } }}>Удалить окончательно</button><button type="button" onClick={() => setDeleting(null)}>Оставить</button></> : <button type="button" aria-label={`Удалить: ${item.title}`} onClick={() => setDeleting(item.id)}>Удалить</button>}</div></li>)}</ul>
    <details className="task-storage-help"><summary>Где хранятся задачи и как получать напоминания</summary><p>План хранится в этом браузере. Названия и сроки дополнительно сохраняются в локальном сервисе. Напоминания включаются в разделе «Уведомления». Автоматическое выполнение задач не подключено.</p></details>
  </>;
}
