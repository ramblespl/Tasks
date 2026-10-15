import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { RotateCcw, RotateCw, X, History, Trash2, CheckCircle2 } from 'lucide-react';

export interface UndoAction {
  id: string;
  type: string;
  title: string;
  timestamp: number;
  undo: () => Promise<void> | void;
  redo?: () => Promise<void> | void;
}

interface ToastNotice {
  id: string;
  actionId: string;
  title: string;
  durationMs: number;
  expiresAt: number;
}

interface UndoContextType {
  undoStack: UndoAction[];
  redoStack: UndoAction[];
  canUndo: boolean;
  canRedo: boolean;
  isPerformingUndo: boolean;
  pushAction: (action: Omit<UndoAction, 'id' | 'timestamp'> & { id?: string; timestamp?: number }) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clearHistory: () => void;
  activeToast: ToastNotice | null;
  dismissToast: () => void;
}

const UndoContext = createContext<UndoContextType | null>(null);

const MAX_HISTORY = 30;
const TOAST_DURATION_MS = 8000;

export const UndoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoAction[]>([]);
  const [isPerformingUndo, setIsPerformingUndo] = useState(false);
  const [activeToast, setActiveToast] = useState<ToastNotice | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  // Dismiss toast
  const dismissToast = useCallback(() => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setActiveToast(null);
  }, []);

  // Push new undoable action
  const pushAction = useCallback(
    (actionData: Omit<UndoAction, 'id' | 'timestamp'> & { id?: string; timestamp?: number }) => {
      const fullAction: UndoAction = {
        id: actionData.id || `action-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: actionData.timestamp || Date.now(),
        type: actionData.type,
        title: actionData.title,
        undo: actionData.undo,
        redo: actionData.redo,
      };

      setUndoStack((prev) => [fullAction, ...prev].slice(0, MAX_HISTORY));
      // Reset redo stack on new action
      setRedoStack([]);

      // Trigger interactive Toast
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }

      const expiresAt = Date.now() + TOAST_DURATION_MS;
      setActiveToast({
        id: `toast-${Date.now()}`,
        actionId: fullAction.id,
        title: fullAction.title,
        durationMs: TOAST_DURATION_MS,
        expiresAt,
      });

      toastTimeoutRef.current = window.setTimeout(() => {
        setActiveToast(null);
        toastTimeoutRef.current = null;
      }, TOAST_DURATION_MS);
    },
    []
  );

  // Perform Undo
  const undo = useCallback(async () => {
    if (undoStack.length === 0 || isPerformingUndo) return;
    setIsPerformingUndo(true);

    const [actionToUndo, ...remainingUndo] = undoStack;
    try {
      await actionToUndo.undo();
      setUndoStack(remainingUndo);
      if (actionToUndo.redo) {
        setRedoStack((prev) => [actionToUndo, ...prev].slice(0, MAX_HISTORY));
      }

      // Show toast confirming undo
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
      const expiresAt = Date.now() + 4000;
      setActiveToast({
        id: `toast-undone-${Date.now()}`,
        actionId: actionToUndo.id,
        title: `Cofnięto: ${actionToUndo.title}`,
        durationMs: 4000,
        expiresAt,
      });
      toastTimeoutRef.current = window.setTimeout(() => {
        setActiveToast(null);
      }, 4000);
    } catch (err) {
      console.error('Failed to undo action:', err);
    } finally {
      setIsPerformingUndo(false);
    }
  }, [undoStack, isPerformingUndo]);

  // Perform Redo
  const redo = useCallback(async () => {
    if (redoStack.length === 0 || isPerformingUndo) return;
    setIsPerformingUndo(true);

    const [actionToRedo, ...remainingRedo] = redoStack;
    try {
      if (actionToRedo.redo) {
        await actionToRedo.redo();
      }
      setRedoStack(remainingRedo);
      setUndoStack((prev) => [actionToRedo, ...prev].slice(0, MAX_HISTORY));

      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
      const expiresAt = Date.now() + 4000;
      setActiveToast({
        id: `toast-redone-${Date.now()}`,
        actionId: actionToRedo.id,
        title: `Ponowiono: ${actionToRedo.title}`,
        durationMs: 4000,
        expiresAt,
      });
      toastTimeoutRef.current = window.setTimeout(() => {
        setActiveToast(null);
      }, 4000);
    } catch (err) {
      console.error('Failed to redo action:', err);
    } finally {
      setIsPerformingUndo(false);
    }
  }, [redoStack, isPerformingUndo]);

  // Clear History
  const clearHistory = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
    dismissToast();
  }, [dismissToast]);

  // Keyboard shortcut listener for Ctrl+Z (Undo) and Ctrl+Y / Ctrl+Shift+Z (Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('input') ||
          target.closest('textarea'))
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key === 'z' || e.key === 'Z') {
          if (e.shiftKey) {
            // Redo
            e.preventDefault();
            redo();
          } else {
            // Undo
            e.preventDefault();
            undo();
          }
        } else if (e.key === 'y' || e.key === 'Y') {
          // Redo
          e.preventDefault();
          redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return (
    <UndoContext.Provider
      value={{
        undoStack,
        redoStack,
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        isPerformingUndo,
        pushAction,
        undo,
        redo,
        clearHistory,
        activeToast,
        dismissToast,
      }}
    >
      {children}
      <UndoFloatingToast />
    </UndoContext.Provider>
  );
};

export const useUndo = () => {
  const context = useContext(UndoContext);
  if (!context) {
    throw new Error('useUndo must be used within an UndoProvider');
  }
  return context;
};

/**
 * Interactive Toast snackbar shown at the bottom of the screen with a direct "Cofnij" button
 */
export const UndoFloatingToast: React.FC = () => {
  const context = useContext(UndoContext);
  if (!context) return null;

  const { activeToast, dismissToast, undo, isPerformingUndo, canUndo } = context;

  if (!activeToast) return null;

  const isUndoConfirmation = activeToast.title.startsWith('Cofnięto:');
  const isRedoConfirmation = activeToast.title.startsWith('Ponowiono:');

  return (
    <div
      id="undo-floating-toast"
      className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50 max-w-sm sm:max-w-md w-full animate-in fade-in slide-in-from-bottom-4 duration-200 pointer-events-auto"
      role="status"
      aria-live="polite"
    >
      <div className="bg-neutral-900/95 text-white backdrop-blur-md rounded-2xl p-3 sm:p-3.5 shadow-2xl border border-neutral-700/80 flex items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-7 h-7 rounded-xl bg-blue-600/30 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
            {isUndoConfirmation || isRedoConfirmation ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <RotateCcw className="w-4 h-4 text-blue-400" />
            )}
          </div>
          <p className="text-xs sm:text-sm font-medium text-neutral-100 truncate">
            {activeToast.title}
          </p>
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
          {!isUndoConfirmation && !isRedoConfirmation && canUndo && (
            <button
              type="button"
              id="btn-toast-undo"
              onClick={async () => {
                await undo();
              }}
              disabled={isPerformingUndo}
              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isPerformingUndo ? 'animate-spin' : ''}`} />
              <span>Cofnij</span>
            </button>
          )}

          <button
            type="button"
            onClick={dismissToast}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
            title="Zamknij powiadomienie"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
