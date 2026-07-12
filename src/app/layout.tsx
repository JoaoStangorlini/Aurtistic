import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import Navbar from "@/components/Navbar";

import "./globals.css";

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stangorlini.web",
  description: "Gerenciador de Tarefas e Projetos",
};

import { createClient } from "@/utils/supabase/server";
import GlobalHighlighter from "@/components/GlobalHighlighter";
import { Suspense } from "react";
import NextTopLoader from 'nextjs-toploader';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let userRole: 'ADM' | 'LabDiv' | 'Convidado' = 'Convidado';
  let targetHref = '/login';

  if (user?.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e') {
    userRole = 'ADM';
    targetHref = '/servidor';
  } else if (user?.id === '7dcfe172-1cf0-4389-9abd-f340b1408386') {
    userRole = 'LabDiv';
    targetHref = '/labdiv';
  }

  return (
    <html lang="pt-BR" className={`${openSans.variable} antialiased h-full overflow-x-hidden`}>
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
      </head>
      <body className="h-full bg-[#121212] flex flex-col overflow-hidden text-[#e5e2e1] max-w-[100vw]">
        <NextTopLoader color="#FFCC00" height={3} showSpinner={false} shadow="0 0 10px #FFCC00,0 0 5px #FFCC00" />
        <Suspense fallback={null}>
          <GlobalHighlighter />
        </Suspense>
        <Navbar initialRole={userRole} initialTargetHref={targetHref} />
        <main className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </body>
    </html>
  );
}
