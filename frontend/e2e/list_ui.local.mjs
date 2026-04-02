import { chromium } from '@playwright/test';
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:5177');
 await page.waitForSelector('.topbar .topSelect--project');
 const texts=await page.evaluate(()=>{
  const btns=[...document.querySelectorAll('button')].map(b=>b.textContent?.trim()).filter(Boolean);
  const selects=[...document.querySelectorAll('select')].map(s=>({cls:s.className, opts:[...s.options].map(o=>({v:o.value,t:o.textContent?.trim()})).slice(0,8)}));
  return {btns,selects,title:document.title};
 });
 console.log(JSON.stringify(texts,null,2));
 await browser.close();
})();
