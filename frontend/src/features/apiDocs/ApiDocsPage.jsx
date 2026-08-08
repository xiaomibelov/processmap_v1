import { useEffect, useState } from "react";
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

import { apiRequest } from "../../lib/apiCore.js";
import { withBearerToken } from "./apiDocsAuth.js";
import { convertOpenApi31to30 } from "./openapi30Convert.js";

// Роут /api-docs — Swagger UI внутри SPA (fix: браузерная навигация на
// /api/docs не подставляет Bearer → 401 missing_bearer).
// Спека грузится с /api/openapi.json через API-клиент (Bearer), конвертируется
// 3.1→3.0 на клиенте (swagger-ui@4 не поддерживает 3.1; backend-контракт не
// меняется). requestInterceptor подставляет актуальный Bearer во все запросы
// «Try it out».

export default function ApiDocsPage() {
  const [spec, setSpec] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    void apiRequest("/api/openapi.json")
      .then((r) => {
        if (cancelled) return;
        if (r?.ok && r.data && typeof r.data === "object") {
          setSpec(convertOpenApi31to30(r.data));
        } else {
          setError(`Не удалось загрузить OpenAPI-спецификацию (HTTP ${r?.status || "?"})`);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить OpenAPI-спецификацию (сеть)");
      });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4" data-testid="api-docs-error">
        <div className="rounded-2xl border border-border bg-panel p-6 text-sm text-danger">{error}</div>
      </div>
    );
  }

  return (
    <div className="apiDocsPage" data-testid="api-docs-page" style={{ background: "#ffffff", minHeight: "100vh" }}>
      {spec ? (
        <SwaggerUI
          spec={spec}
          requestInterceptor={withBearerToken}
          docExpansion="list"
          defaultModelsExpandDepth={1}
          displayRequestDuration
          tryItOutEnabled
          persistAuthorization
        />
      ) : (
        <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", color: "#64748b" }}>
          Загружаем спецификацию…
        </div>
      )}
    </div>
  );
}
