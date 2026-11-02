#!/usr/bin/env python3
"""Rebuild bundled metadata from an already inspected pinned checkout, without running its scripts.

Requires PyYAML for frontmatter parsing (the profile installer itself is stdlib-only).
Does not install dependencies or overwrite any installed profile. Normal use: install_profiles.py.
"""
from pathlib import Path
import collections
import hashlib
import importlib.util
import json
import subprocess
import sys
import tomllib
import yaml

ROOT = Path(__file__).resolve().parents[1]
REFS = ROOT / 'references'
CATEGORIES = {'academic':'Академические исследования','design':'Дизайн','engineering':'Разработка','finance':'Финансы','game-development':'Разработка игр','gis':'Геоинформационные системы','healthcare':'Здравоохранение','marketing':'Маркетинг','paid-media':'Платная реклама','product':'Продукт','project-management':'Управление проектами','research':'Исследования','sales':'Продажи','security':'Безопасность','spatial-computing':'Пространственные интерфейсы','specialized':'Специализированные роли','support':'Поддержка и операции','testing':'Тестирование'}
TRANSLATIONS = {
 'Financial Analyst':('Финансовый аналитик','Финансовые модели, прогнозы и сценарный анализ'),
 'FP&A Analyst':('Аналитик FP&A','Бюджеты, отклонения, прогнозирование и финансовое планирование'),
 'Bookkeeper & Controller':('Бухгалтер и контролёр','Учёт, финансовое закрытие и контроль отчётности'),
 'Investment Researcher':('Инвестиционный исследователь','Анализ рынков, инвестиционных предпосылок и рисков'),
 'Tax Strategist':('Налоговый стратег','Анализ налоговых сценариев с учётом юрисдикции'),
 'Research Synthesist':('Исследователь источников','Обзор литературы, оценка источников и синтез доказательств'),
 'Analytics Reporter':('Аналитик данных','Анализ данных, отчёты и выводы для бизнеса'),
 'Finance Tracker':('Финансовый контролёр','Финансовое планирование, бюджеты и контроль показателей'),
 'Legal Document Review':('Юрист: проверка документов','Анализ договоров, правовых документов и рисков для проверки специалистом'),
 'Legal Client Intake':('Юрист: приём обращений','Сбор вводных, квалификация обращений и подготовка правового контекста'),
 'Legal Billing & Time Tracking':('Юрист: учёт времени и счетов','Подготовка учёта времени, расчётов и счетов юридической практики'),
 'Data Privacy Officer':('Специалист по защите данных','Анализ приватности, обработки данных и применимых требований'),
}
# Stable labels of the pre-existing fifteen profiles. Their profile bytes are never regenerated.
LEGACY_LABELS = {
 'agency_principal':('Руководитель','Координация команды и результатов'),'agency_product':('Продукт','Цели, требования и приоритеты'),
 'agency_frontend':('Фронтенд','Интерфейс и поведение в браузере'),'agency_backend':('Бэкенд','API, данные и серверная логика'),
 'agency_ui':('UI-дизайнер','Компоненты и визуальная система'),'agency_ux':('UX-исследователь','Сценарии и удобство использования'),
 'agency_reviewer':('Ревьюер','Независимая проверка изменений'),'agency_qa':('Тестировщик','Проверка пользовательских сценариев'),
 'agency_marketing':('Маркетолог','Позиционирование и привлечение'),'agency_content':('Редактор','Тексты, сценарии и контент'),
 'agency_smm':('SMM','Социальные сети и сообщество'),'agency_media':('Медиа','Визуальные истории и кампании'),
 'agency_video':('Видео','Монтаж, субтитры и экспорт'),'agency_image':('Изображения','Концепции и создание графики'),
 'agency_compliance':('Правовые риски','Лицензии, приватность и требования')}


