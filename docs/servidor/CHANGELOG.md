# 📋 Histórico e Entregas Consolidadas (Sprint 0 à Sprint 4)

Este documento registra em ordem cronológica e estruturada todos os marcos de arquitetura, correções, módulos e recursos desenvolvidos no ecossistema do **Fire Stick Portal** desde a concepção de estabilização de hardware (Sprint 0) até a maturidade multimídia e compartilhamento de arquivos em rede (Sprint 4).

---

1. **Sprint 0 — Estabilidade de Hardware & I/O no Fire Stick (Termux/Android):** Mapeamento do armazenamento físico externo via FUSE USB (`/storage/*`), eliminando bloqueios de permissão do Android.

2. **Sprint 0 — Monitor de Hotplug Não-Bloqueante:** Verificação periódica através de `/proc/mounts`, sem acordar o motor mecânico do HD para leituras vazias.

3. **Sprint 0 — Telemetria O(1) em RAM:** Estruturação de cache de estatísticas de armazenamento e tráfego na memória do Node.js, prevenindo sobrecarga de I/O contínuo no hardware embarcado.

4. **Sprint 0 — Isolamento de Chaves e Credenciais:** Centralização de credenciais administrativas e segredos criptográficos no arquivo `.env`, protegendo senhas e tokens contra exposição em logs ou commits.

5. **Sprint 0 — Streaming HTTP 206 Nativo:** Implementação de `streamFileWithRange` com suporte a cabeçalhos `Range: bytes=start-end` e chunks de 64 KB, reduzindo a pegada de RAM do Fire Stick a quase zero durante reproduções de vídeo e áudio pesados.

6. **Etapa Zero — Resolução Universal de Escopo de Pastas:** Criação da função canônica `normalizeFolderScopeKey` no backend e no frontend, padronizando caminhos como `portfolio/EVENTOS/SHOW` em chaves determinísticas `EVENTOS::SHOW`.

7. **Etapa Zero — Unificação de Metadados de Favoritos e Tags:** Ajuste nos endpoints `/api/vault/meta` e `/api/portfolio/items/meta` para aceitar `paths` relativos e `itemIds`, gravando metadados fora do portfólio em `vaultFileMeta` e eliminando 100% dos erros HTTP 404.

8. **Etapa Zero — Botão de Estrela (⭐) Interativo nos Cards:** Inclusão de ação de favoritar com 1 clique diretamente nos cards de arquivos do Cofre, nos cards do Portfólio (`renderMatteFrameHtml`) e no Lightbox (`#lbBtnFavorite`).

9. **Etapa Zero — Proteção de Permissões Visitante vs. Admin:** Exibição do status de favorito em modo somente-leitura para visitantes anônimos, bloqueando mutações não autorizadas no catálogo e prevenindo erros 401/403.

10. **Etapa Zero — Modernização Responsiva do Dock do Studio:** Remoção dos switches legados binários e introdução do seletor direto de colunas (1 a 5) e alternador de dispositivo (`📱 Celular` | `📷 Câmera`).

11. **Etapa Zero — Correção da Quebra de Layout em Dispositivos Móveis:** Ajuste no container do Cofre (`#vaultDetailContainer`), garantindo renderização fluida da árvore e do grid de arquivos em telas inferiores a 768px.

12. **Sprint 1 — Sincronização Bidirecional em Tempo Real:** Atualização reativa de `state.catalog` no frontend a cada mutação de metadados, disparando re-render imediato dos nós da árvore, grid do cofre e pílulas de navegação.

13. **Sprint 1 — Sistema de Atalhos Virtuais Leves:** Criação do módulo `lib/shortcut-manager.js`, permitindo espelhar fotografias em múltiplos álbuns sem duplicar arquivos físicos no disco rígido.

14. **Sprint 1 — Motor de Busca e Filtro de Tags Multiescopo:** Criação de `lib/search-engine.js` para busca instantânea por nome, extensão e marcadores (`#tags`), integrado à barra de ferramentas do Cofre.

15. **Sprint 2 — Lixeira Centralizada com Retenção de 15 Dias:** Implementação do módulo `lib/trash-manager.js` e diretório seguro `storage/.trash`, movendo itens excluídos com timestamp e preservando manifesto atômico (`trash_manifest.json`).

