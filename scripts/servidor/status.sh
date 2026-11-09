#!/usr/bin/env bash
# ==============================================================================
# Hub de Comunicação Científica Lab-Div V3.0 — Fire Stick Storage & Portfolio Portal
# Copyright (C) 2026 João Paulo Stangorlini de Carvalho
# Licença: Affero GNU (AGPLv3)
#
# Script de Diagnóstico e Telemetria via SSH
# ==============================================================================

set -euo pipefail

FIRESTICK_USER="${FIRESTICK_USER:-u0_a220}"
FIRESTICK_HOST="${FIRESTICK_HOST:-192.168.0.198}"
FIRESTICK_PORT="${FIRESTICK_PORT:-8022}"
REMOTE_DIR="${FIRESTICK_DIR:-/data/data/com.termux/files/home/hub-storage-server}"

echo "======================================================================"
echo " Conectando ao Fire Stick (via SSH híbrido)..."
echo "======================================================================"

ssh -i ~/.ssh/id_ed25519 firestick "bash -s" << EOF
set -u
echo ">>> [1/5] PROCESSOS DO SERVIDOR & CLOUDFLARE TUNNEL:"
ps -ef | grep -E "node|cloudflared|run_tunnel" | grep -v grep || echo "Nenhum processo correspondente."

echo ""
echo ">>> [2/5] HEALTHCHECK HTTP LOCAL (127.0.0.1:8080):"
curl -s http://127.0.0.1:8080/health || echo "Servidor HTTP offline na porta 8080!"

echo ""
echo ""
echo ">>> [3/5] DISCOS USB & ARMAZENAMENTO MONTADOS (/storage/):"
df -h | grep -E "Filesystem|/storage" || df -h

echo ""
echo ">>> [4/5] USO DE MEMÓRIA RAM & CPU:"
free -m 2>/dev/null || cat /proc/meminfo | head -n 4
uptime

echo ""
echo ">>> [5/5] ÚLTIMAS 15 LINHAS DO LOG DO SERVIDOR (${REMOTE_DIR}/server.log):"
if [ -f "${REMOTE_DIR}/server.log" ]; then
  tail -n 15 "${REMOTE_DIR}/server.log"
else
  echo "Arquivo server.log ainda não gerado."
fi
EOF

echo ""
echo "======================================================================"
echo " Diagnóstico finalizado."
echo "======================================================================"

