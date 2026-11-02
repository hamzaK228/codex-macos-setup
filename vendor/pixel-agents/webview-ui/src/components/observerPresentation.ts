export function observerGroup(status: string): 'active' | 'waiting' | 'history' {
  if (status === 'working') return 'active';
  if (status === 'stopped' || status === 'ended' || status === 'interrupted') return 'history';
  return 'waiting';
}

export function observerCurrentReport(status: string, connected: boolean, current?: string): string {
  if (!connected || status === 'disconnected') return 'Нет связи — выполнение не подтверждено';
  if (status === 'permission') return 'Ждёт вашего разрешения в Codex';
  if (observerGroup(status) === 'history') return 'Сейчас не выполняется';
  return current?.trim() || 'Пока неизвестно';
}

export function observerHistoryNotice(status: string, hasReport: boolean): string {
  const state = status === 'stopped' ? 'Ход агента завершён.' : status === 'interrupted' ? 'Работа агента прервана.' : 'Сеанс агента завершён.';
  return `${state} ${hasReport ? 'Последний отчёт показан ниже.' : 'Агент ещё не передал отчёт.'}`;
}
