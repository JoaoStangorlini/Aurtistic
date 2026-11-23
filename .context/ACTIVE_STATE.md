# Active State — Aurtistic
Atualizado em: 2026-11-23T03:29Z

## Ciclo Módulos 1 a 4 + Botão Adaptativo Concluído e Verde
- **Deploy Edge:** `scripts/servidor/deploy-firestick.sh` agora empacota `servidor/lib/` (incl. `chunked-upload.js`) e `servidor/scripts/encrypt-vault-migration.js`. `bash -n` OK.
- **Botão Adaptativo & PWA (`AurtisticNavbar.tsx`, `DesktopAppDownloadModal.tsx`, `native-bridge.ts`, `layout.tsx`):** `detectClientPlatform()` (`ios`/iPadOS, `android`, `windows`, `linux`, `macos`, `unknown`) e `shouldShowNavbarDownloadButton()` (oculta em Electron, Capacitor e PWA `standalone`; exibe em Web PC e Mobile sem *hydration mismatch*). Modal com guia iOS 3 passos (+ `appleWebApp`), Play Store + `beforeinstallprompt` no Android, SmartScreen Windows, `.deb`/`.AppImage`/APT plano Linux, Gatekeeper macOS e "Outras plataformas".
- **Módulo 4 & Repo:** `desktop/build/icon.png` `512x512`, `desktop/release/` & `desktop/dist/` no `.gitignore`, nota sobre `GITHUB_RELEASE_TOKEN` vs. downloads públicos em `desktop-release/route.ts`.
- **Validação Final (`task-1299`, exit 0):** `bash -n deploy-firestick.sh`, `server:check`, `transfer-client.test.mjs` (`ALL_TRANSFER_CLIENT_TESTS_PASSED`), `npm run map` (305 arquivos), `npm run verify:full` (`0 erros`), `cap sync android` + `gradlew :app:compileDebugKotlin :app:assembleDebug` (`BUILD SUCCESSFUL in 2s`).
- **Backlog Android (opcional):** fallback `423 PIN_LOCKED` em `content://` URI, `releasePersistableUriPermission`, loop `InputStream.skip()`.
