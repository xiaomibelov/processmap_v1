# Stage Deploy GitHub Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make stage deploy independent of broken Docker bridge egress on the stage host by building images in GitHub Actions and deploying them to the `processmap_stage` compose project with `up --no-build`.

**Architecture:** The workflow builds `api`, `frontend`, and `notifications` images on the GitHub runner with stage-only tags, transfers a gzipped `docker save` bundle to the stage host, runs read-only/isolation preflight checks, loads images, updates only `.env.stage` metadata/image tag, and recreates only stage services. Production remains isolated by compose project name `processmap_stage`, stage image names, and `.env.stage`.

**Tech Stack:** GitHub Actions, Docker buildx, Docker Compose, SSH/SCP deploy actions, Node.js `node --test` static workflow checks.

---

### Task 1: Add Workflow Contract Test

**Files:**
- Create: `.github/workflows/deploy-stage.workflow.test.mjs`

- [ ] **Step 1: Write the failing test**

Create a Node test that reads `.github/workflows/deploy-stage.yml` and asserts the stage-only deployment contract:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("./deploy-stage.yml", import.meta.url), "utf8");

test("stage deploy builds images on GitHub and never builds on the stage host", () => {
  assert.match(workflow, /docker\/build-push-action@/);
  assert.match(workflow, /docker save/);
  assert.match(workflow, /docker load/);
  assert.match(workflow, /up -d --no-build --no-deps --force-recreate -V api frontend notifications/);
  assert.doesNotMatch(workflow, /docker compose \\\n\s+--env-file \.env\.stage[\s\S]*?\n\s+build --no-cache api frontend notifications/);
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
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test .github/workflows/deploy-stage.workflow.test.mjs
```

Expected: FAIL because current workflow builds on the stage host and has no image transfer/load contract.

### Task 2: Convert Stage Workflow to GitHub-Built Images

**Files:**
- Modify: `.github/workflows/deploy-stage.yml`
- Modify: `docker-compose.stage.yml`

- [ ] **Step 1: Add stage-only image tags to compose override**

In `docker-compose.stage.yml`, add `image` entries for only stage services:

```yaml
services:
  api:
    image: processmap_stage-api:${STAGE_IMAGE_TAG:-local}

  frontend:
    image: processmap_stage-frontend:${STAGE_IMAGE_TAG:-local}

  notifications:
    image: processmap_stage-notifications:${STAGE_IMAGE_TAG:-local}
```

Keep existing `build` definitions in base compose for local/prod compatibility; stage workflow will use `up --no-build`.

- [ ] **Step 2: Update workflow build path**

Add checkout/buildx steps, build three images on the GitHub runner with tags:

```yaml
processmap_stage-api:${{ github.sha }}
processmap_stage-frontend:${{ github.sha }}
processmap_stage-notifications:${{ github.sha }}
```

Save them into `/tmp/processmap-stage-images-${{ github.sha }}.tar.gz`.

- [ ] **Step 3: Transfer image bundle to stage host**

Use `appleboy/scp-action` to copy only that tarball to `/tmp/processmap-stage-images-${{ github.sha }}.tar.gz` on the stage host.

- [ ] **Step 4: SSH deploy without host build**

In the SSH script:

```bash
docker load -i "${IMAGE_BUNDLE}"
export STAGE_IMAGE_TAG="${DEPLOY_SHA}"
APP_ENV_FILE=.env.stage docker compose \
  --env-file .env.stage \
  -f docker-compose.yml \
  -f docker-compose.stage.yml \
  -p processmap_stage \
  up -d --no-build --no-deps --force-recreate -V api frontend notifications
```

Do not run `docker compose build` on stage.

- [ ] **Step 5: Preserve and finish freshness checks**

Keep `stage_freshness_proof.sh prepare-source` and `verify-chain`, and continue updating build metadata in `.env.stage`.

### Task 3: Verify and Commit

**Files:**
- Test: `.github/workflows/deploy-stage.workflow.test.mjs`

- [ ] **Step 1: Run workflow contract test**

```bash
node --test .github/workflows/deploy-stage.workflow.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Review diff for prod isolation**

```bash
git diff -- .github/workflows/deploy-stage.yml docker-compose.stage.yml .github/workflows/deploy-stage.workflow.test.mjs
```

Expected: only stage workflow and stage compose override changed; no prod workflow, no prod env, no project `app` deployment.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-stage.yml docker-compose.stage.yml .github/workflows/deploy-stage.workflow.test.mjs docs/superpowers/plans/2026-08-11-stage-deploy-github-images.md
git commit -m "fix(stage-deploy): ship github-built images"
```
