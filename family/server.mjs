import http from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import {
  book,
  candidates,
  field,
  invalid,
  labels,
  openStore,
  day,
} from "./store.mjs";
import { askModel } from "./model.mjs";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "4187" },
    "data-dir": { type: "string" },
    model: { type: "string", default: "qwen2.5:14b" },
  },
});
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error("Invalid port");
const directory =
  values["data-dir"] ??
  join(homedir(), "Library", "Application Support", "Tangguoguo Family");
process.umask(0o077);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const store = openStore(join(directory, "journal.sqlite"));
const assets = new Map([
  ["/", ["index.html", "text/html"]],
  ["/ui.js", ["ui.js", "text/javascript"]],
  ["/style.css", ["style.css", "text/css"]],
]);
const hosts = new Set(["127.0.0.1:" + port, "localhost:" + port]);
async function payload(req) {
  if (
    req.headers["content-type"]?.split(";")[0] !== "application/json" ||
    req.headers["x-family-request"] !== "1"
  )
    throw invalid("UNSUPPORTED_REQUEST", 415);
  const chunks = [];
  let size = 0;
  for await (const data of req) {
    size += data.length;
    if (size > 24000) throw invalid("TOO_LARGE", 413);
    chunks.push(data);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw Error();
    return data;
  } catch {
    throw invalid();
  }
}
const server = http.createServer(async (req, res) => {
  const json = (data, status = 200) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(data));
  };
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  try {
    if (
      !hosts.has(req.headers.host) ||
      (req.headers.origin &&
        req.headers.origin !== "http://" + req.headers.host) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      throw invalid("FORBIDDEN", 403);
    const { pathname, searchParams: q } = new URL(
      req.url,
      "http://" + req.headers.host,
    );
    if (req.method === "GET" && assets.has(pathname)) {
      const [file, type] = assets.get(pathname);
      const blob = readFileSync(new URL("./public/" + file, import.meta.url));
      res.writeHead(200, { "Content-Type": type + "; charset=utf-8" });
      res.end(blob);
      return;
    }
    if (req.method === "GET" && pathname === "/api/config") {
      const { samples, ...strings } = labels;
      return json({ strings, today: day(), model: values.model });
    }
    if (req.method === "GET" && pathname === "/api/journal") {
      const scope = book(q.get("book"));
      const children = store.children(scope);
      const requested = q.get("child");
      const child = children.includes(requested)
        ? requested
        : children[0] || "";
      return json({
        children,
        child,
        notes: child
          ? store.list(scope, child, Number(q.get("days") ?? 14))
          : [],
      });
    }
    if (
      req.method === "POST" &&
      ["/api/notes", "/api/remove", "/api/ask"].includes(pathname)
    ) {
      const data = await payload(req);
      const scope = book(data.book);
      if (pathname === "/api/notes")
        return json({ id: store.add(scope, data) }, 201);
      if (pathname === "/api/remove") {
        store.remove(scope, data.id);
        return json({ ok: true });
      }
      const question = field(data.question, 500);
      const rows = candidates(
        store.list(scope, data.child, data.days),
        question,
      );
      return json(await askModel(rows, question, values.model));
    }
    throw invalid("NOT_FOUND", 404);
  } catch (error) {
    json(
      {
        error: {
          code: error.status ? error.code : "SERVER_ERROR",
          message: error.status ? error.code : "Server error",
          request_id: randomUUID(),
        },
      },
      error.status || 500,
    );
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log("Family journal ready at http://127.0.0.1:" + port),
);
