import { CalendarListItem, CalendarEventItem } from '../types';
import { refreshGoogleTokenSilently, clearStoredAuth } from './firebaseAuth';
import { resolveSafeGoogleApiColor } from '../utils/googleCalendarColors';

const fetchCalendarWithRetry = async (
  url: string,
  options: RequestInit,
  retries = 1
): Promise<Response> => {
  try {
    const res = await fetch(url, options);
    if (res.status === 401) {
      if (retries > 0) {
        const freshToken = await refreshGoogleTokenSilently();
        if (freshToken) {
          const newHeaders = new Headers(options.headers || {});
          newHeaders.set('Authorization', `Bearer ${freshToken}`);
          return await fetch(url, { ...options, headers: newHeaders });
        }
      }
    }
    return res;
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

export const parseGoogleCalendarError = async (
  response: Response,
  actionDesc: string
): Promise<Error> => {
  const errorData = await response.json().catch(() => ({}));
  const apiMessage = errorData.error?.message || '';
  const reason = errorData.error?.errors?.[0]?.reason || '';

  if (response.status === 401) {
    return new Error('Sesja Google wygasła (401). Zaloguj się ponownie, aby odświeżyć uprawnienia.');
  }

  if (response.status === 403) {
    if (
      apiMessage.includes('has not been used') ||
      apiMessage.includes('disabled') ||
      reason === 'accessNotConfigured'
    ) {
      return new Error(
        `Google Calendar API nie jest aktywne w projekcie Google Cloud (403): ${apiMessage}. Wymagana konfiguracja OAuth / API w projekcie.`
      );
    }
    if (apiMessage.includes('insufficient') || reason === 'insufficientPermissions') {
      return new Error(
        `Brak uprawnień OAuth (403): ${apiMessage}. Zaloguj się ponownie i zaznacz wszystkie pola wyboru zgody Google.`
      );
    }
    return new Error(
      apiMessage
        ? `Błąd uprawnień Google Calendar (403): ${apiMessage}`
        : `${actionDesc}: brak uprawnień (403). Sprawdź uprawnienia do Google Calendar.`
    );
  }

  return new Error(apiMessage || `${actionDesc} (${response.status})`);
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
    throw await parseGoogleCalendarError(response, 'Nie udało się pobrać listy kalendarzy');
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
      throw await parseGoogleCalendarError(response, 'Nie udało się pobrać wydarzeń z kalendarza');
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
    colorId:
      item.colorId ||
      item.extendedProperties?.private?.customColorId ||
      item.extendedProperties?.private?.customColorHex ||
      undefined,
    calendarId: calendarId,
    recurringEventId: item.recurringEventId,
    recurrence: item.recurrence,
  }));
};

export interface CreateCalendarEventPayload {
  summary: string;
  description?: string;
  start: {
    dateTime?: string | null;
    date?: string | null;
    timeZone?: string;
  };
  end: {
    dateTime?: string | null;
    date?: string | null;
    timeZone?: string;
  };
  location?: string;
  colorId?: string;
  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: 'popup' | 'email'; minutes: number }>;
  };
}

/**
 * Helper to compute inclusive human end date when opening all-day event in modal.
 * Google Calendar API stores end.date as EXCLUSIVE (+1 day after the event ends).
 * For a 1-day event on 2026-10-15, Google Calendar has start.date: "2026-10-15", end.date: "2026-10-16".
 * This function returns "2026-10-15" so the human user sees start: 2026-10-15, end: 2026-10-15.
 */
