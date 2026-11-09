#!/usr/bin/env bash
# ==============================================================================
# Hub de Comunicação Científica Lab-Div V3.0 — Fire Stick Storage & Portfolio Portal
# Copyright (C) 2026 João Paulo Stangorlini de Carvalho
# Licença: Affero GNU (AGPLv3)
#
# Utilitário de Gerenciamento e Adição de Novos HDs USB no Fire Stick (Android/Termux)
# ==============================================================================

set -euo pipefail

FIRESTICK_USER="${FIRESTICK_USER:-u0_a220}"
FIRESTICK_HOST="${FIRESTICK_HOST:-192.168.0.198}"
FIRESTICK_PORT="${FIRESTICK_PORT:-8022}"
REMOTE_DIR="${FIRESTICK_DIR:-/data/data/com.termux/files/home/hub-storage-server}"

echo "======================================================================"
echo " GERENCIADOR DE HDs & PONTOS DE MONTAGEM USB NO FIRE TV STICK"
echo " Conectando a ${FIRESTICK_USER}@${FIRESTICK_HOST}:${FIRESTICK_PORT}..."
echo "======================================================================"

ssh -p "$FIRESTICK_PORT" "${FIRESTICK_USER}@${FIRESTICK_HOST}" "bash -s" << 'EOF'
set -euo pipefail

echo ""
echo "=== 1. DISCOS FÍSICOS DETECTADOS EM /storage/ ==="
ls -la /storage/ || true

echo ""
echo "=== 2. ESPAÇO LIVRE EM CADA PONTO DE MONTAGEM (df -h) ==="
df -h | grep -E "Filesystem|/storage" || true

echo ""
echo "=== 3. ANÁLISE DE PERMISSÃO DE ESCRITA (Android SAF / Termux) ==="

FOUND_USB=0
for disk_dir in /storage/*; do
  disk_name="$(basename "$disk_dir")"
  # Ignora emulated e self (armazenamento interno)
  if [ "$disk_name" = "emulated" ] || [ "$disk_name" = "self" ] || [ "$disk_name" = "knox-emulated" ]; then
    continue
  fi

  FOUND_USB=$((FOUND_USB + 1))
  echo "------------------------------------------------------------------"
  echo "-> Dispositivo USB Detectado: $disk_dir"

  # Pasta com permissão irrestrita no Android sem root
  SAFE_PATH="${disk_dir}/Android/data/com.termux/files/hub_data"
  echo "   Caminho seguro do Termux: $SAFE_PATH"

  # Testa criação de diretório e gravação
  if mkdir -p "$SAFE_PATH" 2>/dev/null; then
    TEST_FILE="${SAFE_PATH}/.write_test_${RANDOM}"
    if echo "ok" > "$TEST_FILE" 2>/dev/null && rm -f "$TEST_FILE" 2>/dev/null; then
      echo "   [STATUS] Permissão de ESCRITA: APROVADA ✅"
      
      # Cria as 3 zonas no HD
      mkdir -p "${SAFE_PATH}/media" \
               "${SAFE_PATH}/portfolio/originals" \
               "${SAFE_PATH}/portfolio/thumbs" \
               "${SAFE_PATH}/vault"
      echo "   [ZONAS] Criadas: media/, portfolio/, vault/"
      
      echo ""
      echo "   CONFIGURAÇÃO SUGERIDA PARA SEU .env:"
      echo "   ------------------------------------------------------------"
      echo "   STORAGE_DIR=${SAFE_PATH}"
      echo "   ------------------------------------------------------------"
      echo "   Ou se for usar como 2º HD apenas para Cofre Pessoal / Vault:"
      echo "   VAULT_DIR=${SAFE_PATH}/vault"
      echo "   ------------------------------------------------------------"
    else
      echo "   [STATUS] Falha no teste de gravação ❌ (Execute termux-setup-storage na TV)"
    fi
  else
    echo "   [STATUS] Não foi possível criar pasta ❌ (Permissão do Android negada)"
  fi
done

if [ "$FOUND_USB" -eq 0 ]; then
  echo "[AVISO] Nenhum HD externo USB detectado em /storage/ além do armazenamento interno."
  echo "Dica: Verifique se o cabo OTG está energizado com fonte externa (5V 2A+)."
fi
EOF

echo ""
echo "======================================================================"
echo " Concluído!"
echo "======================================================================"

