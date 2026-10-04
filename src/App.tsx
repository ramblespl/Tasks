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
  auth,
} from './services/firebaseAuth';
import {
  loadCloudTemplates,
  saveCloudTemplates,
  subscribeToCloudTemplates,
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
import { AutoSyncStatus } from './components/AutoSyncStatus';
import { FullCalendarView } from './components/FullCalendarView';
import { Columns, Rows, Calendar as CalendarIcon, LayoutDashboard, Layers, ListTodo } from 'lucide-react';
import {
  DateRangeState,
  getCalendarViewDefaultDateRange,
  getDashboardCalendarDefaultDateRange,
  getDashboardTasksDefaultDateRange,
  getTasksViewTasksDefaultDateRange,
} from './utils/dateFilterUtils';

export type DashboardLayoutMode = 'side-by-side' | 'stacked';

export default function App() {
  // Auth state
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Calendars & Events state
  const [calendars, setCalendars] = useState<CalendarListItem[]>([]);
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
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);

  // Google Tasks state
  const [taskLists, setTaskLists] = useState<GoogleTaskList[]>([]);
  const [travelTaskList, setTravelTaskList] = useState<GoogleTaskList | null>(null);
  const [selectedTaskListIds, setSelectedTaskListIds] = useState<string[]>([ALL_TASK_LISTS_ID]);
  const [tasks, setTasks] = useState<GoogleTaskItem[]>([]);
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

  // Hour in task title preference (default: false)
  const [includeTimeInTitle, setIncludeTimeInTitle] = useState<boolean>(() => {
    const saved = localStorage.getItem('travel_include_time_in_title');
    return saved !== null ? saved === 'true' : false;
  });

  const handleToggleIncludeTimeInTitle = (val: boolean) => {
    setIncludeTimeInTitle(val);
    localStorage.setItem('travel_include_time_in_title', String(val));
  };

  // --- Cloud (Firestore) Templates Synchronization Across All Devices ---
  useEffect(() => {
    const syncUserId = auth.currentUser?.uid || user?.uid;
    if (!syncUserId) return;

    let isMounted = true;

    // 1. Initial fetch from Firestore
    loadCloudTemplates(syncUserId)
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
          addLog('Pomyślnie zsynchronizowano szablony zadań z chmury (Firestore)', 'info');
        } else {
          // If Firestore is empty for this user, upload the current local template sets
          const currentSets = loadTemplateSets();
          const currentActiveId = getActiveTemplateSetId();
          saveCloudTemplates(syncUserId, currentSets, currentActiveId).catch((err) => {
            console.warn('Nie udało się zapisać początkowych szablonów w chmurze:', err);
          });
        }
      })
      .catch((err) => {
        console.warn('Błąd pobierania szablonów z Firestore:', err);
      });

    // 2. Real-time subscription for changes across devices
    const unsubscribe = subscribeToCloudTemplates(
      syncUserId,
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
  }, [user?.uid, auth.currentUser?.uid]);

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
    () => getCalendarViewDefaultDateRange()
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
      const res = await googleSignIn();
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

  // Handle Manual Access Token
  const handleManualToken = async (manualToken: string) => {
    try {
      setIsSigningIn(true);
      setAuthError(null);
      const googleUser = await setManualAccessToken(manualToken);
      setUser(googleUser);
      setToken(manualToken.trim());
      addLog(`Połączono za pomocą tokenu jako ${googleUser.displayName || googleUser.email}`, 'success');
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
        setTasksPermissionError(null);
      } catch (err: any) {
        console.error('Błąd pobierania zadań:', err);
        const msg = err.message || 'Błąd pobierania zadań';
        if (msg.includes('403') || msg.toLowerCase().includes('brak uprawnień')) {
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
        setLastSyncTime(new Date());
        setCalendarPermissionError(null);
      } catch (err: any) {
        console.error('Błąd pobierania wydarzeń:', err);
        const msg = err.message || 'Błąd kalendarza';
        if (msg.includes('403') || msg.toLowerCase().includes('brak uprawnień')) {
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
        if (msg.includes('403') || msg.toLowerCase().includes('brak uprawnień')) {
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
        if (msg.includes('403') || msg.toLowerCase().includes('brak uprawnień')) {
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

  // Manual Refresh Events - robustly fetches fresh calendars and events
  const handleRefreshEvents = async (overrideCalendarIds?: string[]) => {
    if (!token) return;
    try {
      setIsLoadingEvents(true);
      addLog('Odświeżanie kalendarzy i wydarzeń z Google...', 'info');
      const freshCalendars = await listUserCalendars(token);
      setCalendars(freshCalendars);

      const targetIds =
        overrideCalendarIds && overrideCalendarIds.length > 0
          ? overrideCalendarIds
          : selectedCalendarIds.length > 0
            ? selectedCalendarIds
            : [ALL_CALENDARS_ID];

      const eventItems = await getEventsForCalendars(token, targetIds, freshCalendars);
      setEvents(eventItems);
      setLastSyncTime(new Date());
      setCalendarPermissionError(null);
      addLog(`Odświeżono kalendarz: załadowano ${eventItems.length} wydarzeń`, 'success');
    } catch (err: any) {
      console.error('Błąd odświeżania kalendarza:', err);
      const msg = err.message || 'Błąd odświeżania kalendarza';
      if (msg.includes('403') || msg.toLowerCase().includes('brak uprawnień')) {
        setCalendarPermissionError(msg);
      }
      addLog(`Błąd odświeżania kalendarza: ${msg}`, 'error');
    } finally {
      setIsLoadingEvents(false);
    }
  };

  // Manual Refresh Tasks - robustly fetches fresh lists and tasks
  const handleRefreshTasks = async (overrideTaskListIds?: string[]) => {
    if (!token) return;
    try {
      setIsLoadingTasks(true);
      addLog('Odświeżanie list zadań i pozycji z Google...', 'info');
      const freshLists = await listTaskLists(token);
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
        taskItems = await getAllTaskListsTasks(token, freshLists);
      } else {
        taskItems = await getTasksForSelectedLists(token, targetListIds, freshLists);
      }
      setTasks(taskItems);
      setTasksPermissionError(null);
      addLog(`Odświeżono zadania: załadowano ${taskItems.length} pozycji`, 'success');
    } catch (err: any) {
      console.error('Błąd odświeżania zadań:', err);
      const msg = err.message || 'Błąd odświeżania zadań';
      if (msg.includes('403') || msg.toLowerCase().includes('brak uprawnień')) {
        setTasksPermissionError(msg);
      }
      addLog(`Błąd odświeżania zadań: ${msg}`, 'error');
    } finally {
      setIsLoadingTasks(false);
    }
  };

  // Switch App Navigation Tab
  const handleSelectTab = (tab: AppNavTab) => {
    setCurrentTab(tab);
    setIsAppSidebarOpen(false);
    localStorage.setItem('travel_app_active_tab', tab);
  };

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
          await createGoogleTask(token, specificTaskListId, {
            title: cleanTitle,
            notes: undefined,
            due: dueDetails.rfc3339,
          });
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
            await createCalendarEvent(token, destCalendarId, {
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
    const effectiveListId =
      target?.taskListId ||
      (travelTaskList && travelTaskList.id !== ALL_TASK_LISTS_ID
        ? travelTaskList.id
        : taskLists.find((tl) => tl.id !== ALL_TASK_LISTS_ID)?.id || '');
    if (!effectiveListId) return;

    const previous = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    try {
      await deleteGoogleTask(token, effectiveListId, taskId);
      addLog('Zadanie zostało usunięte z Google Tasks', 'info');
    } catch (err: any) {
      setTasks(previous);
      addLog(`Nie udało się usunąć zadania: ${err.message}`, 'error');
    }
  };

  // Update task (title, due, notes) with ability to assign/move to another task list
  const handleUpdateTask = async (
    taskId: string,
    patch: { title?: string; notes?: string; due?: string },
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
      // Check if user requested moving to a different list
      if (newTaskListId && newTaskListId !== ALL_TASK_LISTS_ID && newTaskListId !== sourceListId) {
        const targetList = taskLists.find((l) => l.id === newTaskListId);
        const moved = await moveGoogleTaskToList(token, sourceListId, newTaskListId, taskId, {
          title: patch.title || existing?.title || 'Zadanie',
          notes: patch.notes !== undefined ? patch.notes : existing?.notes,
          due: patch.due !== undefined ? patch.due : existing?.due,
          status: existing?.status,
        });

        // Update local tasks list with new ID and target list metadata
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  id: moved.id,
                  ...patch,
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
        await updateGoogleTask(token, sourceListId, taskId, patch);
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t))
        );
        addLog(`Zaktualizowano zadanie "${patch.title || 'zadanie'}" w Google Tasks`, 'success');
      }
    } catch (err: any) {
      addLog(`Nie udało się zaktualizować zadania: ${err.message}`, 'error');
      throw err;
    }
  };

  // Add task to Google Calendar with +1h duration (start from template/custom hour, end = start + 1h)
  const handleAddTaskToCalendar = async (task: GoogleTaskItem, startTime?: string, colorId?: string) => {
    if (!token || !selectedCalendar) {
      addLog('Brak aktywnego kalendarza do dodania terminu.', 'error');
      return;
    }
    try {
      const cleanTitle = cleanTaskTitle(task.title);
      let taskHour = startTime || '18:00';
      const matchedTpl = templates.find(
        (t) => cleanTaskTitle(t.title).toLowerCase() === cleanTitle.toLowerCase()
      );
      if (!startTime) {
        if (matchedTpl?.time) {
          taskHour = matchedTpl.time;
        }
      }
      const eventColorId = colorId || matchedTpl?.colorId || undefined;

      // Determine date
      let baseDate = new Date();
      if (task.due) {
        baseDate = new Date(task.due);
      } else {
        baseDate.setDate(baseDate.getDate() + 1);
      }

      const [hh, mm] = taskHour.split(':').map(Number);
      const startDt = new Date(baseDate);
      startDt.setHours(isNaN(hh) ? 18 : hh, isNaN(mm) ? 0 : mm, 0, 0);

      // Duration: exactly 30 min
      const endDt = new Date(startDt.getTime() + 30 * 60 * 1000);

      const pad = (n: number) => String(n).padStart(2, '0');
      const startIso = `${startDt.getFullYear()}-${pad(startDt.getMonth() + 1)}-${pad(startDt.getDate())}T${pad(startDt.getHours())}:${pad(startDt.getMinutes())}:00`;
      const endIso = `${endDt.getFullYear()}-${pad(endDt.getMonth() + 1)}-${pad(endDt.getDate())}T${pad(endDt.getHours())}:${pad(endDt.getMinutes())}:00`;

      const startFormatted = `${pad(startDt.getHours())}:${pad(startDt.getMinutes())}`;
      const endFormatted = `${pad(endDt.getHours())}:${pad(endDt.getMinutes())}`;

      const targetCalendarId =
        selectedCalendar.id === ALL_CALENDARS_ID
          ? (findPrimaryCalendar(calendars)?.id || 'primary')
          : selectedCalendar.id;

      await createCalendarEvent(token, targetCalendarId, {
        summary: cleanTitle,
        description: `Termin zadania z listy "${travelTaskList?.title || 'Zadania'}". Czas trwania: 30 min (${startFormatted} - ${endFormatted}).${task.notes ? `\n\nNotatki: ${task.notes}` : ''}`,
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
        `Dodano termin do Kalendarza Google: "${cleanTitle}" (${startFormatted} - ${endFormatted}, czas trwania: 30 min)`,
        'success'
      );
      await fetchEvents(token, selectedCalendar.id);
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
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw';
      let start: any;
      let end: any;

      if (payload.isAllDay) {
        start = { date: payload.startDate };
        end = { date: payload.endDate || payload.startDate };
      } else {
        const sTime = payload.startTime || '09:00';
        // Default 30 min duration
        let eTime = payload.endTime;
        if (!eTime) {
          const [h, m] = sTime.split(':').map(Number);
          const totalMin = (isNaN(h) ? 9 : h) * 60 + (isNaN(m) ? 0 : m) + 30;
          const endH = Math.floor(totalMin / 60) % 24;
          const endM = totalMin % 60;
          const pad = (n: number) => String(n).padStart(2, '0');
          eTime = `${pad(endH)}:${pad(endM)}`;
        }
        start = {
          dateTime: `${payload.startDate}T${sTime}:00`,
          timeZone: tz,
        };
        end = {
          dateTime: `${payload.endDate || payload.startDate}T${eTime}:00`,
          timeZone: tz,
        };
      }

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
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw';
      let start: any;
      let end: any;

      if (payload.isAllDay) {
        start = { date: payload.startDate };
        end = { date: payload.endDate || payload.startDate };
      } else {
        const sTime = payload.startTime || '09:00';
        let eTime = payload.endTime;
        if (!eTime) {
          const [h, m] = sTime.split(':').map(Number);
          const totalMin = (isNaN(h) ? 9 : h) * 60 + (isNaN(m) ? 0 : m) + 30;
          const endH = Math.floor(totalMin / 60) % 24;
          const endM = totalMin % 60;
          const pad = (n: number) => String(n).padStart(2, '0');
          eTime = `${pad(endH)}:${pad(endM)}`;
        }
        start = {
          dateTime: `${payload.startDate}T${sTime}:00`,
          timeZone: tz,
        };
        end = {
          dateTime: `${payload.endDate || payload.startDate}T${eTime}:00`,
          timeZone: tz,
        };
      }

      const existing = events.find((e) => e.id === eventId);
      const sourceCalendarId =
        existing?.calendarId ||
        (selectedCalendar.id === ALL_CALENDARS_ID
          ? (findPrimaryCalendar(calendars)?.id || 'primary')
          : selectedCalendar.id);

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
      return enhancedItem;
    } catch (err: any) {
      addLog(`Błąd podczas aktualizacji wydarzenia w kalendarzu: ${err.message}`, 'error');
      throw err;
    }
  };

  // Add task manually to a specific target list
  const handleAddTaskManually = async (
    title: string,
    notes?: string,
    due?: string,
    targetTaskListId?: string
  ) => {
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
      const newTask = await createGoogleTask(token, effectiveListId, {
        title: cleanTitle,
        notes: notes || undefined,
        due,
      });
      const taskWithList: GoogleTaskItem = {
        ...newTask,
        taskListId: effectiveListId,
        taskListTitle: targetListObj?.title || 'Zadania',
      };
      setTasks((prev) => [taskWithList, ...prev]);
      addLog(
        `Dodano nowe zadanie "${cleanTitle}" do listy "${targetListObj?.title || effectiveListId}"`,
        'success'
      );
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
        const { time: extractedTime, cleanTitle } = extractTaskTitleAndTime(task.title, task.notes, templates);
        const resolvedTime = extractedTime || '18:00';

        let datePart = '';
        if (task.due) {
          datePart = task.due.includes('T') ? task.due.split('T')[0] : task.due;
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
    const syncUserId = auth.currentUser?.uid || user?.uid;
    if (syncUserId) {
      saveCloudTemplates(syncUserId, sets, activeId).catch((err) => {
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
    addLog('Przywrócono domyślne zadania w szablonie', 'info');
  };

  const handleResetToFactory = () => {
    const factory = resetTemplatesToFactory();
    setTemplates(factory);
    setHasCustomDefault(false);
    addLog('Przywrócono fabryczny szablon (7 zadań)', 'info');
  };

  return (
    <div className="min-h-screen bg-neutral-100/70 text-neutral-900 font-sans flex flex-col w-full overflow-x-clip">
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
      />

      <main className={
        currentTab === 'calendar' || currentTab === 'tasks'
          ? "flex-1 w-full h-[calc(100dvh-4rem)] p-2 sm:p-3 overflow-hidden flex flex-col min-h-0"
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
              showTaskListsFilter={true}
              onBackToDashboard={() => handleSelectTab('dashboard')}
              isSidebarOpen={isAppSidebarOpen}
              onCloseSidebar={handleCloseAppSidebar}
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
              onBackToDashboard={() => handleSelectTab('dashboard')}
              isSidebarOpen={isAppSidebarOpen}
              onCloseSidebar={handleCloseAppSidebar}
            />
          </div>
        ) : currentTab === 'templates' ? (
          /* TAB 3: Dedicated Task Templates Manager */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-neutral-900 tracking-tight">
                  Zarządzanie szablonami zadań
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Konfiguruj zestawy szablonów dla różnych rodzajów projektów i zadań (Spotkania, Projekty, Rutyny codzienne).
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleSelectTab('dashboard')}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-250 transition cursor-pointer shadow-2xs"
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-blue-600" />
                <span>Powrót do pulpitu</span>
              </button>
            </div>

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
            {/* Top Auto-Sync & Status Bar */}
            <AutoSyncStatus
              autoSync={autoSync}
              onToggleAutoSync={setAutoSync}
              lastSyncTime={lastSyncTime}
              onSyncNow={handleRefreshEvents}
              isSyncing={isSyncing}
              logs={logs}
              onClearLogs={() => setLogs([])}
            />

            {/* Layout Mode Selector for Main Window */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-white p-2.5 sm:p-3 rounded-2xl border border-neutral-200/90 shadow-2xs w-full">
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
                  onDownloadIcs={handleDownloadIcsForTrip}
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
    </div>
  );
}
