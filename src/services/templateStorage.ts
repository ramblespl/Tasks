import { TaskTemplateItem, TaskCategory, DateAnchor, TaskTemplateSet, DueDateDetails } from '../types';

export const cleanTaskTitle = (title: string): string => {
  return title.replace(/^(?:\[\d{1,2}:\d{2}\]|\d{1,2}:\d{2}\s*[-–:]?)\s*/, '').trim();
};

export const formatTaskTitleWithTime = (title: string, time?: string): string => {
  const clean = cleanTaskTitle(title);
  if (!time) return clean;
  return `${time} - ${clean}`;
};

export const extractTaskTitleAndTime = (
  title: string,
  taskNotes?: string,
  templates?: TaskTemplateItem[]
): { time: string | null; cleanTitle: string } => {
  const match = title.match(/^(?:\[(\d{1,2}:\d{2})\]|(\d{1,2}:\d{2})\s*[-–:]?)\s*(.+)$/);
  if (match) {
    return {
      time: match[1] || match[2],
      cleanTitle: match[3].trim(),
    };
  }
  if (taskNotes) {
    const noteMatch = taskNotes.match(/(?:⏰\s*)?Godzina(?:\s*wykonania)?:\s*(\d{1,2}:\d{2})/i);
    if (noteMatch) {
      return {
        time: noteMatch[1],
        cleanTitle: title.trim(),
      };
    }
  }
  const clean = cleanTaskTitle(title);
  if (templates && templates.length > 0) {
    const matched = templates.find(
      (t) => cleanTaskTitle(t.title).toLowerCase() === clean.toLowerCase()
    );
    if (matched?.time) {
      return {
        time: matched.time,
        cleanTitle: clean,
      };
    }
  }
  return {
    time: null,
    cleanTitle: clean,
  };
};

export const FACTORY_DEFAULT_TEMPLATES: TaskTemplateItem[] = [
  {
    id: 'tpl-1',
    title: 'Przygotowanie dokumentów i materiałów',
    daysOffset: -1,
    anchor: 'departure',
    time: '18:00',
    category: 'documents',
    notes: 'Skompletować materiały, dokumenty i niezbędne informacje.',
    createCalendarEvent: true,
  },
  {
    id: 'tpl-2',
    title: 'Weryfikacja harmonogramu i agendy',
    daysOffset: 0,
    anchor: 'departure',
    time: '09:00',
    category: 'booking',
    notes: 'Sprawdzić punkty planu i potwierdzić obecność uczestników.',
    createCalendarEvent: false,
  },
  {
    id: 'tpl-3',
    title: 'Przygotowanie stanowiska i sprzętu',
    daysOffset: 0,
    anchor: 'departure',
    time: '12:00',
    category: 'packing',
    notes: 'Uruchomić i przetestować urządzenia oraz materiały robocze.',
    createCalendarEvent: false,
  },
  {
    id: 'tpl-4',
    title: 'Podsumowanie wstępne',
    daysOffset: 0,
    anchor: 'return',
    time: '17:00',
    category: 'home',
    notes: 'Zanotować kluczowe ustalenia i bieżący stan prac.',
    createCalendarEvent: false,
  },
  {
    id: 'tpl-5',
    title: 'Uporządkowanie notatek i plików',
    daysOffset: 0,
    anchor: 'return',
    time: '19:00',
    category: 'home',
    notes: 'Rozdzielić notatki, zapisać dokumenty i przekazać materiały.',
    createCalendarEvent: true,
  },
  {
    id: 'tpl-6',
    title: 'Wnioski i kolejne kroki (Action items)',
    daysOffset: 1,
    anchor: 'return',
    time: '10:00',
    category: 'documents',
    notes: 'Sformułować wnioski i utworzyć zadania następcze.',
    createCalendarEvent: false,
  },
  {
    id: 'tpl-7',
    title: 'Archiwizacja i zamknięcie etapu',
    daysOffset: 1,
    anchor: 'return',
    time: '15:00',
    category: 'home',
    notes: 'Zarchiwizować materiały, zaktualizować status projektu.',
    createCalendarEvent: true,
  },
];

