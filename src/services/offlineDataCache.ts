import { CalendarListItem, CalendarEventItem, GoogleTaskList, GoogleTaskItem } from '../types';

const KEY_CACHED_CALENDARS = 'app_cached_calendars_v1';
const KEY_CACHED_EVENTS = 'app_cached_events_v1';
const KEY_CACHED_TASK_LISTS = 'app_cached_task_lists_v1';
const KEY_CACHED_TASKS = 'app_cached_tasks_v1';

export const getCachedCalendars = (): CalendarListItem[] => {
  try {
    const raw = localStorage.getItem(KEY_CACHED_CALENDARS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveCachedCalendars = (calendars: CalendarListItem[]): void => {
  try {
    if (Array.isArray(calendars) && calendars.length > 0) {
      localStorage.setItem(KEY_CACHED_CALENDARS, JSON.stringify(calendars));
    }
  } catch (err) {
    console.warn('Nie udało się zapisać pamięci podręcznej kalendarzy:', err);
  }
};

export const getCachedEvents = (): CalendarEventItem[] => {
  try {
    const raw = localStorage.getItem(KEY_CACHED_EVENTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveCachedEvents = (events: CalendarEventItem[]): void => {
  try {
    if (Array.isArray(events)) {
      localStorage.setItem(KEY_CACHED_EVENTS, JSON.stringify(events));
    }
  } catch (err) {
    console.warn('Nie udało się zapisać pamięci podręcznej wydarzeń:', err);
  }
};

export const getCachedTaskLists = (): GoogleTaskList[] => {
  try {
    const raw = localStorage.getItem(KEY_CACHED_TASK_LISTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveCachedTaskLists = (taskLists: GoogleTaskList[]): void => {
  try {
    if (Array.isArray(taskLists) && taskLists.length > 0) {
      localStorage.setItem(KEY_CACHED_TASK_LISTS, JSON.stringify(taskLists));
    }
  } catch (err) {
    console.warn('Nie udało się zapisać pamięci podręcznej list zadań:', err);
  }
};

export const getCachedTasks = (): GoogleTaskItem[] => {
  try {
    const raw = localStorage.getItem(KEY_CACHED_TASKS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveCachedTasks = (tasks: GoogleTaskItem[]): void => {
  try {
    if (Array.isArray(tasks)) {
      localStorage.setItem(KEY_CACHED_TASKS, JSON.stringify(tasks));
    }
  } catch (err) {
    console.warn('Nie udało się zapisać pamięci podręcznej zadań:', err);
  }
};

export const clearOfflineDataCache = (): void => {
  try {
    localStorage.removeItem(KEY_CACHED_CALENDARS);
    localStorage.removeItem(KEY_CACHED_EVENTS);
    localStorage.removeItem(KEY_CACHED_TASK_LISTS);
    localStorage.removeItem(KEY_CACHED_TASKS);
  } catch (err) {
    console.warn('Błąd czyszczenia pamięci podręcznej danych:', err);
  }
};
