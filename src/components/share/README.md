# Módulo Compartilhamento & Proofing (`src/components/share`)

Componentes do Portal do Cliente (`/s/[token]`) para aprovação fotográfica (client proofing) e visualização pública segura com isolamento criptográfico do ecossistema **Aurtistic**.

Licenciado sob **GNU Affero General Public License v3.0 (AGPLv3)**.

---

## Componentes

| Componente | Descrição |
| :--- | :--- |
| `ClientProofingView.tsx` | Interface imersiva do cliente com alternância entre modos de visualização e prova, seleção de fotos com badge de status, download em lote (.ZIP sob demanda) e comentários com feedback em tempo real. |

---

## Segurança

- **Tickets com Escopo Restrito:** Utiliza tokens criptografados com finalidade `share` e restrição estrita de caminhos (`allowedPrefix`).
- **Rate Limiting Anti-Brute-Force:** Proteção contra força bruta em links protegidos por PIN numérico.
- **Renovação Silenciosa:** O cliente anônimo renova seu ticket temporário silenciosamente a cada 10 minutos sem interromper a sessão.

