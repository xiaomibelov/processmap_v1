import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

const scriptPath = new URL("./processmap_docker_egress_persist.sh", import.meta.url);
const unitPath = new URL("../systemd/processmap-docker-egress.service", import.meta.url);
const timerPath = new URL("../systemd/processmap-docker-egress.timer", import.meta.url);
const runbookPath = new URL("../../DEPLOY_RUNBOOK.md", import.meta.url);

test("docker egress persistence script encodes the safe DOCKER-USER contract", async () => {
  const script = await readFile(scriptPath, "utf8");

  assert.match(script, /case "\$\{1:-verify\}" in/);
  assert.match(script, /\bapply\)/);
  assert.match(script, /\brollback\)/);
  assert.match(script, /\bverify\)/);
  assert.match(script, /ip route show default/);
  assert.match(script, /DOCKER-USER/);
  assert.match(script, /iptables -C "\$chain"/);
  assert.match(script, /iptables -I "\$chain"/);
  assert.match(script, /iptables -D "\$chain"/);
  assert.match(script, /processmap-docker-egress/);
  assert.match(script, /-m comment --comment "\$rule_comment"/);
  assert.match(script, /app_default/);
  assert.match(script, /processmap_stage_default/);
  assert.match(script, /processmap_edge_net/);
  assert.match(script, /app-api-1/);
  assert.match(script, /processmap_stage-api-1/);
});

test("systemd unit reapplies egress rules after Docker and UFW", async () => {
  const unit = await readFile(unitPath, "utf8");

  assert.match(unit, /\[Unit\]/);
  assert.match(unit, /After=.*docker\.service/);
  assert.match(unit, /After=.*ufw\.service/);
  assert.match(unit, /After=.*network-online\.target/);
  assert.match(unit, /Type=oneshot/);
  assert.doesNotMatch(unit, /RemainAfterExit=yes/);
  assert.match(unit, /ExecStart=.*processmap_docker_egress_persist\.sh apply/);
  assert.match(unit, /WantedBy=.*docker\.service/);
  assert.match(unit, /WantedBy=.*ufw\.service/);
});

test("systemd timer periodically reapplies idempotent egress rules", async () => {
  const timer = await readFile(timerPath, "utf8");

  assert.match(timer, /\[Timer\]/);
  assert.match(timer, /OnBootSec=30s/);
  assert.match(timer, /OnUnitInactiveSec=30s/);
  assert.match(timer, /Unit=processmap-docker-egress\.service/);
  assert.match(timer, /WantedBy=timers\.target/);
});

test("runbook documents install verification and rollback for Docker egress persistence", async () => {
  const runbook = await readFile(runbookPath, "utf8");

  assert.match(runbook, /Docker egress persistence/);
  assert.match(runbook, /processmap-docker-egress\.service/);
  assert.match(runbook, /daemon-reload/);
  assert.match(runbook, /systemctl enable --now processmap-docker-egress\.service/);
  assert.match(runbook, /systemctl enable --now processmap-docker-egress\.timer/);
  assert.match(runbook, /systemctl disable --now processmap-docker-egress\.timer/);
  assert.match(runbook, /processmap_docker_egress_persist\.sh rollback/);
  assert.match(runbook, /network-20260811-124357\/runtime-fix-rollback-20260811-132311\.sh/);
  assert.match(runbook, /Docker daemon restart/);
  assert.match(runbook, /maintenance window/);
});
