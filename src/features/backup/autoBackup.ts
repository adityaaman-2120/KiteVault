import { AppState } from 'react-native';

import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { onVaultFileSaved } from '@/storage';

import { backupNow } from './backupService';
import { useBackupState } from './backupState';
import { isCloudBackupAvailable } from './config';

type Timer = unknown;

export type AutoBackupDeps = {
  debounceMs: number;
  // Backup is on, signed in, automatic mode switched on, and nothing blocks it (a conflict).
  isActive: () => boolean;
  isPending: () => boolean;
  markPending: () => void;
  run: () => Promise<unknown>;
  setTimer?: (callback: () => void, ms: number) => Timer;
  clearTimer?: (timer: Timer) => void;
};

export type AutoBackup = {
  fileSaved: () => void; // the vault file was just written
  flush: () => void; // upload now if anything is waiting (app going to the background)
  appForegrounded: () => void;
  dispose: () => void;
};

// Decides WHEN to upload; the upload itself is backupNow(). A burst of saves becomes one upload a
// little after the last of them. A change that could not be uploaded (offline, signed out...)
// stays marked as pending and is tried again on the next save, when the app comes back to the
// foreground, or by hand; it is never retried in a loop.
export function createAutoBackup(deps: AutoBackupDeps): AutoBackup {
  const setTimer = deps.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer = deps.clearTimer ?? ((timer) => clearTimeout(timer as number));
  let timer: Timer | null = null;

  const cancel = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  function runIfDue() {
    cancel();
    if (!deps.isActive() || !deps.isPending()) return;
    deps.run().catch(() => {
      // The reason is already recorded for the Settings card; the change stays pending.
    });
  }

  function schedule(ms: number) {
    cancel();
    timer = setTimer(runIfDue, ms);
  }

  return {
    fileSaved() {
      deps.markPending();
      if (deps.isActive()) schedule(deps.debounceMs);
    },
    flush() {
      runIfDue();
    },
    appForegrounded() {
      if (deps.isActive() && deps.isPending()) schedule(3000);
    },
    dispose: cancel,
  };
}

export const AUTO_BACKUP_DEBOUNCE_MS = 20_000;

// Connects the scheduler to the app. Called once at startup; returns a function that undoes it.
export function startAutoBackup(): () => void {
  const settings = () => useSettingsStore.getState();
  const auto = createAutoBackup({
    debounceMs: AUTO_BACKUP_DEBOUNCE_MS,
    isActive: () =>
      isCloudBackupAvailable() &&
      settings().backupEnabled &&
      settings().backupAuto &&
      useBackupState.getState().conflict === null &&
      useBackupState.getState().busy !== 'deleting',
    isPending: () => settings().backupPending,
    markPending: () => {
      // Only when backup is on: otherwise nobody needs the flag. Every save is a new revision of
      // the vault; the number only ever goes up and is how a newer cloud version is told apart.
      if (isCloudBackupAvailable() && settings().backupEnabled) {
        void settings().update({
          backupPending: true,
          backupLocalRevision: settings().backupLocalRevision + 1,
        });
      }
    },
    run: () => backupNow(),
  });

  const stopSaves = onVaultFileSaved(auto.fileSaved);
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') auto.appForegrounded();
    else auto.flush();
  });
  // Something may have been left pending when the app was closed.
  auto.appForegrounded();

  return () => {
    stopSaves();
    appState.remove();
    auto.dispose();
  };
}
