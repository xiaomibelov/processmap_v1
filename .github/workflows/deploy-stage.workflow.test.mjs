import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("./deploy-stage.yml", import.meta.url), "utf8");

test("stage deploy builds images on GitHub and never builds on the stage host", () => {
  assert.match(workflow, /docker\/build-push-action@/);
  assert.match(workflow, /docker save/);
  assert.match(workflow, /docker load/);
  assert.match(workflow, /up -d --no-build --no-deps --force-recreate -V api frontend notifications/);
  assert.doesNotMatch(
    workflow,
    /docker compose \\\n\s+--env-file \.env\.stage[\s\S]*?\n\s+build --no-cache api frontend notifications/,
  );
});

test("stage deploy is isolated from prod compose and prod env", () => {
  assert.match(workflow, /-p processmap_stage/);
  assert.match(workflow, /\.env\.stage/);
  assert.match(workflow, /processmap_stage-api:\$\{DEPLOY_SHA\}/);
  assert.match(workflow, /processmap_stage-frontend:\$\{DEPLOY_SHA\}/);
  assert.match(workflow, /processmap_stage-notifications:\$\{DEPLOY_SHA\}/);
  assert.doesNotMatch(workflow, /prod\.env/);
  assert.doesNotMatch(workflow, /-p app\b/);
});

test("stage deploy has preflight before mutating stage state", () => {
  assert.match(workflow, /\[deploy-stage\] preflight: stage boundary/);
  assert.match(workflow, /com\.docker\.compose\.project=processmap_stage/);
  assert.match(workflow, /com\.docker\.compose\.project=app/);
  assert.match(workflow, /STAGE_IMAGE_TAG=\$\{DEPLOY_SHA\}/);
});

test("stage checkout preserves server-only config files", () => {
  assert.match(workflow, /PRESERVE_DIR="\$\(mktemp -d \/tmp\/processmap-stage-preserve/);
  assert.match(workflow, /\.env\.stage/);
  assert.match(workflow, /docker-compose\.ssl\.yml/);
  assert.match(workflow, /docker-compose\.prod\.yml/);
  assert.match(workflow, /docker-compose\.prod\.gateway\.yml/);
  assert.match(workflow, /backend\/alembic\.stage\.ini/);
  assert.match(workflow, /git checkout -f "\$\{DEPLOY_SHA\}"/);
});