export const DEFAULT_TEMPLATES: TaskTemplateItem[] = FACTORY_DEFAULT_TEMPLATES;

export const DEFAULT_TEMPLATE_SETS: TaskTemplateSet[] = [
  {
    id: 'set-universal',
    name: 'Uniwersalny plan wydarzenia / projektu',
    description: '7 kluczowych zadań wstępnych i podsumowujących z określonymi godzinami.',
    icon: 'compass',
    isDefault: true,
    templates: FACTORY_DEFAULT_TEMPLATES,
  },
  {
    id: 'set-vacation',
    name: 'Projekt / Wydarzenie rozszerzone',
    description: 'Kompleksowy zestaw organizacyjny (harmonogram, zasoby, agenda, podsumowanie).',
    icon: 'sun',
    isDefault: false,
    templates: [
      {
        id: 'vac-1',
        title: 'Sprawdzić formalności i zgodność harmonogramu',
        daysOffset: -14,
        anchor: 'departure',
        time: '10:00',
        category: 'documents',
      },
      {
        id: 'vac-2',
        title: 'Potwierdzić zasoby i rezerwacje',
        daysOffset: -7,
        anchor: 'departure',
        time: '12:00',
        category: 'booking',
      },
      {
        id: 'vac-3',
        title: 'Koordynacja budżetu i płatności',
        daysOffset: -3,
        anchor: 'departure',
        time: '14:00',
        category: 'booking',
      },
      {
        id: 'vac-4',
        title: 'Finalna weryfikacja agendy i uczestników',
        daysOffset: -1,
        anchor: 'departure',
        time: '09:00',
        category: 'booking',
      },
      {
        id: 'vac-5',
        title: 'Przygotowanie materiałów roboczych',
        daysOffset: -1,
        anchor: 'departure',
        time: '18:00',
        category: 'packing',
      },
      {
        id: 'vac-6',
        title: 'Poranny przegląd techniczny',
        daysOffset: 0,
        anchor: 'departure',
        time: '08:00',
        category: 'home',
      },
      {
        id: 'vac-7',
        title: 'Sprawdzenie gotowości zespołu / stanowisk',
        daysOffset: 0,
        anchor: 'departure',
        time: '10:00',
        category: 'home',
      },
      {
        id: 'vac-8',
        title: 'Bieżące notatki i ustalenia',
        daysOffset: 0,
        anchor: 'departure',
        time: '14:00',
        category: 'documents',
      },
      {
        id: 'vac-9',
        title: 'Zabezpieczenie stanowiska po zakończeniu',
        daysOffset: 0,
        anchor: 'return',
        time: '18:00',
        category: 'home',
      },
      {
        id: 'vac-10',
        title: 'Zebranie opinii i wniosków',
        daysOffset: 0,
        anchor: 'return',
        time: '20:00',
        category: 'home',
      },
      {
        id: 'vac-11',
        title: 'Raport podsumowujący',
        daysOffset: 1,
        anchor: 'return',
        time: '12:00',
        category: 'documents',
      },
      {
        id: 'vac-12',
        title: 'Archiwizacja dokumentacji i zdjęć',
        daysOffset: 2,
        anchor: 'return',
        time: '16:00',
        category: 'home',
      },
    ],
  },
  {
    id: 'set-business',
    name: 'Spotkanie biznesowe / Konferencja',
    description: 'Szybki zestaw dla spotkań, warsztatów i konferencji (agenda, sprzęt, prezentacja, raport).',
    icon: 'briefcase',
    isDefault: false,
    templates: [
      {
        id: 'bus-1',
        title: 'Sprawdzić agendę, salę i listę gości',
        daysOffset: -2,
        anchor: 'departure',
        time: '11:00',
        category: 'booking',
      },
      {
        id: 'bus-2',
        title: 'Przygotować laptop, prezentację i adaptery',
        daysOffset: -1,
        anchor: 'departure',
        time: '17:00',
        category: 'documents',
      },
      {
        id: 'bus-3',
        title: 'Druk materiałów konferencyjnych',
        daysOffset: -1,
        anchor: 'departure',
        time: '19:00',
        category: 'packing',
      },
      {
        id: 'bus-4',
        title: 'Wyłączyć termę i wyrzucić śmieci',
        daysOffset: 0,
        anchor: 'departure',
        time: '08:00',
        category: 'home',
      },
      {
        id: 'bus-5',
        title: 'Włączyć termę i rozpakować się',
        daysOffset: 0,
        anchor: 'return',
        time: '20:00',
        category: 'home',
      },
      {
        id: 'bus-6',
        title: 'Rozliczyć delegację, rachunki i faktury',
        daysOffset: 1,
        anchor: 'return',
        time: '10:00',
        category: 'documents',
      },
    ],
  },
  {
    id: 'set-weekend',
    name: 'Weekendowy City Break',
    description: 'Lekki zestaw na 2-3 dniowy wypad do miasta (mały plecak, bilety w telefonie, terma, powrót).',
    icon: 'plane',
    isDefault: false,
    templates: [
      {
        id: 'wkd-1',
        title: 'Odprawa i zapisanie biletów w telefonie',
        daysOffset: -1,
        anchor: 'departure',
        time: '12:00',
        category: 'booking',
      },
      {
        id: 'wkd-2',
        title: 'Pakowanie małego bagażu podręcznego',
        daysOffset: -1,
        anchor: 'departure',
        time: '19:00',
        category: 'packing',
      },
      {
        id: 'wkd-3',
        title: 'Wyłączyć termę i śmieci',
        daysOffset: 0,
        anchor: 'departure',
        time: '09:00',
        category: 'home',
      },
      {
        id: 'wkd-4',
        title: 'Włączyć termę i rozpakować się',
        daysOffset: 0,
        anchor: 'return',
        time: '20:00',
        category: 'home',
      },
      {
        id: 'wkd-5',
        title: 'Pranie i zgranie zdjęć',
        daysOffset: 1,
        anchor: 'return',
        time: '18:00',
        category: 'home',
      },
    ],
  },
];

