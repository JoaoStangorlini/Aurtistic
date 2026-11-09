# Módulo `src/components/` — Catálogo de Componentes de Interface

Esta pasta contém todos os componentes visuais e de interação do Aurtistic, organizados estritamente por domínio de responsabilidade.

## Estrutura de Subdiretórios

```
src/components/
├── auth/           # Login unificado, cadastro local, SSO com o HUB LabDiv e vinculação de contas
├── dashboard/      # Telas centrais: Navbar, Workspace, Tarefas, Resumo, Currículo, Badges
├── media/          # Dock de áudio global, player e visualizadores de mídia in-place
├── onboarding/     # Motor de tutorial guiado interativo (Coach Marks Overlay e Provider)
├── organizacoes/   # Gestão multi-tenant: Equipes, Subequipes, Reuniões, When2Meet e Bateria Cognitiva
├── portfolio/      # Galeria Passe-Partout com suporte EXIF, álbuns e lightbox fotográfico
├── servidor/       # Explorer do Cofre, cartão de quota, governança e modais de notas/PIN
├── share/          # Portal do Cliente (/s/[token]) para aprovação fotográfica
├── tarefas/        # Modais de seleção, upload e vinculação de arquivos a tarefas
└── theme/          # Provedor do sistema de temas multi-eixo e seletor na navbar
```

## Mapa dos Subdiretórios e Responsabilidades

| Subpasta | Contexto Principal | Componentes Chave |
| :--- | :--- | :--- |
| `auth/` | Autenticação & Identidade | `UnifiedAuthCard`, `HubLinkCard` |
| `organizacoes/` | Gestão Institucional & Equipes | `LabDivWorkspaceClient`, `TeamProgressPanel`, `OrganizationScopeToolbar`, `LiveMeetingSplitWorkspace`, `When2MeetSchedulerGrid`, `MemberCapacityQuickSelector` |
| `dashboard/` | Área administrativa e pessoal | `AurtisticNavbar`, `AurtisticWorkspaceClient`, `TasksView`, `ResumoClient`, `CurriculoClient`, `Badge` |
| `theme/` | Gestão de Modo e Paletas | `ThemeProvider`, `ThemedTopLoader`, `ThemeDropdownSection` |
| `onboarding/` | Tour Interativo (?) | `CoachMarksProvider`, `CoachMarksOverlay` |
| `portfolio/` | Vitrine Fotográfica & Acervo | `AurtisticGalleryGrid`, `PhotoInspectModal` |
| `servidor/` | Gerenciamento de Arquivos | `UserVaultWorkspace`, `StorageQuotaCard`, `AdminQuotaGovernancePanel`, `NoteEditorDrawer`, `PinLockModal`, `FileEcosystemMenu` |
| `share/` | Prova e Aprovação de Clientes | `ClientProofingView` (com modos `proofing` e `view`) |
| `media/` | Reprodutores de Mídia | `AurtisticMediaContext`, `GlobalAudioDock`, `InPlaceFilePreviewModal` |
| `tarefas/` | Vínculo de Mídia a Tarefas | `TaskFilePickerModal` |

## Como os Contextos se Conectam

1. **`ThemeProvider` (Raiz em `layout.tsx`):** Controla o modo de luminosidade (`light` / `dark` / `system`) e a paleta bicolor ativa (`purple-gold`, `blue-red`, `pink-green`, `cyan-amber`, `emerald-violet`).
2. **`CoachMarksProvider`:** Fica ativo globalmente e escuta a rota atual (`usePathname`). Ao clicar no botão `?` da `AurtisticNavbar`, aciona o spotlight SVG para os elementos da tela correspondentes.
3. **`AurtisticMediaProvider`:** Fornece tickets efêmeros e estado de reprodução contínua para áudio e modais de inspeção sem recarregar o player ao navegar entre páginas.

