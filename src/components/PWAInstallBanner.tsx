import React, { useState } from 'react';
import { Download, Smartphone, X, CheckCircle, ExternalLink, HelpCircle, WifiOff } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../utils/usePWAInstall';

interface PWAInstallBannerProps {
  onDismiss?: () => void;
}

export const PWAInstallModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { isAndroid, isIOS, hasNativePrompt, install } = usePWAInstall();
  const [installStatus, setInstallStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTriggerInstall = async () => {
    if (hasNativePrompt) {
      const res = await install();
      if (res === 'accepted') {
        setInstallStatus('Zainstalowano!');
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-neutral-200 overflow-hidden">
        {/* Header with blue gradient */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Instalacja na Androidzie</h3>
                <p className="text-xs text-blue-100">Aplikacja Zadania na Twoim telefonie</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/20 transition cursor-pointer"
              aria-label="Zamknij"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {hasNativePrompt ? (
            <div className="p-4 bg-blue-50/80 rounded-2xl border border-blue-100 text-center space-y-3">
              <p className="text-xs text-blue-900 font-medium">
                Twoja przeglądarka jest gotowa do natychmiastowej instalacji aplikacji Zadania jednym kliknięciem:
              </p>
              <button
                type="button"
                onClick={handleTriggerInstall}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-xl text-sm font-bold shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                {installStatus ? installStatus : 'Zainstaluj teraz na telefonie'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-neutral-600 leading-relaxed">
                Aplikację możesz zainstalować bezpośrednio z przeglądarki Chrome na systemie Android bez konieczności pobierania z Google Play.
              </div>

              {/* Step-by-step for Android Chrome */}
              <div className="space-y-2.5 bg-neutral-50 p-3.5 rounded-2xl border border-neutral-200">
                <div className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  Kroki instalacji (Android Chrome):
                </div>

                <div className="flex items-start gap-2.5 text-xs text-neutral-700">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                    1
                  </span>
                  <span>
                    Kliknij menu przeglądarki <strong>trzy pionowe kropki (⋮)</strong> w prawym górnym rogu ekranu.
                  </span>
                </div>

                <div className="flex items-start gap-2.5 text-xs text-neutral-700">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                    2
                  </span>
                  <span>
                    Wybierz opcję <strong>„Zainstaluj aplikację”</strong> lub <strong>„Dodaj do ekranu głównego”</strong>.
                  </span>
                </div>

                <div className="flex items-start gap-2.5 text-xs text-neutral-700">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                    3
                  </span>
                  <span>
                    Potwierdź klikając <strong>„Zainstaluj”</strong>. Ikona aplikacji <strong>Zadania</strong> pojawi się na Twoim pulpicie Androida.
                  </span>
                </div>
              </div>

              {/* Benefits */}
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-1.5">
                <div className="text-[11px] font-bold text-emerald-900 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  Korzyści z instalacji:
                </div>
                <ul className="text-[11px] text-emerald-800 space-y-1 list-disc list-inside">
                  <li>Działa jak natywna aplikacja bez pasków adresu przeglądarki</li>
                  <li>Błyskawiczny dostęp z ekranu głównego telefonu</li>
                  <li>Dostęp do zapisanych zadań i widoków w trybie offline</li>
                  <li>Automatyczna synchronizacja z Google Calendar i Google Tasks</li>
                </ul>
              </div>
            </div>
          )}

          {isIOS && (
            <div className="pt-2 border-t border-neutral-100 text-[11px] text-neutral-500">
              Używasz systemu iOS? W przeglądarce Safari kliknij ikonę <strong>Udostępnij</strong>, a następnie <strong>Dodaj do ekranu początkowego</strong>.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-neutral-50 border-t border-neutral-100 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60 rounded-xl transition cursor-pointer"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
};

export const PWAInstallBanner: React.FC<PWAInstallBannerProps> = () => {
  return null;
};

export const PWAInstallNavbarButton: React.FC = () => {
  const { isInstalled, hasNativePrompt, isAndroid, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (hasNativePrompt) {
      await install();
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        id="btn-pwa-install"
        onClick={handleClick}
        className="inline-flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 shadow-2xs transition cursor-pointer"
        title="Zainstaluj aplikację na urządzeniu mobilnym (Android/PWA)"
      >
        <Smartphone className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        <span className="hidden sm:inline">
          {isAndroid ? 'Zainstaluj (Android)' : 'Zainstaluj'}
        </span>
        <span className="sm:hidden">Instaluj</span>
      </button>

      <PWAInstallModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 text-white px-3 py-2 text-xs font-semibold shadow-xl border border-amber-400 animate-in slide-in-from-bottom">
      <WifiOff className="w-4 h-4 text-white animate-pulse" />
      <span>Tryb offline – dane pobierane z pamięci lokalnej</span>
    </div>
  );
};
