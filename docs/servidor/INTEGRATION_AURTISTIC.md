# 🧬 Guia de Integração e Fusão com o Projeto "Aurtistic"

> **Manual de Transição para Novos Workspaces e Agentes de IA**  
> **Objetivo:** Orientar a fusão deste ecossistema (Servidor Fire Stick, Portfólio Fotográfico, Cofre de Arquivos e WebDAV) dentro do projeto principal **Aurtistic** (que já conta com Perfis de Usuários, Sistema de Currículos e Gestão de Artistas).

---

## 1. Contexto Estratégico da Fusão

O **Aurtistic** possui o sistema de gestão de identidade, perfis artísticos, currículos e autenticação. No entanto, necessita de:
1. **Infraestrutura de Armazenamento:** Um cofre pessoal seguro de arquivos, projetos, PDFs e áudios.
2. **Motor de Portfólio de Alta Performance:** Uma galeria fotográfica responsiva (*Pic-Time style*) com suporte a miniaturas e streaming instantâneo.
3. **Compartilhamento para Clientes (Proofing):** Links públicos para aprovação de fotos por clientes com seleção e feedback (`#selecionadas`).
4. **Acesso como Disco de Rede:** Servidor WebDAV para que o artista monte seu cofre no Windows, Mac ou celular sem precisar de pen-drives.

Este repositório (`firestick-portal`) resolve **exatamente esses quatro pilares**.

---

## 2. Padrões de Arquitetura para a Fusão

Ao mover este diretório para dentro do repositório do Aurtistic, você pode adotar uma de duas abordagens:

### Opção A (Recomendada): Sub-Serviço / Microserviço Dedicado (Edge Storage)
- O **Aurtistic** atua como frontend principal e API central de usuários na nuvem ou PC.
- O **Firestick-Portal** roda no hardware do Fire TV Stick (ou Raspberry Pi / Home Server) com o HD USB conectado, atuando como o nó físico de dados (*Edge Storage Node*).
- **Comunicação:** O Aurtistic faz requisições à URL pública do Cloudflare Tunnel (`https://storage.hublabdiv.com.br`) enviando uma chave `API_SECRET_KEY` no cabeçalho.

### Opção B: Monólito Integrado (Importação Direta de Módulos)
Se o backend do Aurtistic for em Node.js (Express, Nest.js ou Fastify):
- Copie a pasta `lib/` (`atomic-store.js`, `share-manager.js`, `trash-manager.js`, `webdav-server.js`, `zip-exporter.js`, `pin-vault.js`) diretamente para `aurtistic/server/lib/`.
- Monte as rotas no app Express do Aurtistic:
  ```javascript
  const webdavServer = new WebDAVServer({ rootDir: path.join(__dirname, 'storage') });
  app.use('/webdav', webdavServer.middleware());
  app.use('/api/vault', vaultRouter);
  app.use('/api/portfolio', portfolioRouter);
  app.use('/api/shares', sharesRouter);
  ```

---

## 3. Adaptação de Usuário Único (`stangorlini`) para Multi-Tenant (Múltiplos Usuários)

Hoje, este servidor opera com a raiz lógica configurada para o usuário administrador (`stangorlini`). No Aurtistic, cada usuário terá seu próprio espaço isolado.

### 3.1. Estrutura de Diretórios Multi-Usuário
Basta parametrizar o caminho físico no disco:

```
storage/
└── users/
    ├── user_uuid_01/ (João Stangorlini)
    │   ├── portfolio/
    │   ├── vault/
    │   └── .trash/
    ├── user_uuid_02/ (Artista Convidado)
    │   ├── portfolio/
    │   ├── vault/
    │   └── .trash/
```

### 3.2. Refatoração do `resolveVaultLogicalPath`
No `server.js`, a função atual:
```javascript
function resolveVaultLogicalPath(userLogicalPath) { ... }
```
Deve ser adaptada para receber o contexto do usuário autenticado no Aurtistic:
```javascript
function resolveUserPath(userId, userLogicalPath) {
  const userRoot = path.join(STORAGE_DIR, 'users', userId);
  // O usuário vê a raiz como seu próprio username (ex.: "stangorlini" ou "maria")
  // Acesso a Portfólio mapeia para: path.join(userRoot, 'portfolio')
  // Acesso a Cofre mapeia para: path.join(userRoot, 'vault')
  // Acesso a Lixeira mapeia para: path.join(userRoot, '.trash')
}
```

