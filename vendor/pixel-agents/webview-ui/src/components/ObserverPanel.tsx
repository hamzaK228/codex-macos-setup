import { roleLabel } from '../agencyCatalog.js';
import type { ObserverAgent, ObserverSnapshot } from '../hooks/useObserverStatus.js';
import type { TransportState } from '../transport/types.js';
import { AgencyCatalog } from './AgencyCatalog.js';
import { agentDisplayName } from './observerDisplay.js';
import { observerGroup } from './observerPresentation.js';

const noResidentIds: ReadonlySet<number> = new Set();

const observerStatus: Record<ObserverAgent['status'], string> = {
  idle: 'Ждёт', working: 'Работает', permission: 'Нужно разрешение',
  stopped: 'Завершил', interrupted: 'Прерван', ended: 'Завершил', disconnected: 'Нет связи',
};

function timeLabel(value: string | number): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Время неизвестно' : date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function eventLabel(name: string): string {
  const labels: Record<string, string> = {
    SessionStart: 'Сеанс начат', SessionEnd: 'Сеанс завершён', UserPromptSubmit: 'Получен запрос',
    PreToolUse: 'Вызов инструмента', PostToolUse: 'Инструмент завершён', PostToolUseFailure: 'Ошибка инструмента',
    Stop: 'Ход завершён', SubagentStart: 'Агент подключён', SubagentStop: 'Агент завершил ход',
    Notification: 'Изменение состояния', PermissionRequest: 'Запрошено разрешение',
  };
  return labels[name] ?? name;
}

function currentAction(agent: ObserverAgent): string {
  switch (agent.status) {
    case 'working': return agent.activeToolCount > 0 ? 'Выполняет действие по задаче' : 'Обрабатывает задачу';
    case 'permission': return 'Ждёт вашего разрешения в Codex';
    case 'idle': return 'Ждёт новую задачу';
    case 'stopped': return 'Завершил текущий ответ';
    case 'ended': return 'Этот сеанс завершён';
    case 'interrupted': return 'Работа была прервана';
    case 'disconnected': return 'Давно нет событий. Состояние неизвестно';
  }
}

