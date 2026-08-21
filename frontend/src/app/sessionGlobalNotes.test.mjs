import { describe, it } from "node:test";
import assert from "node:assert";
import {
  normalizeGlobalNoteItem,
  normalizeGlobalNotes,
  mergeGlobalNotesLists,
} from "./sessionGlobalNotes.js";

describe("sessionGlobalNotes", () => {
  it("normalizes a note item with fallbacks (text keys, ts parsing, author 'by', id)", () => {
    const item = normalizeGlobalNoteItem({ note: "  hello  ", created_at: "2026-07-01T10:00:00Z", by: "ops" }, 2);
    assert.ok(item);
    assert.strictEqual(item.text, "hello");
    assert.strictEqual(item.ts, Date.parse("2026-07-01T10:00:00Z"));
    assert.strictEqual(item.author, "ops");
    assert.match(item.id, /^note_\d+_3$/);
  });

  it("drops items without text", () => {
    assert.strictEqual(normalizeGlobalNoteItem({ text: "   " }), null);
    assert.strictEqual(normalizeGlobalNoteItem(null), null);
    assert.strictEqual(normalizeGlobalNoteItem(""), null);
    // A raw non-empty primitive becomes its own text (plain-text notes).
    assert.strictEqual(normalizeGlobalNoteItem(42).text, "42");
  });

  it("parses arrays, single objects, JSON strings and plain text", () => {
    assert.strictEqual(normalizeGlobalNotes([{ text: "a" }]).length, 1);
    assert.strictEqual(normalizeGlobalNotes({ text: "a" }).length, 1);
    assert.strictEqual(normalizeGlobalNotes('[{"text":"a"},{"text":"b"}]').length, 2);
    const plain = normalizeGlobalNotes("just text");
    assert.strictEqual(plain.length, 1);
    assert.strictEqual(plain[0].text, "just text");
    assert.deepStrictEqual(normalizeGlobalNotes(""), []);
    assert.deepStrictEqual(normalizeGlobalNotes(null), []);
  });

  it("sorts ascending (oldest first) by default", () => {
    const notes = normalizeGlobalNotes([
      { id: "n2", text: "b", ts: 200 },
      { id: "n1", text: "a", ts: 100 },
    ]);
    assert.deepStrictEqual(notes.map((n) => n.id), ["n1", "n2"]);
  });

  it("sorts descending (newest first) with order: 'desc' (sidebar feed)", () => {
    const notes = normalizeGlobalNotes(
      [
        { id: "n1", text: "a", ts: 100 },
        { id: "n2", text: "b", ts: 200 },
      ],
      { order: "desc" },
    );
    assert.deepStrictEqual(notes.map((n) => n.id), ["n2", "n1"]);
  });

  it("breaks ts ties by id regardless of order", () => {
    const asc = normalizeGlobalNotes([
      { id: "b", text: "x", ts: 100 },
      { id: "a", text: "y", ts: 100 },
    ]);
    assert.deepStrictEqual(asc.map((n) => n.id), ["a", "b"]);
    const desc = normalizeGlobalNotes(
      [
        { id: "b", text: "x", ts: 100 },
        { id: "a", text: "y", ts: 100 },
      ],
      { order: "desc" },
    );
    assert.deepStrictEqual(desc.map((n) => n.id), ["a", "b"]);
  });

  it("merges lists deduping by id and by text|ts|author signature, ascending", () => {
    const merged = mergeGlobalNotesLists(
      [{ id: "n1", text: "same", ts: 100, author: "you" }],
      [
        { id: "n1", text: "same", ts: 100, author: "you" },
        { id: "n2", text: "same", ts: 100, author: "you" },
        { id: "n3", text: "other", ts: 50, author: "ops" },
      ],
    );
    assert.deepStrictEqual(merged.map((n) => n.id), ["n3", "n1"]);
  });
});
