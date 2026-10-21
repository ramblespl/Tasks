export interface GoogleUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export interface CalendarListItem {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  backgroundColor?: string;
}

export type GoogleCalendarItem = CalendarListItem;

export interface CalendarEventItem {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
  location?: string;
  htmlLink?: string;
  calendarId?: string;
  calendarSummary?: string;
  calendarColor?: string;
  colorId?: string;
  recurringEventId?: string;
  recurrence?: string[];
  taskStatus?: 'needsAction' | 'completed';
}

export interface GoogleTaskList {
  id: string;
  title: string;
  updated?: string;
}

export interface GoogleTaskItem {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  time?: string;
  status: 'needsAction' | 'completed';
  completed?: string;
  updated?: string;
  taskListId?: string;
  taskListTitle?: string;
}

export type TaskCategory = 'documents' | 'booking' | 'packing' | 'home' | 'health' | 'other';

export type DateAnchor = 'departure' | 'return';

export type TemplateCreationMode = 'event_and_task' | 'task_only' | 'event_only';

export interface TaskTemplateItem {
  id: string;
  title: string;
  daysOffset: number; // e.g. -7 means 7 days before anchor; 0 means on anchor day; +1 means 1 day after
  anchor?: DateAnchor; // 'departure' (default, start of trip) or 'return' (end of trip)
  category?: TaskCategory;
  notes?: string;
  time?: string; // e.g. "08:00", "18:30" (format HH:mm) or empty/undefined for all-day
  createCalendarEvent?: boolean; // whether to create calendar event with date & time (true: task + calendar event, false: task only)
  createTask?: boolean; // whether to create Google Task (false for 'event_only', true for others)
  creationMode?: TemplateCreationMode; // 'event_and_task' | 'task_only' | 'event_only'
  targetTaskListId?: string; // specific Google Tasks list ID to add this task to
  targetTaskListTitle?: string; // specific Google Tasks list title (display name)
  targetCalendarId?: string; // specific Google Calendar ID to create the event in
  colorId?: string; // specific Google Calendar event color ID (1-11)
}

export interface TaskTemplateSet {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  isDefault?: boolean;
  templates: TaskTemplateItem[];
}

export interface GeneratedTripRecord {
  eventId: string;
  eventSummary: string;
  tripStartDate: string;
  generatedAt: string;
  taskCount: number;
}

export interface SyncLogItem {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface DueDateDetails {
  rfc3339: string;
  targetDate: Date;
  dateFormatted: string;
  timeFormatted: string;
  fullFormatted: string;
  timingLabel: string;
  startDateTime: string;
  endDateTime: string;
  timeZone: string;
}

