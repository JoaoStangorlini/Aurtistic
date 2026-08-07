import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stangorlini.aurtistic',
  appName: 'Aurtistic',
  webDir: 'public',
  server: {
    url: 'https://aurtistic.vercel.app/',
    androidScheme: 'https',
    cleartext: true
  }
};

export default config;
