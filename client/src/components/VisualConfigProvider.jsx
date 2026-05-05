import { useEffect } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

/**
 * Listens for the admin's visual config and applies it as CSS custom
 * properties on :root so flash.css picks up the values immediately.
 *
 * Subscribes to the `visualConfigChanged` socket event so changes admins
 * make in the dashboard propagate to every connected client live (no reload).
 */
export default function VisualConfigProvider() {
  useEffect(() => {
    function apply(cfg) {
      if (!cfg) return;
      const root = document.documentElement.style;
      if (cfg.brightness     !== undefined) root.setProperty('--flash-brightness',    String(cfg.brightness));
      if (cfg.saturation     !== undefined) root.setProperty('--flash-saturation',    String(cfg.saturation));
      if (cfg.flashIntensity !== undefined) root.setProperty('--flash-intensity',     String(cfg.flashIntensity));
      if (cfg.animationSpeed !== undefined) root.setProperty('--flash-anim-speed',    String(cfg.animationSpeed));
      if (cfg.discoEnabled   !== undefined) root.setProperty('--flash-disco',         cfg.discoEnabled  ? '1' : '0');
      if (cfg.starsEnabled   !== undefined) root.setProperty('--flash-stars',         cfg.starsEnabled  ? '1' : '0');
      if (cfg.strobeEnabled  !== undefined) {
        root.setProperty('--flash-strobe',         cfg.strobeEnabled ? '1' : '0');
        root.setProperty('--flash-strobe-display', cfg.strobeEnabled ? 'block' : 'none');
      }
      if (cfg.pulseEnabled   !== undefined) root.setProperty('--flash-pulse-state',   cfg.pulseEnabled  ? 'running' : 'paused');
    }

    fetch(`${SERVER_URL}/api/visual-config`).then(r => r.json()).then(apply).catch(() => {});

    const sock = io(SERVER_URL, { autoConnect: true, transports: ['websocket', 'polling'] });
    sock.on('visualConfigChanged', apply);
    return () => sock.disconnect();
  }, []);
  return null;
}
