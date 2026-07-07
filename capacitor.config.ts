import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.adhaiyur.ride',
  appName: 'Adhaiyur Ride',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
