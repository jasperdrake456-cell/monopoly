import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const DEFAULT = {
  closedGames:     [],
  testingGames:    [],
  approvedTesters: [],
};

const SiteConfigContext = createContext({ ...DEFAULT, refreshConfig: () => {} });

export function SiteConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULT);

  const refreshConfig = useCallback(() => {
    fetch(SERVER_URL + '/api/site/config')
      .then(r => r.json())
      .then(data => setConfig({ ...DEFAULT, ...data }))
      .catch(() => { /* use cached */ });
  }, []);

  // Fetch on mount and every 20 seconds
  useEffect(() => {
    refreshConfig();
    const id = setInterval(refreshConfig, 20_000);
    return () => clearInterval(id);
  }, [refreshConfig]);

  return (
    <SiteConfigContext.Provider value={{ ...config, refreshConfig }}>
      {children}
    </SiteConfigContext.Provider>
  );
}

export function useSiteConfig() {
  return useContext(SiteConfigContext);
}
