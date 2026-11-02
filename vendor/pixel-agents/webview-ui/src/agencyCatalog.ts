import catalog from './agencyCatalog.generated.js';

export interface AgencyRole {
  id: string;
  name: string;
  description: string;
  category: string;
  categoryLabel: string;
  sourcePath: string;
  sourceUrl: string;
  keywords?: string[];
}

/** Installed profiles are available choices, not evidence of a running agent. */
export const agencyCatalog: readonly AgencyRole[] = catalog;

// Existing sessions may still report the original curated role identities.
const legacyLabels: Record<string, string> = {
  agency_principal: 'Руководитель', agency_product: 'Продукт',
  agency_frontend: 'Фронтенд', agency_backend: 'Бэкенд', agency_ui: 'UI-дизайнер',
  agency_ux: 'UX-исследователь', agency_reviewer: 'Ревьюер', agency_qa: 'Тестировщик',
  agency_marketing: 'Маркетолог', agency_content: 'Редактор', agency_smm: 'SMM',
  agency_media: 'Медиа', agency_video: 'Видео', agency_image: 'Изображения',
  agency_compliance: 'Правовые риски',
};

export function roleLabel(role?: string): string {
  if (!role || role === 'default' || role === 'agent') return 'Агент';
  if (role === 'coordinator') return 'Координатор';
  return agencyCatalog.find((entry) => entry.id === role)?.name ?? legacyLabels[role] ?? role;
}

function searchText(value: string): string {
  return value.toLocaleLowerCase('ru').replaceAll('ё', 'е');
}

/** Match all query terms, then prefer a role's own identity over broad aliases. */
export function filterAgencyCatalog(query: string, category = '', roles: readonly AgencyRole[] = agencyCatalog): readonly AgencyRole[] {
  const terms = searchText(query).trim().split(/\s+/).filter(Boolean);
  return roles.flatMap((role) => {
    if (category && role.category !== category) return [];
    const identity = searchText([role.id, role.name, role.sourcePath].join(' '));
    const keywords = searchText((role.keywords ?? []).join(' '));
    const categoryText = searchText([role.category, role.categoryLabel].join(' '));
    const description = searchText(role.description);
    const text = [identity, keywords, categoryText, description].join(' ');
    if (!terms.every((term) => text.includes(term))) return [];
    let score = terms.reduce((total, term) => total + (
      identity.includes(term) ? 100 : categoryText.includes(term) ? 60 : keywords.includes(term) ? 30 : 10
    ), 0);
    // Rank legal profiles for the everyday synonym; keep the original source identity.
    if (terms.some((term) => /^(lawyer|юрист)/.test(term)) && (role.id.includes('legal') || role.id === 'agency_compliance')) score += 80;
    if (terms.some((term) => /^(finance|финанс)/.test(term)) && role.category === 'finance') score += 80;
    if (terms.some((term) => /^(researcher|исследоват)/.test(term)) && (role.category === 'research' || role.id.includes('researcher'))) score += 80;
    return [{ role, score }];
  }).sort((a, b) => b.score - a.score).map(({ role }) => role);
}