/**
 * Single curated Universal Template definition.
 */
export const UNIVERSAL_TEMPLATE_INFO = {
  id: 'universal',
  name: 'Uniwersalny plan wydarzenia / projektu',
  description: 'Zestaw kluczowych zadań wstępnych i podsumowujących z określonymi godzinami.',
};

/**
 * Converts template list into a simple editable multi-line text format.
 */
export const templatesToEditableText = (templates: TaskTemplateItem[]): string => {
  return templates
    .map((item) => {
      const anchorTag = item.anchor === 'return' ? '[koniec]' : '[start]';
      const offsetPart = item.daysOffset === 0 ? '[0]' : `[${item.daysOffset}]`;
      const timePart = item.time ? `[${item.time}] ` : '';
      const catPart = `[${item.category}]`;
      const calPart = item.createCalendarEvent !== false ? ' [kalendarz]' : ' [tylko-zadanie]';
      const notePart = item.notes ? ` // ${item.notes}` : '';
      return `${offsetPart} ${anchorTag} ${timePart}${catPart}${calPart} ${item.title}${notePart}`;
    })
    .join('\n');
};

/**
 * Parses user-edited plain text back into TaskTemplateItem array.
 */
export const parseEditableTextToTemplates = (text: string): TaskTemplateItem[] => {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const result: TaskTemplateItem[] = [];

  const categoryMap: Record<string, TaskCategory> = {
    documents: 'documents',
    dokumenty: 'documents',
    booking: 'booking',
    rezerwacje: 'booking',
    health: 'health',
    zdrowie: 'health',
    packing: 'packing',
    pakowanie: 'packing',
    home: 'home',
    dom: 'home',
    other: 'other',
    inne: 'other',
  };

  lines.forEach((line, idx) => {
    let daysOffset = -1;
    let anchor: DateAnchor = 'departure';
    let time: string | undefined = undefined;
    let category: TaskCategory = 'other';
    let createCalendarEvent = true;
    let title = line;
    let notes: string | undefined = undefined;

    // Check notes separated by //
    if (title.includes('//')) {
      const parts = title.split('//');
      title = parts[0].trim();
      notes = parts.slice(1).join('//').trim();
    }

    // Check calendar event preference
    if (/\[(tylko-zadanie|tylko_zadanie|tasks_only|task_only)\]/i.test(title)) {
      createCalendarEvent = false;
      title = title.replace(/\[(tylko-zadanie|tylko_zadanie|tasks_only|task_only)\]/i, '').trim();
    } else if (/\[(kalendarz|calendar|event|wydarzenie)\]/i.test(title)) {
      createCalendarEvent = true;
      title = title.replace(/\[(kalendarz|calendar|event|wydarzenie)\]/i, '').trim();
    }

    // Check anchor tags: [koniec], [powrot], [return], [end] vs [start], [poczatek], [departure]
    if (/\[(koniec|powrot|powrót|return|end)\]/i.test(title)) {
      anchor = 'return';
      title = title.replace(/\[(koniec|powrot|powrót|return|end)\]/i, '').trim();
    } else if (/\[(start|poczatek|początek|wyjazd|departure)\]/i.test(title)) {
      anchor = 'departure';
      title = title.replace(/\[(start|poczatek|początek|wyjazd|departure)\]/i, '').trim();
    }

    // Match time like [18:00] or @18:00 or o 18:00
    const timeMatch = title.match(/(?:\[|@|\bo\s+)(\d{1,2}:\d{2})\]?/i);
    if (timeMatch) {
      time = timeMatch[1].padStart(5, '0');
      title = title.replace(timeMatch[0], '').trim();
    }

    // Match offset like [-14] or [0] or [+1]
    const offsetMatch = title.match(/\[([+-]?\d+)\s*(?:dni|dzień)?\]/i);
    if (offsetMatch) {
      daysOffset = parseInt(offsetMatch[1], 10);
      title = title.replace(offsetMatch[0], '').trim();
    } else if (/w dniu (wydarzenia|poczatku|początku|konca|końca|wyjazdu|powrotu)/i.test(title)) {
      daysOffset = 0;
      if (/w dniu (powrotu|konca|końca)/i.test(title)) anchor = 'return';
      title = title.replace(/\[?w dniu (wydarzenia|poczatku|początku|konca|końca|wyjazdu|powrotu)\]?/i, '').trim();
    }

    // Match category like [packing] or [dokumenty]
    const catMatch = title.match(/\[([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+)\]/);
    if (catMatch) {
      const catKey = catMatch[1].toLowerCase();
      if (categoryMap[catKey]) {
        category = categoryMap[catKey];
      }
      title = title.replace(catMatch[0], '').trim();
    }

    // Remove leading bullets or checkbox symbols like - [ ], •, -
    title = title.replace(/^-\s*\[\s*\]\s*/, '').replace(/^[-•*]\s*/, '').trim();

    if (title) {
      result.push({
        id: `tpl-parsed-${Date.now()}-${idx}`,
        title,
        daysOffset,
        anchor,
        time,
        category,
        createCalendarEvent,
        notes,
      });
    }
  });

  return result.length > 0 ? result : DEFAULT_TEMPLATES;
};

const STORAGE_KEY = 'travel_task_templates_v4';
const CUSTOM_DEFAULT_KEY = 'travel_custom_default_template_v1';
const RECORD_STORAGE_KEY = 'travel_generated_trips_v1';
const TEMPLATE_SETS_KEY = 'travel_task_template_sets_v2';
const ACTIVE_SET_ID_KEY = 'travel_active_template_set_id_v2';

export const loadTemplateSets = (): TaskTemplateSet[] => {
  try {
    const saved = localStorage.getItem(TEMPLATE_SETS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Błąd odczytu zestawów szablonów:', e);
  }
  return DEFAULT_TEMPLATE_SETS;
};

export const saveTemplateSets = (sets: TaskTemplateSet[]): void => {
  try {
    localStorage.setItem(TEMPLATE_SETS_KEY, JSON.stringify(sets));
  } catch (e) {
    console.error('Błąd zapisu zestawów szablonów:', e);
  }
};

export const getActiveTemplateSetId = (): string => {
  try {
    const saved = localStorage.getItem(ACTIVE_SET_ID_KEY);
    if (saved) return saved;
  } catch {}
  return DEFAULT_TEMPLATE_SETS[0].id;
};

export const setActiveTemplateSetId = (id: string): void => {
  try {
    localStorage.setItem(ACTIVE_SET_ID_KEY, id);
  } catch {}
};

export const getActiveTemplateSet = (): TaskTemplateSet => {
  const sets = loadTemplateSets();
  const activeId = getActiveTemplateSetId();
  const found = sets.find((s) => s.id === activeId);
  return found || sets[0] || DEFAULT_TEMPLATE_SETS[0];
};

export const saveActiveTemplateSet = (updated: TaskTemplateSet): void => {
  const sets = loadTemplateSets();
  const idx = sets.findIndex((s) => s.id === updated.id);
  if (idx !== -1) {
    sets[idx] = updated;
  } else {
    sets.push(updated);
  }
  saveTemplateSets(sets);
};

export const createTemplateSet = (
  name: string,
  description: string = '',
  icon: string = 'compass',
  baseTemplates?: TaskTemplateItem[]
): TaskTemplateSet => {
  const sets = loadTemplateSets();
  const newSet: TaskTemplateSet = {
    id: `set-${Date.now()}`,
    name: name.trim() || 'Nowy zestaw szablonów',
    description: description.trim(),
    icon,
    isDefault: false,
    templates: baseTemplates && baseTemplates.length > 0 ? baseTemplates : [...FACTORY_DEFAULT_TEMPLATES],
  };
  sets.push(newSet);
  saveTemplateSets(sets);
  setActiveTemplateSetId(newSet.id);
  return newSet;
};

export const duplicateTemplateSet = (id: string): TaskTemplateSet => {
  const sets = loadTemplateSets();
  const source = sets.find((s) => s.id === id) || sets[0];
  const duplicated: TaskTemplateSet = {
    id: `set-copy-${Date.now()}`,
    name: `${source.name} (Kopia)`,
    description: source.description,
    icon: source.icon,
    isDefault: false,
    templates: source.templates.map((t) => ({
      ...t,
      id: `tpl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    })),
  };
  sets.push(duplicated);
  saveTemplateSets(sets);
  setActiveTemplateSetId(duplicated.id);
  return duplicated;
};

export const deleteTemplateSet = (id: string): TaskTemplateSet[] => {
  let sets = loadTemplateSets();
  if (sets.length <= 1) {
    return sets;
  }
  sets = sets.filter((s) => s.id !== id);
  saveTemplateSets(sets);
  const activeId = getActiveTemplateSetId();
  if (activeId === id) {
    setActiveTemplateSetId(sets[0].id);
  }
  return sets;
};

export const updateTemplateSetMeta = (
  id: string,
  name: string,
  description?: string,
  icon?: string
): TaskTemplateSet[] => {
  const sets = loadTemplateSets();
  const target = sets.find((s) => s.id === id);
  if (target) {
    target.name = name.trim() || target.name;
    if (description !== undefined) target.description = description.trim();
    if (icon) target.icon = icon;
    saveTemplateSets(sets);
  }
  return sets;
};

export const setAsDefaultTemplateSet = (id: string): TaskTemplateSet[] => {
  const sets = loadTemplateSets();
  sets.forEach((s) => {
    s.isDefault = s.id === id;
  });
  saveTemplateSets(sets);
  return sets;
};

/**
 * Check if the user has saved a custom default template.
 */
export const hasCustomDefaultTemplate = (): boolean => {
  try {
    return !!localStorage.getItem(CUSTOM_DEFAULT_KEY);
  } catch {
    return false;
  }
};

/**
 * Load the active default template:
 * returns custom default if user saved one, otherwise active set templates.
 */
export const getActiveDefaultTemplates = (): TaskTemplateItem[] => {
  try {
    const custom = localStorage.getItem(CUSTOM_DEFAULT_KEY);
    if (custom) {
      const parsed = JSON.parse(custom);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Błąd odczytu domyślnego szablonu:', e);
  }
  return getActiveTemplateSet().templates;
};

/**
 * Save current list of tasks as the custom default template.
 */
export const saveAsCustomDefault = (templates: TaskTemplateItem[]): void => {
  try {
    localStorage.setItem(CUSTOM_DEFAULT_KEY, JSON.stringify(templates));
    saveTemplates(templates);
  } catch (e) {
    console.error('Błąd zapisu domyślnego szablonu:', e);
  }
};

export const loadTemplates = (): TaskTemplateItem[] => {
  const activeSet = getActiveTemplateSet();
  return activeSet.templates;
};

export const saveTemplates = (templates: TaskTemplateItem[]): void => {
  try {
    const activeSet = getActiveTemplateSet();
    activeSet.templates = templates;
    saveActiveTemplateSet(activeSet);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch (e) {
    console.error('Błąd zapisu szablonów do localStorage:', e);
  }
};

/**
 * Reset working templates to the user's active default (custom default or factory default).
 */
export const resetTemplatesToDefault = (): TaskTemplateItem[] => {
  const defaultTpl = getActiveDefaultTemplates();
  saveTemplates(defaultTpl);
  return defaultTpl;
};

/**
 * Reset everything back to the pristine factory default (7 tasks) and clear custom default.
 */
export const resetTemplatesToFactory = (): TaskTemplateItem[] => {
  try {
    localStorage.removeItem(CUSTOM_DEFAULT_KEY);
  } catch (e) {
    console.error(e);
  }
  saveTemplates(FACTORY_DEFAULT_TEMPLATES);
  return FACTORY_DEFAULT_TEMPLATES;
};

// Records of trips for which tasks were already generated
export const loadGeneratedTripIds = (): Record<string, string> => {
  try {
    const saved = localStorage.getItem(RECORD_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

export const saveGeneratedTripId = (eventId: string, dateStr: string): void => {
  try {
    const records = loadGeneratedTripIds();
    records[eventId] = dateStr;
    localStorage.setItem(RECORD_STORAGE_KEY, JSON.stringify(records));
  } catch (e) {
    console.error(e);
  }
};

export const removeGeneratedTripId = (eventId: string): void => {
  try {
    const records = loadGeneratedTripIds();
    delete records[eventId];
    localStorage.setItem(RECORD_STORAGE_KEY, JSON.stringify(records));
  } catch (e) {
    console.error(e);
  }
};

/**
 * Formats a Date object into an RFC 3339 string with local timezone offset
 * e.g. "2026-06-15T18:00:00+02:00"
 */
export const formatToRfc3339 = (date: Date): string => {
  const pad = (num: number) => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absOffset / 60));
  const offsetMins = pad(absOffset % 60);

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMins}`;
};

/**
 * Extracts calendar date components (year, month 0-11, day 1-31)
 * from both YYYY-MM-DD format and ISO datetime strings without timezone distortion.
 */
export const parseDateComponents = (dateStr: string): { year: number; month: number; day: number } => {
  const dateOnlyMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnlyMatch) {
    return {
      year: parseInt(dateOnlyMatch[1], 10),
      month: parseInt(dateOnlyMatch[2], 10) - 1,
      day: parseInt(dateOnlyMatch[3], 10),
    };
  }
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return {
      year: d.getFullYear(),
      month: d.getMonth(),
      day: d.getDate(),
    };
  }
  const today = new Date();
  return {
    year: today.getFullYear(),
    month: today.getMonth(),
    day: today.getDate(),
  };
};


/**
 * Calculates due date details including exact local hour, RFC 3339 timestamp with timezone,
 * and user-friendly labels.
 */
export const calculateDueDateDetails = (
  tripStartDate: string,
  tripEndDate: string | undefined,
  daysOffset: number,
  anchor: DateAnchor = 'departure',
  time?: string
): DueDateDetails => {
  const isReturn = anchor === 'return';
  const effectiveBaseDateStr = isReturn && tripEndDate ? tripEndDate : tripStartDate;

  const { year, month, day } = parseDateComponents(effectiveBaseDateStr);

  let hours = 18;
  let minutes = 0;
  let hasSpecificTime = false;
  if (time && /^(\d{1,2}):(\d{2})$/.test(time)) {
    const [h, m] = time.split(':').map(Number);
    hours = Math.min(23, Math.max(0, h));
    minutes = Math.min(59, Math.max(0, m));
    hasSpecificTime = true;
  }

  // Create date in local timezone with the day offset and specific hour:minute
  const targetDate = new Date(year, month, day + daysOffset, hours, minutes, 0, 0);

  const pad = (num: number) => String(num).padStart(2, '0');
  const timeFormatted = hasSpecificTime ? `${pad(hours)}:${pad(minutes)}` : '';

  const dateFormatted = targetDate.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const fullFormatted = hasSpecificTime
    ? `${dateFormatted}, godz. ${timeFormatted}`
    : dateFormatted;

  const timingLabel = formatOffsetLabel(daysOffset, anchor, timeFormatted);

  // Concrete start/end ISO strings for Google Calendar (default 30 min duration)
  const endDate = new Date(targetDate.getTime() + 30 * 60 * 1000); // 30 minutes duration
  const startDateTime = `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(targetDate.getDate())}T${pad(targetDate.getHours())}:${pad(targetDate.getMinutes())}:00`;
  const endDateTime = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}:00`;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw';

  return {
    rfc3339: formatToRfc3339(targetDate),
    targetDate,
    dateFormatted,
    timeFormatted,
    fullFormatted,
    timingLabel,
    startDateTime,
    endDateTime,
    timeZone,
  };
};

/**
 * Calculates due date (RFC 3339 string)
 * based on trip dates, template offset days, anchor, and hour:minute.
 */
export const calculateDueDate = (
  tripStartDate: string,
  tripEndDate: string | undefined,
  daysOffset: number,
  anchor: DateAnchor = 'departure',
  time?: string
): string => {
  return calculateDueDateDetails(tripStartDate, tripEndDate, daysOffset, anchor, time).rfc3339;
};

/**
 * Generates an .ics file string for calendar export
 * with exact start/end hours and 15-minute reminders.
 */
export const generateIcsForTripTasks = (
  tripSummary: string,
  tripStartDate: string,
  tripEndDate: string | undefined,
  templates: TaskTemplateItem[]
): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const formatUtcDate = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

  const nowStr = formatUtcDate(new Date());

  const eventsStr = templates
    .map((item, idx) => {
      const details = calculateDueDateDetails(
        tripStartDate,
        tripEndDate,
        item.daysOffset,
        item.anchor,
        item.time
      );
      const start = details.targetDate;
      const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 minutes duration

      const uid = `task-${idx}-${Date.now()}@traveltasks.app`;
      const summary = cleanTaskTitle(item.title);

      return [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${nowStr}`,
        `DTSTART:${formatUtcDate(start)}`,
        `DTEND:${formatUtcDate(end)}`,
        `SUMMARY:${summary}`,
        'DESCRIPTION:',
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'ACTION:DISPLAY',
        `DESCRIPTION:Przypomnienie: ${summary}`,
        'END:VALARM',
        'END:VEVENT',
      ].join('\r\n');
    })
    .join('\r\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Zadania Podrozne//PL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Zadania - ${tripSummary}`,
    eventsStr,
    'END:VCALENDAR',
  ].join('\r\n');
};

