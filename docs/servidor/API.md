# 📡 Referência Completa da API REST & WebDAV

> **Especificação de Endpoints, Payloads e Contratos HTTP (V12.0)**  
> Base URL: `http://localhost:8080` (Local) | `https://storage.hublabdiv.com.br` (Externo via Cloudflare Tunnel)

---

## 1. Autenticação e Cabeçalhos Padrão

- **Autenticação Administrativa:** Enviada via header `x-admin-key: <ADMIN_PASSWORD>` ou cookie de sessão.
- **Sessão do Cofre (PIN):** O cliente envia `x-session-token: <uuid>` em requisições ao cofre para validar se pastas com PIN foram desbloqueadas.
- **Autenticação WebDAV:** HTTP Basic Auth padrão (`Authorization: Basic <base64(user:pass)>`), onde `pass` corresponde a `ADMIN_PASSWORD`.

---

## 2. Telemetria e Diagnóstico do Sistema

### `GET /api/status`
Retorna o estado do hardware, memória RAM do processo, armazenamento e disponibilidade do HD externo.

- **Resposta (200 OK):**
```json
{
  "status": "online",
  "uptimeSeconds": 14230,
  "nodeVersion": "v18.19.0",
  "memory": {
    "rssMB": 52.4,
    "heapUsedMB": 31.8,
    "heapTotalMB": 42.1
  },
  "storage": {
    "activeDir": "/storage/31E0-19FD/Android/data/com.termux/files/hub_data",
    "totalGB": 931.5,
    "freeGB": 412.3,
    "usedGB": 519.2,
    "usedPercent": 55.7
  },
  "catalog": {
    "itemsCount": 1840,
    "albumsCount": 12
  }
}
```

### `GET /api/network/info`
Retorna o IP local na rede Wi-Fi/Ethernet para facilitar a conexão WebDAV em outros dispositivos.

- **Resposta (200 OK):**
```json
{
  "localIp": "192.168.0.190",
  "port": 8080,
  "webdavUrl": "http://192.168.0.190:8080/webdav",
  "interfaces": [
    { "name": "wlan0", "ip": "192.168.0.190", "mac": "xx:xx:xx:xx:xx:xx" }
  ]
}
```

---

## 3. Catálogo e Portfólio Fotográfico

### `GET /api/portfolio/catalog`
Retorna a lista completa de fotografias catalogadas, álbuns, configurações globais e metadados visuais.

- **Resposta (200 OK):**
```json
{
  "items": [
    {
      "id": "foto_001",
      "relativePath": "portfolio/EVENTOS/show.jpg",
      "filename": "show.jpg",
      "album": "EVENTOS",
      "subalbum": "",
      "mime": "image/jpeg",
      "width": 6000,
      "height": 4000,
      "camera": "Sony A7 IV",
      "favorite": true,
      "tags": ["#destaque", "#show"],
      "versions": {
        "original": "/api/raw/portfolio/EVENTOS/show.jpg",
        "thumbnail": "/api/thumb/portfolio/EVENTOS/show.jpg.avif"
      }
    }
  ],
  "albums": ["EVENTOS", "FESTAS", "POLÍTICAS"],
  "settings": {
    "portfolioEnabled": true,
    "layout": {
      "folderMeta": {
        "EVENTOS": { "icon": "celebration", "color": "#FFB703", "inPortfolio": true }
      }
    }
  }
}
```

### `POST /api/portfolio/settings`
Atualiza as configurações globais do portfólio (ex.: ativar/desativar galeria pública ou visual das pastas).

- **Payload:**
```json
{
  "portfolioEnabled": true,
  "folderMeta": {
    "EVENTOS": { "icon": "photo_camera", "color": "#7209B7", "inPortfolio": true }
  }
}
```
- **Resposta (200 OK):** `{ "success": true, "settings": { ... } }`

### `POST /api/portfolio/items/meta`
Atualiza favoritos e tags de uma fotografia do portfólio.

- **Payload:**
```json
{
  "id": "foto_001",
  "favorite": true,
  "tags": ["#selecionadas", "#pb"]
}
```
- **Resposta (200 OK):** `{ "success": true, "item": { ... } }`

---

