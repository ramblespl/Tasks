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
 * Loads user template sets from Firestore.
 * Gracefully falls back to null if offline or unreachable within 2.5s.
 */
export async function loadCloudTemplates(
  userId: string
): Promise<{ templateSets: TaskTemplateSet[]; activeTemplateSetId: string } | null> {
  if (!userId) return null;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return null;
  }

  try {
    const docRef = doc(db, 'users', userId, 'settings', 'templates');
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Firestore timeout')), 2500)
    );
    const snap = await Promise.race([getDoc(docRef), timeoutPromise]);

    if (snap.exists()) {
      const data = snap.data() as CloudTemplatesData;
      if (Array.isArray(data.templateSets) && data.templateSets.length > 0) {
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
  userId: string,
  templateSets: TaskTemplateSet[],
  activeTemplateSetId: string
): Promise<void> {
  if (!userId) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  try {
    const docRef = doc(db, 'users', userId, 'settings', 'templates');
    const payload: CloudTemplatesData = {
      userId,
      templateSets,
      activeTemplateSetId: activeTemplateSetId || templateSets[0]?.id || 'set-universal',
      updatedAt: new Date().toISOString(),
    };
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Firestore save timeout')), 3000)
    );
    await Promise.race([
      setDoc(docRef, payload, { merge: true }),
      timeoutPromise,
    ]);
  } catch (err: any) {
    console.warn(`Firestore: Nie udało się zsynchronizować szablonów w chmurze (${err?.message || 'offline'}). Zapisano lokalnie.`);
  }
}

/**
 * Subscribes to real-time updates for user templates across devices.
 */
export function subscribeToCloudTemplates(
  userId: string,
  onUpdate: (data: { templateSets: TaskTemplateSet[]; activeTemplateSetId: string }) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `users/${userId}/settings/templates`;
  const docRef = doc(db, 'users', userId, 'settings', 'templates');

  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as CloudTemplatesData;
        if (Array.isArray(data.templateSets) && data.templateSets.length > 0) {
          onUpdate({
            templateSets: data.templateSets,
            activeTemplateSetId: data.activeTemplateSetId || data.templateSets[0].id,
          });
        }
      }
    },
    (error) => {
      console.warn('Subskrypcja Firestore (tryb offline lub oczekiwanie):', error.message);
      if (onError) onError(error);
    }
  );
}
