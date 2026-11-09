# Módulo Mídia & Dock Global (`src/components/media`)

Componentes responsáveis pela reprodução global de áudio contínuo e pré-visualização in-place de arquivos multimídia com segurança HMAC do ecossistema **Aurtistic**.

Licenciado sob **GNU Affero General Public License v3.0 (AGPLv3)**.

---

## Componentes

| Componente | Descrição |
| :--- | :--- |
| `AurtisticMediaContext.tsx` | Provedor de contexto global para reprodução contínua de áudio, fila de faixas e emissão/renovação de tickets HMAC. |
| `GlobalAudioDock.tsx` | Player de áudio fixo persistente com controles completos, waveform visual, modo minimizado e restauração de posição após renovação silenciosa de tickets. |
| `InPlaceFilePreviewModal.tsx` | Modal de pré-visualização in-place para imagens, áudios, vídeos e documentos PDF sem sair da tela atual. |

---

## Gerenciamento de Tickets

- Utiliza `mediaReadOnlyTicket` (`readOnly: true`, TTL 2h) para streaming sem risco de mutação indevida no Edge Node.

