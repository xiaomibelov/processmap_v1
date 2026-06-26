import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const BASE_URL = process.env.SMOKE_BASE_URL || "http://clearvestnic.ru:5177";
const API_URL = process.env.SMOKE_API_URL || BASE_URL;

async function getToken() {
  const script = `from app.auth import create_access_token
from app.storage import get_default_org_id, upsert_org_membership
uid = "0217a3f745ae4bb6b72a336dd356f0d8"
org_id = get_default_org_id()
upsert_org_membership(org_id, uid, "admin")
print(create_access_token(uid))
`;
  const localFile = `/tmp/smoke_token_${Date.now()}.py`;
  const containerFile = `/tmp/smoke_token.py`;
  writeFileSync(localFile, script);
  execSync(`docker cp ${localFile} processmap_v1-api-1:${containerFile}`);
  const out = execSync(
    `docker exec processmap_v1-api-1 bash -c "cd /app/backend && PYTHONPATH=/app/backend python -u ${containerFile}"`,
    { encoding: "utf8" },
  );
  return out.trim().split("\n").pop().trim();
}

async function api(token, method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Active-Org-Id": "org_default",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`);
  }
  return data;
}

const bpmnXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1"/>
    <bpmn:subProcess id="Sub_1" name="Subprocess One"/>
    <bpmn:subProcess id="Sub_2" name="Subprocess Two"/>
    <bpmn:subProcess id="Sub_3" name="Subprocess Three"/>
    <bpmn:endEvent id="EndEvent_1"/>
  </bpmn:process>
</bpmn:definitions>`;

async function main() {
  console.log("Generating token...");
  const token = await getToken();
  console.log("Token ok");

  const runId = `${Date.now()}`;
  console.log("Creating project...");
  const project = await api(token, "POST", "/api/projects", { title: `Smoke Subprocess Project ${runId}` });
  const projectId = project.id || project.project_id;
  console.log("Project:", projectId);

  console.log("Creating session...");
  const session = await api(token, "POST", `/api/projects/${projectId}/sessions`, { title: `Smoke Subprocess Session ${runId}` });
  const sessionId = session.id || session.session_id;
  console.log("Session:", sessionId);

  console.log("Saving BPMN with 3 subprocesses...");
  await api(token, "PUT", `/api/sessions/${sessionId}/bpmn`, { xml: bpmnXml, rev: 0 });

  console.log("Checking subprocess count...");
  const count = await api(token, "GET", `/api/sessions/${sessionId}/subprocesses-count`);
  console.log("Count:", count);
  if (count.total !== 3) throw new Error(`Expected count 3, got ${count.total}`);

  console.log("Creating subprocess sessions...");
  const created = await api(token, "POST", `/api/sessions/${sessionId}/create-subprocesses`);
  console.log("Created:", created);
  if (created.created !== 3) throw new Error(`Expected created 3, got ${created.created}`);
  if (created.has_more !== false) throw new Error(`Expected has_more false, got ${created.has_more}`);

  console.log("Listing project sessions for explorer...");
  const workspaceId = project.workspace_id || "";
  const page = await api(token, "GET", `/api/projects/${projectId}/explorer?workspace_id=${workspaceId}&root_only=true&include_children_meta=true`);
  const rows = page.sessions || [];
  const root = rows.find((r) => (r.id || r.session_id) === sessionId);
  if (!root) throw new Error("Root session not found in explorer list");
  console.log("Root children_count:", root.children_count);
  if (root.children_count !== 3) throw new Error(`Expected children_count 3, got ${root.children_count}`);

  console.log("Smoke test passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
