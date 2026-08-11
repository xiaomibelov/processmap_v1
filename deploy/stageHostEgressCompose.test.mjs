import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const stageCompose = readFileSync(new URL("../docker-compose.stage.yml", import.meta.url), "utf8");
const stageFrontendNginx = readFileSync(new URL("nginx/frontend.stage.host-api.conf", import.meta.url), "utf8");

function serviceBlock(source, serviceName) {
  const match = source.match(new RegExp(`^  ${serviceName}:\\n([\\s\\S]*?)(?=^  [a-zA-Z0-9_-]+:|^networks:|\\z)`, "m"));
  assert.ok(match, `service ${serviceName} exists`);
  return match[1];
}

test("stage api and celery use host egress while preserving postgres/redis names", () => {
  for (const service of ["api", "celery-worker"]) {
    const block = serviceBlock(stageCompose, service);

    assert.match(block, /^    network_mode: host$/m, `${service} uses host network for LLM egress`);
    assert.match(block, /^    extra_hosts:$/m, `${service} keeps explicit host mappings`);
    assert.match(block, /^      - "postgres:172\.20\.0\.2"$/m, `${service} maps postgres to stage bridge IP`);
    assert.match(block, /^      - "redis:172\.20\.0\.3"$/m, `${service} maps redis to stage bridge IP`);
    assert.match(block, /^    ports: !override \[\]$/m, `${service} does not publish host ports through compose`);
  }
});

test("stage frontend proxies api traffic to the host-network api", () => {
  const frontend = serviceBlock(stageCompose, "frontend");

  assert.match(
    frontend,
    /^      - \.\/deploy\/nginx\/frontend\.stage\.host-api\.conf:\/etc\/nginx\/conf\.d\/default\.conf:ro$/m,
    "stage frontend mounts the stage-only nginx upstream override",
  );
  assert.match(stageFrontendNginx, /set \$api_host 172\.20\.0\.1;/, "frontend nginx points at host gateway");
  assert.match(stageFrontendNginx, /proxy_pass http:\/\/\$api_host:8000;/, "frontend nginx keeps API proxy contract");
});
