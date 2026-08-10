import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ru } from '../../shared/i18n/ru';
import processmanIconRaw from '../../assets/icons/processman.svg?raw';
import '../../features/process/processman/processman.css';

const t = ru.processman;

function agentApiBase(): string {
  const runtimeBase = typeof window !== 'undefined'
    ? String((window as Window & { __ENV__?: { VITE_API_BASE?: string } }).__ENV__?.VITE_API_BASE || '').trim()
    : '';
  const viteBase = String(import.meta.env?.VITE_API_BASE || '').trim();
  return (runtimeBase || viteBase).replace(/\/+$/, '');
}

function agentApiPath(path: string): string {
  const base = agentApiBase();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

interface TaskStatus {
  status: string;
  reply?: string;
  logs: string[];
  progress?: string;
}

export const AgentModal: React.FC<{onClose: () => void}> = ({ onClose }) => {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('moonshotai/kimi-k2.6');
  const [status, setStatus] = useState(t.agentModalStatusReady);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const models = [
    {id:'moonshotai/kimi-k2.6', name:'Kimi K2.6'},
    {id:'anthropic/claude-sonnet-4', name:'Claude Sonnet 4'},
    {id:'openai/gpt-4.1', name:'GPT-4.1'}
  ];

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const checkTask = useCallback(async (taskId: string) => {
    try {
      const resp = await fetch(agentApiPath(`/v1/task/${encodeURIComponent(taskId)}`));
      const data: TaskStatus = await resp.json();
      setStatus(`${data.status} ${data.progress || ''}`);
      setLogs(prev => [...prev, ...data.logs.slice(prev.length)]);
      
      if (data.status === 'completed' || data.status === 'error') {
        stopPoll();
        setLoading(false);
        setResult(data.reply || '');
      }
    } catch(e: unknown) {
      setLogs(prev => [...prev, `Ошибка polling: ${e}`]);
    }
  }, [stopPoll]);

  const run = useCallback(async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setStatus(t.agentModalStatusSending);
    setLogs([]);
    setResult('');
    
    try {
      const resp = await fetch(agentApiPath('/v1/agent/async'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({message: prompt, model, tag: 'processmap'})
      });
      const {task_id} = await resp.json();
      setStatus(`Задача ${task_id.slice(0,8)}...`);
      pollRef.current = setInterval(() => checkTask(task_id), 3000);
    } catch(e: unknown) {
      setStatus(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
      setLoading(false);
    }
  }, [prompt, model, checkTask]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('keydown', esc); stopPoll(); };
  }, [onClose, stopPoll]);

  return (
    <div className="agent-processman-modal" role="dialog" aria-modal="true" aria-labelledby="agent-processman-title">
      <div className="agent-processman-modal__shell">
        <header className="agent-processman-modal__header">
          <span className="agent-processman-modal__icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: processmanIconRaw }} />
          <div className="agent-processman-modal__heading">
            <h3 id="agent-processman-title">{t.agentModalTitle}</h3>
            <p>{t.agentModalSubtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="agent-processman-modal__close" aria-label={t.agentModalClose}>×</button>
        </header>
        
        <label className="agent-processman-modal__field">
          <span>{t.agentModalModel}</span>
          <select value={model} onChange={e => setModel(e.target.value)}>
            {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        
        <label className="agent-processman-modal__field agent-processman-modal__field--grow">
          <span>{t.agentModalPrompt}</span>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={t.agentModalPromptPlaceholder}
          />
        </label>
        
        <div className={`agent-processman-modal__status${loading ? ' agent-processman-modal__status--active' : ''}`}>{status}</div>
        
        {logs.length > 0 && (
          <section className="agent-processman-modal__log" aria-label={t.agentModalLogs}>
            {logs.map((l,i) => <div key={i}>{l}</div>)}
          </section>
        )}
        
        {result && (
          <section className="agent-processman-modal__result" aria-label={t.agentModalResult}>
            {result}
          </section>
        )}
        
        <div className="agent-processman-modal__actions">
          <button type="button" onClick={onClose} className="agent-processman-modal__secondary">{t.agentModalClose}</button>
          <button type="button" onClick={run} disabled={loading || !prompt.trim()} className="agent-processman-modal__primary">
            {loading ? t.agentModalRunning : t.agentModalRun}
          </button>
        </div>
      </div>
    </div>
  );
};
