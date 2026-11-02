import { useEffect, useRef } from 'react';

import { roleLabel } from '../agencyCatalog.js';
import type { ObserverAgent } from '../hooks/useObserverStatus.js';
import { agentDisplayName } from './observerDisplay.js';
import { observerCurrentReport, observerGroup, observerHistoryNotice } from './observerPresentation.js';

const statuses: Record<ObserverAgent['status'], string> = {
  idle: 'Ждёт новую задачу', working: 'Работает', permission: 'Нужно разрешение',
  stopped: 'Ход завершён', interrupted: 'Работа прервана', ended: 'Сеанс завершён', disconnected: 'Нет связи',
};

export function ObserverInspector({ agent, connected, resident = false, onDismiss }: {
  agent: ObserverAgent; connected: boolean; resident?: boolean; onDismiss: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [agent.id]);
  const inactive = observerGroup(agent.status) === 'history';
  const stale = !connected || agent.status === 'disconnected';
  const work = agent.work;
  const current = observerCurrentReport(agent.status, connected, work?.current);
  const updated = work && Number.isFinite(work.updatedAt) ? new Date(work.updatedAt) : null;
  return <section className="observer-inspector" role="dialog" aria-modal="false" aria-labelledby="observer-inspector-title" onKeyDown={(event) => {
    if (event.key === 'Escape') { event.stopPropagation(); onDismiss(); }
  }}>
    <header>
      <div><p className="observer-inspector-eyebrow">Подробности агента</p><h2 id="observer-inspector-title">{agentDisplayName(agent, resident)}</h2></div>
      <button ref={closeRef} type="button" aria-label="Закрыть подробности агента" onClick={onDismiss}>×</button>
    </header>
    <dl className="observer-inspector-meta">
      <div><dt>Проект</dt><dd>{agent.projectName || 'Проект неизвестен'}</dd></div>
      <div><dt>Роль</dt><dd>{agent.role ? roleLabel(agent.role) : 'Роль неизвестна'}</dd></div>
      <div><dt>Статус</dt><dd>{stale ? 'Нет связи · последние данные' : resident && inactive ? `Ожидает новой задачи · источник: ${statuses[agent.status]}` : statuses[agent.status]}</dd></div>
    </dl>
    {inactive && <p className="observer-inspector-notice">{observerHistoryNotice(agent.status, !!work)}</p>}
    <div className="observer-work-report">
      <p className="observer-report-caption">Отчёт агента{updated && !Number.isNaN(updated.getTime()) && <time dateTime={updated.toISOString()}>{updated.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</time>}</p>
      <dl className="observer-work-lines">
        <div><dt>Сделал</dt><dd>{work?.done?.trim() || 'Пока нет отчёта'}</dd></div>
        <div><dt>Делает</dt><dd>{current}</dd></div>
        <div><dt>Дальше</dt><dd>{work?.next?.trim() || 'Пока неизвестно'}</dd></div>
      </dl>
      <p className="observer-report-note">«Дальше» — план агента, он может измениться.</p>
    </div>
  </section>;
}
