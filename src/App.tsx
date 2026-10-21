import React, { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  GoogleUser,
  CalendarListItem,
  CalendarEventItem,
  GoogleTaskList,
  GoogleTaskItem,
  TaskTemplateItem,
  TaskTemplateSet,
  SyncLogItem,
} from './types';
import {
  initAuth,
  googleSignIn,
  logout,
  setManualAccessToken,
  getStoredAuth,
  refreshGoogleTokenSilently,
  isStoredTokenExpired,
  isPermanentTokenActive,
  auth,
} from './services/firebaseAuth';
import {
  getCachedCalendars,
  saveCachedCalendars,
  getCachedEvents,
  saveCachedEvents,
  getCachedTaskLists,
  saveCachedTaskLists,
  getCachedTasks,
  saveCachedTasks,
  clearOfflineDataCache,
} from './services/offlineDataCache';
import {
  loadCloudTemplates,
  saveCloudTemplates,
  subscribeToCloudTemplates,
  getGoogleAccountSyncKey,
} from './services/firestoreStorage';
import {
  listUserCalendars,
  findPrimaryCalendar,
  getCalendarEvents,
  getAllCalendarsEvents,
  getEventsForCalendars,
  createCalendarEvent,
  updateCalendarEvent,
  moveCalendarEvent,
  deleteCalendarEvent,
  ALL_CALENDARS_ID,
  ALL_CALENDARS_ITEM,
  formatCalendarEventStartEnd,
} from './services/googleCalendarApi';
import {
  listTaskLists,
  createTaskList,
  findOrCreateDefaultTaskList,
  findOrCreateTravelTaskList,
  getTasksInList,
  getAllTaskListsTasks,
  getTasksForSelectedLists,
  createGoogleTask,
  updateTaskStatus,
  deleteGoogleTask,
  updateGoogleTask,
  moveGoogleTaskToList,
  ALL_TASK_LISTS_ID,
  ALL_TASK_LISTS_ITEM,
} from './services/googleTasksApi';
import {
  loadTemplates,
  saveTemplates,
  resetTemplatesToDefault,
  resetTemplatesToFactory,
  saveAsCustomDefault,
  hasCustomDefaultTemplate,
  loadGeneratedTripIds,
  saveGeneratedTripId,
  calculateDueDateDetails,
  generateIcsForTripTasks,
  cleanTaskTitle,
  extractTaskTitleAndTime,
  saveTaskAssignedTime,
  formatToRfc3339,
  loadTemplateSets,
  saveTemplateSets,
  getActiveTemplateSet,
  getActiveTemplateSetId,
  setActiveTemplateSetId as setStoredActiveTemplateSetId,
  createTemplateSet,
  duplicateTemplateSet,
  deleteTemplateSet,
  updateTemplateSetMeta,
  setAsDefaultTemplateSet,
} from './services/templateStorage';
import { Navbar, AppNavTab } from './components/Navbar';
import { LoginView } from './components/LoginView';
import { CalendarCard } from './components/CalendarCard';
import { TasksListCard } from './components/TasksListCard';
import { TemplatesManager } from './components/TemplatesManager';
import { FullCalendarView } from './components/FullCalendarView';
import { OfflineIndicator } from './components/PWAInstallBanner';
import { MobileWidgetsModal } from './components/MobileWidgetsModal';
import { WidgetEditModal } from './components/WidgetEditModal';
import {
  WidgetConfig,
  WidgetId,
  getWidgetConfig,
  saveWidgetConfig,
  resetWidgetConfig,
  DEFAULT_WIDGET_CONFIGS,
} from './services/widgetStorage';
import { Columns, Rows, Calendar as CalendarIcon, LayoutDashboard, Layers, ListTodo, Sliders, X, Smartphone, AlertCircle, RefreshCw } from 'lucide-react';
import {
  DateRangeState,
  getDefaultDateRange,
  getCalendarViewDefaultDateRange,
  getDashboardCalendarDefaultDateRange,
  getDashboardTasksDefaultDateRange,
  getTasksViewTasksDefaultDateRange,
  extractLocalDateStr,
  getTodayDateString,
} from './utils/dateFilterUtils';
import { useUndo } from './context/UndoContext';

export type DashboardLayoutMode = 'side-by-side' | 'stacked';

