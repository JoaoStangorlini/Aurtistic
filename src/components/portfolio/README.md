# Módulo Portfólio Fotográfico (`src/components/portfolio`)

Componentes da vitrine de fotografia autoral e projetos do ecossistema **Aurtistic**, projetados com moldura de alta fidelidade *Passe-Partout*, suporte a acervos com milhares de obras e modal de inspeção a 60 FPS com leitura de metadados EXIF.

Licenciado sob **GNU Affero General Public License v3.0 (AGPLv3)**.

---

## Componentes

| Componente | Descrição |
| :--- | :--- |
| `AurtisticGalleryGrid.tsx` | Grade responsiva de 1 a 5 colunas com visualização por subpastas ou fluxo contínuo, filtros por álbum, busca textual e download em lote (.ZIP). |
| `PhotoInspectModal.tsx` | Lightbox fotográfico imersivo com navegação por teclado (`←`, `→`, `Esc`), zoom/pan suave, leitor de EXIF completo (ISO, abertura, velocidade, distância focal, lente, câmera) e fallback resiliente caso o HD externo esteja desconectado. |

---

## Otimizações de Desempenho

1. **Lazy Loading Nativo:** Carregamento sob demanda com miniaturas geradas em `.avif` pelo Edge Node.
2. **Fallback Resiliente:** Tratamento elegante de `onError` com card informativo *"HD USB em Espera"* caso a foto original ainda não esteja sincronizada no disco físico.
3. **Download Sob Demanda:** Geração e streaming direto de arquivos `.zip` a partir do Edge Node sem sobrecarregar a memória do cliente.

