import { GoogleTaskItem, CalendarEventItem } from '../types';
import { DateRangeState, extractLocalDateStr, addDaysToDateString, getTodayDateString } from './dateFilterUtils';

export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY';

export interface ParsedRecurrence {
  frequency: RecurrenceFrequency;
  interval: number;
  label: string;
  rrule?: string;
  count?: number;
  until?: string; // YYYY-MM-DD
}

export interface TaskOccurrenceItem extends GoogleTaskItem {
  isRecurringOccurrence?: boolean;
  originalTaskId?: string;
  recurrenceLabel?: string;
  occurrenceIndex?: number;
  recurrenceDateStr?: string;
}

/**
 * Detects if a task has a recurrence pattern in its title, notes, or RRULE string
 */
export function parseTaskRecurrence(title: string, notes?: string): ParsedRecurrence | null {
  const combined = `${title || ''} ${notes || ''}`.toLowerCase();

  // 1. RRULE checks
  const rruleMatch = combined.match(/rrule:([^\n\r]+)/i);
  if (rruleMatch) {
    const ruleStr = rruleMatch[1].toUpperCase();
    let freq: RecurrenceFrequency = 'WEEKLY';
    let interval = 1;
    let count: number | undefined = undefined;
    let until: string | undefined = undefined;

    if (ruleStr.includes('FREQ=DAILY')) freq = 'DAILY';
    else if (ruleStr.includes('FREQ=WEEKLY')) freq = 'WEEKLY';
    else if (ruleStr.includes('FREQ=MONTHLY')) freq = 'MONTHLY';
    else if (ruleStr.includes('FREQ=YEARLY')) freq = 'YEARLY';

    const intervalMatch = ruleStr.match(/INTERVAL=(\d+)/);
    if (intervalMatch) {
      interval = parseInt(intervalMatch[1], 10) || 1;
    }

    if (freq === 'WEEKLY' && interval === 2) {
      freq = 'BIWEEKLY';
      interval = 1;
    }

    const countMatch = ruleStr.match(/COUNT=(\d+)/);
    if (countMatch) {
      count = parseInt(countMatch[1], 10);
    }

    const untilMatch = ruleStr.match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
    if (untilMatch) {
      until = `${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}`;
    }

    let label = 'Powtarzalne';
    if (freq === 'DAILY') label = interval > 1 ? `Co ${interval} dni` : 'Codziennie';
    else if (freq === 'WEEKLY') label = interval > 1 ? `Co ${interval} tyg.` : 'Co tydzień';
    else if (freq === 'BIWEEKLY') label = 'Co 2 tygodnie';
    else if (freq === 'MONTHLY') label = interval > 1 ? `Co ${interval} mies.` : 'Co miesiąc';
    else if (freq === 'YEARLY') label = interval > 1 ? `Co ${interval} lata` : 'Co rok';

    return { frequency: freq, interval, label, count, until, rrule: ruleStr };
  }

  // 2. Keyword detection
  if (
    /\b(?:codziennie|co\s*dzie[nń]|daily|każdego\s*dnia|kazdego\s*dnia)\b/i.test(combined) ||
    combined.includes('freq=daily')
  ) {
    return {
      frequency: 'DAILY',
      interval: 1,
      label: 'Codziennie',
    };
  }

  if (
    /\b(?:co\s*2\s*tygodnie|co\s*dwa\s*tygodnie|biweekly|co\s*drugi\s*tydzie[nń])\b/i.test(combined) ||
    combined.includes('interval=2')
  ) {
    return {
      frequency: 'BIWEEKLY',
      interval: 1,
      label: 'Co 2 tygodnie',
    };
  }

  if (
    /\b(?:co\s*tydzie[nń]|cotygodniow[a-z]*|weekly|każdego\s*tygodnia|kazdego\s*tygodnia)\b/i.test(combined) ||
    combined.includes('freq=weekly')
  ) {
    return {
      frequency: 'WEEKLY',
      interval: 1,
      label: 'Co tydzień',
    };
  }

  if (
    /\b(?:co\s*miesi[aą]c|comiesi[eę]czn[a-z]*|monthly|każdego\s*miesi[aą]ca|kazdego\s*miesi[aą]ca)\b/i.test(combined) ||
    combined.includes('freq=monthly')
  ) {
    return {
      frequency: 'MONTHLY',
      interval: 1,
      label: 'Co miesiąc',
    };
  }

  if (
    /\b(?:co\s*rok|co\s*roku|coroczn[a-z]*|yearly|annually|każdego\s*roku|kazdego\s*roku)\b/i.test(combined) ||
    combined.includes('freq=yearly')
  ) {
    return {
      frequency: 'YEARLY',
      interval: 1,
      label: 'Co rok',
    };
  }

  return null;
}

/**
 * Calculates the next date given a base date and recurrence frequency & step
 */