export const formatOffsetLabel = (
  offset: number,
  anchor: DateAnchor = 'departure',
  time?: string
): string => {
  const isReturn = anchor === 'return';
  const timeStr = time ? ` o ${time}` : '';

  if (isReturn) {
    if (offset === 0) return `W dniu zakończenia${timeStr}`;
    if (offset === -1) return `1 dzień przed zakończeniem${timeStr}`;
    if (offset < -1) return `${Math.abs(offset)} dni przed zakończeniem${timeStr}`;
    if (offset === 1) return `1 dzień po zakończeniu${timeStr}`;
    return `${offset} dni po zakończeniu${timeStr}`;
  }

  // Departure / start anchor
  if (offset === 0) return `W dniu rozpoczęcia${timeStr}`;
  if (offset === -1) return `1 dzień przed rozpoczęciem${timeStr}`;
  if (offset < -1) return `${Math.abs(offset)} dni przed rozpoczęciem${timeStr}`;
  if (offset === 1) return `1 dzień po rozpoczęciu${timeStr}`;
  return `${offset} dni po rozpoczęciu${timeStr}`;
};

export const getCategoryBadge = (category: TaskCategory): { label: string; color: string } => {
  switch (category) {
    case 'documents':
      return { label: 'Dokumenty', color: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'booking':
      return { label: 'Rezerwacje', color: 'bg-purple-50 text-purple-700 border-purple-200' };
    case 'health':
      return { label: 'Zdrowie & Bezp.', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'packing':
      return { label: 'Przygotowanie', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'home':
      return { label: 'Organizacja', color: 'bg-rose-50 text-rose-700 border-rose-200' };
    default:
      return { label: 'Inne', color: 'bg-neutral-50 text-neutral-700 border-neutral-200' };
  }
};

/**
 * Formats templates into a clean Markdown / text checklist ready for copying.
 */
export const generateTextChecklist = (
  templates: TaskTemplateItem[],
  tripTitle?: string,
  tripStartDate?: string,
  tripEndDate?: string
): string => {
  const header = tripTitle
    ? `📋 Plan zadań: ${tripTitle}\nTermin: ${tripStartDate || ''} – ${tripEndDate || ''}\n`
    : `📋 Szablon zadań (Uniwersalny plan):\n`;

  const departureTasks = templates.filter((t) => (t.anchor || 'departure') === 'departure');
  const returnTasks = templates.filter((t) => t.anchor === 'return');

  departureTasks.sort((a, b) => a.daysOffset - b.daysOffset);
  returnTasks.sort((a, b) => a.daysOffset - b.daysOffset);

  const lines: string[] = [];

  if (departureTasks.length > 0) {
    lines.push('--- PRZED ROZPOCZĘCIEM ---');
    departureTasks.forEach((item) => {
      const timing = formatOffsetLabel(item.daysOffset, item.anchor, item.time);
      const notesStr = item.notes ? ` — ${item.notes}` : '';
      lines.push(`- [ ] [${timing}] ${item.title}${notesStr}`);
    });
  }

  if (returnTasks.length > 0) {
    lines.push('\n--- PO ZAKOŃCZENIU ---');
    returnTasks.forEach((item) => {
      const timing = formatOffsetLabel(item.daysOffset, item.anchor, item.time);
      const notesStr = item.notes ? ` — ${item.notes}` : '';
      lines.push(`- [ ] [${timing}] ${item.title}${notesStr}`);
    });
  }

  return `${header}\n${lines.join('\n')}\n\n*Utworzono w aplikacji Planer Zadań i Wydarzeń*`;
};

/**
 * Generates an Assistant / Device prompt template so user can copy and paste to Siri, Google Assistant, or Gemini.
 */
export const generateAssistantPrompt = (
  templates: TaskTemplateItem[],
  tripTitle?: string,
  tripStartDate?: string,
  tripEndDate?: string
): string => {
  const title = tripTitle || '[NAZWA WYDARZENIA]';
  const start = tripStartDate || '[DATA ROZPOCZĘCIA w formacie RRRR-MM-DD]';
  const end = tripEndDate || '[DATA ZAKOŃCZENIA w formacie RRRR-MM-DD]';

  const departureTasks = templates.filter((t) => (t.anchor || 'departure') === 'departure');
  const returnTasks = templates.filter((t) => t.anchor === 'return');

  departureTasks.sort((a, b) => a.daysOffset - b.daysOffset);
  returnTasks.sort((a, b) => a.daysOffset - b.daysOffset);

  const depStr = departureTasks
    .map((item) => `• "${item.title}" (termin: ${formatOffsetLabel(item.daysOffset, 'departure', item.time)}, notatka: ${item.notes || 'brak'})`)
    .join('\n');

  const retStr = returnTasks
    .map((item) => `• "${item.title}" (termin: ${formatOffsetLabel(item.daysOffset, 'return', item.time)}, notatka: ${item.notes || 'brak'})`)
    .join('\n');

  return `Hej, zaplanowałem wydarzenie "${title}".
Data rozpoczęcia: ${start}
Data zakończenia: ${end}

Dodaj do mojej listy zadań w Google Tasks następujące zadania z terminami i godzinami:

ZADANIA PRZED ROZPOCZĘCIEM (względem daty rozpoczęcia ${start}):
${depStr}

ZADANIA PO ZAKOŃCZENIU (względem daty zakończenia ${end}):
${retStr}

Przypisz każdemu zadaniu wyliczoną datę oraz godzinę w Google Tasks.`;
};
