// LLM4 — мок DeepSeek API (OpenAI-формат) для локального гейта.
// POST /v1/chat/completions: Bearer sk-bad → 401; иначе 200 с JSON-ответом
// по action в промпте (suggest_next/explain_step/step_qa). Задержка 700ms —
// чтобы гейт ловил skeleton S4 (>300ms). Запуск: node scripts/llm4_mock_llm.mjs
import http from "node:http";

const PORT = Number(process.env.MOCK_LLM_PORT || 8099);
const DELAY_MS = Number(process.env.MOCK_LLM_DELAY || 700);

const ANSWERS = {
  suggest_next: {
    candidates: [
      { code: "measure_temperature", rationale: "контроль температуры супа (мок)" },
      { code: "move", rationale: "перенос контейнера манипулятором (мок)" },
    ],
    note: "мок-ответ гейта LLM4",
  },
  explain_step: {
    explanation: "Мок-объяснение: робот перетаривает суп из контейнера-1 в контейнер-2 — решение AI по трассировке трансформации.",
    note: "мок",
  },
  step_qa: { answer: "Мок-ответ: нагрев до 75 °C нужен для стерилизации супа.", note: "мок" },
};

const server = http.createServer((req, res) => {
  if (req.method === "POST" && String(req.url || "").startsWith("/v1/chat/completions")) {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const auth = String(req.headers.authorization || "");
      if (auth.includes("sk-bad")) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "invalid api key (mock)" } }));
        return;
      }
      let action = "step_qa";
      if (body.includes("suggest_next")) action = "suggest_next";
      else if (body.includes("explain_step")) action = "explain_step";
      const payload = ANSWERS[action] || ANSWERS.step_qa;
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          model: "mock-deepseek-chat",
          choices: [{ message: { role: "assistant", content: JSON.stringify(payload) } }],
          usage: { prompt_tokens: 42, completion_tokens: 18 },
        }));
      }, DELAY_MS);
    });
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[llm4-mock] DeepSeek mock on :${PORT} (delay ${DELAY_MS}ms)`);
});
