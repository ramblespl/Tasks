import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Clock,
  MapPin,
  Sparkles,
  Pencil,
  Trash2,
  Copy,
  X,
  AlertCircle,
  CheckCircle2,
  CalendarRange,
  ListFilter,
  Eye,
  ListTodo,
  RotateCw,
  Columns,
  Grid,
  LayoutDashboard,
  MoreHorizontal,
} from 'lucide-react';
import { CalendarListItem, CalendarEventItem, TaskTemplateItem, GoogleTaskList, GoogleTaskItem } from '../types';
import { expandAllTasksWithRecurrence, isEventRecurring } from '../utils/recurrenceUtils';
import {
  ALL_CALENDARS_ID,
  ALL_CALENDARS_ITEM,
  findPrimaryCalendar,
  isEventLongerThan24hOrAllDay,
  getEventDateSpan,
} from '../services/googleCalendarApi';
import { ALL_TASK_LISTS_ID } from '../services/googleTasksApi';
import { extractTaskTitleAndTime, cleanTaskTitle } from '../services/templateStorage';
import { ChecklistPopover, ChecklistOption } from './ChecklistPopover';
import { DateRangeFilterBar } from './DateRangeFilterBar';
import {
  DateRangeState,
  getDefaultDateRange,
  getCalendarViewDefaultDateRange,
  filterCalendarEvents,
  getTodayDateString,
} from '../utils/dateFilterUtils';
import {
  getGoogleEventColor,
  GOOGLE_EVENT_COLORS,
  GOOGLE_EVENT_COLOR_OPTIONS,
  GoogleColorDefinition,
  isCalendarTaskEvent,
  BIRCH_TASK_COLOR,
} from '../utils/googleCalendarColors';
import { computeDayTimedEventLayouts } from '../utils/calendarLayout';

const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);

export type CalendarViewMode = 'harmonogram' | 'dzien' | 'tydzien' | '4tygodnie' | 'miesiac';

interface FullCalendarViewProps {
  calendars: CalendarListItem[];
  selectedCalendar: CalendarListItem | null;
  selectedCalendarIds?: string[];
  onSelectCalendar: (calendar: CalendarListItem) => void;
  onToggleCalendarId?: (id: string) => void;
  onSelectAllCalendars?: () => void;
  onClearAllCalendars?: () => void;
  events: CalendarEventItem[];
  isLoadingEvents: boolean;
  onRefreshEvents: () => void;
  generatedTripMap: Record<string, string>;
  onGenerateTasksForEvent?: (event: CalendarEventItem) => void;
  onCreateCalendarEvent?: (eventData: {
    summary: string;
    description?: string;
    startDate: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
    isAllDay?: boolean;
    location?: string;
    colorId?: string;
    calendarId?: string;
  }) => Promise<CalendarEventItem | void>;
  onUpdateCalendarEvent?: (
    eventId: string,
    eventData: {
      summary: string;
      description?: string;
      startDate: string;
      endDate?: string;
      startTime?: string;
      endTime?: string;
      isAllDay?: boolean;
      location?: string;
      colorId?: string;
      calendarId?: string;
    }
  ) => Promise<CalendarEventItem | void>;
  onDeleteCalendarEvent?: (eventId: string) => Promise<void>;
  templates?: TaskTemplateItem[];
  calendarPermissionError?: string | null;
  onReauthorizeCalendar?: () => void;
  dateRange?: DateRangeState;
  onChangeDateRange?: (newRange: DateRangeState) => void;
  taskLists?: GoogleTaskList[];
  selectedTaskListIds?: string[];
  onToggleTaskListId?: (id: string) => void;
  onSelectAllTaskLists?: () => void;
  onClearAllTaskLists?: () => void;
  tasks?: GoogleTaskItem[];
  onToggleTask?: (task: GoogleTaskItem) => Promise<void>;
  showTaskListsFilter?: boolean;
  onBackToDashboard?: () => void;
  isSidebarOpen?: boolean;
  onCloseSidebar?: () => void;
}

const MONTH_NAMES_PL = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
];

const MONTH_NAMES_GENITIVE_PL = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
];

const DAY_NAMES_PL = [
  'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela',
];

const DAY_NAMES_SHORT_PL = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nie'];

