import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { initCapacitor } from './lib/capacitor';

// Initialize Capacitor bridge (no-op on web, real on device).
initCapacitor();

const target = document.getElementById('app');
if (!target) {
  throw new Error('Mount target #app not found');
}

const app = mount(App, { target });

export default app;
