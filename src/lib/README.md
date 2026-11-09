# Módulo `src/lib/` — Bibliotecas e Utilitários de Domínio

Esta pasta concentra as funções de criptografia, comunicação com o Edge Node Fire Stick, gerenciamento de tickets efêmeros HMAC-SHA256, configuração de temas e catálogo de passos do tour interativo.

## Estrutura de Arquivos

| Arquivo | Isolamento | Responsabilidade Principal |
| :--- | :--- | :--- |
| `theme-config.ts` | Híbrido (Server/Client) | Definição das 5 paletas bicolores (`purple-gold`, `blue-red`, `pink-green`, `cyan-amber`, `emerald-violet`), modos (`system`, `light`, `dark`), contrastes WCAG AA e gerador do script síncrono pré-hidratação (`buildThemeInitScript`). |
| `coach-marks-steps.ts` | Híbrido (Server/Client) | Catálogo tipado de passos do tutorial guiado por rota (`/`, `/portfolio`, `/servidor`, `/resumo`, `/curriculo`) com seletores `data-tour`, títulos, descrições e ícones. |
| `edge-ticket.ts` | **Server-Only** | Geração e validação de tickets efêmeros HMAC-SHA256 (`vault`, `public_media`, `share`, `storage_session`). Utiliza `crypto` nativo do Node.js. **Nunca deve ser importado por Client Components.** |
| `edge-client.ts` | Client | Cliente HTTP REST direto do navegador para o Edge Node Fire Stick (`/api/tenant/*`), executando operações de listagem, upload multipart, renomeação, exclusão e lixeira. |
| `edge-urls.ts` | Client / Server | Construtores de URLs seguras (`buildTenantStreamUrl`, `buildTenantThumbUrl`, `buildTenantZipUrl`) e formatador de bytes (`formatStorageBytes`). |
| `pin-scrypt.ts` | **Server-Only** | Criptografia KDF scrypt com salt de 16 bytes para proteção de pastas com PIN no Cofre e links de clientes. **Nunca deve ser importado por Client Components.** |
| `pin-rate-limit.ts` | Server-Only | Proteção anti-força-bruta com cooldown de 60s após 5 tentativas incorretas consecutivas de PIN. |
| `portfolio-catalog.ts` | Server-Only | Carregamento resiliente do acervo de 2.012 fotografias (`sig_index.json`) e auto-seeding em `user_files_index`. |
| `validators.ts` | Híbrido | Sanitização e validação de caminhos relativos (bloqueio de directory traversal `..`, barras invertidas e caracteres de controle). |
| `offlineSync.ts` | Client | Sincronização offline e cache local de perfil via `@capacitor/preferences`. |

## Diretrizes de Uso e Segurança

1. **Separação Server vs. Client:** Arquivos que utilizam `crypto` nativo do Node.js (`edge-ticket.ts`, `pin-scrypt.ts`) nunca devem ser importados por arquivos com `'use client'`. Componentes cliente devem importar apenas `edge-urls.ts`, `validators.ts`, `theme-config.ts` e `coach-marks-steps.ts`.
2. **Adição de Novas Paletas:** Para cadastrar uma nova combinação de cores, adicione a entrada no objeto `THEME_PALETTES` em `theme-config.ts` e as respectivas variáveis em `src/app/globals.css`.

