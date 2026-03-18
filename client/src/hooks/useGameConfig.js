import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
let cachedConfig = null;
let cacheExpiry = 0;

export function useGameConfig() {
  const { token, isLoggedIn } = useAuth();
  const [config, setConfig] = useState(cachedConfig || { luckyMode: true, isRigged: false });

  useEffect(() => {
    if (!isLoggedIn || !token) return;
    if (cachedConfig && Date.now() < cacheExpiry) {
      setConfig(cachedConfig);
      return;
    }
    fetch(`${SERVER_URL}/api/user/game-config`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          const cfg = { luckyMode: d.luckyMode, isRigged: !d.luckyMode };
          cachedConfig = cfg;
          cacheExpiry = Date.now() + 5 * 60 * 1000; // cache 5 min
          setConfig(cfg);
        }
      })
      .catch(() => {});
  }, [token, isLoggedIn]);

  return config;
}
