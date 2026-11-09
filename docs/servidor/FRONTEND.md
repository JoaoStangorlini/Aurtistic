# 🎨 Arquitetura do Frontend — Interface do Usuário & Design System

> **Documento de Engenharia de Interface e Experiência do Usuário (V12.0)**  
> Tecnologias: Vanilla JavaScript (ES6+), HTML5 Semântico, CSS3 Moderno (Custom Properties & Flexbox/Grid). Zero frameworks pesados (React, Vue ou Angular), garantindo carregamento instantâneo a 60 fps em navegadores de TV, celulares antigos e computadores.

---

## 1. Design System: *Obsidian Violet & Liquid Gold*

A identidade visual foi construída sobre uma paleta luxuosa e de alto contraste, otimizada para telas OLED e monitores com suporte a HDR:

| Token CSS | Hexadecimal | Finalidade no Layout |
| :--- | :--- | :--- |
| `--bg-obsidian` | `#0D0714` | Fundo principal da aplicação |
| `--bg-surface` | `#160B24` | Superfície de cards, modais e containers |
| `--bg-card` | `#220F38` | Cards de arquivos, subpastas e itens em foco |
| `--accent-gold` | `#FFB703` | Botões primários, destaques, estrelas de favoritos e FAB |
| `--accent-violet` | `#7209B7` | Gradientes secundários, bordas ativas e pílulas |
| `--text-primary` | `#F8F9FA` | Textos principais, títulos e ícones de alta prioridade |
| `--text-muted` | `#ADB5BD` | Metadados (tamanhos de arquivo, datas, legendas) |
| `--border-subtle` | `rgba(255, 183, 3, 0.15)` | Linhas de divisão e contornos de cards |

---

## 2. Gerenciamento de Estado Reativo Global (`window.state`)

Para manter todas as partes da tela em perfeita sincronia sem uma biblioteca de estado externa, a aplicação utiliza um objeto global reativo `window.state`:

```javascript
window.state = {
  // Catálogo fotográfico sincronizado com /api/portfolio/catalog
  catalog: { items: [], albums: [], settings: {} },

  // Navegação atual no Explorer do Cofre
  vault: {
    currentFolder: '',         // ex.: "stangorlini/Cofre/Docs"
    parentFolder: '',          // ex.: "stangorlini/Cofre"
    folders: [],               // Subpastas da pasta atual
    files: [],                 // Arquivos da pasta atual
    scope: 'vault'             // 'vault' (Meu Cofre) ou 'portfolio' (Pastas do Portfólio)
  },

  // Conjunto de chaves de pastas com PIN destrancadas na sessão
  unlockedFolders: new Set(),

  // Fila de reprodução e estado do dock de áudio
  audioPlayer: {
    playlist: [],              // Lista de faixas da pasta atual
    currentIndex: 0,           // Índice da música em reprodução
    isPlaying: false
  },

  // Seleção múltipla de arquivos (Shift / Ctrl + Click)
  selectedFiles: new Set(),

  // Termo de busca global digitado na Navbar
  searchQuery: ''
};
```

---

