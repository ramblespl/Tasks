import { CalendarEventItem } from '../types';

export interface GoogleColorDefinition {
  id?: string;
  name: string;
  hex: string;
  contrastText: string;
  bg: string;
  border: string;
  text: string;
}

export const isLightColor = (hex: string): boolean => {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  // Calculate relative luminance / brightness
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness >= 165;
};

// Google Calendar standard 1-11 event colors
export const GOOGLE_EVENT_COLORS: Record<string, GoogleColorDefinition> = {
  '1': {
    id: '1',
    name: 'Lawenda',
    hex: '#7986cb',
    contrastText: '#ffffff',
    bg: '#eef0fa',
    border: '#c5cae9',
    text: '#283593',
  },
  '2': {
    id: '2',
    name: 'Szałwia',
    hex: '#33b679',
    contrastText: '#ffffff',
    bg: '#e8f7ee',
    border: '#a3e4c1',
    text: '#135c36',
  },
  '3': {
    id: '3',
    name: 'Winogrono',
    hex: '#8e24aa',
    contrastText: '#ffffff',
    bg: '#f6e9fa',
    border: '#e1bee7',
    text: '#4a148c',
  },
  '4': {
    id: '4',
    name: 'Flaming',
    hex: '#e67c73',
    contrastText: '#ffffff',
    bg: '#fdedec',
    border: '#f5c6cb',
    text: '#78281f',
  },
  '5': {
    id: '5',
    name: 'Banan',
    hex: '#f6bf26',
    contrastText: '#1f2937',
    bg: '#fef9e7',
    border: '#fdebd0',
    text: '#7d6608',
  },
  '6': {
    id: '6',
    name: 'Mandarynka',
    hex: '#f4511e',
    contrastText: '#ffffff',
    bg: '#fbeee6',
    border: '#f5cba7',
    text: '#6e2c00',
  },
  '7': {
    id: '7',
    name: 'Paw',
    hex: '#039be5',
    contrastText: '#ffffff',
    bg: '#e6f4fb',
    border: '#b3e5fc',
    text: '#01579b',
  },
  '8': {
    id: '8',
    name: 'Grafit',
    hex: '#616161',
    contrastText: '#ffffff',
    bg: '#f2f2f2',
    border: '#e0e0e0',
    text: '#212121',
  },
  '9': {
    id: '9',
    name: 'Jagoda',
    hex: '#3f51b5',
    contrastText: '#ffffff',
    bg: '#eceef9',
    border: '#c5cae9',
    text: '#1a237e',
  },
  '10': {
    id: '10',
    name: 'Bazylia',
    hex: '#0b8043',
    contrastText: '#ffffff',
    bg: '#e6f4ea',
    border: '#a8dab5',
    text: '#0d652d',
  },
  '11': {
    id: '11',
    name: 'Pomidor',
    hex: '#d50000',
    contrastText: '#ffffff',
    bg: '#fde8e8',
    border: '#f8b4b4',
    text: '#9b1c1c',
  },
};

export const GOOGLE_EVENT_COLOR_OPTIONS: GoogleColorDefinition[] = Object.values(GOOGLE_EVENT_COLORS);

const DEFAULT_EVENT_COLOR: GoogleColorDefinition = {
  id: '7',
  name: 'Standardowy błękit (Paw)',
  hex: '#039be5',
  contrastText: '#ffffff',
  bg: '#e6f4fb',
  border: '#b3e5fc',
  text: '#01579b',
};

export const BIRCH_TASK_COLOR: GoogleColorDefinition = {
  id: 'birch',
  name: 'Brzoza',
  hex: '#a79b8e',
  contrastText: '#ffffff',
  bg: '#f6f4f1',
  border: '#d7d0c7',
  text: '#4a4137',
};

export const TASK_EVENT_COLOR: GoogleColorDefinition = BIRCH_TASK_COLOR;

/**
 * Checks if a calendar event represents a task loaded from Google Tasks (To Do)
 */
export const isCalendarTaskEvent = (
  event: CalendarEventItem,
  explicitIsTask: boolean = false
): boolean => {
  return (
    explicitIsTask ||
    event.id.startsWith('gtask-') ||
    !!event.description?.includes('[Zadanie Google Tasks]') ||
    event.colorId === 'birch'
  );
};

/**
 * Resolves styling colors according to Google Calendar API event colorId,
 * template assigned label (Kolor w Kalendarzu Google), or calendar backgroundColor fallback.
 * 
 * Rules:
 * 1. If an event or task has an assigned colorId (1-11) from Google Calendar or template,
 *    display that color (przypisana etykieta / Kolor w Kalendarzu Google).
 * 2. ONLY tasks loaded from To Do (Google Tasks, id starts with 'gtask-' or colorId 'birch')
 *    without an assigned label have the Birch (Brzoza) color.
 * 3. Calendar events (including events created by a template) without a specific colorId
 *    use their calendar's color (or default Paw). They NEVER have Birch.
 */
export const getGoogleEventColor = (
  event: CalendarEventItem,
  isTask: boolean = false,
  fallbackColorId?: string
): GoogleColorDefinition => {
  // 1. Specific event colorId set in Google Calendar or assigned template label (1-11) ALWAYS takes top precedence
  if (event.colorId && GOOGLE_EVENT_COLORS[event.colorId]) {
    return GOOGLE_EVENT_COLORS[event.colorId];
  }

  // 1b. Fallback colorId (e.g. from matched template)
  if (fallbackColorId && GOOGLE_EVENT_COLORS[fallbackColorId]) {
    return GOOGLE_EVENT_COLORS[fallbackColorId];
  }

  // 2. Only tasks loaded from To Do (id starts with 'gtask-' or explicitly birch) have Birch color
  if (event.id.startsWith('gtask-') || event.colorId === 'birch') {
    return BIRCH_TASK_COLOR;
  }

  // 3. Custom calendar color from Google Calendar API
  if (event.calendarColor) {
    const light = isLightColor(event.calendarColor);
    return {
      name: event.calendarSummary || 'Kalendarz',
      hex: event.calendarColor,
      contrastText: light ? '#1f2937' : '#ffffff',
      bg: `${event.calendarColor}20`, // 12% opacity
      border: `${event.calendarColor}60`, // 38% opacity
      text: light ? '#111827' : '#1e293b',
    };
  }

  return DEFAULT_EVENT_COLOR;
};
