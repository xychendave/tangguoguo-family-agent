import { readFileSync } from "node:fs";
import { invalid } from "./store.mjs";

const skill = readFileSync(
  new URL("./skills/family-journal-review/SKILL.md", import.meta.url),
  "utf8",
).replace(/^---[\s\S]*?\n---\n/, "");
const instruction =
  skill +
  ` Return JSON with findings and followup. For each supported observation supply the text and its numeric note numbers in refs. For a factual question, answer directly from a matching note. If no note supports an answer, return no findings and an empty followup.`;
const schema = {
  type: "object",
  required: ["findings", "followup"],
  properties: {
    findings: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        required: ["text", "refs"],
        properties: {
          text: { type: "string" },
          refs: { type: "array", minItems: 1, items: { type: "integer" } },
        },
      },
    },
    followup: { type: "string" },
  },
};
export function validateAnswer(answer, rows) {
  const bad = () => {
    throw invalid("INVALID_MODEL_ANSWER", 502);
  };
  if (
    !answer ||
    !Array.isArray(answer.findings) ||
    answer.findings.length > 3 ||
    typeof answer.followup !== "string"
  )
    bad();
  const findings = answer.findings.map((item) => {
    if (
      !item ||
      typeof item.text !== "string" ||
      !item.text.trim() ||
      !Array.isArray(item.refs) ||
      !item.refs.length
    )
      bad();
    const ids = [...new Set(item.refs)].map((n) => {
      if (!Number.isInteger(n) || n < 1 || n > rows.length) bad();
      return rows[n - 1].id;
    });
    return { text: item.text.trim(), ids };
  });
  return { findings, followup: findings.length ? answer.followup.trim() : "" };
}
export async function askModel(rows, question, model) {
  if (!rows.length) return { findings: [], followup: "" };
  const notes = rows.map(({ child, author, kind, date, body }, i) => ({
    number: i + 1,
    child,
    author,
    kind,
    date,
    body,
  }));
  let response;
  try {
    response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      signal: AbortSignal.timeout(150000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: schema,
        options: { temperature: 0, num_ctx: 16384, num_predict: 800 },
        messages: [
          { role: "system", content: instruction },
          { role: "user", content: JSON.stringify({ question, notes }) },
        ],
      }),
    });
    if (!response.ok) throw new Error("unavailable");
  } catch {
    throw invalid("MODEL_UNAVAILABLE", 503);
  }
  let answer;
  try {
    answer = JSON.parse((await response.json()).message.content);
  } catch {
    throw invalid("INVALID_MODEL_ANSWER", 502);
  }
  return validateAnswer(answer, rows);
}
