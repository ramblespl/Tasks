import React, { useState } from 'react';
import {
  Calendar,
  ListTodo,
  Shield,
  Sparkles,
  ExternalLink,
  Key,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Smartphone,
  Check,
} from 'lucide-react';
import {
  isRememberDeviceEnabled,
  setRememberDevice,
  getStoredAuth,
} from '../services/firebaseAuth';

interface LoginViewProps {
  onSignIn: () => void;
  onManualToken?: (token: string) => void;
  isSigningIn: boolean;
  errorMessage: string | null;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onSignIn,
  onManualToken,
  isSigningIn,
  errorMessage,
}) => {
  const [showManualToken, setShowManualToken] = useState(false);
  const [manualTokenInput, setManualTokenInput] = useState('');
  const [rememberDevice, setRememberDeviceState] = useState<boolean>(() => isRememberDeviceEnabled());
  const savedAuth = getStoredAuth();

  const handleToggleRemember = (checked: boolean) => {
    setRememberDeviceState(checked);
    setRememberDevice(checked);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualTokenInput.trim() && onManualToken) {
      onManualToken(manualTokenInput.trim());
    }
  };

  const isIframe = window.self !== window.top;

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-white rounded-3xl border border-neutral-200/90 shadow-xl shadow-neutral-200/40 p-6 sm:p-10 space-y-7 text-center animate-in fade-in zoom-in-95">
        {/* Brand Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/30">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight">
            Zadania i Kalendarz
          </h2>
          <p className="text-sm sm:text-base text-neutral-600 max-w-md mx-auto leading-relaxed">
            Inteligentne planowanie i organizacja wszystkich Twoich zadań oraz wydarzeń w kalendarzu z pełną synchronizacją z Google Calendar i Google Tasks.
          </p>
        </div>

        {/* Value Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
          <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-100/80 space-y-1">
            <div className="flex items-center space-x-1.5 text-blue-700 font-semibold text-xs">
              <Calendar className="w-4 h-4" />
              <span>Kalendarz Google</span>
            </div>
            <p className="text-[11px] text-neutral-600 leading-snug">
              Przeglądaj i planuj wydarzenia, spotkania i terminy w jednym miejscu.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-100/80 space-y-1">
            <div className="flex items-center space-x-1.5 text-emerald-700 font-semibold text-xs">
              <ListTodo className="w-4 h-4" />
              <span>Google Tasks</span>
            </div>
            <p className="text-[11px] text-neutral-600 leading-snug">
              Twórz zadania, organizuj je w listach i kontroluj terminy wykonania.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-purple-50/70 border border-purple-100/80 space-y-1">
            <div className="flex items-center space-x-1.5 text-purple-700 font-semibold text-xs">
              <Sparkles className="w-4 h-4" />
              <span>Gotowe szablony</span>
            </div>
            <p className="text-[11px] text-neutral-600 leading-snug">
              Twórz zestawy powtarzalnych zadań i generuj je jednym kliknięciem.
            </p>
          </div>
        </div>

        {/* Error notification if any */}
        {errorMessage && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 text-left space-y-2">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Błąd połączenia z kontem Google</p>
                <p className="text-rose-700 leading-relaxed">{errorMessage}</p>
              </div>
            </div>

            <div className="pt-2 border-t border-rose-200/60 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onSignIn}
                disabled={isSigningIn}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white font-medium hover:bg-rose-700 text-xs transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Spróbuj ponownie</span>
              </button>

              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-rose-300 text-rose-800 font-medium hover:bg-rose-50 text-xs transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Otwórz w nowej karcie</span>
              </a>
            </div>
          </div>
        )}

        {/* Saved session quick resume if available */}
        {savedAuth?.user && savedAuth.user.displayName && (
          <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl flex items-center justify-between gap-3 text-left animate-in fade-in">
            <div className="flex items-center space-x-3 min-w-0">
              {savedAuth.user.photoURL ? (
                <img
                  src={savedAuth.user.photoURL}
                  alt=""
                  className="w-9 h-9 rounded-full border border-blue-200 object-cover shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {savedAuth.user.displayName[0] || 'U'}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-bold text-neutral-900 truncate">
                    {savedAuth.user.displayName}
                  </span>
                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800">
                    Zapamiętane
                  </span>
                </div>
                <p className="text-[11px] text-neutral-600 truncate">{savedAuth.user.email}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onSignIn}
              disabled={isSigningIn}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold rounded-xl shrink-0 transition shadow-2xs cursor-pointer disabled:opacity-50"
            >
              Wznów &rarr;
            </button>
          </div>
        )}

        {/* Official Google Sign-in Button */}
        <div className="pt-1 flex flex-col items-center space-y-3">
          <button
            id="btn-google-signin"
            type="button"
            onClick={onSignIn}
            disabled={isSigningIn}
            className="w-full sm:w-auto inline-flex items-center justify-center space-x-3 px-7 py-3.5 rounded-xl border border-neutral-300 bg-white hover:bg-neutral-50 active:scale-98 shadow-sm hover:shadow text-sm font-semibold text-neutral-800 transition-all disabled:opacity-60 cursor-pointer"
          >
            {isSigningIn ? (
              <div className="flex items-center space-x-2 text-neutral-600">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span>Łączenie z Google...</span>
              </div>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 48 48">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                  <path fill="none" d="M0 0h48v48H0z" />
                </svg>
                <span>Zaloguj się przez Google</span>
              </>
            )}
          </button>

          {/* Zapamiętaj logowanie na tym urządzeniu Checkbox */}
          <div className="w-full max-w-sm pt-1 pb-1">
            <label className="flex items-center justify-center space-x-2 text-xs text-neutral-700 hover:text-neutral-900 cursor-pointer select-none">
              <input
                id="checkbox-remember-device"
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => handleToggleRemember(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
              <span className="font-medium text-neutral-800">
                Zapamiętaj logowanie na tym urządzeniu
              </span>
            </label>
            <p className="text-[11px] text-neutral-500 text-center leading-snug mt-1">
              Sesja i autoryzacja Google Calendar oraz Tasks pozostaną aktywne przy kolejnych wizytach.
            </p>
          </div>

          {isIframe && (
            <div className="flex items-center space-x-1.5 text-xs text-blue-600 hover:text-blue-700">
              <ExternalLink className="w-3.5 h-3.5" />
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline font-medium"
              >
                Otwórz w nowej karcie (zalecane, jeśli wyskakujące okienka są blokowane)
              </a>
            </div>
          )}

          <p className="text-[11px] text-neutral-400 flex items-center justify-center space-x-1">
            <Shield className="w-3 h-3 text-neutral-400" />
            <span>Bezpieczna autoryzacja Google OAuth (Google Calendar + Google Tasks)</span>
          </p>

          {/* Collapsible Manual Token Option */}
          {onManualToken && (
            <div className="pt-2 w-full">
              <button
                type="button"
                onClick={() => setShowManualToken(!showManualToken)}
                className="text-xs text-neutral-500 hover:text-neutral-700 inline-flex items-center space-x-1 transition cursor-pointer"
              >
                <Key className="w-3 h-3" />
                <span>Zaawansowane: połącz za pomocą tokenu OAuth</span>
                {showManualToken ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>

              {showManualToken && (
                <form
                  onSubmit={handleManualSubmit}
                  className="mt-3 p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200 text-left space-y-2.5 animate-in fade-in"
                >
                  <label className="block text-xs font-semibold text-neutral-700">
                    Google OAuth Access Token (Bearer)
                  </label>
                  <p className="text-[11px] text-neutral-500 leading-snug">
                    Możesz podać bezpośredni token z Google OAuth 2.0 Playground z uprawnieniami do Calendar i Tasks, jeśli okno logowania jest blokowane przez Twoją przeglądarkę.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder="ya29.a0..."
                      value={manualTokenInput}
                      onChange={(e) => setManualTokenInput(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-neutral-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={!manualTokenInput.trim() || isSigningIn}
                      className="px-3 py-1.5 bg-neutral-900 text-white text-xs font-semibold rounded-lg hover:bg-neutral-800 disabled:opacity-50 cursor-pointer"
                    >
                      Połącz
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
