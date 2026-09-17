import test from "node:test";
import assert from "node:assert/strict";

import { apiRoutes } from "./apiRoutes.js";

test("apiRoutes: analytics properties export passes filters and search", () => {
  const base = apiRoutes.analytics.exportPropertiesCsv("folder", "fld_1");
  assert.equal(base, "/api/analytics/properties/export.csv?scope=folder&scope_id=fld_1");

  const full = apiRoutes.analytics.exportPropertiesCsv("folder", "fld_1", {
    type_filter: ["Camunda property"],
    category_filter: ["extensionProperties"],
    source_filter: ["Сессия А", "Сессия Б"],
    search: "картофель",
  });
  const url = new URL(full, "http://local");
  assert.equal(url.pathname, "/api/analytics/properties/export.csv");
  assert.equal(url.searchParams.get("scope"), "folder");
  assert.equal(url.searchParams.get("scope_id"), "fld_1");
  assert.equal(url.searchParams.get("type_filter"), "Camunda property");
  assert.equal(url.searchParams.get("category_filter"), "extensionProperties");
  assert.deepEqual(url.searchParams.getAll("source_filter"), ["Сессия А", "Сессия Б"]);
  assert.equal(url.searchParams.get("search"), "картофель");

  const xlsx = apiRoutes.analytics.exportPropertiesXlsx("project", "prj_1", { search: "пюре" });
  const xurl = new URL(xlsx, "http://local");
  assert.equal(xurl.pathname, "/api/analytics/properties/export.xlsx");
  assert.equal(xurl.searchParams.get("scope"), "project");
  assert.equal(xurl.searchParams.get("search"), "пюре");
  assert.equal(xurl.searchParams.get("source_filter"), null);
});
