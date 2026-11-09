#!/usr/bin/env bash
# Este programa é um software livre (Licença AGPLv3)
# ==============================================================================
# Hub de Comunicação Científica Lab-Div V3.0 — Fire Stick 24/7 Sleep Blocker
# Configura o Fire TV Stick para NUNCA dormir e instala o Watchdog Daemon
# ==============================================================================

set -euo pipefail

FIRESTICK_HOST="${FIRESTICK_HOST:-192.168.0.198}"
FIRESTICK_PORT="${FIRESTICK_PORT:-8022}"
FIRESTICK_USER="${FIRESTICK_USER:-u0_a220}"
ADB_TARGET="${FIRESTICK_HOST}:5555"

echo "======================================================================"
echo " Fire Stick 24/7 Anti-Sleep & Watchdog Provisioning"
echo " Dispositivo: ${FIRESTICK_HOST}"
echo "======================================================================"

# 1. Aplica travas no sistema Android / Fire OS via ADB se acessível
echo "[1/4] Aplicando políticas anti-suspensão no Fire OS via ADB..."
if command -v adb >/dev/null 2>&1; then
  adb connect "$ADB_TARGET" >/dev/null 2>&1 || true
  adb -s "$ADB_TARGET" shell "
    settings put secure sleep_timeout 0
    settings put global stay_on_while_plugged_in 7
    settings put system screen_off_timeout 2147483647
    settings put global wifi_sleep_policy 2
    dumpsys deviceidle whitelist +com.termux 2>/dev/null || true
    dumpsys deviceidle whitelist +com.termux.boot 2>/dev/null || true
  " >/dev/null 2>&1 && echo "      ✓ Configurações do Android aplicadas com sucesso (sleep=0, wifi=never_sleep, Doze=whitelist)." || echo "      (Aviso: ADB não respondeu nesta etapa)"
fi

# 2. Instala e ativa o Watchdog no Termux via ADB run-as
echo "[2/4] Enviando watchdog.sh e atualizando inicialização (Termux-Boot)..."

TERMUX_HOME="/data/data/com.termux/files/home"
REMOTE_SERVER_DIR="${TERMUX_HOME}/hub-storage-server"

if command -v adb >/dev/null 2>&1 && adb -s "$ADB_TARGET" get-state 2>/dev/null | grep -q "device"; then
  adb -s "$ADB_TARGET" push scripts/watchdog.sh /data/local/tmp/watchdog.sh >/dev/null 2>&1
  adb -s "$ADB_TARGET" push scripts/01-server.sh /data/local/tmp/01-server.sh >/dev/null 2>&1
  adb -s "$ADB_TARGET" shell "
    run-as com.termux cp -f /data/local/tmp/watchdog.sh ${REMOTE_SERVER_DIR}/watchdog.sh
    run-as com.termux chmod 700 ${REMOTE_SERVER_DIR}/watchdog.sh
    run-as com.termux mkdir -p ${TERMUX_HOME}/.termux/boot
    run-as com.termux cp -f /data/local/tmp/01-server.sh ${TERMUX_HOME}/.termux/boot/01-server.sh
    run-as com.termux chmod 700 ${TERMUX_HOME}/.termux/boot/01-server.sh
    rm -f /data/local/tmp/watchdog.sh /data/local/tmp/01-server.sh

    # Reinicia o watchdog para assumir a supervisão imediatamente
    pkill -f 'watchdog.sh' 2>/dev/null || true
    run-as com.termux /data/data/com.termux/files/usr/bin/nohup ${REMOTE_SERVER_DIR}/watchdog.sh >> ${REMOTE_SERVER_DIR}/watchdog.log 2>&1 &
  "
  echo "      ✓ Watchdog daemon instalado e iniciado em segundo plano."
fi

# 3. Teste do Wake Lock ativo
echo "[3/4] Validando Wake Lock no Termux..."
adb -s "$ADB_TARGET" shell "dumpsys power | grep -i 'termux.*wake' || true" | head -n 2

# 4. Healthcheck público
echo "[4/4] Testando resposta da URL pública..."
sleep 2
if curl -sf --max-time 10 "https://storage.hublabdiv.com.br/health" >/dev/null 2>&1; then
  echo "      ✓ https://storage.hublabdiv.com.br está ONLINE e respondendo!"
else
  echo "      (Aviso: Servidor ainda subindo, aguarde alguns instantes)"
fi

echo "======================================================================"
echo " Configuração 24/7 Concluída com Sucesso!"
echo " O Fire Stick agora manterá CPU, Wi-Fi e Processos sempre acordados."
echo "======================================================================"
