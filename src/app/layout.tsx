// Este programa é um software livre (Licença AGPLv3)
import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import Navbar from "@/components/Navbar";

import "./globals.css";

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aurtistic",
  description: "Gerenciador de Tarefas e Projetos",
  manifest: "/manifest.json",
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
import { buildThemeInitScript } from "@/lib/theme-config";
import { ThemeProvider, ThemedTopLoader } from "@/components/theme/ThemeProvider";
import { CoachMarksProvider } from "@/components/onboarding/CoachMarksProvider";
import { FirstTimeOnboardingModal } from "@/components/onboarding/FirstTimeOnboardingModal";
import { SelfCareAlarmProvider } from "@/components/cuidados/SelfCareAlarmProvider";

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
  let initialTheme = undefined;
  let onboardingUserId: string | undefined;
  let hasConfiguredModules = false;

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
        initialTheme = profile.features_config.theme;
      }
      if (profile?.features_config?.modules) {
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
      className={`${openSans.variable} antialiased h-full overflow-x-hidden`}
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
          <CoachMarksProvider>
            <SelfCareAlarmProvider>
              <AurtisticMediaProvider
                initialMediaTicket={initialMediaTicket}
                initialVaultTicket={initialVaultTicket}
                serverUrl={serverUrl}
              >
                <ThemedTopLoader />
                <Suspense fallback={null}>
                  <GlobalHighlighter />
                </Suspense>
                <Navbar initialRole={userRole} initialTargetHref={targetHref} />
                <main className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden">
                  {children}
                </main>
                <FirstTimeOnboardingModal userId={onboardingUserId} hasConfiguredModules={hasConfiguredModules} />
                <GlobalAudioDock />
              </AurtisticMediaProvider>
            </SelfCareAlarmProvider>
          </CoachMarksProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