## 4. Gestão de Arquivos do Cofre (Explorer)

### `GET /api/vault/list`
Lista o conteúdo (subpastas e arquivos) de um diretório. Mapeia a raiz lógica `stangorlini` com as 3 seções fixas padrão (`Portfólio`, `Cofre`, `Lixeira`).

- **Query Params:**
  - `folder` (string, opcional): Caminho relativo da pasta (ex.: `stangorlini/Cofre/Docs`). Se omitido ou vazio, retorna a raiz do usuário.
  - `tag` (string, opcional): Filtra arquivos com uma tag específica.
  - `favorite` (boolean, opcional): Filtra apenas arquivos marcados como favoritos.
- **Resposta (200 OK):**
```json
{
  "currentFolder": "stangorlini/Cofre",
  "parentFolder": "stangorlini",
  "folders": [
    {
      "name": "Docs",
      "path": "stangorlini/Cofre/Docs",
      "scopeKey": "Cofre::Docs",
      "icon": "description",
      "color": "#4CC9F0",
      "pinProtected": false,
      "inPortfolio": false
    }
  ],
  "files": [
    {
      "name": "relatorio.txt",
      "path": "stangorlini/Cofre/relatorio.txt",
      "size": 14200,
      "modified": "2026-11-06T19:30:00.000Z",
      "mime": "text/plain",
      "favorite": false,
      "tags": ["#urgente"]
    }
  ]
}
```
- **Erro (403 Forbidden):** Se a pasta for protegida por PIN e a sessão atual não tiver fornecido a senha.
```json
{ "error": "Pasta protegida por PIN", "pinProtected": true, "folder": "stangorlini/Cofre" }
```

### `POST /api/vault/upload`
Upload de múltiplos arquivos para a pasta atual via multipart.

- **Headers:** `Content-Type: multipart/form-data`
- **Campos do Formulário:**
  - `folder`: Caminho de destino (ex.: `stangorlini/Cofre/Projetos`)
  - `files`: Arquivos binários anexados
- **Resposta (200 OK):**
```json
{
  "success": true,
  "uploaded": 3,
  "files": ["projeto1.zip", "diagrama.png", "notas.txt"]
}
```

### `POST /api/vault/mkdir`
Cria um novo diretório na pasta indicada.

- **Payload:**
```json
{
  "folder": "stangorlini/Cofre",
  "name": "Novos Projetos"
}
```
- **Resposta (200 OK):** `{ "success": true, "path": "stangorlini/Cofre/Novos Projetos" }`

### `POST /api/vault/create-txt`
Cria um arquivo de texto diretamente pelo navegador.

- **Payload:**
```json
{
  "folder": "stangorlini/Cofre",
  "filename": "ideias.txt",
  "content": "Anotações do projeto..."
}
```
- **Resposta (200 OK):** `{ "success": true, "path": "stangorlini/Cofre/ideias.txt" }`

### `GET /api/vault/read-text`
Lê o conteúdo em texto plano de um arquivo suportado (`.txt`, `.json`, `.py`, `.js`, `.css`, `.html`, `.md`, `.sh`, `.log`). Possui limite de segurança de 8 MB.

- **Query Params:** `path=stangorlini/Cofre/notas.md`
- **Resposta (200 OK):**
```json
{
  "success": true,
  "path": "stangorlini/Cofre/notas.md",
  "filename": "notas.md",
  "size": 420,
  "content": "# Título do Documento\nConteúdo aqui..."
}
```

### `POST /api/vault/save-text`
Salva alterações feitas em arquivos de texto pelo editor do navegador.

- **Payload:**
```json
{
  "path": "stangorlini/Cofre/notas.md",
  "content": "# Título Atualizado\nNovo conteúdo..."
}
```
- **Resposta (200 OK):** `{ "success": true, "savedBytes": 512 }`

### `DELETE /api/vault/delete`
Move um arquivo ou diretório para a **Lixeira Segura** com retenção de 15 dias (não destrói fisicamente).

- **Payload:** `{ "path": "stangorlini/Cofre/antigo.txt" }`
- **Resposta (200 OK):** `{ "success": true, "movedToTrash": true }`

