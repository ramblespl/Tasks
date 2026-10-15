import React, { useState, useRef, useEffect } from 'react';
import {
  Plane,
  LogOut,
  CheckCircle2,
  Calendar,
  ListTodo,
  User,
  LayoutDashboard,
  Layers,
  RotateCcw,
  RotateCw,
  History,
  Trash2,
  Smartphone,
} from 'lucide-react';
import { useUndo } from '../context/UndoContext';
import { GoogleUser, CalendarListItem, GoogleTaskList } from '../types';
import { PWAInstallNavbarButton } from './PWAInstallBanner';

export type AppNavTab = 'dashboard' | 'calendar' | 'tasks' | 'templates';

interface NavbarProps {
  user: GoogleUser | null;
  onLogout: () => void;
  calendar: CalendarListItem | null;
  taskList: GoogleTaskList | null;
  isSyncing: boolean;
  activeTab?: AppNavTab;
  onSelectTab?: (tab: AppNavTab) => void;
  eventsCount?: number;
  tasksCount?: number;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  onOpenWidgetsModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onLogout,
  calendar,
  taskList,
  isSyncing,
  activeTab = 'dashboard',
  onSelectTab,
  eventsCount = 0,
  tasksCount = 0,
  onOpenWidgetsModal,
}) => {
  const { undoStack, redoStack, canUndo, canRedo, undo, redo, isPerformingUndo, clearHistory } = useUndo();
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistoryModal(false);
      }
    };
    if (showHistoryModal) {
      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }
  }, [showHistoryModal]);

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-neutral-200 sticky top-0 z-40 w-full shadow-xs">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 md:px-6 lg:px-8 w-full">
        {/* Main top row */}
        <div className="flex items-center justify-between min-h-[52px] sm:h-16 py-1.5 sm:py-0 gap-1.5 sm:gap-3 w-full">
          {/* Logo & Title */}
          <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <Plane className="w-4 h-4 sm:w-5 sm:h-5 -rotate-45" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <h1 className="text-sm sm:text-base lg:text-lg font-bold text-neutral-900 tracking-tight whitespace-nowrap">
                  Zadania
                </h1>
                <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                  Google Workspace
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 hidden xl:block leading-none">
                Kalendarz &amp; Zadania Google
              </p>
            </div>
          </div>

          {/* Desktop Center: Navigation Tabs (widoczne na ekranach lg i większych) */}
          {user && onSelectTab && (
            <nav className="hidden lg:flex items-center space-x-1 bg-neutral-100/90 p-1 rounded-xl border border-neutral-250 shrink-0">
              <button
                type="button"
                id="tab-nav-dashboard"
                onClick={() => onSelectTab('dashboard')}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-white text-neutral-900 shadow-2xs border border-neutral-200/80 font-bold'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50'
                }`}
                title="Pulpit główny (skrót: p)"
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Pulpit</span>
              </button>

              <button
                type="button"
                id="tab-nav-calendar"
                onClick={() => onSelectTab('calendar')}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'calendar'
                    ? 'bg-white text-blue-700 shadow-2xs border border-neutral-200/80 font-bold'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50'
                }`}
                title="Widok kalendarza (skrót: k)"
              >
                <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Kalendarz</span>
                {eventsCount > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      activeTab === 'calendar'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-neutral-200 text-neutral-700'
                    }`}
                  >
                    {eventsCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                id="tab-nav-tasks"
                onClick={() => onSelectTab('tasks')}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'tasks'
                    ? 'bg-white text-emerald-700 shadow-2xs border border-neutral-200/80 font-bold'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50'
                }`}
                title="Widok zadań (skrót: z)"
              >
                <ListTodo className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Zadania</span>
                {tasksCount !== undefined && tasksCount > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      activeTab === 'tasks'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-neutral-200 text-neutral-700'
                    }`}
                  >
                    {tasksCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                id="tab-nav-templates"
                onClick={() => onSelectTab('templates')}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'templates'
                    ? 'bg-white text-neutral-900 shadow-2xs border border-neutral-200/80 font-bold'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50'
                }`}
                title="Szablony zadań (skrót: s)"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Szablony</span>
              </button>
            </nav>
          )}

          {/* Right side: PWA Install, Undo & Redo Controls, User profile, and Logout */}
          <div className="flex items-center space-x-1 sm:space-x-2 shrink-0 ml-auto">
            {onOpenWidgetsModal && (
              <button
                type="button"
                id="btn-nav-widgets"
                onClick={onOpenWidgetsModal}
                className="inline-flex items-center space-x-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 bg-white hover:bg-neutral-50 active:bg-neutral-100 text-neutral-700 border border-neutral-250 rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer hover:border-blue-300 hover:text-blue-700 active:scale-95"
                title="Widgety na ekranie głównym telefonu (Pulpit, Kalendarz, Zadania)"
              >
                <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden xs:inline">Widgety</span>
              </button>
            )}

            <PWAInstallNavbarButton />

            {user && (
              <>
                {/* Przycisk cofnij / ponów umieszczony na wysokości przycisku wylogowania z prawej strony ekranu */}
                <div
                  className="flex items-center space-x-0.5 sm:space-x-1 bg-neutral-100/90 p-0.5 sm:p-1 rounded-xl border border-neutral-250 relative shrink-0"
                  ref={historyRef}
                >
                <button
                  type="button"
                  id="btn-nav-undo"
                  onClick={undo}
                  disabled={!canUndo || isPerformingUndo}
                  className={`inline-flex items-center space-x-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    canUndo && !isPerformingUndo
                      ? 'bg-white text-neutral-800 hover:text-blue-700 hover:bg-neutral-50 shadow-2xs border border-neutral-200/80'
                      : 'text-neutral-400 opacity-40 cursor-not-allowed'
                  }`}
                  title={
                    canUndo
                      ? `Cofnij: ${undoStack[0]?.title} (Ctrl+Z)`
                      : 'Brak akcji do cofnięcia (Ctrl+Z)'
                  }
                >
                  <RotateCcw
                    className={`w-3.5 h-3.5 ${isPerformingUndo ? 'animate-spin text-blue-600' : 'text-neutral-700'}`}
                  />
                  <span className="hidden sm:inline">Cofnij</span>
                  {undoStack.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-blue-100 text-blue-800 leading-none">
                      {undoStack.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  id="btn-nav-redo"
                  onClick={redo}
                  disabled={!canRedo || isPerformingUndo}
                  className={`inline-flex items-center space-x-1 px-1.5 sm:px-2 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    canRedo && !isPerformingUndo
                      ? 'bg-white text-neutral-800 hover:text-blue-700 hover:bg-neutral-50 shadow-2xs border border-neutral-200/80'
                      : 'text-neutral-400 opacity-40 cursor-not-allowed'
                  }`}
                  title={
                    canRedo
                      ? `Ponów: ${redoStack[0]?.title} (Ctrl+Y)`
                      : 'Brak akcji do ponowienia (Ctrl+Y)'
                  }
                >
                  <RotateCw className="w-3.5 h-3.5 text-neutral-700" />
                  <span className="hidden sm:inline">Ponów</span>
                </button>

                {undoStack.length > 0 && (
                  <button
                    type="button"
                    id="btn-nav-history"
                    onClick={() => setShowHistoryModal((p) => !p)}
                    className="p-1 sm:p-1.5 rounded-lg text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200/60 transition cursor-pointer"
                    title="Historia operacji cofania"
                  >
                    <History className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Dropdown history menu */}
                {showHistoryModal && (
                  <div className="absolute top-full mt-2 right-0 w-72 sm:w-80 bg-white rounded-2xl shadow-xl border border-neutral-200 p-3 z-50 animate-in fade-in zoom-in-95">
                    <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                      <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-blue-600" />
                        Historia operacji
                      </span>
                      <button
                        type="button"
                        onClick={clearHistory}
                        className="text-[10px] text-neutral-400 hover:text-red-600 flex items-center gap-1 transition cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        Wyczyść
                      </button>
                    </div>

                    <div className="mt-2 space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {undoStack.map((item, idx) => (
                        <div
                          key={item.id}
                          className={`p-2 rounded-xl text-xs flex items-center justify-between ${
                            idx === 0
                              ? 'bg-blue-50/80 border border-blue-200/80 text-blue-900 font-medium'
                              : 'bg-neutral-50 text-neutral-700 hover:bg-neutral-100'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <p className="truncate font-medium">{item.title}</p>
                            <span className="text-[10px] text-neutral-400 block">
                              {new Date(item.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </span>
                          </div>
                          {idx === 0 && (
                            <button
                              type="button"
                              onClick={async () => {
                                await undo();
                              }}
                              className="shrink-0 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                            >
                              Cofnij
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Integration Status Badges */}
              <div className="hidden xl:flex items-center space-x-2">
                <div
                  className="flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700 border border-neutral-200"
                  title={`Połączony kalendarz: ${calendar?.summary || 'Wyszukiwanie...'}`}
                >
                  <Calendar className="w-3 h-3 text-blue-600" />
                  <span className="truncate max-w-[100px]">
                    {calendar ? calendar.summary : 'Kalendarz'}
                  </span>
                  {calendar && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                </div>

                <div
                  className="flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700 border border-neutral-200"
                  title={`Lista zadań Google: ${taskList?.title || 'Wszystkie'}`}
                >
                  <ListTodo className="w-3 h-3 text-emerald-600" />
                  <span className="truncate max-w-[100px]">
                    {taskList ? taskList.title : 'Zadania'}
                  </span>
                  {taskList && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                </div>
              </div>

              {/* User profile avatar */}
              <div className="flex items-center space-x-1.5 sm:space-x-2 pl-1 sm:pl-2 border-l border-neutral-200">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Użytkownik'}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-neutral-300 object-cover shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-600 shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                )}
                <div className="hidden 2xl:block text-left text-xs leading-tight">
                  <p className="font-semibold text-neutral-800 truncate max-w-[120px]">
                    {user.displayName || 'Zalogowany'}
                  </p>
                  <p className="text-neutral-500 truncate max-w-[120px] text-[11px]">
                    {user.email}
                  </p>
                </div>
              </div>

              {/* Logout button */}
              <button
                id="btn-logout"
                onClick={onLogout}
                className="inline-flex items-center space-x-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 py-1.5 px-2 sm:px-3 rounded-lg transition-colors cursor-pointer shrink-0"
                title="Wyloguj z aplikacji"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Wyloguj</span>
              </button>
            </>
          )}
        </div>
      </div>

        {/* Mobile Navigation bar: szerokość paska wyboru sekcji dostosowana do ekranu, bez obcinania */}
        {user && onSelectTab && (
          <div className="lg:hidden w-full pb-1.5 pt-0.5">
            <nav className="w-full grid grid-cols-4 gap-1 bg-neutral-100/90 p-1 rounded-xl border border-neutral-250">
              <button
                type="button"
                id="tab-nav-dashboard-mobile"
                onClick={() => onSelectTab('dashboard')}
                className={`flex flex-col sm:flex-row items-center justify-center space-y-0.5 sm:space-y-0 sm:space-x-1 px-1 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-white text-neutral-900 shadow-2xs border border-neutral-200/80 font-bold'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50'
                }`}
                title="Pulpit główny (skrót: p)"
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">Pulpit</span>
              </button>

              <button
                type="button"
                id="tab-nav-calendar-mobile"
                onClick={() => onSelectTab('calendar')}
                className={`flex flex-col sm:flex-row items-center justify-center space-y-0.5 sm:space-y-0 sm:space-x-1 px-1 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'calendar'
                    ? 'bg-white text-blue-700 shadow-2xs border border-neutral-200/80 font-bold'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50'
                }`}
                title="Widok kalendarza (skrót: k)"
              >
                <div className="flex items-center space-x-0.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  {eventsCount > 0 && (
                    <span
                      className={`text-[9px] px-1 py-0.1 rounded-full font-bold ${
                        activeTab === 'calendar'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-neutral-200 text-neutral-700'
                      }`}
                    >
                      {eventsCount}
                    </span>
                  )}
                </div>
                <span className="truncate">Kalendarz</span>
              </button>

              <button
                type="button"
                id="tab-nav-tasks-mobile"
                onClick={() => onSelectTab('tasks')}
                className={`flex flex-col sm:flex-row items-center justify-center space-y-0.5 sm:space-y-0 sm:space-x-1 px-1 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'tasks'
                    ? 'bg-white text-emerald-700 shadow-2xs border border-neutral-200/80 font-bold'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50'
                }`}
                title="Widok zadań (skrót: z)"
              >
                <div className="flex items-center space-x-0.5">
                  <ListTodo className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  {tasksCount !== undefined && tasksCount > 0 && (
                    <span
                      className={`text-[9px] px-1 py-0.1 rounded-full font-bold ${
                        activeTab === 'tasks'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-neutral-200 text-neutral-700'
                      }`}
                    >
                      {tasksCount}
                    </span>
                  )}
                </div>
                <span className="truncate">Zadania</span>
              </button>

              <button
                type="button"
                id="tab-nav-templates-mobile"
                onClick={() => onSelectTab('templates')}
                className={`flex flex-col sm:flex-row items-center justify-center space-y-0.5 sm:space-y-0 sm:space-x-1 px-1 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'templates'
                    ? 'bg-white text-neutral-900 shadow-2xs border border-neutral-200/80 font-bold'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50'
                }`}
                title="Szablony zadań (skrót: s)"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="truncate">Szablony</span>
              </button>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};
