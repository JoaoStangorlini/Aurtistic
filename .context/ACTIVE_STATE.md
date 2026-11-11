# ACTIVE STATE — Aurtistic
Atualizado: 2026-11-10T20:24 UTC

## Último entregue
- **Fix Gestão landing**: `orgsHref` em `AurtisticNavbar.tsx` L172 mudado para usar `hasOrgsOrServer` (sempre aponta para `/servidor`)
- **Fix Opera beforeunload**: `verify:full` rodado → novo bundle gerado sem listener `beforeunload`
- **Fix clearFinished**: pode limpar itens `success` mesmo com upload ativo
- verify:full ✅ 0 erros | servidor reiniciado localhost:3000 (bundle novo)

## Status
- Nenhum item pendente confirmado
- Testar: clicar "Gestão" no menu deve ir para /servidor (Cofre)
- Testar: upload sem diálogo Opera
