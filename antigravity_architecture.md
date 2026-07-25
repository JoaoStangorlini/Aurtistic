# Arquitetura de Sistemas: Projeto Antigravity

Bem-vindo ao plano arquitetural do **Antigravity**. Como Arquiteto de Software Sênior, desenhei esta solução para garantir resiliência máxima, operação fluida offline e proteção total do banco de dados contra picos de requisições, utilizando o ecossistema Next.js, Supabase e TypeScript.

---

## 1. Stack de Ferramentas Recomendada

Para atender rigorosamente aos requisitos de offline-first, resiliência e proteção do servidor, a stack selecionada é:

### Client-Side (Offline & Fila)
*   **Dexie.js:** Um wrapper robusto e minimalista para o IndexedDB. Ao contrário do PouchDB (que exige CouchDB no backend para brilhar) ou WatermelonDB (que possui uma curva de setup mais complexa para web pura), o Dexie é extremamente rápido, trabalha muito bem com React/Next.js e lida nativamente com grandes volumes de dados.
*   **TanStack Query v5 (React Query):** Gerenciador do estado assíncrono. Utilizaremos os plugins experimentais de persistência e fila offline (`@tanstack/react-query-persist-client`) para interceptar *mutations* e colocá-las em fila.
*   **Workbox (Google):** Padrão da indústria para Service Workers. O módulo `workbox-background-sync` será o motor responsável por drenar a fila de requisições falhas de rede assim que a conexão for reestabelecida, operando de forma agnóstica à aba estar aberta.

### Server-Side (Gargalo & DB)
*   **Drizzle ORM:** Diferente do Prisma (que utiliza uma Rust engine pesada), o Drizzle é *Edge-ready*, type-safe e performático. Ele cria consultas SQL otimizadas com baixíssimo overhead de conexão.
*   **Supavisor (Pooler do Supabase):** O connection pooler nativo do Supabase. Utilizaremos o modo de transação (*Transaction Mode*). Para garantir a estabilidade e respeitar o limite máximo de 60 conexões do Supabase, fixaremos nosso gargalo arquitetural em **57 conexões**, criando uma margem de segurança (headroom) de 3 conexões.

### Pipeline de Imagens
*   **browser-image-compression:** Biblioteca excelente que utiliza *Web Workers* para realizar a compressão pesada no navegador sem travar a interface do usuário (main thread) antes de disparar para o Cloudinary.

---

## 2. Topologia de Sincronização (O Fluxo de Dados)

A topologia foi desenhada para o conceito de **"Efeito Manada"**, onde vários clientes podem ficar online ao mesmo tempo, disparando sincronizações simultâneas. 

> [!TIP]
> **Fluxo de Vida de uma Interação:**

1.  **Ação & Cache (Offline):** O usuário preenche um formulário. O TanStack Query intercepta a *mutation*. O dado é salvo instantaneamente no Dexie.js (Cache Local) garantindo o conceito de *Optimistic UI* (o usuário vê a ação concluída).
2.  **Persistência da Fila (Durable Queue):** **Nenhuma** interação é perdida. Antes mesmo de qualquer tentativa de rede, a *mutation* é obrigatoriamente persistida numa tabela de fila no Dexie.js. Se a rede cair no meio da sincronização ou se a fila estiver gigantesca (ex: centenas de ações acumuladas), os dados já estão salvos e seguros no disco do navegador (IndexedDB), garantindo **zero perda de dados**.
3.  **Gatilho de Sincronização e Resumo Seguro:** O Service Worker detecta a reconexão. O processo de drenagem (*Draining*) é iniciado. O sistema fará "checkpointing" (ex: se cair no meio do envio do item 50 de 100, ao voltar a rede, ele retoma exatamente do 50).
4.  **Afunilamento de Conexões (O Gargalo Server-Side):** A API Next.js recebe as requisições. O Drizzle ORM tenta abrir conexões através da porta do Supavisor configurado estritamente com `pool_size=57` (deixando 3 conexões de segurança para manutenções/falhas do limite de 60). 
    *   *Se houver 200 clientes sincronizando:* O Supavisor enfileira as requisições na memória do servidor e libera acesso ao banco apenas para as 57 simultâneas permitidas.
