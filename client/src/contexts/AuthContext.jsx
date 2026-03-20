import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { setAuthToken, getBalance, setBalance, setBalanceFromServer, setRiggedMode } from '../utils/casinoBalance';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
const TOKEN_KEY  = 'gv_auth_token';
const USER_KEY   = 'gv_auth_user';

async function apiFetch(path, options = {}) {
  // Destructure headers out of options so ...rest doesn't accidentally
  // overwrite the merged headers object below.
  const { headers: optHeaders, ...rest } = options;
  const res = await fetch(SERVER_URL + path, {
    headers: { 'Content-Type': 'application/json', ...optHeaders },
    ...rest,
  });
  if (!res.ok && res.status !== 200) {
    // Try to parse JSON error body, fall back to status text
    try {
      const errBody = await res.json();
      return { ok: false, error: errBody.error || `Server error ${res.status}`, ...errBody };
    } catch {
      return { ok: false, error: `Server error ${res.status}` };
    }
  }
  return res.json();
}

function authFetch(path, token, options = {}) {
  return apiFetch(path, {
    ...options,
    headers: { ...(options.headers || {}), 'Authorization': `Bearer ${token}` },
  });
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);   // { username, displayName }
  const [token, setToken]     = useState(null);
  const [balance, setBalanceState] = useState(0);
  const [loading, setLoading] = useState(true);
  const forceLogoutSocketRef  = useRef(null);
  const userRef               = useRef(null);
  const [moneyAlert, setMoneyAlert] = useState(null); // { from, amount }

  // Keep userRef in sync so socket handlers can read current user
  useEffect(() => { userRef.current = user; }, [user]);

  // ── Push local balance to server ─────────────────────────────────────────
  const pushBalance = useCallback(async (tk, bal) => {
    if (!tk) return;
    try {
      await authFetch('/api/accounts/balance/sync', tk, {
        method: 'POST',
        body: JSON.stringify({ balance: bal ?? getBalance() }),
      });
    } catch { /* silent */ }
  }, []);

  // ── Pull balance from server → update local ──────────────────────────────
  const pullBalance = useCallback(async (tk) => {
    if (!tk) return;
    try {
      const data = await authFetch('/api/accounts/me', tk);
      if (data.ok) {
        setBalanceFromServer(data.balance);
        setBalanceState(getBalance()); // read back what was actually stored
        return data.balance;
      }
    } catch { /* silent */ }
    return null;
  }, []);

  // ── Claim daily (server-side for logged-in users) ────────────────────────
  const claimDailyServer = useCallback(async (tk) => {
    if (!tk) return null;
    try {
      const data = await authFetch('/api/accounts/daily', tk, { method: 'POST' });
      if (data.ok && data.claimed) {
        setBalanceFromServer(data.balance);
        setBalanceState(getBalance());
        return data.amount;
      }
    } catch { /* silent */ }
    return null;
  }, []);

  // ── On mount: restore session ─────────────────────────────────────────────
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedUser  = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    if (!savedToken || !savedUser) { setLoading(false); return; }

    authFetch('/api/accounts/me', savedToken).then(data => {
      if (data.ok) {
        setToken(savedToken);
        setUser({ username: data.username, displayName: data.displayName });
        setAuthToken(savedToken);
        // Server balance is always authoritative — overwrites local cache
        setBalanceFromServer(data.balance);
        setBalanceState(getBalance());
      } else {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }).catch(() => {
      // Network error — keep local state, try again later
      setToken(savedToken);
      setUser(savedUser);
      setAuthToken(savedToken);
      setBalanceState(getBalance());
    }).finally(() => setLoading(false));
  }, []);

  // ── Fetch rigged-mode flag whenever token changes ─────────────────────────
  useEffect(() => {
    if (!token) { setRiggedMode(false); return; }
    fetch(SERVER_URL + '/api/user/game-config', {
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { if (d.ok) setRiggedMode(!d.luckyMode); })
      .catch(() => {});
  }, [token]);

  // ── Listen for server-forced logout (weekly reset) & money alerts ────────
  useEffect(() => {
    const sock = io(SERVER_URL, { autoConnect: true });
    forceLogoutSocketRef.current = sock;

    sock.on('forceLogout', () => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setToken(null);
      setUser(null);
      setAuthToken(null);
      window.location.href = '/auth';
    });

    sock.on('moneyReceived', ({ to, from, amount }) => {
      if (userRef.current?.username === to) {
        setMoneyAlert({ from, amount });
        setTimeout(() => setMoneyAlert(null), 5000);
      }
    });

    // Admin reset: immediately overwrite localStorage so the sync timer can't
    // push the stale old balance back to the server
    sock.on('balanceReset', ({ username, balance }) => {
      if (userRef.current?.username === username) {
        setBalanceFromServer(balance);
        setBalanceState(balance);
      }
    });

    // Jackpot won — forward to window so Slots component can show celebration
    sock.on('jackpotWon', (data) => {
      window.dispatchEvent(new CustomEvent('jackpotWon', { detail: data }));
    });

    return () => sock.disconnect();
  }, []);

  // ── Listen for balance changes from casino games ──────────────────────────
  useEffect(() => {
    // Poll localStorage balance every 2s to stay in sync with casino games
    const interval = setInterval(() => {
      const localBal = getBalance();
      setBalanceState(localBal);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // ── Register ──────────────────────────────────────────────────────────────
  const register = useCallback(async (username, password) => {
    const data = await apiFetch('/api/accounts/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (data.ok) {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify({ username: data.username, displayName: data.displayName }));
      setToken(data.token);
      setUser({ username: data.username, displayName: data.displayName });
      setAuthToken(data.token);
      setBalanceFromServer(data.balance);
      setBalanceState(getBalance());
    }
    return data;
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (username, password) => {
    const data = await apiFetch('/api/accounts/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (data.ok) {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify({ username: data.username, displayName: data.displayName }));
      setToken(data.token);
      setUser({ username: data.username, displayName: data.displayName });
      setAuthToken(data.token);
      // Server balance is always authoritative — overwrites local cache
      setBalanceFromServer(data.balance);
      setBalanceState(getBalance());
    }
    return data;
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    if (token) {
      try { await authFetch('/api/accounts/logout', token, { method: 'POST' }); } catch {}
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setAuthToken(null);
  }, [token]);

  // ── Transfer ──────────────────────────────────────────────────────────────
  const transfer = useCallback(async (toUsername, amount) => {
    if (!token) return { ok: false, error: 'Not logged in' };
    try {
      // Sync the latest local balance to the server FIRST so the server
      // knows the sender's real balance before checking affordability.
      await pushBalance(token, getBalance());

      const data = await authFetch('/api/accounts/transfer', token, {
        method: 'POST',
        body: JSON.stringify({ toUsername, amount }),
      });
      if (data.ok) {
        setBalance(data.fromBalance);
        setBalanceState(data.fromBalance);
      }
      return data;
    } catch (err) {
      console.error('[transfer] fetch error:', err);
      return { ok: false, error: 'Network error — check your connection.' };
    }
  }, [token, pushBalance]);

  // ── Sync balance to server (called by casino utils) ───────────────────────
  const syncNow = useCallback(() => {
    if (token) pushBalance(token, getBalance());
  }, [token, pushBalance]);

  const value = {
    user, token, balance, loading,
    isLoggedIn: !!user,
    isAdmin: user?.username === 'jasper',
    register, login, logout, transfer, syncNow, claimDailyServer,
    refreshBalance: () => pullBalance(token),
    moneyAlert, clearMoneyAlert: () => setMoneyAlert(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