export function ObserverPanel({ snapshot, connection, selectedId, residentIds = noResidentIds, projectId, onProjectChange, onSelect }: {
  snapshot: ObserverSnapshot;
  connection: TransportState;
  selectedId: number | null;
  residentIds?: ReadonlySet<number>;
  projectId: string | null;
  onProjectChange: (id: string) => void;
  onSelect: (id: number) => void;
}) {
  const project = projectId ?? '';
  const projects = [...new Map([...(snapshot.projects ?? []).map((p) => [p.projectId, p.projectName] as const), ...snapshot.agents.map((a) => [a.projectId ?? a.projectName ?? '', a.projectName ?? 'Без проекта'] as const)]).entries()];
  const visible = snapshot.agents.filter((a) => !project || (a.projectId ?? a.projectName ?? '') === project);
  const connected = connection === 'connected';
  const active = connected ? visible.filter((agent) => observerGroup(agent.status) === 'active') : [];
  const attention = connected ? visible.filter((agent) => agent.status === 'permission') : [];
  const waiting = visible.filter((agent) => observerGroup(agent.status) !== 'history' && (!connected || (observerGroup(agent.status) === 'waiting' && agent.status !== 'permission')));
  const history = visible.filter((agent) => observerGroup(agent.status) === 'history');
  const visibleIds = new Set(visible.map((agent) => agent.id));
  const activity = (snapshot.activity ?? []).filter((event) => !project || visibleIds.has(event.agentId)).slice(-8).reverse();

  return (
    <details className="observer-panel" open>
      <summary className="observer-panel-toggle">Команда <span>{connected ? `Работают: ${active.length}` : 'Нет связи'}</span><span className="observer-toggle-hint">показать / скрыть</span></summary>
      <section className="observer-panel-content" aria-label="Наблюдение за командой Codex">
        <header className="observer-header">
          <h1>Команда</h1>
          <p className="observer-connection" data-connected={connected}><span className="observer-dot" />{connected ? 'Подключено' : connection === 'connecting' ? 'Подключаемся…' : connection === 'reconnecting' ? 'Восстанавливаем связь…' : 'Нет подключения'}</p>
          <p className="observer-guide">Нажмите на агента — откроется его задача и отчёт.</p>
        </header>
        {!connected && <p className="observer-notice" role="status">Показаны последние полученные данные. Подключение восстановится автоматически.</p>}
        <div className="observer-filter">
          <label htmlFor="observer-project">Проект</label>
          <select id="observer-project" value={project} onChange={(event) => onProjectChange(event.target.value)}>
            <option value="">Все проекты</option>
            {projects.filter(([id]) => id).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        <div className="observer-roster">
          {visible.length === 0 && <p className="observer-empty">{project ? 'Начните задачу в Codex — агент появится здесь.' : 'Начните задачу в Codex — команда появится здесь.'}</p>}
          {[
            { key: 'attention', title: 'Нужна ваша помощь', members: attention },
            { key: 'active', title: 'Сейчас работают', members: active },
            { key: 'waiting', title: connected ? 'Ожидают задачи / нет связи' : 'Последние данные · нет связи', members: waiting },
            { key: 'history', title: 'История', members: history },
          ].map(({ key, title, members }) => {
            if (key === 'active' && !connected) return null;
            if ((key === 'attention' || key === 'waiting') && !members.length) return null;
            const roster = <section className={`observer-project ${key === 'attention' ? 'observer-needs-help' : ''}`} aria-label={title}>
              {key !== 'history' && <h2>{title} <span>{members.length}</span></h2>}
              {!members.length && key !== 'history' && <p className="observer-empty">Сейчас никто не работает.</p>}
              <ul>
                {members.map((agent) => {
                  return <li className="observer-agent-entry" key={agent.id}>
                    <button className="observer-agent" aria-pressed={selectedId === agent.id} onClick={() => onSelect(agent.id)}>
                      <span className="observer-agent-title"><strong>{agentDisplayName(agent, residentIds.has(agent.id))}</strong><span className="observer-focus-hint">{selectedId === agent.id ? 'Открыт' : 'Подробнее'}</span></span>
                      <span className="observer-agent-state" data-status={connected ? agent.status : 'disconnected'}><span className="observer-dot" />{connected ? observerStatus[agent.status] : 'Нет связи'}</span>
                      <span className="observer-action">{agent.projectName ?? 'Без проекта'}</span>
                      <span className="observer-action observer-task-preview">{!connected ? 'Показано последнее известное состояние' : key === 'active' ? agent.work?.current?.trim() || currentAction(agent) : key === 'history' ? agent.work?.done?.trim() || currentAction(agent) : currentAction(agent)}</span>
                    </button>

                  </li>;
                })}
              </ul>
            </section>;
            return key === 'history' ? <details className="observer-history" key={key}><summary>{title} <span>{members.length}</span></summary><p className="observer-caption">Хранятся до 200 завершённых агентов за последний час.</p>{roster}</details> : <div key={key}>{roster}</div>;
          })}
        </div>
        <details className="observer-more">
          <summary>Подробнее</summary>
          <p className="observer-caption">Роли, связи между агентами и история работы.</p>
          <section className="observer-activity" aria-label="Роли и команда">
            <h2>Кто чем занимается</h2>
            <ul className="observer-role-list">{visible.map((agent) => {
              const parent = snapshot.agents.find((a) => a.id === agent.parentAgentId);
              return <li key={agent.id}><strong>{agentDisplayName(agent, residentIds.has(agent.id))}</strong> — {agent.role ? roleLabel(agent.role) : 'Роль неизвестна'}{parent && <p>Помогает: {agentDisplayName(parent, residentIds.has(parent.id))}</p>}</li>;
            })}</ul>
          </section>
        <section className="observer-activity" aria-label="Последние события">
          <h2>Последние события</h2>
          <p className="observer-caption">Метаданные сеансов и инструментов</p>
          {activity.length ? <ol>{activity.map((event, index) => <li key={`${event.timestamp}-${event.agentId}-${index}`}>
            <time dateTime={Number.isNaN(new Date(event.timestamp).getTime()) ? undefined : new Date(event.timestamp).toISOString()}>{timeLabel(event.timestamp)}</time>
            <span><strong>{(() => { const agent = snapshot.agents.find((a) => a.id === event.agentId); return agent ? agentDisplayName(agent, residentIds.has(agent.id)) : `Агент #${event.agentId}`; })()}</strong><br />{eventLabel(event.eventName)}{event.toolName ? ` · ${event.toolName}` : ''}</span>
          </li>)}</ol> : <p className="observer-empty">История появится с новыми событиями.</p>}
        </section>
        <AgencyCatalog agents={snapshot.agents} connected={connected} />
        <details className="observer-technical">
          <summary>Технические сведения</summary>
          <p>Принято: {snapshot.acceptedEvents} · Повторы: {snapshot.duplicateEvents} · Вне порядка: {snapshot.outOfOrderEvents} · Отклонено: {snapshot.rejectedEvents}</p>
          {snapshot.lastEvent && <p>Последнее событие: {snapshot.lastEvent.eventName}<br />{snapshot.lastEvent.eventId}</p>}
          {snapshot.agents.map((agent) => <div key={agent.id}><strong>{agentDisplayName(agent, residentIds.has(agent.id))}</strong><p>Имя источника: {agent.name}<br />ID: {agent.id} · Инструменты: {agent.activeToolCount}<br />Сеанс: {agent.sourceSessionId}<br />Агент: {agent.sourceAgentId ?? '—'}<br />Родитель: {agent.parentAgentId ?? '—'}<br />Атрибуция: {agent.attribution}<br />Событие: {timeLabel(agent.lastEventAt)}</p></div>)}
        </details>
        </details>
      </section>
    </details>
  );
}
