# 🛠️ Scripts de Operação do Servidor (Edge Daemon / Fire TV Stick)

Este diretório centraliza todas as ferramentas de automação, manutenção e provisionamento do daemon de borda (`servidor/`):

| Script | Finalidade | Ambiente de Execução |
| :--- | :--- | :--- |
| `deploy-firestick.sh` | Deploy automático híbrido (LAN via SSH ou remoto via HTTPS/Cloudflare Tunnel) | Máquina de Desenvolvimento |
| `status.sh` | Telemetria, estado dos processos Node.js e Cloudflared e montagem do HD via SSH | Máquina de Desenvolvimento |
| `restart-server.sh` | Reinício suave do processo `server.js` via SSH | Máquina de Desenvolvimento |
| `backup-portfolio.sh` | Download e backup incremental do `catalog.json` e configs do Firestick | Máquina de Desenvolvimento |
| `manage-hd.sh` | Diagnóstico de montagem FUSE/OTG e permissões do HD USB externo no Fire TV Stick | Máquina Dev / Termux |
| `setup-ssh-keys.sh` | Configuração de chaves SSH Ed25519 sem senha para acesso ao Termux | Máquina de Desenvolvimento |
| `enable-24-7.sh` | Desativa sleep timeout via ADB e instala supervisor permanente | Máquina Dev / ADB |
| `watchdog.sh` | Supervisor 24/7 que monitora e reinicia o `server.js` e o túnel Cloudflare | Fire TV Stick (Termux) |
| `01-server.sh` | Script de inicialização automática no boot do Termux (`~/.termux/boot/`) | Fire TV Stick (Termux Boot) |
| `pregenerate_avif.py` | Pré-geração paralela de thumbnails AVIF e cálculo de dimensões EXIF | Máquina Dev / Servidor |

