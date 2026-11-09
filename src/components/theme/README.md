# Módulo Tema Dinâmico & Acessibilidade (`src/components/theme`)

Componentes e provedores responsáveis pelo Sistema de Temas Multi-Eixo (Modos Claro, Escuro e Automático combinados com 5 Paletas Bicolores calibradas para contraste WCAG AA) do ecossistema **Aurtistic**.

Licenciado sob **GNU Affero General Public License v3.0 (AGPLv3)**.

---

## Componentes

| Componente | Descrição |
| :--- | :--- |
| `ThemeProvider.tsx` | Provedor de contexto global de tema, sincronização com preferências do sistema (`prefers-color-scheme`) e injeção de classes CSS dinâmicas (`theme-purple-gold`, `theme-blue-red`, etc.). |
| `ThemedAurtisticLogo.tsx` | Logotipo autêntico oficial da identidade visual Aurtistic (ícone cerebral + tipografia + checkbox) adaptado para as 5 paletas bicolores nos modos Escuro e Claro. |
| `ThemeDropdownSection.tsx` | Seção retrátil do menu de perfil para alternância de modo (Claro/Auto/Escuro) e paleta bicolor. |

---

## Paletas Disponíveis

1. `purple-gold` (Roxo & Dourado - Padrão)
2. `blue-red` (Azul & Vermelho)
3. `pink-green` (Rosa & Verde)
4. `cyan-amber` (Ciano & Âmbar)
5. `emerald-violet` (Esmeralda & Violeta)

---

## Assets Visuais & Ícones Temáticos (`public/logos/` e `public/icons/`)

- **Logotipo Autêntico:** `/logos/logo-[palette]-[mode].png` gerado a partir de `public/aurtistic_logo_white_v3.png` preservando 100% da tipografia original e detalhes gráficos.
- **Favicon & Apple Touch Icon Dinâmicos:** `/icons/icon-[palette].png` atualizados em tempo real no `<head>` via `ThemeProvider.tsx` ao alternar a paleta.
- **Suporte Nativo Android (Capacitor):** Requer configuração de múltiplos `<activity-alias>` no `AndroidManifest.xml` para alternância de ícone do launcher nativo via `PackageManager.setComponentEnabledSetting()`.

