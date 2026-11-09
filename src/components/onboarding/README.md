# Módulo Onboarding & Guias Interativos (`src/components/onboarding`)

Componentes responsáveis pelo acolhimento de novos usuários, calibração neurodivergente inicial e sistema de tutoriais Coach Marks do ecossistema **Aurtistic**.

Licenciado sob **GNU Affero General Public License v3.0 (AGPLv3)**.

---

## Componentes

| Componente | Descrição |
| :--- | :--- |
| `CoachMarksProvider.tsx` | Context Provider e overlay flutuante para o tour guiado passo a passo via seletores `data-tour`. |
| `FirstTimeOnboardingModal.tsx` | Modal de primeiro acesso em 3 etapas (Boas-vindas, Escolha de Tema & Paleta Bicolor, e Ativação do Tour). |

---

## Integração

- O `FirstTimeOnboardingModal` é acionado automaticamente se a chave `aurtistic_onboarding_completed_v1` não existir no `localStorage`, e pode ser reaberto pelo evento customizado de janela `aurtistic:relaunch-onboarding`.
- O `CoachMarksProvider` injeta um destaque visual no elemento alvo (`selector`), calcula a posição relativa do balão e fornece controles de navegação acessíveis por teclado (`Esc`, `Enter`).

