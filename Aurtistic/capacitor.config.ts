import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stangorlini.aurtistic',
  appName: 'Aurtistic Planner',
  webDir: 'public',
  server: {
    url: 'https://stangorliniweb.vercel.app/aurtistic',
    cleartext: true
  }
};

export default config;
