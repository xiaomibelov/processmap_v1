import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource() {
  return fs.readFileSync(path.join(__dirname, "ProcessStage.jsx"), "utf8");
}

test("session presence and remote-save highlight path is read-only and does not add save writes", () => {
  const source = readSource();
  assert.equal(
    source.includes("const pollRemoteSessionSnapshot = useCallback(async (reason = \"interval\") => {"),
    true,
  );
  assert.equal(
    source.includes("const head = await apiGetBpmnVersions(sid, { limit: 1 });"),
    true,
  );
  assert.equal(
    source.includes("const fetched = await apiGetSession(sid);"),
    true,
  );
  assert.equal(
    source.includes("versionHeadItem: latestHead,"),
    true,
  );
  assert.equal(
    source.includes("reason: \"head_not_newer\""),
    true,
  );
  assert.equal(
    source.includes("const seenBaselineVersion = Math.max(seenVersionRounded, localVersionRounded);"),
    true,
  );

  const pollBodyMatch = source.match(
    /const pollRemoteSessionSnapshot = useCallback\(async \(reason = "interval"\) => \{([\s\S]*?)\n  \}, \[/,
  );
  assert.notEqual(pollBodyMatch, null);
  const pollBody = String(pollBodyMatch?.[1] || "");
  assert.equal(/apiPatchSession\(/.test(pollBody), false);
  assert.equal(/apiPutBpmnXml\(/.test(pollBody), false);
  assert.equal(/apiGetBpmnVersions\(sid, \{ limit: 1 \}\)/.test(pollBody), true);
  assert.equal(/apiGetSession\(sid\)/.test(pollBody), true);
});

test("passive remote-save notice is queued for manual refresh while own-writes stay auto-synced", () => {
  const source = readSource();
  assert.equal(
    source.includes("const changedElementIds = deriveRemoteChangedElementIds({"),
    true,
  );
  assert.equal(
    source.includes("const applyPendingRemoteSaveRefresh = useCallback(async () => {"),
    true,
  );
  assert.equal(
    source.includes("_sync_source: \"passive_remote_refresh_action\""),
    true,
  );
  assert.equal(
    source.includes("if (sameActor || versionHeadActor.isCurrentUser === true) {"),
    true,
  );
  assert.equal(
    source.includes("_sync_source: `${source}_self_actor_sync`"),
    true,
  );
  assert.equal(
    source.includes("pendingRefresh: true"),
    true,
  );
  assert.equal(
    source.includes("bpmnRef.current?.flashNode?.(elementId, \"sync\", { label: \"Remote\" });"),
    true,
  );
});

test("remote update toast uses version head actor, preserves refresh action, and dedupes by key", () => {
  const source = readSource();
  assert.equal(
    source.includes("deriveRemoteVersionActor(versionHeadItem, currentUserId)"),
    true,
  );
  assert.equal(
    source.includes("buildRemoteUpdateToastMessage(remoteSaveHighlightView?.remoteToastActorLabel)"),
    true,
  );
  assert.equal(
    source.includes("buildRemoteUpdateToastKey({"),
    true,
  );
  assert.equal(
    source.includes("remoteUpdateToastLastShownKeyRef.current === remoteToastKey"),
    true,
  );
  assert.equal(
    source.includes("remoteUpdateToastDismissedKeyRef.current === remoteToastKey"),
    true,
  );
  assert.equal(
    source.includes("actionLabel: \"Обновить сессию\""),
    true,
  );
  assert.equal(
    source.includes("description: \"Обновите сессию, чтобы увидеть актуальную версию.\""),
    true,
  );
  assert.equal(
    source.includes("persistent: true"),
    true,
  );
  assert.equal(
    source.includes("requestedKind !== \"remote_update\"")
      && source.includes("remoteUpdateToastDismissedKeyRef.current !== activeRemoteUpdateKey"),
    true,
  );
  assert.equal(
    source.includes("void applyPendingRemoteSaveRefresh();"),
    true,
  );
});

test("bpmnSync is initialized before passive refresh callback to avoid TDZ boot crash", () => {
  const source = readSource();
  const bpmnSyncInitIdx = source.indexOf("const bpmnSync = useBpmnSync({");
  const passiveRefreshIdx = source.indexOf("const applyPendingRemoteSaveRefresh = useCallback(async () => {");
  assert.notEqual(bpmnSyncInitIdx, -1);
  assert.notEqual(passiveRefreshIdx, -1);
  assert.equal(bpmnSyncInitIdx < passiveRefreshIdx, true);
});
