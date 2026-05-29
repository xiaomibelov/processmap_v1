import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5177';
const LARGE_SESSION = 'app?project=e524c06864&session=5425e68a8d';
const SMALL_SESSION = 'app?project=e524c06864&session=6318dcf810';

async function measureSession(sessionPath, label) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  await page.goto(`${BASE_URL}/${sessionPath}`);
  await page.waitForSelector('.djs-container, .bjs-container', { timeout: 20000 });
  await page.waitForTimeout(3000); // let diagram fully render

  // Count elements
  const counts = await page.evaluate(() => ({
    visual: document.querySelectorAll('.djs-visual').length,
    shapes: document.querySelectorAll('.djs-shape').length,
    connections: document.querySelectorAll('.djs-connection').length,
  }));

  // Inject measurement instrumentation
  const perfResult = await page.evaluate(() => {
    return new Promise((resolve) => {
      const canvas = document.querySelector('.djs-container') || document.querySelector('.bjs-container');
      if (!canvas) {
        resolve({ error: 'Canvas not found' });
        return;
      }

      let frames = 0;
      const longTasks = [];
      const startTime = performance.now();

      const rafLoop = () => {
        frames++;
        if (performance.now() - startTime < 3000) {
          requestAnimationFrame(rafLoop);
        }
      };
      requestAnimationFrame(rafLoop);

      let observer;
      if ('PerformanceObserver' in window) {
        try {
          observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              longTasks.push({ duration: entry.duration, startTime: entry.startTime });
            }
          });
          observer.observe({ entryTypes: ['longtask'] });
        } catch (e) {
          // longtask not supported in this environment
        }
      }

      setTimeout(() => {
        if (observer) observer.disconnect();
        const elapsed = performance.now() - startTime;
        resolve({
          frames,
          elapsed: Math.round(elapsed),
          fps: parseFloat((frames / (elapsed / 1000)).toFixed(1)),
          longTasks,
          longTaskTotal: Math.round(longTasks.reduce((s, t) => s + t.duration, 0)),
          longTaskCount: longTasks.length,
        });
      }, 3500);
    });
  });

  // Perform native mouse drag via Playwright CDP (more realistic than synthetic events)
  const canvasBox = await page.locator('.djs-container, .bjs-container').first().boundingBox();
  if (canvasBox) {
    const startX = canvasBox.x + canvasBox.width / 2;
    const startY = canvasBox.y + canvasBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * Math.PI * 4;
      const radius = 100 * Math.sin(t * Math.PI);
      const x = startX + Math.cos(angle) * radius;
      const y = startY + Math.sin(angle) * radius;
      await page.mouse.move(x, y);
      await page.waitForTimeout(16); // ~60fps mouse updates
    }
    await page.mouse.up();
  }

  // Wait for debounce to settle and count visual elements again
  await page.waitForTimeout(500);
  const countsAfter = await page.evaluate(() => ({
    visual: document.querySelectorAll('.djs-visual').length,
    shapes: document.querySelectorAll('.djs-shape').length,
    connections: document.querySelectorAll('.djs-connection').length,
  }));

  // Check overlay visibility after pan
  const overlayState = await page.evaluate(() => {
    const overlayRoot = document.querySelector('.djs-overlay-container');
    return overlayRoot ? {
      exists: true,
      visibility: overlayRoot.style.visibility,
      computedVisibility: getComputedStyle(overlayRoot).visibility,
      childCount: overlayRoot.children.length,
    } : { exists: false };
  });

  await browser.close();

  return {
    label,
    counts,
    countsAfter,
    perfResult,
    overlayState,
    consoleErrors: consoleErrors.slice(0, 20),
  };
}

(async () => {
  console.log('Starting reviewer independent performance validation...\n');

  const largeResult = await measureSession(LARGE_SESSION, 'Large diagram');
  console.log('--- Large Diagram (428 elements) ---');
  console.log('Elements before pan:', JSON.stringify(largeResult.counts));
  console.log('Elements after pan:', JSON.stringify(largeResult.countsAfter));
  console.log('FPS:', largeResult.perfResult.fps);
  console.log('Long tasks:', largeResult.perfResult.longTaskCount, 'total ms:', largeResult.perfResult.longTaskTotal);
  console.log('Overlay state after pan:', JSON.stringify(largeResult.overlayState));
  if (largeResult.consoleErrors.length) console.log('Console errors:', largeResult.consoleErrors);
  console.log('');

  const smallResult = await measureSession(SMALL_SESSION, 'Small diagram');
  console.log('--- Small Diagram (9 elements) ---');
  console.log('Elements before pan:', JSON.stringify(smallResult.counts));
  console.log('Elements after pan:', JSON.stringify(smallResult.countsAfter));
  console.log('FPS:', smallResult.perfResult.fps);
  console.log('Long tasks:', smallResult.perfResult.longTaskCount, 'total ms:', smallResult.perfResult.longTaskTotal);
  console.log('Overlay state after pan:', JSON.stringify(smallResult.overlayState));
  if (smallResult.consoleErrors.length) console.log('Console errors:', smallResult.consoleErrors);
  console.log('');

  // Verdict summary
  const a1Pass = largeResult.perfResult.fps >= 38;
  const a2Pass = largeResult.perfResult.longTaskTotal <= 100;
  const a3Pass = smallResult.perfResult.fps >= 55; // allow small variance from 60
  const b1Pass = largeResult.countsAfter.visual === largeResult.counts.visual;
  const b2Pass = largeResult.overlayState.exists && largeResult.overlayState.computedVisibility !== 'hidden';
  const b7Pass = largeResult.consoleErrors.length === 0 && smallResult.consoleErrors.length === 0;

  console.log('=== REVIEWER VERDICT ===');
  console.log('A1 FPS large ≥38:', a1Pass ? 'PASS' : 'FAIL', `(${largeResult.perfResult.fps})`);
  console.log('A2 Long tasks ≤100ms:', a2Pass ? 'PASS' : 'FAIL', `(${largeResult.perfResult.longTaskTotal}ms)`);
  console.log('A3 FPS small ≈60:', a3Pass ? 'PASS' : 'FAIL', `(${smallResult.perfResult.fps})`);
  console.log('B1 Shapes stable:', b1Pass ? 'PASS' : 'FAIL');
  console.log('B2 Overlays visible after pan:', b2Pass ? 'PASS' : 'FAIL');
  console.log('B7 Console clean:', b7Pass ? 'PASS' : 'FAIL');

})();
