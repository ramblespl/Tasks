import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  getDocFromServer,
  Unsubscribe,
} from 'firebase/firestore';
import { app, auth } from './firebaseAuth';
import firebaseConfig from '../../firebase-applet-config.json';
import { TaskTemplateSet } from '../types';

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

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
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
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
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Validates initial connection to Firestore as required by the Firebase skill.
 */
export async function testFirestoreConnection(): Promise<boolean> {
  const testPath = 'test/connection';
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore: Klient jest w trybie offline. Sprawdź konfigurację sieciową.');
    } else {
      // Permission or non-existent doc on test path is normal
      console.log('Firestore connection verified.');
    }
    return false;
  }
}

// Kick off test connection
testFirestoreConnection().catch(() => {});

export interface CloudTemplatesData {
  userId: string;
  templateSets: TaskTemplateSet[];
  activeTemplateSetId: string;
  updatedAt: string;
}

/**
 * Loads user template sets from Firestore.
 */
export async function loadCloudTemplates(
  userId: string
): Promise<{ templateSets: TaskTemplateSet[]; activeTemplateSetId: string } | null> {
  if (!userId) return null;
  const path = `users/${userId}/settings/templates`;
  try {
    const docRef = doc(db, 'users', userId, 'settings', 'templates');
    const snap = await getDoc(docRef);
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
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

/**
 * Saves user template sets to Firestore, syncing across devices.
 */
export async function saveCloudTemplates(
  userId: string,
  templateSets: TaskTemplateSet[],
  activeTemplateSetId: string
): Promise<void> {
  if (!userId) return;
  const path = `users/${userId}/settings/templates`;
  try {
    const docRef = doc(db, 'users', userId, 'settings', 'templates');
    const payload: CloudTemplatesData = {
      userId,
      templateSets,
      activeTemplateSetId: activeTemplateSetId || templateSets[0]?.id || 'set-universal',
      updatedAt: new Date().toISOString(),
    };
    await setDoc(docRef, payload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
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
      console.warn('Błąd subskrypcji Firestore:', error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}
