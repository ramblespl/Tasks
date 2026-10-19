import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { app, auth } from './firebaseAuth';
import { authConfig } from '../config/authConfig';
import { TaskTemplateSet } from '../types';

export const db = getFirestore(app, authConfig.firestoreDatabaseId);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  // Log as warning rather than uncaught error to allow seamless offline operation
  console.warn('Firestore Operation Info:', JSON.stringify(errInfo));
}

/**
 * Validates initial connection to Firestore. Non-blocking with short timeout.
 */
export async function testFirestoreConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 2000)
    );
    const snap = await Promise.race([
      getDoc(doc(db, 'test', 'connection')),
      timeoutPromise,
    ]);
    return snap.exists();
  } catch {
    return false;
  }
}

export interface CloudTemplatesData {
  userId: string;
  templateSets: TaskTemplateSet[];
  activeTemplateSetId: string;
  updatedAt: string;
}

/**
 * Generates a stable, cross-device Firestore document identifier for a Google user.
 * Ensures that logging in with the same Google Account on multiple devices
 * (phone, desktop, tablet) will always resolve to the exact same templates document.
 */
export function getGoogleAccountSyncKey(user: { uid?: string; email?: string } | null): string | null {
  if (!user) return null;

  // 1. Primary: user email is unique, universal and identical across all devices
  if (user.email && user.email.trim()) {
    const cleanEmail = user.email.trim().toLowerCase();
    const sanitized = cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
    return `account_${sanitized}`;
  }

  // 2. Secondary: if uid is a stable Google ID (numeric Google sub ID or prefixed)
  if (user.uid && user.uid.trim()) {
    const cleanUid = user.uid.trim();
    if (cleanUid !== 'google-saved' && !cleanUid.startsWith('manual-')) {
      const sanitized = cleanUid.replace(/[^a-zA-Z0-9_\-]/g, '_');
      return `account_${sanitized}`;
    }
  }

  return null;
}

/**
 * Loads user template sets from Firestore.
 * Gracefully falls back to null if offline or unreachable within 3.5s.
 */
export async function loadCloudTemplates(
  syncKey: string
): Promise<{ templateSets: TaskTemplateSet[]; activeTemplateSetId: string } | null> {
  if (!syncKey) return null;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return null;
  }

  try {
    const docRef = doc(db, 'users', syncKey, 'settings', 'templates');
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Firestore timeout')), 3500)
    );
    const snap = await Promise.race([getDoc(docRef), timeoutPromise]);

    if (snap.exists()) {
      const data = snap.data() as CloudTemplatesData;
      if (Array.isArray(data.templateSets) && data.templateSets.length > 0) {
        console.log(`Firestore: Załadowano ${data.templateSets.length} zestawów szablonów z chmury dla konta [${syncKey}]`);
        return {
          templateSets: data.templateSets,
          activeTemplateSetId: data.activeTemplateSetId || data.templateSets[0].id,
        };
      }
    }
    return null;
  } catch (err: any) {
    console.warn(`Firestore: Tryb offline / lokalne szablony (${err?.message || 'offline'}).`);
    return null;
  }
}

/**
 * Saves user template sets to Firestore, syncing across devices.
 * Non-fatal if offline.
 */
export async function saveCloudTemplates(
  syncKey: string,
  templateSets: TaskTemplateSet[],
  activeTemplateSetId: string
): Promise<void> {
  if (!syncKey) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  try {
    const docRef = doc(db, 'users', syncKey, 'settings', 'templates');
    const payload: CloudTemplatesData = {
      userId: syncKey,
      templateSets,
      activeTemplateSetId: activeTemplateSetId || templateSets[0]?.id || 'set-universal',
      updatedAt: new Date().toISOString(),
    };
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Firestore save timeout')), 4000)
    );
    await Promise.race([
      setDoc(docRef, payload, { merge: true }),
      timeoutPromise,
    ]);
    console.log(`Firestore: Pomyślnie zsynchronizowano szablony w chmurze dla konta [${syncKey}]`);
  } catch (err: any) {
    console.warn(`Firestore: Nie udało się zsynchronizować szablonów w chmurze (${err?.message || 'offline'}). Zapisano lokalnie.`);
  }
}

/**
 * Subscribes to real-time updates for user templates across devices.
 */
export function subscribeToCloudTemplates(
  syncKey: string,
  onUpdate: (data: { templateSets: TaskTemplateSet[]; activeTemplateSetId: string }) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const docRef = doc(db, 'users', syncKey, 'settings', 'templates');

  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as CloudTemplatesData;
        if (Array.isArray(data.templateSets) && data.templateSets.length > 0) {
          console.log(`Firestore: Odebrano aktualizację szablonów w czasie rzeczywistym dla konta [${syncKey}]`);
          onUpdate({
            templateSets: data.templateSets,
            activeTemplateSetId: data.activeTemplateSetId || data.templateSets[0].id,
          });
        }
      }
    },
    (error) => {
      console.warn('Subskrypcja Firestore:', error.message);
      if (onError) onError(error);
    }
  );
}
