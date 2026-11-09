#!/data/data/com.termux/files/usr/bin/bash
# Este programa é um software livre (Licença AGPLv3)
# ==============================================================================
# Hub de Comunicação Científica Lab-Div — Watchdog & Supervisor 24/7
# Garante que o Node.js e o Cloudflare Tunnel NUNCA permaneçam caídos no Fire Stick
# ==============================================================================

SCRIPT_DIR="/data/data/com.termux/files/home/hub-storage-server"
LOG_FILE="${SCRIPT_DIR}/watchdog.log"
LOCK_FILE="/data/data/com.termux/files/usr/tmp/watchdog.lock"

export PATH="/data/data/com.termux/files/usr/bin:/data/data/com.termux/files/usr/bin/applets:$PATH"
export LD_LIBRARY_PATH="/data/data/com.termux/files/usr/lib:$LD_LIBRARY_PATH"

# Evita múltiplas instâncias concorrentes do watchdog
if [ -f "$LOCK_FILE" ]; then
  OLD_PID="$(cat "$LOCK_FILE" 2>/dev/null || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    exit 0
  fi
fi
echo "$$" > "$LOCK_FILE"

log_msg() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

log_msg "Iniciando Watchdog Supervisor 24/7 (PID $$)..."

# 1. Garante o Wake Lock do Termux (CPU e Wi-Fi sempre ativos)
if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock
  log_msg "Wake lock (termux-wake-lock) garantido."
fi

# 2. Garante SSHD ativo para acesso de manutenção
if ! pgrep -x sshd >/dev/null 2>&1; then
  sshd 2>/dev/null || true
  log_msg "sshd iniciado."
fi

cd "$SCRIPT_DIR" || exit 1

CHECK_COUNT=0

while true; do
  # A cada 120 ciclos (~1 hora), rotaciona watchdog.log se maior que 2 MB
  if [ $((CHECK_COUNT % 120)) -eq 0 ]; then
    if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)" -gt 2097152 ]; then
      tail -n 500 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv -f "${LOG_FILE}.tmp" "$LOG_FILE"
    fi
  fi

  # --- A. VERIFICAÇÃO DO PROCESSO NODE (SERVER.JS) ---
  NODE_RUNNING=0
  if pgrep -f "node.*server.js" >/dev/null 2>&1; then
    NODE_RUNNING=1
  fi

  # Healthcheck local rápido via HTTP
  HEALTH_OK=0
  if [ "$NODE_RUNNING" -eq 1 ]; then
    if command -v curl >/dev/null 2>&1; then
      HTTP_STATUS="$(curl -s -o /dev/null -w "%{http_code}" --max-time 6 "http://127.0.0.1:8080/health" 2>/dev/null || true)"
      if [ "$HTTP_STATUS" = "200" ]; then
        HEALTH_OK=1
      fi
    else
      HEALTH_OK=1
    fi
  fi

  if [ "$NODE_RUNNING" -eq 0 ] || [ "$HEALTH_OK" -eq 0 ]; then
    log_msg "[ALERTA] Servidor Node offline ou não responsivo (running=$NODE_RUNNING, health=$HEALTH_OK). Reiniciando..."
    pkill -9 -f "node.*server.js" 2>/dev/null || true
    sleep 1
    nohup node --max-old-space-size=160 "${SCRIPT_DIR}/server.js" >> "${SCRIPT_DIR}/server.log" 2>&1 < /dev/null &
    sleep 3
    if pgrep -f "node.*server.js" >/dev/null 2>&1; then
      log_msg "[OK] node server.js recuperado com sucesso!"
    else
      log_msg "[ERRO] Falha ao reerguer node server.js. Verifique server.log."
    fi
  fi

  # --- B. VERIFICAÇÃO DO CLOUDFLARE TUNNEL ---
  if ! pgrep -f "cloudflared" >/dev/null 2>&1; then
    log_msg "[ALERTA] Processo cloudflared não detectado. Iniciando túnel..."
    if [ -x "${SCRIPT_DIR}/run_tunnel.sh" ]; then
      nohup "${SCRIPT_DIR}/run_tunnel.sh" >> "${SCRIPT_DIR}/tunnel.log" 2>&1 < /dev/null &
      sleep 4
      if pgrep -f "cloudflared" >/dev/null 2>&1; then
        log_msg "[OK] Cloudflare Tunnel iniciado com sucesso!"
      else
        log_msg "[ERRO] Falha ao iniciar cloudflared."
      fi
    fi
  fi

  CHECK_COUNT=$((CHECK_COUNT + 1))
  sleep 25
done

