import { getAccessToken } from "../../lib/apiCore.js";

// requestInterceptor для Swagger UI (роут /api-docs): актуальный Bearer-токен
// API-клиента подставляется во ВСЕ запросы из Swagger UI — загрузка спеки
// /api/openapi.json и «Try it out» (fix 401 missing_bearer при переходе по кнопке).
export function withBearerToken(req) {
  const token = getAccessToken();
  if (token) {
    req.headers = { ...(req.headers || {}), Authorization: `Bearer ${token}` };
  }
  return req;
}
