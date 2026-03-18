import { useState, useEffect } from 'react';
import {
  getBalance,
  addBalance,
  subtractBalance,
  setRiggedMode,
  isRiggedMode,
} from '../utils/casinoBalance';
import { useGameConfig } from './useGameConfig';

/**
 * useBalance — thin wrapper around casinoBalance that also enforces the
 * server-side rigged-user flag.
 *
 * Returns:
 *   balance      — current local balance (number)
 *   syncBalance  — call after any game round to refresh the displayed value
 *   addBalance   — re-exported (no-ops silently for rigged users)
 *   subtractBalance — re-exported
 *   isRigged     — true when the server has flagged this user to always lose
 */
export function useBalance() {
  const { isRigged } = useGameConfig();
  const [balance, setBalanceState] = useState(getBalance);

  // Keep the module-level rigged flag in sync with what the server said.
  useEffect(() => {
    setRiggedMode(isRigged);
  }, [isRigged]);

  function syncBalance() {
    setBalanceState(getBalance());
  }

  return {
    balance,
    syncBalance,
    addBalance,
    subtractBalance,
    isRigged,
  };
}