export function stepRecurrenceDate(
  baseDateStr: string,
  frequency: RecurrenceFrequency,
  stepIndex: number
): string {
  if (stepIndex === 0) return baseDateStr;

  const [y, m, d] = baseDateStr.split('-').map(Number);
  const nextDate = new Date(y, m - 1, d);

  switch (frequency) {
    case 'DAILY':
      nextDate.setDate(nextDate.getDate() + stepIndex);
      break;
    case 'WEEKLY':
      nextDate.setDate(nextDate.getDate() + stepIndex * 7);
      break;
    case 'BIWEEKLY':
      nextDate.setDate(nextDate.getDate() + stepIndex * 14);
      break;
    case 'MONTHLY':
      nextDate.setMonth(nextDate.getMonth() + stepIndex);
      break;
    case 'YEARLY':
      nextDate.setFullYear(nextDate.getFullYear() + stepIndex);
      break;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}-${pad(nextDate.getDate())}`;
}

/**
 * Expands a single task into its recurring occurrences within a date range
 */
export function expandTaskOccurrences(
  task: GoogleTaskItem,
  range: DateRangeState,
  includeNoDateTasks: boolean = false
): TaskOccurrenceItem[] {
  if (!task.due) {
    return includeNoDateTasks ? [task] : [];
  }

  const baseDateStr = extractLocalDateStr(task.due);
  if (!baseDateStr) {
    return includeNoDateTasks ? [task] : [];
  }

  const rec = parseTaskRecurrence(task.title, task.notes);
  const { startDate, endDate } = range;

  // Non-recurring task: simple range check
  if (!rec) {
    if (startDate && baseDateStr < startDate) return [];
    if (endDate && baseDateStr > endDate) return [];
    return [task];
  }

  // Recurring task: generate occurrences
  const today = getTodayDateString();
  const effectiveStart = startDate || addDaysToDateString(today, -30);
  const effectiveEnd = endDate || addDaysToDateString(today, 365);

  const occurrences: TaskOccurrenceItem[] = [];

  // Helper to calculate days between two dates YYYY-MM-DD
  const getDaysBetween = (d1: string, d2: string): number => {
    const [y1, m1, day1] = d1.split('-').map(Number);
    const [y2, m2, day2] = d2.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, day2) - Date.UTC(y1, m1 - 1, day1)) / (1000 * 60 * 60 * 24));
  };

  // Determine starting index if baseDateStr is far behind effectiveStart
  let startIdx = 0;
  if (!rec.count && baseDateStr < effectiveStart) {
    const diffDays = getDaysBetween(baseDateStr, effectiveStart);
    if (diffDays > 0) {
      if (rec.frequency === 'DAILY') {
        startIdx = Math.max(0, Math.floor(diffDays / (rec.interval || 1)) - 1);
      } else if (rec.frequency === 'WEEKLY') {
        startIdx = Math.max(0, Math.floor(diffDays / (7 * (rec.interval || 1))) - 1);
      } else if (rec.frequency === 'BIWEEKLY') {
        startIdx = Math.max(0, Math.floor(diffDays / 14) - 1);
      } else if (rec.frequency === 'MONTHLY') {
        const [by, bm] = baseDateStr.split('-').map(Number);
        const [sy, sm] = effectiveStart.split('-').map(Number);
        const mDiff = (sy - by) * 12 + (sm - bm);
        startIdx = Math.max(0, Math.floor(mDiff / (rec.interval || 1)) - 1);
      } else if (rec.frequency === 'YEARLY') {
        const by = parseInt(baseDateStr.split('-')[0], 10);
        const sy = parseInt(effectiveStart.split('-')[0], 10);
        startIdx = Math.max(0, sy - by - 1);
      }
    }
  }

  const maxTotalSteps = rec.count || 200;
  let collected = 0;

  for (let idx = startIdx; idx < startIdx + maxTotalSteps && collected < 100; idx++) {
    const curDateStr = stepRecurrenceDate(baseDateStr, rec.frequency, idx);

    // If until date is reached, stop
    if (rec.until && curDateStr > rec.until) {
      break;
    }

    // If date is beyond our search window, stop
    if (effectiveEnd && curDateStr > effectiveEnd) {
      break;
    }

    // Check if occurrence falls within requested window
    const isInStart = !startDate || curDateStr >= startDate;
    const isInEnd = !endDate || curDateStr <= endDate;

    if (isInStart && isInEnd) {
      const occurrenceDue = task.due.includes('T')
        ? `${curDateStr}T${task.due.split('T')[1]}`
        : curDateStr;

      occurrences.push({
        ...task,
        id: idx === 0 ? task.id : `${task.id}__rec__${curDateStr}`,
        originalTaskId: task.id,
        due: occurrenceDue,
        isRecurringOccurrence: true,
        occurrenceIndex: idx,
        recurrenceLabel: rec.label,
        recurrenceDateStr: curDateStr,
      });
      collected++;
    }
  }

  return occurrences;
}

/**
 * Expands all tasks according to event recurrence within a date range
 */
export function expandAllTasksWithRecurrence(
  tasks: GoogleTaskItem[],
  range: DateRangeState,
  includeNoDateTasks: boolean = false
): TaskOccurrenceItem[] {
  const result: TaskOccurrenceItem[] = [];

  for (const task of tasks) {
    const occurrences = expandTaskOccurrences(task, range, includeNoDateTasks);
    result.push(...occurrences);
  }

  // Sort by due date ascending
  return result.sort((a, b) => {
    if (!a.due) return 1;
    if (!b.due) return -1;
    return a.due.localeCompare(b.due);
  });
}

/**
 * Checks if a calendar event is recurring
 */
export function isEventRecurring(event: CalendarEventItem): boolean {
  if (event.recurringEventId) return true;
  if (event.recurrence && event.recurrence.length > 0) return true;
  if (event.description?.includes('[Powtarzalne]')) return true;
  if (event.description?.includes('Częstotliwość:')) return true;
  return false;
}