---

## 4. Unificação da Autenticação e Sessão

| Recurso Atual | Como Opera Hoje | Como Integrar com o Aurtistic |
| :--- | :--- | :--- |
| **Login do Administrador** | `ADMIN_PASSWORD` no `.env` | Validar via JWT emitido pelo Aurtistic (`Authorization: Bearer <token>`) |
| **Proteção por PIN de Pastas** | `lib/pin-vault.js` (`crypto.scryptSync`) | Manter nativo! O usuário do Aurtistic define um PIN pessoal para pastas ultrassecretas dentro do seu cofre |
| **WebDAV Basic Auth** | `user: admin` / `pass: ADMIN_PASSWORD` | Conectar a validação do `lib/webdav-server.js` com a tabela de usuários e senhas do Aurtistic |
| **Links Compartilhados** | `shares.json` (`/s/:token`) | Pode continuar em JSON ou ser persistido na tabela `ShareLinks` do banco de dados do Aurtistic |

---

## 5. Reconciliação do Catálogo com o Banco de Dados do Aurtistic

O `catalog.json` foi desenvolvido para fornecer leitura $O(1)$ sem banco de dados no Fire Stick. Ao integrar com o Aurtistic, você tem duas opções:

### Opção 1: Catálogo Híbrido (Cache em Disco + Banco)
- Manter o `catalog.json` dentro da pasta de cada usuário no disco rígido.
- O Fire Stick continua lendo e gravando no arquivo JSON local, operando com velocidade máxima mesmo sem conexão à internet.
- Um script de sincronização periódica envia as contagens de fotos e álbuns para o PostgreSQL do Aurtistic.

### Opção 2: Migração para Banco Relacional (Prisma / Supabase / PostgreSQL)
Se desejar centralizar todas as fotos no banco de dados do Aurtistic, utilize o schema de mapeamento:

```prisma
model PortfolioItem {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  filename     String
  relativePath String
  album        String
  subalbum     String?
  mimeType     String
  width        Int
  height       Int
  camera       String?
  favorite     Boolean  @default(false)
  tags         String[]
  createdAt    DateTime @default(now())

  @@index([userId, album])
}

model ShareLink {
  id           String    @id @default(uuid())
  userId       String
  token        String    @unique
  folderPath   String
  label        String
  mode         String    // "view" | "proofing" | "upload_only"
  expiresAt    DateTime?
  watermark    Boolean   @default(false)
  createdAt    DateTime  @default(now())
}
```

---

## 6. Integração com Currículos e Perfis de Artistas

1. **Anexo de Currículo / Portfólio em PDF:**
   - O gerador de currículos do Aurtistic pode salvar os PDFs gerados diretamente na pasta `storage/users/:userId/vault/Curriculos/`.
   - O visualizador nativo (`#modalDocViewer`) pode ser reutilizado para exibir o currículo diretamente na plataforma.
2. **Exibição do Portfólio na Página Pública do Artista:**
   - A página de perfil do artista no Aurtistic (`aurtistic.com/@stangorlini`) pode carregar o componente de galeria do portfólio deste repositório consumindo a API `/api/portfolio/catalog`.
3. **Músicas e Mídia no Perfil:**
   - O player de áudio flutuante (`#audioPlayerFloatingDock`) pode ser acoplado à página de perfil do artista no Aurtistic para tocar as faixas e composições hospedadas no Fire Stick.

---

## 7. Checklist para o Novo Agente / Desenvolvedor no Aurtistic

Quando iniciar os trabalhos no workspace do Aurtistic:
- [ ] Verifique se o módulo `lib/` está presente e íntegro.
- [ ] Mapeie a variável `STORAGE_DIR` no `.env` do Aurtistic para apontar para o local onde os arquivos físicos estão armazenados.
- [ ] Conecte a autenticação do Aurtistic nas rotas `/api/vault/*` substituindo a verificação de `x-admin-key`.
- [ ] Certifique-se de que o middleware do WebDAV (`lib/webdav-server.js`) seja registrado **antes** de qualquer parser de body que consuma streams (como `express.json()` ou `bodyParser`), pois o upload WebDAV (`PUT`) depende de streaming puro.
- [ ] Consulte `docs/ARCHITECTURE.md` para entender como funcionam os escopos canônicos de pastas (`normalizeFolderScopeKey`).
- [ ] Consulte `docs/API.md` para visualizar todos os contratos de requisição e resposta.

