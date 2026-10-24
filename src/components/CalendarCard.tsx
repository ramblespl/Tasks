import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  RefreshCw,
  PlusCircle,
  MapPin,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Download,
  Trash2,
  Pencil,
  Copy,
  Plus,
  CheckSquare,
  X,
  Layers,
  RotateCcw,
  MoreHorizontal,
  ListTodo,
} from 'lucide-react';
import { CalendarListItem, CalendarEventItem, TaskTemplateItem, TaskTemplateSet, GoogleTaskItem, GoogleTaskList } from '../types';
import { calculateDueDateDetails, cleanTaskTitle, formatToRfc3339 } from '../services/templateStorage';
import { ALL_CALENDARS_ID, ALL_CALENDARS_ITEM, findPrimaryCalendar, getEventDateSpan, isEventLongerThan24hOrAllDay, getInclusiveAllDayEndDate } from '../services/googleCalendarApi';
import { ALL_TASK_LISTS_ID } from '../services/googleTasksApi';
import { ChecklistPopover, ChecklistOption } from './ChecklistPopover';
import { DateRangeFilterBar } from './DateRangeFilterBar';
import { AndroidTimePickerField } from './AndroidTimePicker';
import {
  DateRangeState,
  getDefaultDateRange,
  getDashboardCalendarDefaultDateRange,
  filterCalendarEvents,
  getTodayDateString,
} from '../utils/dateFilterUtils';
import {
  getGoogleEventColor,
  findColorDefinition,
  GOOGLE_EVENT_COLORS,
  GOOGLE_EVENT_COLOR_OPTIONS,
  isCalendarTaskEvent,
  isPastEvent,
} from '../utils/googleCalendarColors';

const MONTH_NAMES_GENITIVE_PL = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
];

const DAY_NAMES_PL = [
  'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela',
];

interface CalendarCardProps {
  calendars: CalendarListItem[];
  selectedCalendar: CalendarListItem | null;
  onSelectCalendar: (calendar: CalendarListItem) => void;
  selectedCalendarIds?: string[];
  onToggleCalendarId?: (calendarId: string) => void;
  onSelectAllCalendars?: () => void;
  onClearAllCalendars?: () => void;
  events: CalendarEventItem[];
  isLoadingEvents: boolean;
  onRefreshEvents: () => void;
  generatedTripMap: Record<string, string>;
  onGenerateTasksForEvent: (
    event: CalendarEventItem,
    customChoices?: Array<{
      template: TaskTemplateItem;
      createTask: boolean;
      createCalendarEvent: boolean;
    }>
  ) => Promise<void>;
  generatingEventId: string | null;
  generationProgress: { current: number; total: number; taskName?: string } | null;
  onSimulateEvent: (eventData: { summary: string; startDate: string; endDate: string }) => void;
  onDownloadIcs?: (event: CalendarEventItem) => void;
  onDeleteEvent?: (eventId: string) => Promise<void>;
  onCreateCalendarEvent?: (payload: {
    summary: string;
    startDate: string;
    startTime?: string;
    endDate: string;
    endTime?: string;
    isAllDay: boolean;
    location?: string;
    description?: string;
    calendarId?: string;
  }) => Promise<CalendarEventItem | void>;
  onUpdateCalendarEvent?: (
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
      calendarId?: string;
    }
  ) => Promise<CalendarEventItem | void>;
  templates?: TaskTemplateItem[];
  templateSets?: TaskTemplateSet[];
  activeTemplateSetId?: string;
  onSelectTemplateSet?: (setId: string) => void;
  includeTimeInTitle?: boolean;
  onToggleIncludeTimeInTitle?: (val: boolean) => void;
  calendarPermissionError?: string | null;
  onReauthorizeCalendar?: () => void;
  dateRange?: DateRangeState;
  onChangeDateRange?: (newRange: DateRangeState) => void;
  tasks?: GoogleTaskItem[];
  taskLists?: GoogleTaskList[];
  onAddTaskManually?: (
    title: string,
    notes?: string,
    due?: string,
    targetTaskListId?: string,
    time?: string
  ) => Promise<GoogleTaskItem | void>;
  showControls?: boolean;
  onToggleControls?: () => void;
}

