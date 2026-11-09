#!/usr/bin/env bash
# ==============================================================================
# Hub de Comunicação Científica Lab-Div V3.0 — Fire Stick Storage & Portfolio Portal
# Copyright (C) 2026 João Paulo Stangorlini de Carvalho
# Licença: Affero GNU (AGPLv3)
#
# Backup de Catálogo e Configurações do Fire Stick para a Máquina Local
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_DIR="${PROJECT_ROOT}/servidor/backups/backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

FIRESTICK_USER="${FIRESTICK_USER:-u0_a220}"
FIRESTICK_HOST="${FIRESTICK_HOST:-192.168.0.198}"
FIRESTICK_PORT="${FIRESTICK_PORT:-8022}"
REMOTE_DIR="${FIRESTICK_DIR:-/data/data/com.termux/files/home/hub-storage-server}"

echo "======================================================================"
echo " REALIZANDO BACKUP DO FIRESTICK -> ${BACKUP_DIR}"
echo "======================================================================"

# 1. Puxa o catalog.json primário (ext4) e as configurações
echo "[1/2] Baixando catalog.json e arquivos de ambiente (.env)..."
ssh -p "$FIRESTICK_PORT" "${FIRESTICK_USER}@${FIRESTICK_HOST}" \
  "tar czf - -C '${REMOTE_DIR}' data/catalog.json .env 2>/dev/null || tar czf - -C '${REMOTE_DIR}' data/catalog.json" | \
  tar xzf - -C "$BACKUP_DIR"

# 2. Pede confirmação para baixar miniaturas do portfólio (opcional para economizar banda)
echo ""
echo "[2/2] Backup concluído em: ${BACKUP_DIR}"
ls -la "$BACKUP_DIR"
echo "======================================================================"

