// Este programa é um software livre (Licença AGPLv3)
import type { Metadata } from "next";
import { Open_Sans, JetBrains_Mono, Orbitron, Space_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import Navbar from "@/components/Navbar";

import "./globals.css";

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Aurtistic",
  description: "Gerenciador de Tarefas e Projetos",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Aurtistic",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/aurtistic_app_icon_v12.png",
    shortcut: "/aurtistic_app_icon_v12.png",
    apple: "/aurtistic_app_icon_v12.png",
  },
};

import { createClient } from "@/utils/supabase/server";
import GlobalHighlighter from "@/components/GlobalHighlighter";
import { Suspense } from "react";
import { AurtisticMediaProvider } from "@/components/media/AurtisticMediaContext";
import { GlobalAudioDock } from "@/components/media/GlobalAudioDock";
import { issueUserStorageSession } from "@/lib/edge-ticket";
import { buildThemeInitScript, type ThemeMode, type ThemePaletteId, type ThemePreferences } from "@/lib/theme-config";
import { ThemeProvider, ThemedTopLoader } from "@/components/theme/ThemeProvider";
import { AppViewportShell, MainShell } from "@/components/theme/MainShell";
import { GlobalOrgThemeBackdrop } from "@/components/theme/GlobalOrgThemeBackdrop";
import { CoachMarksProvider } from "@/components/onboarding/CoachMarksProvider";
import { FirstTimeOnboardingModal } from "@/components/onboarding/FirstTimeOnboardingModal";
import { SelfCareAlarmProvider } from "@/components/cuidados/SelfCareAlarmProvider";
import { VaultUploadProvider } from "@/contexts/VaultUploadContext";
import { GlobalUploadDock } from "@/components/servidor/GlobalUploadDock";
import { VaultUploadManagerModal } from "@/components/servidor/VaultUploadManagerModal";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let userRole: 'ADM' | 'LabDiv' | 'Convidado' = 'Convidado';
  let targetHref = '/login';
  let initialMediaTicket: string | undefined;
  let initialVaultTicket: string | undefined;
  let serverUrl: string | undefined;
  let initialTheme: Partial<ThemePreferences> | undefined = undefined;
  let onboardingUserId: string | undefined;
  let hasConfiguredModules = false;

  let ssrPalette: ThemePaletteId = 'purple-gold';
  let ssrModeAttr: 'dark' | 'light' | undefined = undefined;

  try {
    const cookieStore = await cookies();
    const ckPal = cookieStore.get('aurtistic_palette')?.value as ThemePaletteId | undefined;
    const ckMode = cookieStore.get('aurtistic_mode')?.value as ThemeMode | undefined;
    const ckOverride = cookieStore.get('aurtistic_override_org')?.value;
    if (ckPal) ssrPalette = ckPal;
    if (ckMode === 'dark' || ckMode === 'light') ssrModeAttr = ckMode;
    if (ckPal || ckMode || ckOverride !== undefined) {
      initialTheme = {
        ...(ckPal ? { palette: ckPal } : {}),
        ...(ckMode ? { mode: ckMode } : {}),
        ...(ckOverride !== undefined ? { overrideOrgTheme: ckOverride === '1' } : {}),
      };
    }
  } catch {}

  if (user) {
    onboardingUserId = user.id;

    try {
      const storageSession = await issueUserStorageSession(supabase, user.id);
      initialMediaTicket = storageSession.mediaReadOnlyTicket.ticket;
      initialVaultTicket = storageSession.vaultTicket.ticket;
      serverUrl = storageSession.serverUrl;
    } catch {}

    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('features_config')
        .eq('id', user.id)
        .single();
      if (profile?.features_config?.theme) {
        const dbTheme = profile.features_config.theme;
        initialTheme = {
          ...initialTheme,
          ...dbTheme,
          updatedAt: dbTheme.updated_at || dbTheme.updatedAt,
        };
        if (dbTheme.palette) ssrPalette = dbTheme.palette;
        if (dbTheme.mode === 'dark' || dbTheme.mode === 'light') ssrModeAttr = dbTheme.mode;
      }
      if (
        profile?.features_config?.modules ||
        profile?.features_config?.active ||
        profile?.features_config?.onboarding_completed
      ) {
        hasConfiguredModules = true;
      }
    } catch {}
  }

  if (user?.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e') {
    userRole = 'ADM';
    targetHref = '/servidor';
  } else if (
    user?.id === '7dcfe172-1cf0-4389-9abd-f340b1408386' ||
    user?.id === 'fb12ee7b-da8f-4b80-ac5c-3b8d478047d2' ||
    user?.email?.includes('hublabdiv') ||
    user?.email?.endsWith('@usp.br') ||
    Boolean(user?.user_metadata?.hub_user_id)
  ) {
    userRole = 'LabDiv';
    targetHref = '/labdiv';
  }

  return (
    <html
      lang="pt-BR"
      data-theme-palette={ssrPalette}
      {...(ssrModeAttr ? { 'data-theme-mode': ssrModeAttr } : {})}
      className={`${openSans.variable} ${jetbrainsMono.variable} ${orbitron.variable} ${spaceGrotesk.variable} antialiased h-full overflow-x-hidden`}
      suppressHydrationWarning
    >
      <head>
        <meta name="color-scheme" content="dark light" />
        <link rel="icon" href="/icons/icon-purple-gold.png" />
        <link rel="apple-touch-icon" href="/icons/icon-purple-gold.png" />
        <link rel="manifest" href="/api/manifest?palette=purple-gold&mode=dark" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
        {/* Script síncrono pré-paint: Previne FOUC de tema e hydration mismatch */}
        <script dangerouslySetInnerHTML={{ __html: buildThemeInitScript() }} />
        {process.env.NODE_ENV === 'development' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    for (let registration of registrations) {
                      registration.unregister();
                    }
                  });
                }
              `,
            }}
          />
        )}
      </head>
      <body className="h-full bg-app flex flex-col overflow-hidden text-fg max-w-[100vw]">
        <ThemeProvider initialTheme={initialTheme}>
          <GlobalOrgThemeBackdrop />
          <CoachMarksProvider>
            <SelfCareAlarmProvider>
              <AurtisticMediaProvider
                initialMediaTicket={initialMediaTicket}
                initialVaultTicket={initialVaultTicket}
                serverUrl={serverUrl}
              >
                <VaultUploadProvider
                  initialVaultTicket={initialVaultTicket}
                  serverUrl={serverUrl}
                >
                  <ThemedTopLoader />
                  <Suspense fallback={null}>
                    <GlobalHighlighter />
                  </Suspense>
                  <AppViewportShell>
                    <Navbar initialRole={userRole} initialTargetHref={targetHref} />
                    <MainShell>
                      {children}
                    </MainShell>
                  </AppViewportShell>
                  {Boolean(onboardingUserId) && (
                    <FirstTimeOnboardingModal userId={onboardingUserId} hasConfiguredModules={hasConfiguredModules} />
                  )}
                  <GlobalAudioDock />
                  <GlobalUploadDock />
                  <VaultUploadManagerModal />
                </VaultUploadProvider>
              </AurtisticMediaProvider>
            </SelfCareAlarmProvider>
          </CoachMarksProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