16. **Sprint 2 — Interface e Operações da Lixeira no Cofre:** Modal `#vaultTrashModal` exibindo itens deletados, dias restantes de retenção, contagem total, botão de restauração ao caminho original e purga definitiva.

17. **Sprint 2 — Deduplicador e Caçador de Cópias:** Implementação do módulo `lib/deduplicator.js` com cálculo de hashes SHA-256 via streaming por blocos, detectando arquivos fisicamente idênticos no HD.

18. **Sprint 2 — Conversão Assistida de Duplicatas em Atalhos:** Modal `#vaultDeduplicatorModal` que identifica bytes desperdiçados e converte cópias físicas redundantes em atalhos virtuais com 1 clique.

19. **Sprint 2 — Isolamento Criptográfico de Pastas com PIN:** Módulo `lib/pin-vault.js` usando `crypto.scryptSync` nativo do Node.js (sem bcrypt e sem módulos C++ externos), gerando salts e hashes seguros por pasta.

20. **Sprint 2 — Separação Estrita de Ambientes (Meu Cofre vs. Pastas do Portfólio):** Seletor no topo do Explorer permitindo alternar entre o escopo de arquivos pessoais e as pastas de álbuns fotográficos públicos.

21. **Sprint 2 — Ocultação Estrita de Arquivos de Sistema:** Filtro determinístico no backend e frontend para esconder `.trash`, `trash_manifest.json`, `catalog.json`, `shares.json`, `trash.json` e `audit.jsonl` da árvore e dos grids.

22. **Sprint 2 — Dicionário de SVGs Inline e Bordas Reativas:** Renderização de ícones SVG nítidos com aplicação imediata de cor no ícone, no texto e na propriedade `border-color` dos cards de subpasta.

23. **Sprint 2 — Menu Dropdown Compacto de Mais Ações (⋮):** Inclusão de menu suspenso contendo ações avançadas (Bloquear com PIN, Criar Atalho, Mover/Renomear, Duplicatas e Lixeira).

24. **Sprint 3 — Raiz Padrão do Usuário (stangorlini):** Reestruturação da raiz do Explorer para apresentar 3 seções fixas padrão: `🖼️ Portfólio`, `🔒 Cofre` e `🗑️ Lixeira`.

25. **Sprint 3 — Fluxo de Primeiro Acesso ao Cofre (First-Time Setup):** Detecção automática via `GET /api/vault/pin/status`; se a pasta `Cofre` não tiver senha cadastrada, abre o modal de definição de senha com confirmação e destranca imediatamente a sessão após salvar.

26. **Sprint 3 — Atalhos Rápidos ao Lado do Nome stangorlini:** Remoção do badge "Nuvem Pessoal" e inserção de 3 botões utilitários compactos: `📁 + Pasta`, `📄 + Arquivo .txt` e `🔄 Sincronizar`.

27. **Sprint 3 — Modal de Criação Rápida de Arquivo .txt:** Interface modal conectada ao endpoint `POST /api/vault/create-txt` para criar notas de texto instantaneamente na pasta atual do disco.

28. **Sprint 3 — Barra de Busca Unificada na Navbar Fixa do Topo:** Integração da busca global na barra superior (`header.top-app-bar`) com atalho de teclado `/` e botão de limpeza, pesquisando fotos, pastas e arquivos em qualquer tela.

29. **Sprint 3 — Remoção do Card Antigo Intermediário do Cofre:** Limpeza visual do topo do Explorer através da exclusão do card duplicado "ARMAZENAMENTO FIRE STICK // USB HUB", otimizando o espaço útil de tela.

30. **Sprint 3 — Botão Flutuante (FAB) com Speed Dial M3:** Botão fixo no canto inferior direito (`fixed bottom-6 right-6 z-[90]`) com menu radial M3 para envio de arquivos, criação de pastas, novo texto e extração de arquivos compactados.

31. **Sprint 3 — Módulo de Links Temporários de Compartilhamento:** Criação de `lib/share-manager.js` e persistência atômica em `shares.json`, gerando tokens aleatórios seguros com controle de expiração (24h, 7d, 30d ou permanente).

32. **Sprint 3 — Portal Web Responsivo do Cliente (/s/:token):** Desenvolvimento da página pública autônoma `public/share.html`, permitindo aos clientes visualizar álbuns pelo navegador de qualquer celular ou computador.

