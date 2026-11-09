#!/usr/bin/env bash
# ==============================================================================
# Hub de Comunicação Científica Lab-Div V3.0 — Fire Stick Storage & Portfolio Portal
# Copyright (C) 2026 João Paulo Stangorlini de Carvalho
# Licença: Affero GNU (AGPLv3)
#
# Configuração de Chave SSH Sem Senha para o Fire TV Stick
# ==============================================================================

set -euo pipefail

FIRESTICK_USER="${FIRESTICK_USER:-u0_a220}"
FIRESTICK_HOST="${FIRESTICK_HOST:-192.168.0.198}"
FIRESTICK_PORT="${FIRESTICK_PORT:-8022}"

echo "======================================================================"
echo " CONFIGURAÇÃO DE ACESSO SSH SEM SENHA (Ed25519 -> Fire Stick)"
echo " Destino: ${FIRESTICK_USER}@${FIRESTICK_HOST}:${FIRESTICK_PORT}"
echo "======================================================================"

KEY_PATH="$HOME/.ssh/id_ed25519"

if [ ! -f "$KEY_PATH" ]; then
  echo "[1/2] Gerando nova chave SSH Ed25519..."
  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh"
  ssh-keygen -t ed25519 -N "" -f "$KEY_PATH" -C "dev-firestick-access"
  echo "      Chave gerada em: $KEY_PATH"
else
  echo "[1/2] Chave SSH já existente em $KEY_PATH."
fi

echo ""
echo "[2/2] Enviando chave pública para o Fire Stick..."
echo "      (Digite a senha do Termux UMA ÚLTIMA VEZ quando solicitado)"
echo ""

if command -v ssh-copy-id >/dev/null 2>&1; then
  ssh-copy-id -i "${KEY_PATH}.pub" -p "$FIRESTICK_PORT" "${FIRESTICK_USER}@${FIRESTICK_HOST}"
else
  cat "${KEY_PATH}.pub" | ssh -p "$FIRESTICK_PORT" "${FIRESTICK_USER}@${FIRESTICK_HOST}" \
    "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
fi

echo ""
echo "======================================================================"
echo " Testando conexão sem senha..."
if ssh -o BatchMode=yes -o ConnectTimeout=5 -p "$FIRESTICK_PORT" "${FIRESTICK_USER}@${FIRESTICK_HOST}" "echo '[SUCESSO] Conexão SSH sem senha funcionando perfeitamente!'" 2>/dev/null; then
  echo "======================================================================"
  echo " Pronto! A partir de agora, qualquer comando e deploy será instantâneo."
  echo "======================================================================"
else
  echo "[AVISO] Falha ao testar conexão sem senha. Verifique as permissões de ~/.ssh no Termux."
fi

