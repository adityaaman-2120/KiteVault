/* eslint-disable @typescript-eslint/no-require-imports */
import { BackupError } from './errors';
import { cloudBackupConfig } from './config';

// The ONLY permission asked for, apart from the basic sign-in identity (name, email, picture)
// that Google Sign-In always includes: a hidden folder that only KiteVault can see.
export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

// What the rest of the backup code needs from Google sign-in. Tokens are handed out one at a time
// and are never stored or logged by KiteVault.
export type GoogleAuth = {
  signIn(): Promise<{ email: string }>;
  // Restores an earlier sign-in without showing anything. Null when there is none.
  signInSilently(): Promise<{ email: string } | null>;
  currentEmail(): string | null;
  getAccessToken(): Promise<string>;
  // Called after Drive answered 401 for `staleToken`: forget it and get a fresh one.
  refreshAccessToken(staleToken: string): Promise<string>;
  signOut(): Promise<void>;
  revokeAccess(): Promise<void>;
};

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

// Loaded only when needed, so a build or test without the native module still starts.
function google(): GoogleModule {
  try {
    return require('@react-native-google-signin/google-signin') as GoogleModule;
  } catch {
    throw new BackupError('unavailable');
  }
}

let configured = false;
function configure(lib: GoogleModule): void {
  if (configured) return;
  const { webClientId } = cloudBackupConfig();
  lib.GoogleSignin.configure({
    scopes: [DRIVE_APPDATA_SCOPE],
    ...(webClientId ? { webClientId } : {}),
  });
  configured = true;
}

const NETWORK_HINT = /network|timeout|timed out|unreachable|unable to resolve|ioexception|connect/i;

// Turns whatever the library throws into a BackupError. Only the code and a short message are
// inspected; nothing is copied into the result.
export function translateGoogleError(error: unknown): BackupError {
  if (error instanceof BackupError) return error;
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  const text = typeof message === 'string' ? message : '';
  const codeText = typeof code === 'string' || typeof code === 'number' ? String(code) : '';
  let statusCodes: Record<string, string> | undefined;
  try {
    statusCodes = google().statusCodes as unknown as Record<string, string>;
  } catch {
    statusCodes = undefined;
  }

  if (statusCodes) {
    if (codeText === statusCodes.SIGN_IN_CANCELLED) return new BackupError('cancelled');
    if (codeText === statusCodes.IN_PROGRESS) return new BackupError('busy');
    if (codeText === statusCodes.PLAY_SERVICES_NOT_AVAILABLE)
      return new BackupError('play-services');
    if (codeText === statusCodes.SIGN_IN_REQUIRED) return new BackupError('not-signed-in');
  }
  // 10 is Google's DEVELOPER_ERROR: the app's package name and signing key are not registered.
  if (codeText === '10' || /DEVELOPER_ERROR/i.test(text)) return new BackupError('setup-error');
  if (codeText === '7' || NETWORK_HINT.test(text)) return new BackupError('offline');
  if (/requires a user to be signed in/i.test(text)) return new BackupError('not-signed-in');
  return new BackupError('unknown');
}

export const googleAuth: GoogleAuth = {
  async signIn() {
    const lib = google();
    configure(lib);
    try {
      await lib.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await lib.GoogleSignin.signIn();
      if (result.type !== 'success') throw new BackupError('cancelled');
      let user = result.data;
      // Google lets people untick individual permissions on the consent screen.
      if (!user.scopes.includes(DRIVE_APPDATA_SCOPE)) {
        const added = await lib.GoogleSignin.addScopes({ scopes: [DRIVE_APPDATA_SCOPE] });
        if (
          !added ||
          added.type !== 'success' ||
          !added.data.scopes.includes(DRIVE_APPDATA_SCOPE)
        ) {
          throw new BackupError('scope-denied');
        }
        user = added.data;
      }
      return { email: user.user.email };
    } catch (error) {
      throw translateGoogleError(error);
    }
  },

  async signInSilently() {
    const lib = google();
    configure(lib);
    try {
      const result = await lib.GoogleSignin.signInSilently();
      return result.type === 'success' ? { email: result.data.user.email } : null;
    } catch (error) {
      const translated = translateGoogleError(error);
      if (translated.kind === 'not-signed-in') return null;
      throw translated;
    }
  },

  currentEmail() {
    try {
      const lib = google();
      configure(lib);
      return lib.GoogleSignin.getCurrentUser()?.user.email ?? null;
    } catch {
      return null;
    }
  },

  async getAccessToken() {
    const lib = google();
    configure(lib);
    try {
      return (await lib.GoogleSignin.getTokens()).accessToken;
    } catch (error) {
      const translated = translateGoogleError(error);
      // A token that cannot be had for any reason other than the network means the sign-in
      // (or the Drive permission) is gone.
      throw translated.kind === 'unknown' ? new BackupError('auth-expired') : translated;
    }
  },

  async refreshAccessToken(staleToken) {
    const lib = google();
    configure(lib);
    try {
      await lib.GoogleSignin.clearCachedAccessToken(staleToken);
      return (await lib.GoogleSignin.getTokens()).accessToken;
    } catch (error) {
      const translated = translateGoogleError(error);
      throw translated.kind === 'unknown' ? new BackupError('auth-expired') : translated;
    }
  },

  async signOut() {
    const lib = google();
    configure(lib);
    try {
      await lib.GoogleSignin.signOut();
    } catch (error) {
      throw translateGoogleError(error);
    }
  },

  async revokeAccess() {
    const lib = google();
    configure(lib);
    try {
      await lib.GoogleSignin.revokeAccess();
    } catch (error) {
      throw translateGoogleError(error);
    }
  },
};
