import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { initCapacitor } from './lib/capacitor';
import { setupAutoDismiss } from './lib/splash';

// Initialize Capacitor bridge (no-op on web, real on device).
initCapacitor();

// R166 — wire up the web splash auto-dismiss. Native Android
// shows the Capacitor splash.png (or M3 SplashScreen
// windowSplashScreenAnimatedIcon on API 31+); on a browser preview
// or before the native plugin hides, the in-bundle overlay above
// #app prevents a white flash. 1500ms matches the Capacitor
// launchShowDuration in capacitor.config.json.
setupAutoDismiss();

const target = document.getElementById('app');
if (!target) {
  throw new Error('Mount target #app not found');
}

const app = mount(App, { target });

export default app;
