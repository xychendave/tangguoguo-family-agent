#!/bin/zsh
set -eu
cd "${0:A:h}/.."
url=http://127.0.0.1:4187
if curl --fail --silent "$url/api/config" | /usr/bin/grep -q '"askTitle"'; then
  open "$url"
  exit 0
fi
for candidate in "$HOME/.local/bin/node" "$(command -v node || true)" /opt/homebrew/bin/node; do
  if [[ -x "$candidate" ]] && "$candidate" --input-type=module -e 'import "node:sqlite"; if (+process.versions.node.split(".")[0] < 26) process.exit(1)' 2>/dev/null; then
    (for attempt in {1..25}; do
       if curl --fail --silent "$url/api/config" >/dev/null; then open "$url"; break; fi
       sleep 0.2
     done) &
    exec "$candidate" family/server.mjs
  fi
done
print -u2 "Install Node.js 26.5 or newer and try again."
exit 1
