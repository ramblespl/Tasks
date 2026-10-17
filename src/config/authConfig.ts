import defaultFirebaseConfig from '../../firebase-applet-config.json';

export interface AppAuthConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId?: string;
  oAuthClientId: string;
  recaptchaSiteKey?: string;
}

// 1. Read build-time environment variables (client env variables start with VITE_)
const envOAuthClientId =
  (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined)?.trim() ||
  (import.meta.env.VITE_OAUTH_CLIENT_ID as string | undefined)?.trim() ||
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ||
  '';

const envProjectId =
  (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined)?.trim() ||
  '';

const envApiKey =
  (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined)?.trim() ||
  '';

const envAuthDomain =
  (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined)?.trim() ||
  '';

const envFirestoreDatabaseId =
  (import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID as string | undefined)?.trim() ||
  (import.meta.env.VITE_FIRESTORE_DATABASE_ID as string | undefined)?.trim() ||
  '';

const envStorageBucket =
  (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined)?.trim() ||
  '';

const envMessagingSenderId =
  (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined)?.trim() ||
  '';

const envAppId =
  (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined)?.trim() ||
  '';

// Merge environment variables with fallback to firebase-applet-config.json
export const authConfig: AppAuthConfig = {
  projectId: envProjectId || defaultFirebaseConfig.projectId || '',
  appId: envAppId || defaultFirebaseConfig.appId || '',
  apiKey: envApiKey || defaultFirebaseConfig.apiKey || '',
  authDomain: envAuthDomain || defaultFirebaseConfig.authDomain || '',
  firestoreDatabaseId:
    envFirestoreDatabaseId ||
    (defaultFirebaseConfig as Record<string, any>).firestoreDatabaseId ||
    '(default)',
  storageBucket: envStorageBucket || defaultFirebaseConfig.storageBucket || '',
  messagingSenderId:
    envMessagingSenderId || defaultFirebaseConfig.messagingSenderId || '',
  oAuthClientId:
    envOAuthClientId ||
    (defaultFirebaseConfig as Record<string, any>).oAuthClientId ||
    '',
  measurementId: defaultFirebaseConfig.measurementId || '',
  recaptchaSiteKey: defaultFirebaseConfig.recaptchaSiteKey || '',
};

/**
 * Returns the effective OAuth Client ID from environment variables or config.
 */
export const getOAuthClientId = (): string => {
  return authConfig.oAuthClientId;
};

/**
 * Helper to fetch runtime configuration from the server if running in Docker / Express
 * where environment variables might be passed dynamically to the container.
 */
export async function loadRuntimeConfig(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const res = await fetch('/api/config', {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        if (data.oAuthClientId) authConfig.oAuthClientId = data.oAuthClientId;
        if (data.projectId) authConfig.projectId = data.projectId;
        if (data.apiKey) authConfig.apiKey = data.apiKey;
        if (data.authDomain) authConfig.authDomain = data.authDomain;
        if (data.firestoreDatabaseId) authConfig.firestoreDatabaseId = data.firestoreDatabaseId;
        if (data.storageBucket) authConfig.storageBucket = data.storageBucket;
        if (data.messagingSenderId) authConfig.messagingSenderId = data.messagingSenderId;
        if (data.appId) authConfig.appId = data.appId;
      }
    }
  } catch {
    // Non-fatal if /api/config is not present (e.g. static dev server)
  }
}
