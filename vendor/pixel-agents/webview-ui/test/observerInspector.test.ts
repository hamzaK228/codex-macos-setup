import { describe, expect, it } from 'vitest';

import { observerCurrentReport, observerGroup, observerHistoryNotice } from '../src/components/observerPresentation.js';

describe('observer presentation', () => {
  it('separates actual activity from waiting and completion history', () => {
    expect(observerGroup('working')).toBe('active');
    expect(['idle', 'disconnected', 'permission'].map(observerGroup)).toEqual(['waiting', 'waiting', 'waiting']);
    expect(['stopped', 'ended', 'interrupted'].map(observerGroup)).toEqual(['history', 'history', 'history']);
  });
  it('does not present a completed action as current execution', () => {
    for (const status of ['stopped', 'ended', 'interrupted']) {
      expect(observerCurrentReport(status, true, 'Old action')).toBe('Сейчас не выполняется');
    }
    expect(observerCurrentReport('working', true, 'Current action')).toBe('Current action');
  });
  it('preserves uncertainty when the report or connection is missing', () => {
    expect(observerCurrentReport('working', true, '')).toBe('Пока неизвестно');
    expect(observerCurrentReport('working', false, 'Old action')).toBe('Нет связи — выполнение не подтверждено');
    expect(observerCurrentReport('disconnected', true, 'Old action')).toBe('Нет связи — выполнение не подтверждено');
  });
});

describe('completion history wording', () => {
  it('distinguishes a finished turn from interrupted work and missing reports', () => {
    expect(observerHistoryNotice('stopped', true)).toBe('Ход агента завершён. Последний отчёт показан ниже.');
    expect(observerHistoryNotice('interrupted', false)).toBe('Работа агента прервана. Агент ещё не передал отчёт.');
    expect(observerHistoryNotice('ended', false)).toBe('Сеанс агента завершён. Агент ещё не передал отчёт.');
    expect(observerCurrentReport('permission', true, 'Old action')).toBe('Ждёт вашего разрешения в Codex');
  });
});
