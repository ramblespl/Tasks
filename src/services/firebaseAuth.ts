import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { GoogleUser } from '../types';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              error?: string;
              error_description?: string;
              error_uri?: string;
              expires_in?: number;
              scope?: string;
            }) => void;
            error_callback?: (error: { type: string; message?: string }) => void;
            prompt?: string;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
  'email',
  'profile',
  'openid',
];

export const STORAGE_KEY_TOKEN = 'travel_google_auth_token';
export const STORAGE_KEY_EXPIRES_AT = 'travel_google_auth_expires_at';
export const STORAGE_KEY_USER = 'travel_google_auth_user';
export const STORAGE_KEY_CONSENT = 'travel_google_auth_consent_granted';

const ALL_STORAGE_KEYS = [
  STORAGE_KEY_TOKEN,
  STORAGE_KEY_EXPIRES_AT,
  STORAGE_KEY_USER,
  STORAGE_KEY_CONSENT,
];

export const saveStoredAuth = (token: string, user: GoogleUser, expiresInSeconds = 3600) => {
  try {
    const expiresAt = Date.now() + Math.max(300, expiresInSeconds - 60) * 1000;
    localStorage.setItem(STORAGE_KEY_TOKEN, token);
    localStorage.setItem(STORAGE_KEY_EXPIRES_AT, String(expiresAt));
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    localStorage.setItem(STORAGE_KEY_CONSENT, 'true');
  } catch (err) {
    console.warn('Nie udało się zapisać sesji w localStorage:', err);
  }
};

export const getStoredAuth = (): { token: string; user: GoogleUser; isConsentGranted: boolean } | null => {
  try {
    const consent = localStorage.getItem(STORAGE_KEY_CONSENT);
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);
    const expiresAt = Number(localStorage.getItem(STORAGE_KEY_EXPIRES_AT) || 0);
    const userJson = localStorage.getItem(STORAGE_KEY_USER);

    if (consent !== 'true' || !token) return null;

    // Check expiration
    if (expiresAt && Date.now() > expiresAt) {
      return null;
    }

    let user: GoogleUser = {
      uid: 'google-saved',
      displayName: 'Użytkownik Google',
      email: '',
      photoURL: null,
    };
    if (userJson) {
      try {
        user = JSON.parse(userJson);
      } catch {
        // use default user
      }
    }

    return { token, user, isConsentGranted: true };
  } catch (err) {
    console.warn('Błąd odczytu sesji z localStorage:', err);
    return null;
  }
};

export const hasConsentGranted = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY_CONSENT) === 'true';
  } catch {
    return false;
  }
};

