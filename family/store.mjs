import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { searchBm25 } from "../packages/knowledge-format/src/search.ts";

export const labels = JSON.parse(
  readFileSync(
    new URL("../apps/web/src/i18n/locales/family.zh-CN.json", import.meta.url),
  ),
);
export const kinds = ["observation", "quote", "work"];
export function day(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
export function invalid(code = "INVALID_INPUT", status = 400) {
  return Object.assign(new Error(code), { code, status });
}
export function field(value, limit) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > limit)
    throw invalid();
  return value.trim();
}
export function book(value) {
  if (value !== "demo" && value !== "home") throw invalid();
  return value;
}
export function openStore(file) {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY, book TEXT NOT NULL, child TEXT NOT NULL, author TEXT NOT NULL,
      kind TEXT NOT NULL, body TEXT NOT NULL, date TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS notes_scope ON notes(book, child, date);
    CREATE TABLE IF NOT EXISTS flags (key TEXT PRIMARY KEY);`);
  const insert = db.prepare("INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?)");
  function add(scope, data) {
    const id = randomUUID();
    const date = field(data.date, 10);
    const stamp = Date.parse(date + "T12:00:00Z");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(stamp) ||
      new Date(stamp).toISOString().slice(0, 10) !== date ||
      date > day() ||
      !kinds.includes(data.kind)
    )
      throw invalid();
    insert.run(
      id,
      book(scope),
      field(data.child, 40),
      field(data.author, 40),
      data.kind,
      field(data.body, 2000),
      date,
    );
    return id;
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    if (
      db.prepare("INSERT OR IGNORE INTO flags VALUES ('sample-v1')").run()
        .changes
    ) {
      for (const [author, child, kind, body, ago] of labels.samples)
        add("demo", { author, child, kind, body, date: day(-ago) });
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return {
    add,
    close: () => db.close(),
    children(scope) {
      return db
        .prepare("SELECT DISTINCT child FROM notes WHERE book=? ORDER BY child")
        .all(book(scope))
        .map((row) => row.child);
    },
    list(scope, child, days) {
      if (![0, 7, 14, 30].includes(days)) throw invalid();
      return db
        .prepare(
          "SELECT id,child,author,kind,body,date FROM notes WHERE book=? AND child=? AND date>=? ORDER BY date DESC,rowid DESC",
        )
        .all(book(scope), field(child, 40), days ? day(1 - days) : "");
    },
    remove(scope, id) {
      if (
        !db
          .prepare("DELETE FROM notes WHERE book=? AND id=?")
          .run(book(scope), field(id, 40)).changes
      )
        throw invalid("NOT_FOUND", 404);
    },
  };
}
export function candidates(rows, query) {
  const matches = searchBm25(
    rows.map((row) => ({ value: row, text: row.body })),
    query,
  ).map((hit) => hit.value);
  // Include recent context even for open-ended questions with no lexical match.
  return [
    ...new Map(
      [...matches.slice(0, 8), ...rows.slice(0, 6)].map((row) => [row.id, row]),
    ).values(),
  ];
}
