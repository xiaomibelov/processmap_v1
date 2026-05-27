import React, { useState, useCallback, useEffect, useRef } from 'react';

const API_URL = 'http://91.184.252.237:8000';

interface TaskStatus {
  status: string;
  reply?: string;
  logs: string[];
  progress?: string;
}

export const AgentModal: React.FC<{onClose: () => void}> = ({ onClose }) => {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('moonshotai/kimi-k2.6');
  const [status, setStatus] = useState('Готов');
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
      const resp = await fetch(`${API_URL}/v1/task/${taskId}`);
      const data: TaskStatus = await resp.json();
      setStatus(`${data.status} ${data.progress || ''}`);
      setLogs(prev => [...prev, ...data.logs.slice(prev.length)]);
      
      if (data.status === 'completed' || data.status === 'error') {
        stopPoll();
        setLoading(false);
        setResult(data.reply || '');
      }
    } catch(e) {
      setLogs(prev => [...prev, `Ошибка polling: ${e}`]);
    }
  }, [stopPoll]);

  const run = useCallback(async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setStatus('Отправка...');
    setLogs([]);
    setResult('');
    
    try {
      const resp = await fetch(`${API_URL}/v1/agent/async`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({message: prompt, model, tag: 'processmap'})
      });
      const {task_id} = await resp.json();
      setStatus(`Задача ${task_id.slice(0,8)}...`);
      pollRef.current = setInterval(() => checkTask(task_id), 3000);
    } catch(e) {
      setStatus(`Ошибка: ${e.message}`);
      setLoading(false);
    }
  }, [prompt, model, checkTask]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('keydown', esc); stopPoll(); };
  }, [onClose, stopPoll]);

  return (
    <div style={{position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#0f172a',border:'1px solid #334155',borderRadius:16,padding:24,width:560,maxWidth:'92vw',maxHeight:'85vh',overflow:'hidden',display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h3 style={{margin:0,color:'#f8fafc'}}>🤖 AI Агент</h3>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#64748b',fontSize:20,cursor:'pointer'}}>×</button>
        </div>
        
        <select value={model} onChange={e => setModel(e.target.value)} style={{marginBottom:12,padding:10,background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#f1f5f9'}}>
          {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} 
          placeholder="Опиши задачу агенту..." 
          style={{minHeight:140,padding:12,background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#f1f5f9',resize:'vertical',fontFamily:'inherit',marginBottom:12}} />
        
        <div style={{fontSize:12,color:'#94a3b8',marginBottom:8}}>{status}</div>
        
        {logs.length > 0 && (
          <div style={{background:'#020617',border:'1px solid #1e293b',borderRadius:8,padding:12,maxHeight:160,overflow:'auto',fontSize:11,fontFamily:'monospace',color:'#94a3b8',marginBottom:12}}>
            {logs.map((l,i) => <div key={i}>{l}</div>)}
          </div>
        )}
        
        {result && (
          <div style={{background:'#020617',border:'1px solid #1e293b',borderRadius:8,padding:16,fontSize:13,color:'#e2e8f0',whiteSpace:'pre-wrap',maxHeight:240,overflow:'auto',marginBottom:12}}>
            {result}
          </div>
        )}
        
        <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
          <button onClick={onClose} style={{padding:'8px 16px',background:'#334155',color:'#cbd5e1',border:'none',borderRadius:8,cursor:'pointer'}}>Закрыть</button>
          <button onClick={run} disabled={loading} style={{padding:'8px 16px',background:'#2563eb',color:'white',border:'none',borderRadius:8,cursor:'pointer'}}>
            {loading ? '...' : '▶ Запустить'}
          </button>
        </div>
      </div>
    </div>
  );
};
