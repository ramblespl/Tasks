import React from 'react';
import {
  Plane,
  LogOut,
  CheckCircle2,
  Calendar,
  ListTodo,
  User,
  LayoutDashboard,
  Layers,
  MoreHorizontal,
} from 'lucide-react';
import { GoogleUser, CalendarListItem, GoogleTaskList } from '../types';

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
  isSidebarOpen = false,
  onToggleSidebar,
}) => {
  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-neutral-200 sticky top-0 z-40 w-full shadow-xs">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 md:px-6 lg:px-8 w-full">
        <div className="flex flex-wrap items-center justify-between min-h-[56px] sm:h-16 py-1.5 sm:py-0 gap-1.5 sm:gap-2 w-full">
          {/* Logo & Title (with 3-dots sidebar button for calendar and tasks) */}
          <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
            {user && (activeTab === 'calendar' || activeTab === 'tasks') && onToggleSidebar && (
              <button
                type="button"
                id="btn-toggle-app-sidebar"
                onClick={onToggleSidebar}
                className={`p-2 sm:p-2.5 rounded-full transition-all cursor-pointer border shadow-2xs flex items-center justify-center ${
                  isSidebarOpen
                    ? 'bg-blue-50 border-blue-300 text-blue-700 ring-2 ring-blue-500/20 shadow-xs'
                    : 'bg-white hover:bg-neutral-100 border-neutral-250 text-neutral-700 hover:text-neutral-900'
                }`}
                title={isSidebarOpen ? 'Ukryj menu boczne (...)' : 'Pokaż menu boczne (...)'}
                aria-label="Przełącz menu boczne"
              >
                <MoreHorizontal className="w-5 h-5 stroke-[2.5]" />
              </button>
            )}

            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <Plane className="w-4 h-4 sm:w-5 sm:h-5 -rotate-45" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <h1 className="text-sm sm:text-base lg:text-lg font-bold text-neutral-900 tracking-tight whitespace-nowrap">
                  Zadania
                </h1>
                <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                  Google Workspace
                </span>
              </div>
              <p className="text-xs text-neutral-500 hidden xl:block">
                Kalendarz &amp; Zadania Google
              </p>
            </div>
          </div>

          {/* Center: Top Navigation Tabs */}
          {user && onSelectTab && (
            <nav className="flex items-center space-x-0.5 sm:space-x-1 bg-neutral-100/90 p-0.5 sm:p-1 rounded-xl border border-neutral-250 shrink-0">
              <button
                type="button"
                id="tab-nav-dashboard"
                onClick={() => onSelectTab('dashboard')}
                className={`inline-flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-white text-neutral-900 shadow-2xs border border-neutral-200/80'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50'
                }`}
                title="Pulpit główny"
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Pulpit</span>
              </button>

              <button
                type="button"
                id="tab-nav-calendar"
                onClick={() => onSelectTab('calendar')}
                className={`inline-flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'calendar'
                    ? 'bg-white text-blue-700 shadow-2xs border border-neutral-200/80'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50'
                }`}
                title="Widok kalendarza"
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
                className={`inline-flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'tasks'
                    ? 'bg-white text-emerald-700 shadow-2xs border border-neutral-200/80'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50'
                }`}
                title="Widok zadań i kalendarza"
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
                className={`inline-flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'templates'
                    ? 'bg-white text-neutral-900 shadow-2xs border border-neutral-200/80'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50'
                }`}
                title="Szablony zadań"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Szablony</span>
              </button>
            </nav>
          )}

          {/* User profile / Logout */}
          {user && (
            <div className="flex items-center space-x-1.5 sm:space-x-3 shrink-0">
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

              <div className="flex items-center space-x-1.5 sm:space-x-2 pl-1.5 sm:pl-2 border-l border-neutral-200">
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

              <button
                id="btn-logout"
                onClick={onLogout}
                className="inline-flex items-center space-x-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 py-1.5 px-2 sm:px-3 rounded-lg transition-colors cursor-pointer shrink-0"
                title="Wyloguj z aplikacji"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Wyloguj</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
