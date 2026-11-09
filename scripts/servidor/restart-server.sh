#!/usr/bin/env bash
# ==============================================================================
# Hub de Comunicação Científica Lab-Div V3.0 — Fire Stick Storage & Portfolio Portal
# Copyright (C) 2026 João Paulo Stangorlini de Carvalho
# Licença: Affero GNU (AGPLv3)
#
# Reinicialização Rápida de Processo (Node.js) no Fire Stick via SSH
# ==============================================================================

set -euo pipefail

FIRESTICK_USER="${FIRESTICK_USER:-u0_a220}"
FIRESTICK_HOST="${FIRESTICK_HOST:-192.168.0.198}"
FIRESTICK_PORT="${FIRESTICK_PORT:-8022}"
REMOTE_DIR="${FIRESTICK_DIR:-/data/data/com.termux/files/home/hub-storage-server}"

echo "======================================================================"
echo " Reiniciando node server.js no Fire Stick (via SSH híbrido)..."
echo "======================================================================"

ssh -i ~/.ssh/id_ed25519 firestick "bash -s" << EOF
set -euo pipefail

cd "${REMOTE_DIR}"

# Localiza e encerra exclusivamente os processos node executando server.js
for pid in \$(pgrep -x node 2>/dev/null || true); do
  cmdline="\$(tr '\0' ' ' < "/proc/\$pid/cmdline" 2>/dev/null || ps -p "\$pid" -o args= 2>/dev/null || true)"
  case "\$cmdline" in
    *server.js*)
      echo "Finalizando node server.js antigo (PID \$pid)..."
      kill "\$pid" 2>/dev/null || true
      sleep 1
      kill -9 "\$pid" 2>/dev/null || true
      ;;
  esac
done

# Sobe novo processo em background com nohup e limite seguro de heap para ARM (160 MB)
nohup node --max-old-space-size=160 "${REMOTE_DIR}/server.js" >> "${REMOTE_DIR}/server.log" 2>&1 < /dev/null &
NEW_PID=\$!
sleep 2

if kill -0 "\$NEW_PID" 2>/dev/null; then
  echo "[OK] Novo processo node server.js iniciado (PID \$NEW_PID)."
  curl -s http://127.0.0.1:8080/health || true
else
  echo "[ERRO] Falha ao iniciar processo. Últimas linhas de server.log:"
  tail -n 20 "${REMOTE_DIR}/server.log"
  exit 1
fi
EOF

echo ""
echo "======================================================================"
echo " Servidor reiniciado com sucesso! Cloudflare Tunnel preservado."
echo "======================================================================"

