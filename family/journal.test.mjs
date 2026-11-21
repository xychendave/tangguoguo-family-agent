import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore, day, candidates } from "./store.mjs";
import { validateAnswer, askModel } from "./model.mjs";
test("notebooks, dates, children, persistence and deletion", () => {
  const path = mkdtempSync(join(tmpdir(), "family-test-"));
  let store = openStore(join(path, "db"));
  try {
    assert.equal(store.children("home").length, 0);
    const child = store.children("demo")[0];
    const note = {
      author: "Parent",
      child,
      body: "Gecko toes on glass",
      kind: "quote",
      date: day(),
    };
    const id = store.add("home", note);
    store.add("home", { ...note, body: "Old gecko drawing", date: day(-20) });
    store.add("home", {
      ...note,
      child: "Other",
      body: "Private to other scope",
    });
    assert.throws(() => store.add("home", { ...note, date: "2024-02-31" }));
    store.close();
    store = openStore(join(path, "db"));
    assert.deepEqual(
      store.list("home", child, 14).map((n) => n.id),
      [id],
    );
    assert(!store.list("demo", child, 0).some((n) => n.id === id));
    assert.throws(() => store.remove("demo", id));
    const rows = store.list("home", child, 0);
    assert.equal(candidates(rows, "old drawing")[0].body, "Old gecko drawing");
    store.remove("home", id);
    assert.equal(store.list("home", child, 14).length, 0);
  } finally {
    store.close();
    rmSync(path, { recursive: true, force: true });
  }
});
test("model citations resolve only to supplied evidence", async () => {
  const rows = [{ id: "note1" }];
  const result = (refs) => ({
    findings: [{ text: "Saw a gecko", refs }],
    followup: "",
  });
  assert.deepEqual(validateAnswer(result([1]), rows).findings[0].ids, [
    "note1",
  ]);
  for (const bad of [[0], [2], ["1"], []])
    assert.throws(() => validateAnswer(result(bad), rows));
  assert.deepEqual(await askModel([], "anything", "unused"), {
    findings: [],
    followup: "",
  });
});