export const getInclusiveAllDayEndDate = (startStr: string, endStr?: string): string => {
  if (!startStr) return '';
  if (!endStr || endStr <= startStr) return startStr;
  const [y, m, d] = endStr.split('-').map(Number);
  const prevDate = new Date(y, m - 1, d - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const inclusiveStr = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}-${pad(prevDate.getDate())}`;
  return inclusiveStr >= startStr ? inclusiveStr : startStr;
};

/**
 * Safely builds start and end objects for Google Calendar API.
 * - All-day: start.date = YYYY-MM-DD, end.date = exclusive date (at least start.date + 1 day).
 *   Never sends null dateTime values, which causes "Invalid start time" in Google Calendar API.
 * - Timed: start.dateTime = YYYY-MM-DDTHH:MM:00, end.dateTime = YYYY-MM-DDTHH:MM:00 (strictly after start),
 *   plus resolved IANA timeZone. Never sends null date values.
 */
export const formatCalendarEventStartEnd = (
  payload: {
    startDate: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
    isAllDay: boolean;
  },
  _isPatch = false
): {
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
} => {
  const pad = (n: number) => String(n).padStart(2, '0');

  const addDaysToDateStr = (dateStr: string, days: number): string => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

  const normalizeDateStr = (dateStr?: string): string => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const now = new Date();
      return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }
    return dateStr;
  };

  const startDateStr = normalizeDateStr(payload.startDate);

  if (payload.isAllDay) {
    // In human UI, endDate is inclusive (e.g. 2026-10-15 to 2026-10-15 is a 1-day event).
    // In Google Calendar API, end.date is EXCLUSIVE (must be strictly greater than start.date,
    // so a 1-day event on 2026-10-15 has end.date = 2026-10-16).
    const rawEndDate = payload.endDate ? normalizeDateStr(payload.endDate) : startDateStr;
    const inclusiveEndDate = rawEndDate >= startDateStr ? rawEndDate : startDateStr;
    const exclusiveEndDate = addDaysToDateStr(inclusiveEndDate, 1);

    return {
      start: {
        date: startDateStr,
      },
      end: {
        date: exclusiveEndDate,
      },
    };
  } else {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw';

    // Normalize start time (HH:MM)
    let sH = 9;
    let sM = 0;
    if (payload.startTime && /^(\d{1,2}):(\d{1,2})$/.test(payload.startTime.trim())) {
      const [h, m] = payload.startTime.trim().split(':').map(Number);
      if (!isNaN(h)) sH = Math.min(23, Math.max(0, h));
      if (!isNaN(m)) sM = Math.min(59, Math.max(0, m));
    }
    const startTimeStr = `${pad(sH)}:${pad(sM)}`;

    // Normalize end date and time
    let targetEndDate = payload.endDate ? normalizeDateStr(payload.endDate) : startDateStr;
    if (targetEndDate < startDateStr) {
      targetEndDate = startDateStr;
    }

    let eH = sH;
    let eM = sM + 30;
    if (eM >= 60) {
      eH += Math.floor(eM / 60);
      eM = eM % 60;
    }

    if (payload.endTime && /^(\d{1,2}):(\d{1,2})$/.test(payload.endTime.trim())) {
      const [h, m] = payload.endTime.trim().split(':').map(Number);
      if (!isNaN(h)) eH = Math.min(23, Math.max(0, h));
      if (!isNaN(m)) eM = Math.min(59, Math.max(0, m));
    }

    let endTimeStr = `${pad(eH)}:${pad(eM)}`;

    // Ensure (targetEndDate T endTimeStr) is strictly after (startDateStr T startTimeStr)
    const startMs = new Date(`${startDateStr}T${startTimeStr}:00`).getTime();
    const endMs = new Date(`${targetEndDate}T${endTimeStr}:00`).getTime();

    if (isNaN(endMs) || endMs <= startMs) {
      const autoEnd = new Date(startMs + 30 * 60 * 1000);
      targetEndDate = `${autoEnd.getFullYear()}-${pad(autoEnd.getMonth() + 1)}-${pad(autoEnd.getDate())}`;
      endTimeStr = `${pad(autoEnd.getHours())}:${pad(autoEnd.getMinutes())}`;
    }

    return {
      start: {
        dateTime: `${startDateStr}T${startTimeStr}:00`,
        timeZone: tz,
      },
      end: {
        dateTime: `${targetEndDate}T${endTimeStr}:00`,
        timeZone: tz,
      },
    };
  }
};

export const createCalendarEvent = async (
  token: string,
  calendarId: string,
  payload: CreateCalendarEventPayload
): Promise<CalendarEventItem> => {
  if (!token || !token.trim()) {
    throw new Error('Brak tokenu autoryzacji Google. Zaloguj się ponownie.');
  }

  const { apiColorId, customColorId, customColorHex } = resolveSafeGoogleApiColor(payload.colorId);

  const apiPayload: any = {
    ...payload,
    colorId: apiColorId || undefined,
  };

  // If there's an extended color (12-34) or custom hex (#...), persist it in extendedProperties.private
  if (customColorId && (!apiColorId || customColorId !== apiColorId || customColorId.startsWith('#'))) {
    apiPayload.extendedProperties = {
      private: {
        ...(payload.extendedProperties?.private || {}),
        customColorId,
        customColorHex: customColorHex || '',
      },
    };
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

  const response = await fetchCalendarWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(apiPayload),
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
    colorId:
      (payload.colorId !== undefined ? (payload.colorId || undefined) : undefined) ||
      item.colorId ||
      item.extendedProperties?.private?.customColorId ||
      undefined,
    calendarId,
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

  // Clean payload start and end - strip any undefined or null properties so Google API is never given invalid values
  const cleanStart = payload.start
    ? Object.fromEntries(Object.entries(payload.start).filter(([_, v]) => v !== null && v !== undefined))
    : undefined;
  const cleanEnd = payload.end
    ? Object.fromEntries(Object.entries(payload.end).filter(([_, v]) => v !== null && v !== undefined))
    : undefined;

  const { apiColorId, customColorId, customColorHex } = resolveSafeGoogleApiColor(payload.colorId);

  const sanitizedPayload: Partial<CreateCalendarEventPayload> = {
    ...payload,
    ...(cleanStart ? { start: cleanStart as any } : {}),
    ...(cleanEnd ? { end: cleanEnd as any } : {}),
  };

  // Try fetching existing event first to perform a clean full PUT update (events.update)
  // This seamlessly handles changing dates and transitioning between all-day and timed events
  // without leaving conflicting old date/dateTime properties in Google Calendar
  try {
    const getResponse = await fetchCalendarWithRetry(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (getResponse.ok) {
      const existingItem = await getResponse.json();

      if (sanitizedPayload.summary !== undefined) existingItem.summary = sanitizedPayload.summary;
      if (sanitizedPayload.location !== undefined) existingItem.location = sanitizedPayload.location;
      if (sanitizedPayload.description !== undefined) existingItem.description = sanitizedPayload.description;
      if (sanitizedPayload.colorId !== undefined) {
        existingItem.colorId = apiColorId || null;
        if (customColorId && (!apiColorId || customColorId !== apiColorId || customColorId.startsWith('#'))) {
          existingItem.extendedProperties = {
            ...(existingItem.extendedProperties || {}),
            private: {
              ...(existingItem.extendedProperties?.private || {}),
              customColorId,
              customColorHex: customColorHex || '',
            },
          };
        } else if (existingItem.extendedProperties?.private) {
          delete existingItem.extendedProperties.private.customColorId;
          delete existingItem.extendedProperties.private.customColorHex;
        }
      }

      if (cleanStart) {
        existingItem.start = cleanStart;
      }
      if (cleanEnd) {
        existingItem.end = cleanEnd;
      }

      const putResponse = await fetchCalendarWithRetry(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(existingItem),
      });

      if (putResponse.ok) {
        const item = await putResponse.json();
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
          colorId:
            (payload.colorId !== undefined ? (payload.colorId || undefined) : undefined) ||
            item.colorId ||
            undefined,
          calendarId,
        };
      }
    }
  } catch (putErr) {
    console.warn('PUT update fallback to PATCH:', putErr);
  }

  // Fallback to PATCH if GET/PUT was not successful
  const patchBody: any = {
    ...sanitizedPayload,
  };
  if (sanitizedPayload.colorId !== undefined) {
    patchBody.colorId = apiColorId || null;
    if (customColorId && (!apiColorId || customColorId !== apiColorId || customColorId.startsWith('#'))) {
      patchBody.extendedProperties = {
        private: {
          customColorId,
          customColorHex: customColorHex || '',
        },
      };
    }
  }

  const response = await fetchCalendarWithRetry(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(patchBody),
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
    colorId:
      (payload.colorId !== undefined ? (payload.colorId || undefined) : undefined) ||
      item.colorId ||
      undefined,
    calendarId,
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
    const startDay = ev.start.dateTime.substring(0, 10);
    const endDay = ev.end.dateTime.substring(0, 10);
    // Multi-day events spanning across days appear in the top all-day/multi-day bar
    if (startDay !== endDay) {
      const endTime = ev.end.dateTime.substring(11, 16);
      if (endTime !== '00:00') return true;
    }

    const startMs = new Date(ev.start.dateTime).getTime();
    const endMs = new Date(ev.end.dateTime).getTime();
    if (!isNaN(startMs) && !isNaN(endMs)) {
      const diffHours = (endMs - startMs) / (1000 * 60 * 60);
      if (diffHours >= 24) return true;
    }
  } else if (ev.end?.date && ev.start.date) {
    return true;
  }

  return false;
};

/**
 * Generates an array of YYYY-MM-DD date strings that an event spans across.
 * Ensures the event bar appears on all days including start and end date.
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
  } else if (ev.end?.dateTime && ev.end.dateTime.substring(11, 16) === '00:00' && endLimit > curr) {
    // If a timed event ends at midnight 00:00, the last day is the previous day
    endLimit = new Date(endLimit.getTime() - 24 * 60 * 60 * 1000);
  }

  if (endLimit < curr) {
    endLimit = new Date(curr.getTime());
  }

  let safety = 0;
  while (curr <= endLimit && safety < 90) {
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