### `POST /api/vault/rename`
Move ou renomeia arquivos e diretórios mantendo referências do catálogo intactas.

- **Payload:**
```json
{
  "oldPath": "stangorlini/Cofre/antigo.txt",
  "newPath": "stangorlini/Cofre/novo_nome.txt"
}
```
- **Resposta (200 OK):** `{ "success": true }`

### `POST /api/vault/meta`
Personaliza metadados visuais de pastas (ícone, cor, portfólio) e arquivos (favorito, tags).

- **Payload:**
```json
{
  "path": "stangorlini/Portfólio/EVENTOS",
  "icon": "photo_camera",
  "color": "#FFB703",
  "inPortfolio": true
}
```
- **Resposta (200 OK):** `{ "success": true }`

---

## 5. Cofre Criptográfico e Segurança de Pastas (PIN)

### `GET /api/vault/pin/status`
Verifica se uma pasta possui senha cadastrada e se a sessão atual já a destrancou.

- **Query Params:** `folder=stangorlini/Cofre`
- **Resposta (200 OK):**
```json
{
  "folder": "stangorlini/Cofre",
  "hasPin": true,
  "isUnlocked": false
}
```

### `POST /api/vault/pin/setup`
Configuração no **primeiro acesso** (First-Time Setup). Define a senha da pasta quando ainda não existe hash e destranca a sessão imediatamente.

- **Payload:**
```json
{
  "folder": "stangorlini/Cofre",
  "pin": "minha_senha_segura"
}
```
- **Resposta (200 OK):** `{ "success": true, "unlocked": true }`

### `POST /api/vault/pin/verify`
Valida a senha digitada pelo usuário e adiciona a pasta ao conjunto de permissões da sessão.

- **Payload:**
```json
{
  "folder": "stangorlini/Cofre",
  "pin": "minha_senha_segura"
}
```
- **Resposta (200 OK):** `{ "success": true, "unlocked": true }`
- **Erro (401 Unauthorized):** `{ "error": "Senha incorreta" }`

### `POST /api/vault/pin/remove`
Remove a proteção de senha de uma pasta (exige informar a senha atual).

- **Payload:**
```json
{
  "folder": "stangorlini/Cofre",
  "pin": "minha_senha_segura"
}
```
- **Resposta (200 OK):** `{ "success": true, "removed": true }`

---

## 6. Lixeira Centralizada (`storage/.trash`)

### `GET /api/vault/trash`
Retorna a lista de itens retidos na lixeira, data da exclusão, tamanho e dias restantes para expurgo.

- **Resposta (200 OK):**
```json
{
  "items": [
    {
      "id": "1730930000000_foto.jpg",
      "originalPath": "stangorlini/Portfólio/EVENTOS/foto.jpg",
      "deletedAt": "2026-11-06T20:00:00.000Z",
      "daysLeft": 15,
      "size": 4500000
    }
  ],
  "totalItems": 1,
  "totalBytes": 4500000
}
```

### `POST /api/vault/trash/restore`
Restaura o item de volta ao seu caminho original.

- **Payload:** `{ "id": "1730930000000_foto.jpg" }`
- **Resposta (200 OK):** `{ "success": true, "restoredPath": "stangorlini/Portfólio/EVENTOS/foto.jpg" }`

### `DELETE /api/vault/trash/purge`
Purga definitiva de um item específico ou esvaziamento completo da lixeira.

- **Payload:** `{ "id": "all" }` (ou `{ "id": "<itemId>" }`)
- **Resposta (200 OK):** `{ "success": true, "purgedCount": 1 }`

---

## 7. Caçador de Duplicatas e Atalhos

### `GET /api/vault/duplicates`
Executa o escaneamento por tamanho e hash SHA-256 e retorna grupos de arquivos idênticos.

- **Resposta (200 OK):**
```json
{
  "groups": [
    {
      "hash": "a1b2c3d4...",
      "size": 15400000,
      "reclaimableBytes": 15400000,
      "files": [
        "stangorlini/Portfólio/EVENTOS/original.jpg",
        "stangorlini/Cofre/Backup/copia.jpg"
      ]
    }
  ],
  "totalDuplicates": 1,
  "totalReclaimableBytes": 15400000
}
```

