const { chromium } = require("playwright");

const BASE = "http://clearvestnic.ru:5177";
const PROJECT = "d3b9ae9fda";
const SESSION = "f1f727aee7";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', "admin@local");
  await page.fill('input[type="password"]', "admin");
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === "/app", { timeout: 15000 });
  await page.click("text=Default");
  await page.waitForTimeout(2000);
  await page.goto(`${BASE}/app?project=${PROJECT}&session=${SESSION}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  const shapes = await page.locator(".djs-shape").all();
  const infos = [];
  for (let i = 0; i < Math.min(shapes.length, 8); i++) {
    const s = shapes[i];
    const box = await s.boundingBox();
    const id = await s.getAttribute("data-element-id");
    infos.push({ i, id, area: box.width * box.height, text: (await s.textContent()).trim().slice(0, 30) });
  }
  console.log("shapes", infos);

  // pick a medium-sized shape
  infos.sort((a, b) => a.area - b.area);
  const targetIdx = infos.find((s) => s.area > 1500 && s.area < 15000)?.i ?? 0;
  const target = shapes[targetIdx];
  const before = await target.boundingBox();
  console.log("before", before);

  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(before.x + before.width / 2 + i * 10, before.y + before.height / 2);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  await page.waitForTimeout(1000);

  const after = await target.boundingBox();
  console.log("after", after);
  console.log("moved", Math.abs(after.x - before.x) > 1 || Math.abs(after.y - before.y) > 1);
  await browser.close();
})();
