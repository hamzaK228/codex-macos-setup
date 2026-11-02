import './agencyCatalog.css';

import { useId, useState } from 'react';

import { agencyCatalog, filterAgencyCatalog } from '../agencyCatalog.js';
import type { ObserverAgent } from '../hooks/useObserverStatus.js';

const PAGE_SIZE = 30;
const categories = [...new Map(agencyCatalog.map((role) => [role.category, role.categoryLabel])).entries()]
  .sort((a, b) => a[1].localeCompare(b[1], 'ru'));

export function AgencyCatalog({ agents, connected }: { agents: readonly ObserverAgent[]; connected: boolean }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const filtered = filterAgencyCatalog(query, category);
  const shown = filtered.slice(0, limit);
  const counts = new Map<string, number>();
  if (connected) {
    for (const agent of agents) {
      if (agent.role && agent.status !== 'ended' && agent.status !== 'disconnected') {
        counts.set(agent.role, (counts.get(agent.role) ?? 0) + 1);
      }
    }
  }

  return <details className="observer-technical agency-catalog">
    <summary>Каталог Agency · {agencyCatalog.length} ролей</summary>
    <p className="agency-catalog-note">Установленные профили для выбора команды. Агенты появляются в офисе после фактического запуска в Codex.</p>
    <div className="agency-catalog-filters">
      <label htmlFor={`${id}-search`}>Найти роль</label>
      <input id={`${id}-search`} type="search" value={query} placeholder="Например: аналитик, юрист, finance" onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} />
      <label htmlFor={`${id}-category`}>Направление</label>
      <select id={`${id}-category`} value={category} onChange={(event) => { setCategory(event.target.value); setLimit(PAGE_SIZE); }}>
        <option value="">Все направления</option>
        {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    <p className="agency-catalog-count" role="status">Найдено: {filtered.length} из {agencyCatalog.length} · показано: {shown.length}</p>
    {shown.length ? <ul className="agency-catalog-list">{shown.map((role) => <li key={role.id}>
      <strong>{role.name}</strong>
      <span className="agency-catalog-category">{role.categoryLabel}</span>
      <p>{role.description}</p>
      {(counts.get(role.id) ?? 0) > 0 && <p className="agency-catalog-observed">В офисе с этой ролью: {counts.get(role.id)}</p>}
    </li>)}</ul> : <p className="agency-catalog-empty">Ничего не найдено. Попробуйте другое название или выберите все направления.</p>}
    {shown.length < filtered.length && <button className="agency-catalog-more" onClick={() => setLimit(limit + PAGE_SIZE)}>Показать ещё {Math.min(PAGE_SIZE, filtered.length - shown.length)}</button>}
    {!connected && <p className="agency-catalog-note">Связь с наблюдателем отсутствует. Текущее присутствие агентов не подтверждено.</p>}
  </details>;
}