### `POST /api/vault/duplicates/deduplicate`
Converte arquivos duplicados físicos em atalhos virtuais leves (`.shortcut.json`), liberando os bytes no disco.

- **Payload:**
```json
{
  "keepPath": "stangorlini/Portfólio/EVENTOS/original.jpg",
  "duplicatePaths": [
    "stangorlini/Cofre/Backup/copia.jpg"
  ]
}
```
- **Resposta (200 OK):** `{ "success": true, "freedBytes": 15400000 }`

---

## 8. Compartilhamento com Clientes e Streaming ZIP

### `POST /api/shares/create`
Gera um link compartilhado seguro com token randômico.

- **Payload:**
```json
{
  "folder": "stangorlini/Portfólio/EVENTOS/CASAMENTO",
  "label": "Galeria do Casamento - Lucas e Beatriz",
  "mode": "proofing",
  "expiresHours": 168,
  "watermark": false
}
```
- **Opções de `mode`:**
  - `view`: Modo visualização somente-leitura.
  - `proofing`: Permite ao cliente marcar fotos com estrela e enviar observações.
  - `upload_only`: Caixa de entrada para os convidados enviarem fotos sem verem os outros arquivos.
- **Resposta (200 OK):**
```json
{
  "success": true,
  "share": {
    "id": "sh_98fbc12a",
    "token": "4a7f0e318d9b23c5e810a47291cb09f8",
    "url": "http://192.168.0.190:8080/s/4a7f0e318d9b23c5e810a47291cb09f8",
    "mode": "proofing",
    "expiresAt": "2026-11-13T20:00:00.000Z"
  }
}
```

### `GET /s/:token`
Serve a página SPA autônoma `public/share.html` para os clientes.

### `GET /api/shares/:token/meta`
Retorna as fotos da pasta vinculada ao link com resolução de marca d'água e regras de download.

### `POST /api/shares/:token/feedback`
Registra a seleção de fotos do cliente (Client Proofing). Aplica automaticamente a tag `#selecionadas` no catálogo.

- **Payload:**
```json
{
  "clientName": "Beatriz",
  "selections": ["foto_001.jpg", "foto_005.jpg"],
  "notes": "Por favor remover o reflexo no óculos na foto 005."
}
```
- **Resposta (200 OK):** `{ "success": true, "taggedCount": 2 }`

### `POST /api/shares/:token/upload`
Recebe uploads enviados pelo cliente no modo `upload_only`.

### `GET /api/export/zip?folder=...` (ou `token=...`)
Gera um arquivo `.ZIP` compactado sob demanda em **STORE Mode** canalizado diretamente no stream de resposta (`Content-Type: application/zip`).
- **Segurança:** Retorna HTTP 403 Forbidden se o link compartilhado possuir restrição de marca d'água (`watermark: true`).

---

## 9. Métodos WebDAV RFC 4918 (`/webdav/*`)

| Método | Caminho | Descrição |
| :--- | :--- | :--- |
| `OPTIONS` | `/webdav/` | Retorna cabeçalhos `DAV: 1, 2` e lista de métodos autorizados. |
| `PROPFIND` | `/webdav/[pasta]` | Retorna árvore XML com código **207 Multi-Status** (tamanho, data de modificação, MIME type, coleções). |
| `GET` | `/webdav/[arquivo]` | Download direto do arquivo via stream com cabeçalho de tipo MIME. |
| `HEAD` | `/webdav/[arquivo]` | Consulta rápida de existência, tamanho e cabeçalhos sem transferir o corpo. |
| `PUT` | `/webdav/[arquivo]` | Upload de arquivo gravado diretamente no disco rígido. |
| `MKCOL` | `/webdav/[pasta]` | Criação de novo diretório. Retorna **201 Created**. |
| `DELETE` | `/webdav/[alvo]` | Exclusão segura redirecionada para a **Lixeira (15 dias)**. Retorna **204 No Content**. |
| `MOVE` | `/webdav/[origem]` | Renomeia ou move arquivos através do cabeçalho `Destination: /webdav/[destino]`. |
| `COPY` | `/webdav/[origem]` | Duplica arquivos ou pastas com suporte a sobrescrita controlada (`Overwrite: T`). |

