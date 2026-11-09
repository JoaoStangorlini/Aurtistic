# 🖥️ Servidor de Armazenamento e Borda (`servidor/`)

Daemon Node.js standalone de alta performance executado diretamente no hardware do **Amazon Fire TV Stick** (Linux ARM/Android POSIX), conectado a um HD externo de 750 GB via USB OTG (`/storage/32AB-1915`).

Faz parte do monorepo do **Aurtistic**, atuando como plano de dados de borda (*Edge Storage Daemon*).

## Arquitetura Técnica

- **Ponte Zero-Copy FAT32:** Leitura e streaming nativo com suporte a HTTP Range requests (206 Partial Content), permitindo scrubbing instantâneo em arquivos de vídeo e áudio sem buffering excessivo.
- **Cache de Miniaturas `.avif`:** Geração e armazenamento de thumbnails em formato AVIF leve e de alta compressão no flash interno do dispositivo, reduzindo a carga de I/O no disco USB.
- **Isolamento Criptográfico HMAC-SHA256:** Nenhum dado é acessível sem um ticket assinado válido gerado pelo Next.js (Supabase Auth). O daemon valida assinatura criptográfica, TTL, quota e chroot lógico por `user_id`.
- **Bloqueio de Download:** Validação estrita de `allowDownload: false` no endpoint `/api/tenant/zip` e rotas de arquivo bruto.

## Endpoints da API

| Rota | Método | Descrição |
| :--- | :--- | :--- |
| `/api/tenant/list` | GET | Listagem de pastas e arquivos no diretório especificado. |
| `/api/tenant/stream` | GET | Streaming direto com Range Requests para fotos, áudios e vídeos. |
| `/api/tenant/thumb` | GET | Miniatura AVIF otimizada para galerias e grids rápidos. |
| `/api/tenant/upload` | POST | Upload multipart com limite de quota por tenant. |
| `/api/tenant/mkdir` | POST | Criação de pastas físicas no disco com registro opcional de PIN. |
| `/api/tenant/rename` | POST | Renomeação ou movimentação atômica de arquivos e pastas. |
| `/api/tenant/delete` | POST | Exclusão lógica para a lixeira (`.trash`) ou permanente. |
| `/api/tenant/trash/list` | GET | Listagem de itens arquivados na lixeira. |
| `/api/tenant/trash/restore` | POST | Restauração de itens da lixeira para a pasta original. |
| `/api/tenant/trash/empty` | POST | Esvaziamento permanente da lixeira e liberação de espaço em disco. |
| `/api/tenant/zip` | GET | Download compactado do álbum inteiro em streaming contínuo. |

## Operação e Manutenção

Os scripts de deploy e gerenciamento foram consolidados em [`scripts/servidor/`](../scripts/servidor/):

```bash
# Deploy automático híbrido
bash scripts/servidor/deploy-firestick.sh

# Deploy forçando túnel remoto HTTPS
bash scripts/servidor/deploy-firestick.sh --remote

# Diagnóstico de telemetria e status via SSH
bash scripts/servidor/status.sh
```

A documentação detalhada da API e da arquitetura pode ser consultada em [`docs/servidor/`](../docs/servidor/).
