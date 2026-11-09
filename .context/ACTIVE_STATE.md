# 📌 Estado Atual do Projeto (Memória Curta)
- **Última Entrega Concluída:** Correção do modal de onboarding + bump de versão para Play Console
  - **Onboarding Modal:** Refatorado `evaluateOnboardingTrigger` para exigir `userId` (não abre sem login) e `hasConfiguredModules=false` (não reabre se módulos já configurados).
  - **layout.tsx:** Passa `userId={onboardingUserId}` e `hasConfiguredModules={hasConfiguredModules}` ao `<FirstTimeOnboardingModal />`. Variáveis declaradas no escopo da função, lidas do perfil Supabase.
  - **Versão:** `package.json` → `13.0.7`; `android/app/build.gradle` → `versionCode 20` / `versionName "13.0.7"`.
  - **verify:silent:** ✅ 0 erros após todas as mudanças.
- **Próximos Passos:**
  - Gerar novo AAB (`./gradlew bundleRelease`) e fazer upload no Play Console com versionCode 20.
