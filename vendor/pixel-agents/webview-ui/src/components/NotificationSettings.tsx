import './contentWorkspace.css';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import { notificationRequest } from './notificationsApi.js';

interface Status { enabled: boolean; tokenConfigured: boolean; chatId: string | null; lastError: string | null; lastSentAt: number | null; pendingCount: number }
export function NotificationSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState('');
  const [pairing, setPairing] = useState<{code:string;expiresAt:number} | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const refresh = () => { void notificationRequest<Status>('status').then((result) => { if (live) setStatus(result); }).catch(() => { if (live) setError('Не удалось загрузить настройки. Проверьте локальный сервис.'); }); };
    refresh(); const timer = setInterval(refresh, 30000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  async function action(run: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await run(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось выполнить действие.'); }
    finally { setBusy(false); }
  }
  function saveToken(event: FormEvent) {
    event.preventDefault();
    void action(async () => {
      setStatus(await notificationRequest<Status>('config', { botToken: token, enabled: false }));
      setToken(''); setPairing(await notificationRequest('pair/start', {}));
      setMessage('Токен сохранён локально. Теперь привяжите свой личный чат кодом ниже.');
    });
  }
  return <section className="content-workspace notification-settings" aria-label="Уведомления Telegram">
    <header className="content-heading"><h2>Уведомления</h2><p>Сроки задач и важные события — в Telegram.</p></header>
    {error && <p className="content-error" role="alert">{error}</p>}
    <p className="content-saved" role="status">{message}</p>
    <p className="notification-state" data-enabled={status?.enabled}>{!status ? 'Загружаем настройки…' : status.enabled ? 'Telegram включён' : status.chatId ? 'Чат подключён. Осталось включить отправку.' : 'Подключите Telegram за три шага'}</p>
    <ol className="telegram-steps">
      <li data-current={!!status && !status.tokenConfigured}>
        <div className="telegram-step-title"><span aria-hidden="true">1</span><h3>Подключите бота</h3>{status?.tokenConfigured && <strong>Готово</strong>}</div>
        <details className="telegram-bot-form" data-connected={!!status?.tokenConfigured} open={!status?.tokenConfigured}>
          <summary>{status?.tokenConfigured ? 'Заменить бота' : 'Как подключить'}</summary>
          <form className="content-form" onSubmit={saveToken} aria-label="Подключение Telegram-бота">
            <p>Создайте отдельного бота через <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>: команда <code>/newbot</code>. Вставьте его токен ниже.</p>
            <label htmlFor="telegram-token">Токен бота<input id="telegram-token" type="password" autoComplete="new-password" required maxLength={200} value={token} onChange={(event) => setToken(event.target.value)} placeholder="Вставьте токен от BotFather" /></label>
            <button type="submit" disabled={busy || !status}>{busy ? 'Подождите…' : 'Подключить бота'}</button>
            <p className="content-caption">Токен хранится только на этом компьютере. Используйте бота, который не подключён к другим сервисам.</p>
          </form>
        </details>
      </li>
      <li data-current={!!status?.tokenConfigured && !status.chatId}>
        <div className="telegram-step-title"><span aria-hidden="true">2</span><h3>Выберите свой чат</h3>{status?.chatId && <strong>Готово</strong>}</div>
        {!status?.tokenConfigured ? <p className="telegram-step-muted">Сначала подключите бота.</p> : <>
          {pairing ? <><p>Откройте своего бота в Telegram и отправьте эту команду:</p><pre>/start {pairing.code}</pre><p className="content-caption">Код действует 10 минут.</p><button type="button" disabled={busy} onClick={() => void action(async () => { setStatus(await notificationRequest('pair/confirm', {})); setPairing(null); setMessage('Чат подключён. Теперь включите отправку.'); })}>Проверить привязку</button></> : <button type="button" disabled={busy} onClick={() => void action(async () => setPairing(await notificationRequest('pair/start', {})))}>{status.chatId ? 'Выбрать другой чат' : 'Получить команду для Telegram'}</button>}
        </>}
      </li>
      <li data-current={!!status?.chatId && !status.enabled}>
        <div className="telegram-step-title"><span aria-hidden="true">3</span><h3>Включите уведомления</h3>{status?.enabled && <strong>Готово</strong>}</div>
        {!status?.chatId ? <p className="telegram-step-muted">Сначала подтвердите свой чат.</p> : <div className="content-form-actions notification-actions">
          <button type="button" disabled={busy} onClick={() => void action(async () => { setStatus(await notificationRequest('config', { enabled: !status.enabled })); setMessage(status.enabled ? 'Отправка выключена.' : 'Отправка включена.'); })}>{status.enabled ? 'Выключить отправку' : 'Включить отправку'}</button>
          <button type="button" disabled={busy} onClick={() => void action(async () => { setStatus(await notificationRequest('test', {})); setMessage('Тест доставлен. Проверьте Telegram.'); })}>Отправить тест</button>
        </div>}
        {status?.lastSentAt && <p className="content-caption">Последняя доставка: {new Date(status.lastSentAt).toLocaleString('ru')}</p>}
        {!!status?.pendingCount && <p className="content-caption">Ожидают отправки: {status.pendingCount}</p>}
        {status?.lastError && <p className="content-error" role="status">Сообщение не доставлено. Проверьте интернет и нажмите «Отправить тест».</p>}
      </li>
    </ol>
    <p className="content-caption">Сейчас доступны сроки, запросы разрешений и прерывания работы. Vercel и ошибки инструментов пока не отслеживаются.</p>
    <details className="notification-help"><summary>Как работают напоминания</summary><p>Откройте задачи проекта после настройки. Сроки сохранятся в локальном сервисе. Напоминания: за 15 минут и при наступлении срока. Если время не указано — в 09:00 по времени устройства.</p><p>После синхронизации вкладку можно закрыть. Компьютер и локальный сервис должны работать. Повторные сообщения ограничены.</p><p>В Telegram передаются только названия задач или проектов. Описания, переписка и файлы не отправляются. Проверки не вызывают ИИ.</p></details>
  </section>;
}