def main(checkout):
    old=json.loads((REFS/'manifest.json').read_text())
    if subprocess.check_output(['git','-C',str(checkout),'rev-parse','HEAD'],text=True).strip()!=old['commit']:
        raise ValueError('Checkout must match pinned manifest commit')
    old_entries={e['sourcePath']:e for e in old['profiles']}
    legacy=json.loads((REFS/'legacy-profiles.json').read_text())
    common=(REFS/'profile-boundary.txt').read_text().strip()
    spec=importlib.util.spec_from_file_location('install_profiles',ROOT/'scripts/install_profiles.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    catalog=[];entries=[];ids=set()
    for p in sorted(checkout.rglob('*.md')):
        rel=p.relative_to(checkout)
        if rel.parts[0] not in CATEGORIES: continue
        raw=p.read_text()
        if not raw.startswith('---\n'): continue
        m=yaml.safe_load(raw.split('---',2)[1])
        if not isinstance(m,dict) or not isinstance(m.get('name'),str) or not isinstance(m.get('description'),str): continue
        source=str(rel);category=rel.parts[0];existing=old_entries.get(source)
        stem=p.stem.removeprefix(category+'-')
        import re
        id=existing['name'] if existing else 'agency_'+re.sub('[^a-z0-9]+','_',category+'_'+stem).strip('_')
        if len(id)>64: id=id[:55].rstrip('_')+'_'+hashlib.sha256(source.encode()).hexdigest()[:8]
        if id in ids: raise ValueError('Duplicate id '+id)
        ids.add(id)
        name,desc=LEGACY_LABELS.get(id,TRANSLATIONS.get(m['name'],(m['name'],m['description'].strip())))
        words=[m['name'],category,CATEGORIES[category]]
        text=(source+' '+m['name']).lower()
        if any(x in text for x in ['analy','data','аналит']): words+=['analytics','analyst','data analysis','аналитика','аналитик','данные']
        if category=='finance' or any(x in text for x in ['finance','financial','investment','tax','bookkeep']): words+=['finance','финансы','финансовый','бухгалтер','налоги','инвестиции']
        if category in ['research','academic'] or 'research' in text: words+=['research','researcher','исследователь','исследования']
        if any(x in text for x in ['legal','lawyer']): words+=['legal','lawyer','law','юрист','право','юридический']
        role=dict(id=id,name=name,description=desc,category=category,categoryLabel=CATEGORIES[category],sourcePath=source,sourceUrl=f"{old['repository']}/blob/{old['commit']}/{source}",keywords=list(dict.fromkeys(words)))
        entry=dict(existing) if existing else dict(name=id,file=str(Path.home()/'.codex/agents'/(id+'.toml')),sourcePath=source,sourceUrl=role['sourceUrl'],reference='upstream/'+source)
        digest=hashlib.sha256(p.read_bytes()).hexdigest()
        if entry.get('sourceSha256') and entry['sourceSha256']!=digest:
            entry.setdefault('previousSourceSha256',entry['sourceSha256'])
            entry['sourceNormalizationNote']='Prior reference added a terminal newline; source now preserves exact pinned Git bytes.'
        entry.update(originalName=m['name'],originalDescription=m['description'].strip(),category=category,commit=old['commit'],sourceSha256=digest)
        dest=REFS/entry['reference'];dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_bytes(p.read_bytes())
        if id not in legacy: entry['profileSha256']=hashlib.sha256(module.render_profile(role,entry,common)).hexdigest()
        entries.append(entry);catalog.append(role)
    legacy_order={id:i for i,id in enumerate(legacy)}
    catalog.sort(key=lambda r:(0,legacy_order[r['id']]) if r['id'] in legacy_order else (1,r['category'],r['sourcePath']))
    entries.sort(key=lambda e:(0,legacy_order[e['name']]) if e['name'] in legacy_order else (1,e['category'],e['sourcePath']))
    old.update(profiles=entries,roleCount=len(catalog),categoryCount=len(CATEGORIES),discovery={'included':'Markdown files with name and description frontmatter in the 18 domain directories','excluded':['README and documentation','examples','integrations','scripts','.github','strategy templates'],'legacyProfilesPreserved':len(legacy)})
    (REFS/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
    (REFS/'manifest.json').write_text(json.dumps(old,ensure_ascii=False,indent=2)+'\n')
    counts=collections.Counter(r['category'] for r in catalog)
    index=['# Full role index','','Search this file or `catalog.json` only when the core roles in `roles.md` do not cover the task. Load only the selected profile and its optional upstream source. IDs are installed native profile names; availability to the current tool must still be checked.','',f"Pinned source: {old['repository']} at `{old['commit']}`. {len(catalog)} roles in {len(counts)} categories; 15 existing profiles preserved.",'','| Category | Label | Roles |','| --- | --- | --- |']
    index += [f'| `{cat}` | {CATEGORIES[cat]} | {counts[cat]} |' for cat in sorted(counts)]
    by_id={e['name']:e for e in entries}
    for cat in sorted(counts):
        index+=['',f'## {CATEGORIES[cat]} (`{cat}`)','']
        index += [f"- `{r['id']}` — {r['name']} ({by_id[r['id']]['originalName']})" for r in catalog if r['category']==cat]
    (REFS/'roles-index.md').write_text('\n'.join(index)+'\n')
    print(json.dumps({'roles':len(catalog),'new':len(catalog)-len(legacy),'categories':dict(counts),'maxId':max(map(len,ids))},ensure_ascii=False))

if __name__=='__main__': main(Path(sys.argv[1]).resolve())
