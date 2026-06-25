import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kallai.rapido',
  appName: 'Kallai Rapido',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
