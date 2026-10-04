import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { CalendarListItem, CalendarEventItem, TaskTemplateItem, TaskTemplateSet } from '../types';
import { calculateDueDateDetails, cleanTaskTitle } from '../services/templateStorage';
import { ALL_CALENDARS_ID, ALL_CALENDARS_ITEM, findPrimaryCalendar } from '../services/googleCalendarApi';
import { ChecklistPopover, ChecklistOption } from './ChecklistPopover';
import { DateRangeFilterBar } from './DateRangeFilterBar';
import {
  DateRangeState,
  getDefaultDateRange,
  getDashboardCalendarDefaultDateRange,
  filterCalendarEvents,
} from '../utils/dateFilterUtils';
import { getGoogleEventColor, GOOGLE_EVENT_COLORS, GOOGLE_EVENT_COLOR_OPTIONS } from '../utils/googleCalendarColors';

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
}) => {
  const [showSimulateModal, setShowSimulateModal] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<CalendarEventItem | null>(null);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [simTitle, setSimTitle] = useState('Spotkanie projektowe / Warsztaty');
  const [simLocation, setSimLocation] = useState('Warszawa / Online');

  // In-app Calendar Event Add/Edit Modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventItem | null>(null);
  const [eventCalendarId, setEventCalendarId] = useState<string>('');
  const [eventSummary, setEventSummary] = useState('');
  const [eventIsAllDay, setEventIsAllDay] = useState(true);
  const [eventStartDate, setEventStartDate] = useState('');
  const [eventStartTime, setEventStartTime] = useState('09:00');
  const [eventEndDate, setEventEndDate] = useState('');
  const [eventEndTime, setEventEndTime] = useState('09:30');
  const [eventLocation, setEventLocation] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventColorId, setEventColorId] = useState<string>('');
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [eventModalError, setEventModalError] = useState<string | null>(null);

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
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [targetSpecificReturnDate, setTargetSpecificReturnDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
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
  const handleOpenAddEvent = () => {
    setEditingEvent(null);
    setEventSummary('');
    setEventIsAllDay(true);
    const defaultCalId =
      selectedCalendar && selectedCalendar.id !== ALL_CALENDARS_ID
        ? selectedCalendar.id
        : findPrimaryCalendar(calendars)?.id || 'primary';
    setEventCalendarId(defaultCalId);
    const d1 = new Date();
    d1.setDate(d1.getDate() + 7);
    const d2 = new Date();
    d2.setDate(d2.getDate() + 14);
    const pad = (n: number) => String(n).padStart(2, '0');
    setEventStartDate(`${d1.getFullYear()}-${pad(d1.getMonth() + 1)}-${pad(d1.getDate())}`);
    setEventStartTime('09:00');
    setEventEndDate(`${d2.getFullYear()}-${pad(d2.getMonth() + 1)}-${pad(d2.getDate())}`);
    setEventEndTime('09:30');
    setEventLocation('');
    setEventDescription('');
    setEventColorId('');
    setEventModalError(null);
    setShowEventModal(true);
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
    setEventEndDate(e.date || s.date);
    setEventEndTime(e.time);
    setShowEventModal(true);
  };

  // Open Event Modal in Duplicate mode (pre-filled copy, saves as new event)
  const handleDuplicateEvent = (event: CalendarEventItem) => {
    setEditingEvent(null);
    setEventSummary(`${event.summary || 'Wydarzenie'} (Kopia)`);
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
    setEventEndDate(e.date || s.date);
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
  const handleOpenTaskGeneration = (event: CalendarEventItem, customTemplates?: TaskTemplateItem[]) => {
    const listToUse = customTemplates && customTemplates.length > 0 ? customTemplates : (templates || []);
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
          {/* Top row: Calendar selector & Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 min-h-[36px]">
            <div className="flex items-center space-x-2.5 sm:space-x-3">
              <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-neutral-900">
                  Kalendarz
                </h2>

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

          {/* Row 2: Add event button, Zadania z szablonu & badge */}
          <div className="flex items-center justify-between gap-2 min-h-[32px]">
            <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </div>

      {/* Date Range Filter Bar (Zakres dat) */}
      <DateRangeFilterBar
        range={activeDateRange}
        onChangeRange={handleDateRangeChange}
        totalCount={events.length}
        filteredCount={displayedEvents.length}
        accentColor="blue"
        idPrefix="cal-card-date-filter"
      />

      {/* Sub row: Counters & Quick filter tabs (Brown Box moved down below DateRangeFilterBar) */}
      <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-neutral-50/60 border-b border-neutral-200/80">
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
          <div className="space-y-3">
            {finalDisplayedEvents.map((event) => {
              const rawStart = event.start.dateTime || event.start.date;
              const hasGenerated = !!generatedTripMap[event.id];
              const isCurrentlyGenerating = generatingEventId === event.id;
              const daysUntil = getDaysUntil(rawStart);
              const templateColorId = templates?.find(
                (tpl) => cleanTaskTitle(tpl.title).toLowerCase() === cleanTaskTitle(event.summary).toLowerCase()
              )?.colorId;
              const eventColor = getGoogleEventColor(event, false, templateColorId);

              return (
                <div
                  key={event.id}
                  className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
                    hasGenerated
                      ? 'border-emerald-200 bg-emerald-50/20'
                      : 'border-neutral-200 hover:border-neutral-300 bg-white'
                  }`}
                  style={{ borderLeftColor: eventColor.hex, borderLeftWidth: '4px' }}
                >
                  <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                          style={{ backgroundColor: eventColor.hex }}
                          title={eventColor.name}
                        />
                        <h4 className="text-xs sm:text-sm font-bold text-neutral-900 leading-snug break-words">
                          {event.summary}
                        </h4>
                        <span
                          className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-medium border shrink-0 shadow-2xs"
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
                        {daysUntil && (
                          <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-medium bg-neutral-100 text-neutral-700 border border-neutral-200 shrink-0">
                            <Clock className="w-3 h-3 mr-1 text-neutral-500" />
                            {daysUntil}
                          </span>
                        )}
                        {hasGenerated && (
                          <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-medium bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                            Zadania wygenerowane
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-neutral-500">
                        <span className="flex items-center">
                          <CalendarIcon className="w-3.5 h-3.5 mr-1 text-neutral-400 shrink-0" />
                          {formatEventDate(event)}
                        </span>
                        {event.location && (
                          <span className="flex items-center truncate max-w-full">
                            <MapPin className="w-3.5 h-3.5 mr-1 text-neutral-400 shrink-0" />
                            <span className="truncate">{event.location}</span>
                          </span>
                        )}
                      </div>

                      {event.description && (
                        <p className="text-xs text-neutral-600 line-clamp-2 pt-0.5 break-words">
                          {event.description}
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-1.5 self-start xl:self-center shrink-0 pt-1 xl:pt-0">
                      {onUpdateCalendarEvent && (
                        <button
                          id={`btn-edit-event-${event.id}`}
                          type="button"
                          onClick={() => handleOpenEditEvent(event)}
                          className="inline-flex items-center space-x-1 text-xs font-medium text-neutral-700 hover:text-blue-700 bg-white hover:bg-blue-50 border border-neutral-250 hover:border-blue-250 py-1.5 px-2 rounded-lg transition-all shadow-2xs cursor-pointer"
                          title="Edytuj to wydarzenie bezpośrednio w Kalendarzu Google"
                        >
                          <Pencil className="w-3.5 h-3.5 text-neutral-500 hover:text-blue-600" />
                          <span className="hidden sm:inline">Edytuj</span>
                        </button>
                      )}

                      {onCreateCalendarEvent && (
                        <button
                          id={`btn-duplicate-event-${event.id}`}
                          type="button"
                          onClick={() => handleDuplicateEvent(event)}
                          className="inline-flex items-center space-x-1 text-xs font-medium text-neutral-700 hover:text-blue-700 bg-white hover:bg-blue-50 border border-neutral-250 hover:border-blue-250 py-1.5 px-2 rounded-lg transition-all shadow-2xs cursor-pointer"
                          title="Duplikuj to wydarzenie"
                        >
                          <Copy className="w-3.5 h-3.5 text-neutral-500 hover:text-blue-600" />
                          <span className="hidden sm:inline">Duplikuj</span>
                        </button>
                      )}

                      {onDownloadIcs && (
                        <button
                          type="button"
                          onClick={() => onDownloadIcs(event)}
                          className="inline-flex items-center space-x-1 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-neutral-250 py-1.5 px-2 rounded-lg transition-all shadow-2xs cursor-pointer"
                          title="Pobierz plik kalendarza (.ics) ze wszystkimi zadaniami o dokładnych godzinach i przypomnieniach"
                        >
                          <Download className="w-3.5 h-3.5 text-neutral-500" />
                          <span>.ics</span>
                        </button>
                      )}

                      {onDeleteEvent && (
                        <button
                          id={`btn-del-event-${event.id}`}
                          type="button"
                          onClick={() => setEventToDelete(event)}
                          className="inline-flex items-center space-x-1 text-xs font-medium text-neutral-500 hover:text-rose-600 bg-white hover:bg-rose-50 border border-neutral-250 hover:border-rose-200 py-1.5 px-2 rounded-lg transition-all shadow-2xs cursor-pointer"
                          title="Usuń to wydarzenie z Kalendarza Google"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-neutral-400 hover:text-rose-600" />
                        </button>
                      )}

                      <button
                        id={`btn-gen-tasks-${event.id}`}
                        onClick={() => handleOpenTaskGeneration(event)}
                        disabled={isCurrentlyGenerating}
                        className={`inline-flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                          hasGenerated
                            ? 'text-neutral-700 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200'
                            : 'text-white bg-blue-600 hover:bg-blue-700 shadow-xs'
                        } disabled:opacity-50`}
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
        )}
      </div>

      {/* Modal for simulated event */}
      {showSimulateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-neutral-200 animate-in fade-in zoom-in-95">
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
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border border-neutral-200 animate-in fade-in zoom-in-95 duration-150">
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
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in-95 duration-150 my-8">
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
                              {tpl.colorId && GOOGLE_EVENT_COLORS[tpl.colorId] && (
                                <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-800 border border-neutral-200">
                                  <span
                                    className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                                    style={{ backgroundColor: GOOGLE_EVENT_COLORS[tpl.colorId].hex }}
                                  />
                                  <span>{GOOGLE_EVENT_COLORS[tpl.colorId].name}</span>
                                </span>
                              )}
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
    </div>
  );
};
