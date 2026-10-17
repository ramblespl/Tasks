import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  type User,
} from 'firebase/auth';
import { authConfig, getOAuthClientId, loadRuntimeConfig } from '../config/authConfig';
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

export const app = getApps().length === 0 ? initializeApp(authConfig) : getApp();
export const auth = getAuth(app);

// Enable local device persistence for Firebase Authentication
try {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('Ostrzeżenie dotyczące trwałości sesji Firebase Auth:', err);
  });
} catch {
  // Ignore in case environment restricts
}

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  'email',
  'profile',
  'openid',
];

export const STORAGE_KEY_TOKEN = 'travel_google_auth_token';
export const STORAGE_KEY_EXPIRES_AT = 'travel_google_auth_expires_at';
export const STORAGE_KEY_USER = 'travel_google_auth_user';
export const STORAGE_KEY_CONSENT = 'travel_google_auth_consent_granted';
export const STORAGE_KEY_REMEMBER_DEVICE = 'travel_google_auth_remember_device';
export const STORAGE_KEY_CLIENT_ID = 'travel_google_auth_client_id';

const ALL_STORAGE_KEYS = [
  STORAGE_KEY_TOKEN,
  STORAGE_KEY_EXPIRES_AT,
  STORAGE_KEY_USER,
  STORAGE_KEY_CONSENT,
  STORAGE_KEY_REMEMBER_DEVICE,
  STORAGE_KEY_CLIENT_ID,
];

export const isRememberDeviceEnabled = (): boolean => {
  try {
    const val = localStorage.getItem(STORAGE_KEY_REMEMBER_DEVICE);
    return val === null ? true : val === 'true'; // Domyślnie włączone zapamiętywanie na urządzeniu
  } catch {
    return true;
  }
};

export const setRememberDevice = (remember: boolean) => {
  try {
    localStorage.setItem(STORAGE_KEY_REMEMBER_DEVICE, String(remember));
  } catch (err) {
    console.warn('Błąd zapisu preferencji zapamiętywania urządzenia:', err);
  }
};

export const saveStoredAuth = (token: string, user: GoogleUser, expiresInSeconds = 3600) => {
  try {
    const currentClientId = getOAuthClientId() || '';
    const expiresAt = Date.now() + Math.max(300, expiresInSeconds) * 1000;
    // Always persist to localStorage so reopening the app or browser never asks to log in again
    localStorage.setItem(STORAGE_KEY_TOKEN, token);
    localStorage.setItem(STORAGE_KEY_EXPIRES_AT, String(expiresAt));
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    localStorage.setItem(STORAGE_KEY_CONSENT, 'true');
    localStorage.setItem(STORAGE_KEY_REMEMBER_DEVICE, 'true');
    if (currentClientId) {
      localStorage.setItem(STORAGE_KEY_CLIENT_ID, currentClientId);
    }

    // Also mirror to sessionStorage
    sessionStorage.setItem(STORAGE_KEY_TOKEN, token);
    sessionStorage.setItem(STORAGE_KEY_EXPIRES_AT, String(expiresAt));
    sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    sessionStorage.setItem(STORAGE_KEY_CONSENT, 'true');
    if (currentClientId) {
      sessionStorage.setItem(STORAGE_KEY_CLIENT_ID, currentClientId);
    }
  } catch (err) {
    console.warn('Nie udało się zapisać sesji w pamięci urządzenia:', err);
  }
};

export const getStoredAuth = (): { token: string; user: GoogleUser; isConsentGranted: boolean } | null => {
  try {
    const currentClientId = getOAuthClientId() || '';
    const savedClientId =
      localStorage.getItem(STORAGE_KEY_CLIENT_ID) ||
      sessionStorage.getItem(STORAGE_KEY_CLIENT_ID);

    // If client ID changed due to OAuth configuration update, invalidate old token
    if (savedClientId && currentClientId && savedClientId !== currentClientId) {
      console.log('Wykryto zmianę OAuth Client ID projektu. Unieważnianie starego tokenu.');
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      sessionStorage.removeItem(STORAGE_KEY_TOKEN);
      return null;
    }

    const token =
      localStorage.getItem(STORAGE_KEY_TOKEN) ||
      sessionStorage.getItem(STORAGE_KEY_TOKEN);
    const userJson =
      localStorage.getItem(STORAGE_KEY_USER) ||
      sessionStorage.getItem(STORAGE_KEY_USER);

    if (!token) return null;

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
    console.warn('Błąd odczytu sesji z pamięci urządzenia:', err);
    return null;
  }
};

export const hasConsentGranted = (): boolean => {
  try {
    return (
      localStorage.getItem(STORAGE_KEY_CONSENT) === 'true' ||
      sessionStorage.getItem(STORAGE_KEY_CONSENT) === 'true'
    );
  } catch {
    return false;
  }
};

