#!/data/data/com.termux/files/usr/bin/bash
# Este programa é um software livre (Licença AGPLv3)
# ==============================================================================
# Hub de Comunicação Científica Lab-Div — Inicialização Automática no Boot (Termux)
# ==============================================================================

# Aguarda 15 segundos para conexão de Wi-Fi e obtenção de IP
sleep 15

# 1. Garante que o Android não suspenda a CPU nem a placa Wi-Fi
termux-wake-lock

# 2. Inicia servidor SSH
sshd 2>/dev/null || true

# 3. Inicia o Watchdog Supervisor em background (ele mantém node e tunnel sempre no ar)
pkill -f "watchdog.sh" 2>/dev/null || true
nohup /data/data/com.termux/files/home/hub-storage-server/watchdog.sh >> /data/data/com.termux/files/home/hub-storage-server/watchdog.log 2>&1 &