export const CalendarCard: React.FC<CalendarCardProps> = ({
  calendars,
  selectedCalendar,
  onSelectCalendar,
  selectedCalendarIds = [],
  onToggleCalendarId,
  onSelectAllCalendars,
  onClearAllCalendars,
  events,
  isLoadingEvents,
  onRefreshEvents,
  generatedTripMap,
  onGenerateTasksForEvent,
  generatingEventId,
  generationProgress,
  onSimulateEvent,
  onDownloadIcs,
  onDeleteEvent,
  onCreateCalendarEvent,
  onUpdateCalendarEvent,
  templates = [],
  templateSets = [],
  activeTemplateSetId,
  onSelectTemplateSet,
  includeTimeInTitle = true,
  onToggleIncludeTimeInTitle,
  calendarPermissionError,
  onReauthorizeCalendar,
  dateRange: propDateRange,
  onChangeDateRange,
  tasks = [],
  taskLists = [],
  onAddTaskManually,
  showControls,
  onToggleControls,
}) => {
  const [internalShowControls, setInternalShowControls] = useState(false);
  const isControlsOpen = showControls !== undefined ? showControls : internalShowControls;
  const toggleControls = onToggleControls || (() => setInternalShowControls((prev) => !prev));
  const [showSimulateModal, setShowSimulateModal] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<CalendarEventItem | null>(null);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [simTitle, setSimTitle] = useState('Spotkanie projektowe / Warsztaty');
  const [simLocation, setSimLocation] = useState('Warszawa / Online');

  // In-app Calendar Event Add/Edit Modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventItem | null>(null);
  const [createItemType, setCreateItemType] = useState<'event' | 'task'>('event');
  const [eventCalendarId, setEventCalendarId] = useState<string>('');
  const [eventSummary, setEventSummary] = useState('');
  const [eventIsAllDay, setEventIsAllDay] = useState(true);
  const [eventStartDate, setEventStartDate] = useState(getTodayDateString);
  const [eventStartTime, setEventStartTime] = useState('09:00');
  const [eventEndDate, setEventEndDate] = useState(getTodayDateString);
  const [eventEndTime, setEventEndTime] = useState('09:30');
  const [eventLocation, setEventLocation] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventColorId, setEventColorId] = useState<string>('');
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [eventModalError, setEventModalError] = useState<string | null>(null);

  // Task creation fields in modal
  const [modalTaskTitle, setModalTaskTitle] = useState('');
  const [modalTaskTargetListId, setModalTaskTargetListId] = useState('');
  const [modalTaskDate, setModalTaskDate] = useState(getTodayDateString);
  const [modalTaskHasTime, setModalTaskHasTime] = useState(false);
  const [modalTaskTime, setModalTaskTime] = useState('12:00');
  const [modalTaskNotes, setModalTaskNotes] = useState('');

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

  // Selective Task Generation Modal state
  const [taskGenTargetEvent, setTaskGenTargetEvent] = useState<CalendarEventItem | null>(null);
  const [taskGenTemplates, setTaskGenTemplates] = useState<TaskTemplateItem[]>([]);
  const [itemChoices, setItemChoices] = useState<
    Record<string, { createTask: boolean; createCalendarEvent: boolean }>
  >({});
  const [openGenDropdownEventId, setOpenGenDropdownEventId] = useState<string | null>(null);
  const [selectedModalTemplateSetId, setSelectedModalTemplateSetId] = useState<string>('');

  useEffect(() => {
    if (!openGenDropdownEventId) return;
    const handleClickOutside = () => setOpenGenDropdownEventId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openGenDropdownEventId]);

  // "Zadania z szablonu" dropdown state
  const [showTemplateTasksPanel, setShowTemplateTasksPanel] = useState(false);
  const [selectedTemplateSetId, setSelectedTemplateSetId] = useState<string>(() => {
    return activeTemplateSetId || templateSets?.[0]?.id || '';
  });
  const [targetCalendarId, setTargetCalendarId] = useState<string>(() => {
    if (selectedCalendar && selectedCalendar.id !== ALL_CALENDARS_ID) {
      return selectedCalendar.id;
    }
    const primaryCal = findPrimaryCalendar(calendars);
    return primaryCal ? primaryCal.id : 'primary';
  });
  const [targetSpecificDate, setTargetSpecificDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [targetSpecificReturnDate, setTargetSpecificReturnDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  const handleTargetDepartureChange = (newDeparture: string) => {
    setTargetSpecificDate(newDeparture);
    if (newDeparture && (!targetSpecificReturnDate || targetSpecificReturnDate < newDeparture)) {
      const d = new Date(newDeparture);
      d.setDate(d.getDate() + 7);
      setTargetSpecificReturnDate(d.toISOString().split('T')[0]);
    }
  };

  React.useEffect(() => {
    if (activeTemplateSetId) {
      setSelectedTemplateSetId(activeTemplateSetId);
    } else if (templateSets && templateSets.length > 0 && !selectedTemplateSetId) {
      setSelectedTemplateSetId(templateSets[0].id);
    }
  }, [activeTemplateSetId, templateSets]);

  const availableCalendars = useMemo(() => {
    const list = calendars.filter((c) => c.id !== ALL_CALENDARS_ID);
    if (list.length === 0) {
      return [{ id: 'primary', summary: 'Główny kalendarz Google', primary: true }];
    }
    const hasPrimary = list.some((c) => c.primary || c.id === 'primary');
    if (!hasPrimary) {
      return [
        { id: 'primary', summary: 'Główny kalendarz Google', primary: true },
        ...list,
      ];
    }
    return list;
  }, [calendars]);

  const [hasUserManuallyChosenCalendar, setHasUserManuallyChosenCalendar] = useState(false);

  React.useEffect(() => {
    if (!hasUserManuallyChosenCalendar) {
      if (selectedCalendar && selectedCalendar.id !== ALL_CALENDARS_ID) {
        setTargetCalendarId(selectedCalendar.id);
      } else {
        const primaryCal = findPrimaryCalendar(calendars);
        if (primaryCal) {
          setTargetCalendarId(primaryCal.id);
        }
      }
    }
  }, [selectedCalendar, calendars, hasUserManuallyChosenCalendar]);

  const templateSetOptions = useMemo(() => {
    if (templateSets && templateSets.length > 0) {
      return templateSets;
    }
    return [
      {
        id: 'default',
        name: 'Podstawowy szablon planu',
        templates: templates || [],
      },
    ];
  }, [templateSets, templates]);
  
  // Date state for exact date selection
  const [simStartDate, setSimStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  });
  const [simEndDate, setSimEndDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 21);
    return d.toISOString().split('T')[0];
  });

  // Date range filter state (defaults to 'next_30_days' for dashboard calendar)
  const [internalDateRange, setInternalDateRange] = useState<DateRangeState>(() => {
    return getDashboardCalendarDefaultDateRange();
  });

  const activeDateRange = propDateRange || internalDateRange;

  const handleDateRangeChange = (newRange: DateRangeState) => {
    if (onChangeDateRange) {
      onChangeDateRange(newRange);
    } else {
      setInternalDateRange(newRange);
      localStorage.setItem('calendar_card_date_range', JSON.stringify(newRange));
    }
  };

  const [calendarTabFilter, setCalendarTabFilter] = useState<'all' | 'events' | 'generated'>('all');

  // Filter events according to chosen date range
  const displayedEvents = useMemo(() => {
    return filterCalendarEvents(events, activeDateRange);
  }, [events, activeDateRange]);

  const finalDisplayedEvents = useMemo(() => {
    return displayedEvents.filter((ev) => {
      if (calendarTabFilter === 'generated') {
        return !!generatedTripMap[ev.id];
      }
      return true;
    });
  }, [displayedEvents, calendarTabFilter, generatedTripMap]);

  const todayStr = useMemo(() => getTodayDateString(), []);

  const isTaskCompleted = (ev: CalendarEventItem): boolean => {
    if (ev.taskStatus) return ev.taskStatus === 'completed';
    if (ev.description?.includes('Status: Ukończone')) return true;
    if (ev.id.startsWith('gtask-')) {
      const realId = ev.id.replace('gtask-', '');
      const matched = tasks?.find((t) => t.id === realId);
      if (matched) return matched.status === 'completed';
    }
    return false;
  };

  // Helper to format event start time (same as in Harmonogram)
  const formatEventStartTime = (ev: CalendarEventItem): string => {
    if (ev.start?.dateTime && !isEventLongerThan24hOrAllDay(ev)) {
      const s = new Date(ev.start.dateTime);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(s.getHours())}:${pad(s.getMinutes())}`;
    }
    // Check description for explicit hour (e.g. "Godzina wykonania: 18:00" or "⏰ Godzina rozpoczęcia: 18:00")
    if (ev.description) {
      const match = ev.description.match(/(?:⏰\s*)?Godzina(?:\s*wykonania|\s*rozpoczęcia)?:\s*(\d{1,2}:\d{2})/i);
      if (match) return match[1];
    }
    // Check summary for leading hour (e.g. "18:00 - ...")
    if (ev.summary) {
      const match = ev.summary.match(/^(\d{1,2}:\d{2})\s*[-–]/);
      if (match) return match[1];
    }
    // Check template match
    if (templates && templates.length > 0 && ev.summary) {
      const clean = cleanTaskTitle(ev.summary).toLowerCase();
      const matchedTpl = templates.find((t) => cleanTaskTitle(t.title).toLowerCase() === clean);
      if (matchedTpl?.time) return matchedTpl.time;
    }
    return '';
  };

  // Group events by date spanning multiple days if needed (same as Harmonogram view)
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEventItem[]> = {};
    finalDisplayedEvents.forEach((ev) => {
      const dates = getEventDateSpan(ev);
      dates.forEach((dateKey) => {
        if (!map[dateKey]) map[dateKey] = [];
        if (!map[dateKey].some((item) => item.id === ev.id)) {
          map[dateKey].push(ev);
        }
      });
    });

    // Sort each day's events: all-day first, then by start time (identical to Harmonogram)
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => {
        const timeA = formatEventStartTime(a);
        const timeB = formatEventStartTime(b);
        const isAllDayA = !timeA && isEventLongerThan24hOrAllDay(a);
        const isAllDayB = !timeB && isEventLongerThan24hOrAllDay(b);
        if (isAllDayA && !isAllDayB) return -1;
        if (!isAllDayA && isAllDayB) return 1;
        const sortTimeA = timeA || (a.start.dateTime ? a.start.dateTime.substring(11, 16) : '00:00');
        const sortTimeB = timeB || (b.start.dateTime ? b.start.dateTime.substring(11, 16) : '00:00');
        return sortTimeA.localeCompare(sortTimeB);
      });
    });

    return map;
  }, [finalDisplayedEvents, templates]);

  const eventsCount = useMemo(() => {
    return displayedEvents.length;
  }, [displayedEvents]);

  const generatedCount = useMemo(() => {
    return displayedEvents.filter((ev) => !!generatedTripMap[ev.id]).length;
  }, [displayedEvents, generatedTripMap]);

  const checklistCalendarOptions: ChecklistOption[] = calendars
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
        color: c.backgroundColor || '#2563eb',
      };
    });

  const formatEventDate = (event: CalendarEventItem) => {
    const rawStart = event.start.dateTime || event.start.date;
    const rawEnd = event.end.dateTime || event.end.date;

    if (!rawStart) return 'Brak daty';

    const startDate = new Date(rawStart);
    const startStr = startDate.toLocaleDateString('pl-PL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    if (rawEnd && rawEnd !== rawStart) {
      const endDate = new Date(rawEnd);
      const endStr = endDate.toLocaleDateString('pl-PL', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      return `${startStr} — ${endStr}`;
    }

    return startStr;
  };

  const getDaysUntil = (rawStart?: string) => {
    if (!rawStart) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDate = new Date(rawStart);
    eventDate.setHours(0, 0, 0, 0);

    const diffDays = Math.round(
      (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) return `Zakończone (${Math.abs(diffDays)} dni temu)`;
    if (diffDays === 0) return 'Dziś!';
    if (diffDays === 1) return 'Jutro!';
    return `Za ${diffDays} dni`;
  };

  const setQuickDate = (daysFromToday: number, durationDays: number = 7) => {
    const start = new Date();
    start.setDate(start.getDate() + daysFromToday);
    const end = new Date(start);
    end.setDate(end.getDate() + durationDays);

    setSimStartDate(start.toISOString().split('T')[0]);
    setSimEndDate(end.toISOString().split('T')[0]);
  };

  const handleCreateSimulated = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simStartDate) return;

    onSimulateEvent({
      summary: simTitle.trim() || 'Nowe wydarzenie',
      startDate: simStartDate,
      endDate: simEndDate || simStartDate,
    });

    setShowSimulateModal(false);
  };

  // Open Event Modal in Add mode
  const handleOpenAddEvent = (defaultType: 'event' | 'task' = 'event') => {
    setEditingEvent(null);
    setCreateItemType(defaultType);
    setEventSummary('');
    setEventIsAllDay(true);
    const defaultCalId =
      selectedCalendar && selectedCalendar.id !== ALL_CALENDARS_ID
        ? selectedCalendar.id
        : findPrimaryCalendar(calendars)?.id || 'primary';
    setEventCalendarId(defaultCalId);
    const todayStr = getTodayDateString();
    setEventStartDate(todayStr);
    setEventStartTime('09:00');
    setEventEndDate(todayStr);
    setEventEndTime('09:30');
    setEventLocation('');
    setEventDescription('');
    setEventColorId('');

    // Task fields initialization
    setModalTaskTitle('');
    setModalTaskDate(todayStr);
    const defaultTaskListId =
      (taskLists.find((tl) => tl.id !== ALL_TASK_LISTS_ID && (tl.title?.toLowerCase().includes('zadania') || tl.title?.toLowerCase().includes('tasks')))?.id) ||
      taskLists.find((tl) => tl.id !== ALL_TASK_LISTS_ID)?.id ||
      '';
    setModalTaskTargetListId(defaultTaskListId);
    setModalTaskHasTime(false);
    setModalTaskTime('12:00');
    setModalTaskNotes('');

    setEventModalError(null);
    setShowEventModal(true);
  };

  // Submit handler for creating a task from the modal in CalendarCard
  const handleSaveModalTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalTaskTitle.trim()) {
      setEventModalError('Wprowadź nazwę zadania.');
      return;
    }
    if (!onAddTaskManually) {
      setEventModalError('Brak dostępnej funkcji dodawania zadań.');
      return;
    }

    try {
      setIsSavingEvent(true);
      setEventModalError(null);
      const clean = cleanTaskTitle(modalTaskTitle.trim());

      let taskHour: string | undefined = undefined;
      if (modalTaskHasTime && modalTaskTime && /^(\d{1,2}):(\d{2})$/.test(modalTaskTime)) {
        taskHour = modalTaskTime;
      }

      let rfcDue: string | undefined = undefined;
      if (modalTaskDate) {
        const [year, month, day] = modalTaskDate.split('-').map(Number);
        const pad = (n: number) => String(n).padStart(2, '0');
        if (taskHour) {
          let [h, m] = taskHour.split(':').map(Number);
          if (isNaN(h)) h = 12;
          if (isNaN(m)) m = 0;
          const target = new Date(year, (month || 1) - 1, day || 1, h, m, 0, 0);
          rfcDue = formatToRfc3339(target);
        } else {
          rfcDue = `${year}-${pad(month)}-${pad(day)}T00:00:00.000Z`;
        }
      }

      const finalNotes = modalTaskNotes.trim() ? modalTaskNotes.trim() : undefined;
      const targetListId = modalTaskTargetListId || undefined;

      await onAddTaskManually(clean, finalNotes, rfcDue, targetListId, taskHour);
      setShowEventModal(false);
    } catch (err: any) {
      console.error('Błąd zapisu zadania:', err);
      setEventModalError(err.message || 'Nie udało się zapisać zadania w Google Tasks.');
    } finally {
      setIsSavingEvent(false);
    }
  };

  // Open Event Modal in Edit mode
  const handleOpenEditEvent = (event: CalendarEventItem) => {
    setEditingEvent(event);
    setEventSummary(event.summary || '');
    setEventLocation(event.location || '');
    setEventDescription(event.description || '');
    setEventColorId(event.colorId || '');
    const currentCalId =
      event.calendarId ||
      (selectedCalendar && selectedCalendar.id !== ALL_CALENDARS_ID
        ? selectedCalendar.id
        : findPrimaryCalendar(calendars)?.id || 'primary');
    setEventCalendarId(currentCalId);
    setEventModalError(null);

    const pad = (n: number) => String(n).padStart(2, '0');
    const parseDateStr = (dateObj: { dateTime?: string; date?: string }) => {
      if (dateObj?.dateTime) {
        const d = new Date(dateObj.dateTime);
        if (!isNaN(d.getTime())) {
          return {
            isAllDay: false,
            date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
            time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
          };
        }
      }
      if (dateObj?.date) {
        return {
          isAllDay: true,
          date: dateObj.date,
          time: '09:00',
        };
      }
      const now = new Date();
      return {
        isAllDay: true,
        date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
        time: '09:00',
      };
    };

    const s = parseDateStr(event.start);
    const e = parseDateStr(event.end);

    setEventIsAllDay(s.isAllDay);
    setEventStartDate(s.date);
    setEventStartTime(s.time);
    setEventEndDate(s.isAllDay ? getInclusiveAllDayEndDate(s.date, event.end?.date) : (e.date || s.date));
    setEventEndTime(e.time);
    setShowEventModal(true);
  };

  // Open Event Modal in Duplicate mode (pre-filled copy, saves as new event)
  const handleDuplicateEvent = (event: CalendarEventItem) => {
    setEditingEvent(null);
    setEventSummary(event.summary || 'Wydarzenie');
    setEventLocation(event.location || '');
    setEventDescription(event.description || '');
    setEventColorId(event.colorId || '');
    const currentCalId =
      event.calendarId ||
      (selectedCalendar && selectedCalendar.id !== ALL_CALENDARS_ID
        ? selectedCalendar.id
        : findPrimaryCalendar(calendars)?.id || 'primary');
    setEventCalendarId(currentCalId);
    setEventModalError(null);

    const pad = (n: number) => String(n).padStart(2, '0');
    const parseDateStr = (dateObj: { dateTime?: string; date?: string }) => {
      if (dateObj?.dateTime) {
        const d = new Date(dateObj.dateTime);
        if (!isNaN(d.getTime())) {
          return {
            isAllDay: false,
            date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
            time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
          };
        }
      }
      if (dateObj?.date) {
        return {
          isAllDay: true,
          date: dateObj.date,
          time: '09:00',
        };
      }
      const now = new Date();
      return {
        isAllDay: true,
        date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
        time: '09:00',
      };
    };

    const s = parseDateStr(event.start);
    const e = parseDateStr(event.end);

    setEventIsAllDay(s.isAllDay);
    setEventStartDate(s.date);
    setEventStartTime(s.time);
    setEventEndDate(s.isAllDay ? getInclusiveAllDayEndDate(s.date, event.end?.date) : (e.date || s.date));
    setEventEndTime(e.time);
    setShowEventModal(true);
  };

  // Submit Event Add / Edit
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
        startDate: eventStartDate,
        startTime: eventIsAllDay ? undefined : eventStartTime,
        endDate: eventEndDate || eventStartDate,
        endTime: eventIsAllDay ? undefined : eventEndTime,
        isAllDay: eventIsAllDay,
        location: eventLocation.trim() || undefined,
        description: eventDescription.trim() || undefined,
        colorId: eventColorId || undefined,
        calendarId: eventCalendarId || undefined,
      };

      if (editingEvent) {
        if (!onUpdateCalendarEvent) throw new Error('Edycja wydarzeń nie jest dostępna');
        await onUpdateCalendarEvent(editingEvent.id, payload);
      } else {
        if (!onCreateCalendarEvent) throw new Error('Dodawanie wydarzeń nie jest dostępne');
        await onCreateCalendarEvent(payload);
      }
      setShowEventModal(false);
    } catch (err: any) {
      setEventModalError(err.message || 'Wystąpił błąd podczas zapisywania wydarzenia.');
    } finally {
      setIsSavingEvent(false);
    }
  };

  // Save Event and Immediately Open Task Generation
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
        startDate: eventStartDate,
        startTime: eventIsAllDay ? undefined : eventStartTime,
        endDate: eventEndDate || eventStartDate,
        endTime: eventIsAllDay ? undefined : eventEndTime,
        isAllDay: eventIsAllDay,
        location: eventLocation.trim() || undefined,
        description: eventDescription.trim() || undefined,
        colorId: eventColorId || undefined,
        calendarId: eventCalendarId || undefined,
      };

      let targetEvent: CalendarEventItem;
      if (editingEvent) {
        if (!onUpdateCalendarEvent) throw new Error('Edycja wydarzeń nie jest dostępna');
        const res = await onUpdateCalendarEvent(editingEvent.id, payload);
        targetEvent = (res as CalendarEventItem) || {
          ...editingEvent,
          summary: payload.summary,
          location: payload.location,
          description: payload.description,
          calendarId: payload.calendarId || editingEvent.calendarId,
          start: payload.isAllDay ? { date: payload.startDate } : { dateTime: `${payload.startDate}T${payload.startTime || '09:00'}:00` },
          end: payload.isAllDay ? { date: payload.endDate } : { dateTime: `${payload.endDate}T${payload.endTime || '10:00'}:00` },
        };
      } else {
        if (!onCreateCalendarEvent) throw new Error('Dodawanie wydarzeń nie jest dostępne');
        const res = await onCreateCalendarEvent(payload);
        const calObj = calendars.find((c) => c.id === payload.calendarId);
        targetEvent = (res as CalendarEventItem) || {
          id: `evt-${Date.now()}`,
          summary: payload.summary,
          location: payload.location,
          description: payload.description,
          calendarId: payload.calendarId,
          calendarSummary: calObj?.summary,
          start: payload.isAllDay ? { date: payload.startDate } : { dateTime: `${payload.startDate}T${payload.startTime || '09:00'}:00` },
          end: payload.isAllDay ? { date: payload.endDate } : { dateTime: `${payload.endDate}T${payload.endTime || '10:00'}:00` },
        };
      }
      setShowEventModal(false);
      handleOpenTaskGeneration(targetEvent);
    } catch (err: any) {
      setEventModalError(err.message || 'Wystąpił błąd podczas zapisywania wydarzenia.');
    } finally {
      setIsSavingEvent(false);
    }
  };

  // Open Task Generation Modal with choices initialized
  const handleOpenTaskGeneration = (
    event: CalendarEventItem,
    customTemplates?: TaskTemplateItem[],
    customSetId?: string
  ) => {
    const listToUse = customTemplates && customTemplates.length > 0 ? customTemplates : (templates || []);
    let setIdToSet = customSetId || activeTemplateSetId || templateSetOptions[0]?.id || '';
    if (customTemplates && !customSetId) {
      const match = templateSetOptions.find((s) => s.templates === customTemplates);
      if (match) setIdToSet = match.id;
    }
    setSelectedModalTemplateSetId(setIdToSet);
    setTaskGenTemplates(listToUse);

    const initialChoices: Record<string, { createTask: boolean; createCalendarEvent: boolean }> = {};
    listToUse.forEach((t) => {
      const mode = t.creationMode || (t.createCalendarEvent === false ? 'task_only' : 'event_and_task');
      initialChoices[t.id] = {
        createTask: mode !== 'event_only',
        createCalendarEvent: mode !== 'task_only',
      };
    });
    setItemChoices(initialChoices);
    setTaskGenTargetEvent(event);
  };

  const handleSetAllChoices = (mode: 'both' | 'task_only' | 'event_only') => {
    const listToUse = taskGenTemplates.length > 0 ? taskGenTemplates : (templates || []);
    const updated: Record<string, { createTask: boolean; createCalendarEvent: boolean }> = {};
    listToUse.forEach((t) => {
      updated[t.id] = {
        createTask: mode === 'both' || mode === 'task_only',
        createCalendarEvent: mode === 'both' || mode === 'event_only',
      };
    });
    setItemChoices(updated);
  };

  const handleResetChoicesToDefault = () => {
    const listToUse = taskGenTemplates.length > 0 ? taskGenTemplates : (templates || []);
    const updated: Record<string, { createTask: boolean; createCalendarEvent: boolean }> = {};
    listToUse.forEach((t) => {
      const mode = t.creationMode || (t.createCalendarEvent === false ? 'task_only' : 'event_and_task');
      updated[t.id] = {
        createTask: mode !== 'event_only',
        createCalendarEvent: mode !== 'task_only',
      };
    });
    setItemChoices(updated);
  };

  const handleConfirmTaskGeneration = async () => {
    if (!taskGenTargetEvent) return;
    const listToUse = taskGenTemplates.length > 0 ? taskGenTemplates : (templates || []);
    const formattedChoices = listToUse
      .filter((t) => itemChoices[t.id]?.createTask || itemChoices[t.id]?.createCalendarEvent)
      .map((t) => ({
        template: t,
        createTask: itemChoices[t.id]?.createTask !== false,
        createCalendarEvent: itemChoices[t.id]?.createCalendarEvent === true,
      }));

    const target = taskGenTargetEvent;
    setTaskGenTargetEvent(null);
    await onGenerateTasksForEvent(target, formattedChoices);
  };

  // Handler for proceeding from "Zadania z szablonu" panel
  const handleProceedTemplateTasks = () => {
    const chosenSet = templateSetOptions.find((s) => s.id === selectedTemplateSetId) || templateSetOptions[0];
    const templatesToUse = chosenSet?.templates && chosenSet.templates.length > 0 ? chosenSet.templates : (templates || []);

    if (onSelectTemplateSet && chosenSet) {
      onSelectTemplateSet(chosenSet.id);
    }

    const chosenCal = calendars.find((c) => c.id === targetCalendarId);
    if (chosenCal && onSelectCalendar && (!selectedCalendar || selectedCalendar.id !== chosenCal.id)) {
      onSelectCalendar(chosenCal);
    }

    // Determine target date and synthetic event
    const chosenDeparture = targetSpecificDate || new Date().toISOString().split('T')[0];
    const chosenReturn = targetSpecificReturnDate || (() => {
      const d = new Date(chosenDeparture);
      d.setDate(d.getDate() + 7);
      return d.toISOString().split('T')[0];
    })();

    const targetEv: CalendarEventItem = {
      id: `tpl-event-${Date.now()}`,
      summary: `Wydarzenie (${chosenSet?.name || 'Szablon'})`,
      calendarId: targetCalendarId || 'primary',
      start: { date: chosenDeparture },
      end: { date: chosenReturn },
    };

    setShowTemplateTasksPanel(false);
    handleOpenTaskGeneration(targetEv, templatesToUse);
  };

  return (
    <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs flex flex-col h-full w-full min-w-0">
      {/* Header */}
      <div className="p-3.5 sm:p-5 border-b border-neutral-100 bg-neutral-50/50 rounded-t-2xl">
        <div className="flex flex-col gap-2.5">
          {/* Top row: Calendar title, toggle button & Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 min-h-[36px]">
            <div className="flex items-center space-x-2.5 sm:space-x-3">
              <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-neutral-900">
                  Kalendarz
                </h2>
                <button
                  type="button"
                  id="btn-toggle-cal-controls"
                  onClick={toggleControls}
                  className={`p-1.5 rounded-full transition-all cursor-pointer border shadow-2xs flex items-center justify-center ${
                    isControlsOpen
                      ? 'bg-blue-50 border-blue-300 text-blue-700 ring-2 ring-blue-500/20 shadow-xs'
                      : 'bg-white hover:bg-neutral-100 border-neutral-250 text-neutral-600 hover:text-neutral-900'
                  }`}
                  title={isControlsOpen ? 'Ukryj opcje sterowania kalendarzem (...)' : 'Pokaż opcje sterowania kalendarzem (...)'}
                  aria-label="Opcje sterowania kalendarzem"
                >
                  <MoreHorizontal className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Header Right Action Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                id="btn-refresh-calendar"
                onClick={onRefreshEvents}
                disabled={isLoadingEvents}
                className="inline-flex items-center space-x-1 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-200 py-1.5 px-2.5 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                title="Odśwież wydarzenia z kalendarza"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingEvents ? 'animate-spin' : ''}`} />
                <span className="hidden md:inline">Odśwież</span>
              </button>

              <a
                href="https://calendar.google.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 py-1.5 px-2 rounded-lg transition-colors"
              >
                <span className="hidden sm:inline">Google Calendar</span>
                <span className="sm:hidden">Google</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Collapsible controls: Checklist, Add event, Zadania z szablonu */}
          {isControlsOpen && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 min-h-[32px] pt-1 border-t border-neutral-200/60">
                <div className="flex flex-wrap items-center gap-2">
                  {onToggleCalendarId && onSelectAllCalendars && onClearAllCalendars && (
                    <ChecklistPopover
                      label="Kalendarze"
                      triggerId="btn-calendar-checkbox-filter"
                      items={checklistCalendarOptions}
                      selectedIds={selectedCalendarIds}
                      allId={ALL_CALENDARS_ID}
                      onToggleId={onToggleCalendarId}
                      onSelectAll={onSelectAllCalendars}
                      onClearAll={onClearAllCalendars}
                      align="left"
                    />
                  )}

                  {onCreateCalendarEvent && (
                    <button
                      id="btn-add-event"
                      type="button"
                      onClick={handleOpenAddEvent}
                      className="inline-flex items-center space-x-1 text-xs font-medium text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                      title="Dodaj nowe wydarzenie bezpośrednio do Kalendarza Google"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Nowe wydarzenie</span>
                    </button>
                  )}

                  <button
                    id="btn-tasks-from-template"
                    type="button"
                    onClick={() => setShowTemplateTasksPanel((prev) => !prev)}
                    className={`inline-flex items-center space-x-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                      showTemplateTasksPanel
                        ? 'bg-purple-100 text-purple-900 border-purple-300 ring-2 ring-purple-400/20 shadow-2xs'
                        : 'text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 border-purple-200'
                    }`}
                    title="Wybierz szablon oraz kalendarz, aby wygenerować zadania"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    <span>Zadania z szablonu</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 ml-0.5 text-purple-600 transition-transform duration-200 ${
                        showTemplateTasksPanel ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                    Google Calendar
                  </span>
                </div>
              </div>

          {/* Expanded panel with the two selection fields */}
          {showTemplateTasksPanel && (
            <div
              id="template-tasks-dropdown-panel"
              className="mt-2.5 p-3.5 sm:p-4 rounded-xl border border-purple-200 bg-purple-50/70 shadow-xs space-y-3 transition-all"
            >
              <div className="flex items-center justify-between pb-2 border-b border-purple-200/60">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-neutral-900">
                      Zadania z szablonu
                    </h3>
                    <p className="text-[11px] text-neutral-600">
                      Wybierz szablon oraz kalendarz docelowy, aby wygenerować zadania
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTemplateTasksPanel(false)}
                  className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-purple-100 transition-colors cursor-pointer"
                  title="Zamknij"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* The two required fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Szablon z którego mają zostać wygenerowane zadania */}
                <div>
                  <label
                    htmlFor="select-template-source"
                    className="block text-xs font-semibold text-neutral-800 mb-1"
                  >
                    1. Szablon z którego mają zostać wygenerowane zadania
                  </label>
                  <select
                    id="select-template-source"
                    value={selectedTemplateSetId}
                    onChange={(e) => {
                      setSelectedTemplateSetId(e.target.value);
                      if (onSelectTemplateSet) {
                        onSelectTemplateSet(e.target.value);
                      }
                    }}
                    className="w-full text-xs sm:text-sm bg-white border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-purple-500 focus:outline-none font-medium cursor-pointer"
                  >
                    {templateSetOptions.map((set) => (
                      <option key={set.id} value={set.id}>
                        {set.name} ({set.templates.length} {set.templates.length === 1 ? 'pozycja' : 'pozycji'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Kalendarz do którego mają one zostać dodane */}
                <div>
                  <label
                    htmlFor="select-target-calendar"
                    className="block text-xs font-semibold text-neutral-800 mb-1"
                  >
                    2. Kalendarz do którego mają one zostać dodane
                  </label>
                  <select
                    id="select-target-calendar"
                    value={targetCalendarId}
                    onChange={(e) => {
                      const newId = e.target.value;
                      setTargetCalendarId(newId);
                      setHasUserManuallyChosenCalendar(true);
                      const cal = availableCalendars.find((c) => c.id === newId);
                      if (cal && onSelectCalendar) {
                        onSelectCalendar(cal);
                      }
                    }}
                    className="w-full text-xs sm:text-sm bg-white border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-purple-500 focus:outline-none font-medium cursor-pointer"
                  >
                    {availableCalendars.map((cal) => {
                      const cleanSummary =
                        cal.summary
                          ?.replace(/\s*[([](?:główny|glowny|primary)[)\]]/gi, '')
                          ?.replace(/\s*-\s*(?:główny|glowny|primary)/gi, '')
                          ?.trim() || cal.summary || 'Kalendarz';
                      const label = cal.primary ? `${cleanSummary} (Główny)` : cleanSummary;
                      return (
                        <option key={cal.id} value={cal.id}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Wybór dat & Action */}
              <div className="pt-2 border-t border-purple-200/60 flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Wybór daty początkowej */}
                  <div>
                    <label
                      htmlFor="input-template-specific-date"
                      className="block text-xs font-semibold text-neutral-800 mb-1"
                    >
                      Data początkowa (rozpoczęcie):
                    </label>
                    <div className="flex items-center space-x-2">
                      <div className="relative flex-1">
                        <CalendarIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                        <input
                          id="input-template-specific-date"
                          type="date"
                          value={targetSpecificDate}
                          onChange={(e) => handleTargetDepartureChange(e.target.value)}
                          className="w-full text-xs sm:text-sm bg-white border border-neutral-300 rounded-lg pl-9 pr-2 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none cursor-pointer font-medium text-neutral-800"
                        />
                      </div>
                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleTargetDepartureChange(new Date().toISOString().split('T')[0])}
                          className="px-2 py-1.5 text-xs font-medium text-purple-700 bg-white hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer"
                          title="Ustaw dzisiejszą datę"
                        >
                          Dziś
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const d = new Date();
                            d.setDate(d.getDate() + 7);
                            handleTargetDepartureChange(d.toISOString().split('T')[0]);
                          }}
                          className="px-2 py-1.5 text-xs font-medium text-purple-700 bg-white hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer"
                          title="Ustaw za tydzień"
                        >
                          +7 dni
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Wybór daty końcowej */}
                  <div>
                    <label
                      htmlFor="input-template-specific-return-date"
                      className="block text-xs font-semibold text-neutral-800 mb-1"
                    >
                      Data końcowa (zakończenie):
                    </label>
                    <div className="flex items-center space-x-2">
                      <div className="relative flex-1">
                        <CalendarIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                        <input
                          id="input-template-specific-return-date"
                          type="date"
                          value={targetSpecificReturnDate}
                          min={targetSpecificDate || undefined}
                          onChange={(e) => setTargetSpecificReturnDate(e.target.value)}
                          className="w-full text-xs sm:text-sm bg-white border border-neutral-300 rounded-lg pl-9 pr-2 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none cursor-pointer font-medium text-neutral-800"
                        />
                      </div>
                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const base = targetSpecificDate ? new Date(targetSpecificDate) : new Date();
                            base.setDate(base.getDate() + 3);
                            setTargetSpecificReturnDate(base.toISOString().split('T')[0]);
                          }}
                          className="px-2 py-1.5 text-xs font-medium text-purple-700 bg-white hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer"
                          title="+3 dni od daty początkowej"
                        >
                          +3 dni
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const base = targetSpecificDate ? new Date(targetSpecificDate) : new Date();
                            base.setDate(base.getDate() + 7);
                            setTargetSpecificReturnDate(base.toISOString().split('T')[0]);
                          }}
                          className="px-2 py-1.5 text-xs font-medium text-purple-700 bg-white hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer"
                          title="+7 dni od daty początkowej"
                        >
                          +7 dni
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const base = targetSpecificDate ? new Date(targetSpecificDate) : new Date();
                            base.setDate(base.getDate() + 14);
                            setTargetSpecificReturnDate(base.toISOString().split('T')[0]);
                          }}
                          className="px-2 py-1.5 text-xs font-medium text-purple-700 bg-white hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer hidden md:inline-block"
                          title="+14 dni od daty początkowej"
                        >
                          +14 dni
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-neutral-500">
                    Termin: <strong>{targetSpecificDate}</strong> &rarr; <strong>{targetSpecificReturnDate}</strong>
                  </span>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setShowTemplateTasksPanel(false)}
                      className="px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                    >
                      Anuluj
                    </button>
                    <button
                      type="button"
                      id="btn-confirm-tasks-from-template"
                      onClick={handleProceedTemplateTasks}
                      className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 rounded-lg shadow-xs transition-colors cursor-pointer inline-flex items-center space-x-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generuj zadania</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Date Range Filter Bar (Zakres dat) inside collapsible '...' */}
          <DateRangeFilterBar
            range={activeDateRange}
            onChangeRange={handleDateRangeChange}
            totalCount={events.length}
            filteredCount={displayedEvents.length}
            accentColor="blue"
            idPrefix="cal-card-date-filter"
          />

          {/* Sub row: Counters & Quick filter tabs inside collapsible '...' */}
          <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-neutral-50/60 rounded-xl border border-neutral-200/80 mt-1">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600 min-h-[28px]">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold text-neutral-800">
                  Łącznie: {events.length}
                </span>
                <span className="text-neutral-400">&bull;</span>
                <span>Wydarzenia: {eventsCount}</span>
                <span className="text-neutral-400">&bull;</span>
                <span className="text-emerald-700 font-medium">Z zadaniami: {generatedCount}</span>
              </div>

              <div className="flex items-center space-x-1 bg-neutral-200/60 p-0.5 rounded-lg text-[11px] shrink-0">
                <button
                  type="button"
                  onClick={() => setCalendarTabFilter('all')}
                  className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                    calendarTabFilter === 'all' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  Wszystkie ({displayedEvents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarTabFilter('events')}
                  className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                    calendarTabFilter === 'events' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  Wydarzenia ({eventsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarTabFilter('generated')}
                  className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                    calendarTabFilter === 'generated' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  Z zadaniami ({generatedCount})
                </button>
              </div>
            </div>

            {/* Task progress bar */}
            <div className="w-full bg-neutral-200/80 h-1.5 rounded-full overflow-hidden mt-1.5">
              <div
                className="bg-blue-500 h-full transition-all duration-300 rounded-full"
                style={{
                  width: `${
                    eventsCount > 0
                      ? Math.min(100, Math.round((generatedCount / eventsCount) * 100))
                      : events.length > 0
                      ? 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  </div>

      {/* Events List */}
      <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-3">
        {calendarPermissionError && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200/90 text-amber-900 space-y-2.5">
            <div className="flex items-start space-x-2.5">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                  Brak uprawnień do Kalendarza Google (403)
                </h4>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Google zgłosił brak uprawnień do odczytu kalendarza. Prawdopodobnie podczas logowania pole wyboru Kalendarza nie zostało zaznaczone na ekranie zgody.
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
                  <span>Zaloguj ponownie i zaznacz Kalendarz (ekran zgody)</span>
                </button>
              </div>
            )}
          </div>
        )}

        {isLoadingEvents ? (
          <div className="py-12 text-center text-neutral-500 flex flex-col items-center justify-center">
            <RefreshCw className="w-7 h-7 text-blue-600 animate-spin mb-3" />
            <p className="text-sm font-medium text-neutral-700">Pobieranie wydarzeń z kalendarza...</p>
            <p className="text-xs text-neutral-400 mt-1">Sprawdzanie kalendarza {selectedCalendar?.summary}</p>
          </div>
        ) : events.length === 0 ? (
          <div className="py-10 text-center px-4 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50">
            <CalendarIcon className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-neutral-800">
              Brak nadchodzących wydarzeń w tym kalendarzu
            </h3>
            <p className="text-xs text-neutral-500 max-w-md mx-auto mt-1 mb-4 leading-relaxed">
              Utwórz nowe wydarzenie w Kalendarzu Google (np. &bdquo;Spotkanie projektowe&rdquo;) lub skorzystaj z przycisku poniżej, aby przetestować działanie i utworzyć zadania w liście zadań.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {onCreateCalendarEvent && (
                <button
                  id="btn-empty-add-event"
                  onClick={handleOpenAddEvent}
                  className="inline-flex items-center space-x-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Dodaj wydarzenie do kalendarza</span>
                </button>
              )}
            </div>
          </div>
        ) : finalDisplayedEvents.length === 0 ? (
          <div className="py-10 text-center px-4 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 space-y-3">
            <CalendarIcon className="w-10 h-10 text-neutral-300 mx-auto" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-neutral-800">
                Brak wydarzeń w wybranym filtrze
              </h3>
              <p className="text-xs text-neutral-500 max-w-md mx-auto leading-relaxed">
                W tym kalendarzu istnieje ogółem {events.length} {events.length === 1 ? 'wydarzenie' : 'wydarzeń'}, lecz żadne nie pasuje do obecnego widoku ({calendarTabFilter === 'generated' ? 'tylko z wygenerowanymi zadaniami' : 'zakres dat'}).
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {calendarTabFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setCalendarTabFilter('all')}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition cursor-pointer"
                >
                  <span>Pokaż wszystkie typy wydarzeń</span>
                </button>
              )}
              <button
                type="button"
                id="btn-cal-show-all-dates"
                onClick={() => handleDateRangeChange({ preset: 'all', startDate: '', endDate: '' })}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg border border-neutral-200 transition cursor-pointer"
              >
                <span>Pokaż wszystkie daty</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.keys(eventsByDate)
              .sort()
              .map((dateStr) => {
                const dayEvents = eventsByDate[dateStr];
                const d = new Date(dateStr);
                const isToday = dateStr === todayStr;
                const dayName = DAY_NAMES_PL[d.getDay() === 0 ? 6 : d.getDay() - 1];

                return (
                  <div key={dateStr} className="space-y-2">
                    {/* Sticky Day Header - taki sam podział na dni jak w widoku Harmonogram */}
                    <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xs py-1.5 flex items-center space-x-2 border-b border-neutral-100">
                      <span
                        className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          isToday ? 'bg-blue-600 text-white' : 'bg-neutral-100 text-neutral-700'
                        }`}
                      >
                        {isToday ? 'Dzisiaj' : dayName}
                      </span>
                      <span className="text-xs font-semibold text-neutral-800">
                        {String(d.getDate()).padStart(2, '0')}.{String(d.getMonth() + 1).padStart(2, '0')}.{d.getFullYear()}
                      </span>
                      <span className="text-[11px] text-neutral-400">
                        ({dayEvents.length} {dayEvents.length === 1 ? 'pozycja' : 'pozycje'})
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2 pl-2 sm:pl-4">
                      {dayEvents.map((event) => {
                        const rawStart = event.start.dateTime || event.start.date;
                        const hasGenerated = !!generatedTripMap[event.id];
                        const isCurrentlyGenerating = generatingEventId === event.id;
                        const isTask = isCalendarTaskEvent(event);
                        const isCompleted = isTask && isTaskCompleted(event);
                        const isPast = isPastEvent(event);
                        const daysUntil = getDaysUntil(rawStart);
                        const templateColorId = templates?.find(
                          (tpl) => cleanTaskTitle(tpl.title).toLowerCase() === cleanTaskTitle(event.summary).toLowerCase()
                        )?.colorId;
                        const eventColor = getGoogleEventColor(event, isTask, templateColorId, calendars);

                        return (
                          <div
                            key={event.id}
                            className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
                              isCompleted
                                ? 'bg-neutral-50/70 border-neutral-200/60 opacity-55 hover:opacity-85'
                                : hasGenerated
                                ? 'border-emerald-200 bg-emerald-50/20 hover:border-emerald-300'
                                : 'border-neutral-200 hover:border-neutral-300 bg-white'
                            }`}
                            style={{
                              borderLeftColor: eventColor.hex,
                              borderLeftWidth: '4px',
                              filter: isPast ? 'brightness(0.82) saturate(0.85)' : undefined,
                              opacity: isCompleted ? 0.55 : (isPast ? 0.60 : 1),
                            }}
                          >
                            <div className="flex flex-col gap-2.5 min-w-0">
                              {/* Single line with time, color dot, title, category, and relative date */}
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-1.5 min-w-0 flex-wrap sm:flex-nowrap">
                                  {/* 1. Time Badge */}
                                  <span className="inline-flex items-center text-xs font-semibold text-neutral-700 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded-md shrink-0">
                                    <Clock className="w-3 h-3 mr-1 text-neutral-500 shrink-0" />
                                    {formatEventStartTime(event) || 'Cały dzień'}
                                  </span>

                                  {/* 2. Color Dot */}
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                                    style={{ backgroundColor: eventColor.hex }}
                                    title={eventColor.name}
                                  />

                                  {/* 3. Event Title */}
                                  <h4
                                    className={`text-xs sm:text-sm font-bold truncate shrink leading-normal min-w-0 ${isCompleted ? 'line-through text-neutral-400' : 'text-neutral-900'}`}
                                    title={event.summary}
                                  >
                                    {isTask ? (isCompleted ? '✓ ' : '○ ') : ''}
                                    {cleanTaskTitle(event.summary)}
                                  </h4>

                                  {/* 4. Category / Calendar Tag (e.g. Praca) */}
                                  {isTask ? (
                                    isCompleted ? (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-medium bg-neutral-100 text-neutral-500 border border-neutral-200 shrink-0 whitespace-nowrap">
                                        Ukończone ✓
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0 whitespace-nowrap">
                                        Do zrobienia ○
                                      </span>
                                    )
                                  ) : (
                                    <span
                                      className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-medium border shrink-0 shadow-2xs whitespace-nowrap"
                                      style={{
                                        backgroundColor: eventColor.bg,
                                        borderColor: eventColor.border,
                                        color: eventColor.text,
                                      }}
                                      title={`Kolor w Kalendarzu Google: ${eventColor.name}`}
                                    >
                                      <span
                                        className="w-1.5 h-1.5 rounded-full shrink-0"
                                        style={{ backgroundColor: eventColor.hex }}
                                      />
                                      <span>{eventColor.name}</span>
                                    </span>
                                  )}

                                  {/* 5. Relative Days (e.g. Za 4 dni) */}
                                  {daysUntil && (
                                    <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-medium bg-neutral-100 text-neutral-700 border border-neutral-200 shrink-0 whitespace-nowrap">
                                      <Clock className="w-3 h-3 mr-1 text-neutral-500 shrink-0" />
                                      {daysUntil}
                                    </span>
                                  )}

                                  {/* 6. Generated Tasks Badge */}
                                  {hasGenerated && (
                                    <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-medium bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0 whitespace-nowrap">
                                      <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600 shrink-0" />
                                      <span className="hidden xl:inline">Zadania wygenerowane</span>
                                    </span>
                                  )}
                                </div>

                                {/* Location & Description (if present) */}
                                {(event.location || event.description) && (
                                  <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-neutral-500 pt-0.5">
                                    {event.location && (
                                      <span className="flex items-center truncate max-w-full">
                                        <MapPin className="w-3.5 h-3.5 mr-1 text-neutral-400 shrink-0" />
                                        <span className="truncate">{event.location}</span>
                                      </span>
                                    )}
                                    {event.description && (
                                      <p className="text-xs text-neutral-600 line-clamp-1 truncate break-words">
                                        {event.description}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Action buttons bar (PONIŻEJ paska z symbolami godziny, kalendarza i odległości od daty) */}
                              <div className="flex items-center justify-between sm:justify-start gap-1.5 pt-2 border-t border-neutral-150/70 flex-wrap">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {onUpdateCalendarEvent && (
                                    <button
                                      id={`btn-edit-event-${event.id}`}
                                      type="button"
                                      onClick={() => handleOpenEditEvent(event)}
                                      className="inline-flex items-center space-x-1 text-xs font-medium text-neutral-700 hover:text-blue-700 bg-white hover:bg-blue-50 border border-neutral-250 hover:border-blue-250 py-1.5 px-2.5 rounded-lg transition-all shadow-2xs cursor-pointer"
                                      title="Edytuj to wydarzenie bezpośrednio w Kalendarzu Google"
                                    >
                                      <Pencil className="w-3.5 h-3.5 text-neutral-500 hover:text-blue-600" />
                                      <span>Edytuj</span>
                                    </button>
                                  )}

                                  {onCreateCalendarEvent && (
                                    <button
                                      id={`btn-duplicate-event-${event.id}`}
                                      type="button"
                                      onClick={() => handleDuplicateEvent(event)}
                                      className="inline-flex items-center space-x-1 text-xs font-medium text-neutral-700 hover:text-blue-700 bg-white hover:bg-blue-50 border border-neutral-250 hover:border-blue-250 py-1.5 px-2.5 rounded-lg transition-all shadow-2xs cursor-pointer"
                                      title="Duplikuj to wydarzenie"
                                    >
                                      <Copy className="w-3.5 h-3.5 text-neutral-500 hover:text-blue-600" />
                                      <span>Duplikuj</span>
                                    </button>
                                  )}

                                  {onDeleteEvent && (
                                    <button
                                      id={`btn-del-event-${event.id}`}
                                      type="button"
                                      onClick={() => setEventToDelete(event)}
                                      className="inline-flex items-center space-x-1 text-xs font-medium text-neutral-500 hover:text-rose-600 bg-white hover:bg-rose-50 border border-neutral-250 hover:border-rose-200 py-1.5 px-2.5 rounded-lg transition-all shadow-2xs cursor-pointer"
                                      title="Usuń to wydarzenie z Kalendarza Google"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-neutral-400 hover:text-rose-600" />
                                    </button>
                                  )}
                                </div>

                                {!isTask && (
                                  <div className="relative inline-flex items-center ml-auto sm:ml-0">
                                    {/* Generuj zadania z wyborem szablonu - połączony split button */}
                                    <div className="inline-flex items-center rounded-lg shadow-xs overflow-hidden border border-blue-600/30">
                                      <button
                                        id={`btn-gen-tasks-${event.id}`}
                                        type="button"
                                        onClick={() => handleOpenTaskGeneration(event)}
                                        disabled={isCurrentlyGenerating}
                                        className={`inline-flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-1.5 transition-all cursor-pointer ${
                                          hasGenerated
                                            ? 'text-neutral-700 bg-neutral-100 hover:bg-neutral-200'
                                            : 'text-white bg-blue-600 hover:bg-blue-700'
                                        } disabled:opacity-50`}
                                        title="Generuj zadania dla tego wydarzenia (domyślny szablon)"
                                      >
                                        {isCurrentlyGenerating ? (
                                          <>
                                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                            <span>
                                              {generationProgress?.current}/{generationProgress?.total}...
                                            </span>
                                          </>
                                        ) : (
                                          <>
                                            <Sparkles className="w-3.5 h-3.5" />
                                            <span>
                                              {hasGenerated ? 'Generuj ponownie' : 'Generuj zadania'}
                                            </span>
                                          </>
                                        )}
                                      </button>

                                      {/* Przycisk rozwijania wyboru szablonu */}
                                      <button
                                        type="button"
                                        id={`btn-gen-tasks-tpl-select-${event.id}`}
                                        disabled={isCurrentlyGenerating}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenGenDropdownEventId((prev) => (prev === event.id ? null : event.id));
                                        }}
                                        className={`px-1.5 py-1.5 border-l transition-colors cursor-pointer flex items-center justify-center ${
                                          hasGenerated
                                            ? 'text-neutral-700 bg-neutral-100 hover:bg-neutral-200 border-neutral-300'
                                            : 'text-white bg-blue-600 hover:bg-blue-700 border-blue-500/50'
                                        }`}
                                        title="Wybierz szablon zadań do wygenerowania"
                                        aria-label="Wybierz szablon zadań"
                                      >
                                        <ChevronDown className="w-3.5 h-3.5" />
                                      </button>
                                    </div>

                                    {/* Menu wyboru szablonu dla przycisku Generuj zadania */}
                                    {openGenDropdownEventId === event.id && (
                                      <div
                                        className="absolute right-0 top-full mt-1.5 z-50 w-64 bg-white rounded-xl border border-neutral-200 shadow-xl p-2 animate-in fade-in zoom-in-95"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <div className="px-2 py-1 border-b border-neutral-100 mb-1 flex items-center justify-between">
                                          <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider flex items-center gap-1">
                                            <Layers className="w-3 h-3 text-blue-600" />
                                            Wybierz szablon:
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => setOpenGenDropdownEventId(null)}
                                            className="text-neutral-400 hover:text-neutral-600 p-0.5 rounded cursor-pointer"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        </div>

                                        <div className="space-y-0.5 max-h-56 overflow-y-auto">
                                          {templateSetOptions.map((set) => {
                                            const isCurrentActive =
                                              activeTemplateSetId === set.id || (set.id === 'default' && !activeTemplateSetId);
                                            return (
                                              <button
                                                key={set.id}
                                                type="button"
                                                onClick={() => {
                                                  setOpenGenDropdownEventId(null);
                                                  if (onSelectTemplateSet) {
                                                    onSelectTemplateSet(set.id);
                                                  }
                                                  handleOpenTaskGeneration(event, set.templates, set.id);
                                                }}
                                                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                                                  isCurrentActive
                                                    ? 'bg-blue-50 text-blue-800 font-semibold'
                                                    : 'text-neutral-700 hover:bg-neutral-100'
                                                }`}
                                              >
                                                <div className="min-w-0 pr-2">
                                                  <p className="truncate">{set.name}</p>
                                                  <p className="text-[10px] text-neutral-400 font-normal">
                                                    {set.templates.length} {set.templates.length === 1 ? 'zadanie' : 'zadań'}
                                                  </p>
                                                </div>
                                                {isCurrentActive && (
                                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 shrink-0 font-medium">
                                                    Aktywny
                                                  </span>
                                                )}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Generation Progress Bar */}
                            {isCurrentlyGenerating && generationProgress && (
                              <div className="mt-3 pt-2 border-t border-neutral-200/80">
                                <div className="flex justify-between text-[11px] text-neutral-600 mb-1">
                                  <span>Dodawanie zadań do Google Tasks...</span>
                                  <span>
                                    {Math.round(
                                      (generationProgress.current / generationProgress.total) * 100
                                    )}
                                    %
                                  </span>
                                </div>
                                <div className="w-full bg-neutral-200 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className="bg-blue-600 h-full transition-all duration-200"
                                    style={{
                                      width: `${(generationProgress.current / generationProgress.total) * 100}%`,
                                    }}
                                  />
                                </div>
                                {generationProgress.taskName && (
                                  <p className="text-[11px] text-neutral-500 mt-1 truncate">
                                    Aktualnie: {generationProgress.taskName}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Modal for simulated event */}
      {showSimulateModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowSimulateModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-neutral-200 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="text-base font-bold text-neutral-900 flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>Dodaj testowe wydarzenie (Symulator)</span>
              </h3>
              <button
                onClick={() => setShowSimulateModal(false)}
                className="text-neutral-400 hover:text-neutral-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateSimulated} className="space-y-4 pt-4">
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-800 leading-relaxed flex items-start space-x-2">
                <CalendarIcon className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Wybierz <strong>konkretną datę</strong>. Aplikacja natychmiast wyliczy terminy zadań z szablonu (np. 14 dni przed, 3 dni przed) na podstawie tej daty.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Nazwa wydarzenia
                </label>
                <input
                  type="text"
                  value={simTitle}
                  onChange={(e) => setSimTitle(e.target.value)}
                  placeholder="np. Spotkanie projektowe, Warsztaty, Konferencja"
                  className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Lokalizacja (opcjonalnie)
                </label>
                <input
                  type="text"
                  value={simLocation}
                  onChange={(e) => setSimLocation(e.target.value)}
                  placeholder="np. Warszawa / Online"
                  className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Exact Date Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-700">
                    Konkretne daty wydarzenia
                  </span>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setQuickDate(7, 4)}
                      className="text-[10px] px-2 py-0.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors"
                    >
                      Za 7 dni
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickDate(14, 7)}
                      className="text-[10px] px-2 py-0.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors"
                    >
                      Za 14 dni
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickDate(30, 10)}
                      className="text-[10px] px-2 py-0.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors"
                    >
                      Za miesiąc
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                      Data rozpoczęcia
                    </label>
                    <input
                      type="date"
                      value={simStartDate}
                      onChange={(e) => {
                        setSimStartDate(e.target.value);
                        if (simEndDate && e.target.value > simEndDate) {
                          setSimEndDate(e.target.value);
                        }
                      }}
                      className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-neutral-900"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                      Data zakończenia
                    </label>
                    <input
                      type="date"
                      value={simEndDate}
                      min={simStartDate}
                      onChange={(e) => setSimEndDate(e.target.value)}
                      className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-neutral-900"
                    />
                  </div>
                </div>

                {/* Calculation helper */}
                {simStartDate && (
                  <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200/80 text-[11px] text-neutral-600 flex items-center justify-between">
                    <span>
                      Od dzisiaj: <strong>{getDaysUntil(simStartDate)}</strong>
                    </span>
                    {simEndDate && simStartDate !== simEndDate && (
                      <span>
                        Czas trwania: <strong>
                          {Math.max(
                            1,
                            Math.round(
                              (new Date(simEndDate).getTime() - new Date(simStartDate).getTime()) /
                                (1000 * 60 * 60 * 24)
                            )
                          )}{' '}
                          dni
                        </strong>
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowSimulateModal(false)}
                  className="px-4 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
                >
                  Utwórz wydarzenie z wybraną datą
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Event Confirmation Modal */}
      {eventToDelete && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setEventToDelete(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border border-neutral-200 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-neutral-900">
                  Usunąć wydarzenie z kalendarza?
                </h3>
                <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                  Czy na pewno chcesz usunąć wydarzenie <strong className="text-neutral-900">&bdquo;{eventToDelete.summary}&rdquo;</strong> z kalendarza <strong className="text-neutral-900">&bdquo;{selectedCalendar?.summary}&rdquo;</strong>?
                </p>
                <p className="text-[11px] text-neutral-400 mt-1.5">
                  Wydarzenie zostanie trwale usunięte z Kalendarza Google.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5 pt-3 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setEventToDelete(null)}
                disabled={isDeletingEvent}
                className="px-3.5 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
              >
                Anuluj
              </button>
              <button
                type="button"
                id="btn-confirm-delete-calendar-event"
                disabled={isDeletingEvent}
                onClick={async () => {
                  if (!onDeleteEvent || !eventToDelete) return;
                  try {
                    setIsDeletingEvent(true);
                    await onDeleteEvent(eventToDelete.id);
                    setEventToDelete(null);
                  } finally {
                    setIsDeletingEvent(false);
                  }
                }}
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
      {/* Task Generation Choice Modal (Task vs Calendar Event with Date) */}
      {taskGenTargetEvent && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => setTaskGenTargetEvent(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in-95 duration-150 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900 leading-snug">
                    Generuj zadania z szablonu dla wydarzenia
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Wydarzenie: <strong className="text-neutral-900">&bdquo;{taskGenTargetEvent.summary}&rdquo;</strong> ({formatEventDate(taskGenTargetEvent)})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTaskGenTargetEvent(null)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-3">
              {/* Wybór szablonu w modalu */}
              {templateSetOptions.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-blue-50/70 border border-blue-150 text-xs mb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="font-semibold text-neutral-800 text-[11px] sm:text-xs">
                      Szablon do generowania:
                    </span>
                  </div>
                  <select
                    value={selectedModalTemplateSetId || activeTemplateSetId || templateSetOptions[0]?.id || ''}
                    onChange={(e) => {
                      const setId = e.target.value;
                      setSelectedModalTemplateSetId(setId);
                      if (onSelectTemplateSet) {
                        onSelectTemplateSet(setId);
                      }
                      const chosen = templateSetOptions.find((s) => s.id === setId);
                      const newTpls =
                        chosen?.templates && chosen.templates.length > 0 ? chosen.templates : (templates || []);
                      setTaskGenTemplates(newTpls);
                      const initialChoices: Record<string, { createTask: boolean; createCalendarEvent: boolean }> = {};
                      newTpls.forEach((t) => {
                        const mode = t.creationMode || (t.createCalendarEvent === false ? 'task_only' : 'event_and_task');
                        initialChoices[t.id] = {
                          createTask: mode !== 'event_only',
                          createCalendarEvent: mode !== 'task_only',
                        };
                      });
                      setItemChoices(initialChoices);
                    }}
                    className="text-xs font-semibold bg-white border border-neutral-300 rounded-lg px-2.5 py-1 text-neutral-800 focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
                  >
                    {templateSetOptions.map((set) => (
                      <option key={set.id} value={set.id}>
                        {set.name} ({set.templates.length} {set.templates.length === 1 ? 'zadanie' : 'zadań'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Bulk action buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-neutral-50 border border-neutral-200 text-xs mb-3">
                <span className="font-semibold text-neutral-700 text-[11px]">Szybki wybór dla wszystkich:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSetAllChoices('both')}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white hover:bg-emerald-50 text-emerald-800 border border-neutral-200 hover:border-emerald-300 transition-colors shadow-2xs cursor-pointer"
                  >
                    Wszystkie: Wydarzenie i zadanie
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAllChoices('task_only')}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white hover:bg-blue-50 text-blue-800 border border-neutral-200 hover:border-blue-300 transition-colors shadow-2xs cursor-pointer"
                  >
                    Wszystkie: Tylko zadanie
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAllChoices('event_only')}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white hover:bg-purple-50 text-purple-800 border border-neutral-200 hover:border-purple-300 transition-colors shadow-2xs cursor-pointer"
                  >
                    Wszystkie: Tylko Wydarzenie
                  </button>
                  <button
                    type="button"
                    onClick={handleResetChoicesToDefault}
                    className="px-2 py-1 rounded-lg text-[11px] font-medium text-neutral-600 hover:bg-neutral-200/70 transition-colors cursor-pointer"
                    title="Przywróć domyślne ustawienia z szablonu"
                  >
                    <RotateCcw className="w-3 h-3 inline mr-1" />
                    Domyślne
                  </button>
                </div>
              </div>

              {/* Tasks list */}
              <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1 divide-y divide-neutral-100">
                {(taskGenTemplates.length > 0 ? taskGenTemplates : (templates || [])).map((tpl) => {
                  const choice = itemChoices[tpl.id] || {
                    createTask: true,
                    createCalendarEvent: tpl.createCalendarEvent !== false,
                  };
                  const rawStart =
                    taskGenTargetEvent.start.dateTime ||
                    taskGenTargetEvent.start.date ||
                    new Date().toISOString();
                  const rawEnd =
                    taskGenTargetEvent.end.dateTime ||
                    taskGenTargetEvent.end.date ||
                    rawStart;
                  const dueInfo = calculateDueDateDetails(
                    rawStart,
                    rawEnd,
                    tpl.daysOffset,
                    tpl.anchor,
                    tpl.time
                  );
                  const clean = cleanTaskTitle(tpl.title);

                  return (
                    <div
                      key={tpl.id}
                      className={`pt-2 pb-2 px-2.5 rounded-xl border transition-all ${
                        choice.createTask || choice.createCalendarEvent
                          ? 'border-neutral-200/90 bg-white'
                          : 'border-dashed border-neutral-250 bg-neutral-50/60 opacity-60'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-start space-x-2.5 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={choice.createTask || choice.createCalendarEvent}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              setItemChoices((prev) => ({
                                ...prev,
                                [tpl.id]: {
                                  createTask: isChecked,
                                  createCalendarEvent: isChecked
                                    ? tpl.createCalendarEvent !== false
                                    : false,
                                },
                              }));
                            }}
                            className="mt-1 w-4 h-4 text-blue-600 rounded border-neutral-300 focus:ring-blue-500 cursor-pointer"
                            title="Zaznacz, aby uwzględnić to zadanie"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs sm:text-sm font-semibold text-neutral-900 truncate">
                                {clean}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-neutral-100 text-neutral-600">
                                {dueInfo.timingLabel}
                              </span>
                              {tpl.colorId && (() => {
                                const tplCol = findColorDefinition(tpl.colorId);
                                if (!tplCol) return null;
                                return (
                                  <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-800 border border-neutral-200">
                                    <span
                                      className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                                      style={{ backgroundColor: tplCol.hex }}
                                    />
                                    <span>{tplCol.name}</span>
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="text-[11px] text-neutral-500 flex items-center gap-2 mt-0.5">
                              <span className="flex items-center">
                                <Clock className="w-3 h-3 mr-1 text-neutral-400" />
                                {dueInfo.fullFormatted}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Mode Choice Buttons */}
                        <div className="flex items-center space-x-1.5 self-end sm:self-center shrink-0">
                          <button
                            type="button"
                            disabled={!choice.createTask && !choice.createCalendarEvent}
                            onClick={() => {
                              setItemChoices((prev) => ({
                                ...prev,
                                [tpl.id]: {
                                  createTask: true,
                                  createCalendarEvent: false,
                                },
                              }));
                            }}
                            className={`px-2 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                              choice.createTask && !choice.createCalendarEvent
                                ? 'bg-blue-50 text-blue-900 border-blue-400 ring-2 ring-blue-400/20 font-semibold'
                                : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                            }`}
                            title="Tylko zadanie w Google Tasks"
                          >
                            <CheckSquare className="w-3.5 h-3.5 inline mr-1 text-blue-600" />
                            Tylko zadanie
                          </button>

                          <button
                            type="button"
                            disabled={!choice.createTask && !choice.createCalendarEvent}
                            onClick={() => {
                              setItemChoices((prev) => ({
                                ...prev,
                                [tpl.id]: {
                                  createTask: true,
                                  createCalendarEvent: true,
                                },
                              }));
                            }}
                            className={`px-2 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                              choice.createTask && choice.createCalendarEvent
                                ? 'bg-emerald-50 text-emerald-950 border-emerald-500 ring-2 ring-emerald-500/20 font-semibold'
                                : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                            }`}
                            title="Wydarzenie w Kalendarzu Google + zadanie w Google Tasks"
                          >
                            <CalendarIcon className="w-3.5 h-3.5 inline mr-1 text-emerald-600" />
                            Wydarzenie i zadanie
                          </button>

                          <button
                            type="button"
                            disabled={!choice.createTask && !choice.createCalendarEvent}
                            onClick={() => {
                              setItemChoices((prev) => ({
                                ...prev,
                                [tpl.id]: {
                                  createTask: false,
                                  createCalendarEvent: true,
                                },
                              }));
                            }}
                            className={`px-2 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                              !choice.createTask && choice.createCalendarEvent
                                ? 'bg-purple-50 text-purple-950 border-purple-500 ring-2 ring-purple-500/20 font-semibold'
                                : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                            }`}
                            title="Tylko wydarzenie w Kalendarzu Google (bez tworzenia zadania w Google Tasks)"
                          >
                            <CalendarIcon className="w-3.5 h-3.5 inline mr-1 text-purple-600" />
                            Tylko Wydarzenie
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 mt-2 border-t border-neutral-100">
              <div className="text-xs text-neutral-600">
                Wybrano:{' '}
                <strong className="text-blue-700">
                  {(taskGenTemplates.length > 0 ? taskGenTemplates : (templates || [])).filter((t) => itemChoices[t.id]?.createTask).length} zadań
                </strong>{' '}
                oraz{' '}
                <strong className="text-emerald-700">
                  {(taskGenTemplates.length > 0 ? taskGenTemplates : (templates || [])).filter((t) => itemChoices[t.id]?.createCalendarEvent).length} wydarzeń w kalendarzu
                </strong>
              </div>

              <div className="flex items-center space-x-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setTaskGenTargetEvent(null)}
                  className="px-3.5 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  id="btn-confirm-generate-tasks-with-choices"
                  onClick={handleConfirmTaskGeneration}
                  disabled={
                    !templates.some(
                      (t) => itemChoices[t.id]?.createTask || itemChoices[t.id]?.createCalendarEvent
                    )
                  }
                  className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Wygeneruj wybrane</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Calendar Event Modal */}
      {showEventModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
          onClick={() => setShowEventModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-3.5 sm:p-6 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[calc(100dvh-1rem)] sm:max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2.5 sm:pb-3 border-b border-neutral-100 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  createItemType === 'task' && !editingEvent
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {createItemType === 'task' && !editingEvent ? (
                    <ListTodo className="w-5 h-5" />
                  ) : (
                    <CalendarIcon className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900 leading-snug">
                    {editingEvent
                      ? 'Edytuj wydarzenie w kalendarzu'
                      : createItemType === 'task'
                        ? 'Nowe zadanie w Google Tasks'
                        : 'Nowe wydarzenie w kalendarzu'}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {editingEvent
                      ? 'Dostosuj szczegóły istniejącego wydarzenia'
                      : createItemType === 'task'
                        ? 'Dodaj zadanie z terminem i opcjonalną godziną'
                        : 'Wprowadź dane wydarzenia i przypisz do kalendarza'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEventModal(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Google Calendar style type switcher: Wydarzenie vs Zadanie */}
            {!editingEvent && (
              <div className="flex items-center gap-1.5 p-1 bg-neutral-100/90 rounded-xl mt-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setCreateItemType('event')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    createItemType === 'event'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  <CalendarIcon className="w-3.5 h-3.5" />
                  <span>Wydarzenie</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCreateItemType('task')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    createItemType === 'task'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  <ListTodo className="w-3.5 h-3.5" />
                  <span>Zadanie</span>
                </button>
              </div>
            )}

            {eventModalError && (
              <div className="mt-2.5 sm:mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start space-x-2 shrink-0">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{eventModalError}</span>
              </div>
            )}

            {/* TASK CREATION FORM */}
            {!editingEvent && createItemType === 'task' ? (
              <form onSubmit={handleSaveModalTaskSubmit} className="flex-1 min-h-0 flex flex-col mt-2.5 sm:mt-3">
                <div className="overflow-y-auto min-h-0 flex-1 pr-1 sm:pr-1.5 space-y-3 sm:space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Lista zadań Google Tasks *
                    </label>
                    <select
                      value={modalTaskTargetListId}
                      onChange={(e) => setModalTaskTargetListId(e.target.value)}
                      className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-medium cursor-pointer"
                    >
                      {taskLists
                        .filter((tl) => tl.id !== ALL_TASK_LISTS_ID)
                        .map((tl) => (
                          <option key={tl.id} value={tl.id}>
                            {tl.title}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Nazwa zadania *
                    </label>
                    <input
                      type="text"
                      value={modalTaskTitle}
                      onChange={(e) => setModalTaskTitle(e.target.value)}
                      placeholder="np. Pakowanie, Zrobić przelew, Sprawdzić bilety"
                      className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                      required
                      autoFocus
                    />
                  </div>

                  {/* Termin i godzina wykonania */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-neutral-700">
                        Termin wykonania (data) *
                      </label>
                      {modalTaskDate && (
                        <button
                          type="button"
                          onClick={() => {
                            setModalTaskDate('');
                            setModalTaskHasTime(false);
                          }}
                          className="text-[10px] text-neutral-400 hover:text-rose-600 transition cursor-pointer"
                        >
                          Wyczyść termin
                        </button>
                      )}
                    </div>
                    <input
                      type="date"
                      value={modalTaskDate}
                      onChange={(e) => setModalTaskDate(e.target.value)}
                      className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                      required
                    />
                  </div>

                  {/* Przycisk 'Dodaj termin' (godzina) / Pole godziny */}
                  {modalTaskDate && !modalTaskHasTime && (
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          setModalTaskHasTime(true);
                          if (!modalTaskTime) setModalTaskTime('12:00');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition cursor-pointer"
                        title="Dodaj konkretną godzinę do zadania"
                      >
                        <Clock className="w-4 h-4 text-emerald-600" />
                        <span>Dodaj termin (godzina)</span>
                      </button>
                    </div>
                  )}

                  {modalTaskDate && modalTaskHasTime && (
                    <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-neutral-700 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Przypisana godzina zadania</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setModalTaskHasTime(false)}
                          className="text-[11px] text-neutral-400 hover:text-rose-600 transition cursor-pointer"
                        >
                          Usuń godzinę (cały dzień)
                        </button>
                      </div>
                      <AndroidTimePickerField
                        label="Wybierz godzinę zadania"
                        value={modalTaskTime || '12:00'}
                        onChange={(t) => setModalTaskTime(t)}
                        title="Godzina wykonania zadania"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Opis / Notatki (opcjonalnie)
                    </label>
                    <textarea
                      value={modalTaskNotes}
                      onChange={(e) => setModalTaskNotes(e.target.value)}
                      placeholder="Dodatkowe informacje do zadania..."
                      rows={2}
                      className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="shrink-0 pt-3 border-t border-neutral-100 mt-2 bg-white flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEventModal(false)}
                    disabled={isSavingEvent}
                    className="px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                  >
                    Anuluj
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEvent || !modalTaskTitle.trim()}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isSavingEvent ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Zapisywanie...</span>
                      </>
                    ) : (
                      <span>Dodaj zadanie</span>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              /* EVENT CREATION / EDITING FORM */
              <form onSubmit={handleSaveEventSubmit} className="flex-1 min-h-0 flex flex-col mt-2.5 sm:mt-3">
                <div className="overflow-y-auto min-h-0 flex-1 pr-1 sm:pr-1.5 space-y-3 sm:space-y-3.5">
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

                  {/* All-day toggle with 'Dodaj termin' option */}
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
                      {!eventIsAllDay ? (
                        <div className="mt-2">
                          <AndroidTimePickerField
                            label="Godzina rozpoczęcia"
                            value={eventStartTime}
                            onChange={(newTime) => handleStartTimeChange(newTime)}
                            title="Godzina rozpoczęcia wydarzenia"
                          />
                        </div>
                      ) : (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => setEventIsAllDay(false)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition cursor-pointer"
                            title="Dodaj godzinę rozpoczęcia wydarzenia"
                          >
                            <Clock className="w-3.5 h-3.5 text-blue-600" />
                            <span>Dodaj termin (godzina)</span>
                          </button>
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
                          <AndroidTimePickerField
                            label="Godzina zakończenia"
                            value={eventEndTime}
                            onChange={(newTime) => setEventEndTime(newTime)}
                            title="Godzina zakończenia wydarzenia"
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

                  {/* Google Calendar Event Color Picker - Standard + Extended + Custom */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-neutral-700">
                        Kolor w Kalendarzu Google
                      </label>
                      <span className="text-[11px] font-medium text-neutral-500 truncate max-w-[200px]">
                        {(eventColorId && findColorDefinition(eventColorId)?.name) || 'Domyślny kolor'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2.5">
                      {/* Standard Google Calendar colors (1-11) */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                            Standardowe kolory Google (1-11)
                          </span>
                          <button
                            type="button"
                            onClick={() => setEventColorId('')}
                            className={`px-2 py-0.5 text-[11px] rounded-md border transition-all cursor-pointer ${
                              !eventColorId
                                ? 'bg-blue-600 text-white border-blue-600 font-semibold shadow-2xs'
                                : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100'
                            }`}
                            title="Użyj domyślnego koloru kalendarza"
                          >
                            Domyślny
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {GOOGLE_EVENT_COLOR_OPTIONS.map((col) => {
                            const isSelected = (eventColorId || '') === col.id || (eventColorId || '').toLowerCase() === col.hex.toLowerCase();
                            return (
                              <button
                                key={col.id}
                                type="button"
                                onClick={() => setEventColorId(col.id || '')}
                                className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-2xs border border-black/10 ${
                                  isSelected
                                    ? 'ring-2 ring-blue-600 ring-offset-2 scale-110'
                                    : 'hover:scale-105 opacity-90 hover:opacity-100'
                                }`}
                                style={{ backgroundColor: col.hex }}
                                title={`${col.name} (Google ID: ${col.id})`}
                              >
                                {isSelected && (
                                  <span
                                    className="text-[10px] sm:text-xs font-black leading-none"
                                    style={{ color: col.contrastText }}
                                  >
                                    ✓
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-neutral-500 italic mt-2.5">
                          Rozszerzona paleta kolorów Google nie jest obsługiwana
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 pt-3 border-t border-neutral-100 mt-2 bg-white flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleSaveAndGenerateTasks}
                    disabled={isSavingEvent}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg shadow-2xs transition disabled:opacity-50 cursor-pointer"
                    title="Zapisz to wydarzenie i wygeneruj dla niego zadania"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Generuj zadania</span>
                  </button>

                  <div className="flex items-center space-x-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => setShowEventModal(false)}
                      disabled={isSavingEvent}
                      className="px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                    >
                      Anuluj
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingEvent}
                      className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {isSavingEvent ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Zapisywanie...</span>
                        </>
                      ) : (
                        <span>{editingEvent ? 'Zapisz zmiany' : 'Dodaj do kalendarza'}</span>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