export const clearStoredAuth = () => {
  try {
    for (const key of ALL_STORAGE_KEYS) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
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

let isRefreshingToken = false;
let tokenRefreshPromise: Promise<string | null> | null = null;
let lastSilentRefreshAttempt = 0;

export const isStoredTokenExpired = (): boolean => {
  try {
    const expiresAt = Number(
      localStorage.getItem(STORAGE_KEY_EXPIRES_AT) ||
        sessionStorage.getItem(STORAGE_KEY_EXPIRES_AT) ||
        0
    );
    // Token is considered expired if expiresAt is 0 or less than 2 minutes remaining
    return expiresAt === 0 || Date.now() >= expiresAt - 120000;
  } catch {
    return true;
  }
};

// Silent Google OAuth token refresh in background (without popup if previously authorized)
export const refreshGoogleTokenSilently = async (): Promise<string | null> => {
  if (isRefreshingToken && tokenRefreshPromise) {
    return tokenRefreshPromise;
  }

  // Cooldown to avoid hammering GIS and triggering continuous focus/blur cycles
  const now = Date.now();
  if (now - lastSilentRefreshAttempt < 45000) {
    return cachedAccessToken;
  }
  lastSilentRefreshAttempt = now;

  const clientId = getOAuthClientId();
  if (!clientId) return null;

  isRefreshingToken = true;
  tokenRefreshPromise = (async () => {
    try {
      const isLoaded = await waitForGsi(2000);
      if (!isLoaded || !window.google?.accounts?.oauth2) {
        return null;
      }

      return await new Promise<string | null>((resolve) => {
        let finished = false;
        const timer = setTimeout(() => {
          if (!finished) {
            finished = true;
            resolve(null);
          }
        }, 3500);

        try {
          const stored = getStoredAuth();
          const tokenClient = window.google!.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: SCOPES.join(' '),
            callback: (response) => {
              if (finished) return;
              finished = true;
              clearTimeout(timer);

              if (response.access_token) {
                const newToken = response.access_token;
                cachedAccessToken = newToken;
                const user = cachedUser || stored?.user || {
                  uid: 'google-saved',
                  displayName: 'Użytkownik Google',
                  email: '',
                  photoURL: null,
                };
                cachedUser = user;
                saveStoredAuth(newToken, user, Number((response as any).expires_in) || 3600);
                notifyListeners(user);
                resolve(newToken);
              } else {
                resolve(null);
              }
            },
            error_callback: () => {
              if (finished) return;
              finished = true;
              clearTimeout(timer);
              resolve(null);
            },
          });

          // Silent token renewal with account hint if available
          const reqConfig: { prompt: string; hint?: string } = { prompt: '' };
          if (stored?.user?.email) {
            reqConfig.hint = stored.user.email;
          }
          tokenClient.requestAccessToken(reqConfig);
        } catch {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            resolve(null);
          }
        }
      });
    } finally {
      isRefreshingToken = false;
      tokenRefreshPromise = null;
    }
  })();

  return tokenRefreshPromise;
};

// Returns cached token or silently refreshes if expired/near expiration
export const getValidAccessToken = async (): Promise<string | null> => {
  const stored = getStoredAuth();
  if (!stored) return cachedAccessToken;

  const expiresAt = Number(
    localStorage.getItem(STORAGE_KEY_EXPIRES_AT) ||
      sessionStorage.getItem(STORAGE_KEY_EXPIRES_AT) ||
      0
  );
  if (expiresAt > 0 && Date.now() > expiresAt - 180000) {
    const freshToken = await refreshGoogleTokenSilently();
    if (freshToken) return freshToken;
  }

  return cachedAccessToken || stored.token;
};

export const initAuth = (
  onAuthSuccess?: (user: GoogleUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  // Fetch runtime configuration if served via Docker/Express with environment variables
  loadRuntimeConfig().catch(() => {});

  // Check stored session in localStorage/sessionStorage for automatic resume
  const stored = getStoredAuth();
  if (stored && stored.token && stored.user) {
    cachedAccessToken = stored.token;
    cachedUser = stored.user;
    notifyListeners(stored.user);
    if (onAuthSuccess) {
      onAuthSuccess(stored.user, stored.token);
    }

    // Always attempt silent background token refresh to ensure the token remains fresh
    refreshGoogleTokenSilently()
      .then((freshToken) => {
        if (freshToken && onAuthSuccess) {
          cachedAccessToken = freshToken;
          cachedUser = stored.user;
          saveStoredAuth(freshToken, stored.user);
          notifyListeners(stored.user);
          onAuthSuccess(stored.user, freshToken);
        }
      })
      .catch((err) => {
        console.warn('Ciche odświeżenie tokenu Google w tle (kontynuacja z istniejącą sesją):', err);
      });
  }

  return onAuthStateChanged(auth, async (firebaseUser: User | null) => {
    const existingToken =
      cachedAccessToken ||
      localStorage.getItem(STORAGE_KEY_TOKEN) ||
      sessionStorage.getItem(STORAGE_KEY_TOKEN);

    if (firebaseUser) {
      const mapped = mapUser(firebaseUser);
      if (existingToken && mapped) {
        cachedAccessToken = existingToken;
        saveStoredAuth(existingToken, mapped);
        notifyListeners(mapped);
        if (onAuthSuccess) onAuthSuccess(mapped, existingToken);
      } else {
        notifyListeners(mapped);
      }
    } else {
      // If Firebase Auth is not signed in, but we have stored Google auth, keep user logged in!
      if (!existingToken && (!stored || !stored.token)) {
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

  const clientId = getOAuthClientId();
  if (!clientId) {
    throw new Error('Brak skonfigurowanego oAuthClientId. Ustaw zmienną środowiskową VITE_GOOGLE_OAUTH_CLIENT_ID lub skonfiguruj integrację OAuth.');
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
            const hasCalendar = scopeStr.includes('calendar');
            const hasTasks = scopeStr.includes('tasks');
            if (!hasCalendar || !hasTasks) {
              const missingParts: string[] = [];
              if (!hasCalendar) missingParts.push('Kalendarz Google');
              if (!hasTasks) missingParts.push('Zadania Google (Tasks)');
              const msg = `Na ekranie logowania Google nie zaznaczono uprawnień do: ${missingParts.join(' oraz ')}. Zaloguj się ponownie i zaznacz wszystkie pola wyboru na ekranie zgody Google, aby aplikacja mogła odczytywać i zapisywać dane.`;
              console.warn(msg);
              reject(new Error(msg));
              return;
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

      // Always present the consent screen on user-initiated sign in so permissions can be granted
      const promptMode = options?.prompt ?? 'consent';
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
