# Suíte de Testes Automatizados (`tests/`)

Esta pasta reúne todos os testes unitários e de integração arquitetural que garantem o funcionamento livre de regressões no ecossistema Aurtistic.

## Scripts Disponíveis

| Script | Escopo do Teste | Como Executar |
| :--- | :--- | :--- |
| `verify_theme_and_tour.mjs` | Valida contraste WCAG AA nas 10 combinações de tema (2 modos × 5 paletas), existência dos seletores `data-tour`, presença de todos os `README.md` e cabeçalhos de licença AGPLv3. | `node tests/verify_theme_and_tour.mjs` |
| `test_sprint6_proofing.mjs` | Simula o fluxo completo de aprovação do cliente em `/s/[token]`, validação de limites de seleção e rate-limit de PIN. | `node tests/test_sprint6_proofing.mjs` |
| `verify_v4_architecture.mjs` | Valida a integridade da arquitetura v4.1, triggers do SQL, blindagem de tickets HMAC e rotas do App Router. | `node tests/verify_v4_architecture.mjs` |

## Execução Global de Testes

```bash
# Rodar todos os testes em sequência
node tests/verify_theme_and_tour.mjs
node tests/test_sprint6_proofing.mjs
node tests/verify_v4_architecture.mjs
```