5.  **Confirmação (ACK) e Reflexo na UI:** O Next.js retorna status HTTP 200. O Service Worker consolida os dados e remove o item da fila local. Simultaneamente, o "Gerenciador de Armazenamento" nas Configurações do app é notificado para atualizar o tamanho do cache em tempo real.

---

## 3. Pipeline de Upload de Imagens

Imagens são os maiores ofensores de banda e memória em sistemas offline. O fluxo será:
1.  Usuário seleciona imagem (Input de arquivo).
2.  A biblioteca `browser-image-compression` entra em ação, redimensionando a imagem (ex: max 1920x1080) e aplicando compressão web (WebP ou JPEG 80%). Tudo via Web Worker.
3.  Um _presigned URL_ (ou signature) é gerado no backend Next.js de forma rápida.
4.  O arquivo *comprimido* faz upload direto do cliente para o **Cloudinary** (não passa pelo Supabase para poupar conexões/bandwidth).
5.  A URL gerada pelo Cloudinary entra no fluxo de *mutation* descrito na topologia de sincronização, sendo salva no banco local e posta na fila.

---

## 4. Plano de Implementação (Roteiro Passo a Passo)

A execução deve seguir uma ordem estrita de camadas, de dentro (infra) para fora (UI).

### Passo 1: Infraestrutura e Setup de Gargalo
*   Configurar o pooler do Supabase (Supavisor) na Dashboard, limitando o Pool Size global para **57**.
*   Garantir a *Connection String* no formato de Transação (Transaction Mode, porta 6543).
*   Instalar e configurar Drizzle ORM no Next.js conectando com essa string.

### Passo 2: PWA e Manifest
*   Adicionar `next-pwa` ou Serwist (sucessor moderno) para gerar Service Workers robustos.
*   Configurar o Web App Manifest e as estratégias básicas de caching (Stale-While-Revalidate para assets estáticos).

### Passo 3: Banco de Dados Local (Dexie.js)
*   Mapear o Schema do Supabase para o Dexie.js. 
*   Criar funções CRUD encapsuladas no cliente para leitura e escrita exclusivas no Dexie (O front-end **nunca** fará fetch direto no Supabase; sempre lê do Dexie).

### Passo 4: Pipeline de Imagens Local
*   Implementar e testar componentes de input de imagem acoplados ao `browser-image-compression`.
*   Integrar com API do Cloudinary para uploads autenticados client-side via assinaturas (*signatures*).

### Passo 5: Motor de Sincronização (Fila)
*   Integrar TanStack Query com Dexie.js.
*   Configurar as *mutations* para disparar o Workbox Background Sync em caso de falha de rede.
*   Criar o endpoint no Next.js (`/api/sync` ou Server Actions) responsável por receber os payloads da fila, processar no Drizzle e devolver *ACKs*.

### Passo 6: Tratamento de Conflitos e Feedback de UI
*   Implementar Toasts e Skeletons avisando o usuário sobre a fila offline.
*   Desenvolver lógica de resolução de conflitos no servidor (ex: "Última escrita vence" baseado no carimbo de tempo `updated_at`).
*   Garantir checkpoints da fila para lidar com quedas de conexão durante sincronizações de longa duração.

### Passo 7: Painel de Gerenciamento de Armazenamento (Configurações)
*   Criar uma tela nas Configurações lendo a API `navigator.storage.estimate()` e a contagem de registros no Dexie.js.
*   Exibir de forma visual (gráficos/barras) a quantidade de dados baixados, peso das imagens no cache e o status da fila atual, permitindo transparência e controle (ex: limpar cache) para o usuário.