33. **Sprint 3 — Gerador de QR Code em SVG Vetorial Puro:** Implementação de `public/js/qr-generator.js` sem nenhuma biblioteca externa, renderizando QR Codes instantâneos para escaneamento com a câmera do celular.

34. **Sprint 3 — Modo Escolha do Cliente (Client Proofing):** Interface pública com marcação de fotos favoritas, campo de observações para edição e endpoint `POST /api/shares/:token/feedback` que aplica a tag `#selecionadas` no catálogo.

35. **Sprint 3 — Caixa de Entrada e Dropzone Público (upload_only):** Permissão de envio de fotos e vídeos por convidados diretamente para a pasta vinculada ao link com indicador de progresso e sanitização de nomes.

36. **Sprint 3 — Proteção por Marca d'Água e Bloqueio de Original:** Overlay visual de proteção para álbuns comerciais e bloqueio estrito (HTTP 403) para download do arquivo bruto e exportações em ZIP.

37. **Sprint 3 — Streaming ZIP sob Demanda em STORE Mode:** Módulo `lib/zip-exporter.js` empacotando pastas em formato .ZIP via `fflate.ZipPassThrough` direto no stream de resposta HTTP, sem compressão pesada de CPU no Fire Stick e com interrupção instantânea em caso de desconexão (`req.on('close')`).

38. **Sprint 4 — Player Contínuo de Áudio com Dock Flutuante M3:** Player persistente `#audioPlayerFloatingDock` na base da tela, permitindo navegar pelo cofre sem interromper a música, com seekbar interativa e controle de volume.

39. **Sprint 4 — Playlist Sequencial Automática de Áudios:** Coleta dinâmica de todas as faixas da pasta atual com avanço automático para a próxima música ao término da reprodução (`ended`).

40. **Sprint 4 — Modal Dedicado de Vídeo HD (HTTP 206):** Player de vídeo integrado `#videoPlayerModal` com controles responsivos e suporte a seek instantâneo via chunks de 64 KB sem carregar arquivos inteiros na memória.

41. **Sprint 4 — Visualizador Nativo de Documentos PDF:** Integração de visualização limpa de PDFs no modal `#modalDocViewer` via iframe embutido com controles do navegador.

42. **Sprint 4 — Leitor e Parser de Markdown (.md):** Renderização estilizada de títulos, listas, negrito, itálico e blocos de código com alternância entre Modo Leitura e Modo Código.

43. **Sprint 4 — Editor de Arquivos de Texto e Código no Navegador:** Visualizador e editor de texto para formatos `.txt`, `.json`, `.py`, `.js`, `.css`, `.html`, `.sh` e `.log`, conectado ao endpoint `POST /api/vault/save-text` com botão direto "💾 Salvar Alterações".

44. **Sprint 4 — Leitura Segura de Documentos no Backend:** Criação do endpoint `GET /api/vault/read-text` com limite de segurança de até 8 MB e validação de paths contra directory traversal.

45. **Sprint 4 — Servidor WebDAV RFC 4918 Nativo:** Módulo `lib/webdav-server.js` 100% em Node.js com suporte completo aos métodos `OPTIONS`, `PROPFIND` (207 Multi-Status), `GET`, `HEAD`, `PUT`, `MKCOL`, `DELETE`, `MOVE` e `COPY`.

46. **Sprint 4 — Integração WebDAV com a Lixeira Centralizada:** Exclusões de arquivos ou diretórios efetuadas pelo Windows Explorer ou Mac Finder montados via WebDAV são redirecionadas automaticamente para o sistema de retenção de 15 dias da lixeira (`.trash`).

47. **Sprint 4 — Descoberta de Rede e Detecção de IP Local:** Endpoint `GET /api/network/info` mapeando as interfaces de rede do servidor para gerar a URL WebDAV pronta para uso local (`http://<IP>:8080/webdav`).

48. **Sprint 4 — Central de Conexão de Disco de Rede (WebDAV & Wi-Fi):** Modal `#modalWebdavConnect` com guias passo a passo ilustrados para montagem de unidade de rede local no Windows Explorer (`Win + E`), macOS Finder (`Cmd + K`), Linux (Nautilus) e aplicativos móveis (VLC, MiXplorer), permitindo transferir arquivos sem desconectar o HD do Fire Stick.

