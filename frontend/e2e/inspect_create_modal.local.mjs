import { chromium } from '@playwright/test';
const API='http://127.0.0.1:8011';
async function apiJson(res){const t=await res.text(); if(!res.ok) throw new Error(t); return t?JSON.parse(t):{};}
(async()=>{
 const p=await apiJson(await fetch(`${API}/api/projects`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:`ui proj ${Date.now()}`,passport:{}})}));
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:5177');
 await page.waitForSelector('.topbar .topSelect--project');
 await page.selectOption('.topbar .topSelect--project', String(p.id));
 await page.getByRole('button',{name:'Обновить'}).click();
 await page.getByRole('button',{name:'Создать сессию'}).click();
 await page.waitForTimeout(400);
 const info=await page.evaluate(()=>{
  const modal=document.querySelector('.modalCard, [role="dialog"], .sessionFlowModal') || document.body;
  const labels=[...modal.querySelectorAll('label,.label,.fieldLabel,h2,h3')].map(n=>n.textContent?.trim()).filter(Boolean);
  const inputs=[...modal.querySelectorAll('input,textarea,select,button')].map(n=>({tag:n.tagName.toLowerCase(),type:n.type||'',name:n.name||'',text:n.textContent?.trim()||'',placeholder:n.placeholder||'',value:n.value||''}));
  return {labels,inputs};
 });
 console.log(JSON.stringify(info,null,2));
 await browser.close();
})();
