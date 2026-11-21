const el = (s) => document.querySelector(s);
const create = (name, text, cls) => {
  const node = document.createElement(name);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
async function api(url, body) {
  const options = body
    ? {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Family-Request": "1",
        },
        body: JSON.stringify(body),
      }
    : {};
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw Error(data.error.code);
  return data;
}
const { strings: t, model, today } = await api("/api/config");
document.title = t.brand;
document.querySelectorAll("[data-t]").forEach((node) => {
  node.textContent = t[node.dataset.t];
});
el("#question").placeholder = t.askHint;
el("#model").textContent = t.model + " · " + model;
let scope = "demo",
  child = "",
  notes = [],
  version = 0,
  busy = false;
const editor = el("#editor"),
  form = el("#writeform"),
  fields = form.elements;
function button(text, onClick, cls) {
  const btn = create("button", text, cls);
  btn.type = "button";
  btn.addEventListener("click", onClick);
  return btn;
}
function updateAsk() {
  el("#ask").disabled = busy || !notes.length;
  el("#export").disabled = !notes.length;
  el("#ask").textContent = busy ? t.thinking : t.ask;
}
function compose() {
  form.reset();
  fields.child.value = child;
  fields.author.value = localStorage.getItem("family-author-" + scope) || "";
  fields.date.max = today;
  fields.date.value = today;
  fields.body.placeholder = t.hint;
  el("#editerror").textContent = "";
  editor.showModal();
  (child && fields.author.value
    ? fields.body
    : child
      ? fields.author
      : fields.child
  ).focus();
}
function renderNotes() {
  const host = el("#notes");
  host.replaceChildren();
  el("#count").textContent = notes.length + " " + t.count;
  if (!notes.length) {
    const box = create("div", t.empty, "empty");
    box.append(button(t.first, compose));
    host.append(box);
    return;
  }
  for (const note of notes) {
    const article = create("article");
    article.id = "n-" + note.id;
    article.tabIndex = -1;
    const meta = create("div", undefined, "meta");
    meta.append(create("time", note.date), create("span", t[note.kind], "tag"));
    const footer = create("footer");
    footer.append(
      create("small", t.observer + " · " + note.author),
      button(
        t.delete,
        async () => {
          if (!window.confirm(t.confirm)) return;
          const current = version;
          try {
            await api("/api/remove", { book: scope, id: note.id });
            if (current === version) await reload();
          } catch {
            if (current === version) el("#status").textContent = t.deleteFailed;
          }
        },
        "link",
      ),
    );
    article.append(meta, create("p", note.body), footer);
    host.append(article);
  }
}
function renderAnswer(data) {
  const host = el("#answer");
  host.replaceChildren();
  if (!data.findings.length) {
    host.append(create("p", t.unknown));
    return;
  }
  for (const finding of data.findings) {
    const block = create("div", undefined, "finding"),
      refs = create("div", undefined, "refs");
    for (const id of finding.ids) {
      const note = notes.find((item) => item.id === id);
      if (!note) continue;
      const link = button(
        t.evidence + " · " + note.date + " · " + note.author,
        () => {
          const item = document.getElementById("n-" + id);
          if (item) {
            item.focus();
            item.scrollIntoView({ block: "center" });
          }
        },
        "link",
      );
      refs.append(link);
    }
    block.append(create("p", finding.text), refs);
    host.append(block);
  }
  if (data.followup)
    host.append(create("h3", t.followup), create("p", data.followup));
}
async function reload() {
  const request = ++version;
  busy = false;
  notes = [];
  el("#notes").replaceChildren();
  el("#count").textContent = "";
  el("#answer").replaceChildren();
  el("#status").textContent = t.loading;
  updateAsk();
  el("#hint").textContent = scope === "demo" ? t.demoHint : t.homeHint;
  document
    .querySelectorAll("[data-book]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.book === scope)),
    );
  el("#child").replaceChildren();
  el("#children").replaceChildren();
  try {
    const q = new URLSearchParams({
      book: scope,
      child,
      days: el("#range").value,
    });
    const data = await api("/api/journal?" + q);
    if (request !== version) return;
    child = data.child;
    notes = data.notes;
    for (const name of data.children) {
      el("#child").add(new Option(name, name));
      el("#children").append(new Option(name, name));
    }
    if (!data.children.length) el("#child").add(new Option(t.noChild, ""));
    el("#child").value = child;
    el("#status").textContent = "";
    renderNotes();
    updateAsk();
  } catch {
    if (request === version) {
      el("#status").textContent = t.error + " ";
      el("#status").append(button(t.retry, reload));
    }
  }
}
el("#add").onclick = compose;
el("#cancel").onclick = () => editor.close();
form.onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const save = el("#save");
  save.disabled = true;
  try {
    await api("/api/notes", { ...data, book: scope });
    child = data.child.trim();
    localStorage.setItem("family-author-" + scope, data.author.trim());
    el("#range").value = "0";
    editor.close();
    await reload();
  } catch {
    el("#editerror").textContent = t.error;
  } finally {
    save.disabled = false;
  }
};
for (const text of t.suggest)
  el("#suggest").append(
    button(text, () => {
      el("#question").value = text;
      el("#question").focus();
    }),
  );
el("#askform").onsubmit = async (e) => {
  e.preventDefault();
  if (busy || !notes.length) return;
  const question = el("#question").value.trim();
  if (!question) return;
  const current = version;
  busy = true;
  updateAsk();
  el("#answer").replaceChildren();
  try {
    const data = await api("/api/ask", {
      book: scope,
      child,
      days: Number(el("#range").value),
      question,
    });
    if (current === version) renderAnswer(data);
  } catch (error) {
    if (current === version)
      el("#answer").textContent =
        error.message === "MODEL_UNAVAILABLE"
          ? t.modelError
          : error.message === "INVALID_MODEL_ANSWER"
            ? t.invalidAnswer
            : t.error;
  } finally {
    if (current === version) {
      busy = false;
      updateAsk();
    }
  }
};
el("#books").onclick = (e) => {
  if (!e.target.dataset.book || scope === e.target.dataset.book) return;
  scope = e.target.dataset.book;
  el("#range").value = scope === "demo" ? "0" : "14";
  child = "";
  el("#question").value = "";
  reload();
};
el("#child").onchange = (e) => {
  child = e.target.value;
  el("#question").value = "";
  reload();
};
el("#range").onchange = reload;
el("#range").value = "0";
await reload();

el("#export").title = t.exportHint;
el("#export").onclick = () => {
  if (!notes.length) return;
  const selected = notes.map(({ id, author, child, kind, date, body }) => ({
    id,
    author,
    child,
    kind,
    date,
    body,
  }));
  const file = new Blob(
    [
      JSON.stringify(
        { schema: "family-journal/1", book: scope, notes: selected },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = "family-journal-" + today + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
