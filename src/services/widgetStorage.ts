export type WidgetId =
  | 'pulpit'
  | 'cal_month'
  | 'cal_week'
  | 'cal_day'
  | 'cal_schedule'
  | 'tasks';

export type WidgetDateRangeOption =
  | 'all'
  | 'today'
  | 'next7days'
  | 'next30days'
  | 'hasDueOnly';

export interface WidgetConfig {
  id: WidgetId;
  name: string;
  shortName: string;
  description: string;
  targetTab: 'dashboard' | 'calendar' | 'tasks';
  calendarViewMode?: 'miesiac' | 'tydzien' | 'dzien' | 'harmonogram';

  // 1. Widoczność Kalendarzy:
  allCalendars: boolean;
  selectedCalendarIds: string[];

  // 2. Widoczność List zadań:
  allTaskLists: boolean;
  selectedTaskListIds: string[];

  // 3. Widoczność terminów:
  dateRangeFilter: WidgetDateRangeOption;
  includeNoDate: boolean;
}

export const DEFAULT_WIDGET_CONFIGS: Record<WidgetId, WidgetConfig> = {
  pulpit: {
    id: 'pulpit',
    name: 'Pulpit',
    shortName: 'Pulpit',
    description: 'Szybki podgląd dnia, nadchodzących wydarzeń i zadań',
    targetTab: 'dashboard',
    allCalendars: true,
    selectedCalendarIds: [],
    allTaskLists: true,
    selectedTaskListIds: [],
    dateRangeFilter: 'all',
    includeNoDate: true,
  },
  cal_month: {
    id: 'cal_month',
    name: 'Kalendarz - miesiąc',
    shortName: 'Miesiąc',
    description: 'Widget kalendarza w widoku pełnego miesiąca z terminami',
    targetTab: 'calendar',
    calendarViewMode: 'miesiac',
    allCalendars: true,
    selectedCalendarIds: [],
    allTaskLists: true,
    selectedTaskListIds: [],
    dateRangeFilter: 'all',
    includeNoDate: true,
  },
  cal_week: {
    id: 'cal_week',
    name: 'Kalendarz - tydzień',
    shortName: 'Tydzień',
    description: 'Widget kalendarza w widoku tygodniowym z siatką godzinową',
    targetTab: 'calendar',
    calendarViewMode: 'tydzien',
    allCalendars: true,
    selectedCalendarIds: [],
    allTaskLists: true,
    selectedTaskListIds: [],
    dateRangeFilter: 'all',
    includeNoDate: true,
  },
  cal_day: {
    id: 'cal_day',
    name: 'Kalendarz - dzień',
    shortName: 'Dzień',
    description: 'Widget planu bieżącego dnia godzina po godzinie',
    targetTab: 'calendar',
    calendarViewMode: 'dzien',
    allCalendars: true,
    selectedCalendarIds: [],
    allTaskLists: true,
    selectedTaskListIds: [],
    dateRangeFilter: 'today',
    includeNoDate: false,
  },
  cal_schedule: {
    id: 'cal_schedule',
    name: 'Kalendarz - harmonogram',
    shortName: 'Harmonogram',
    description: 'Widget chronologicznej osi czasu wydarzeń i terminów',
    targetTab: 'calendar',
    calendarViewMode: 'harmonogram',
    allCalendars: true,
    selectedCalendarIds: [],
    allTaskLists: true,
    selectedTaskListIds: [],
    dateRangeFilter: 'all',
    includeNoDate: true,
  },
  tasks: {
    id: 'tasks',
    name: 'Zadania',
    shortName: 'Zadania',
    description: 'Widget listy zadań z filtrowaniem terminów i list',
    targetTab: 'tasks',
    allCalendars: true,
    selectedCalendarIds: [],
    allTaskLists: true,
    selectedTaskListIds: [],
    dateRangeFilter: 'all',
    includeNoDate: true,
  },
};

const STORAGE_KEY = 'app_mobile_widgets_configs_v1';

export function getWidgetConfigs(): Record<WidgetId, WidgetConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WIDGET_CONFIGS };
    const parsed = JSON.parse(raw);
    const result = { ...DEFAULT_WIDGET_CONFIGS };
    (Object.keys(DEFAULT_WIDGET_CONFIGS) as WidgetId[]).forEach((key) => {
      if (parsed[key]) {
        result[key] = {
          ...DEFAULT_WIDGET_CONFIGS[key],
          ...parsed[key],
        };
      }
    });
    return result;
  } catch (err) {
    console.error('Błąd odczytu konfiguracji widgetów:', err);
    return { ...DEFAULT_WIDGET_CONFIGS };
  }
}

export function getWidgetConfig(id: WidgetId): WidgetConfig {
  const configs = getWidgetConfigs();
  return configs[id] || DEFAULT_WIDGET_CONFIGS[id];
}

export function saveWidgetConfig(config: WidgetConfig): void {
  try {
    const current = getWidgetConfigs();
    current[config.id] = config;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (err) {
    console.error('Błąd zapisu konfiguracji widgetu:', err);
  }
}

export function resetWidgetConfig(id: WidgetId): WidgetConfig {
  const defaultConf = DEFAULT_WIDGET_CONFIGS[id];
  saveWidgetConfig(defaultConf);
  return defaultConf;
}

export function getWidgetUrl(id: WidgetId): string {
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}?widget=${id}`;
}