export default function App() {
  const { pushAction } = useUndo();

  // Auth state - initialized immediately from stored session so login is remembered across app opens
  const [user, setUser] = useState<GoogleUser | null>(() => {
    const stored = getStoredAuth();
    return stored?.user || null;
  });
  const [token, setToken] = useState<string | null>(() => {
    const stored = getStoredAuth();
    return stored?.token || null;
  });
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  // Session expired is never shown on initial load; background refresh or persistent token keeps session continuous
  const [isSessionExpired, setIsSessionExpired] = useState<boolean>(false);

  // Calendars & Events state - initialized from offline cache for instant display
  const [calendars, setCalendars] = useState<CalendarListItem[]>(() => getCachedCalendars());
  const [selectedCalendar, setSelectedCalendar] = useState<CalendarListItem | null>(null);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('travel_calendar_selected_ids');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [ALL_CALENDARS_ID];
  });
  const [events, setEvents] = useState<CalendarEventItem[]>(() => getCachedEvents());
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);

  // Google Tasks state - initialized from offline cache for instant display
  const [taskLists, setTaskLists] = useState<GoogleTaskList[]>(() => getCachedTaskLists());
  const [travelTaskList, setTravelTaskList] = useState<GoogleTaskList | null>(null);
  const [selectedTaskListIds, setSelectedTaskListIds] = useState<string[]>([ALL_TASK_LISTS_ID]);
  const [tasks, setTasks] = useState<GoogleTaskItem[]>(() => getCachedTasks());
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  // Template Sets state
  const [templateSets, setTemplateSets] = useState<TaskTemplateSet[]>(loadTemplateSets);
  const [activeTemplateSetId, setActiveTemplateSetId] = useState<string>(() => {
    return getActiveTemplateSet().id;
  });
  const [templates, setTemplates] = useState<TaskTemplateItem[]>(() => {
    return getActiveTemplateSet().templates || loadTemplates();
  });
  const [hasCustomDefault, setHasCustomDefault] = useState<boolean>(hasCustomDefaultTemplate);

  // Tracking state
  const [generatedTripMap, setGeneratedTripMap] = useState<Record<string, string>>(loadGeneratedTripIds);
  const [generatingEventId, setGeneratingEventId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<{
    current: number;
    total: number;
    taskName?: string;
  } | null>(null);

  // Hour in task title preference (default: false - titles remain clean)
  const [includeTimeInTitle, setIncludeTimeInTitle] = useState<boolean>(() => {
    const saved = localStorage.getItem('travel_include_time_in_title');
    return saved !== null ? saved === 'true' : false;
  });

  const handleToggleIncludeTimeInTitle = (val: boolean) => {
    setIncludeTimeInTitle(val);
    localStorage.setItem('travel_include_time_in_title', String(val));
  };

  // Dashboard card controls states (hidden by default under "..." buttons)
  const [dashboardCalendarControlsOpen, setDashboardCalendarControlsOpen] = useState(false);
  const [dashboardTasksControlsOpen, setDashboardTasksControlsOpen] = useState(false);

  // Mobile Widgets state
  const [activeWidgetConfig, setActiveWidgetConfig] = useState<WidgetConfig | null>(null);
  const [showWidgetsModal, setShowWidgetsModal] = useState(false);
  const [editingWidgetInBar, setEditingWidgetInBar] = useState<WidgetConfig | null>(null);

  const applyWidgetConfig = (config: WidgetConfig) => {
    setActiveWidgetConfig(config);

    // 1. Tab & view mode:
    if (config.targetTab) {
      setCurrentTab(config.targetTab);
    }

    // 2. Calendars visibility:
    if (config.allCalendars) {
      setSelectedCalendarIds([ALL_CALENDARS_ID]);
    } else if (config.selectedCalendarIds.length > 0) {
      setSelectedCalendarIds(config.selectedCalendarIds);
    } else {
      setSelectedCalendarIds([]);
    }

    // 3. Task lists visibility:
    if (config.allTaskLists) {
      setSelectedTaskListIds([ALL_TASK_LISTS_ID]);
      setCalendarViewTaskListIds([ALL_TASK_LISTS_ID]);
    } else if (config.selectedTaskListIds.length > 0) {
      setSelectedTaskListIds(config.selectedTaskListIds);
      setCalendarViewTaskListIds(config.selectedTaskListIds);
    } else {
      setSelectedTaskListIds([]);
      setCalendarViewTaskListIds([]);
    }

    // 4. Date ranges / Due dates visibility:
    if (config.dateRangeFilter === 'today') {
      const todayStr = getTodayDateString();
      const todayRange = {
        mode: 'today' as const,
        startDate: todayStr,
        endDate: todayStr,
        includeNoDate: config.includeNoDate,
      };
      setFullCalendarDateRange(todayRange);
      setTasksViewTasksDateRange(todayRange);
      setDashboardCalendarDateRange(todayRange);
      setDashboardTasksDateRange(todayRange);
    } else if (config.dateRangeFilter === 'next7days') {
      const now = new Date();
      const next7 = new Date();
      next7.setDate(now.getDate() + 7);
      const pad = (n: number) => String(n).padStart(2, '0');
      const startStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const endStr = `${next7.getFullYear()}-${pad(next7.getMonth() + 1)}-${pad(next7.getDate())}`;
      const range7 = {
        mode: 'custom' as const,
        startDate: startStr,
        endDate: endStr,
        includeNoDate: config.includeNoDate,
      };
      setFullCalendarDateRange(range7);
      setTasksViewTasksDateRange(range7);
      setDashboardCalendarDateRange(range7);
      setDashboardTasksDateRange(range7);
    } else if (config.dateRangeFilter === 'next30days') {
      const now = new Date();
      const next30 = new Date();
      next30.setDate(now.getDate() + 30);
      const pad = (n: number) => String(n).padStart(2, '0');
      const startStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const endStr = `${next30.getFullYear()}-${pad(next30.getMonth() + 1)}-${pad(next30.getDate())}`;
      const range30 = {
        mode: 'custom' as const,
        startDate: startStr,
        endDate: endStr,
        includeNoDate: config.includeNoDate,
      };
      setFullCalendarDateRange(range30);
      setTasksViewTasksDateRange(range30);
      setDashboardCalendarDateRange(range30);
      setDashboardTasksDateRange(range30);
    } else {
      const defaultAll = getCalendarViewDefaultDateRange();
      const rangeAll = {
        ...defaultAll,
        includeNoDate: config.dateRangeFilter !== 'hasDueOnly' && config.includeNoDate,
      };
      setFullCalendarDateRange(rangeAll);
      setTasksViewTasksDateRange(rangeAll);
      setDashboardCalendarDateRange(rangeAll);
      setDashboardTasksDateRange(rangeAll);
    }
  };

  // Check URL query parameter '?widget=' on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const widgetParam = params.get('widget') as WidgetId | null;
    if (widgetParam && DEFAULT_WIDGET_CONFIGS[widgetParam]) {
      const conf = getWidgetConfig(widgetParam);
      applyWidgetConfig(conf);
    }
  }, []);

  // --- Cloud (Firestore) Templates Synchronization Across All Devices for the Google Account ---
  useEffect(() => {
    const syncAccountKey = getGoogleAccountSyncKey(user) || getGoogleAccountSyncKey(getStoredAuth()?.user);
    if (!syncAccountKey) return;

    let isMounted = true;

    // 1. Initial fetch from Firestore for this Google Account
    loadCloudTemplates(syncAccountKey)
      .then((cloudData) => {
        if (!isMounted) return;
        if (cloudData && Array.isArray(cloudData.templateSets) && cloudData.templateSets.length > 0) {
          setTemplateSets(cloudData.templateSets);
          saveTemplateSets(cloudData.templateSets);
          if (cloudData.activeTemplateSetId) {
            setActiveTemplateSetId(cloudData.activeTemplateSetId);
            setStoredActiveTemplateSetId(cloudData.activeTemplateSetId);
            const active =
              cloudData.templateSets.find((s) => s.id === cloudData.activeTemplateSetId) ||
              cloudData.templateSets[0];
            setTemplates(active.templates || []);
          }
          addLog(`Pomyślnie zsynchronizowano szablony zadań z kontem Google (${user?.email || 'chmura'})`, 'info');
        } else {
          // If Firestore is empty for this Google Account, upload the current local template sets
          const currentSets = loadTemplateSets();
          const currentActiveId = getActiveTemplateSetId();
          saveCloudTemplates(syncAccountKey, currentSets, currentActiveId).catch((err) => {
            console.warn('Nie udało się zapisać początkowych szablonów w chmurze:', err);
          });
        }
      })
      .catch((err) => {
        console.warn('Błąd pobierania szablonów z Firestore:', err);
      });

    // 2. Real-time subscription across devices
    const unsubscribe = subscribeToCloudTemplates(
      syncAccountKey,
      (cloudData) => {
        if (!isMounted) return;
        if (cloudData && Array.isArray(cloudData.templateSets) && cloudData.templateSets.length > 0) {
          setTemplateSets(cloudData.templateSets);
          saveTemplateSets(cloudData.templateSets);
          if (cloudData.activeTemplateSetId) {
            setActiveTemplateSetId(cloudData.activeTemplateSetId);
            setStoredActiveTemplateSetId(cloudData.activeTemplateSetId);
            const active =
              cloudData.templateSets.find((s) => s.id === cloudData.activeTemplateSetId) ||
              cloudData.templateSets[0];
            setTemplates(active.templates || []);
          }
        }
      },
      (err) => {
        console.warn('Błąd nasłuchiwania szablonów z Firestore:', err);
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [user?.email, user?.uid]);

  // Auto-sync & Activity logs
  const [autoSync, setAutoSync] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [logs, setLogs] = useState<SyncLogItem[]>([]);
  const autoSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Permission error states for Google Calendar and Google Tasks (403 handling)
  const [calendarPermissionError, setCalendarPermissionError] = useState<string | null>(null);
  const [tasksPermissionError, setTasksPermissionError] = useState<string | null>(null);
  const initializedTokenRef = useRef<string | null>(null);

  // Active top navigation tab (dashboard | calendar | tasks | templates)
  const [currentTab, setCurrentTab] = useState<AppNavTab>(() => {
    const saved = localStorage.getItem('travel_app_active_tab') as AppNavTab;
    return saved && ['dashboard', 'calendar', 'tasks', 'templates'].includes(saved) ? saved : 'dashboard';
  });

  // Navigation history stack for mobile back navigation
  const navHistoryRef = useRef<AppNavTab[]>([
    (() => {
      const saved = localStorage.getItem('travel_app_active_tab') as AppNavTab;
      return saved && ['dashboard', 'calendar', 'tasks', 'templates'].includes(saved) ? saved : 'dashboard';
    })(),
  ]);
  const lastBackPressTimeRef = useRef<number>(0);
  const [showExitToast, setShowExitToast] = useState(false);

  // Mobile / compact side drawer overlay open state for Calendar and Tasks tabs
  const [isAppSidebarOpen, setIsAppSidebarOpen] = useState(false);
  const handleToggleAppSidebar = () => setIsAppSidebarOpen((prev) => !prev);
  const handleCloseAppSidebar = () => setIsAppSidebarOpen(false);

  // Close sidebar on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isAppSidebarOpen) {
        setIsAppSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAppSidebarOpen]);

  // Mobile back action handler
  const handleMobileBack = useCallback(() => {
    // 1. Jeśli otwarty jest panel boczny, zamknij go
    if (isAppSidebarOpen) {
      setIsAppSidebarOpen(false);
      return;
    }

    // 2. Jeśli otwarte jest jakiekolwiek okno modalne, zamknij je przez zdarzenie Escape
    const openModals = document.querySelectorAll('[role="dialog"], .modal-overlay, #modal-create-event, #modal-new-task');
    if (openModals.length > 0) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      return;
    }

    // 3. Jeśli mamy historię poprzednich widoków, cofnij do poprzedniego widoku
    if (navHistoryRef.current.length > 1) {
      navHistoryRef.current.pop(); // Usuń aktualny widok
      const prevTab = navHistoryRef.current[navHistoryRef.current.length - 1];
      setCurrentTab(prevTab);
      localStorage.setItem('travel_app_active_tab', prevTab);
      setIsAppSidebarOpen(false);
      return;
    }

    // 4. Jeśli jesteśmy w innej sekcji niż pulpit, cofnij do pulpitu
    if (currentTab !== 'dashboard') {
      setCurrentTab('dashboard');
      localStorage.setItem('travel_app_active_tab', 'dashboard');
      navHistoryRef.current = ['dashboard'];
      return;
    }

    // 5. Na ekranie głównym: podwójne naciśnięcie przycisku cofnij wychodzi z aplikacji
    const now = Date.now();
    if (now - lastBackPressTimeRef.current < 2000) {
      setShowExitToast(true);
      // Użytkownik nacisnął cofnij 2 razy w ciągu 2s -> pozwól na wyjście z aplikacji / historii
      window.history.go(-1);
    } else {
      lastBackPressTimeRef.current = now;
      setShowExitToast(true);
      setTimeout(() => setShowExitToast(false), 2000);
      window.history.pushState({ appTab: 'dashboard', root: true }, '');
    }
  }, [isAppSidebarOpen, currentTab]);

  // Obsługa cofania w historii przeglądarki (przycisk wstecz / gest wstecz w systemie)
  useEffect(() => {
    try {
      window.history.replaceState({ appTab: currentTab, root: true }, '');
    } catch (e) {}

    const handlePopState = () => {
      handleMobileBack();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [handleMobileBack, currentTab]);

  // Obsługa gestu cofania od lewej krawędzi ekranu w widoku mobilnym
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let isFromEdge = false;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      // Gest od lewej krawędzi (do 35px od krawędzi)
      if (touch.clientX <= 35) {
        isFromEdge = true;
        startX = touch.clientX;
        startY = touch.clientY;
      } else {
        isFromEdge = false;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isFromEdge) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = Math.abs(touch.clientY - startY);

      // Przeciągnięcie w prawo o co najmniej 50px przy małym odchyleniu pionowym
      if (deltaX > 50 && deltaY < 60) {
        handleMobileBack();
      }
      isFromEdge = false;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleMobileBack]);

  // View date range filters with user-specified defaults
  const [dashboardCalendarDateRange, setDashboardCalendarDateRange] = useState<DateRangeState>(
    () => getDashboardCalendarDefaultDateRange()
  );
  const [dashboardTasksDateRange, setDashboardTasksDateRange] = useState<DateRangeState>(
    () => getDashboardTasksDefaultDateRange()
  );
  const [dashboardTasksIncludeNoDate, setDashboardTasksIncludeNoDate] = useState<boolean>(() => {
    const saved = localStorage.getItem('travel_dashboard_tasks_include_no_date');
    return saved !== null ? saved === 'true' : false;
  });
  const [fullCalendarDateRange, setFullCalendarDateRange] = useState<DateRangeState>(
    () => {
      const savedMode = localStorage.getItem('travel_calendar_view_mode');
      return savedMode === 'harmonogram' ? getDefaultDateRange() : getCalendarViewDefaultDateRange();
    }
  );
  const [tasksViewTasksDateRange, setTasksViewTasksDateRange] = useState<DateRangeState>(
    () => getTasksViewTasksDefaultDateRange()
  );
  const [tasksViewTasksIncludeNoDate, setTasksViewTasksIncludeNoDate] = useState<boolean>(() => {
    const saved = localStorage.getItem('travel_tasks_view_tasks_include_no_date');
    return saved !== null ? saved === 'true' : false;
  });
  const [tasksViewCalendarDateRange, setTasksViewCalendarDateRange] = useState<DateRangeState>(
    () => getCalendarViewDefaultDateRange()
  );

  // Selected task lists to display in the main Calendar view (persisted across refresh)
  const [calendarViewTaskListIds, setCalendarViewTaskListIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('travel_calendar_view_task_list_ids');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [ALL_TASK_LISTS_ID];
  });

  const handleToggleCalendarViewTaskListId = (id: string) => {
    setCalendarViewTaskListIds((prev) => {
      let next: string[];
      if (id === ALL_TASK_LISTS_ID) {
        next = prev.includes(ALL_TASK_LISTS_ID) ? [] : [ALL_TASK_LISTS_ID];
      } else {
        const withoutAll = prev.filter((lid) => lid !== ALL_TASK_LISTS_ID);
        if (withoutAll.includes(id)) {
          next = withoutAll.filter((lid) => lid !== id);
        } else {
          next = [...withoutAll, id];
        }
        if (next.length === 0) {
          next = [];
        } else {
          const nonAll = taskLists.filter((tl) => tl.id !== ALL_TASK_LISTS_ID);
          if (next.length === nonAll.length && nonAll.length > 0) {
            next = [ALL_TASK_LISTS_ID];
          }
        }
      }
      localStorage.setItem('travel_calendar_view_task_list_ids', JSON.stringify(next));
      return next;
    });
  };

  const handleSelectAllCalendarViewTaskLists = () => {
    const next = [ALL_TASK_LISTS_ID];
    setCalendarViewTaskListIds(next);
    localStorage.setItem('travel_calendar_view_task_list_ids', JSON.stringify(next));
  };

  const handleClearAllCalendarViewTaskLists = () => {
    setCalendarViewTaskListIds([]);
    localStorage.setItem('travel_calendar_view_task_list_ids', JSON.stringify([]));
  };

  const [tasksViewCalendarTaskListIds, setTasksViewCalendarTaskListIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('travel_tasks_view_calendar_task_list_ids');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [ALL_TASK_LISTS_ID];
  });

  const handleToggleTasksViewCalendarTaskListId = (id: string) => {
    setTasksViewCalendarTaskListIds((prev) => {
      let next: string[];
      if (id === ALL_TASK_LISTS_ID) {
        next = prev.includes(ALL_TASK_LISTS_ID) ? [] : [ALL_TASK_LISTS_ID];
      } else {
        const withoutAll = prev.filter((lid) => lid !== ALL_TASK_LISTS_ID);
        if (withoutAll.includes(id)) {
          next = withoutAll.filter((lid) => lid !== id);
        } else {
          next = [...withoutAll, id];
        }
        if (next.length === 0) {
          next = [];
        } else {
          const nonAll = taskLists.filter((tl) => tl.id !== ALL_TASK_LISTS_ID);
          if (next.length === nonAll.length && nonAll.length > 0) {
            next = [ALL_TASK_LISTS_ID];
          }
        }
      }
      localStorage.setItem('travel_tasks_view_calendar_task_list_ids', JSON.stringify(next));
      return next;
    });
  };

  const handleSelectAllTasksViewCalendarTaskLists = () => {
    const next = [ALL_TASK_LISTS_ID];
    setTasksViewCalendarTaskListIds(next);
    localStorage.setItem('travel_tasks_view_calendar_task_list_ids', JSON.stringify(next));
  };

  const handleClearAllTasksViewCalendarTaskLists = () => {
    setTasksViewCalendarTaskListIds([]);
    localStorage.setItem('travel_tasks_view_calendar_task_list_ids', JSON.stringify([]));
  };

  // Main window layout mode: 'side-by-side' | 'stacked'
  const [layoutMode, setLayoutMode] = useState<DashboardLayoutMode>(() => {
    const saved = localStorage.getItem('travel_dashboard_layout') as DashboardLayoutMode;
    return saved === 'stacked' ? 'stacked' : 'side-by-side';
  });

  const handleSelectLayoutMode = (mode: DashboardLayoutMode) => {
    setLayoutMode(mode);
    localStorage.setItem('travel_dashboard_layout', mode);
  };

  const addLog = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const newLog: SyncLogItem = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString('pl-PL'),
      message,
      type,
    };
    setLogs((prev) => [newLog, ...prev.slice(0, 29)]);
  }, []);

  // Initialize Firebase Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser, userToken) => {
        setUser(authedUser);
        setToken(userToken);
        setAuthError(null);
      },
      () => {
        setUser(null);
        setToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Handle Google Sign-in
  const handleSignIn = async () => {
    try {
      setIsSigningIn(true);
      setAuthError(null);
      const res = await googleSignIn({ prompt: 'consent' });
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        addLog(`Zalogowano jako ${res.user.displayName || res.user.email}`, 'success');
      }
    } catch (err: any) {
      console.error('Błąd logowania:', err);
      setAuthError(err.message || 'Nie udało się połączyć konta Google.');
      addLog(`Błąd logowania: ${err.message}`, 'error');
    } finally {
      setIsSigningIn(false);
    }
  };

  // Handle Manual Access Token (with permanent token support)
  const handleManualToken = async (manualToken: string, permanent = true) => {
    try {
      setIsSigningIn(true);
      setAuthError(null);
      setIsSessionExpired(false);
      const googleUser = await setManualAccessToken(manualToken, permanent);
      setUser(googleUser);
      setToken(manualToken.trim());
      initializedTokenRef.current = manualToken.trim();
      await initializeWorkspaceData(manualToken.trim());
      addLog(
        permanent
          ? `Połączono za pomocą stałego tokenu Google jako ${googleUser.displayName || googleUser.email} (bez wygasania)`
          : `Połączono za pomocą tokenu jako ${googleUser.displayName || googleUser.email}`,
        'success'
      );
    } catch (err: any) {
      console.error('Błąd weryfikacji tokenu:', err);
      setAuthError(err.message || 'Nie udało się zweryfikować tokenu dostępu.');
      addLog(`Błąd tokenu: ${err.message}`, 'error');
    } finally {
      setIsSigningIn(false);
    }
  };

  // Stable refs to prevent re-creating fetch callbacks on every state update (fixes Maximum update depth exceeded)
  const taskListsRef = useRef(taskLists);
  taskListsRef.current = taskLists;

  const selectedTaskListIdsRef = useRef(selectedTaskListIds);
  selectedTaskListIdsRef.current = selectedTaskListIds;

  const travelTaskListRef = useRef(travelTaskList);
  travelTaskListRef.current = travelTaskList;

  const calendarsRef = useRef(calendars);
  calendarsRef.current = calendars;

  const selectedCalendarRef = useRef(selectedCalendar);
  selectedCalendarRef.current = selectedCalendar;

  const selectedCalendarIdsRef = useRef(selectedCalendarIds);
  selectedCalendarIdsRef.current = selectedCalendarIds;

  // Handle Logout
  const handleLogout = async () => {
    await logout();
    clearOfflineDataCache();
    setIsSessionExpired(false);
    setUser(null);
    setToken(null);
    initializedTokenRef.current = null;
    setCalendarPermissionError(null);
    setTasksPermissionError(null);
    setCalendars([]);
    setSelectedCalendar(null);
    setSelectedCalendarIds([ALL_CALENDARS_ID]);
    setEvents([]);
    setTaskLists([]);
    setTravelTaskList(null);
    setSelectedTaskListIds([ALL_TASK_LISTS_ID]);
    setTasks([]);
    setAuthError(null);
    addLog('Wylogowano pomyślnie', 'info');
  };

  // Re-authorize with consent prompt to grant missing Google scopes (403 recovery)
  const handleReauthorizeGoogle = async () => {
    try {
      setIsSigningIn(true);
      setAuthError(null);
      setCalendarPermissionError(null);
      setTasksPermissionError(null);
      addLog('Otwieranie okna logowania Google z ekranem zgody (consent)...', 'info');
      const res = await googleSignIn({ prompt: 'consent' });
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        setIsSessionExpired(false);
        initializedTokenRef.current = res.accessToken;
        await initializeWorkspaceData(res.accessToken);
        addLog('Pomyślnie zaktualizowano uprawnienia Google i odświeżono dane', 'success');
      }
    } catch (err: any) {
      console.error('Błąd ponownej autoryzacji:', err);
      setAuthError(err.message || 'Nie udało się zaktualizować uprawnień.');
      addLog(`Błąd ponownej autoryzacji: ${err.message}`, 'error');
    } finally {
      setIsSigningIn(false);
    }
  };

  // One-click quick reauthorization when Google token expires
  const handleQuickReauthorize = async () => {
    try {
      setIsSigningIn(true);
      setAuthError(null);
      setCalendarPermissionError(null);
      setTasksPermissionError(null);
      addLog('Odświeżanie sesji konta Google...', 'info');
      const res = await googleSignIn({ prompt: 'select_account' });
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        setIsSessionExpired(false);
        initializedTokenRef.current = res.accessToken;
        await initializeWorkspaceData(res.accessToken);
        addLog(`Pomyślnie odświeżono połączenie z kontem Google (${res.user.displayName || res.user.email})`, 'success');
      }
    } catch (err: any) {
      console.error('Błąd szybkiego odświeżenia sesji:', err);
      setAuthError(err.message || 'Nie udało się odnowić sesji Google.');
    } finally {
      setIsSigningIn(false);
    }
  };

  // Load Tasks List (fetches all tasks from all task lists so all views and selected lists have complete data)
  const fetchTasks = useCallback(
    async (
      authToken: string,
      _listId?: string,
      _customListIds?: string[],
      listsPool?: GoogleTaskList[]
    ) => {
      if (!authToken) return;
      try {
        setIsLoadingTasks(true);
        const currentLists = listsPool && listsPool.length > 0 ? listsPool : taskListsRef.current;
        const items = await getAllTaskListsTasks(authToken, currentLists);
        setTasks(items);
        saveCachedTasks(items);
        if (currentLists.length > 0) saveCachedTaskLists(currentLists);
        setTasksPermissionError(null);
        setIsSessionExpired(false);
      } catch (err: any) {
        console.error('Błąd pobierania zadań:', err);
        const msg = err.message || 'Błąd pobierania zadań';
        if (msg.includes('401') || msg.includes('wygasła')) {
          setIsSessionExpired(true);
        } else if (msg.includes('403') || msg.toLowerCase().includes('brak uprawnień')) {
          setTasksPermissionError(msg);
        }
        addLog(`Błąd pobierania zadań: ${msg}`, 'error');
      } finally {
        setIsLoadingTasks(false);
      }
    },
    [addLog]
  );

  // Load Calendar Events
  const fetchEvents = useCallback(
    async (
      authToken: string,
      calendarId?: string,
      customCalIds?: string[],
      calsPool?: CalendarListItem[]
    ) => {
      if (!authToken) return;
      try {
        setIsLoadingEvents(true);
        const currentCalendars = calsPool && calsPool.length > 0 ? calsPool : calendarsRef.current;

        const targetIds =
          customCalIds && customCalIds.length > 0
            ? customCalIds
            : calendarId === ALL_CALENDARS_ID
              ? [ALL_CALENDARS_ID]
              : calendarId
                ? [calendarId]
                : selectedCalendarIdsRef.current.length > 0
                  ? selectedCalendarIdsRef.current
                  : selectedCalendarRef.current
                    ? [selectedCalendarRef.current.id]
                    : [ALL_CALENDARS_ID];

        const eventItems = await getEventsForCalendars(authToken, targetIds, currentCalendars);
        setEvents(eventItems);
        saveCachedEvents(eventItems);
        if (currentCalendars.length > 0) saveCachedCalendars(currentCalendars);
        setLastSyncTime(new Date());
        setCalendarPermissionError(null);
        setIsSessionExpired(false);
      } catch (err: any) {
        console.error('Błąd pobierania wydarzeń:', err);
        const msg = err.message || 'Błąd kalendarza';
        if (msg.includes('401') || msg.includes('wygasła')) {
          setIsSessionExpired(true);
        } else if (msg.includes('403') || msg.toLowerCase().includes('brak uprawnień')) {
          setCalendarPermissionError(msg);
        }
        addLog(`Błąd kalendarza: ${msg}`, 'error');
      } finally {
        setIsLoadingEvents(false);
      }
    },
    [addLog]
  );

  // Initial Data Fetching once Token is ready
  const initializeWorkspaceData = useCallback(async (authToken: string) => {
    if (!authToken || !authToken.trim()) return;

    try {
      setIsSyncing(true);

      // 1. Fetch Calendars
      try {
        const calList = await listUserCalendars(authToken);
        setCalendars(calList);
        setCalendarPermissionError(null);

        const savedCalIds = localStorage.getItem('travel_calendar_selected_ids');
        let initialCalIds = [ALL_CALENDARS_ID];
        if (savedCalIds) {
          try {
            const parsed = JSON.parse(savedCalIds);
            if (Array.isArray(parsed) && parsed.length > 0) initialCalIds = parsed;
          } catch (e) {}
        }
        setSelectedCalendarIds(initialCalIds);
        if (initialCalIds.length === 1 && initialCalIds[0] !== ALL_CALENDARS_ID) {
          const matching = calList.find((c) => c.id === initialCalIds[0]);
          setSelectedCalendar(matching || ALL_CALENDARS_ITEM);
        } else {
          setSelectedCalendar(ALL_CALENDARS_ITEM);
        }

        const savedFullRange = localStorage.getItem('travel_full_calendar_date_range');
        if (savedFullRange) {
          try {
            setFullCalendarDateRange(JSON.parse(savedFullRange));
          } catch (e) {}
        }

        const savedDashRange = localStorage.getItem('travel_dashboard_calendar_date_range');
        if (savedDashRange) {
          try {
            setDashboardCalendarDateRange(JSON.parse(savedDashRange));
          } catch (e) {}
        }

        addLog(`Połączono z kalendarzami Google`, 'info');
        await fetchEvents(authToken, undefined, initialCalIds, calList);
      } catch (calErr: any) {
        console.error('Błąd kalendarza:', calErr);
        const msg = calErr.message || 'Błąd kalendarza';
        if (msg.includes('401') || msg.includes('wygasła')) {
          setIsSessionExpired(true);
        } else if (msg.includes('403') || msg.toLowerCase().includes('brak uprawnień')) {
          setCalendarPermissionError(msg);
        }
        addLog(`Kalendarz Google: ${msg}`, 'error');
      }

      // 2. Fetch all Google Task Lists and connect to default list
      try {
        const allLists = await listTaskLists(authToken);
        setTaskLists(allLists);
        setTasksPermissionError(null);

        const { list: tList, wasCreated } = await findOrCreateDefaultTaskList(authToken, 'Zadania');
        setTravelTaskList(tList);

        const mergedLists = wasCreated
          ? [tList, ...allLists.filter((l) => l.id !== tList.id)]
          : allLists;

        if (wasCreated) {
          setTaskLists(mergedLists);
          addLog(`Utworzono nową listę zadań Google "${tList.title}"`, 'success');
        } else {
          addLog(`Połączono z listami zadań Google (domyślnie: Wszystkie)`, 'info');
        }

        setSelectedTaskListIds([ALL_TASK_LISTS_ID]);
        await fetchTasks(authToken, undefined, [ALL_TASK_LISTS_ID], mergedLists);
      } catch (tasksErr: any) {
        console.error('Błąd listy zadań:', tasksErr);
        const msg = tasksErr.message || 'Błąd listy zadań';
        if (msg.includes('401') || msg.includes('wygasła')) {
          setIsSessionExpired(true);
        } else if (msg.includes('403') || msg.toLowerCase().includes('brak uprawnień')) {
          setTasksPermissionError(msg);
        }
        addLog(`Zadania Google: ${msg}`, 'error');
      }
    } finally {
      setIsSyncing(false);
    }
  }, [fetchEvents, fetchTasks, addLog]);

  useEffect(() => {
    if (token && token.trim()) {
      if (initializedTokenRef.current !== token) {
        initializedTokenRef.current = token;
        initializeWorkspaceData(token);
      }
    } else {
      initializedTokenRef.current = null;
    }
  }, [token, initializeWorkspaceData]);

  // Auto-sync polling timer (checks every 2 minutes for new travel events)
  useEffect(() => {
    if (!token || !autoSync) {
      if (autoSyncIntervalRef.current) clearInterval(autoSyncIntervalRef.current);
      return;
    }

    autoSyncIntervalRef.current = setInterval(async () => {
      try {
        setIsSyncing(true);
        // Odśwież listę kalendarzy
        const freshCalendars = await listUserCalendars(token);
        setCalendars(freshCalendars);

        // Pobierz wydarzenia dla obecnie wybranych kalendarzy (bez resetowania wyboru użytkownika)
        const targetIds = selectedCalendarIds.length > 0 ? selectedCalendarIds : [ALL_CALENDARS_ID];
        const latestEvents = await getEventsForCalendars(token, targetIds, freshCalendars);
        setEvents(latestEvents);
        setLastSyncTime(new Date());

        const currentRecords = loadGeneratedTripIds();
        const ungenerated = latestEvents.filter((ev) => !currentRecords[ev.id]);

        if (ungenerated.length > 0) {
          addLog(`Automatyczna synchronizacja: wykryto ${ungenerated.length} nowe wydarzenie w kalendarzu`, 'info');
        } else {
          addLog(`Automatyczne odświeżenie danych (${latestEvents.length} wydarzeń)`, 'info');
        }
      } catch (err: any) {
        console.error('Błąd auto-sync:', err);
      } finally {
        setIsSyncing(false);
      }
    }, 2 * 60 * 1000);

    return () => {
      if (autoSyncIntervalRef.current) clearInterval(autoSyncIntervalRef.current);
    };
  }, [token, autoSync, selectedCalendarIds, addLog]);

  // Manual & Auto Refresh Events - robustly fetches fresh calendars and events
  const handleRefreshEvents = useCallback(async (overrideCalendarIds?: string[]) => {
    const activeToken = token || getStoredAuth()?.token;
    if (!activeToken) return;
    try {
      setIsLoadingEvents(true);
      addLog('Odświeżanie kalendarzy i wydarzeń z Google...', 'info');
      const freshCalendars = await listUserCalendars(activeToken);
      setCalendars(freshCalendars);

      const targetIds =
        overrideCalendarIds && overrideCalendarIds.length > 0
          ? overrideCalendarIds
          : selectedCalendarIds.length > 0
            ? selectedCalendarIds
            : [ALL_CALENDARS_ID];

      const eventItems = await getEventsForCalendars(activeToken, targetIds, freshCalendars);
      setEvents(eventItems);
      saveCachedEvents(eventItems);
      if (freshCalendars.length > 0) saveCachedCalendars(freshCalendars);
      setLastSyncTime(new Date());
      setCalendarPermissionError(null);
      setIsSessionExpired(false);
      addLog(`Odświeżono kalendarz: załadowano ${eventItems.length} wydarzeń`, 'success');
    } catch (err: any) {
      console.error('Błąd odświeżania kalendarza:', err);
      const msg = err.message || 'Błąd odświeżania kalendarza';
      if (msg.includes('401') || msg.includes('wygasła')) {
        setIsSessionExpired(true);
      } else if (msg.includes('403') || msg.toLowerCase().includes('brak uprawnień')) {
        setCalendarPermissionError(msg);
      }
      addLog(`Błąd odświeżania kalendarza: ${msg}`, 'error');
    } finally {
      setIsLoadingEvents(false);
    }
  }, [token, selectedCalendarIds, addLog]);

  // Manual & Auto Refresh Tasks - robustly fetches fresh lists and tasks
  const handleRefreshTasks = useCallback(async (overrideTaskListIds?: string[]) => {
    const activeToken = token || getStoredAuth()?.token;
    if (!activeToken) return;
    try {
      setIsLoadingTasks(true);
      addLog('Odświeżanie list zadań i pozycji z Google...', 'info');
      const freshLists = await listTaskLists(activeToken);
      setTaskLists(freshLists);

      const targetListIds =
        overrideTaskListIds && overrideTaskListIds.length > 0
          ? overrideTaskListIds
          : selectedTaskListIds.length > 0
            ? selectedTaskListIds
            : travelTaskList
              ? [travelTaskList.id]
              : [ALL_TASK_LISTS_ID];

      let taskItems: GoogleTaskItem[] = [];
      if (targetListIds.includes(ALL_TASK_LISTS_ID)) {
        taskItems = await getAllTaskListsTasks(activeToken, freshLists);
      } else {
        taskItems = await getTasksForSelectedLists(activeToken, targetListIds, freshLists);
      }
      setTasks(taskItems);
      saveCachedTasks(taskItems);
      if (freshLists.length > 0) saveCachedTaskLists(freshLists);
      setTasksPermissionError(null);
      setIsSessionExpired(false);
      addLog(`Odświeżono zadania: załadowano ${taskItems.length} pozycji`, 'success');
    } catch (err: any) {
      console.error('Błąd odświeżania zadań:', err);
      const msg = err.message || 'Błąd odświeżania zadań';
      if (msg.includes('401') || msg.includes('wygasła')) {
        setIsSessionExpired(true);
      } else if (msg.includes('403') || msg.toLowerCase().includes('brak uprawnień')) {
        setTasksPermissionError(msg);
      }
      addLog(`Błąd odświeżania zadań: ${msg}`, 'error');
    } finally {
      setIsLoadingTasks(false);
    }
  }, [token, selectedTaskListIds, travelTaskList, addLog]);

  // Stable refs for auto-refresh to prevent dependency churn and infinite loops
  const lastAutoRefreshRef = useRef<number>(Date.now());
  const isAutoRefreshingRef = useRef<boolean>(false);
  const handleRefreshEventsRef = useRef(handleRefreshEvents);
  handleRefreshEventsRef.current = handleRefreshEvents;
  const handleRefreshTasksRef = useRef(handleRefreshTasks);
  handleRefreshTasksRef.current = handleRefreshTasks;

  // Automatyczne odświeżanie kalendarzy i zadań przy wznowieniu aplikacji (visibilitychange)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;

      const now = Date.now();
      // 15-sekundowy cooldown chroniący przed jakimikolwiek pętlami na urządzeniach mobilnych
      if (now - lastAutoRefreshRef.current < 15000) return;
      if (isAutoRefreshingRef.current) return;
      lastAutoRefreshRef.current = now;

      const activeToken = token || getStoredAuth()?.token;
      if (!activeToken) return;

      isAutoRefreshingRef.current = true;
      try {
        if (isStoredTokenExpired() && !isPermanentTokenActive()) {
          setIsSessionExpired(true);
        }

        await Promise.allSettled([
          handleRefreshEventsRef.current(),
          handleRefreshTasksRef.current(),
        ]);
      } catch (err) {
        console.warn('Błąd auto-refresh przy wznowieniu:', err);
      } finally {
        isAutoRefreshingRef.current = false;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [token]);

  // Switch App Navigation Tab
  const handleSelectTab = (tab: AppNavTab, isBackNav = false) => {
    if (!isBackNav && tab !== currentTab) {
      navHistoryRef.current.push(tab);
      try {
        window.history.pushState({ appTab: tab }, '');
      } catch (e) {}
    }
    setCurrentTab(tab);
    setIsAppSidebarOpen(false);
    localStorage.setItem('travel_app_active_tab', tab);
    if (tab === 'calendar') {
      const savedMode = (localStorage.getItem('travel_calendar_view_mode') as string) || 'miesiac';
      const defaultRange = savedMode === 'harmonogram' ? getDefaultDateRange() : getCalendarViewDefaultDateRange();
      setFullCalendarDateRange(defaultRange);
    }
  };

  // Obsługa skrótów klawiszowych:
  // d - widok dnia w kalendarzu
  // m - widok miesiąca w kalendarzu
  // x - widok 4 tygodni w kalendarzu
  // w - widok tygodnia w kalendarzu
  // n - nowe wydarzenie
  // m - nowe zadanie (w zakładce zadania)
  // p - widok pulpitu
  // s - widok szablonu
  // k - widok kalendarza
  // z - widok zadań
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Nie uruchamiaj skrótów podczas pisania w polach tekstowych
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.closest('input, textarea, select, [contenteditable="true"]'))
      ) {
        return;
      }

      // Nie przechwytuj kombinacji ze specjalnymi modyfikatorami (Ctrl, Cmd, Alt)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      const key = e.key.toLowerCase();

      if (key === 'p') {
        e.preventDefault();
        handleSelectTab('dashboard');
      } else if (key === 's') {
        e.preventDefault();
        handleSelectTab('templates');
      } else if (key === 'k') {
        e.preventDefault();
        handleSelectTab('calendar');
      } else if (key === 'z') {
        e.preventDefault();
        handleSelectTab('tasks');
      } else if (key === 'd') {
        e.preventDefault();
        if (currentTab !== 'calendar') {
          handleSelectTab('calendar');
        }
        localStorage.setItem('travel_calendar_view_mode', 'dzien');
        window.dispatchEvent(new CustomEvent('app:switch-calendar-view', { detail: { mode: 'dzien' } }));
      } else if (key === 'w') {
        e.preventDefault();
        if (currentTab !== 'calendar') {
          handleSelectTab('calendar');
        }
        localStorage.setItem('travel_calendar_view_mode', 'tydzien');
        window.dispatchEvent(new CustomEvent('app:switch-calendar-view', { detail: { mode: 'tydzien' } }));
      } else if (key === 'x') {
        e.preventDefault();
        if (currentTab !== 'calendar') {
          handleSelectTab('calendar');
        }
        localStorage.setItem('travel_calendar_view_mode', '4tygodnie');
        window.dispatchEvent(new CustomEvent('app:switch-calendar-view', { detail: { mode: '4tygodnie' } }));
      } else if (key === 'n') {
        e.preventDefault();
        if (currentTab !== 'calendar') {
          handleSelectTab('calendar');
        }
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('app:open-new-event'));
        }, 50);
      } else if (key === 'm') {
        e.preventDefault();
        if (currentTab === 'tasks') {
          // w widoku zadań: m -> nowe zadanie
          window.dispatchEvent(new CustomEvent('app:open-new-task'));
        } else {
          // w kalendarzu lub pozostałych: m -> widok miesiąca w kalendarzu
          if (currentTab !== 'calendar') {
            handleSelectTab('calendar');
          }
          localStorage.setItem('travel_calendar_view_mode', 'miesiac');
          window.dispatchEvent(new CustomEvent('app:switch-calendar-view', { detail: { mode: 'miesiac' } }));
        }
      } else if (key === 't') {
        // Pomocniczy alias klawisza t -> nowe zadanie
        e.preventDefault();
        if (currentTab !== 'tasks') {
          handleSelectTab('tasks');
        }
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('app:open-new-task'));
        }, 50);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTab]);

  // Change active calendar
  const handleSelectCalendar = async (cal: CalendarListItem) => {
    setSelectedCalendar(cal);
    const newIds = [cal.id];
    setSelectedCalendarIds(newIds);
    localStorage.setItem('travel_calendar_selected_ids', JSON.stringify(newIds));
    if (token) {
      await fetchEvents(token, cal.id, newIds);
      addLog(`Przełączono na kalendarz "${cal.summary}"`, 'info');
    }
  };

  // Toggle calendar filter checkbox
  const handleToggleCalendarId = async (id: string) => {
    let nextIds: string[];
    if (id === ALL_CALENDARS_ID) {
      nextIds = [ALL_CALENDARS_ID];
      setSelectedCalendar(ALL_CALENDARS_ITEM);
    } else {
      const withoutAll = selectedCalendarIds.filter((cid) => cid !== ALL_CALENDARS_ID);
      if (withoutAll.includes(id)) {
        nextIds = withoutAll.filter((cid) => cid !== id);
      } else {
        nextIds = [...withoutAll, id];
      }
      if (nextIds.length === 0) {
        nextIds = [ALL_CALENDARS_ID];
        setSelectedCalendar(ALL_CALENDARS_ITEM);
      } else if (nextIds.length === 1) {
        const singleCal = calendars.find((c) => c.id === nextIds[0]);
        if (singleCal) setSelectedCalendar(singleCal);
      }
    }
    setSelectedCalendarIds(nextIds);
    localStorage.setItem('travel_calendar_selected_ids', JSON.stringify(nextIds));
    if (token) {
      await fetchEvents(token, undefined, nextIds);
    }
  };

  const handleSelectAllCalendars = async () => {
    const nextIds = [ALL_CALENDARS_ID];
    setSelectedCalendarIds(nextIds);
    setSelectedCalendar(ALL_CALENDARS_ITEM);
    localStorage.setItem('travel_calendar_selected_ids', JSON.stringify(nextIds));
    if (token) {
      await fetchEvents(token, ALL_CALENDARS_ID, nextIds);
      addLog('Wybrano wszystkie kalendarze', 'info');
    }
  };

  const handleClearAllCalendars = () => {
    setSelectedCalendarIds([]);
    localStorage.setItem('travel_calendar_selected_ids', JSON.stringify([]));
    setEvents([]);
  };

  // Change active task list
  const handleSelectTaskList = async (listId: string) => {
    if (listId === ALL_TASK_LISTS_ID) {
      setTravelTaskList(ALL_TASK_LISTS_ITEM);
      setSelectedTaskListIds([ALL_TASK_LISTS_ID]);
      if (token) {
        await fetchTasks(token, ALL_TASK_LISTS_ID, [ALL_TASK_LISTS_ID]);
        addLog('Przełączono na wszystkie listy zadań', 'info');
      }
      return;
    }
    const target = taskLists.find((l) => l.id === listId);
    if (!target) return;
    setTravelTaskList(target);
    setSelectedTaskListIds([target.id]);
    if (token) {
      await fetchTasks(token, target.id, [target.id]);
      addLog(`Przełączono na listę zadań "${target.title}"`, 'info');
    }
  };

  // Toggle task list filter checkbox
  const handleToggleTaskListId = async (id: string) => {
    let nextIds: string[];
    if (id === ALL_TASK_LISTS_ID) {
      nextIds = [ALL_TASK_LISTS_ID];
      setTravelTaskList(ALL_TASK_LISTS_ITEM);
    } else {
      const withoutAll = selectedTaskListIds.filter((lid) => lid !== ALL_TASK_LISTS_ID);
      if (withoutAll.includes(id)) {
        nextIds = withoutAll.filter((lid) => lid !== id);
      } else {
        nextIds = [...withoutAll, id];
      }
      if (nextIds.length === 0) {
        nextIds = [ALL_TASK_LISTS_ID];
        setTravelTaskList(ALL_TASK_LISTS_ITEM);
      } else if (nextIds.length === 1) {
        const singleList = taskLists.find((l) => l.id === nextIds[0]);
        if (singleList) setTravelTaskList(singleList);
      }
    }
    setSelectedTaskListIds(nextIds);
    if (token) {
      await fetchTasks(token, undefined, nextIds);
    }
  };

  const handleSelectAllTaskLists = async () => {
    const nextIds = [ALL_TASK_LISTS_ID];
    setSelectedTaskListIds(nextIds);
    setTravelTaskList(ALL_TASK_LISTS_ITEM);
    if (token) {
      await fetchTasks(token, ALL_TASK_LISTS_ID, nextIds);
      addLog('Wybrano wszystkie listy zadań', 'info');
    }
  };

  const handleClearAllTaskLists = () => {
    setSelectedTaskListIds([]);
  };

  // Create new task list
  const handleCreateTaskList = async (title: string) => {
    if (!token) return;
    try {
      const newList = await createTaskList(token, title);
      setTaskLists((prev) => [newList, ...prev]);
      setTravelTaskList(newList);
      await fetchTasks(token, newList.id);
      addLog(`Utworzono nową listę zadań "${newList.title}" i przełączono na nią`, 'success');
    } catch (err: any) {
      addLog(`Błąd tworzenia nowej listy zadań: ${err.message}`, 'error');
      throw err;
    }
  };

  // Download .ics for trip
  const handleDownloadIcsForTrip = (event: CalendarEventItem) => {
    const rawStart = event.start.dateTime || event.start.date || new Date().toISOString();
    const rawEnd = event.end.dateTime || event.end.date || rawStart;
    const icsContent = generateIcsForTripTasks(event.summary, rawStart, rawEnd, templates);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Zadania_${event.summary.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, '_')}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addLog(`Pobrano plik kalendarza (.ics) z dokładnymi godzinami dla wydarzenia "${event.summary}"`, 'success');
  };

  // Generate Tasks for a specific Event
  // Supports selective generation: tasks only, or tasks + calendar events with dates
  const handleGenerateTasksForEvent = async (
    event: CalendarEventItem,
    customChoices?: Array<{
      template: TaskTemplateItem;
      createTask: boolean;
      createCalendarEvent: boolean;
    }>
  ) => {
    if (!token) {
      addLog('Brak aktywnego tokenu autoryzacji', 'error');
      return;
    }

    let targetTaskList = travelTaskList;
    if (!targetTaskList) {
      const { list } = await findOrCreateDefaultTaskList(token, 'Zadania');
      targetTaskList = list;
      setTravelTaskList(list);
    }

    const rawStart = event.start.dateTime || event.start.date || new Date().toISOString();
    const rawEnd = event.end.dateTime || event.end.date || rawStart;

    const itemsToProcess = customChoices && customChoices.length > 0
      ? customChoices
      : templates.map((t) => {
          const mode = t.creationMode || (t.createCalendarEvent === false ? 'task_only' : 'event_and_task');
          return {
            template: t,
            createTask: mode !== 'event_only',
            createCalendarEvent: mode !== 'task_only',
          };
        });

    try {
      setGeneratingEventId(event.id);
      setGenerationProgress({ current: 0, total: itemsToProcess.length });

      addLog(`Rozpoczęto tworzenie pozycji dla wydarzenia "${event.summary}"...`, 'info');

      let tasksCreated = 0;
      let calendarEventsCreated = 0;
      const createdTaskRecords: Array<{ id: string; listId: string }> = [];
      const createdCalRecords: Array<{ id: string; calId: string }> = [];

      for (let i = 0; i < itemsToProcess.length; i++) {
        const itemChoice = itemsToProcess[i];
        const item = itemChoice.template;
        setGenerationProgress({
          current: i + 1,
          total: itemsToProcess.length,
          taskName: item.title,
        });

        // Compute exact due date and hour details
        const dueDetails = calculateDueDateDetails(rawStart, rawEnd, item.daysOffset, item.anchor, item.time);
        const cleanTitle = cleanTaskTitle(item.title);
        const taskHour = item.time || dueDetails.timeFormatted || '18:00';

        // 1. Create Google Task if chosen (clean title, no notes)
        if (itemChoice.createTask) {
          const specificTaskListId = item.targetTaskListId || targetTaskList.id;
          const createdTask = await createGoogleTask(token, specificTaskListId, {
            title: cleanTitle,
            notes: undefined,
            due: dueDetails.rfc3339,
          });
          createdTaskRecords.push({ id: createdTask.id, listId: specificTaskListId });
          tasksCreated++;
        }

        // 2. Create corresponding event in Google Calendar if chosen
        const destCalendarId =
          item.targetCalendarId ||
          (event as any).targetCalendarId ||
          (event.calendarId && event.calendarId !== ALL_CALENDARS_ID ? event.calendarId : undefined) ||
          (selectedCalendar && selectedCalendar.id !== ALL_CALENDARS_ID ? selectedCalendar.id : undefined) ||
          findPrimaryCalendar(calendars)?.id ||
          'primary';

        if (itemChoice.createCalendarEvent && destCalendarId && taskHour) {
          try {
            const createdCal = await createCalendarEvent(token, destCalendarId, {
              summary: cleanTitle,
              description: `Zadanie do wydarzenia "${event.summary}". Godzina wykonania: ${taskHour}.${item.notes ? `\n\n${item.notes}` : ''}`,
              colorId: item.colorId || undefined,
              start: {
                dateTime: dueDetails.startDateTime,
                timeZone: dueDetails.timeZone,
              },
              end: {
                dateTime: dueDetails.endDateTime,
                timeZone: dueDetails.timeZone,
              },
            });
            createdCalRecords.push({ id: createdCal.id, calId: destCalendarId });
            calendarEventsCreated++;
          } catch (calErr: any) {
            console.warn('Nie udało się utworzyć wpisu w Kalendarzu Google:', calErr);
          }
        }

        // Small delay between calls to prevent rate limiting
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      // Mark trip as generated
      saveGeneratedTripId(event.id, new Date().toISOString());
      setGeneratedTripMap(loadGeneratedTripIds());

      try {
        confetti({
          particleCount: 60,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {}

      addLog(
        `Sukces! Utworzono ${tasksCreated} zadań w Google Tasks oraz ${calendarEventsCreated} wydarzeń z datą w Kalendarzu Google dla wydarzenia "${event.summary}"!`,
        'success'
      );

      // Register undo action for generated batch
      pushAction({
        type: 'GENERATE_TASKS',
        title: `Wygenerowano zadania dla "${event.summary}" (${tasksCreated})`,
        undo: async () => {
          for (const rec of createdTaskRecords) {
            try {
              await deleteGoogleTask(token, rec.listId, rec.id);
            } catch (e) {}
          }
          for (const rec of createdCalRecords) {
            try {
              await deleteCalendarEvent(token, rec.calId, rec.id);
            } catch (e) {}
          }
          setTasks((prev) => prev.filter((t) => !createdTaskRecords.some((r) => r.id === t.id)));
          setEvents((prev) => prev.filter((e) => !createdCalRecords.some((r) => r.id === e.id)));
          setGeneratedTripMap((prev) => {
            const next = { ...prev };
            delete next[event.id];
            localStorage.setItem('travel_generated_trip_ids', JSON.stringify(next));
            return next;
          });
          addLog(`Cofnięto wygenerowane zadania dla "${event.summary}"`, 'info');
          await fetchTasks(token, targetTaskList.id);
          if (selectedCalendar) {
            await fetchEvents(token, selectedCalendar.id);
          }
        },
      });

      // Refresh task list & calendar
      await fetchTasks(token, targetTaskList.id);
      if (selectedCalendar) {
        await fetchEvents(token, selectedCalendar.id);
      }
    } catch (err: any) {
      console.error('Błąd generowania zadań:', err);
      addLog(`Błąd podczas tworzenia zadań: ${err.message}`, 'error');
    } finally {
      setGeneratingEventId(null);
      setGenerationProgress(null);
    }
  };

  // Add tasks and events directly from Templates view with custom date and target calendar
  const handleAddToCalendarFromTemplates = async (
    calendarId: string,
    departureDate: string,
    returnDate: string,
    templatesToUse: TaskTemplateItem[],
    setName: string
  ) => {
    const chosenDeparture = departureDate || new Date().toISOString().split('T')[0];
    const hasReturn = templatesToUse.some((t) => t.anchor === 'return');
    const chosenReturn = hasReturn
      ? returnDate || chosenDeparture
      : chosenDeparture;

    const syntheticEvent: CalendarEventItem = {
      id: `tpl-set-${Date.now()}`,
      summary: `Wydarzenie (${setName})`,
      calendarId: calendarId,
      start: { date: chosenDeparture },
      end: { date: chosenReturn },
    };

    const choices = templatesToUse.map((t) => {
      const mode = t.creationMode || (t.createCalendarEvent === false ? 'task_only' : 'event_and_task');
      return {
        template: t,
        createTask: mode !== 'event_only',
        createCalendarEvent: mode !== 'task_only',
      };
    });

    await handleGenerateTasksForEvent(syntheticEvent, choices);
  };

  // Toggle task status
  const handleToggleTask = async (task: GoogleTaskItem) => {
    if (!token) return;
    const effectiveListId =
      task.taskListId ||
      (travelTaskList && travelTaskList.id !== ALL_TASK_LISTS_ID
        ? travelTaskList.id
        : taskLists.find((tl) => tl.id !== ALL_TASK_LISTS_ID)?.id || '');
    if (!effectiveListId) return;

    const previousStatus = task.status;
    const nextStatus = task.status === 'completed' ? 'needsAction' : 'completed';

    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
    );

    try {
      await updateTaskStatus(token, effectiveListId, task.id, nextStatus);
      addLog(
        `Zadanie "${task.title}" oznaczono jako ${nextStatus === 'completed' ? 'ukończone' : 'do zrobienia'}`,
        'info'
      );

      pushAction({
        type: 'TOGGLE_TASK',
        title: nextStatus === 'completed' ? `Ukończono: "${task.title}"` : `Przywrócono: "${task.title}"`,
        undo: async () => {
          setTasks((prev) =>
            prev.map((t) => (t.id === task.id ? { ...t, status: previousStatus } : t))
          );
          await updateTaskStatus(token, effectiveListId, task.id, previousStatus);
          addLog(`Cofnięto zmianę statusu zadania "${task.title}"`, 'info');
        },
        redo: async () => {
          setTasks((prev) =>
            prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
          );
          await updateTaskStatus(token, effectiveListId, task.id, nextStatus);
          addLog(`Ponowiono zmianę statusu zadania "${task.title}"`, 'info');
        },
      });
    } catch (err: any) {
      console.error(err);
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t))
      );
      addLog(`Nie udało się zmienić statusu zadania: ${err.message}`, 'error');
    }
  };

  // Delete task
  const handleDeleteTask = async (taskId: string) => {
    if (!token) return;
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    const effectiveListId =
      target.taskListId ||
      (travelTaskList && travelTaskList.id !== ALL_TASK_LISTS_ID
        ? travelTaskList.id
        : taskLists.find((tl) => tl.id !== ALL_TASK_LISTS_ID)?.id || '');
    if (!effectiveListId) return;

    const previous = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    try {
      await deleteGoogleTask(token, effectiveListId, taskId);
      addLog('Zadanie zostało usunięte z Google Tasks', 'info');

      pushAction({
        type: 'DELETE_TASK',
        title: `Usunięto zadanie: "${target.title}"`,
        undo: async () => {
          const restored = await createGoogleTask(token, effectiveListId, {
            title: target.title,
            notes: target.notes,
            due: target.due,
          });
          if (target.status === 'completed') {
            await updateTaskStatus(token, effectiveListId, restored.id, 'completed');
          }
          const restoredTask: GoogleTaskItem = {
            ...target,
            id: restored.id,
          };
          setTasks((prev) => [restoredTask, ...prev]);
          addLog(`Przywrócono zadanie "${target.title}"`, 'success');
        },
        redo: async () => {
          await deleteGoogleTask(token, effectiveListId, taskId);
          setTasks((prev) => prev.filter((t) => t.id !== taskId));
          addLog(`Ponownie usunięto zadanie "${target.title}"`, 'info');
        },
      });
    } catch (err: any) {
      setTasks(previous);
      addLog(`Nie udało się usunąć zadania: ${err.message}`, 'error');
    }
  };

  // Update task (title, due, notes, time) with ability to assign/move to another task list
  const handleUpdateTask = async (
    taskId: string,
    patch: { title?: string; notes?: string; due?: string; time?: string },
    newTaskListId?: string,
    oldTaskListId?: string
  ) => {
    if (!token) return;
    const existing = tasks.find((t) => t.id === taskId);
    const sourceListId =
      oldTaskListId ||
      existing?.taskListId ||
      (travelTaskList && travelTaskList.id !== ALL_TASK_LISTS_ID
        ? travelTaskList.id
        : taskLists.find((tl) => tl.id !== ALL_TASK_LISTS_ID)?.id || '');

    if (!sourceListId) {
      addLog('Błąd: nie można określić listy źródłowej zadania.', 'error');
      return;
    }

    try {
      if (patch.time !== undefined) {
        saveTaskAssignedTime(taskId, patch.time || null);
      }

      // Check if user requested moving to a different list
      if (newTaskListId && newTaskListId !== ALL_TASK_LISTS_ID && newTaskListId !== sourceListId) {
        const targetList = taskLists.find((l) => l.id === newTaskListId);
        const moved = await moveGoogleTaskToList(token, sourceListId, newTaskListId, taskId, {
          title: patch.title || existing?.title || 'Zadanie',
          notes: patch.notes !== undefined ? patch.notes : existing?.notes,
          due: patch.due !== undefined ? patch.due : existing?.due,
          status: existing?.status,
        });

        if (patch.time !== undefined) {
          saveTaskAssignedTime(moved.id, patch.time || null);
        }

        // Update local tasks list with new ID and target list metadata
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  id: moved.id,
                  ...patch,
                  time: patch.time !== undefined ? (patch.time || undefined) : t.time,
                  taskListId: newTaskListId,
                  taskListTitle: targetList?.title || t.taskListTitle,
                }
              : t
          )
        );
        addLog(
          `Przeniesiono zadanie do listy "${targetList?.title || 'wybranej'}" i zaktualizowano`,
          'success'
        );
      } else {
        // Normal update in current list
        await updateGoogleTask(token, sourceListId, taskId, {
          title: patch.title,
          notes: patch.notes,
          due: patch.due,
        });
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  ...patch,
                  time: patch.time !== undefined ? (patch.time || undefined) : t.time,
                }
              : t
          )
        );
        addLog(`Zaktualizowano zadanie "${patch.title || 'zadanie'}" w Google Tasks`, 'success');
      }
    } catch (err: any) {
      addLog(`Nie udało się zaktualizować zadania: ${err.message}`, 'error');
      throw err;
    }
  };

  // Add task to Google Calendar (all-day event or with +1h duration if time is specified)
  const handleAddTaskToCalendar = async (
    task: GoogleTaskItem,
    startTime?: string,
    colorId?: string,
    targetCalendarIdOverride?: string,
    isAllDay?: boolean
  ) => {
    if (!token) {
      addLog('Brak aktywnego tokenu do dodania terminu.', 'error');
      return;
    }
    try {
      const cleanTitle = cleanTaskTitle(task.title);
      const { time: extractedTime } = extractTaskTitleAndTime(task.title, task.notes, templates, task.due);
      const matchedTpl = templates.find(
        (t) => cleanTaskTitle(t.title).toLowerCase() === cleanTitle.toLowerCase()
      );
      const eventColorId = colorId || matchedTpl?.colorId || undefined;

      // Determine date
      let baseDate = new Date();
      if (task.due) {
        const localDateStr = extractLocalDateStr(task.due);
        const [yy, mm, dd] = localDateStr.split('-').map(Number);
        baseDate = new Date(yy, mm - 1, dd);
      } else {
        baseDate.setDate(baseDate.getDate() + 1);
      }

      const pad = (n: number) => String(n).padStart(2, '0');
      const targetDateStr = `${baseDate.getFullYear()}-${pad(baseDate.getMonth() + 1)}-${pad(baseDate.getDate())}`;

      const targetCalendarId =
        targetCalendarIdOverride ||
        (selectedCalendar && selectedCalendar.id !== ALL_CALENDARS_ID
          ? selectedCalendar.id
          : (findPrimaryCalendar(calendars)?.id || 'primary'));

      const targetCalObj = calendars.find((c) => c.id === targetCalendarId);
      const targetCalName = targetCalObj?.summary ? ` (${targetCalObj.summary})` : '';

      // If all-day is requested OR no explicit hour was specified and task doesn't have an extracted hour
      if (isAllDay || (!startTime && !extractedTime)) {
        const { start, end } = formatCalendarEventStartEnd(
          {
            startDate: targetDateStr,
            endDate: targetDateStr,
            isAllDay: true,
          },
          false
        );

        await createCalendarEvent(token, targetCalendarId, {
          summary: cleanTitle,
          description: task.notes?.trim() ? task.notes : undefined,
          colorId: eventColorId,
          start,
          end,
        });

        addLog(
          `Dodano całodniowe zadanie do Kalendarza Google${targetCalName}: "${cleanTitle}"`,
          'success'
        );
        if (selectedCalendar) {
          await fetchEvents(token, selectedCalendar.id);
        }
        return;
      }

      let taskHour = startTime || extractedTime || matchedTpl?.time || '18:00';
      const [hh, mm] = taskHour.split(':').map(Number);
      const startDt = new Date(baseDate);
      startDt.setHours(isNaN(hh) ? 18 : hh, isNaN(mm) ? 0 : mm, 0, 0);

      // Duration: 1 hour (+1h)
      const endDt = new Date(startDt.getTime() + 60 * 60 * 1000);

      const startIso = `${startDt.getFullYear()}-${pad(startDt.getMonth() + 1)}-${pad(startDt.getDate())}T${pad(startDt.getHours())}:${pad(startDt.getMinutes())}:00`;
      const endIso = `${endDt.getFullYear()}-${pad(endDt.getMonth() + 1)}-${pad(endDt.getDate())}T${pad(endDt.getHours())}:${pad(endDt.getMinutes())}:00`;

      const startFormatted = `${pad(startDt.getHours())}:${pad(startDt.getMinutes())}`;
      const endFormatted = `${pad(endDt.getHours())}:${pad(endDt.getMinutes())}`;

      await createCalendarEvent(token, targetCalendarId, {
        summary: cleanTitle,
        description: `Termin zadania z listy "${travelTaskList?.title || 'Zadania'}". Czas trwania: 1h (${startFormatted} - ${endFormatted}).${task.notes ? `\n\nNotatki: ${task.notes}` : ''}`,
        colorId: eventColorId,
        start: {
          dateTime: startIso,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw',
        },
        end: {
          dateTime: endIso,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw',
        },
      });

      addLog(
        `Dodano termin do Kalendarza Google${targetCalName}: "${cleanTitle}" (${startFormatted} - ${endFormatted}, czas trwania: 1h)`,
        'success'
      );
      if (selectedCalendar) {
        await fetchEvents(token, selectedCalendar.id);
      }
    } catch (err: any) {
      addLog(`Błąd dodawania terminu do Kalendarza: ${err.message}`, 'error');
      throw err;
    }
  };

  // Delete calendar event
  const handleDeleteCalendarEvent = async (eventId: string) => {
    try {
      if (eventId.startsWith('sim-event-')) {
        setEvents((prev) => prev.filter((e) => e.id !== eventId));
        addLog('Usunięto testowe wydarzenie.', 'info');
        return;
      }
      if (!token) return;
      const existing = events.find((e) => e.id === eventId);
      const targetCalendarId =
        existing?.calendarId ||
        (selectedCalendar && selectedCalendar.id !== ALL_CALENDARS_ID
          ? selectedCalendar.id
          : (findPrimaryCalendar(calendars)?.id || 'primary'));

      // Optimistically remove from state immediately
      setEvents((prev) => prev.filter((e) => e.id !== eventId));

      try {
        await deleteCalendarEvent(token, targetCalendarId, eventId);
      } catch (delErr: any) {
        // If 404 on targetCalendarId, try primary calendar as fallback
        if (targetCalendarId !== 'primary') {
          try {
            await deleteCalendarEvent(token, 'primary', eventId);
          } catch {
            throw delErr;
          }
        } else {
          throw delErr;
        }
      }
      addLog('Wydarzenie zostało pomyślnie usunięte z Kalendarza Google.', 'success');

      if (existing) {
        pushAction({
          type: 'DELETE_EVENT',
          title: `Usunięto wydarzenie: "${existing.summary}"`,
          undo: async () => {
            const restored = await createCalendarEvent(token, targetCalendarId, {
              summary: existing.summary,
              description: existing.description,
              location: existing.location,
              colorId: existing.colorId,
              start: existing.start,
              end: existing.end,
            });
            const calObj = calendars.find((c) => c.id === targetCalendarId);
            const restoredItem: CalendarEventItem = {
              ...restored,
              colorId: existing.colorId,
              calendarId: targetCalendarId,
              calendarSummary: calObj?.summary || 'Kalendarz',
            };
            setEvents((prev) => [restoredItem, ...prev]);
            addLog(`Przywrócono wydarzenie "${existing.summary}"`, 'success');
            await fetchEvents(token, undefined, selectedCalendarIds);
          },
          redo: async () => {
            try {
              await deleteCalendarEvent(token, targetCalendarId, eventId);
            } catch (e) {}
            setEvents((prev) => prev.filter((e) => e.id !== eventId));
            addLog(`Ponownie usunięto wydarzenie "${existing.summary}"`, 'info');
          },
        });
      }
    } catch (err: any) {
      addLog(`Nie udało się usunąć wydarzenia: ${err.message}`, 'error');
      throw err;
    }
  };

  // Create calendar event directly from in-app UI
  const handleCreateCalendarEvent = async (payload: {
    summary: string;
    startDate: string;
    startTime?: string;
    endDate: string;
    endTime?: string;
    isAllDay: boolean;
    location?: string;
    description?: string;
    colorId?: string;
    calendarId?: string;
  }): Promise<CalendarEventItem | void> => {
    if (!token || !selectedCalendar) {
      addLog('Brak aktywnego kalendarza do utworzenia wydarzenia.', 'error');
      return;
    }
    try {
      const { start, end } = formatCalendarEventStartEnd(
        {
          startDate: payload.startDate,
          endDate: payload.endDate,
          startTime: payload.startTime,
          endTime: payload.endTime,
          isAllDay: payload.isAllDay,
        },
        false
      );

      const targetCalendarId =
        payload.calendarId ||
        (selectedCalendar.id === ALL_CALENDARS_ID
          ? (findPrimaryCalendar(calendars)?.id || 'primary')
          : selectedCalendar.id);

      const createdItem = await createCalendarEvent(token, targetCalendarId, {
        summary: payload.summary,
        location: payload.location,
        description: payload.description,
        colorId: payload.colorId,
        start,
        end,
      });

      const calObj = calendars.find((c) => c.id === targetCalendarId);
      const enhancedItem: CalendarEventItem = {
        ...createdItem,
        colorId: payload.colorId !== undefined ? payload.colorId : createdItem.colorId,
        calendarId: targetCalendarId,
        calendarSummary: calObj?.summary || 'Kalendarz',
      };

      // Optimistically add to events list immediately
      setEvents((prev) => [enhancedItem, ...prev]);

      addLog(`Dodano wydarzenie "${payload.summary}" do Kalendarza Google.`, 'success');
      await fetchEvents(token, undefined, selectedCalendarIds);

      pushAction({
        type: 'CREATE_EVENT',
        title: `Utworzono wydarzenie: "${payload.summary}"`,
        undo: async () => {
          try {
            await deleteCalendarEvent(token, targetCalendarId, enhancedItem.id);
          } catch (e) {}
          setEvents((prev) => prev.filter((e) => e.id !== enhancedItem.id));
          addLog(`Cofnięto utworzenie wydarzenia "${payload.summary}"`, 'info');
          await fetchEvents(token, undefined, selectedCalendarIds);
        },
        redo: async () => {
          const rec = await createCalendarEvent(token, targetCalendarId, {
            summary: payload.summary,
            location: payload.location,
            description: payload.description,
            colorId: payload.colorId,
            start,
            end,
          });
          const recItem: CalendarEventItem = {
            ...rec,
            colorId: payload.colorId !== undefined ? payload.colorId : rec.colorId,
            calendarId: targetCalendarId,
            calendarSummary: calObj?.summary || 'Kalendarz',
          };
          setEvents((prev) => [recItem, ...prev]);
          addLog(`Ponowiono utworzenie wydarzenia "${payload.summary}"`, 'success');
          await fetchEvents(token, undefined, selectedCalendarIds);
        },
      });

      return enhancedItem;
    } catch (err: any) {
      addLog(`Błąd podczas dodawania wydarzenia do kalendarza: ${err.message}`, 'error');
      throw err;
    }
  };

  // Update calendar event directly from in-app UI
  const handleUpdateCalendarEvent = async (
    eventId: string,
    payload: {
      summary: string;
      startDate: string;
      startTime?: string;
      endDate: string;
      endTime?: string;
      isAllDay: boolean;
      location?: string;
      description?: string;
      colorId?: string;
      calendarId?: string;
    }
  ): Promise<CalendarEventItem | void> => {
    if (!token || !selectedCalendar) {
      addLog('Brak aktywnego kalendarza do edycji wydarzenia.', 'error');
      return;
    }
    try {
      const { start, end } = formatCalendarEventStartEnd({
        startDate: payload.startDate,
        endDate: payload.endDate,
        startTime: payload.startTime,
        endTime: payload.endTime,
        isAllDay: payload.isAllDay,
      });

      const existing = events.find((e) => e.id === eventId);
      const sourceCalendarId =
        existing?.calendarId ||
        (selectedCalendar.id === ALL_CALENDARS_ID
          ? (findPrimaryCalendar(calendars)?.id || 'primary')
          : selectedCalendar.id);

      const prevSummary = existing?.summary || payload.summary;
      const prevLocation = existing?.location;
      const prevDesc = existing?.description;
      const prevColorId = existing?.colorId;
      const prevStart = existing?.start;
      const prevEnd = existing?.end;
      const prevCalendarId = existing?.calendarId || sourceCalendarId;

      const targetCalendarId = payload.calendarId || sourceCalendarId;

      let updatedItem = await updateCalendarEvent(token, sourceCalendarId, eventId, {
        summary: payload.summary,
        location: payload.location,
        description: payload.description,
        colorId: payload.colorId,
        start,
        end,
      });

      // If user selected a different calendar, move the event to the target calendar
      if (payload.calendarId && payload.calendarId !== sourceCalendarId) {
        try {
          updatedItem = await moveCalendarEvent(
            token,
            sourceCalendarId,
            eventId,
            payload.calendarId
          );
        } catch (moveErr: any) {
          console.warn('Nie udało się przenieść wydarzenia do innego kalendarza:', moveErr);
          addLog(
            `Wydarzenie zaktualizowano, lecz przeniesienie do innego kalendarza zwróciło: ${moveErr.message}`,
            'error'
          );
        }
      }

      const calObj = calendars.find((c) => c.id === targetCalendarId);
      const enhancedItem: CalendarEventItem = {
        ...updatedItem,
        colorId: payload.colorId !== undefined ? payload.colorId : updatedItem.colorId,
        calendarId: targetCalendarId,
        calendarSummary: calObj?.summary || 'Kalendarz',
      };

      // Optimistically update local events list immediately so changes (like color) are instantly visible
      setEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, ...enhancedItem } : e))
      );

      addLog(`Zaktualizowano wydarzenie "${payload.summary}" w Kalendarzu Google.`, 'success');
      await fetchEvents(token, undefined, selectedCalendarIds);

      if (existing && prevStart && prevEnd) {
        pushAction({
          type: 'UPDATE_EVENT',
          title: `Zaktualizowano wydarzenie: "${payload.summary}"`,
          undo: async () => {
            await updateCalendarEvent(token, targetCalendarId, eventId, {
              summary: prevSummary,
              location: prevLocation,
              description: prevDesc,
              colorId: prevColorId,
              start: prevStart,
              end: prevEnd,
            });
            if (prevCalendarId && prevCalendarId !== targetCalendarId) {
              try {
                await moveCalendarEvent(token, targetCalendarId, eventId, prevCalendarId);
              } catch (e) {}
            }
            await fetchEvents(token, undefined, selectedCalendarIds);
            addLog(`Cofnięto aktualizację wydarzenia "${prevSummary}"`, 'info');
          },
          redo: async () => {
            await updateCalendarEvent(token, sourceCalendarId, eventId, {
              summary: payload.summary,
              location: payload.location,
              description: payload.description,
              colorId: payload.colorId,
              start,
              end,
            });
            if (payload.calendarId && payload.calendarId !== sourceCalendarId) {
              try {
                await moveCalendarEvent(token, sourceCalendarId, eventId, payload.calendarId);
              } catch (e) {}
            }
            await fetchEvents(token, undefined, selectedCalendarIds);
            addLog(`Ponowiono aktualizację wydarzenia "${payload.summary}"`, 'info');
          },
        });
      }

      return enhancedItem;
    } catch (err: any) {
      addLog(`Błąd podczas aktualizacji wydarzenia w kalendarzu: ${err.message}`, 'error');
      throw err;
    }
  };

  // Add task manually to a specific target list with optional assigned time
  const handleAddTaskManually = async (
    title: string,
    notes?: string,
    due?: string,
    targetTaskListId?: string,
    time?: string
  ): Promise<GoogleTaskItem | void> => {
    if (!token) return;
    const effectiveListId =
      targetTaskListId ||
      (travelTaskList && travelTaskList.id !== ALL_TASK_LISTS_ID
        ? travelTaskList.id
        : taskLists.find((tl) => tl.id !== ALL_TASK_LISTS_ID)?.id || '');
    if (!effectiveListId) return;

    const targetListObj = taskLists.find((tl) => tl.id === effectiveListId) || travelTaskList;

    try {
      const cleanTitle = cleanTaskTitle(title);
      let rfcDue = due;
      if (due && time) {
        const datePart = due.includes('T') ? due.split('T')[0] : due;
        const [year, month, day] = datePart.split('-').map(Number);
        const [hours, minutes] = time.split(':').map(Number);
        const dateObj = new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0);
        rfcDue = formatToRfc3339(dateObj);
      } else if (due && !due.includes('T')) {
        const [year, month, day] = due.split('-').map(Number);
        const dateObj = new Date(Date.UTC(year, (month || 1) - 1, day || 1, 0, 0, 0));
        rfcDue = dateObj.toISOString();
      }

      const newTask = await createGoogleTask(token, effectiveListId, {
        title: cleanTitle,
        notes: notes || undefined,
        due: rfcDue,
      });

      if (time) {
        saveTaskAssignedTime(newTask.id, time);
      }

      const taskWithList: GoogleTaskItem = {
        ...newTask,
        due: rfcDue || newTask.due,
        time: time || undefined,
        taskListId: effectiveListId,
        taskListTitle: targetListObj?.title || 'Zadania',
      };
      setTasks((prev) => [taskWithList, ...prev]);
      addLog(
        `Dodano nowe zadanie "${cleanTitle}"${time ? ` (godz. ${time})` : ''} do listy "${targetListObj?.title || effectiveListId}"`,
        'success'
      );

      pushAction({
        type: 'CREATE_TASK',
        title: `Utworzono zadanie: "${cleanTitle}"`,
        undo: async () => {
          try {
            await deleteGoogleTask(token, effectiveListId, newTask.id);
          } catch (e) {}
          setTasks((prev) => prev.filter((t) => t.id !== newTask.id));
          addLog(`Cofnięto utworzenie zadania "${cleanTitle}"`, 'info');
        },
        redo: async () => {
          const recreated = await createGoogleTask(token, effectiveListId, {
            title: cleanTitle,
            notes: notes || undefined,
            due: rfcDue,
          });
          if (time) {
            saveTaskAssignedTime(recreated.id, time);
          }
          const recreatedTask: GoogleTaskItem = {
            ...recreated,
            due: rfcDue || recreated.due,
            time: time || undefined,
            taskListId: effectiveListId,
            taskListTitle: targetListObj?.title || 'Zadania',
          };
          setTasks((prev) => [recreatedTask, ...prev]);
          addLog(`Ponowiono utworzenie zadania "${cleanTitle}"`, 'info');
        },
      });

      return taskWithList;
    } catch (err: any) {
      addLog(`Nie udało się dodać zadania: ${err.message}`, 'error');
      throw err;
    }
  };

  // Remove hours from task titles and remove all notes from existing tasks in the list
  const handleCleanHoursAndNotesFromExistingTasks = async () => {
    if (!token || !travelTaskList || tasks.length === 0) return;
    try {
      addLog('Rozpoczęto usuwanie godzin z nazw oraz usuwanie notatek ze wszystkich zadań...', 'info');
      let cleaned = 0;
      for (const task of tasks) {
        const clean = cleanTaskTitle(task.title);
        const hasHour = clean !== task.title;
        const hasNotes = Boolean(task.notes && task.notes.trim());

        if (hasHour || hasNotes) {
          await updateGoogleTask(token, travelTaskList.id, task.id, {
            title: clean,
            notes: '',
          });
          cleaned++;
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      addLog(`Wyczyszczono ${cleaned} zadań (usunięto godziny z nazw i usunięto notatki) na liście "${travelTaskList.title}".`, 'success');
      await fetchTasks(token, travelTaskList.id);
    } catch (err: any) {
      addLog(`Błąd podczas czyszczenia zadań: ${err.message}`, 'error');
    }
  };

  // Remove hours prefixes from existing task titles (if user desires clean titles)
  const handleRemoveHoursFromExistingTaskTitles = async () => {
    if (!token || !travelTaskList || tasks.length === 0) return;
    try {
      addLog('Rozpoczęto usuwanie godzin z tytułów zadań...', 'info');
      let updatedCount = 0;
      for (const task of tasks) {
        const clean = cleanTaskTitle(task.title);
        if (clean !== task.title) {
          await updateGoogleTask(token, travelTaskList.id, task.id, {
            title: clean,
          });
          updatedCount++;
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      addLog(`Usunięto godziny z ${updatedCount} zadań na liście "${travelTaskList.title}".`, 'success');
      await fetchTasks(token, travelTaskList.id);
    } catch (err: any) {
      addLog(`Błąd podczas usuwania godzin: ${err.message}`, 'error');
    }
  };

  // Sync active tasks from selected task list to Google Calendar with exact time blocks
  const handleSyncTasksToCalendar = async (targetCalId?: string, sourceTaskListId?: string) => {
    if (!token || tasks.length === 0) {
      addLog('Brak aktywnej sesji lub brak zadań do synchronizacji.', 'warning');
      return;
    }
    const resolvedCalendarId =
      targetCalId ||
      (selectedCalendar && selectedCalendar.id !== ALL_CALENDARS_ID
        ? selectedCalendar.id
        : findPrimaryCalendar(calendars)?.id || 'primary');

    try {
      const calName = calendars.find((c) => c.id === resolvedCalendarId)?.summary || 'Kalendarz';

      const isSpecificList = Boolean(
        sourceTaskListId &&
        sourceTaskListId !== ALL_TASK_LISTS_ID &&
        sourceTaskListId !== '_all_'
      );
      const activeTasks = tasks.filter((t) => {
        if (t.status === 'completed') return false;
        if (isSpecificList) {
          return t.taskListId === sourceTaskListId;
        }
        return true;
      });

      const srcListName = isSpecificList
        ? (taskLists.find((l) => l.id === sourceTaskListId)?.title || travelTaskList?.title || 'Wybrana lista')
        : 'wszystkich list zadań';

      if (activeTasks.length === 0) {
        addLog(`Brak aktywnych zadań na liście "${srcListName}" do zsynchronizowania.`, 'info');
        return;
      }

      addLog(`Rozpoczęto synchronizację ${activeTasks.length} zadań z listy "${srcListName}" do kalendarza "${calName}" z konkretnymi godzinami...`, 'info');
      let created = 0;

      for (const task of activeTasks) {
        const { time: extractedTime, cleanTitle } = extractTaskTitleAndTime(task.title, task.notes, templates, task.due);
        const resolvedTime = extractedTime || '18:00';

        let datePart = '';
        if (task.due) {
          datePart = extractLocalDateStr(task.due);
        } else {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const pad = (n: number) => String(n).padStart(2, '0');
          datePart = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
        }

        const [hh, mm] = resolvedTime.split(':').map(Number);
        const pad = (n: number) => String(n).padStart(2, '0');
        const startH = isNaN(hh) ? 18 : hh;
        const startM = isNaN(mm) ? 0 : mm;
        const totalMinutes = startH * 60 + startM + 30;
        const endH = Math.floor(totalMinutes / 60) % 24;
        const endM = totalMinutes % 60;

        const startIso = `${datePart}T${pad(startH)}:${pad(startM)}:00`;
        const endIso = `${datePart}T${pad(endH)}:${pad(endM)}:00`;

        const matchedTpl = templates.find(
          (t) => cleanTaskTitle(t.title).toLowerCase() === cleanTitle.toLowerCase()
        );

        const currentTaskListName =
          task.taskListTitle ||
          taskLists.find((l) => l.id === task.taskListId)?.title ||
          travelTaskList?.title ||
          'Zadania';

        await createCalendarEvent(token, resolvedCalendarId, {
          summary: cleanTitle,
          description: `Zadanie z listy "${currentTaskListName}". Godzina wykonania: ${resolvedTime}.${task.notes ? `\n\n${task.notes}` : ''}`,
          colorId: matchedTpl?.colorId || undefined,
          start: {
            dateTime: startIso,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw',
          },
          end: {
            dateTime: endIso,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw',
          },
        });
        created++;
        await new Promise((r) => setTimeout(r, 120));
      }

      addLog(`Utworzono ${created} wpisów w kalendarzu "${calName}" z konkretnymi godzinami (czas trwania: 30 min).`, 'success');
      await fetchEvents(token, selectedCalendar?.id || ALL_CALENDARS_ID);
    } catch (err: any) {
      addLog(`Błąd synchronizacji do Kalendarza: ${err.message}`, 'error');
    }
  };

  // Clean all notes from existing tasks on Google Tasks
  const handleCleanAllTaskNotes = async () => {
    if (!token || !travelTaskList || tasks.length === 0) return;
    try {
      addLog('Rozpoczęto usuwanie notatek ze wszystkich zadań w liście...', 'info');
      let cleaned = 0;
      for (const task of tasks) {
        if (task.notes && task.notes.trim()) {
          await updateGoogleTask(token, travelTaskList.id, task.id, { notes: '' });
          cleaned++;
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      addLog(`Wyczyszczono notatki z ${cleaned} zadań. Zadania są teraz całkowicie czyste.`, 'success');
      await fetchTasks(token, travelTaskList.id);
    } catch (err: any) {
      addLog(`Błąd podczas usuwania notatek: ${err.message}`, 'error');
    }
  };

  // Simulate a travel event (for testing)
  const handleSimulateEvent = (eventData: {
    summary: string;
    startDate: string;
    endDate: string;
  }) => {
    const simulated: CalendarEventItem = {
      id: `sim-event-${Date.now()}`,
      summary: eventData.summary,
      description: 'Wydarzenie dodane w trybie testowym aplikacji Zadania i Kalendarz.',
      start: { date: eventData.startDate },
      end: { date: eventData.endDate },
      location: 'Biuro / Miejsce spotkania',
    };

    setEvents((prev) => [simulated, ...prev]);
    addLog(`Dodano testowe wydarzenie: "${eventData.summary}" na dzień ${eventData.startDate}`, 'info');
  };

  // --- Template Sets Handlers ---

  const syncTemplatesToCloud = (sets: TaskTemplateSet[], activeId: string) => {
    const syncAccountKey = getGoogleAccountSyncKey(user) || getGoogleAccountSyncKey(getStoredAuth()?.user);
    if (syncAccountKey) {
      saveCloudTemplates(syncAccountKey, sets, activeId).catch((err) => {
        console.warn('Błąd synchronizacji szablonów w chmurze:', err);
      });
    }
  };

  const handleSelectTemplateSet = (setId: string) => {
    const found = templateSets.find((s) => s.id === setId);
    if (!found) return;
    setActiveTemplateSetId(setId);
    setStoredActiveTemplateSetId(setId);
    setTemplates(found.templates || []);
    syncTemplatesToCloud(templateSets, setId);
    addLog(`Przełączono aktywny szablon zadań na "${found.name}"`, 'info');
  };

  const handleCreateTemplateSet = (name: string, description?: string, icon?: string) => {
    const newSet = createTemplateSet(name, description, icon, templates);
    const updatedSets = loadTemplateSets();
    setTemplateSets(updatedSets);
    setActiveTemplateSetId(newSet.id);
    setTemplates(newSet.templates || []);
    syncTemplatesToCloud(updatedSets, newSet.id);
    addLog(`Utworzono nowy szablon zadań "${name}"!`, 'success');
  };

  const handleDuplicateTemplateSet = (setId: string) => {
    const copy = duplicateTemplateSet(setId);
    if (!copy) return;
    const updatedSets = loadTemplateSets();
    setTemplateSets(updatedSets);
    setActiveTemplateSetId(copy.id);
    setTemplates(copy.templates || []);
    syncTemplatesToCloud(updatedSets, copy.id);
    addLog(`Zduplikowano szablon do "${copy.name}"`, 'success');
  };

  const handleDeleteTemplateSet = (setId: string) => {
    const ok = deleteTemplateSet(setId);
    if (!ok) return;
    const updatedSets = loadTemplateSets();
    setTemplateSets(updatedSets);
    const active = getActiveTemplateSet();
    setActiveTemplateSetId(active.id);
    setTemplates(active.templates || []);
    syncTemplatesToCloud(updatedSets, active.id);
    addLog('Usunięto szablon zadań', 'info');
  };

  const handleUpdateTemplateSetMeta = (setId: string, name: string, description?: string, icon?: string) => {
    updateTemplateSetMeta(setId, name, description, icon);
    const updatedSets = loadTemplateSets();
    setTemplateSets(updatedSets);
    syncTemplatesToCloud(updatedSets, activeTemplateSetId);
    addLog(`Zaktualizowano dane szablonu "${name}"`, 'info');
  };

  const handleSetAsDefaultTemplateSet = (setId: string) => {
    setAsDefaultTemplateSet(setId);
    const updatedSets = loadTemplateSets();
    setTemplateSets(updatedSets);
    syncTemplatesToCloud(updatedSets, setId);
    addLog('Ustawiono ten zestaw szablonów jako domyślny!', 'success');
  };

  const handleSaveTemplates = (updated: TaskTemplateItem[]) => {
    saveTemplates(updated);
    setTemplates(updated);
    // Keep template set in sync
    const updatedSets = templateSets.map((s) =>
      s.id === activeTemplateSetId ? { ...s, templates: updated } : s
    );
    saveTemplateSets(updatedSets);
    setTemplateSets(updatedSets);
    syncTemplatesToCloud(updatedSets, activeTemplateSetId);
    addLog('Zapisano zmiany w szablonie zadań', 'success');
  };

  const handleSaveAsDefault = (updated: TaskTemplateItem[]) => {
    saveAsCustomDefault(updated);
    setTemplates(updated);
    setHasCustomDefault(true);
    const updatedSets = templateSets.map((s) =>
      s.id === activeTemplateSetId ? { ...s, templates: updated } : s
    );
    syncTemplatesToCloud(updatedSets, activeTemplateSetId);
    addLog('Zapisano szablon jako Twój nowy domyślny!', 'success');
  };

  const handleResetTemplates = () => {
    const defaults = resetTemplatesToDefault();
    setTemplates(defaults);
    const updatedSets = templateSets.map((s) =>
      s.id === activeTemplateSetId ? { ...s, templates: defaults } : s
    );
    saveTemplateSets(updatedSets);
    setTemplateSets(updatedSets);
    syncTemplatesToCloud(updatedSets, activeTemplateSetId);
    addLog('Przywrócono domyślne zadania w szablonie i zsynchronizowano', 'info');
  };

  const handleResetToFactory = () => {
    const factory = resetTemplatesToFactory();
    setTemplates(factory);
    setHasCustomDefault(false);
    const updatedSets = templateSets.map((s) =>
      s.id === activeTemplateSetId ? { ...s, templates: factory } : s
    );
    saveTemplateSets(updatedSets);
    setTemplateSets(updatedSets);
    syncTemplatesToCloud(updatedSets, activeTemplateSetId);
    addLog('Przywrócono fabryczny szablon (7 zadań) i zsynchronizowano', 'info');
  };

  return (
    <div className={`min-h-screen ${currentTab === 'calendar' || currentTab === 'tasks' ? 'h-screen max-h-screen overflow-hidden' : ''} bg-neutral-100/70 text-neutral-900 font-sans flex flex-col w-full overflow-x-clip`}>
      <Navbar
        user={user}
        onLogout={handleLogout}
        calendar={selectedCalendar}
        taskList={travelTaskList}
        isSyncing={isSyncing}
        activeTab={currentTab}
        onSelectTab={handleSelectTab}
        eventsCount={events.length}
        tasksCount={tasks.filter((t) => t.status === 'needsAction').length}
        isSidebarOpen={isAppSidebarOpen}
        onToggleSidebar={handleToggleAppSidebar}
        onOpenWidgetsModal={() => setShowWidgetsModal(true)}
      />

      {/* Missing Permissions Banner (403 recovery) */}
      {(calendarPermissionError || tasksPermissionError) && user && (
        <div className="bg-rose-600 text-white px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm font-medium shadow-md shrink-0 z-40 border-b border-rose-700 animate-in slide-in-from-top-1">
          <div className="flex items-center space-x-2.5 min-w-0">
            <AlertCircle className="w-5 h-5 shrink-0 text-white" />
            <div className="min-w-0">
              <span className="font-bold">Brak uprawnień Google (403): </span>
              <span className="text-rose-100">
                {calendarPermissionError && tasksPermissionError
                  ? 'Brak uprawnień do Kalendarza i Zadań Google.'
                  : calendarPermissionError
                    ? 'Brak uprawnień do Kalendarza Google.'
                    : 'Brak uprawnień do Zadań Google.'}{' '}
                Podczas logowania należy zaznaczyć oba pola wyboru na ekranie zgody Google.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleReauthorizeGoogle}
            disabled={isSigningIn}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-white hover:bg-rose-50 text-rose-900 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer active:scale-95 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSigningIn ? 'animate-spin' : ''}`} />
            <span>Nadaj uprawnienia (ekran zgody)</span>
          </button>
        </div>
      )}

      {/* Session Expired Banner with One-Click Reauthorization */}
      {isSessionExpired && user && (
        <div className="bg-amber-500 text-amber-950 px-3 sm:px-4 py-2 flex items-center justify-between gap-2 text-xs sm:text-sm font-medium shadow-md shrink-0 z-30 animate-in slide-in-from-top-1 border-b border-amber-600">
          <div className="flex items-center space-x-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-900 animate-pulse shrink-0" />
            <span className="font-bold text-amber-950 truncate">
              Sesja Google wygasła. Wyświetlane są dane z pamięci urządzenia.
            </span>
            <span className="hidden md:inline text-amber-900 text-xs">
              (kliknij, aby zsynchronizować najświeższe wydarzenia i zadania)
            </span>
          </div>
          <button
            type="button"
            onClick={handleQuickReauthorize}
            disabled={isSigningIn}
            className="inline-flex items-center space-x-1.5 px-3 py-1 bg-neutral-900 hover:bg-neutral-800 active:bg-black text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer active:scale-95 shrink-0"
          >
            <span>Odśwież uprawnienia Google (1 kliknięcie)</span>
          </button>
        </div>
      )}

      {activeWidgetConfig && (
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white px-3 sm:px-4 py-2 flex items-center justify-between text-xs shadow-md shrink-0 z-30 animate-in slide-in-from-top-1">
          <div className="flex items-center space-x-2 min-w-0">
            <span className="px-2 py-0.5 rounded-full bg-white/20 font-bold text-[10px] uppercase tracking-wider shrink-0 flex items-center gap-1">
              <Smartphone className="w-3 h-3" />
              Widget
            </span>
            <span className="font-bold text-xs sm:text-sm truncate">
              {activeWidgetConfig.name}
            </span>
            <span className="text-[11px] text-blue-200 hidden md:inline truncate">
              • {activeWidgetConfig.description}
            </span>
          </div>
          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setEditingWidgetInBar(activeWidgetConfig)}
              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white font-semibold cursor-pointer transition active:scale-95 text-xs"
              title="Dostosuj widoczność kalendarzy, list zadań i terminów dla tego widgetu"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Edytuj widget</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveWidgetConfig(null);
                const url = new URL(window.location.href);
                url.searchParams.delete('widget');
                window.history.replaceState({}, '', url.toString());
              }}
              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-blue-100 hover:text-white transition cursor-pointer text-xs"
              title="Przejdź do pełnego widoku aplikacji"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Zamknij widget</span>
            </button>
          </div>
        </div>
      )}

      <main className={
        currentTab === 'calendar' || currentTab === 'tasks'
          ? "flex-1 w-full min-h-0 overflow-hidden flex flex-col p-1.5 sm:p-2.5"
          : "flex-1 w-full mx-auto px-2 sm:px-4 md:px-6 lg:px-8 max-w-full lg:max-w-7xl 2xl:max-w-[1536px] py-3 sm:py-5 md:py-6 space-y-3.5 sm:space-y-6 min-w-0"
      }>
        {!user ? (
          <LoginView
            onSignIn={handleSignIn}
            onManualToken={handleManualToken}
            isSigningIn={isSigningIn}
            errorMessage={authError}
          />
        ) : currentTab === 'calendar' ? (
          /* TAB 2: Full in-app Calendar View with Schedule, Day, Week, 4-Weeks, Month */
          <div className="w-full h-full min-h-0 overflow-hidden">
            <FullCalendarView
              initialViewMode={activeWidgetConfig?.calendarViewMode}
              calendars={calendars}
              selectedCalendar={selectedCalendar}
              selectedCalendarIds={selectedCalendarIds}
              onSelectCalendar={handleSelectCalendar}
              onToggleCalendarId={handleToggleCalendarId}
              onSelectAllCalendars={handleSelectAllCalendars}
              onClearAllCalendars={handleClearAllCalendars}
              events={events}
              isLoadingEvents={isLoadingEvents}
              onRefreshEvents={handleRefreshEvents}
              generatedTripMap={generatedTripMap}
              onGenerateTasksForEvent={handleGenerateTasksForEvent}
              onCreateCalendarEvent={handleCreateCalendarEvent}
              onUpdateCalendarEvent={handleUpdateCalendarEvent}
              onDeleteCalendarEvent={handleDeleteCalendarEvent}
              templates={templates}
              calendarPermissionError={calendarPermissionError}
              onReauthorizeCalendar={handleReauthorizeGoogle}
              dateRange={fullCalendarDateRange}
              onChangeDateRange={(newRange) => {
                setFullCalendarDateRange(newRange);
                localStorage.setItem('travel_full_calendar_date_range', JSON.stringify(newRange));
              }}
              taskLists={taskLists}
              selectedTaskListIds={calendarViewTaskListIds}
              onToggleTaskListId={handleToggleCalendarViewTaskListId}
              onSelectAllTaskLists={handleSelectAllCalendarViewTaskLists}
              onClearAllTaskLists={handleClearAllCalendarViewTaskLists}
              tasks={tasks}
              onToggleTask={handleToggleTask}
              onUpdateTask={handleUpdateTask}
              onDeleteTask={handleDeleteTask}
              onAddTaskManually={handleAddTaskManually}
              onAddTaskToCalendar={handleAddTaskToCalendar}
              showTaskListsFilter={true}
              isSidebarOpen={isAppSidebarOpen}
              onCloseSidebar={handleCloseAppSidebar}
              onToggleSidebar={handleToggleAppSidebar}
            />
          </div>
        ) : currentTab === 'tasks' ? (
          /* TAB 3: Dedicated Tasks with Left Vertical Sidebar */
          <div className="w-full h-full min-h-0 overflow-hidden">
            <TasksListCard
              calendars={calendars}
              taskList={travelTaskList}
              taskLists={taskLists}
              selectedTaskListIds={selectedTaskListIds}
              onSelectTaskList={handleSelectTaskList}
              onToggleTaskListId={handleToggleTaskListId}
              onSelectAllTaskLists={handleSelectAllTaskLists}
              onClearAllTaskLists={handleClearAllTaskLists}
              onCreateTaskList={handleCreateTaskList}
              tasks={tasks}
              isLoadingTasks={isLoadingTasks}
              onRefreshTasks={handleRefreshTasks}
              onToggleTask={handleToggleTask}
              onDeleteTask={handleDeleteTask}
              onAddTaskManually={handleAddTaskManually}
              onUpdateTask={handleUpdateTask}
              onAddTaskToCalendar={handleAddTaskToCalendar}
              templates={templates}
              onClearAllNotes={handleCleanAllTaskNotes}
              onRemoveHoursFromTitles={handleRemoveHoursFromExistingTaskTitles}
              onCleanHoursAndNotes={handleCleanHoursAndNotesFromExistingTasks}
              onSyncTasksToCalendar={handleSyncTasksToCalendar}
              includeTimeInTitle={includeTimeInTitle}
              onToggleIncludeTimeInTitle={handleToggleIncludeTimeInTitle}
              tasksPermissionError={tasksPermissionError}
              onReauthorizeTasks={handleReauthorizeGoogle}
              dateRange={tasksViewTasksDateRange}
              onChangeDateRange={setTasksViewTasksDateRange}
              includeNoDateTasks={tasksViewTasksIncludeNoDate}
              onToggleIncludeNoDateTasks={(val) => {
                setTasksViewTasksIncludeNoDate(val);
                localStorage.setItem('travel_tasks_view_tasks_include_no_date', String(val));
              }}
              layoutVariant="sidebar"
              isSidebarOpen={isAppSidebarOpen}
              onCloseSidebar={handleCloseAppSidebar}
              onToggleSidebar={handleToggleAppSidebar}
            />
          </div>
        ) : currentTab === 'templates' ? (
          /* TAB 3: Dedicated Task Templates Manager */
          <div className="space-y-4">
            <TemplatesManager
              templates={templates}
              onSaveTemplates={handleSaveTemplates}
              templateSets={templateSets}
              activeTemplateSetId={activeTemplateSetId}
              onSelectTemplateSet={handleSelectTemplateSet}
              onCreateTemplateSet={handleCreateTemplateSet}
              onDuplicateTemplateSet={handleDuplicateTemplateSet}
              onDeleteTemplateSet={handleDeleteTemplateSet}
              onUpdateTemplateSetMeta={handleUpdateTemplateSetMeta}
              onSetAsDefaultTemplateSet={handleSetAsDefaultTemplateSet}
              onSaveAsDefault={handleSaveAsDefault}
              onResetTemplates={handleResetTemplates}
              onResetToFactory={handleResetToFactory}
              hasCustomDefault={hasCustomDefault}
              taskLists={taskLists}
              calendars={calendars}
              selectedCalendar={selectedCalendar}
              onSelectCalendar={handleSelectCalendar}
              onAddToCalendar={handleAddToCalendarFromTemplates}
            />
          </div>
        ) : (
          /* TAB 1: Main Dashboard (Default) */
          <>
            {/* Layout Mode Selector for Main Window - ukryte w widoku mobile, widoczne na komputerze (sm+) */}
            <div className="hidden sm:flex sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-white p-2.5 sm:p-3 rounded-2xl border border-neutral-200/90 shadow-2xs w-full">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-xs font-bold text-neutral-800">Układ głównego okna:</span>
                <span className="text-xs text-neutral-500 hidden md:inline">
                  Dostosuj rozmieszczenie kalendarza i listy zadań
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center bg-neutral-100 p-1 rounded-xl border border-neutral-200">
                  <button
                    type="button"
                    id="layout-toggle-side-by-side"
                    onClick={() => handleSelectLayoutMode('side-by-side')}
                    className={`inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      layoutMode === 'side-by-side'
                        ? 'bg-white text-blue-700 shadow-2xs border border-neutral-200'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                    title="Kalendarz i lista zadań obok siebie"
                  >
                    <Columns className="w-3.5 h-3.5 text-blue-600" />
                    <span>Obok siebie</span>
                  </button>

                  <button
                    type="button"
                    id="layout-toggle-stacked"
                    onClick={() => handleSelectLayoutMode('stacked')}
                    className={`inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      layoutMode === 'stacked'
                        ? 'bg-white text-blue-700 shadow-2xs border border-neutral-200'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                    title="Lista zadań pod kalendarzem"
                  >
                    <Rows className="w-3.5 h-3.5 text-blue-600" />
                    <span className="hidden sm:inline">Zadania pod kalendarzem</span>
                    <span className="sm:hidden">Pod sobą</span>
                  </button>
                </div>

                <button
                  type="button"
                  id="btn-open-full-calendar-quick"
                  onClick={() => handleSelectTab('calendar')}
                  className="inline-flex items-center space-x-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition cursor-pointer"
                  title="Otwórz pełny widok kalendarza wewnątrz aplikacji"
                >
                  <CalendarIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Widok kalendarza &rarr;</span>
                  <span className="sm:hidden">Kalendarz &rarr;</span>
                </button>
              </div>
            </div>

            {/* Main Operational Grid / Stack: Calendar & Google Tasks */}
            <div
              className={
                layoutMode === 'side-by-side'
                  ? 'grid grid-cols-1 lg:grid-cols-2 gap-5 min-h-[480px] items-stretch w-full'
                  : 'flex flex-col space-y-6 w-full min-h-[480px]'
              }
            >
              {/* Calendar */}
              <div className="w-full min-w-0 flex flex-col">
                <CalendarCard
                  calendars={calendars}
                  selectedCalendar={selectedCalendar}
                  selectedCalendarIds={selectedCalendarIds}
                  onSelectCalendar={handleSelectCalendar}
                  onToggleCalendarId={handleToggleCalendarId}
                  onSelectAllCalendars={handleSelectAllCalendars}
                  onClearAllCalendars={handleClearAllCalendars}
                  events={events}
                  isLoadingEvents={isLoadingEvents}
                  onRefreshEvents={handleRefreshEvents}
                  generatedTripMap={generatedTripMap}
                  onGenerateTasksForEvent={handleGenerateTasksForEvent}
                  generatingEventId={generatingEventId}
                  generationProgress={generationProgress}
                  onSimulateEvent={handleSimulateEvent}
                  onDeleteEvent={handleDeleteCalendarEvent}
                  onCreateCalendarEvent={handleCreateCalendarEvent}
                  onUpdateCalendarEvent={handleUpdateCalendarEvent}
                  templates={templates}
                  templateSets={templateSets}
                  activeTemplateSetId={activeTemplateSetId}
                  onSelectTemplateSet={handleSelectTemplateSet}
                  includeTimeInTitle={includeTimeInTitle}
                  onToggleIncludeTimeInTitle={handleToggleIncludeTimeInTitle}
                  calendarPermissionError={calendarPermissionError}
                  onReauthorizeCalendar={handleReauthorizeGoogle}
                  dateRange={dashboardCalendarDateRange}
                  onChangeDateRange={setDashboardCalendarDateRange}
                  tasks={tasks}
                  taskLists={taskLists}
                  onAddTaskManually={handleAddTaskManually}
                  showControls={dashboardCalendarControlsOpen}
                  onToggleControls={() => setDashboardCalendarControlsOpen((p) => !p)}
                />
              </div>

              {/* Google Tasks with List Selector & Clean Titles */}
              <div className="w-full min-w-0 flex flex-col">
                <TasksListCard
                  calendars={calendars}
                  taskList={travelTaskList}
                  taskLists={taskLists}
                  selectedTaskListIds={selectedTaskListIds}
                  onSelectTaskList={handleSelectTaskList}
                  onToggleTaskListId={handleToggleTaskListId}
                  onSelectAllTaskLists={handleSelectAllTaskLists}
                  onClearAllTaskLists={handleClearAllTaskLists}
                  onCreateTaskList={handleCreateTaskList}
                  tasks={tasks}
                  isLoadingTasks={isLoadingTasks}
                  onRefreshTasks={handleRefreshTasks}
                  onToggleTask={handleToggleTask}
                  onDeleteTask={handleDeleteTask}
                  onAddTaskManually={handleAddTaskManually}
                  onUpdateTask={handleUpdateTask}
                  onAddTaskToCalendar={handleAddTaskToCalendar}
                  templates={templates}
                  onClearAllNotes={handleCleanAllTaskNotes}
                  onRemoveHoursFromTitles={handleRemoveHoursFromExistingTaskTitles}
                  onCleanHoursAndNotes={handleCleanHoursAndNotesFromExistingTasks}
                  onSyncTasksToCalendar={handleSyncTasksToCalendar}
                  includeTimeInTitle={includeTimeInTitle}
                  onToggleIncludeTimeInTitle={handleToggleIncludeTimeInTitle}
                  tasksPermissionError={tasksPermissionError}
                  onReauthorizeTasks={handleReauthorizeGoogle}
                  dateRange={dashboardTasksDateRange}
                  onChangeDateRange={setDashboardTasksDateRange}
                  includeNoDateTasks={dashboardTasksIncludeNoDate}
                  onToggleIncludeNoDateTasks={(val) => {
                    setDashboardTasksIncludeNoDate(val);
                    localStorage.setItem('travel_dashboard_tasks_include_no_date', String(val));
                  }}
                  showControls={dashboardTasksControlsOpen}
                  onToggleControls={() => setDashboardTasksControlsOpen((p) => !p)}
                />
              </div>
            </div>

            {/* Template Manager supporting Multiple Templates */}
            <TemplatesManager
              templates={templates}
              onSaveTemplates={handleSaveTemplates}
              templateSets={templateSets}
              activeTemplateSetId={activeTemplateSetId}
              onSelectTemplateSet={handleSelectTemplateSet}
              onCreateTemplateSet={handleCreateTemplateSet}
              onDuplicateTemplateSet={handleDuplicateTemplateSet}
              onDeleteTemplateSet={handleDeleteTemplateSet}
              onUpdateTemplateSetMeta={handleUpdateTemplateSetMeta}
              onSetAsDefaultTemplateSet={handleSetAsDefaultTemplateSet}
              onSaveAsDefault={handleSaveAsDefault}
              onResetTemplates={handleResetTemplates}
              onResetToFactory={handleResetToFactory}
              hasCustomDefault={hasCustomDefault}
              taskLists={taskLists}
              calendars={calendars}
              selectedCalendar={selectedCalendar}
              onSelectCalendar={handleSelectCalendar}
              onAddToCalendar={handleAddToCalendarFromTemplates}
            />
          </>
        )}
      </main>

      {/* Footer */}
      {currentTab !== 'calendar' && currentTab !== 'tasks' && (
        <footer className="border-t border-neutral-200/80 py-4 bg-white text-xs text-neutral-500 text-center shrink-0">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p>
              Zadania &amp; Kalendarz &bull; Integracja Google Calendar &amp; Google Tasks
            </p>
            <p className="text-[11px] text-neutral-400">
              Wielozestawowe szablony &bull; Czyste tytuły zadań &bull; Zadania z konkretnymi godzinami w Kalendarzu
            </p>
          </div>
        </footer>
      )}

      {/* Toast powiadomienia o wyjściu z aplikacji na urządzeniach mobilnych */}
      {showExitToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/95 text-white text-xs px-4 py-2.5 rounded-full shadow-2xl border border-neutral-700/60 backdrop-blur-md flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-2 select-none pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
          <span>Naciśnij ponownie, aby wyjść z aplikacji</span>
        </div>
      )}

      {/* Modal zarządzania widgetami mobilnymi */}
      <MobileWidgetsModal
        isOpen={showWidgetsModal}
        onClose={() => setShowWidgetsModal(false)}
        calendars={calendars}
        taskLists={taskLists}
        onLaunchWidget={(conf) => {
          applyWidgetConfig(conf);
          const url = new URL(window.location.href);
          url.searchParams.set('widget', conf.id);
          window.history.replaceState({}, '', url.toString());
        }}
      />

      {/* Modal edycji widgetu wywołany z paska trybu widgetu */}
      {editingWidgetInBar && (
        <WidgetEditModal
          isOpen={!!editingWidgetInBar}
          config={editingWidgetInBar}
          calendars={calendars}
          taskLists={taskLists}
          onClose={() => setEditingWidgetInBar(null)}
          onSave={(updated) => {
            saveWidgetConfig(updated);
            applyWidgetConfig(updated);
            setEditingWidgetInBar(null);
          }}
          onReset={(id) => {
            const def = resetWidgetConfig(id);
            applyWidgetConfig(def);
            setEditingWidgetInBar(def);
          }}
        />
      )}

      {/* Wskaźnik trybu offline */}
      <OfflineIndicator />
    </div>
  );
}
