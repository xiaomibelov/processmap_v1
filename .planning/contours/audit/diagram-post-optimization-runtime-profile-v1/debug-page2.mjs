import { chromium } from '/opt/processmap-test/frontend/node_modules/playwright/index.mjs';

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmMmNhNGI3MjI2YjA0NzJjYmM1Y2ZjNmYwNDQxOWZlYSIsImlhdCI6MTc3ODg2MzgxNCwiZXhwIjoxNzc4ODY0NzE0LCJ0eXBlIjoiYWNjZXNzIn0.CYOlegj22mybUtseOA_dI-O7xJU3drEAemlWh9AWOZE';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const logs = [];
page.on('console', msg => logs.push({type: msg.type(), text: msg.text()}));
page.on('response', res => logs.push({type: 'response', status: res.status(), url: res.url()}));

await page.goto('http://clearvestnic.ru:5180/app');
await page.waitForTimeout(2000);

const tokenBefore = await page.evaluate(() => localStorage.getItem('fpc_auth_access_token'));
console.log('Token before set:', tokenBefore);

await page.evaluate(t => localStorage.setItem('fpc_auth_access_token', t), TOKEN);

const tokenAfter = await page.evaluate(() => localStorage.getItem('fpc_auth_access_token'));
console.log('Token after set:', tokenAfter);

await page.goto('http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e&tab=diagram');
await page.waitForTimeout(10000);

const url = page.url();
const title = await page.title();
const hasReady = await page.locator('[data-testid="diagram-ready"]').count();
const hasCanvas = await page.locator('.djs-container').count();
const text = await page.locator('body').innerText();

console.log('URL:', url);
console.log('Title:', title);
console.log('hasReady:', hasReady);
console.log('hasCanvas:', hasCanvas);
console.log('Body text first 500 chars:', text.slice(0, 500));
console.log('Logs:');
logs.forEach(l => console.log(JSON.stringify(l)));

await page.screenshot({ path: '/opt/processmap-test/.planning/contours/audit/diagram-post-optimization-runtime-profile-v1/evidence/screenshots/debug2.png', fullPage: true });
await browser.close();
