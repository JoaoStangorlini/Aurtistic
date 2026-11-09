# Módulo `src/hooks/` — React Hooks Customizados

Esta pasta contém hooks React reutilizáveis para gerenciamento de ciclos de vida, sincronização em tempo real, uploads atômicos para o Edge Node e renovação de tokens criptográficos de segurança.

## Estrutura de Arquivos

| Hook | Arquivo | Responsabilidade |
| :--- | :--- | :--- |
| `useTenantTicketRefresh` | [`useTenantTicketRefresh.ts`](file:///home/stangorlini/Aurtistic/src/hooks/useTenantTicketRefresh.ts) | Gerencia a renovação silenciosa em segundo plano do ticket do Edge Node antes da expiração do TTL, mantendo referências estáveis sem interromper reprodução de mídia ou navegação. |
| `useEdgeUpload` | [`useEdgeUpload.ts`](file:///home/stangorlini/Aurtistic/src/hooks/useEdgeUpload.ts) | Hook para submissão direta de arquivos brutos para o Edge Node com streaming, progresso individual de arquivos, auto-indexação atômica em `user_files_index` e vínculo dos 4 Pilares. |

## Como Utilizar

### 1. `useTenantTicketRefresh`
```tsx
import { useTenantTicketRefresh } from '@/hooks/useTenantTicketRefresh';

function MeuComponente({ initialTicket }: { initialTicket: string }) {
  const { ticket, refreshTicket } = useTenantTicketRefresh(initialTicket, 'vault', {
    readOnly: false,
    unlockedPins: ['pasta_privada'],
  });

  // 'ticket' é atualizado silenciosamente a cada 10 minutos
  return <div>Ticket ativo: {ticket}</div>;
}
```

### 2. `useEdgeUpload`
```tsx
import { useEdgeUpload } from '@/hooks/useEdgeUpload';

function UploadSection({ ticket, serverUrl }: { ticket: string; serverUrl: string }) {
  const { uploading, progressStatus, uploadFiles } = useEdgeUpload({
    ticket,
    serverUrl,
    onSuccess: () => alert('Arquivos enviados e indexados com sucesso!'),
  });

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    void uploadFiles(e.target.files, 'Portfolio/STREET-TRILHAS', {
      showInPortfolio: true,
      visibility: 'public',
    });
  };

  return (
    <div>
      <input type="file" multiple onChange={handleFiles} disabled={uploading} />
      {uploading && <span>{progressStatus}</span>}
    </div>
  );
}
```
