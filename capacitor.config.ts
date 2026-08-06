import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stangorlini.aurtistic',
  appName: 'Aurtistic',
  webDir: 'public',
  // Ao remover a server.url remota da Vercel, o WebView do Android abre 
  // diretamente os arquivos locais da aplicação com esquema nativo HTTPS (offline-first).
  server: {
    androidScheme: 'https',
    cleartext: true
  }
};

export default config;
