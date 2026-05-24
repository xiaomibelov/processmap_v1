#!/usr/bin/env node
/**
 * Capture Chrome DevTools CPU profile during canvas drag via Playwright CDP.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUTDIR = process.env.OUTDIR || "/opt/processmap-test/.planning/contours/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1";
const URL = process.env.TARGET_URL || "http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // Optional: inject auth token if needed
  // await page.goto("about:blank");
  // await page.evaluate((token) => { localStorage.setItem("token", token); }, process.env.AUTH_TOKEN);

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(8000);

  const client = await page.context().newCDPSession(page);
  await client.send("Profiler.enable");
  await client.send("Profiler.start");

  // Perform drag
  const container = page.locator(".djs-container").nth(1);
  const box = await container.boundingBox();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const endX = startX + 300;
  const endY = startY + 200;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(startX + (endX - startX) * (i / 30), startY + (endY - startY) * (i / 30));
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);

  const { profile } = await client.send("Profiler.stop");
  await client.send("Profiler.disable");

  const profilePath = path.join(OUTDIR, "drag-cpu-profile.cpuprofile");
  fs.writeFileSync(profilePath, JSON.stringify(profile));
  console.log("Profile saved to:", profilePath);

  // Quick analysis
  const nodes = profile.nodes || [];
  const samples = profile.samples || [];
  const timeDeltas = profile.timeDeltas || [];

  const selfTime = new Map();
  for (let i = 0; i < samples.length; i++) {
    const nodeId = samples[i];
    const delta = timeDeltas[i] || 0;
    selfTime.set(nodeId, (selfTime.get(nodeId) || 0) + delta);
  }

  const sorted = nodes
    .map(n => ({ id: n.id, self: selfTime.get(n.id) || 0, callFrame: n.callFrame }))
    .sort((a, b) => b.self - a.self)
    .slice(0, 20);

  const reportPath = path.join(OUTDIR, "drag-cpu-profile-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(sorted, null, 2));
  console.log("Report saved to:", reportPath);

  sorted.forEach((s, i) => {
    const ms = (s.self / 1000).toFixed(1);
    const name = s.callFrame.functionName || "(anonymous)";
    const url = s.callFrame.url?.split("/").pop() || "";
    console.log(`${i + 1}. ${ms}ms  ${name}  ${url}:${s.callFrame.lineNumber}`);
  });

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
