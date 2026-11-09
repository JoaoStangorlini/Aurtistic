# Scripts Utilitários e de Automação (`scripts/`)

Este diretório reúne scripts de build, geradores de assets, parsers de dados e rotinas de manutenção automatizada do ecossistema **Aurtistic**.

Licenciado sob **GNU Affero General Public License v3.0 (AGPLv3)**.

---

## Estrutura do Diretório

```
scripts/
├── build-agent-index.mjs     # Gerador cirúrgico de símbolos e mapa de linhas (.context/CODE_MAP.md)
├── silent-verify.sh          # Pipeline de verificação rápida/completa (TSC + Lint + Server.js + Testes)
├── servidor/                 # Automação do daemon de borda (deploy-firestick, watchdog, telemetria, AVIF)
├── assets/                   # Scripts de processamento gráfico e geração de ícones (Python/PIL)
├── data/                     # Scripts de geração, parsing e conversão de dados (CSV/Excel/SQL)
├── patches/                  # Scripts históricos de migração e hotfixes pontuais
└── scratch/                  # Scripts de teste rápido e consultas manuais ao banco
```

---

## Principais Comandos

| Comando | Descrição |
| :--- | :--- |
| `npm run verify:silent` | Executa o verificador rápido (`silent-verify.sh`): build do `CODE_MAP.md`, TSC, ESLint e sintaxe do storage node. |
| `npm run verify:full` | Executa o pipeline completo incluindo testes de tema/tour e `next build`. |
| `npm run map` | Atualiza o mapa cirúrgico de símbolos em `.context/CODE_MAP.md`. |
| `python3 scripts/assets/generate_themed_assets.py` | Regenera a suíte completa de logotipos e favicons temáticos em `public/`. |