export const clearStoredAuth = () => {
  try {
    for (const key of ALL_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.warn('Błąd czyszczenia pamięci autoryzacji:', err);
  }
};

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({
  prompt: 'consent',
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedUser: GoogleUser | null = null;

// Listeners for token updates
type TokenListener = (token: string | null, user: GoogleUser | null) => void;
const listeners = new Set<TokenListener>();

export const addAuthListener = (listener: TokenListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const notifyListeners = (user: GoogleUser | null) => {
  listeners.forEach((listener) => listener(cachedAccessToken, user));
};

export const mapUser = (user: User | null): GoogleUser | null => {
  if (!user) return null;
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
  };
};

// Wait for Google Identity Services script to be available if needed
const waitForGsi = (timeoutMs = 2500): Promise<boolean> => {
  return new Promise((resolve) => {
    if (window.google?.accounts?.oauth2) {
      resolve(true);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, 100);
  });
};

export const initAuth = (
  onAuthSuccess?: (user: GoogleUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  // Check stored session in localStorage for automatic resume
  const stored = getStoredAuth();
  if (stored && stored.token && stored.user) {
    cachedAccessToken = stored.token;
    cachedUser = stored.user;
    notifyListeners(stored.user);
    if (onAuthSuccess) onAuthSuccess(stored.user, stored.token);
  }

  return onAuthStateChanged(auth, async (firebaseUser: User | null) => {
    if (firebaseUser) {
      const mapped = mapUser(firebaseUser);
      if (cachedAccessToken && mapped) {
        saveStoredAuth(cachedAccessToken, mapped);
        notifyListeners(mapped);
        if (onAuthSuccess) onAuthSuccess(mapped, cachedAccessToken);
      } else {
        notifyListeners(mapped);
        if (onAuthFailure && !cachedAccessToken) onAuthFailure();
      }
    } else {
      if (!cachedAccessToken) {
        cachedUser = null;
        notifyListeners(null);
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};

// Sign in via Google Identity Services (GSI) directly
const signInWithGsi = async (options?: { prompt?: string }): Promise<{
  user: GoogleUser;
  accessToken: string;
}> => {
  const isLoaded = await waitForGsi();
  if (!isLoaded || !window.google?.accounts?.oauth2) {
    throw new Error('GSI_NOT_AVAILABLE');
  }

  const clientId = (firebaseConfig as Record<string, any>).oAuthClientId || (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('Brak skonfigurowanego oAuthClientId.');
  }

  return new Promise((resolve, reject) => {
    let resolved = false;

    try {
      const tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES.join(' '),
        callback: async (response) => {
          if (resolved) return;
          resolved = true;

          if (response.error) {
            console.error('Błąd GSI response:', response);
            if (response.error === 'popup_closed_by_user') {
              reject(new Error('Okno logowania zostało zamknięte przed autoryzacją.'));
            } else if (response.error === 'access_denied') {
              reject(new Error('Dostęp do konta Google został odrzucony w oknie zgody.'));
            } else {
              reject(
                new Error(`Błąd autoryzacji Google: ${response.error_description || response.error}`)
              );
            }
            return;
          }

          if (!response.access_token) {
            reject(new Error('Nie otrzymano tokenu dostępu Google OAuth.'));
            return;
          }

          const accessToken = response.access_token;
          cachedAccessToken = accessToken;

          // Check granted scopes if returned by GSI
          if (response.scope) {
            const scopeStr = response.scope.toLowerCase();
            if (!scopeStr.includes('calendar')) {
              console.warn(
                'Uwaga: Na ekranie zgody Google nie zaznaczono uprawnień do Kalendarza!'
              );
            }
          }

          // Fetch user profile from userinfo
          let googleUser: GoogleUser = {
            uid: `google-${Date.now()}`,
            displayName: 'Użytkownik Google',
            email: '',
            photoURL: null,
          };

          try {
            const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (userRes.ok) {
              const info = await userRes.json();
              googleUser = {
                uid: info.sub || googleUser.uid,
                displayName: info.name || info.email || 'Użytkownik Google',
                email: info.email || '',
                photoURL: info.picture || null,
              };
            }
          } catch (err) {
            console.warn('Nie udało się pobrać danych profilu userinfo:', err);
          }

          cachedUser = googleUser;
          // Persist token and consent in localStorage for seamless resume
          saveStoredAuth(accessToken, googleUser, Number((response as any).expires_in) || 3600);
          notifyListeners(googleUser);

          // Attempt non-blocking Firebase credential sync
          try {
            const credential = GoogleAuthProvider.credential(null, accessToken);
            await signInWithCredential(auth, credential);
          } catch (fbErr) {
            console.warn('Ostrzeżenie synchronizacji z Firebase Auth (ignorowane):', fbErr);
          }

          resolve({ user: googleUser, accessToken });
        },
        error_callback: (err) => {
          if (resolved) return;
          resolved = true;
          console.error('Błąd GSI error_callback:', err);
          if (err.type === 'popup_blocked') {
            reject(
              new Error(
                'Wyskakujące okienko logowania zostało zablokowane przez przeglądarkę. Zezwól na pop-upy w pasku adresu lub otwórz aplikację w nowej karcie.'
              )
            );
          } else {
            reject(new Error(`Błąd okna logowania Google: ${err.message || err.type}`));
          }
        },
      });

      // If consent was previously granted, default prompt to '' (or select_account) to avoid re-prompting consent
      const alreadyGranted = hasConsentGranted();
      const promptMode = options?.prompt ?? (alreadyGranted ? '' : 'consent');
      tokenClient.requestAccessToken({ prompt: promptMode });
    } catch (err: any) {
      if (resolved) return;
      resolved = true;
      reject(err);
    }
  });
};

// Fallback sign in via Firebase popup
const signInWithFirebasePopup = async (options?: { prompt?: string }): Promise<{
  user: GoogleUser;
  accessToken: string;
}> => {
  const alreadyGranted = hasConsentGranted();
  provider.setCustomParameters({
    prompt: options?.prompt ?? (alreadyGranted ? 'select_account' : 'consent'),
  });

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);

  if (!credential?.accessToken) {
    throw new Error('Nie udało się uzyskać tokenu dostępu Google OAuth.');
  }

  cachedAccessToken = credential.accessToken;
  const mapped = mapUser(result.user)!;
  cachedUser = mapped;
  saveStoredAuth(cachedAccessToken, mapped, 3600);
  notifyListeners(mapped);
  return { user: mapped, accessToken: cachedAccessToken };
};

// Main sign-in entry point with automatic resilience
export const googleSignIn = async (options?: { prompt?: string }): Promise<{
  user: GoogleUser;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    cachedAccessToken = null;

    // Primary: Google Identity Services (GSI) - works seamlessly in iframe and without firebaseapp.com cross-origin issues
    try {
      return await signInWithGsi(options);
    } catch (gsiError: any) {
      // If user deliberately closed popup or denied consent, don't fall back to another popup
      if (
        gsiError.message?.includes('zamknięte') ||
        gsiError.message?.includes('odrzucony') ||
        gsiError.message?.includes('zablokowane')
      ) {
        throw gsiError;
      }

      console.warn('Próba logowania GSI nie powiodła się, próba Firebase Auth:', gsiError);
      // Fallback: Firebase popup
      return await signInWithFirebasePopup(options);
    }
  } catch (error: any) {
    console.error('Błąd logowania Google:', error);
    if (error.code === 'auth/network-request-failed' || error.message?.includes('network-request-failed')) {
      throw new Error(
        'Błąd sieci lub ograniczenie ramki (iframe) przeglądarki. Otwórz aplikację w nowej karcie (przycisk w prawym górnym rogu podglądu) i spróbuj ponownie.'
      );
    }
    if (error.code === 'auth/popup-blocked') {
      throw new Error(
        'Przeglądarka zablokowała wyskakujące okienko. Zezwól na pop-upy dla tej strony lub otwórz aplikację w nowej karcie.'
      );
    }
    if (error.code === 'auth/popup-closed-by-user') {
      throw new Error('Okno logowania zostało zamknięte przed ukończeniem.');
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Manual token connection helper (for testing or restricted corporate environments)
export const setManualAccessToken = async (token: string): Promise<GoogleUser> => {
  if (!token || !token.trim()) {
    throw new Error('Podaj poprawny token OAuth.');
  }

  const cleanToken = token.trim();
  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${cleanToken}` },
  });

  if (!userRes.ok) {
    throw new Error(`Podany token jest niepoprawny lub wygasł (${userRes.status}).`);
  }

  const info = await userRes.json();
  const user: GoogleUser = {
    uid: info.sub || `manual-${Date.now()}`,
    displayName: info.name || info.email || 'Użytkownik Google',
    email: info.email || '',
    photoURL: info.picture,
  };

  cachedAccessToken = cleanToken;
  cachedUser = user;
  notifyListeners(user);
  return user;
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('Błąd podczas signOut:', err);
  }
  clearStoredAuth();
  cachedAccessToken = null;
  cachedUser = null;
  notifyListeners(null);
};
