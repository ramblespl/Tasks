import { CalendarListItem, CalendarEventItem } from '../types';

const fetchCalendarWithRetry = async (
  url: string,
  options: RequestInit,
  retries = 1
): Promise<Response> => {
  try {
    return await fetch(url, options);
  } catch (err: any) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return fetchCalendarWithRetry(url, options, retries - 1);
    }
    throw new Error(
      `Błąd połączenia z Google Calendar API (${err.message || 'Failed to fetch'}). Sprawdź połączenie z internetem lub rozszerzenia blokujące.`
    );
  }
};

export const listUserCalendars = async (token: string): Promise<CalendarListItem[]> => {
  if (!token || !token.trim()) {
    throw new Error('Brak tokenu autoryzacji Google. Zaloguj się ponownie.');
  }

  const response = await fetchCalendarWithRetry(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Sesja Google wygasła (401). Zaloguj się ponownie, aby odświeżyć uprawnienia.');
    }
    if (response.status === 403) {
      throw new Error(
        'Brak uprawnień do odczytu kalendarza (403). Zaloguj się ponownie i zaznacz zgodę na dostęp do Google Calendar.'
      );
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Nie udało się pobrać listy kalendarzy (${response.status})`
    );
  }

  const data = await response.json();
  return (data.items || []).map((item: any) => ({
    id: item.id,
    summary: item.summary,
    description: item.description,
    primary: item.primary,
    backgroundColor: item.backgroundColor,
  }));
};

export const findPrimaryCalendar = (
  calendars: CalendarListItem[]
): CalendarListItem | null => {
  if (!calendars || calendars.length === 0) return null;
  // Google Calendar marks the user's main calendar with primary: true
  const primary = calendars.find((c) => c.primary && c.id !== ALL_CALENDARS_ID);
  if (primary) return primary;
  const byId = calendars.find((c) => c.id === 'primary');
  if (byId) return byId;
  const firstNonAll = calendars.find((c) => c.id !== ALL_CALENDARS_ID);
  return firstNonAll || null;
};

export const findPreferredCalendar = (
  calendars: CalendarListItem[],
  preferredName?: string
): CalendarListItem | null => {
  if (!calendars || calendars.length === 0) return null;

  if (preferredName) {
    const normalizedPref = preferredName.trim().toLowerCase();
    const exact = calendars.find((c) => c.summary?.trim().toLowerCase() === normalizedPref);
    if (exact) return exact;
  }

  // Default to primary or first non-all calendar
  return calendars.find((c) => c.primary) || calendars.find((c) => c.id !== ALL_CALENDARS_ID) || calendars[0] || null;
};

export const findTravelCalendar = findPreferredCalendar;

export const getCalendarEvents = async (
  token: string,
  calendarId: string,
  timeMin?: string
): Promise<CalendarEventItem[]> => {
  if (!token || !token.trim()) {
    throw new Error('Brak tokenu autoryzacji Google. Zaloguj się ponownie.');
  }

  // Fetch events from the last 180 days up to 2 years ahead with singleEvents=true to expand recurring events
  const minTime = timeMin || new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const maxTime = new Date(Date.now() + 730 * 24 * 60 * 60 * 1000).toISOString();

  const allItems: any[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    );
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('timeMin', minTime);
    url.searchParams.set('timeMax', maxTime);
    url.searchParams.set('maxResults', '250');
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const response = await fetchCalendarWithRetry(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Sesja Google wygasła (401). Zaloguj się ponownie.');
      }
      if (response.status === 403) {
        throw new Error(
          'Brak uprawnień do odczytu kalendarza (403). Zaloguj się ponownie i zaznacz zgodę na dostęp do Google Calendar.'
        );
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || `Nie udało się pobrać wydarzeń z kalendarza (${response.status})`
      );
    }

    const data = await response.json();
    if (data.items && Array.isArray(data.items)) {
      allItems.push(...data.items);
    }
    pageToken = data.nextPageToken;
  } while (pageToken && allItems.length < 1500);

  return allItems.map((item: any) => ({
    id: item.id,
    summary: item.summary || '(Brak tytułu wydarzenia)',
    description: item.description,
    start: {
      dateTime: item.start?.dateTime,
      date: item.start?.date,
    },
    end: {
      dateTime: item.end?.dateTime,
      date: item.end?.date,
    },
    location: item.location,
    htmlLink: item.htmlLink,
    colorId: item.colorId,
    calendarId: calendarId,
    recurringEventId: item.recurringEventId,
    recurrence: item.recurrence,
  }));
};

export interface CreateCalendarEventPayload {
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  location?: string;
  colorId?: string;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: 'popup' | 'email'; minutes: number }>;
  };
}

export const createCalendarEvent = async (
  token: string,
  calendarId: string,
  payload: CreateCalendarEventPayload
): Promise<CalendarEventItem> => {
  if (!token || !token.trim()) {
    throw new Error('Brak tokenu autoryzacji Google. Zaloguj się ponownie.');
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

  const response = await fetchCalendarWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Sesja Google wygasła (401). Zaloguj się ponownie.');
    }
    if (response.status === 403) {
      throw new Error(
        'Brak uprawnień do zapisu w Kalendarzu Google (403). Zaloguj się ponownie, aby nadać uprawnienia do tworzenia wydarzeń.'
      );
    }
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.error?.message || `Nie udało się utworzyć wydarzenia (${response.status})`);
  }

  const item = await response.json();
  return {
    id: item.id,
    summary: item.summary,
    description: item.description,
    start: {
      dateTime: item.start?.dateTime,
      date: item.start?.date,
    },
    end: {
      dateTime: item.end?.dateTime,
      date: item.end?.date,
    },
    location: item.location,
    htmlLink: item.htmlLink,
    colorId: item.colorId,
  };
};

export const deleteCalendarEvent = async (
  token: string,
  calendarId: string,
  eventId: string
): Promise<void> => {
  if (!token || !token.trim()) {
    throw new Error('Brak tokenu autoryzacji Google. Zaloguj się ponownie.');
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId
  )}/events/${encodeURIComponent(eventId)}`;

  const response = await fetchCalendarWithRetry(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    if (response.status === 404 || response.status === 410) {
      // Event already deleted or not found in Google Calendar
      return;
    }
    if (response.status === 401) {
      throw new Error('Sesja Google wygasła (401). Zaloguj się ponownie.');
    }
    if (response.status === 403) {
      throw new Error('Brak uprawnień do usuwania wydarzeń z Kalendarza Google (403).');
    }
    const errJson = await response.json().catch(() => ({}));
    throw new Error(
      errJson.error?.message || `Nie udało się usunąć wydarzenia (${response.status})`
    );
  }
};

export const updateCalendarEvent = async (
  token: string,
  calendarId: string,
  eventId: string,
  payload: Partial<CreateCalendarEventPayload>
): Promise<CalendarEventItem> => {
  if (!token || !token.trim()) {
    throw new Error('Brak tokenu autoryzacji Google. Zaloguj się ponownie.');
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId
  )}/events/${encodeURIComponent(eventId)}`;

  const response = await fetchCalendarWithRetry(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Sesja Google wygasła (401). Zaloguj się ponownie.');
    }
    if (response.status === 403) {
      throw new Error('Brak uprawnień do edycji wydarzeń w Kalendarzu Google (403).');
    }
    const errJson = await response.json().catch(() => ({}));
    throw new Error(
      errJson.error?.message || `Nie udało się zaktualizować wydarzenia (${response.status})`
    );
  }

  const item = await response.json();
  return {
    id: item.id,
    summary: item.summary,
    description: item.description,
    start: {
      dateTime: item.start?.dateTime,
      date: item.start?.date,
    },
    end: {
      dateTime: item.end?.dateTime,
      date: item.end?.date,
    },
    location: item.location,
    htmlLink: item.htmlLink,
    colorId: item.colorId,
  };
};

export const ALL_CALENDARS_ID = '__ALL_CALENDARS__';

export const ALL_CALENDARS_ITEM: CalendarListItem = {
  id: ALL_CALENDARS_ID,
  summary: 'Wszystkie kalendarze',
  description: 'Zbiorczy widok ze wszystkich Twoich kalendarzy Google',
  primary: false,
  backgroundColor: '#4f46e5',
};

export const getAllCalendarsEvents = async (
  token: string,
  calendars: CalendarListItem[],
  timeMin?: string
): Promise<CalendarEventItem[]> => {
  if (!token || !calendars || calendars.length === 0) return [];
  const validCalendars = calendars.filter((c) => c.id !== ALL_CALENDARS_ID);

  const results = await Promise.allSettled(
    validCalendars.map(async (cal) => {
      const items = await getCalendarEvents(token, cal.id, timeMin);
      return items.map((item) => ({
        ...item,
        calendarId: cal.id,
        calendarSummary: cal.summary,
        calendarColor: cal.backgroundColor,
      }));
    })
  );

  const allItems: CalendarEventItem[] = [];
  results.forEach((res) => {
    if (res.status === 'fulfilled') {
      allItems.push(...res.value);
    }
  });

  // Deduplicate by event.id
  const seen = new Set<string>();
  const uniqueItems: CalendarEventItem[] = [];
  for (const item of allItems) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      uniqueItems.push(item);
    }
  }

  // Sort by start time ascending
  return uniqueItems.sort((a, b) => {
    const startA = a.start.dateTime || a.start.date || '';
    const startB = b.start.dateTime || b.start.date || '';
    return startA.localeCompare(startB);
  });
};

/**
 * Fetch events for a specific subset of selected calendars (checkbox multi-selection)
 */
export const getEventsForCalendars = async (
  token: string,
  targetCalendarIds: string[],
  calendars: CalendarListItem[],
  timeMin?: string
): Promise<CalendarEventItem[]> => {
  if (!token || !targetCalendarIds || targetCalendarIds.length === 0) return [];

  // If ALL_CALENDARS_ID is included, fetch from all available user calendars
  if (targetCalendarIds.includes(ALL_CALENDARS_ID)) {
    return getAllCalendarsEvents(token, calendars, timeMin);
  }

  const selectedCals = calendars.filter((c) => targetCalendarIds.includes(c.id));
  if (selectedCals.length === 0) return [];

  const results = await Promise.allSettled(
    selectedCals.map(async (cal) => {
      const items = await getCalendarEvents(token, cal.id, timeMin);
      return items.map((item) => ({
        ...item,
        calendarId: cal.id,
        calendarSummary: cal.summary,
        calendarColor: cal.backgroundColor,
      }));
    })
  );

  const allItems: CalendarEventItem[] = [];
  results.forEach((res) => {
    if (res.status === 'fulfilled') {
      allItems.push(...res.value);
    }
  });

  const seen = new Set<string>();
  const uniqueItems: CalendarEventItem[] = [];
  for (const item of allItems) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      uniqueItems.push(item);
    }
  }

  return uniqueItems.sort((a, b) => {
    const startA = a.start.dateTime || a.start.date || '';
    const startB = b.start.dateTime || b.start.date || '';
    return startA.localeCompare(startB);
  });
};

/**
 * Helper to determine if an event is an all-day event or lasts longer than 24 hours
 * (so it should be rendered in the top all-day bar instead of vertical hourly grid)
 */
export const isEventLongerThan24hOrAllDay = (ev: CalendarEventItem): boolean => {
  // Date-only events in Google Calendar are all-day by definition
  if (!ev.start.dateTime) return true;

  if (ev.end?.dateTime) {
    const startMs = new Date(ev.start.dateTime).getTime();
    const endMs = new Date(ev.end.dateTime).getTime();
    if (!isNaN(startMs) && !isNaN(endMs)) {
      const diffHours = (endMs - startMs) / (1000 * 60 * 60);
      // Explicitly 24 hours or longer
      if (diffHours >= 24) return true;

      // Multi-day spanning across midnight with >= 16 hours duration
      const startDay = ev.start.dateTime.substring(0, 10);
      const endDay = ev.end.dateTime.substring(0, 10);
      if (startDay !== endDay && diffHours >= 16) return true;
    }
  } else if (ev.end?.date && ev.start.date) {
    return true;
  }

  return false;
};

/**
 * Generates an array of YYYY-MM-DD date strings that an event spans across.
 * Useful for mapping multi-day events so they appear on all days of the event.
 */
export const getEventDateSpan = (ev: CalendarEventItem): string[] => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const formatDate = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const rawStart = ev.start.dateTime || ev.start.date;
  if (!rawStart) return [];

  const startDayStr = rawStart.substring(0, 10);
  const rawEnd = ev.end?.dateTime || ev.end?.date;
  if (!rawEnd) return [startDayStr];

  const endDayStr = rawEnd.substring(0, 10);
  if (startDayStr === endDayStr) return [startDayStr];

  const dates: string[] = [];
  const curr = new Date(`${startDayStr}T00:00:00`);
  let endLimit = new Date(`${endDayStr}T00:00:00`);

  // Google Calendar all-day date-only events have exclusive end dates
  // e.g. 2026-09-18 to 2026-09-20 means Sept 18 & 19
  if (!ev.start.dateTime && ev.end?.date && endLimit > curr) {
    endLimit = new Date(endLimit.getTime() - 24 * 60 * 60 * 1000);
  }

  let safety = 0;
  while (curr <= endLimit && safety < 60) {
    dates.push(formatDate(curr));
    curr.setDate(curr.getDate() + 1);
    safety++;
  }

  return dates.length > 0 ? dates : [startDayStr];
};

/**
 * Moves an event from one Google Calendar to another.
 */
export const moveCalendarEvent = async (
  token: string,
  sourceCalendarId: string,
  eventId: string,
  destinationCalendarId: string
): Promise<CalendarEventItem> => {
  if (!token || !token.trim()) {
    throw new Error('Brak tokenu autoryzacji Google. Zaloguj się ponownie.');
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    sourceCalendarId
  )}/events/${encodeURIComponent(eventId)}/move?destination=${encodeURIComponent(
    destinationCalendarId
  )}`;

  const response = await fetchCalendarWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Sesja Google wygasła (401). Zaloguj się ponownie.');
    }
    const errJson = await response.json().catch(() => ({}));
    throw new Error(
      errJson.error?.message ||
        `Nie udało się przenieść wydarzenia do innego kalendarza (${response.status})`
    );
  }

  const item = await response.json();
  return {
    id: item.id,
    summary: item.summary,
    description: item.description,
    start: {
      dateTime: item.start?.dateTime,
      date: item.start?.date,
    },
    end: {
      dateTime: item.end?.dateTime,
      date: item.end?.date,
    },
    location: item.location,
    colorId: item.colorId,
    calendarId: destinationCalendarId,
  };
};


