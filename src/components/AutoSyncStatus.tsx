import React, { useState } from 'react';
import { RefreshCw, Zap, ShieldCheck, History, CheckCircle, AlertTriangle } from 'lucide-react';
import { SyncLogItem } from '../types';

interface AutoSyncStatusProps {
  autoSync: boolean;
  onToggleAutoSync: (enabled: boolean) => void;
  lastSyncTime: Date | null;
  onSyncNow: () => void;
  isSyncing: boolean;
  logs: SyncLogItem[];
  onClearLogs: () => void;
}

export const AutoSyncStatus: React.FC<AutoSyncStatusProps> = ({
  autoSync,
  onToggleAutoSync,
  lastSyncTime,
  onSyncNow,
  isSyncing,
  logs,
  onClearLogs,
}) => {
  const [showLogs, setShowLogs] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-neutral-200/80 p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
            autoSync ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100 text-neutral-600'
          }`}>
            <Zap className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-semibold text-neutral-900">
                Automatyczna synchronizacja wydarzeń i zadań
              </h3>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                  autoSync
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {autoSync ? 'Aktywne w tle' : 'Ręczne'}
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              {lastSyncTime
                ? `Ostatnie sprawdzenie kalendarza: ${lastSyncTime.toLocaleTimeString('pl-PL')}`
                : 'Jeszcze nie sprawdzano'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2.5 self-end sm:self-auto">
          <label className="flex items-center space-x-2 cursor-pointer text-xs font-medium text-neutral-700 select-none mr-2">
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => onToggleAutoSync(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 relative"></div>
            <span>Auto-wykrywanie</span>
          </label>

          <button
            onClick={onSyncNow}
            disabled={isSyncing}
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 py-1.5 px-3 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
            <span>Sprawdź teraz</span>
          </button>

          {logs.length > 0 && (
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="inline-flex items-center space-x-1 text-xs text-neutral-600 hover:text-neutral-900 bg-neutral-50 border border-neutral-200 py-1.5 px-2.5 rounded-lg"
            >
              <History className="w-3.5 h-3.5" />
              <span>Dziennik ({logs.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Expandable Logs View */}
      {showLogs && logs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-neutral-100 space-y-1.5 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-1">
            <span>Ostatnie operacje w aplikacji</span>
            <button
              onClick={onClearLogs}
              className="text-neutral-400 hover:text-rose-600"
            >
              Wyczyść historię
            </button>
          </div>
          {logs.map((log) => (
            <div
              key={log.id}
              className="text-xs p-2 rounded-lg bg-neutral-50 flex items-start space-x-2 text-neutral-700"
            >
              {log.type === 'success' ? (
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              ) : log.type === 'error' ? (
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <span className="font-medium">{log.message}</span>
                <span className="text-[10px] text-neutral-400 ml-2">{log.timestamp}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
