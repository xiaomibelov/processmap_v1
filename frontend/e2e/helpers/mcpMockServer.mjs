import http from "node:http";
import { hasDiMarkers, makeBigDiagramXml } from "./bpmnFixtures.mjs";

// Dev-only MCP mock for e2e helper smoke:
// node frontend/e2e/helpers/mcpMockServer.mjs
// E2E_BPMN_MCP_URL=http://127.0.0.1:65534/mcp node --input-type=module -e "import {makeBigDiagramXmlOptional,fnv1aHex,hasDiMarkers} from './frontend/e2e/helpers/bpmnFixtures.mjs'; const r=await makeBigDiagramXmlOptional({seed:20260220,pools:1,lanes:2,tasks:2,edges:3,annotations:1}); const xml=String(r?.xml||''); const hasFlow=/<(?:\\w+:)?sequenceFlow\\b/.test(xml); console.log('[MCP_SMOKE] source='+String(r?.source||'')); console.log('[MCP_SMOKE] xmlLen='+xml.length+' xmlHash='+fnv1aHex(xml)+' hasDI='+(hasDiMarkers(xml)?'true':'false')+' hasFlow='+(hasFlow?'true':'false'));"
const HOST = String(process.env.E2E_MCP_MOCK_HOST || "127.0.0.1");
const PORT = Number(process.env.E2E_MCP_MOCK_PORT || 65534);
const MCP_PATH = String(process.env.E2E_MCP_MOCK_PATH || "/mcp");
const MAX_BODY_BYTES = 1024 * 1024;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const method = String(req.method || "").toUpperCase();
  const urlRaw = String(req.url || "");
  const url = new URL(urlRaw || "/", `http://${HOST}:${PORT}`);

  if (method !== "POST" || url.pathname !== MCP_PATH) {
    sendJson(res, 404, { ok: false, error: "not_found" });
    return;
  }

  let bodyText = "";
  let body = {};
  try {
    bodyText = await readBody(req);
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "invalid_json", detail: String(error?.message || error) });
    return;
  }

  const kind = String(body?.kind || "").trim();
  if (kind !== "big_bpmn_fixture") {
    sendJson(res, 400, { ok: false, error: "unsupported_kind", expected: "big_bpmn_fixture", got: kind || null });
    return;
  }

  const options = body?.options && typeof body.options === "object" ? body.options : {};
  const xml = makeBigDiagramXml(options);
  if (!String(xml || "").trim() || !hasDiMarkers(xml)) {
    sendJson(res, 500, { ok: false, error: "xml_generation_failed" });
    return;
  }

  sendJson(res, 200, { ok: true, xml });
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`listening on http://${HOST}:${PORT}${MCP_PATH}`);
});

function shutdown(signalName) {
  server.close(() => {
    // eslint-disable-next-line no-console
    console.log(`stopped (${signalName})`);
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
