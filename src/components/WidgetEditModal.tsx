import React, { useState, useEffect } from 'react';
import {
  X,
  Sliders,
  Calendar as CalendarIcon,
  ListTodo,
  Clock,
  RotateCcw,
  Check,
  CheckSquare,
  Square,
  Sparkles,
} from 'lucide-react';
import { CalendarListItem, GoogleTaskList } from '../types';
import { ALL_CALENDARS_ID } from '../services/googleCalendarApi';
import { ALL_TASK_LISTS_ID } from '../services/googleTasksApi';
import {
  WidgetConfig,
  WidgetDateRangeOption,
} from '../services/widgetStorage';

interface WidgetEditModalProps {
  isOpen: boolean;
  config: WidgetConfig | null;
  calendars: CalendarListItem[];
  taskLists: GoogleTaskList[];
  onClose: () => void;
  onSave: (updated: WidgetConfig) => void;
  onReset: (id: WidgetConfig['id']) => void;
}

export const WidgetEditModal: React.FC<WidgetEditModalProps> = ({
  isOpen,
  config,
  calendars,
  taskLists,
  onClose,
  onSave,
  onReset,
}) => {
  const [draft, setDraft] = useState<WidgetConfig | null>(null);
  const [activeTab, setActiveTab] = useState<'calendars' | 'tasks' | 'due'>('calendars');

  useEffect(() => {
    if (config) {
      setDraft({ ...config });
    }
  }, [config]);

  if (!isOpen || !draft) return null;

  const validCalendars = calendars.filter((c) => c.id !== ALL_CALENDARS_ID);
  const validTaskLists = taskLists.filter((tl) => tl.id !== ALL_TASK_LISTS_ID);

  const handleToggleCalendar = (id: string) => {
    setDraft((prev) => {
      if (!prev) return null;
      let current = [...prev.selectedCalendarIds];
      if (prev.allCalendars) {
        // If it was all calendars, turn off allCalendars and start with all minus this one, or only this one
        current = validCalendars.map((c) => c.id).filter((cId) => cId !== id);
        return {
          ...prev,
          allCalendars: false,
          selectedCalendarIds: current,
        };
      }
      if (current.includes(id)) {
        current = current.filter((cId) => cId !== id);
      } else {
        current.push(id);
      }
      return {
        ...prev,
        allCalendars: current.length === validCalendars.length,
        selectedCalendarIds: current,
      };
    });
  };

  const handleSelectAllCalendars = () => {
    setDraft((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        allCalendars: true,
        selectedCalendarIds: validCalendars.map((c) => c.id),
      };
    });
  };

  const handleClearAllCalendars = () => {
    setDraft((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        allCalendars: false,
        selectedCalendarIds: [],
      };
    });
  };

  const handleToggleTaskList = (id: string) => {
    setDraft((prev) => {
      if (!prev) return null;
      let current = [...prev.selectedTaskListIds];
      if (prev.allTaskLists) {
        current = validTaskLists.map((t) => t.id).filter((tId) => tId !== id);
        return {
          ...prev,
          allTaskLists: false,
          selectedTaskListIds: current,
        };
      }
      if (current.includes(id)) {
        current = current.filter((tId) => tId !== id);
      } else {
        current.push(id);
      }
      return {
        ...prev,
        allTaskLists: current.length === validTaskLists.length,
        selectedTaskListIds: current,
      };
    });
  };

  const handleSelectAllTaskLists = () => {
    setDraft((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        allTaskLists: true,
        selectedTaskListIds: validTaskLists.map((t) => t.id),
      };
    });
  };

  const handleClearAllTaskLists = () => {
    setDraft((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        allTaskLists: false,
        selectedTaskListIds: [],
      };
    });
  };

  const handleSave = () => {
    if (draft) {
      onSave(draft);
      onClose();
    }
  };

  const handleResetToDefault = () => {
    if (draft) {
      onReset(draft.id);
      onClose();
    }
  };

  const isCalSelected = (calId: string) => {
    if (draft.allCalendars) return true;
    return draft.selectedCalendarIds.includes(calId);
  };

  const isListSelected = (listId: string) => {
    if (draft.allTaskLists) return true;
    return draft.selectedTaskListIds.includes(listId);
  };

  const dueOptions: { id: WidgetDateRangeOption; label: string; desc: string }[] = [
    {
      id: 'all',
      label: 'Wszystkie terminy',
      desc: 'Wyświetlaj zadania i wydarzenia ze wszystkich terminów (w tym przeszłe i odległe)',
    },
    {
      id: 'today',
      label: 'Tylko dzisiaj',
      desc: 'Pokazuj wyłącznie pozycje zaplanowane na dzisiejszy dzień',
    },
    {
      id: 'next7days',
      label: 'Najbliższe 7 dni',
      desc: 'Zakres od dzisiaj do najbliższego tygodnia włącznie',
    },
    {
      id: 'next30days',
      label: 'Najbliższe 30 dni',
      desc: 'Zakres nadchodzącego miesiąca',
    },
    {
      id: 'hasDueOnly',
      label: 'Tylko z przypisanym terminem',
      desc: 'Ukryj zadania bez ustalonej daty wykonania',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-neutral-200 flex flex-col max-h-[92vh] overflow-hidden text-left animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-neutral-100 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900 leading-tight">
                Edycja widgetu: {draft.name}
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Dostosuj widoczność kalendarzy, list zadań oraz terminów
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs for Categories */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-neutral-100 rounded-xl my-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('calendars')}
            className={`flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === 'calendars'
                ? 'bg-white text-blue-700 shadow-2xs font-bold'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Kalendarze</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={`flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === 'tasks'
                ? 'bg-white text-emerald-700 shadow-2xs font-bold'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <ListTodo className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Listy zadań</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('due')}
            className={`flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === 'due'
                ? 'bg-white text-amber-700 shadow-2xs font-bold'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Terminy</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 min-h-[220px]">
          {activeTab === 'calendars' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-blue-50/70 p-2.5 rounded-xl border border-blue-100">
                <label className="flex items-center space-x-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={draft.allCalendars}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              allCalendars: checked,
                              selectedCalendarIds: checked ? validCalendars.map((c) => c.id) : [],
                            }
                          : null
                      );
                    }}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-blue-900">
                    Wszystkie kalendarze Google
                  </span>
                </label>
                <div className="space-x-2 text-[11px]">
                  <button
                    type="button"
                    onClick={handleSelectAllCalendars}
                    className="text-blue-700 hover:underline font-medium cursor-pointer"
                  >
                    Wszystkie
                  </button>
                  <span className="text-neutral-300">•</span>
                  <button
                    type="button"
                    onClick={handleClearAllCalendars}
                    className="text-neutral-500 hover:underline cursor-pointer"
                  >
                    Odznacz
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider px-1">
                  Wybierz kalendarze widoczne na widgecie:
                </p>
                {validCalendars.length === 0 ? (
                  <p className="text-xs text-neutral-500 p-3 bg-neutral-50 rounded-xl text-center">
                    Brak połączonych kalendarzy
                  </p>
                ) : (
                  validCalendars.map((cal) => {
                    const checked = isCalSelected(cal.id);
                    return (
                      <label
                        key={cal.id}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer ${
                          checked
                            ? 'bg-white border-blue-300 shadow-2xs ring-1 ring-blue-500/10'
                            : 'bg-neutral-50/60 border-neutral-200 text-neutral-500 hover:bg-neutral-100/60'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          {checked ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-neutral-400 shrink-0" />
                          )}
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: cal.backgroundColor || '#2563eb' }}
                          />
                          <span className="text-xs font-semibold text-neutral-800 truncate">
                            {cal.summary} {cal.primary && '(Główny)'}
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleCalendar(cal.id)}
                          className="sr-only"
                        />
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-100">
                <label className="flex items-center space-x-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={draft.allTaskLists}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              allTaskLists: checked,
                              selectedTaskListIds: checked ? validTaskLists.map((t) => t.id) : [],
                            }
                          : null
                      );
                    }}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-emerald-900">
                    Wszystkie listy zadań Google
                  </span>
                </label>
                <div className="space-x-2 text-[11px]">
                  <button
                    type="button"
                    onClick={handleSelectAllTaskLists}
                    className="text-emerald-700 hover:underline font-medium cursor-pointer"
                  >
                    Wszystkie
                  </button>
                  <span className="text-neutral-300">•</span>
                  <button
                    type="button"
                    onClick={handleClearAllTaskLists}
                    className="text-neutral-500 hover:underline cursor-pointer"
                  >
                    Odznacz
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider px-1">
                  Wybierz listy zadań widoczne na widgecie:
                </p>
                {validTaskLists.length === 0 ? (
                  <p className="text-xs text-neutral-500 p-3 bg-neutral-50 rounded-xl text-center">
                    Brak list zadań
                  </p>
                ) : (
                  validTaskLists.map((tl) => {
                    const checked = isListSelected(tl.id);
                    return (
                      <label
                        key={tl.id}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer ${
                          checked
                            ? 'bg-white border-emerald-300 shadow-2xs ring-1 ring-emerald-500/10'
                            : 'bg-neutral-50/60 border-neutral-200 text-neutral-500 hover:bg-neutral-100/60'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          {checked ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-neutral-400 shrink-0" />
                          )}
                          <span className="text-xs font-semibold text-neutral-800 truncate">
                            {tl.title}
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleTaskList(tl.id)}
                          className="sr-only"
                        />
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'due' && (
            <div className="space-y-3">
              <div>
                <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider px-1 mb-2">
                  Zakres terminów do wyświetlenia:
                </p>
                <div className="space-y-2">
                  {dueOptions.map((opt) => {
                    const isSelected = draft.dateRangeFilter === opt.id;
                    return (
                      <label
                        key={opt.id}
                        className={`flex items-start space-x-2.5 p-3 rounded-xl border transition cursor-pointer ${
                          isSelected
                            ? 'bg-amber-50/80 border-amber-400 ring-1 ring-amber-500/20'
                            : 'bg-white border-neutral-250 hover:bg-neutral-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="widgetDateRange"
                          checked={isSelected}
                          onChange={() =>
                            setDraft((prev) => (prev ? { ...prev, dateRangeFilter: opt.id } : null))
                          }
                          className="mt-0.5 text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-neutral-900">{opt.label}</p>
                          <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">
                            {opt.desc}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Checkbox zadania bez terminu */}
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                <label className="flex items-center space-x-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={draft.includeNoDate}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setDraft((prev) => (prev ? { ...prev, includeNoDate: checked } : null));
                    }}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-neutral-800">
                      Uwzględniaj zadania bez ustalonego terminu
                    </span>
                    <p className="text-[10px] text-neutral-500">
                      Zadania bez daty pojawią się w sekcji zadań bezterminowych
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-3 border-t border-neutral-100 shrink-0 mt-2">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="inline-flex items-center space-x-1 text-xs text-neutral-500 hover:text-neutral-800 transition cursor-pointer"
            title="Przywróć domyślną konfigurację tego widgetu"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Domyślne</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg cursor-pointer"
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs flex items-center space-x-1.5 cursor-pointer transition active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>Zapisz ustawienia</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
