#!/usr/bin/env bash
# Este programa é um software livre (Licença AGPLv3)
set -e

node scripts/build-agent-index.mjs > /dev/null 2>&1 || true

run_step() {
  local name="$1"
  shift
  local out
  if ! out=$("$@" 2>&1); then
    echo "❌ FALHA EM [$name]:"
    echo "$out" | grep -E -i "error|fail|exception|✗|×" -C 2 | head -n 25 || echo "$out" | tail -n 25
    exit 1
  fi
}

run_step "TSC" npx tsc --noEmit
run_step "ESLINT" npm run lint --silent
run_step "SERVER_SYNTAX" node --check servidor/server.js

if [ "$1" == "--full" ]; then
  run_step "TESTS_THEME" node tests/verify_theme_and_tour.mjs
  run_step "BUILD" npm run build
  echo "✅ OK: TSC + Lint + Server.js + Testes + Build Next.js (0 erros)"
else
  echo "✅ OK RÁPIDO: TSC + Lint + Server.js (0 erros) | Mapa CODE_MAP.md atualizado"
fi