## 3. Componentes Principais da Interface

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [Logo] João Stangorlini   [ 🔍 Buscar no acervo... (/) ]  [+Pasta] [+Txt] [↻]  │  ◄── Top App Bar Fixa
├──────────────────────────────────────────────────────────────────────────────┤
│  Modo: [ 🔐 Meu Cofre (stangorlini) ]   [ 🖼️ Pastas do Portfólio ]          │  ◄── Seletor de Escopo
├──────────────────────────┬───────────────────────────────────────────────────┤
│  ESTRUTURA DE DIRETÓRIOS │  stangorlini / Cofre                              │
│                          │  ───────────────────────────────────────────────  │
│  ▼ 📁 stangorlini        │  SUBPASTAS (3)                                    │
│    ▶ 🖼️ Portfólio        │  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│    ▼ 🔒 Cofre            │  │ 📁 Docs   │ │ 📁 Proj  │ │ 📁 Pessoal│           │
│      • Docs              │  └──────────┘ └──────────┘ └──────────┘           │
│      • Projetos          │                                                   │
│    ▶ 🗑️ Lixeira          │  ARQUIVOS E FOTOGRAFIAS (2)                       │
│                          │  ┌──────────┐ ┌──────────┐                        │
│                          │  │ 📄 doc.pdf│ │ 🎵 som.mp3│                        │
│                          │  └──────────┘ └──────────┘                        │
├──────────────────────────┴───────────────────────────────────────────────────┤
│  [ 🎵 Nome da Faixa.mp3 ]  [⏮] [▶/⏸] [⏭]  ═══════════●═══════ 02:45 / 04:12    │  ◄── Dock Flutuante de Áudio
└───────────────────────────────────────────────────────────────────────[ + ]──┘  ◄── FAB (Speed Dial M3)
```

### 3.1. Barra Superior Fixa (`header.top-app-bar`)
- **Busca Global Integrada:** Input com captura automática do atalho de teclado `/`. Filtra fotografias por metadados, pastas por nome e arquivos por extensão em tempo real.
- **Atalhos Rápidos ao lado do Usuário:**
  - `📁 + Pasta`: Abre o diálogo nativo para criação imediata de diretório na pasta atual.
  - `📄 + Arquivo .txt`: Abre modal para redigir uma nota ou script em texto plano.
  - `🔄 Sincronizar`: Força o recarregamento do catálogo do disco rígido e atualiza a árvore.

### 3.2. Botão Flutuante (FAB) com Speed Dial M3
Posicionado em `fixed bottom-6 right-6 z-[90]`, o botão circular com borda dourada expande um leque de ações rápidas:
1. `⬆️ Fazer Upload de Arquivos` (dispara o seletor nativo `input[type="file"]`)
2. `📁 Nova Pasta`
3. `📄 Novo Arquivo .txt`
4. `⚡ Extrair / Subir .ZIP`

### 3.3. Dock Flutuante Contínuo de Áudio (`#audioPlayerFloatingDock`)
- Posicionado na base da tela sobre qualquer visualização.
- Carrega dinamicamente todas as músicas da pasta visitada.
- Avanço contínuo: quando uma faixa termina (`ended`), o player inicia automaticamente a faixa seguinte.
- Controles: Botão Play/Pause com animação, botão Anterior/Próximo, Scrubber com arraste manual e volume.

### 3.4. Modal de Vídeo HD (`#videoPlayerModal`)
- Utiliza a tag `<video>` nativa do navegador conectada ao endpoint de streaming HTTP 206.
- Suporta seek instantâneo em arquivos de dezenas de gigabytes sem travamentos.

### 3.5. Central de Visualização e Edição de Documentos (`#modalDocViewer`)
- **PDFs:** Embutidos via `<iframe>` aproveitando o visualizador nativo do navegador.
- **Markdown (`.md`):** Parser rápido renderizando títulos, links, tabelas e listas estilizadas com opção de alternar para o código bruto.
- **Editor de Código / Texto:** Textarea monoespaçado com suporte a `.txt`, `.py`, `.js`, `.json`, `.sh`, `.css` e botão `💾 Salvar Alterações` (via `POST /api/vault/save-text`).

### 3.6. Central de Conexão WebDAV (`#modalWebdavConnect`)
- Modal intuitivo com guias visuais passo a passo para:
  - **Windows:** Mapear como unidade `Z:` pelo Explorer (`Win + E`).
  - **macOS:** Conectar via `Cmd + K` (`http://<ip>:8080/webdav`).
  - **Linux:** Conectar no Nautilus (`dav://<ip>:8080/webdav`).
  - **Mobile:** Conexão via aplicativos VLC e MiXplorer no Wi-Fi.

---

## 4. Gerador de QR Code Vetorial Puro (`public/js/qr-generator.js`)

Desenvolvido para operar **sem nenhuma dependência externa**. Renderiza uma matriz vetorial SVG nítida com algoritmo Reed-Solomon diretamente no DOM do modal de compartilhamento:
- Permite ao fotógrafo apontar o celular para a tela da TV ou monitor e abrir a galeria instantaneamente no smartphone do cliente.

