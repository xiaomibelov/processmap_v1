import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRemoteUpdateToastKey,
  buildRemoteUpdateToastMessage,
  deriveRemoteVersionActor,
} from "./remoteSessionUpdateToast.js";

test("remote version actor uses display fallback chain from version head", () => {
  assert.equal(deriveRemoteVersionActor({ author_display: "Анна" }).actorLabel, "Анна");
  assert.equal(deriveRemoteVersionActor({ author_name: "Борис" }).actorLabel, "Борис");
  assert.equal(deriveRemoteVersionActor({ author_email: "user@example.test" }).actorLabel, "user@example.test");
  assert.equal(deriveRemoteVersionActor({ created_by: "user_42" }).actorLabel, "user_42");
  assert.equal(deriveRemoteVersionActor({}).actorLabel, "другой пользователь");
});

test("remote version actor detects current user from existing head identity fields", () => {
  assert.equal(deriveRemoteVersionActor({ author_id: "user_me" }, "user_me").isCurrentUser, true);
  assert.equal(deriveRemoteVersionActor({ created_by: "user_me" }, "USER_ME").isCurrentUser, true);
  assert.equal(deriveRemoteVersionActor({ author_email: "me@example.test" }, "me@example.test").isCurrentUser, true);
  assert.equal(deriveRemoteVersionActor({ author_id: "user_other" }, "user_me").isCurrentUser, false);
});

test("remote update toast copy includes actor or honest fallback", () => {
  assert.equal(buildRemoteUpdateToastMessage("Анна"), "Сессию обновил Анна");
  assert.equal(buildRemoteUpdateToastMessage(""), "Сессию обновил другой пользователь");
  assert.equal(buildRemoteUpdateToastMessage("другой пользователь"), "Сессию обновил другой пользователь");
});

test("remote update toast key is stable per session version and head fingerprint", () => {
  assert.equal(
    buildRemoteUpdateToastKey({
      sessionId: "sess_1",
      diagramStateVersion: 12,
      sessionPayloadHash: "hash_a",
      versionId: "ver_a",
    }),
    "sess_1:12:hash_a",
  );
  assert.equal(
    buildRemoteUpdateToastKey({
      sessionId: "sess_1",
      diagramStateVersion: 13,
      versionId: "ver_b",
    }),
    "sess_1:13:ver_b",
  );
});
