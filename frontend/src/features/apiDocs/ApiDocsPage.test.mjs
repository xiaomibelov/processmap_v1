// Роут /api-docs (Swagger UI внутри SPA): requestInterceptor с Bearer (unit),
// source-проверки страницы/гварда/кнопки. Рендер SwaggerUI — ручная проверка
// в браузере (swagger-ui-react не живёт в node ESM; см. скрины в PR).
// Запуск: node --test src/features/apiDocs/ApiDocsPage.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "../../..");

import { withBearerToken } from "./apiDocsAuth.js";
import { setAccessToken } from "../../lib/apiCore.js";

// ---------------------------------------------------------------- unit
test("withBearerToken: актуальный Bearer-токен API-клиента подставляется в заголовок", () => {
  setAccessToken("secret-token-123");
  const req = { headers: { Accept: "application/json" } };
  const out = withBearerToken(req);
  assert.equal(out.headers.Authorization, "Bearer secret-token-123");
  assert.equal(out.headers.Accept, "application/json", "остальные заголовки сохранены");
  setAccessToken("");
});

test("withBearerToken: без токена заголовок не добавляется", () => {
  setAccessToken("");
  const out = withBearerToken({ headers: {} });
  assert.equal(out.headers.Authorization, undefined);
});

test("withBearerToken: существующий Authorization перезаписывается актуальным токеном", () => {
  setAccessToken("fresh-token");
  const out = withBearerToken({ headers: { Authorization: "Bearer stale" } });
  assert.equal(out.headers.Authorization, "Bearer fresh-token");
  setAccessToken("");
});

// ---------------------------------------------------------------- source
test("ApiDocsPage: SwaggerUI из swagger-ui-react, спека через API-клиент с Bearer + конвертер 3.1→3.0", () => {
  const src = fs.readFileSync(path.join(FRONTEND_ROOT, "src/features/apiDocs/ApiDocsPage.jsx"), "utf8");
  assert.match(src, /import SwaggerUI from "swagger-ui-react"/);
  assert.match(src, /import "swagger-ui-react\/swagger-ui.css"/);
  assert.match(src, /apiRequest\("\/api\/openapi_ru.json"\)/, "русская обогащённая спека (защищённый эндпоинт)");
  assert.match(src, /convertOpenApi31to30/, "конвертер 3.1→3.0 на клиенте (страховка)");
  assert.match(src, /spec=\{spec\}/);
  assert.match(src, /requestInterceptor=\{withBearerToken\}/);
  assert.match(src, /tryItOutEnabled/, "«Try it out» включён");
  assert.match(src, /data-testid="api-docs-page"/);
  assert.doesNotMatch(src, /window\.open|target=/, "без внешней навигации — внутри SPA");
});

test("RootApp: роут /api-docs защищён правом canOpenOrgSettings (паттерн /admin)", () => {
  const src = fs.readFileSync(path.join(FRONTEND_ROOT, "src/RootApp.jsx"), "utf8");
  assert.match(src, /wantsApiDocs = pathname === "\/api-docs"/);
  assert.match(src, /canOpenOrgSettings\(user, orgItems, activeOrgId\)/, "то же право, что у кнопки");
  assert.match(src, /<ApiDocsPage \/>/);
  assert.match(src, /api-docs-access-denied/, "access-denied без права");
  assert.match(src, /navigate\("\/api-docs", \{ replace: true \}\)/, "после логина — на /api-docs");
});

test("TopBar: кнопка ведёт на внутренний /api-docs (не target=_blank на /api/docs)", () => {
  const src = fs.readFileSync(path.join(FRONTEND_ROOT, "src/components/TopBar.jsx"), "utf8");
  assert.match(src, /href="\/api-docs"/);
  const block = src.split('data-testid="topbar-api-docs-button"')[0].slice(-400);
  assert.ok(!/target="_blank"/.test(block), "кнопка без target=_blank");
});

test("package.json: swagger-ui-react — явная зависимость", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(FRONTEND_ROOT, "package.json"), "utf8"));
  assert.ok(pkg.dependencies?.["swagger-ui-react"], "swagger-ui-react в dependencies");
});
