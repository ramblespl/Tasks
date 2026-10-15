import { CalendarEventItem, GoogleTaskItem } from '../types';
import { expandAllTasksWithRecurrence, TaskOccurrenceItem } from './recurrenceUtils';

export type DateFilterPreset =
  | 'from_today'
  | 'today'
  | 'next_7_days'
  | 'next_30_days'
  | 'this_month'
  | 'all'
  | 'custom';

export interface DateRangeState {
  preset: DateFilterPreset;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD or ''
}

export const DATE_PRESET_LABELS: Record<DateFilterPreset, string> = {
  from_today: 'Od dzisiaj',
  today: 'Tylko dzisiaj',
  next_7_days: 'Najbliższe 7 dni',
  next_30_days: 'Najbliższe 30 dni',
  this_month: 'Ten miesiąc',
  all: 'Wszystkie (w tym przeszłe)',
  custom: 'Własny zakres',
};

/**
 * Returns today's date in local time as YYYY-MM-DD
 */
export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Adds N days to a base YYYY-MM-DD string
 */
export function addDaysToDateString(baseDateStr: string, days: number): string {
  const [y, m, d] = baseDateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns the last day of the current month as YYYY-MM-DD
 */
export function getEndOfCurrentMonthString(): string {
  const d = new Date();
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const year = lastDay.getFullYear();
  const month = String(lastDay.getMonth() + 1).padStart(2, '0');
  const day = String(lastDay.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculates start and end date for a given preset
 */
export function calculatePresetDates(
  preset: DateFilterPreset,
  currentStart?: string,
  currentEnd?: string
): { startDate: string; endDate: string } {
  const today = getTodayDateString();

  switch (preset) {
    case 'from_today':
      return { startDate: today, endDate: '' };
    case 'today':
      return { startDate: today, endDate: today };
    case 'next_7_days':
      return { startDate: today, endDate: addDaysToDateString(today, 7) };
    case 'next_30_days':
      return { startDate: today, endDate: addDaysToDateString(today, 30) };
    case 'this_month':
      return { startDate: today, endDate: getEndOfCurrentMonthString() };
    case 'all':
      return { startDate: '', endDate: '' };
    case 'custom':
      return {
        startDate: currentStart || today,
        endDate: currentEnd || '',
      };
    default:
      return { startDate: today, endDate: '' };
  }
}

/**
 * Default initial date range: from current day onwards
 */
export function getDefaultDateRange(): DateRangeState {
  const today = getTodayDateString();
  return {
    preset: 'from_today',
    startDate: today,
    endDate: '',
  };
}

/**
 * Default date range for Widok kalendarza: wszystkie daty (w tym przeszłe)
 */
export function getCalendarViewDefaultDateRange(): DateRangeState {
  return {
    preset: 'all',
    startDate: '',
    endDate: '',
  };
}

/**
 * Default date range for Kalendarz w Pulpicie głównym: najbliższe 30 dni
 */
export function getDashboardCalendarDefaultDateRange(): DateRangeState {
  const today = getTodayDateString();
  return {
    preset: 'next_30_days',
    startDate: today,
    endDate: addDaysToDateString(today, 30),
  };
}

/**
 * Default date range for Lista zadań w Pulpicie głównym: najbliższe 7 dni
 */
export function getDashboardTasksDefaultDateRange(): DateRangeState {
  const today = getTodayDateString();
  return {
    preset: 'next_7_days',
    startDate: today,
    endDate: addDaysToDateString(today, 7),
  };
}

/**
 * Default date range for Karta Zadania: najbliższe 30 dni
 */
export function getTasksViewTasksDefaultDateRange(): DateRangeState {
  const today = getTodayDateString();
  return {
    preset: 'next_30_days',
    startDate: today,
    endDate: addDaysToDateString(today, 30),
  };
}

/**
 * Converts ISO date-time or date string to local YYYY-MM-DD
 */
export function extractLocalDateStr(isoOrDateStr?: string): string {
  if (!isoOrDateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDateStr)) {
    return isoOrDateStr;
  }
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z$/i.test(isoOrDateStr)) {
    return isoOrDateStr.split('T')[0];
  }
  const d = new Date(isoOrDateStr);
  if (isNaN(d.getTime())) {
    return isoOrDateStr.substring(0, 10);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Formats YYYY-MM-DD to human readable Polish date (e.g. 19 wrz 2026)
 */
export function formatHumanDate(dateStr?: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Filters calendar events according to the date range
 */
export function filterCalendarEvents(
  events: CalendarEventItem[],
  range: DateRangeState
): CalendarEventItem[] {
  const { startDate, endDate } = range;

  // If no date boundaries, return all
  if (!startDate && !endDate) {
    return events;
  }

  return events.filter((ev) => {
    const rawStart = ev.start.dateTime || ev.start.date;
    if (!rawStart) return true;

    const startStr = extractLocalDateStr(rawStart);

    let endStr = startStr;
    if (ev.end?.dateTime || ev.end?.date) {
      const rawEnd = ev.end.dateTime || ev.end.date;
      const parsedEnd = extractLocalDateStr(rawEnd);
      // For all-day events where end.date is exclusive
      if (ev.end.date && !ev.end.dateTime && parsedEnd > startStr) {
        endStr = addDaysToDateString(parsedEnd, -1);
      } else {
        endStr = parsedEnd;
      }
    }

    // Check start boundary: event must not have ended before startDate
    if (startDate && endStr < startDate) {
      return false;
    }

    // Check end boundary: event must not start after endDate
    if (endDate && startStr > endDate) {
      return false;
    }

    return true;
  });
}

/**
 * Filters and expands tasks according to the date range and recurrence rules
 */
export function filterGoogleTasks(
  tasks: GoogleTaskItem[],
  range: DateRangeState,
  includeNoDateTasks: boolean = false
): TaskOccurrenceItem[] {
  return expandAllTasksWithRecurrence(tasks, range, includeNoDateTasks);
}
