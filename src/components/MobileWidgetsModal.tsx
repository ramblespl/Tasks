import React, { useState } from 'react';
import {
  X,
  LayoutDashboard,
  Calendar,
  CalendarDays,
  CalendarCheck,
  CalendarRange,
  ListTodo,
  Sliders,
  Play,
  Smartphone,
  Share2,
  Copy,
  Check,
  ExternalLink,
  Info,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { CalendarListItem, GoogleTaskList } from '../types';
import {
  WidgetConfig,
  WidgetId,
  getWidgetConfigs,
  saveWidgetConfig,
  resetWidgetConfig,
  getWidgetUrl,
} from '../services/widgetStorage';
import { WidgetEditModal } from './WidgetEditModal';

interface MobileWidgetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  calendars: CalendarListItem[];
  taskLists: GoogleTaskList[];
  onLaunchWidget: (config: WidgetConfig) => void;
}

export const MobileWidgetsModal: React.FC<MobileWidgetsModalProps> = ({
  isOpen,
  onClose,
  calendars,
  taskLists,
  onLaunchWidget,
}) => {
  const [configs, setConfigs] = useState<Record<WidgetId, WidgetConfig>>(() => getWidgetConfigs());
  const [editingWidget, setEditingWidget] = useState<WidgetConfig | null>(null);
  const [instructionsWidget, setInstructionsWidget] = useState<WidgetConfig | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleOpenEdit = (config: WidgetConfig) => {
    setEditingWidget(config);
  };

  const handleSaveEdit = (updated: WidgetConfig) => {
    saveWidgetConfig(updated);
    setConfigs(getWidgetConfigs());
    setEditingWidget(null);
  };

  const handleResetEdit = (id: WidgetId) => {
    const res = resetWidgetConfig(id);
    setConfigs(getWidgetConfigs());
    setEditingWidget(res);
  };

  const handleCopyLink = async (widgetId: WidgetId) => {
    const url = getWidgetUrl(widgetId);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(widgetId);
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      // fallback
    }
  };

  const widgetsList: {
    id: WidgetId;
    icon: React.ReactNode;
    colorBg: string;
    colorText: string;
    borderHover: string;
  }[] = [
    {
      id: 'pulpit',
      icon: <LayoutDashboard className="w-5 h-5" />,
      colorBg: 'bg-blue-100 text-blue-700',
      colorText: 'text-blue-700',
      borderHover: 'hover:border-blue-400',
    },
    {
      id: 'cal_month',
      icon: <Calendar className="w-5 h-5" />,
      colorBg: 'bg-indigo-100 text-indigo-700',
      colorText: 'text-indigo-700',
      borderHover: 'hover:border-indigo-400',
    },
    {
      id: 'cal_week',
      icon: <CalendarDays className="w-5 h-5" />,
      colorBg: 'bg-sky-100 text-sky-700',
      colorText: 'text-sky-700',
      borderHover: 'hover:border-sky-400',
    },
    {
      id: 'cal_day',
      icon: <CalendarCheck className="w-5 h-5" />,
      colorBg: 'bg-teal-100 text-teal-700',
      colorText: 'text-teal-700',
      borderHover: 'hover:border-teal-400',
    },
    {
      id: 'cal_schedule',
      icon: <CalendarRange className="w-5 h-5" />,
      colorBg: 'bg-purple-100 text-purple-700',
      colorText: 'text-purple-700',
      borderHover: 'hover:border-purple-400',
    },
    {
      id: 'tasks',
      icon: <ListTodo className="w-5 h-5" />,
      colorBg: 'bg-emerald-100 text-emerald-700',
      colorText: 'text-emerald-700',
      borderHover: 'hover:border-emerald-400',
    },
  ];

  const getDueSummary = (due: WidgetConfig['dateRangeFilter']) => {
    switch (due) {
      case 'all':
        return 'Wszystkie terminy';
      case 'today':
        return 'Tylko dzisiaj';
      case 'next7days':
        return 'Najbliższe 7 dni';
      case 'next30days':
        return 'Najbliższe 30 dni';
      case 'hasDueOnly':
        return 'Tylko z terminem';
      default:
        return 'Wszystkie';
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-3xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl border border-neutral-200 flex flex-col max-h-[92vh] overflow-hidden text-left animate-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-3.5 border-b border-neutral-100 shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-neutral-900 leading-tight flex items-center gap-2">
                  Widgety na urządzeniach mobilnych
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Dodaj bezpośrednie widgety i skróty na ekran główny telefonu po zainstalowaniu aplikacji
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Guide Banner */}
          <div className="my-3 p-3 bg-gradient-to-r from-blue-50 via-indigo-50/60 to-purple-50 rounded-2xl border border-blue-100 shrink-0 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-[11px] sm:text-xs text-neutral-700 space-y-1 leading-snug">
              <p className="font-semibold text-blue-900">
                Jak działają widgety na telefonie (Android & iOS):
              </p>
              <p>
                <strong>Na Androidzie:</strong> po zainstalowaniu aplikacji przytrzymaj palec na ikonie <em>Zadania</em> na pulpicie telefonu — pojawi się lista skrótów/widgetów, które możesz przeciągnąć bezpośrednio na ekran główny!
              </p>
              <p className="text-neutral-600">
                Możesz także kliknąć <strong>Uruchom widget</strong> lub <strong>Utwórz skrót</strong> i dodać stronę z menu przeglądarki Chrome/Safari.
              </p>
            </div>
          </div>

          {/* Widgets Grid */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {widgetsList.map((item) => {
                const conf = configs[item.id];
                if (!conf) return null;

                const calsSummary = conf.allCalendars
                  ? 'Wszystkie kalendarze'
                  : `${conf.selectedCalendarIds.length} wybrane`;

                const tasksSummary = conf.allTaskLists
                  ? 'Wszystkie listy zadań'
                  : `${conf.selectedTaskListIds.length} wybrane`;

                const dueSummary = getDueSummary(conf.dateRangeFilter);

                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-2xl p-3.5 border border-neutral-200/90 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between ${item.borderHover}`}
                  >
                    <div>
                      {/* Card Top: Icon & Title */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${item.colorBg}`}
                          >
                            {item.icon}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-xs sm:text-sm font-bold text-neutral-900 truncate">
                              {conf.name}
                            </h3>
                            <p className="text-[10px] sm:text-[11px] text-neutral-500 truncate">
                              {conf.description}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Config summary pills */}
                      <div className="bg-neutral-50 rounded-xl p-2.5 my-2 border border-neutral-150 space-y-1 text-[11px]">
                        <div className="flex items-center justify-between text-neutral-600">
                          <span className="font-medium">📅 Kalendarze:</span>
                          <span className="font-bold text-neutral-800">{calsSummary}</span>
                        </div>
                        <div className="flex items-center justify-between text-neutral-600">
                          <span className="font-medium">📝 Listy zadań:</span>
                          <span className="font-bold text-neutral-800">{tasksSummary}</span>
                        </div>
                        <div className="flex items-center justify-between text-neutral-600">
                          <span className="font-medium">⏱ Terminy:</span>
                          <span className="font-bold text-neutral-800">{dueSummary}</span>
                        </div>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-neutral-100 gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(conf)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition cursor-pointer"
                        title="Dostosuj widoczność kalendarzy, list zadań i terminów"
                      >
                        <Sliders className="w-3.5 h-3.5 text-neutral-600" />
                        <span>Edytuj</span>
                      </button>

                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => setInstructionsWidget(conf)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 transition cursor-pointer"
                          title="Instrukcja dodania na ekran telefonu"
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          <span>Pulpit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onLaunchWidget(conf);
                            onClose();
                          }}
                          className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-2xs transition cursor-pointer active:scale-95"
                          title="Otwórz ten widget z zapisanymi ustawieniami"
                        >
                          <Play className="w-3 h-3 fill-white" />
                          <span>Uruchom</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-neutral-100 shrink-0 text-xs text-neutral-500">
            <span>Zapisane ustawienia widgetów są zapamiętywane na Twoim urządzeniu.</span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 rounded-lg cursor-pointer"
            >
              Zamknij
            </button>
          </div>
        </div>
      </div>

      {/* Editor Modal */}
      {editingWidget && (
        <WidgetEditModal
          isOpen={!!editingWidget}
          config={editingWidget}
          calendars={calendars}
          taskLists={taskLists}
          onClose={() => setEditingWidget(null)}
          onSave={handleSaveEdit}
          onReset={handleResetEdit}
        />
      )}

      {/* Instructions / Shortcut Sheet */}
      {instructionsWidget && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setInstructionsWidget(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-neutral-200 text-left animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-neutral-900">
                    Utwórz widget: {instructionsWidget.name}
                  </h4>
                  <p className="text-[11px] text-neutral-500">
                    Instrukcja dodania na ekran telefonu
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInstructionsWidget(null)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 my-4 text-xs text-neutral-700 leading-relaxed">
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 space-y-1.5">
                <p className="font-bold text-neutral-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold inline-flex items-center justify-center">
                    1
                  </span>
                  Szybki skrót z ikony aplikacji (Android)
                </p>
                <p className="text-neutral-600 pl-6.5">
                  Przytrzymaj dłużej palec na ikonie aplikacji <strong>Zadania</strong> na ekranie głównym. Z rozwijanego menu wybierz <strong>{instructionsWidget.name}</strong> i przeciągnij na swój pulpit.
                </p>
              </div>

              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 space-y-1.5">
                <p className="font-bold text-neutral-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold inline-flex items-center justify-center">
                    2
                  </span>
                  Dodaj jako bezpośredni skrót z przeglądarki
                </p>
                <p className="text-neutral-600 pl-6.5">
                  Otwórz poniższy link widgetu, a następnie w menu przeglądarki (trzy kropki w Chrome lub ikona udostępniania w Safari) wybierz opcję <strong>„Dodaj do ekranu głównego”</strong>.
                </p>
              </div>

              {/* Direct Link & Copy */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-[11px] font-semibold text-neutral-700">
                  Bezpośredni adres URL tego widgetu:
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={getWidgetUrl(instructionsWidget.id)}
                    className="flex-1 text-[11px] font-mono bg-neutral-100 p-2 rounded-lg border border-neutral-200 text-neutral-700 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopyLink(instructionsWidget.id)}
                    className="px-3 py-2 bg-neutral-800 hover:bg-neutral-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition shrink-0"
                  >
                    {copiedId === instructionsWidget.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Skopiowano</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Kopiuj</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setInstructionsWidget(null)}
                className="px-3.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg cursor-pointer"
              >
                Zamknij
              </button>
              <button
                type="button"
                onClick={() => {
                  onLaunchWidget(instructionsWidget);
                  setInstructionsWidget(null);
                  onClose();
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5 transition"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Otwórz teraz ten widget</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
