// P6 [Г]: приёмка создания сессии с файлом .bpmn/.xml.
// Сценарии: (1) модалка: файл → создание → стадии → готово; (2) dnd на строку
// проекта в explorer; (3) dnd на таблицу сессий проекта; (4) бинарник → 422 RU;
// (5) >20МБ → лимит; (6) retry после ошибки не дублирует сессию;
// (7) колонка «Стадия» без вечного «—».
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE_URL = process.env.TEST_BASE_URL || "http://127.0.0.1:5313";
const EMAIL = process.env.TEST_EMAIL || "admin@local";
const PASSWORD = process.env.TEST_PASSWORD || "admin";
const OUT_DIR = process.env.OUT_DIR || "/root/download/projects-mockup/shots/";
const VALID_BPMN_PATH = process.env.VALID_BPMN || "/tmp/p6_valid.bpmn";

const results = [];
function check(name, ok, details = "") {
  results.push({ name, ok, details });
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${details ? ` — ${details}` : ""}`);
}

// Уникальный суффикс прогона: backend отклоняет дубли title в проекте
// (SessionTitleConflictError), поэтому все файлы/имена — с меткой запуска.
const RUN = String(Date.now()).slice(-7);
const NAME_DND_ROW = `p6dndrow_${RUN}`;
const NAME_DND_TABLE = `p6dndtable_${RUN}`;
const NAME_BINARY = `p6binary_${RUN}`;
const NAME_BIG = `p6big_${RUN}`;
const RUN_VALID_PATH = `/tmp/p6_valid_${RUN}.bpmn`;
fs.copyFileSync(VALID_BPMN_PATH, RUN_VALID_PATH);
const NAME_VALID = `p6_valid_${RUN}`;

async function shot(page, name) {
  await page.screenshot({ path: `${OUT_DIR}${name}.png` });
}

// DataTransfer с файлом в контексте страницы
async function makeDataTransfer(page, { name, content, binary = false, size = 0 }) {
  return await page.evaluateHandle(({ name, content, binary, size }) => {
    const dt = new DataTransfer();
    let file;
    if (size > 0) {
      file = new File([new Uint8Array(size)], name, { type: "application/xml" });
    } else if (binary) {
      file = new File([new Uint8Array([0, 1, 2, 255, 254, 13])], name, { type: "application/octet-stream" });
    } else {
      file = new File([content], name, { type: "application/xml" });
    }
    dt.items.add(file);
    return dt;
  }, { name, content, binary, size });
}

async function dropFile(page, selector, dtHandle) {
  await page.dispatchEvent(selector, "dragover", { dataTransfer: dtHandle });
  await page.dispatchEvent(selector, "drop", { dataTransfer: dtHandle });
}

async function waitStage(page, timeout = 25000) {
  // дождаться появления транзиентной стадии и её ухода (done → строка исчезает)
  const stage = page.locator('[data-testid="session-upload-stage"]').first();
  await stage.waitFor({ state: "visible", timeout: 10000 });
  const seen = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const el = await page.$('[data-testid="session-upload-stage"]');
    if (!el) break;
    const s = await el.getAttribute("data-stage");
    if (s) seen.add(s);
    if (s === "error") break;
    await page.waitForTimeout(250);
  }
  return [...seen];
}

// Все проверки строк — только в таблице сессий проекта (на странице могут
// быть другие таблицы, после reload их состав меняется → скачки count).
const SES_TABLE = '[data-testid="project-sessions-dropzone"] table';
const SES_TABLE_ROWS = `${SES_TABLE} tbody tr:not([data-testid="session-upload-transient-row"])`;

const countSessionRows = async (page) =>
  page.locator(SES_TABLE_ROWS).count();

// Путь «/app → раздел → первый проект». Навигация в explorer — SPA-state, не URL,
// поэтому после page.reload() проект нужно открывать заново.
async function openFirstProject(page) {
  await page.goto(`${BASE_URL}/app`);
  await page.waitForSelector('[data-testid="explorer-breadcrumbs"]', { timeout: 20000 });
  await page.waitForTimeout(800);
  await page.locator('table tbody tr:has-text("РАЗДЕЛ")').first().locator("td").first().click();
  await page.waitForSelector('[data-testid="explorer-back-sections"]', { timeout: 15000 });
  const row = page.locator('tr[data-testid^="project-row-"]').first();
  await row.waitFor({ state: "visible", timeout: 15000 });
  await row.locator('a', { hasText: /Открыть проект|Открыть/ }).first().click();
  await page.waitForSelector('[data-testid="project-breadcrumbs"]', { timeout: 20000 });
  await page.waitForTimeout(1200);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const validXml = fs.readFileSync(VALID_BPMN_PATH, "utf8");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 5200 } });

  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]', { timeout: 15000 });
  await page.waitForURL(/\/app/, { timeout: 20000 });
  await page.waitForTimeout(2500);
  try {
    await page.locator('button:has-text("Default")').first().click({ timeout: 6000 });
    await page.waitForTimeout(2500);
  } catch { /* org уже выбрана */ }
  await page.setViewportSize({ width: 1440, height: 900 });

  // ── вход в раздел → строка проекта в дереве explorer ──
  await page.goto(`${BASE_URL}/app`);
  await page.waitForSelector('[data-testid="explorer-breadcrumbs"]', { timeout: 20000 });
  await page.waitForTimeout(800);
  await page.locator('table tbody tr:has-text("РАЗДЕЛ")').first().locator("td").first().click();
  await page.waitForSelector('[data-testid="explorer-back-sections"]', { timeout: 15000 });
  const projectRow = page.locator('tr[data-testid^="project-row-"]').first();
  await projectRow.waitFor({ state: "visible", timeout: 15000 });

  // ── Сценарий 2 (раньше, пока мы в дереве): dnd на строку проекта ──
  const dt2 = await makeDataTransfer(page, { name: `${NAME_DND_ROW}.bpmn`, content: validXml });
  await dropFile(page, 'tr[data-testid^="project-row-"]', dt2);
  const stages2 = await waitStage(page);
  // creating может проскочить между опросами 250мс — достаточно любой
  // транзиентной стадии без error.
  check("S2 dnd на строку проекта: стадии creating→uploading→…", stages2.some((s) => ["creating", "uploading", "importing"].includes(s)) && !stages2.includes("error"), stages2.join(","));
  const err2 = await page.locator('[data-testid="session-upload-stage"][data-stage="error"]').count();
  check("S2 dnd на строку проекта: без ошибки", err2 === 0);
  await shot(page, "p6_upload_s2_project_row_dnd");

  // открываем проект, проверяем сессию с именем файла
  await projectRow.locator('a', { hasText: /Открыть проект|Открыть/ }).first().click();
  await page.waitForSelector('[data-testid="project-breadcrumbs"]', { timeout: 20000 });
  await page.waitForTimeout(1200);
  const hasDndSession = await page.locator(`${SES_TABLE} tbody tr:has-text("${NAME_DND_ROW}")`).count();
  check("S2 сессия создана с именем файла без расширения", hasDndSession > 0, `rows=${hasDndSession}`);

  // ── Сценарий 7: колонка «Стадия» без вечного «—» ──
  // В headless innerText у hidden-ячеек пустой → читаем textContent первой
  // td.hidden.sm:table-cell (в строке сессии это колонка «Стадия»).
  const stageCell = (
    await page.locator(`${SES_TABLE} tbody tr:has-text("${NAME_DND_ROW}") td.hidden.sm\\:table-cell`).first().textContent().catch(() => "")
  ) || "";
  check("S7 колонка «Стадия» не «—» у загруженной сессии", stageCell.trim() !== "—" && stageCell.trim() !== "", `stage="${stageCell.trim()}"`);

  // ── Сценарий 1: модалка — файл, создание, стадии, готово ──
  await page.locator('button:has-text("Новая сессия")').first().click();
  await page.waitForSelector('[data-testid="session-create-modal"]', { timeout: 10000 });
  await page.locator('[data-testid="session-create-file"]').setInputFiles(RUN_VALID_PATH);
  const nameVal = await page.locator('[data-testid="session-create-name"]').inputValue();
  check("S1 модалка: имя предзаполнено из файла", nameVal === NAME_VALID, `name="${nameVal}"`);
  await shot(page, "p6_upload_s1_modal_file");
  await page.locator('[data-testid="session-create-submit"]').click();
  // ждём закрытия модалки (done) и проверяем, что стадии показывались
  let sawStage = false;
  for (let i = 0; i < 40; i += 1) {
    const st = await page.locator('[data-testid="session-create-stage"]').count();
    if (st > 0) { sawStage = true; break; }
    const open = await page.locator('[data-testid="session-create-modal"]').count();
    if (!open) break;
    await page.waitForTimeout(150);
  }
  await page.waitForSelector('[data-testid="session-create-modal"]', { state: "detached", timeout: 20000 });
  check("S1 модалка: транзиентная стадия показана", sawStage);
  await page.waitForTimeout(1500);
  const modalErr = await page.locator('[data-testid="session-create-error"]').count();
  check("S1 модалка: создано без ошибки", modalErr === 0);
  const hasModalSession = await page.locator(`${SES_TABLE} tbody tr:has-text("${NAME_VALID}")`).count();
  check("S1 модалка: сессия появилась в таблице", hasModalSession > 0);
  await shot(page, "p6_upload_s1_modal_done");

  // ── Сценарий 3: dnd на таблицу сессий проекта ──
  const rowsBefore3 = await countSessionRows(page);
  const dt3 = await makeDataTransfer(page, { name: `${NAME_DND_TABLE}.xml`, content: validXml });
  await dropFile(page, '[data-testid="project-sessions-dropzone"]', dt3);
  const stages3 = await waitStage(page);
  check("S3 dnd на таблицу сессий: стадии показаны", stages3.length > 0 && !stages3.includes("error"), stages3.join(","));
  await page.waitForTimeout(1500);
  const rowsAfter3 = await countSessionRows(page);
  check("S3 dnd на таблицу сессий: сессия добавлена", rowsAfter3 === rowsBefore3 + 1, `${rowsBefore3}→${rowsAfter3}`);
  await shot(page, "p6_upload_s3_table_dnd_done");

  // ── Сценарий 4: бинарный файл → 422 с RU-сообщением ──
  const rowsBefore4 = await countSessionRows(page);
  const dt4 = await makeDataTransfer(page, { name: `${NAME_BINARY}.bpmn`, binary: true });
  await dropFile(page, '[data-testid="project-sessions-dropzone"]', dt4);
  const stages4 = await waitStage(page);
  const errText4 = await page.locator('[data-testid="session-upload-stage"][data-stage="error"]').first().innerText().catch(() => "");
  check("S4 бинарник: ошибка показана", stages4.includes("error"), stages4.join(","));
  check("S4 бинарник: RU-сообщение 422 (UTF-8)", /UTF-8|текстовым XML/.test(errText4), errText4.slice(0, 80));
  const retryBtn = page.locator('[data-testid="session-upload-retry"]').first();
  check("S4 бинарник: есть кнопка retry", await retryBtn.count() > 0);
  await shot(page, "p6_upload_s4_binary_422");

  // ── Сценарий 6: retry не дублирует сессию ──
  // Retry шлёт тот же бинарник в ту же сессию → снова 422. На error load() не
  // вызывается, таблица stale → считаем строки только после reload: в БД должна
  // быть ровно одна сессия p6binary (create из S4), без дубля от retry.
  await retryBtn.click();
  await waitStage(page);
  await page.reload();
  await openFirstProject(page);
  const rowsAfterRetry = await countSessionRows(page);
  const binaryRows = await page.locator(`${SES_TABLE} tbody tr:has-text("${NAME_BINARY}")`).count();
  check("S6 retry после ошибки не дублирует сессию", rowsAfterRetry === rowsBefore4 + 1 && binaryRows === 1, `rows ${rowsBefore4}→${rowsAfterRetry}, ${NAME_BINARY}=${binaryRows}`);
  await shot(page, "p6_upload_s6_retry_no_duplicate");

  // ── Сценарий 5: файл >20МБ → клиентский лимит ──
  const dt5 = await makeDataTransfer(page, { name: `${NAME_BIG}.bpmn`, size: 20 * 1024 * 1024 + 10 });
  await dropFile(page, '[data-testid="project-sessions-dropzone"]', dt5);
  await page.waitForTimeout(800);
  const errText5 = await page.locator('[data-testid="session-upload-stage"][data-stage="error"]').last().innerText().catch(() => "");
  check("S5 >20МБ: ошибка лимита", /20 МБ/.test(errText5), errText5.slice(0, 80));
  await shot(page, "p6_upload_s5_oversize");

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n== ${results.length - failed}/${results.length} проверок зелёные, скрины ${OUT_DIR}p6_upload_*`);
  fs.writeFileSync(`${OUT_DIR}p6_upload_report.json`, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(2);
});
