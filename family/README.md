# Tangguoguo Family Agent

A parent-facing local observation journal in the Linger fork. It shares Linger's BM25 search implementation, then asks a local Ollama model to answer with references to the selected child's original notes. This companion runs independently of TeamHub and does not send journal data into Linger Rooms or its personal Wiki.

Use Node 26.5+ and a running Ollama server at 127.0.0.1:11434 with qwen2.5:14b installed. From the repository root:

```sh
node family/server.mjs
```

On macOS you can also double-click `family/Open.command`. Open http://127.0.0.1:4187. The sample notebook contains fictional entries. Switch to the family notebook to start empty. Parents share one local notebook and explicitly label the author and source type; author labels are not authentication. Record only observations suitable for the shared notebook. Review each cited entry when interpreting model output.

Use `--port`, `--model` or `--data-dir` to override defaults. SQLite journals live outside the repository in `~/Library/Application Support/Tangguoguo Family/`. The service binds only to loopback. Requests to Ollama stay on loopback. No remote model fallback is configured.

Run `node --test family/journal.test.mjs` for scope, persistence, retrieval and citation checks. Model-generated text is provisional; reference validation ensures the numbers resolve, not that every interpretation is correct.

## Use with Linger

Download the current child's filtered notes with the export action. Attach that JSON to a Linger conversation that you intend to share it with. The package at `family/skills/family-journal-review` is a standard Linger-importable Skill folder. With a running Linger instance, use its skill-installer to publish that folder to the selected Agent. The local model reads the same Skill rules directly. Exporting downloads a file locally; it does not upload or publish anything.
