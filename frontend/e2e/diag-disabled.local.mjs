import { chromium } from '@playwright/test';
const API='http://127.0.0.1:8011';
const APP='http://127.0.0.1:5177';
async function j(r){const t=await r.text(); if(!r.ok) throw new Error(t); return t?JSON.parse(t):{};}
const p=await j(await fetch(`${API}/api/projects`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'diag'+Date.now(),passport:{}})}));
const s=await j(await fetch(`${API}/api/projects/${p.id}/sessions?mode=quick_skeleton`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'diag',roles:['r'],start_role:'r'})}));
await j(await fetch(`${API}/api/sessions/${s.id}/bpmn`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({xml:'<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn"><bpmn:process id="Process_1" isExecutable="false"><bpmn:startEvent id="StartEvent_1"/></bpmn:process></bpmn:definitions>'})}));
const b=await chromium.launch({headless:true}); const page=await b.newPage();
await page.goto(APP); await page.selectOption('.topbar .topSelect--project', String(p.id)); await page.getByRole('button',{name:'Обновить'}).click();
await page.selectOption('.topbar .topSelect--session', String(s.id));
await page.locator('.segBtn').filter({hasText:/^Interview$/}).first().click();
await page.waitForTimeout(350);
const st=await page.evaluate(()=>{
  const byText=(x)=>[...document.querySelectorAll('.processHeader button')].find(b=>String(b.textContent||'').trim()===x);
  const a=byText('Save'); const i=byText('Импорт BPMN'); const e=byText('Export BPMN');
  const active=[...document.querySelectorAll('.segBtn')].find(b=>b.classList.contains('on')||b.classList.contains('active'));
  return {
    activeTab: String(active?.textContent||'').trim(),
    save:{exists:!!a,disabled:!!a?.disabled},
    import:{exists:!!i,disabled:!!i?.disabled},
    export:{exists:!!e,disabled:!!e?.disabled},
  };
});
console.log(JSON.stringify(st));
await b.close();
