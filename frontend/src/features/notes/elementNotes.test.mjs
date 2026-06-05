import { describe, it } from "node:test";
import assert from "node:assert";
import {
  normalizeElementNotesMap,
  withAddedElementNote,
  withUpdatedElementNote,
  withRemovedElementNote,
} from "./elementNotes.js";

describe("elementNotes", () => {
  it("adds note with author", () => {
    const map = withAddedElementNote({}, "Task_1", "hello", {
      author: "Ivan",
      author_name: "Ivan Petrov",
      author_email: "ivan@example.test",
      userId: "user_ivan",
    });
    const items = map["Task_1"].items;
    assert.equal(items.length, 1);
    assert.equal(items[0].text, "hello");
    assert.equal(items[0].author, "Ivan");
    assert.equal(items[0].author_name, "Ivan Petrov");
    assert.equal(items[0].author_email, "ivan@example.test");
  });

  it("update changes author to current user", () => {
    let map = withAddedElementNote({}, "Task_1", "hello", {
      author: "Ivan",
      author_name: "Ivan Petrov",
    });
    const noteId = map["Task_1"].items[0].id;
    map = withUpdatedElementNote(map, "Task_1", noteId, "updated", {
      author: "Maria",
      author_name: "Maria Sidorova",
      author_email: "maria@example.test",
      userId: "user_maria",
    });
    const items = map["Task_1"].items;
    assert.equal(items.length, 1);
    assert.equal(items[0].text, "updated");
    assert.equal(items[0].author, "Maria");
    assert.equal(items[0].author_name, "Maria Sidorova");
    assert.equal(items[0].author_email, "maria@example.test");
  });

  it("remove deletes note by id", () => {
    let map = withAddedElementNote({}, "Task_1", "hello");
    const noteId = map["Task_1"].items[0].id;
    map = withAddedElementNote(map, "Task_1", "world");
    assert.equal(map["Task_1"].items.length, 2);
    map = withRemovedElementNote(map, "Task_1", noteId);
    assert.equal(map["Task_1"].items.length, 1);
    assert.equal(map["Task_1"].items[0].text, "world");
  });

  it("remove cleans up empty entry", () => {
    let map = withAddedElementNote({}, "Task_1", "hello");
    const noteId = map["Task_1"].items[0].id;
    map = withRemovedElementNote(map, "Task_1", noteId);
    assert.equal(map["Task_1"], undefined);
  });

  it("normalize preserves author fields", () => {
    const map = normalizeElementNotesMap({
      Task_1: {
        items: [
          {
            id: "n1",
            text: "legacy",
            author: "legacy_user",
            authorName: "Legacy User",
            authorEmail: "legacy@example.test",
          },
        ],
      },
    });
    const item = map["Task_1"].items[0];
    assert.equal(item.author, "legacy_user");
    assert.equal(item.author_name, "Legacy User");
    assert.equal(item.author_email, "legacy@example.test");
  });
});