// Helper to format Date to YYYY-MM-DD
const toDateString = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Helper to check if two dates are same day
const isSameDay = (d1: Date, d2: Date): boolean => {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

// Get start of week (Monday)
const getStartOfWeek = (d: Date): Date => {
  const res = new Date(d);
  const day = res.getDay();
  const diff = res.getDate() - day + (day === 0 ? -6 : 1);
  res.setDate(diff);
  res.setHours(0, 0, 0, 0);
  return res;
};

export const FullCalendarView: React.FC<FullCalendarViewProps> = ({
  calendars,
  selectedCalendar,
  selectedCalendarIds = [ALL_CALENDARS_ID],
  onSelectCalendar,
  onToggleCalendarId,
  onSelectAllCalendars,
  onClearAllCalendars,
  events,
  isLoadingEvents,
  onRefreshEvents,
  generatedTripMap,
  onGenerateTasksForEvent,
  onCreateCalendarEvent,
  onUpdateCalendarEvent,
  onDeleteCalendarEvent,
  templates = [],
  calendarPermissionError,
  onReauthorizeCalendar,
  dateRange: propDateRange,
  onChangeDateRange,
  taskLists = [],
  selectedTaskListIds = [ALL_TASK_LISTS_ID],
  onToggleTaskListId,
  onSelectAllTaskLists,
  onClearAllTaskLists,
  tasks = [],
  onToggleTask,
  showTaskListsFilter = false,
  onBackToDashboard,
  isSidebarOpen = false,
  onCloseSidebar,
}) => {
  const checklistCalendarOptions: ChecklistOption[] = useMemo(() => {
    return calendars
      .filter((c) => c.id !== ALL_CALENDARS_ID)
      .map((c) => {
        const cleanSummary = c.summary
          ?.replace(/\s*[([](?:główny|glowny|primary)[)\]]/gi, '')
          ?.replace(/\s*-\s*(?:główny|glowny|primary)/gi, '')
          ?.trim() || c.summary;

        return {
          id: c.id,
          title: cleanSummary,
          badge: undefined,
          color: c.backgroundColor || '#3b82f6',
        };
      });
  }, [calendars]);

  const checklistTaskListOptions: ChecklistOption[] = useMemo(() => {
    return taskLists
      .filter((tl) => tl.id !== ALL_TASK_LISTS_ID)
      .map((tl) => ({
        id: tl.id,
        title: tl.title,
        color: '#a79b8e',
      }));
  }, [taskLists]);
  // Current view mode (default: month view)
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() => {
    const saved = localStorage.getItem('travel_calendar_view_mode') as CalendarViewMode;
    return saved && ['harmonogram', 'dzien', 'tydzien', '4tygodnie', 'miesiac'].includes(saved)
      ? saved
      : 'miesiac';
  });

  const handleSelectViewMode = (mode: CalendarViewMode) => {
    setViewMode(mode);
    localStorage.setItem('travel_calendar_view_mode', mode);
  };

  // Cursor date for navigation
  const [cursorDate, setCursorDate] = useState<Date>(() => new Date());

  // Filter: 'all' | 'events' | 'tasks' (persisted in localStorage)
  const [filterType, setFilterType] = useState<'all' | 'events' | 'tasks'>(() => {
    const saved = localStorage.getItem('travel_calendar_filter_type');
    return saved === 'events' || saved === 'trips' || saved === 'tasks' || saved === 'all'
      ? (saved === 'trips' ? 'events' : (saved as any))
      : 'all';
  });

  const handleSelectFilterType = (type: 'all' | 'events' | 'tasks') => {
    setFilterType(type);
    localStorage.setItem('travel_calendar_filter_type', type);
  };

  // Date range filter state (defaults to 'all' = all dates in full calendar view)
  const [internalDateRange, setInternalDateRange] = useState<DateRangeState>(() => {
    return getCalendarViewDefaultDateRange();
  });

  const activeDateRange = propDateRange || internalDateRange;

  const handleDateRangeChange = (newRange: DateRangeState) => {
    if (onChangeDateRange) {
      onChangeDateRange(newRange);
    } else {
      setInternalDateRange(newRange);
      localStorage.setItem('full_calendar_date_range', JSON.stringify(newRange));
    }
  };

  // Event modal state (Add / Edit)
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventItem | null>(null);
  const [eventSummary, setEventSummary] = useState('');
  const [eventCalendarId, setEventCalendarId] = useState<string>('');
  const [eventStartDate, setEventStartDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');
  const [eventStartTime, setEventStartTime] = useState('09:00');
  const [eventEndTime, setEventEndTime] = useState('09:30');
  const [eventIsAllDay, setEventIsAllDay] = useState(true);
  const [eventLocation, setEventLocation] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventColorId, setEventColorId] = useState<string>('7');
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [eventModalError, setEventModalError] = useState<string | null>(null);

  // Selected event preview popup/modal
  const [previewEvent, setPreviewEvent] = useState<CalendarEventItem | null>(null);

  // In-app deletion confirmation modal state
  const [eventToDelete, setEventToDelete] = useState<CalendarEventItem | null>(null);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleStartTimeChange = (newStartTime: string) => {
    setEventStartTime(newStartTime);
    const [h, m] = newStartTime.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      const totalMin = h * 60 + m + 30;
      const endH = Math.floor(totalMin / 60) % 24;
      const endM = totalMin % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      setEventEndTime(`${pad(endH)}:${pad(endM)}`);
    }
  };

  const handleConfirmDeleteEvent = async () => {
    if (!onDeleteCalendarEvent || !eventToDelete) return;
    try {
      setIsDeletingEvent(true);
      setDeleteError(null);
      await onDeleteCalendarEvent(eventToDelete.id);
      if (previewEvent?.id === eventToDelete.id) {
        setPreviewEvent(null);
      }
      if (editingEvent?.id === eventToDelete.id) {
        setShowEventModal(false);
        setEditingEvent(null);
      }
      setEventToDelete(null);
    } catch (err: any) {
      setDeleteError(err.message || 'Wystąpił błąd podczas usuwania wydarzenia.');
    } finally {
      setIsDeletingEvent(false);
    }
  };

  // Navigation handlers
  const handleGoToday = () => {
    setCursorDate(new Date());
  };

  const handlePrev = () => {
    const next = new Date(cursorDate);
    if (viewMode === 'dzien') {
      next.setDate(next.getDate() - 1);
    } else if (viewMode === 'tydzien') {
      next.setDate(next.getDate() - 7);
    } else if (viewMode === '4tygodnie') {
      next.setDate(next.getDate() - 28);
    } else {
      // Month & Harmonogram
      next.setMonth(next.getMonth() - 1);
    }
    setCursorDate(next);
  };

  const handleNext = () => {
    const next = new Date(cursorDate);
    if (viewMode === 'dzien') {
      next.setDate(next.getDate() + 1);
    } else if (viewMode === 'tydzien') {
      next.setDate(next.getDate() + 7);
    } else if (viewMode === '4tygodnie') {
      next.setDate(next.getDate() + 28);
    } else {
      // Month & Harmonogram
      next.setMonth(next.getMonth() + 1);
    }
    setCursorDate(next);
  };

  const weekScrollRef = useRef<HTMLDivElement>(null);
  const dayScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ((viewMode === 'tydzien' || viewMode === 'dzien') && (weekScrollRef.current || dayScrollRef.current)) {
      const nowHour = new Date().getHours();
      const initialHour = Math.max(0, Math.min(nowHour > 6 ? nowHour - 1 : 7, 18));
      const targetScroll = initialHour * 48;
      if (weekScrollRef.current) weekScrollRef.current.scrollTop = targetScroll;
      if (dayScrollRef.current) dayScrollRef.current.scrollTop = targetScroll;
    }
  }, [viewMode, cursorDate]);

  // Open modal to add event
  const handleOpenAddEvent = (presetDate?: string, presetTime?: string) => {
    setEditingEvent(null);
    setEventSummary('');
    const primaryCal = findPrimaryCalendar(calendars);
    const defaultCalId =
      selectedCalendar && selectedCalendar.id !== ALL_CALENDARS_ID
        ? selectedCalendar.id
        : primaryCal?.id || 'primary';
    setEventCalendarId(defaultCalId);
    const d = presetDate || toDateString(cursorDate);
    setEventStartDate(d);
    setEventEndDate(d);
    if (presetTime) {
      setEventStartTime(presetTime);
      const [h, m] = presetTime.split(':').map(Number);
      const totalMin = (isNaN(h) ? 9 : h) * 60 + (isNaN(m) ? 0 : m) + 30;
      const endH = Math.floor(totalMin / 60) % 24;
      const endM = totalMin % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      setEventEndTime(`${pad(endH)}:${pad(endM)}`);
      setEventIsAllDay(false);
    } else {
      setEventStartTime('09:00');
      setEventEndTime('09:30');
      setEventIsAllDay(true);
    }
    setEventLocation('');
    setEventDescription('');
    setEventColorId(''); // Default Google Calendar color (matching Pulpit)
    setEventModalError(null);
    setShowEventModal(true);
  };

  // Open modal to edit event
  const handleOpenEditEvent = (event: CalendarEventItem) => {
    setEditingEvent(event);
    setEventSummary(event.summary || '');
    const currentCalId =
      event.calendarId ||
      (selectedCalendar && selectedCalendar.id !== ALL_CALENDARS_ID
        ? selectedCalendar.id
        : findPrimaryCalendar(calendars)?.id || 'primary');
    setEventCalendarId(currentCalId);
    const hasDateTime = !!event.start.dateTime;
    setEventIsAllDay(!hasDateTime);

    if (hasDateTime) {
      const s = new Date(event.start.dateTime!);
      const e = event.end?.dateTime ? new Date(event.end.dateTime) : s;
      setEventStartDate(toDateString(s));
      setEventEndDate(toDateString(e));
      const pad = (n: number) => String(n).padStart(2, '0');
      setEventStartTime(`${pad(s.getHours())}:${pad(s.getMinutes())}`);
      setEventEndTime(`${pad(e.getHours())}:${pad(e.getMinutes())}`);
    } else {
      setEventStartDate(event.start.date || toDateString(new Date()));
      setEventEndDate(event.end?.date || event.start.date || toDateString(new Date()));
      setEventStartTime('09:00');
      setEventEndTime('09:30');
    }

    setEventLocation(event.location || '');
    setEventDescription(event.description || '');
    setEventColorId(event.colorId || '');
    setEventModalError(null);
    setShowEventModal(true);
  };

  // Open modal to duplicate event (pre-fills copy and saves as new event)
  const handleDuplicateEvent = (event: CalendarEventItem) => {
    setEditingEvent(null);
    setEventSummary(`${event.summary || 'Wydarzenie'} (Kopia)`);
    const currentCalId =
      event.calendarId ||
      (selectedCalendar && selectedCalendar.id !== ALL_CALENDARS_ID
        ? selectedCalendar.id
        : findPrimaryCalendar(calendars)?.id || 'primary');
    setEventCalendarId(currentCalId);
    const hasDateTime = !!event.start.dateTime;
    setEventIsAllDay(!hasDateTime);

    if (hasDateTime) {
      const s = new Date(event.start.dateTime!);
      const e = event.end?.dateTime ? new Date(event.end.dateTime) : s;
      setEventStartDate(toDateString(s));
      setEventEndDate(toDateString(e));
      const pad = (n: number) => String(n).padStart(2, '0');
      setEventStartTime(`${pad(s.getHours())}:${pad(s.getMinutes())}`);
      setEventEndTime(`${pad(e.getHours())}:${pad(e.getMinutes())}`);
    } else {
      setEventStartDate(event.start.date || toDateString(new Date()));
      setEventEndDate(event.end?.date || event.start.date || toDateString(new Date()));
      setEventStartTime('09:00');
      setEventEndTime('09:30');
    }

    setEventLocation(event.location || '');
    setEventDescription(event.description || '');
    setEventColorId(event.colorId || '');
    setEventModalError(null);
    setShowEventModal(true);
  };

  // Save event submit
  const handleSaveEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventSummary.trim()) {
      setEventModalError('Wprowadź nazwę wydarzenia.');
      return;
    }
    if (!eventStartDate) {
      setEventModalError('Wybierz datę rozpoczęcia.');
      return;
    }

    try {
      setIsSavingEvent(true);
      setEventModalError(null);

      const payload = {
        summary: eventSummary.trim(),
        description: eventDescription.trim() || undefined,
        startDate: eventStartDate,
        endDate: eventEndDate || eventStartDate,
        startTime: eventIsAllDay ? undefined : eventStartTime,
        endTime: eventIsAllDay ? undefined : eventEndTime,
        isAllDay: eventIsAllDay,
        location: eventLocation.trim() || undefined,
        colorId: eventColorId || undefined,
        calendarId: eventCalendarId || undefined,
      };

      if (editingEvent) {
        if (onUpdateCalendarEvent) {
          await onUpdateCalendarEvent(editingEvent.id, payload);
        }
      } else {
        if (onCreateCalendarEvent) {
          await onCreateCalendarEvent(payload);
        }
      }

      setShowEventModal(false);
      setEditingEvent(null);
      if (previewEvent && editingEvent && previewEvent.id === editingEvent.id) {
        setPreviewEvent(null);
      }
    } catch (err: any) {
      console.error('Błąd zapisu wydarzenia:', err);
      setEventModalError(err.message || 'Nie udało się zapisać wydarzenia w kalendarzu.');
    } finally {
      setIsSavingEvent(false);
    }
  };

  // Save event and immediately generate tasks
  const handleSaveAndGenerateTasks = async () => {
    if (!eventSummary.trim()) {
      setEventModalError('Wprowadź nazwę wydarzenia.');
      return;
    }
    if (!eventStartDate) {
      setEventModalError('Wybierz datę rozpoczęcia.');
      return;
    }

    try {
      setIsSavingEvent(true);
      setEventModalError(null);

      const payload = {
        summary: eventSummary.trim(),
        description: eventDescription.trim() || undefined,
        startDate: eventStartDate,
        endDate: eventEndDate || eventStartDate,
        startTime: eventIsAllDay ? undefined : eventStartTime,
        endTime: eventIsAllDay ? undefined : eventEndTime,
        isAllDay: eventIsAllDay,
        location: eventLocation.trim() || undefined,
        colorId: eventColorId || undefined,
        calendarId: eventCalendarId || undefined,
      };

      let savedEvent: CalendarEventItem;

      if (editingEvent) {
        if (onUpdateCalendarEvent) {
          const res = await onUpdateCalendarEvent(editingEvent.id, payload);
          savedEvent = (res as CalendarEventItem) || {
            ...editingEvent,
            summary: payload.summary,
            description: payload.description,
            location: payload.location,
            colorId: payload.colorId,
            calendarId: payload.calendarId || editingEvent.calendarId,
            start: payload.isAllDay
              ? { date: payload.startDate }
              : { dateTime: `${payload.startDate}T${payload.startTime || '09:00'}:00` },
            end: payload.isAllDay
              ? { date: payload.endDate }
              : { dateTime: `${payload.endDate}T${payload.endTime || '10:00'}:00` },
          };
        } else {
          savedEvent = editingEvent;
        }
      } else {
        if (onCreateCalendarEvent) {
          const res = await onCreateCalendarEvent(payload);
          const calObj = calendars.find((c) => c.id === payload.calendarId);
          savedEvent = (res as CalendarEventItem) || {
            id: `evt-${Date.now()}`,
            summary: payload.summary,
            description: payload.description,
            location: payload.location,
            colorId: payload.colorId,
            calendarId: payload.calendarId,
            calendarSummary: calObj?.summary,
            start: payload.isAllDay
              ? { date: payload.startDate }
              : { dateTime: `${payload.startDate}T${payload.startTime || '09:00'}:00` },
            end: payload.isAllDay
              ? { date: payload.endDate }
              : { dateTime: `${payload.endDate}T${payload.endTime || '10:00'}:00` },
          };
        } else {
          throw new Error('Tworzenie wydarzeń nie jest dostępne');
        }
      }

      setShowEventModal(false);
      setEditingEvent(null);
      if (previewEvent && editingEvent && previewEvent.id === editingEvent.id) {
        setPreviewEvent(null);
      }

      if (onGenerateTasksForEvent) {
        onGenerateTasksForEvent(savedEvent);
      }
    } catch (err: any) {
      console.error('Błąd zapisu i generowania zadań:', err);
      setEventModalError(err.message || 'Nie udało się zapisać wydarzenia.');
    } finally {
      setIsSavingEvent(false);
    }
  };

  // Delete event handler (triggers in-app confirmation modal)
  const handleDeleteEventClick = (eventId: string) => {
    const target = events.find((e) => e.id === eventId) || (previewEvent?.id === eventId ? previewEvent : null);
    if (target) {
      setEventToDelete(target);
    }
  };

  // Map of template task titles to assigned Google Calendar color (etykieta koloru)
  const templateColorMap = useMemo(() => {
    const map = new Map<string, string>();
    if (templates && templates.length > 0) {
      templates.forEach((tpl) => {
        if (tpl.colorId && GOOGLE_EVENT_COLORS[tpl.colorId]) {
          map.set(cleanTaskTitle(tpl.title).toLowerCase(), tpl.colorId);
        }
      });
    }
    return map;
  }, [templates]);

  // Convert tasks from selected task lists into CalendarEventItem representations
  const taskEvents = useMemo(() => {
    if (!tasks || tasks.length === 0) return [];

    const isAllSelected =
      !selectedTaskListIds ||
      selectedTaskListIds.length === 0 ||
      selectedTaskListIds.includes(ALL_TASK_LISTS_ID);

    // Only include tasks that actually have a due date (bez zadań bez terminu w kalendarzu)
    const filteredTasks = tasks.filter((t) => {
      if (!t.due) return false;
      if (isAllSelected) return true;
      if (t.taskListId && selectedTaskListIds.includes(t.taskListId)) return true;
      return false;
    });

    const expandedOccurrences = expandAllTasksWithRecurrence(
      filteredTasks,
      activeDateRange,
      false // do not display tasks without due date in calendar
    );

    const resultEvents: CalendarEventItem[] = [];

    expandedOccurrences.forEach((t) => {
      const { time, cleanTitle } = extractTaskTitleAndTime(t.title, t.notes, templates);
      const currentDueStr = t.due ? (t.due.includes('T') ? t.due.split('T')[0] : t.due) : '';
      if (!currentDueStr) return;

      let start: { dateTime?: string; date?: string } = {};
      let end: { dateTime?: string; date?: string } = {};

      if (time && currentDueStr) {
        const [h, m] = time.split(':').map(Number);
        const endH = (h + Math.floor((m + 30) / 60)) % 24;
        const endM = (m + 30) % 60;
        const pad = (n: number) => String(n).padStart(2, '0');
        const endTimeStr = `${pad(endH)}:${pad(endM)}`;

        start = { dateTime: `${currentDueStr}T${time}:00` };
        end = { dateTime: `${currentDueStr}T${endTimeStr}:00` };
      } else {
        start = { date: currentDueStr };
        end = { date: currentDueStr };
      }

      // Check if task matches a template that has an assigned Google Calendar color (etykieta koloru)
      const matchedColorId = templateColorMap.get(cleanTitle.toLowerCase());

      const recurrenceLabel = t.recurrenceLabel ? ` [${t.recurrenceLabel}]` : '';
      resultEvents.push({
        id: `gtask-${t.id}`,
        summary: cleanTitle,
        description: `[Zadanie Google Tasks]\nZadanie z listy: ${t.taskListTitle || 'Google Tasks'}\nStatus: ${t.status === 'completed' ? 'Ukończone' : 'Do wykonania'}${recurrenceLabel ? `\nCzęstotliwość: ${t.recurrenceLabel}` : ''}${t.notes ? `\n\nNotatka:\n${t.notes}` : ''}`,
        start,
        end,
        calendarId: t.taskListId || 'task-list',
        calendarSummary: t.taskListTitle ? `Lista: ${t.taskListTitle}` : 'Google Tasks',
        colorId: matchedColorId || 'birch',
        recurringEventId: t.isRecurringOccurrence ? (t.originalTaskId || t.id) : undefined,
      });
    });

    return resultEvents;
  }, [tasks, selectedTaskListIds, templates, activeDateRange, templateColorMap]);

  // Combined events with task items
  const combinedEvents = useMemo(() => {
    if (taskEvents.length === 0) return events;
    return [...events, ...taskEvents];
  }, [events, taskEvents]);

  // Filter events according to filterType and dateRange
  const filteredEvents = useMemo(() => {
    const typeFiltered = combinedEvents.filter((ev) => {
      const isTaskLike =
        ev.id.startsWith('gtask-') ||
        ev.description?.includes('Zadanie z listy') ||
        ev.description?.includes('Godzina wykonania') ||
        ev.description?.includes('[Zadanie Google Tasks]');
      if (filterType === 'events') return !isTaskLike;
      if (filterType === 'tasks') return isTaskLike;
      return true;
    });

    return filterCalendarEvents(typeFiltered, activeDateRange);
  }, [combinedEvents, filterType, activeDateRange]);

  // Helper to extract event start date
  const getEventDate = (ev: CalendarEventItem): Date => {
    const raw = ev.start.dateTime || ev.start.date;
    return raw ? new Date(raw) : new Date();
  };

  // Helper to format event time
  const formatEventTime = (ev: CalendarEventItem): string => {
    if (isEventLongerThan24hOrAllDay(ev) || !ev.start.dateTime) return 'Cały dzień';
    const s = new Date(ev.start.dateTime);
    const pad = (n: number) => String(n).padStart(2, '0');
    let res = `${pad(s.getHours())}:${pad(s.getMinutes())}`;
    if (ev.end?.dateTime) {
      const e = new Date(ev.end.dateTime);
      res += ` – ${pad(e.getHours())}:${pad(e.getMinutes())}`;
    }
    return res;
  };

  // Title for current header based on viewMode
  const headerTitle = useMemo(() => {
    const year = cursorDate.getFullYear();
    const month = cursorDate.getMonth();

    if (viewMode === 'dzien') {
      const dayName = DAY_NAMES_PL[cursorDate.getDay() === 0 ? 6 : cursorDate.getDay() - 1];
      return `${dayName}, ${cursorDate.getDate()} ${MONTH_NAMES_GENITIVE_PL[month]} ${year}`;
    }

    if (viewMode === 'tydzien') {
      const start = getStartOfWeek(cursorDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      if (start.getMonth() === end.getMonth()) {
        return `${start.getDate()} – ${end.getDate()} ${MONTH_NAMES_GENITIVE_PL[start.getMonth()]} ${start.getFullYear()}`;
      }
      return `${start.getDate()} ${MONTH_NAMES_GENITIVE_PL[start.getMonth()]} – ${end.getDate()} ${MONTH_NAMES_GENITIVE_PL[end.getMonth()]} ${end.getFullYear()}`;
    }

    if (viewMode === '4tygodnie') {
      const start = getStartOfWeek(cursorDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 27);
      return `${start.getDate()} ${MONTH_NAMES_GENITIVE_PL[start.getMonth()]} – ${end.getDate()} ${MONTH_NAMES_GENITIVE_PL[end.getMonth()]} ${end.getFullYear()}`;
    }

    // Miesiąc & Harmonogram
    return `${MONTH_NAMES_PL[month]} ${year}`;
  }, [cursorDate, viewMode]);

  // Render Month View Data
  const monthGridDays = useMemo(() => {
    const year = cursorDate.getFullYear();
    const month = cursorDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Day of week for 1st day (0 = Sunday, 1 = Monday, ...)
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const days: { date: Date; isCurrentMonth: boolean; dateStr: string }[] = [];

    // Prev month padding
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: d, isCurrentMonth: false, dateStr: toDateString(d) });
    }

    // Current month days
    for (let d = 1; d <= lastDayOfMonth.getDate(); d++) {
      const date = new Date(year, month, d);
      days.push({ date, isCurrentMonth: true, dateStr: toDateString(date) });
    }

    // Next month padding to fill complete weeks (up to 35 or 42 cells)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const date = new Date(year, month + 1, d);
      days.push({ date, isCurrentMonth: false, dateStr: toDateString(date) });
    }

    return days;
  }, [cursorDate]);

  // Render 4 Weeks View Data
  const fourWeeksDays = useMemo(() => {
    const start = getStartOfWeek(cursorDate);
    const days: { date: Date; isCurrentMonth: boolean; dateStr: string }[] = [];
    for (let i = 0; i < 28; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push({
        date: d,
        isCurrentMonth: d.getMonth() === cursorDate.getMonth(),
        dateStr: toDateString(d),
      });
    }
    return days;
  }, [cursorDate]);

  // Render Week View Data (7 days)
  const weekDays = useMemo(() => {
    const start = getStartOfWeek(cursorDate);
    const days: { date: Date; dateStr: string; dayIndex: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push({ date: d, dateStr: toDateString(d), dayIndex: i });
    }
    return days;
  }, [cursorDate]);

  // Map events to date string for fast lookup spanning multiple days if needed
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEventItem[]> = {};
    filteredEvents.forEach((ev) => {
      const dates = getEventDateSpan(ev);
      dates.forEach((dateKey) => {
        if (!map[dateKey]) map[dateKey] = [];
        if (!map[dateKey].some((item) => item.id === ev.id)) {
          map[dateKey].push(ev);
        }
      });
    });
    // Sort each day's events: all-day / >24h first, then by start time
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => {
        const isAllDayA = isEventLongerThan24hOrAllDay(a);
        const isAllDayB = isEventLongerThan24hOrAllDay(b);
        if (isAllDayA && !isAllDayB) return -1;
        if (!isAllDayA && isAllDayB) return 1;
        const timeA = a.start.dateTime ? a.start.dateTime.substring(11) : '00:00';
        const timeB = b.start.dateTime ? b.start.dateTime.substring(11) : '00:00';
        return timeA.localeCompare(timeB);
      });
    });
    return map;
  }, [filteredEvents]);

  const todayStr = toDateString(new Date());

  return (
    <div className="bg-white rounded-2xl border border-neutral-200/90 shadow-sm overflow-hidden h-full w-full min-h-0 relative flex flex-col">
      {/* Backdrop overlay na całym ekranie */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 transition-opacity cursor-pointer"
          onClick={onCloseSidebar}
          aria-hidden="true"
        />
      )}

      {/* LEFT SIDEBAR: Menu boczne rozwijane na pełną wysokość całego ekranu (overlay drawer) */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 sm:w-80 bg-white border-r border-neutral-200 shadow-2xl flex flex-col h-full overflow-hidden select-none transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
      >
        {/* Drawer Header (dopasowany do wysokości górnego paska aplikacji) */}
        <div className="h-14 sm:h-16 px-3.5 sm:px-4 border-b border-neutral-200 flex items-center justify-between shrink-0 bg-neutral-50/90">
          <div className="flex items-center space-x-2.5">
            {onCloseSidebar && (
              <button
                type="button"
                onClick={onCloseSidebar}
                className="p-1.5 rounded-full hover:bg-neutral-200/70 text-neutral-600 transition cursor-pointer"
                title="Ukryj menu boczne (...)"
                aria-label="Ukryj menu boczne"
              >
                <MoreHorizontal className="w-5 h-5 stroke-[2.5]" />
              </button>
            )}
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 shadow-2xs">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-neutral-900 uppercase tracking-wider block">
                Menu kalendarza
              </span>
              <span className="text-[10px] text-neutral-500 block -mt-0.5">
                Google Workspace
              </span>
            </div>
          </div>
          {onCloseSidebar && (
            <button
              type="button"
              onClick={onCloseSidebar}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 transition cursor-pointer"
              title="Zamknij menu"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Scrollable controls */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-3.5 space-y-3.5 bg-neutral-50/40">
        {/* 1. Google Calendar "+ Utwórz" Button */}
        {onCreateCalendarEvent && (
          <button
            type="button"
            id="btn-google-create-event"
            onClick={() => handleOpenAddEvent()}
            className="w-full inline-flex items-center justify-center space-x-2.5 px-4 py-2.5 bg-white hover:bg-neutral-50 text-neutral-800 rounded-xl text-xs sm:text-sm font-semibold border border-neutral-250 shadow-xs hover:shadow-md transition-all cursor-pointer"
            title="Utwórz nowe wydarzenie w Kalendarzu Google"
          >
            <span className="w-5 h-5 text-blue-600 font-bold flex items-center justify-center text-xl leading-none">
              +
            </span>
            <span className="text-neutral-800 font-semibold">Utwórz wydarzenie</span>
          </button>
        )}

        {/* 2. Nawigacja okresu (Tytuł, Dzisiaj, Poprzedni, Następny, Odśwież) */}
        <div className="bg-white p-2.5 rounded-xl border border-neutral-200/90 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold text-neutral-900 tracking-tight truncate" title={headerTitle}>
              {headerTitle}
            </h3>
            <button
              type="button"
              onClick={onRefreshEvents}
              disabled={isLoadingEvents}
              className="p-1 rounded-lg text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 transition-colors cursor-pointer disabled:opacity-50"
              title="Odśwież wydarzenia z Kalendarza Google"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingEvents ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={handleGoToday}
              className="flex-1 py-1 px-2 rounded-lg text-xs font-semibold text-neutral-700 hover:bg-neutral-100 border border-neutral-250 transition-colors cursor-pointer text-center"
            >
              Dzisiaj
            </button>
            <button
              type="button"
              onClick={handlePrev}
              className="p-1.5 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 border border-neutral-250 transition-colors cursor-pointer"
              title="Poprzedni okres"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="p-1.5 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 border border-neutral-250 transition-colors cursor-pointer"
              title="Następny okres"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 3. Pionowe menu widoków kalendarza */}
        <div className="space-y-1">
          <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider px-1">
            Widok kalendarza
          </span>
          <div className="flex flex-col space-y-0.5 bg-white p-1 rounded-xl border border-neutral-200">
            <button
              type="button"
              id="view-mode-miesiac"
              onClick={() => handleSelectViewMode('miesiac')}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                viewMode === 'miesiac'
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <span className="flex items-center space-x-2">
                <Calendar className="w-3.5 h-3.5" />
                <span>Miesiąc</span>
              </span>
            </button>

            <button
              type="button"
              id="view-mode-4tygodnie"
              onClick={() => handleSelectViewMode('4tygodnie')}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                viewMode === '4tygodnie'
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <span className="flex items-center space-x-2">
                <Grid className="w-3.5 h-3.5" />
                <span>4 tygodnie</span>
              </span>
            </button>

            <button
              type="button"
              id="view-mode-tydzien"
              onClick={() => handleSelectViewMode('tydzien')}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                viewMode === 'tydzien'
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <span className="flex items-center space-x-2">
                <Columns className="w-3.5 h-3.5" />
                <span>Tydzień</span>
              </span>
            </button>

            <button
              type="button"
              id="view-mode-dzien"
              onClick={() => handleSelectViewMode('dzien')}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                viewMode === 'dzien'
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <span className="flex items-center space-x-2">
                <Clock className="w-3.5 h-3.5" />
                <span>Dzień</span>
              </span>
            </button>

            <button
              type="button"
              id="view-mode-harmonogram"
              onClick={() => handleSelectViewMode('harmonogram')}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                viewMode === 'harmonogram'
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <span className="flex items-center space-x-2">
                <ListTodo className="w-3.5 h-3.5" />
                <span>Harmonogram</span>
              </span>
            </button>
          </div>
        </div>

        {/* 4. Zakres dat (Pionowy DateRangeFilterBar) */}
        <div className="bg-white p-2.5 rounded-xl border border-neutral-200">
          <DateRangeFilterBar
            orientation="vertical"
            range={activeDateRange}
            onChangeRange={handleDateRangeChange}
            totalCount={events.length}
            filteredCount={filteredEvents.length}
            accentColor="blue"
            idPrefix="full-calendar-date-filter"
          />
        </div>

        {/* 5. Typy wpisów (Filtr: Wszystkie / Wydarzenia / Zadania) */}
        <div className="space-y-1">
          <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider px-1">
            Typy wpisów
          </span>
          <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-xl border border-neutral-200 text-[11px]">
            <button
              type="button"
              onClick={() => handleSelectFilterType('all')}
              className={`py-1 px-1 rounded-lg text-center font-medium transition cursor-pointer ${
                filterType === 'all'
                  ? 'bg-neutral-800 text-white font-semibold'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              Wszystkie
            </button>
            <button
              type="button"
              onClick={() => handleSelectFilterType('events')}
              className={`py-1 px-1 rounded-lg text-center font-medium transition cursor-pointer ${
                filterType === 'events'
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              Wydarzenia
            </button>
            <button
              type="button"
              onClick={() => handleSelectFilterType('tasks')}
              className={`py-1 px-1 rounded-lg text-center font-medium transition cursor-pointer ${
                filterType === 'tasks'
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              Zadania
            </button>
          </div>
        </div>

        {/* 6. Kalendarze Google */}
        {calendars.length > 0 && onToggleCalendarId && (
          <div className="bg-white p-2.5 rounded-xl border border-neutral-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                Kalendarze ({calendars.length})
              </span>
              {onSelectAllCalendars && onClearAllCalendars && (
                <div className="space-x-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={onSelectAllCalendars}
                    className="text-blue-600 hover:underline cursor-pointer"
                  >
                    Wszystkie
                  </button>
                  <span className="text-neutral-300">•</span>
                  <button
                    type="button"
                    onClick={onClearAllCalendars}
                    className="text-neutral-500 hover:underline cursor-pointer"
                  >
                    Wyczyść
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
              {calendars.map((cal) => {
                const isChecked =
                  selectedCalendarIds.includes(ALL_CALENDARS_ID) ||
                  selectedCalendarIds.includes(cal.id);
                return (
                  <label
                    key={cal.id}
                    className="flex items-center space-x-2 text-xs text-neutral-700 hover:text-neutral-900 cursor-pointer py-0.5 select-none"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleCalendarId(cal.id)}
                      className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: cal.backgroundColor || '#3b82f6' }}
                    />
                    <span className="truncate text-[11px]" title={cal.summary}>
                      {cal.summary}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* 7. Listy zadań w kalendarzu */}
        {(showTaskListsFilter || (taskLists && taskLists.length > 0)) &&
          taskLists.length > 0 &&
          onToggleTaskListId && (
            <div className="bg-white p-2.5 rounded-xl border border-neutral-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                  Listy zadań ({taskLists.length})
                </span>
                {onSelectAllTaskLists && onClearAllTaskLists && (
                  <div className="space-x-1.5 text-[10px]">
                    <button
                      type="button"
                      onClick={onSelectAllTaskLists}
                      className="text-emerald-600 hover:underline cursor-pointer"
                    >
                      Wszystkie
                    </button>
                    <span className="text-neutral-300">•</span>
                    <button
                      type="button"
                      onClick={onClearAllTaskLists}
                      className="text-neutral-500 hover:underline cursor-pointer"
                    >
                      Wyczyść
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {taskLists.map((tl) => {
                  const isChecked =
                    !selectedTaskListIds ||
                    selectedTaskListIds.length === 0 ||
                    selectedTaskListIds.includes(ALL_TASK_LISTS_ID) ||
                    selectedTaskListIds.includes(tl.id);
                  return (
                    <label
                      key={tl.id}
                      className="flex items-center space-x-2 text-xs text-neutral-700 hover:text-neutral-900 cursor-pointer py-0.5 select-none"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleTaskListId(tl.id)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                      />
                      <span className="truncate text-[11px]" title={tl.title}>
                        {tl.title}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* RIGHT MAIN AREA: Pole wyświetlania kalendarza */}
      <div className="flex-1 w-full min-w-0 h-full flex flex-col bg-white overflow-hidden">
        {/* Top Mini Header Bar */}
        <div className="px-3 sm:px-4 py-2 sm:py-2.5 border-b border-neutral-200 bg-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2 min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-neutral-900 tracking-tight truncate">
              {headerTitle}
            </h2>
            {selectedCalendar && (
              <span
                className="text-xs px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1.5 border shrink-0"
                style={{
                  backgroundColor: selectedCalendar.backgroundColor ? `${selectedCalendar.backgroundColor}15` : '#eff6ff',
                  borderColor: selectedCalendar.backgroundColor ? `${selectedCalendar.backgroundColor}40` : '#bfdbfe',
                  color: selectedCalendar.backgroundColor || '#1d4ed8',
                }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: selectedCalendar.backgroundColor || '#3b82f6' }}
                />
                <span className="truncate max-w-[140px]">{selectedCalendar.summary}</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {onBackToDashboard && (
              <button
                type="button"
                onClick={onBackToDashboard}
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-250 transition cursor-pointer shadow-2xs"
                title="Powrót do pulpitu"
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden sm:inline">Pulpit</span>
              </button>
            )}
            <div className="text-[11px] text-neutral-500">
              {filteredEvents.length === events.length ? (
                <span>{events.length} pozycji</span>
              ) : (
                <span>{filteredEvents.length} z {events.length}</span>
              )}
            </div>
          </div>
        </div>

        {/* Permission Error Banner */}
        {calendarPermissionError && (
          <div className="mx-3 my-2 p-3 rounded-xl bg-amber-50 border border-amber-200/90 text-amber-900 space-y-2 shrink-0">
            <div className="flex items-start space-x-2.5">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                  Brak uprawnień do Google Calendar (403)
                </h4>
                <p className="text-xs text-amber-800 leading-relaxed">
                  {calendarPermissionError}
                </p>
              </div>
            </div>
            {onReauthorizeCalendar && (
              <div className="pt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onReauthorizeCalendar}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Zaloguj ponownie i zaznacz Kalendarz</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Main Calendar View Body */}
        <div className="flex-1 min-h-0 overflow-hidden bg-white min-w-0 w-full flex flex-col">
        {/* VIEW 1: Harmonogram (Agenda) */}
        {viewMode === 'harmonogram' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 w-full">
            <div className="space-y-4 max-w-4xl mx-auto py-2">
            {filteredEvents.length === 0 ? (
              <div className="text-center py-16 text-neutral-400 space-y-2">
                <CalendarIcon className="w-12 h-12 mx-auto text-neutral-300 stroke-1" />
                <p className="text-sm font-semibold text-neutral-700">Brak wydarzeń w wybranym filtrze</p>
                <p className="text-xs">Kliknij „Nowe wydarzenie”, aby dodać wydarzenie do kalendarza.</p>
              </div>
            ) : (
              Object.keys(eventsByDate)
                .sort()
                .map((dateStr) => {
                  const dayEvents = eventsByDate[dateStr];
                  const d = new Date(dateStr);
                  const isToday = dateStr === todayStr;
                  const dayName = DAY_NAMES_PL[d.getDay() === 0 ? 6 : d.getDay() - 1];

                  return (
                    <div key={dateStr} className="space-y-2">
                      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xs py-1.5 flex items-center space-x-2 border-b border-neutral-100">
                        <span
                          className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            isToday ? 'bg-blue-600 text-white' : 'bg-neutral-100 text-neutral-700'
                          }`}
                        >
                          {isToday ? 'Dzisiaj' : dayName}
                        </span>
                        <span className="text-xs font-semibold text-neutral-800">
                          {d.getDate()} {MONTH_NAMES_GENITIVE_PL[d.getMonth()]} {d.getFullYear()}
                        </span>
                        <span className="text-[11px] text-neutral-400">
                          ({dayEvents.length} {dayEvents.length === 1 ? 'pozycja' : 'pozycje'})
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-2 pl-2 sm:pl-4">
                        {dayEvents.map((event) => {
                          const isGenerated = !!generatedTripMap[event.id];
                          const isTask = isCalendarTaskEvent(event);
                          const isRecurring = isEventRecurring(event);
                          const fallbackColor = templateColorMap.get(cleanTaskTitle(event.summary).toLowerCase());
                          const colorDef = getGoogleEventColor(event, isTask, fallbackColor);

                          return (
                            <div
                              key={event.id}
                              onClick={() => setPreviewEvent(event)}
                              style={{
                                borderLeftColor: colorDef.hex,
                                borderLeftWidth: '4px',
                              }}
                              className={`p-3 rounded-xl border transition-all hover:shadow-xs cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                colorDef.id === 'birch'
                                   ? 'bg-[#f7f5f2]/80 border-[#d7d0c7] hover:border-[#a79b8e]'
                                  : isGenerated
                                  ? 'bg-blue-50/30 border-neutral-200 hover:border-neutral-300'
                                  : 'bg-white border-neutral-200 hover:border-neutral-300'
                              }`}
                            >
                              <div className="flex items-start space-x-3 min-w-0">
                                <div className="mt-0.5">
                                  <span className="inline-flex items-center text-xs font-semibold text-neutral-700 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded-md">
                                    <Clock className="w-3 h-3 mr-1 text-neutral-500" />
                                    {formatEventTime(event)}
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center space-x-2">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                                      style={{ backgroundColor: colorDef.hex }}
                                    />
                                    <h4 className="text-sm font-semibold text-neutral-900 truncate">
                                      {event.summary}
                                    </h4>
                                    {isRecurring && (
                                      <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-medium bg-purple-50 text-purple-700 border border-purple-200">
                                        <RotateCw className="w-2.5 h-2.5 mr-1 text-purple-600" />
                                        Powtarzalne
                                      </span>
                                    )}
                                    {isTask && colorDef.id === 'birch' ? (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-[#e8e4de] text-[#4a4137] border border-[#d7d0c7]">
                                        {event.calendarSummary || 'Zadanie'}
                                      </span>
                                    ) : (
                                      <span
                                        className="text-[10px] px-1.5 py-0.5 rounded font-medium border"
                                        style={{
                                          backgroundColor: colorDef.bg,
                                          borderColor: colorDef.border,
                                          color: colorDef.text,
                                        }}
                                      >
                                        {colorDef.name}
                                      </span>
                                    )}
                                  </div>
                                  {event.location && (
                                    <p className="text-xs text-neutral-500 flex items-center space-x-1 mt-0.5 truncate">
                                      <MapPin className="w-3 h-3 text-neutral-400 shrink-0" />
                                      <span>{event.location}</span>
                                    </p>
                                  )}
                                  {event.description && (
                                    <p className="text-[11px] text-neutral-600 line-clamp-1 mt-0.5">
                                      {event.description}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div
                                className="flex items-center space-x-1.5 self-end sm:self-center shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {!isTask && onGenerateTasksForEvent && (
                                  <button
                                    type="button"
                                    onClick={() => onGenerateTasksForEvent(event)}
                                    className="px-2 py-1 rounded-lg text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition cursor-pointer inline-flex items-center space-x-1"
                                    title="Generuj zadania z szablonu dla tego wydarzenia"
                                  >
                                    <Sparkles className="w-3 h-3 text-blue-600" />
                                    <span>Zadania</span>
                                  </button>
                                )}

                                {onUpdateCalendarEvent && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditEvent(event)}
                                    className="p-1.5 rounded-lg text-neutral-600 hover:text-blue-700 hover:bg-blue-50 border border-neutral-200 transition cursor-pointer"
                                    title="Edytuj wydarzenie"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {onCreateCalendarEvent && (
                                  <button
                                    type="button"
                                    onClick={() => handleDuplicateEvent(event)}
                                    className="p-1.5 rounded-lg text-neutral-600 hover:text-blue-700 hover:bg-blue-50 border border-neutral-200 transition cursor-pointer"
                                    title="Duplikuj wydarzenie"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {onDeleteCalendarEvent && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteEventClick(event.id)}
                                    disabled={isDeletingEvent && eventToDelete?.id === event.id}
                                    className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-rose-50 border border-neutral-200 transition cursor-pointer disabled:opacity-50"
                                    title="Usuń z kalendarza"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
            )}
            </div>
          </div>
        )}

        {/* VIEW 2: Dzień (Day view with 24-hour grid from 00:00 to 24:00) */}
        {viewMode === 'dzien' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-4 w-full">
            <div className="max-w-4xl mx-auto py-1 space-y-4">
            {/* Day Header Banner */}
            <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                  Widok Dnia &bull; Siatka 24-godzinna
                </span>
                <h3 className="text-lg font-bold text-neutral-900 mt-0.5">
                  {DAY_NAMES_PL[cursorDate.getDay() === 0 ? 6 : cursorDate.getDay() - 1]},{' '}
                  {cursorDate.getDate()} {MONTH_NAMES_GENITIVE_PL[cursorDate.getMonth()]}{' '}
                  {cursorDate.getFullYear()}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => handleOpenAddEvent(toDateString(cursorDate))}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-2xs cursor-pointer self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Dodaj na ten dzień</span>
              </button>
            </div>

            {/* Events for cursorDate */}
            {(() => {
              const currentDayKey = toDateString(cursorDate);
              const dayEvents = eventsByDate[currentDayKey] || [];
              const isToday = currentDayKey === todayStr;

              const allDayOrLongEvents = dayEvents.filter((ev) => isEventLongerThan24hOrAllDay(ev));
              const timedEvents = dayEvents.filter((ev) => !isEventLongerThan24hOrAllDay(ev));

              // Current time marker calculation
              const now = new Date();
              const currentHour = now.getHours();
              const currentMin = now.getMinutes();
              const currentTop = (currentHour * 60 + currentMin) * (48 / 60);

              return (
                <div className="space-y-4">
                  {/* Top Bar for All-day & >24h events */}
                  {allDayOrLongEvents.length > 0 && (
                    <div className="p-3 bg-amber-50/80 border border-amber-200/90 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          Całodniowe i trwające &gt;24h ({allDayOrLongEvents.length})
                        </span>
                        <span className="text-[10px] text-amber-800 font-semibold bg-amber-100/90 px-2 py-0.5 rounded-md border border-amber-200">
                          Pasek całodniowy
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {allDayOrLongEvents.map((event) => {
                          const isTask = isCalendarTaskEvent(event);
                          const fallbackColor = templateColorMap.get(cleanTaskTitle(event.summary).toLowerCase());
                          const colorDef = getGoogleEventColor(event, isTask, fallbackColor);

                          return (
                            <div
                              key={event.id}
                              onClick={() => setPreviewEvent(event)}
                              style={{
                                backgroundColor: colorDef.bg,
                                borderColor: colorDef.border,
                              }}
                              className="p-2.5 rounded-lg border transition cursor-pointer flex items-center justify-between gap-2 shadow-2xs hover:brightness-95 select-none"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center space-x-1.5">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                                    style={{ backgroundColor: colorDef.hex }}
                                  />
                                  <h5 className="text-xs font-bold truncate" style={{ color: colorDef.text }}>
                                    {event.summary}
                                  </h5>
                                </div>
                                <p className="text-[10px] opacity-80 truncate pl-4" style={{ color: colorDef.text }}>
                                  {getEventDateSpan(event).length > 1 ? `${getEventDateSpan(event).length} dni` : 'Cały dzień'}
                                  {event.location ? ` • ${event.location}` : ''}
                                </p>
                              </div>
                              {isTask && (
                                <span
                                  className="text-[9px] px-1.5 py-0.5 rounded font-bold border shrink-0"
                                  style={{
                                    backgroundColor: colorDef.bg,
                                    borderColor: colorDef.border,
                                    color: colorDef.text,
                                  }}
                                >
                                  Zadanie
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 24-Hour Vertical Grid (00:00 to 24:00 - Od północy do północy) */}
                  <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-2xs">
                    <div className="p-2.5 border-b border-neutral-100 bg-neutral-50/60 flex items-center justify-between text-xs text-neutral-500">
                      <span className="font-medium">Siatka 24-godzinna (od 00:00 do 24:00)</span>
                      <span className="text-[11px]">Kliknij dowolną godzinę, aby dodać wydarzenie</span>
                    </div>

                    <div
                      ref={dayScrollRef}
                      className="overflow-y-auto max-h-[580px] relative flex select-none divide-x divide-neutral-200"
                    >
                      {/* Left Column: 24 Hour Labels (00:00 to 24:00) */}
                      <div className="w-16 shrink-0 bg-neutral-50/70 border-r border-neutral-200 text-right pr-2">
                        {HOURS_24.map((hour) => (
                          <div
                            key={hour}
                            className="h-[48px] border-b border-neutral-100 flex items-start justify-end pt-1"
                          >
                            <span className="text-[10px] font-medium text-neutral-400">
                              {String(hour).padStart(2, '0')}:00
                            </span>
                          </div>
                        ))}
                        <div className="h-[24px] flex items-start justify-end pt-0.5">
                          <span className="text-[10px] font-semibold text-neutral-500">
                            24:00
                          </span>
                        </div>
                      </div>

                      {/* Main Day Timeline Slot Column */}
                      <div className="flex-1 relative h-[1152px] bg-white">
                        {/* Current live time indicator line */}
                        {isToday && (
                          <div
                            className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none flex items-center"
                            style={{ top: `${currentTop}px` }}
                          >
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1.5 shadow-xs" />
                            <span className="text-[9px] font-bold text-red-600 bg-white/90 px-1 py-0.5 rounded shadow-2xs ml-1">
                              Teraz ({String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')})
                            </span>
                          </div>
                        )}

                        {/* 24 Hour Background Clickable Grid Slots */}
                        {HOURS_24.map((hour) => {
                          const timeStr = `${String(hour).padStart(2, '0')}:00`;
                          return (
                            <div
                              key={hour}
                              onClick={() => handleOpenAddEvent(currentDayKey, timeStr)}
                              className="h-[48px] border-b border-neutral-100 hover:bg-blue-50/40 cursor-pointer transition-colors group relative"
                              title={`Kliknij, aby dodać wydarzenie o ${timeStr}`}
                            >
                              <span className="absolute left-3 top-1 text-[10px] font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                + Dodaj wydarzenie o {timeStr}
                              </span>
                            </div>
                          );
                        })}

                        {/* Timed Events positioned with overlap layout & Google Calendar colors */}
                        {(() => {
                          const dayLayouts = computeDayTimedEventLayouts(timedEvents, 48, 1152);
                          return dayLayouts.map((item) => {
                            const ev = item.event;
                            const isTask = isCalendarTaskEvent(ev);
                            const fallbackColor = templateColorMap.get(cleanTaskTitle(ev.summary).toLowerCase());
                            const colorDef = getGoogleEventColor(ev, isTask, fallbackColor);

                            return (
                              <div
                                key={ev.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewEvent(ev);
                                }}
                                style={{
                                  top: `${item.topPx}px`,
                                  height: `${item.heightPx}px`,
                                  left: `${item.leftPercent}%`,
                                  width:
                                    item.widthPercent === 100
                                      ? 'calc(100% - 12px)'
                                      : `calc(${item.widthPercent}% - 8px)`,
                                  backgroundColor: colorDef.hex,
                                  color: colorDef.contrastText,
                                }}
                                className="absolute rounded-xl px-3 py-1.5 text-left border border-black/10 shadow-2xs cursor-pointer z-10 overflow-hidden transition-all hover:z-30 hover:shadow-md flex items-center justify-between gap-3 select-none group"
                                title={`${ev.summary} (${formatEventTime(ev)})`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center space-x-2">
                                    <span className="font-bold text-xs truncate">
                                      {isEventRecurring(ev) ? '🔁 ' : ''}{isTask ? '✓ ' : ''}{ev.summary}
                                    </span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-black/15 shrink-0">
                                      {formatEventTime(ev)}
                                    </span>
                                    {isTask && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-white/20 shrink-0">
                                        Zadanie
                                      </span>
                                    )}
                                  </div>
                                  {item.heightPx >= 44 && ev.location && (
                                    <p className="text-[11px] opacity-90 flex items-center gap-1 truncate mt-0.5">
                                      <MapPin className="w-3 h-3 opacity-75 shrink-0" />
                                      <span>{ev.location}</span>
                                    </p>
                                  )}
                                </div>

                                <div
                                  className="flex items-center space-x-1 shrink-0 opacity-80 group-hover:opacity-100"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {onUpdateCalendarEvent && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditEvent(ev)}
                                      className="p-1 rounded-md bg-black/10 hover:bg-black/20 transition cursor-pointer"
                                      title="Edytuj"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  )}
                                  {onCreateCalendarEvent && (
                                    <button
                                      type="button"
                                      onClick={() => handleDuplicateEvent(ev)}
                                      className="p-1 rounded-md bg-black/10 hover:bg-black/20 transition cursor-pointer"
                                      title="Duplikuj"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  )}
                                  {onDeleteCalendarEvent && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteEventClick(ev.id)}
                                      className="p-1 rounded-md bg-black/10 hover:bg-black/20 transition cursor-pointer"
                                      title="Usuń"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
            </div>
          </div>
        )}

        {/* VIEW 3: Tydzień (Week view with 24-hour grid from 00:00 to 24:00) */}
        {viewMode === 'tydzien' && (
          <div className="w-full min-w-0 h-full flex-1 flex flex-col bg-white overflow-hidden">
            {/* 1. Header with Week Days */}
            <div className="flex border-b border-neutral-200 bg-neutral-50/90 sticky top-0 z-30 shrink-0">
              {/* Corner Time Column Header */}
              <div className="w-10 sm:w-16 shrink-0 p-1 sm:p-2 flex flex-col items-center justify-center border-r border-neutral-200 text-neutral-400">
                <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-neutral-400 mb-0.5" />
                <span className="text-[8px] sm:text-[10px] font-semibold tracking-wider uppercase">Godz.</span>
              </div>

              {/* 7 Day Column Headers */}
              <div className="flex-1 grid grid-cols-7 divide-x divide-neutral-200 min-w-0">
                {weekDays.map(({ date, dateStr, dayIndex }) => {
                  const isToday = dateStr === todayStr;
                  const isCurrentCursor = isSameDay(date, cursorDate);

                  return (
                    <div
                      key={dateStr}
                      className={`p-1 sm:p-2 text-center flex flex-col items-center justify-between group transition-colors min-w-0 overflow-hidden ${
                        isToday
                          ? 'bg-blue-50/50'
                          : isCurrentCursor
                          ? 'bg-neutral-50/60'
                          : 'bg-transparent hover:bg-neutral-50/40'
                      }`}
                    >
                      <span
                        className={`text-[9px] sm:text-[11px] font-semibold uppercase tracking-wider truncate ${
                          isToday ? 'text-blue-600' : 'text-neutral-500'
                        }`}
                      >
                        {DAY_NAMES_SHORT_PL[dayIndex]}
                      </span>
                      <div className="flex items-center space-x-1.5 my-0.5 sm:my-1">
                        <span
                          className={`w-6 h-6 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium transition-all ${
                            isToday
                              ? 'bg-blue-600 text-white font-bold shadow-xs'
                              : 'text-neutral-800 hover:bg-neutral-200/70'
                          }`}
                        >
                          {date.getDate()}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenAddEvent(dateStr)}
                        className="text-[8px] sm:text-[10px] text-neutral-400 group-hover:text-blue-600 font-medium cursor-pointer px-1 py-0.5 rounded hover:bg-blue-50 transition truncate max-w-full"
                        title="Dodaj wydarzenie na ten dzień"
                      >
                        + Dodaj
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. All-Day (Cały dzień) Events Row - tasks & events >24h rendered here */}
            <div className="flex border-b border-neutral-200 bg-neutral-50/40 text-xs shrink-0">
              <div className="w-10 sm:w-16 shrink-0 p-1 sm:p-2 border-r border-neutral-200 flex items-center justify-end text-[8px] sm:text-[10px] font-semibold text-neutral-500 pr-1 sm:pr-2 leading-tight">
                <span className="hidden sm:inline">Cały dzień</span>
                <span className="sm:hidden">24h+</span>
              </div>
              <div className="flex-1 grid grid-cols-7 divide-x divide-neutral-200 p-0.5 sm:p-1 min-w-0">
                {weekDays.map(({ dateStr }) => {
                  const dayEvents = eventsByDate[dateStr] || [];
                  const allDayEvents = dayEvents.filter((ev) => isEventLongerThan24hOrAllDay(ev));

                  return (
                    <div key={`allday-${dateStr}`} className="px-0.5 sm:px-1 py-0.5 min-h-[28px] sm:min-h-[32px] space-y-1 min-w-0 overflow-hidden">
                      {allDayEvents.map((ev) => {
                        const isTask = isCalendarTaskEvent(ev);
                        const fallbackColor = templateColorMap.get(cleanTaskTitle(ev.summary).toLowerCase());
                        const colorDef = getGoogleEventColor(ev, isTask, fallbackColor);

                        return (
                          <div
                            key={ev.id}
                            onClick={() => setPreviewEvent(ev)}
                            style={{
                              backgroundColor: colorDef.hex,
                              color: colorDef.contrastText,
                            }}
                            className="text-[9px] sm:text-[11px] px-1 sm:px-2 py-0.5 rounded-md font-medium truncate cursor-pointer transition shadow-2xs hover:brightness-95 select-none border border-black/10"
                            title={`${ev.summary} (Cały dzień / >24h)`}
                          >
                            <span className="mr-0.5 sm:mr-1">{isTask ? '✓' : '●'}</span>
                            {ev.summary}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. 24-Hour Scrollable Grid (00:00 to 24:00 - od północy do północy) */}
            <div
              ref={weekScrollRef}
              className="overflow-y-auto flex-1 min-h-0 relative flex select-none divide-x divide-neutral-200 w-full"
            >
              {/* Left Column: 24 Hour Labels (00:00 Północ to 23:00 + 24:00 Północ) */}
              <div className="w-10 sm:w-16 shrink-0 bg-neutral-50/70 border-r border-neutral-200 text-right pr-1 sm:pr-2">
                {HOURS_24.map((hour) => (
                  <div
                    key={hour}
                    className="h-[48px] border-b border-neutral-100 flex items-start justify-end pt-1"
                  >
                    <span className="text-[8px] sm:text-[10px] font-medium text-neutral-400">
                      {String(hour).padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
                <div className="h-[24px] flex items-start justify-end pt-0.5">
                  <span className="text-[8px] sm:text-[10px] font-semibold text-neutral-500">
                    24:00
                  </span>
                </div>
              </div>

              {/* 7 Days Columns with 24 Hourly Slots */}
              <div className="flex-1 grid grid-cols-7 divide-x divide-neutral-200 min-w-0">
                {weekDays.map(({ dateStr }) => {
                  const isToday = dateStr === todayStr;
                  const dayEvents = eventsByDate[dateStr] || [];
                  const timedEvents = dayEvents.filter(
                    (ev) => !isEventLongerThan24hOrAllDay(ev) && !!ev.start.dateTime
                  );

                  // Current time marker calculation
                  const now = new Date();
                  const currentHour = now.getHours();
                  const currentMin = now.getMinutes();
                  const currentTop = (currentHour * 60 + currentMin) * (48 / 60);

                  return (
                    <div
                      key={dateStr}
                      className={`relative h-[1152px] min-w-0 ${
                        isToday ? 'bg-blue-50/15' : 'bg-white'
                      }`}
                    >
                      {/* Current live time indicator line */}
                      {isToday && (
                        <div
                          className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none flex items-center"
                          style={{ top: `${currentTop}px` }}
                        >
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1.5 shadow-xs" />
                        </div>
                      )}

                      {/* 24 Hour Background Clickable Grid Slots */}
                      {HOURS_24.map((hour) => {
                        const timeStr = `${String(hour).padStart(2, '0')}:00`;
                        return (
                          <div
                            key={hour}
                            onClick={() => handleOpenAddEvent(dateStr, timeStr)}
                            className="h-[48px] border-b border-neutral-100 hover:bg-blue-50/40 cursor-pointer transition-colors group relative"
                            title={`Kliknij, aby dodać wydarzenie o ${timeStr}`}
                          >
                            <span className="absolute left-1 top-1 text-[8px] sm:text-[9px] font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none truncate max-w-full">
                              +{timeStr}
                            </span>
                          </div>
                        );
                      })}

                      {/* Timed Events positioned with overlap handling (shorter event takes half column if concurrent) */}
                      {(() => {
                        const dayLayouts = computeDayTimedEventLayouts(timedEvents, 48, 1152);
                        return dayLayouts.map((item) => {
                          const ev = item.event;
                          const isTask = isCalendarTaskEvent(ev);
                          const fallbackColor = templateColorMap.get(cleanTaskTitle(ev.summary).toLowerCase());
                          const colorDef = getGoogleEventColor(ev, isTask, fallbackColor);

                          return (
                            <div
                              key={ev.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewEvent(ev);
                              }}
                              style={{
                                top: `${item.topPx}px`,
                                height: `${item.heightPx}px`,
                                left: `${item.leftPercent}%`,
                                width:
                                  item.widthPercent === 100
                                    ? 'calc(100% - 2px)'
                                    : `calc(${item.widthPercent}% - 2px)`,
                                backgroundColor: colorDef.hex,
                                color: colorDef.contrastText,
                              }}
                              className="absolute rounded-md px-1 sm:px-2 py-0.5 sm:py-1 text-left shadow-2xs cursor-pointer z-10 overflow-hidden transition-all hover:z-30 hover:shadow-md hover:brightness-95 border border-black/10 select-none group min-w-0"
                              title={`${ev.summary} (${formatEventTime(ev)})`}
                            >
                              <div className="flex items-start justify-between gap-0.5 leading-tight">
                                <span className="font-semibold text-[9px] sm:text-[11px] truncate">
                                  {isEventRecurring(ev) ? '🔁 ' : isTask ? '✓ ' : ''}
                                  {ev.summary}
                                </span>
                                {ev.calendarSummary && (
                                  <span className="text-[7px] sm:text-[8px] px-1 py-0.2 rounded bg-black/20 text-white truncate max-w-[48px] shrink-0 font-normal hidden sm:inline">
                                    {ev.calendarSummary}
                                  </span>
                                )}
                              </div>
                              {item.heightPx >= 34 && (
                                <div className="text-[8px] sm:text-[10px] opacity-90 truncate leading-tight mt-0.5 font-normal">
                                  {formatEventTime(ev)}
                                </div>
                              )}
                              {item.heightPx >= 52 && ev.location && (
                                <div className="text-[8px] sm:text-[9px] opacity-85 truncate flex items-center gap-0.5 mt-0.5 hidden sm:flex">
                                  <MapPin className="w-2.5 h-2.5 shrink-0 opacity-75" />
                                  <span className="truncate">{ev.location}</span>
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: 4 Tygodnie (4 Weeks view) */}
        {viewMode === '4tygodnie' && (
          <div className="w-full h-full min-h-0 flex flex-col overflow-hidden">
            {/* Weekday Names Header */}
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1 text-center font-bold text-[9px] sm:text-xs text-neutral-600 py-1.5 border-b border-neutral-200 w-full shrink-0">
              {DAY_NAMES_SHORT_PL.map((name) => (
                <div key={name} className="truncate">{name}</div>
              ))}
            </div>

            {/* 4 Weeks Grid (28 cells) */}
            <div className="grid grid-cols-7 grid-rows-4 gap-0.5 sm:gap-1 w-full flex-1 min-h-0 h-full p-1 bg-neutral-100/50 overflow-hidden">
              {fourWeeksDays.map(({ date, dateStr, isCurrentMonth }) => {
                const isToday = dateStr === todayStr;
                const dayEvents = eventsByDate[dateStr] || [];

                return (
                  <div
                    key={dateStr}
                    onClick={() => {
                      setCursorDate(date);
                    }}
                    className={`h-full min-h-0 p-1 sm:p-1.5 rounded-lg border flex flex-col justify-start transition hover:border-blue-300 cursor-pointer min-w-0 overflow-hidden ${
                      isToday
                        ? 'border-blue-400 bg-blue-50/40 ring-1 ring-blue-400/40'
                        : isCurrentMonth
                        ? 'border-neutral-200 bg-white'
                        : 'border-neutral-150 bg-neutral-50/50 opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between shrink-0 leading-none">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold ${
                          isToday
                            ? 'bg-blue-600 text-white'
                            : isCurrentMonth
                            ? 'text-neutral-800'
                            : 'text-neutral-400'
                        }`}
                      >
                        {date.getDate()}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAddEvent(dateStr);
                        }}
                        className="text-[9px] sm:text-[10px] text-neutral-400 hover:text-blue-600 p-0.5 rounded cursor-pointer leading-none"
                        title="Dodaj wydarzenie"
                      >
                        +
                      </button>
                    </div>

                    {/* Events chips */}
                    <div className="space-y-0.5 mt-0.5 flex-1 min-h-0 overflow-y-auto pr-0.5">
                      {dayEvents.map((event) => {
                        const isTask = isCalendarTaskEvent(event);
                        const fallbackColor = templateColorMap.get(cleanTaskTitle(event.summary).toLowerCase());
                        const colorDef = getGoogleEventColor(event, isTask, fallbackColor);

                        return (
                          <div
                            key={event.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewEvent(event);
                            }}
                            style={{
                              backgroundColor: colorDef.bg,
                              borderColor: colorDef.border,
                              color: colorDef.text,
                            }}
                            className="px-1 sm:px-1.5 py-0.5 rounded text-[8px] sm:text-[10px] font-medium truncate flex items-center space-x-0.5 sm:space-x-1 border shadow-2xs hover:brightness-95 select-none min-w-0"
                            title={`${event.summary} (${formatEventTime(event)})`}
                          >
                            <span
                              className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: colorDef.hex }}
                            />
                            <span className="truncate">{isEventRecurring(event) ? '🔁 ' : ''}{event.summary}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 5: Miesiąc (Month view) */}
        {viewMode === 'miesiac' && (
          <div className="w-full h-full min-h-0 flex flex-col overflow-hidden">
            {/* Weekday Names Header */}
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1 text-center font-bold text-[9px] sm:text-xs text-neutral-600 py-1.5 border-b border-neutral-200 w-full shrink-0">
              {DAY_NAMES_PL.map((name, idx) => (
                <div key={name} className="truncate">
                  <span className="hidden sm:inline">{name}</span>
                  <span className="sm:hidden">{DAY_NAMES_SHORT_PL[idx]}</span>
                </div>
              ))}
            </div>

            {/* Month Grid Cells */}
            <div
              className="grid grid-cols-7 gap-0.5 sm:gap-1 w-full flex-1 min-h-0 h-full p-1 bg-neutral-100/50 overflow-hidden"
              style={{
                gridTemplateRows: `repeat(${Math.ceil(monthGridDays.length / 7)}, minmax(0, 1fr))`,
              }}
            >
              {monthGridDays.map(({ date, dateStr, isCurrentMonth }) => {
                const isToday = dateStr === todayStr;
                const dayEvents = eventsByDate[dateStr] || [];

                return (
                  <div
                    key={dateStr}
                    onClick={() => setCursorDate(date)}
                    className={`h-full min-h-0 p-1 sm:p-1.5 rounded-lg border flex flex-col justify-start transition hover:border-blue-400 cursor-pointer min-w-0 overflow-hidden ${
                      isToday
                        ? 'border-blue-400 bg-blue-50/40 ring-1 ring-blue-400/40'
                        : isCurrentMonth
                        ? 'border-neutral-200 bg-white'
                        : 'border-neutral-150 bg-neutral-50/50 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between shrink-0 leading-none">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold ${
                          isToday
                            ? 'bg-blue-600 text-white'
                            : isCurrentMonth
                            ? 'text-neutral-800'
                            : 'text-neutral-400'
                        }`}
                      >
                        {date.getDate()}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAddEvent(dateStr);
                        }}
                        className="text-[9px] sm:text-xs text-neutral-400 hover:text-blue-600 p-0.5 hover:bg-neutral-100 rounded cursor-pointer leading-none"
                        title="Dodaj wydarzenie w tym dniu"
                      >
                        +
                      </button>
                    </div>

                    {/* Events chips list */}
                    <div className="space-y-0.5 mt-0.5 flex-1 min-h-0 overflow-y-auto pr-0.5">
                      {dayEvents.map((event) => {
                        const isTask = isCalendarTaskEvent(event);
                        const fallbackColor = templateColorMap.get(cleanTaskTitle(event.summary).toLowerCase());
                        const colorDef = getGoogleEventColor(event, isTask, fallbackColor);

                        return (
                          <div
                            key={event.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewEvent(event);
                            }}
                            style={{
                              backgroundColor: colorDef.bg,
                              borderColor: colorDef.border,
                              color: colorDef.text,
                            }}
                            className="px-1 sm:px-1.5 py-0.5 rounded text-[8px] sm:text-[11px] font-medium truncate flex items-center space-x-0.5 sm:space-x-1 cursor-pointer border shadow-2xs hover:brightness-95 select-none min-w-0"
                            title={`${event.summary} (${formatEventTime(event)})`}
                          >
                            <span
                              className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: colorDef.hex }}
                            />
                            <span className="truncate">{isEventRecurring(event) ? '🔁 ' : ''}{event.summary}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Event Details Preview Modal */}
      {previewEvent && (() => {
        const isTask = isCalendarTaskEvent(previewEvent);
        const fallbackColor = templateColorMap.get(cleanTaskTitle(previewEvent.summary).toLowerCase());
        const colorDef = getGoogleEventColor(previewEvent, isTask, fallbackColor);

        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in-95">
              <div className="flex items-start justify-between pb-3 border-b border-neutral-100">
                <div className="flex items-center space-x-2.5">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shadow-2xs shrink-0"
                    style={{ backgroundColor: colorDef.hex, color: colorDef.contrastText }}
                  >
                    <CalendarIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-neutral-900 leading-snug">
                      {previewEvent.summary}
                    </h3>
                    <p className="text-xs text-neutral-500 flex items-center gap-1.5 mt-0.5">
                      <span>Szczegóły wydarzenia</span>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium border"
                        style={{
                          backgroundColor: colorDef.bg,
                          borderColor: colorDef.border,
                          color: colorDef.text,
                        }}
                      >
                        {colorDef.name}
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewEvent(null)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="py-4 space-y-3 text-xs text-neutral-700">
                <div className="flex items-start space-x-2.5">
                  <Clock className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-neutral-900">Termin</div>
                    <div className="text-neutral-600 mt-0.5">
                      {previewEvent.start.dateTime
                        ? new Date(previewEvent.start.dateTime).toLocaleString('pl-PL', {
                            dateStyle: 'full',
                            timeStyle: 'short',
                          })
                        : `${previewEvent.start.date} (Cały dzień)`}
                      {previewEvent.end?.dateTime && (
                        <span>
                          {' '}
                          &ndash;{' '}
                          {new Date(previewEvent.end.dateTime).toLocaleTimeString('pl-PL', {
                            timeStyle: 'short',
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {previewEvent.location && (
                  <div className="flex items-start space-x-2.5">
                    <MapPin className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-neutral-900">Lokalizacja</div>
                      <div className="text-neutral-600 mt-0.5">{previewEvent.location}</div>
                    </div>
                  </div>
                )}

                {previewEvent.description && (
                  <div className="pt-2 border-t border-neutral-100">
                    <div className="font-semibold text-neutral-900 mb-1">Opis / Notatki</div>
                    <div className="p-2.5 rounded-xl bg-neutral-50 text-neutral-600 whitespace-pre-wrap leading-relaxed text-[11px]">
                      {previewEvent.description}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
                {previewEvent.id.startsWith('gtask-') ? (
                  (() => {
                    const rawId = previewEvent.recurringEventId || previewEvent.id;
                    const taskId = rawId.replace('gtask-', '').split('__rec__')[0];
                    const currentTask = tasks?.find((t) => t.id === taskId);
                    return (
                      <div className="flex items-center space-x-2">
                        {currentTask && onToggleTask && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await onToggleTask(currentTask);
                                setPreviewEvent(null);
                              } catch (e) {
                                console.error('Błąd zmiany statusu zadania:', e);
                              }
                            }}
                            className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                              currentTask.status === 'completed'
                                ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200'
                                : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {currentTask.status === 'completed'
                                ? 'Oznacz jako do zrobienia'
                                : 'Oznacz jako ukończone'}
                            </span>
                          </button>
                        )}
                        <span className="text-[11px] font-medium text-neutral-500">
                          {currentTask?.status === 'completed' ? 'Status: Ukończone ✓' : 'Status: Do wykonania ○'}
                        </span>
                      </div>
                    );
                  })()
                ) : (
                  <>
                    {onDeleteCalendarEvent && (
                      <button
                        type="button"
                        onClick={() => setEventToDelete(previewEvent)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 hover:bg-rose-50 border border-rose-200 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>Usuń wydarzenie</span>
                      </button>
                    )}
                  </>
                )}

                <div className="flex items-center space-x-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setPreviewEvent(null)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-600 hover:bg-neutral-100 transition cursor-pointer"
                  >
                    Zamknij
                  </button>
                  {!previewEvent.id.startsWith('gtask-') && onCreateCalendarEvent && (
                    <button
                      type="button"
                      onClick={() => {
                        const ev = previewEvent;
                        setPreviewEvent(null);
                        handleDuplicateEvent(ev);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-700 hover:text-blue-700 bg-neutral-100 hover:bg-blue-50 border border-neutral-250 transition cursor-pointer inline-flex items-center space-x-1"
                      title="Duplikuj to wydarzenie"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Duplikuj</span>
                    </button>
                  )}
                  {!previewEvent.id.startsWith('gtask-') && onUpdateCalendarEvent && (
                    <button
                      type="button"
                      onClick={() => {
                        const ev = previewEvent;
                        setPreviewEvent(null);
                        handleOpenEditEvent(ev);
                      }}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition shadow-2xs cursor-pointer"
                    >
                      Edytuj
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add / Edit Calendar Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in-95 duration-150 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900">
                    {editingEvent ? 'Edytuj wydarzenie w kalendarzu' : 'Nowe wydarzenie w kalendarzu'}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Wprowadź dane wydarzenia i przypisz do wybranego kalendarza
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEventModal(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {eventModalError && (
              <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{eventModalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEventSubmit} className="space-y-3.5 mt-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Kalendarz Google *
                </label>
                <select
                  value={eventCalendarId}
                  onChange={(e) => setEventCalendarId(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium cursor-pointer"
                >
                  {calendars
                    .filter((c) => c.id !== ALL_CALENDARS_ID)
                    .map((cal) => (
                      <option key={cal.id} value={cal.id}>
                        {cal.summary
                          ?.replace(/\s*[([](?:główny|glowny|primary)[)\]]/gi, '')
                          ?.replace(/\s*-\s*(?:główny|glowny|primary)/gi, '')
                          ?.trim() || cal.summary}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Nazwa wydarzenia *
                </label>
                <input
                  type="text"
                  value={eventSummary}
                  onChange={(e) => setEventSummary(e.target.value)}
                  placeholder="np. Spotkanie projektowe, Warsztaty, Konferencja"
                  className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>

              {/* All-day toggle */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50 border border-neutral-200">
                <span className="text-xs font-medium text-neutral-700">Wydarzenie całodniowe</span>
                <input
                  type="checkbox"
                  checked={eventIsAllDay}
                  onChange={(e) => setEventIsAllDay(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-neutral-300 focus:ring-blue-500 cursor-pointer"
                />
              </div>

              {/* Dates and Times */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                    Data rozpoczęcia *
                  </label>
                  <input
                    type="date"
                    value={eventStartDate}
                    onChange={(e) => {
                      setEventStartDate(e.target.value);
                      if (eventEndDate && e.target.value > eventEndDate) {
                        setEventEndDate(e.target.value);
                      }
                    }}
                    className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    required
                  />
                  {!eventIsAllDay && (
                    <div className="mt-2">
                      <label className="block text-[10px] text-neutral-500 mb-1">Godzina rozpoczęcia</label>
                      <input
                        type="time"
                        value={eventStartTime}
                        onChange={(e) => handleStartTimeChange(e.target.value)}
                        className="w-full text-xs border border-neutral-300 rounded-lg p-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                    Data zakończenia (powrót)
                  </label>
                  <input
                    type="date"
                    value={eventEndDate}
                    min={eventStartDate}
                    onChange={(e) => setEventEndDate(e.target.value)}
                    className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                  />
                  {!eventIsAllDay && (
                    <div className="mt-2">
                      <label className="block text-[10px] text-neutral-500 mb-1">Godzina zakończenia</label>
                      <input
                        type="time"
                        value={eventEndTime}
                        onChange={(e) => setEventEndTime(e.target.value)}
                        className="w-full text-xs border border-neutral-300 rounded-lg p-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Lokalizacja (opcjonalnie)
                </label>
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    value={eventLocation}
                    onChange={(e) => setEventLocation(e.target.value)}
                    placeholder="np. Rzym, Włochy / Hotel Colosseo"
                    className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg pl-8 p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Opis / Notatki (opcjonalnie)
                </label>
                <textarea
                  value={eventDescription}
                  onChange={(e) => setEventDescription(e.target.value)}
                  placeholder="Dodatkowe informacje, nr lotu, potwierdzenie..."
                  rows={2}
                  className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Google Calendar Event Color Picker */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-neutral-700">
                    Kolor w Kalendarzu Google
                  </label>
                  <span className="text-[11px] font-medium text-neutral-500">
                    {GOOGLE_EVENT_COLOR_OPTIONS.find((c) => c.id === eventColorId)?.name || 'Domyślny kolor kalendarza'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-neutral-50 border border-neutral-200">
                  <button
                    type="button"
                    onClick={() => setEventColorId('')}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-all cursor-pointer ${
                      !eventColorId
                        ? 'bg-blue-600 text-white border-blue-600 font-semibold shadow-2xs'
                        : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100'
                    }`}
                    title="Użyj domyślnego koloru kalendarza"
                  >
                    Domyślny
                  </button>
                  {GOOGLE_EVENT_COLOR_OPTIONS.map((col) => {
                    const isSelected = (eventColorId || '') === col.id;
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => setEventColorId(col.id)}
                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-2xs border border-black/10 ${
                          isSelected
                            ? 'ring-2 ring-blue-600 ring-offset-2 scale-110'
                            : 'hover:scale-105 opacity-90 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: col.hex }}
                        title={`${col.name} (Google ID: ${col.id})`}
                      >
                        {isSelected && (
                          <span
                            className="text-xs font-black leading-none"
                            style={{ color: col.contrastText }}
                          >
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-neutral-100">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleSaveAndGenerateTasks}
                    disabled={isSavingEvent}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg shadow-2xs transition disabled:opacity-50 cursor-pointer"
                    title="Zapisz to wydarzenie i wygeneruj dla niego zadania"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Generuj zadania</span>
                  </button>

                  {editingEvent && onDeleteCalendarEvent && (
                    <button
                      type="button"
                      onClick={() => setEventToDelete(editingEvent)}
                      disabled={isSavingEvent}
                      className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg transition disabled:opacity-50 cursor-pointer"
                      title="Usuń to wydarzenie z kalendarza"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>Usuń wydarzenie</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center space-x-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowEventModal(false)}
                    disabled={isSavingEvent}
                    className="px-4 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                  >
                    Anuluj
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEvent}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isSavingEvent ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Zapisywanie w kalendarzu...</span>
                      </>
                    ) : (
                      <span>{editingEvent ? 'Zapisz zmiany w kalendarzu' : 'Dodaj do Kalendarza Google'}</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-app Event Deletion Confirmation Modal */}
      {eventToDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-neutral-900">
                  Usunąć wydarzenie z kalendarza?
                </h3>
                <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                  Czy na pewno chcesz usunąć wydarzenie <strong className="text-neutral-900">&bdquo;{eventToDelete.summary}&rdquo;</strong> z Kalendarza Google?
                </p>
                <p className="text-[11px] text-neutral-400 mt-1.5">
                  Wydarzenie zostanie trwale usunięte z Twojego kalendarza.
                </p>
                {deleteError && (
                  <div className="mt-2.5 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                    {deleteError}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5 pt-3 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => {
                  setEventToDelete(null);
                  setDeleteError(null);
                }}
                disabled={isDeletingEvent}
                className="px-3.5 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
              >
                Anuluj
              </button>
              <button
                type="button"
                id="btn-confirm-delete-fullcalendar-event"
                disabled={isDeletingEvent}
                onClick={handleConfirmDeleteEvent}
                className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isDeletingEvent ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Usuwanie...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Usuń wydarzenie</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
