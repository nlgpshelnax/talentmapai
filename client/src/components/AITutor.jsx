import { useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles, X } from 'lucide-react';

import api, { errorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button, cx } from './ui';

const SUGGESTIONS = ['Что делать дальше?', 'Как рисовать объём?', 'Не получается, что делать?'];

/**
 * Floating AI tutor.
 * Works without an API key — the server falls back to a topic-routed offline
 * mode rather than the prototype's single canned "я в демо-режиме" sentence.
 */
export default function AITutor() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The greeting is derived, not stored: keeping it out of `messages` means it
  // is never replayed back to the model and needs no seeding effect.
  const greeting = {
    role: 'assistant',
    content: `Привет, ${user?.name || 'друг'}! 👋 Я твой ИИ-наставник. Спроси про любой навык с карты — подскажу, с чего начать.`,
  };
  const visibleMessages = [greeting, ...messages];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;

    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError(null);

    try {
      const res = await api.post('/ai/tutor', {
        // Only the conversational turns go to the server, not the greeting.
        messages: next.slice(-10).map(({ role, content: c }) => ({ role, content: c })),
      });
      if (mounted.current) setMessages((prev) => [...prev, { role: 'assistant', content: res.data.reply }]);
    } catch (err) {
      if (mounted.current) setError(errorMessage(err, 'Наставник сейчас недоступен'));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Открыть чат с ИИ-наставником"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-space-950 shadow-lg shadow-gold-500/30 transition hover:scale-105 md:bottom-6 md:right-6"
      >
        <Bot size={24} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="ИИ-наставник"
      className="glass-strong fixed bottom-20 right-2 z-40 flex h-[min(560px,72vh)] w-[min(380px,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl md:bottom-6 md:right-6"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gold-400/15">
            <Sparkles size={16} className="text-gold-400" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-bold text-white">ИИ-наставник</p>
            <p className="text-[11px] text-slate-400">Всегда на связи</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Закрыть чат"
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {visibleMessages.map((m, i) => (
          <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cx(
                'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                m.role === 'user'
                  ? 'rounded-br-md bg-gold-400 text-space-950'
                  : 'rounded-bl-md bg-space-700 text-slate-100'
              )}
            >
              {m.content}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="flex gap-1 rounded-2xl rounded-bl-md bg-space-700 px-4 py-3">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="h-2 w-2 animate-bounce rounded-full bg-slate-400"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-center text-xs text-rose-400">{error}</p>}
      </div>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-full border border-white/12 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-gold-400/40 hover:text-white"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex items-center gap-2 border-t border-white/10 px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor="tutor-input" className="sr-only">
          Сообщение наставнику
        </label>
        <input
          id="tutor-input"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Напишите вопрос…"
          maxLength={500}
          className="flex-1 rounded-xl border border-white/12 bg-space-800/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-gold-400/60 focus:outline-none"
        />
        <Button type="submit" size="sm" disabled={!input.trim() || busy} aria-label="Отправить">
          <Send size={15} aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}
