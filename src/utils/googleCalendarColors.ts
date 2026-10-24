import { CalendarEventItem, CalendarListItem } from '../types';

export interface GoogleColorDefinition {
  id?: string;
  name: string;
  hex: string;
  classicHex?: string;
  apiColorId?: string;
  contrastText: string;
  bg: string;
  border: string;
  text: string;
  category?: 'standard' | 'extended' | 'custom' | 'special';
}

export const isLightColor = (hex: string): boolean => {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  // Relative luminance / perceived brightness
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness >= 165;
};

export const makeCustomColor = (hex: string, name?: string, id?: string): GoogleColorDefinition => {
  const cleanHex = hex.startsWith('#') ? hex : `#${hex}`;
  const light = isLightColor(cleanHex);
  return {
    id: id || cleanHex,
    name: name || `Niestandardowy (${cleanHex})`,
    hex: cleanHex,
    contrastText: light ? '#1f2937' : '#ffffff',
    bg: `${cleanHex}20`,
    border: `${cleanHex}60`,
    text: light ? '#111827' : '#1e293b',
    category: 'custom',
  };
};

/**
 * 1. Google Calendar Standard Event Colors (IDs 1-11 in Google Calendar API `colors.event`)
 * Web UX Material Colors:
 * 1: Lawenda (#7986cb)
 * 2: Szałwia (#33b679)
 * 3: Winogrono (#8e24aa)
 * 4: Flaming (#e67c73)
 * 5: Banan (#f6bf26)
 * 6: Mandarynka (#f4511e)
 * 7: Paw (#039be5)
 * 8: Grafit (#616161)
 * 9: Jagoda (#3f51b5)
 * 10: Bazylia (#0b8043)
 * 11: Pomidor (#d50000)
 */
export const GOOGLE_EVENT_COLORS: Record<string, GoogleColorDefinition> = {
  '1': {
    id: '1',
    name: 'Lawendowy',
    hex: '#7986cb',
    contrastText: '#ffffff',
    bg: '#eef0fa',
    border: '#c5cae9',
    text: '#283593',
    category: 'standard',
  },
  '2': {
    id: '2',
    name: 'Szałwiowy',
    hex: '#33b679',
    contrastText: '#ffffff',
    bg: '#e8f7ee',
    border: '#a3e4c1',
    text: '#135c36',
    category: 'standard',
  },
  '3': {
    id: '3',
    name: 'Winogronowy',
    hex: '#8e24aa',
    contrastText: '#ffffff',
    bg: '#f6e9fa',
    border: '#e1bee7',
    text: '#4a148c',
    category: 'standard',
  },
  '4': {
    id: '4',
    name: 'Flamingowy',
    hex: '#e67c73',
    contrastText: '#ffffff',
    bg: '#fdedec',
    border: '#f5c6cb',
    text: '#78281f',
    category: 'standard',
  },
  '5': {
    id: '5',
    name: 'Bananowy',
    hex: '#f6bf26',
    contrastText: '#1f2937',
    bg: '#fef9e7',
    border: '#fdebd0',
    text: '#7d6608',
    category: 'standard',
  },
  '6': {
    id: '6',
    name: 'Mandarynkowy',
    hex: '#f4511e',
    contrastText: '#ffffff',
    bg: '#fbeee6',
    border: '#f5cba7',
    text: '#6e2c00',
    category: 'standard',
  },
  '7': {
    id: '7',
    name: 'Pawi',
    hex: '#039be5',
    contrastText: '#ffffff',
    bg: '#e6f4fb',
    border: '#b3e5fc',
    text: '#01579b',
    category: 'standard',
  },
  '8': {
    id: '8',
    name: 'Grafitowy',
    hex: '#616161',
    contrastText: '#ffffff',
    bg: '#f2f2f2',
    border: '#e0e0e0',
    text: '#212121',
    category: 'standard',
  },
  '9': {
    id: '9',
    name: 'Jagodowy',
    hex: '#3f51b5',
    contrastText: '#ffffff',
    bg: '#eceef9',
    border: '#c5cae9',
    text: '#1a237e',
    category: 'standard',
  },
  '10': {
    id: '10',
    name: 'Bazyliowy',
    hex: '#0b8043',
    contrastText: '#ffffff',
    bg: '#e6f4ea',
    border: '#a8dab5',
    text: '#0d652d',
    category: 'standard',
  },
  '11': {
    id: '11',
    name: 'Pomidorowy',
    hex: '#d50000',
    contrastText: '#ffffff',
    bg: '#fde8e8',
    border: '#f8b4b4',
    text: '#9b1c1c',
    category: 'standard',
  },
};

/**
 * 2. Official Google Calendar 24 Extended Palette Colors (matching the 4x6 grid of Google Calendar UI)
 *
 * Row 1 (Reds & Oranges):
 * 1: Radicchio (#ad1457, classic #cca6ac, API cal 21)
 * 2: Kwiat wiśni (#d81b60, classic #f691b2, API cal 22)
 * 3: Flamingowy (#e67c73, classic #d06b64, API cal 2)
 * 4: Pomidorowy (#d50000, classic #f83a22, API cal 3)
 * 5: Mandarynkowy (#f4511e, classic #fa573c, API cal 4)
 * 6: Dyniowy (#ef6c00, classic #ff7537, API cal 5)
 *
 * Row 2 (Yellows & Greens):
 * 7: Mango (#f09300, classic #ffad46, API cal 6)
 * 8: Bananowy (#f6bf26, classic #fad165, API cal 12)
 * 9: Cytrynowy (#e4c441, classic #fbe983, API cal 11)
 * 10: Awokado (#c0ca33, classic #b3dc6c, API cal 10)
 * 11: Pistacjowy (#7cb342, classic #7bd148, API cal 9)
 * 12: Bazyliowy (#0b8043, classic #16a765, API cal 8)
 *
 * Row 3 (Teals & Blues):
 * 13: Szałwiowy (#33b679, classic #92e1c0, API cal 13)
 * 14: Eukaliptusowy (#009688, classic #42d692, API cal 7)
 * 15: Pawi (#039be5, classic #9fe1e7, API cal 14)
 * 16: Kobaltowy (#4285f4, classic #9fc6e7, API cal 15)
 * 17: Lawendowy (#7986cb, classic #9a9cff, API cal 17)
 * 18: Jagodowy (#3f51b5, classic #4986e7, API cal 16)
 *
 * Row 4 (Purples & Neutrals):
 * 19: Wisteria (#b39ddb, classic #b99aff, API cal 18) -- W Google Calendar to "Wisteria", nie "Glicyniowy"!
 * 20: Ametystowy (#9e69af, classic #a47ae2, API cal 24)
 * 21: Winogronowy (#8e24aa, classic #cd74e6, API cal 23)
 * 22: Kakaowy (#795548, classic #ac725e, API cal 1)
 * 23: Grafitowy (#616161, classic #c2c2c2, API cal 19)
 * 24: Brzozowy (#a79b8e, classic #cabdbf, API cal 20)
 */
export const OFFICIAL_GOOGLE_CALENDAR_COLORS_LIST: GoogleColorDefinition[] = [
  // Row 1
  { id: 'cal-1', name: 'Radicchio', hex: '#ad1457', classicHex: '#cca6ac', apiColorId: '21', contrastText: '#ffffff', bg: '#fae6ee', border: '#e8a5be', text: '#780d3c', category: 'extended' },
  { id: 'cal-2', name: 'Kwiat wiśni', hex: '#d81b60', classicHex: '#f691b2', apiColorId: '22', contrastText: '#ffffff', bg: '#fce7ee', border: '#f4a7be', text: '#880e38', category: 'extended' },
  { id: 'cal-3', name: 'Flamingowy', hex: '#e67c73', classicHex: '#d06b64', apiColorId: '2', contrastText: '#ffffff', bg: '#fdedec', border: '#f5c6cb', text: '#78281f', category: 'extended' },
  { id: 'cal-4', name: 'Pomidorowy', hex: '#d50000', classicHex: '#f83a22', apiColorId: '3', contrastText: '#ffffff', bg: '#fde8e8', border: '#f8b4b4', text: '#9b1c1c', category: 'extended' },
  { id: 'cal-5', name: 'Mandarynkowy', hex: '#f4511e', classicHex: '#fa573c', apiColorId: '4', contrastText: '#ffffff', bg: '#fbeee6', border: '#f5cba7', text: '#6e2c00', category: 'extended' },
  { id: 'cal-6', name: 'Dyniowy', hex: '#ef6c00', classicHex: '#ff7537', apiColorId: '5', contrastText: '#ffffff', bg: '#fff1e6', border: '#fecba1', text: '#7a3500', category: 'extended' },

  // Row 2
  { id: 'cal-7', name: 'Mango', hex: '#f09300', classicHex: '#ffad46', apiColorId: '6', contrastText: '#1f2937', bg: '#fff6e6', border: '#fed699', text: '#7d4c00', category: 'extended' },
  { id: 'cal-8', name: 'Bananowy', hex: '#f6bf26', classicHex: '#fad165', apiColorId: '12', contrastText: '#1f2937', bg: '#fef9e7', border: '#fdebd0', text: '#7d6608', category: 'extended' },
  { id: 'cal-9', name: 'Cytrynowy', hex: '#e4c441', classicHex: '#fbe983', apiColorId: '11', contrastText: '#1f2937', bg: '#fefdec', border: '#fdf4c3', text: '#736214', category: 'extended' },
  { id: 'cal-10', name: 'Awokado', hex: '#c0ca33', classicHex: '#b3dc6c', apiColorId: '10', contrastText: '#1f2937', bg: '#f8fae5', border: '#e2eba8', text: '#555d14', category: 'extended' },
  { id: 'cal-11', name: 'Pistacjowy', hex: '#7cb342', classicHex: '#7bd148', apiColorId: '9', contrastText: '#1f2937', bg: '#f2f8eb', border: '#cce4b4', text: '#3d5e1e', category: 'extended' },
  { id: 'cal-12', name: 'Bazyliowy', hex: '#0b8043', classicHex: '#16a765', apiColorId: '8', contrastText: '#ffffff', bg: '#e6f4ea', border: '#a8dab5', text: '#0d652d', category: 'extended' },

  // Row 3
  { id: 'cal-13', name: 'Szałwiowy', hex: '#33b679', classicHex: '#92e1c0', apiColorId: '13', contrastText: '#ffffff', bg: '#e8f7ee', border: '#a3e4c1', text: '#135c36', category: 'extended' },
  { id: 'cal-14', name: 'Eukaliptusowy', hex: '#009688', classicHex: '#42d692', apiColorId: '7', contrastText: '#ffffff', bg: '#e6f5f3', border: '#99dcd4', text: '#00574f', category: 'extended' },
  { id: 'cal-15', name: 'Pawi', hex: '#039be5', classicHex: '#9fe1e7', apiColorId: '14', contrastText: '#ffffff', bg: '#e6f4fb', border: '#b3e5fc', text: '#01579b', category: 'extended' },
  { id: 'cal-16', name: 'Kobaltowy', hex: '#4285f4', classicHex: '#9fc6e7', apiColorId: '15', contrastText: '#ffffff', bg: '#ecf3fe', border: '#b5d0fc', text: '#174ea6', category: 'extended' },
  { id: 'cal-17', name: 'Lawendowy', hex: '#7986cb', classicHex: '#9a9cff', apiColorId: '17', contrastText: '#ffffff', bg: '#eef0fa', border: '#c5cae9', text: '#283593', category: 'extended' },
  { id: 'cal-18', name: 'Jagodowy', hex: '#3f51b5', classicHex: '#4986e7', apiColorId: '16', contrastText: '#ffffff', bg: '#eceef9', border: '#c5cae9', text: '#1a237e', category: 'extended' },

  // Row 4
  { id: 'cal-19', name: 'Wisteria', hex: '#b39ddb', classicHex: '#b99aff', apiColorId: '18', contrastText: '#1f2937', bg: '#f6f3fb', border: '#ded2f1', text: '#512da8', category: 'extended' },
  { id: 'cal-20', name: 'Ametystowy', hex: '#9e69af', classicHex: '#a47ae2', apiColorId: '24', contrastText: '#ffffff', bg: '#f7f0f9', border: '#dcbeee', text: '#5c256e', category: 'extended' },
  { id: 'cal-21', name: 'Winogronowy', hex: '#8e24aa', classicHex: '#cd74e6', apiColorId: '23', contrastText: '#ffffff', bg: '#f6e9fa', border: '#e1bee7', text: '#4a148c', category: 'extended' },
  { id: 'cal-22', name: 'Kakaowy', hex: '#795548', classicHex: '#ac725e', apiColorId: '1', contrastText: '#ffffff', bg: '#f5f0ef', border: '#d5c3bf', text: '#4e342e', category: 'extended' },
  { id: 'cal-23', name: 'Grafitowy', hex: '#616161', classicHex: '#c2c2c2', apiColorId: '19', contrastText: '#ffffff', bg: '#f2f2f2', border: '#e0e0e0', text: '#212121', category: 'extended' },
  { id: 'cal-24', name: 'Brzozowy', hex: '#a79b8e', classicHex: '#cabdbf', apiColorId: '20', contrastText: '#ffffff', bg: '#f6f4f1', border: '#d7d0c7', text: '#4a4137', category: 'extended' },
];

/**
 * Extended palette record with aliases for:
 * - 'cal-1'..'cal-24' (UI position IDs)
 * - Modern hex codes ('#ad1457', '#d81b60', etc.)
 * - Classic hex codes ('#cca6ac', '#f691b2', etc.)
 * - 'api-cal-1'..'api-cal-24' (Google Calendar colors.calendar API IDs)
 * - '12'..'35' (backward compatibility with legacy indexes)
 */
export const GOOGLE_EXTENDED_COLORS: Record<string, GoogleColorDefinition> = (() => {
  const map: Record<string, GoogleColorDefinition> = {};
  OFFICIAL_GOOGLE_CALENDAR_COLORS_LIST.forEach((col, idx) => {
    const calId = `cal-${idx + 1}`;
    const legacyId = String(idx + 12);
    const hexKey = col.hex.toLowerCase();

    map[calId] = col;
    map[legacyId] = { ...col, id: legacyId };
    map[hexKey] = col;

    if (col.classicHex) {
      map[col.classicHex.toLowerCase()] = col;
    }
    if (col.apiColorId) {
      map[`api-cal-${col.apiColorId}`] = col;
    }
  });
  return map;
})();

// All combined palette colors for direct lookup
export const ALL_GOOGLE_PALETTE_COLORS: Record<string, GoogleColorDefinition> = {
  ...GOOGLE_EVENT_COLORS,
  ...GOOGLE_EXTENDED_COLORS,
};

export const GOOGLE_EVENT_COLOR_OPTIONS: GoogleColorDefinition[] = Object.values(GOOGLE_EVENT_COLORS);
export const GOOGLE_EXTENDED_COLOR_OPTIONS: GoogleColorDefinition[] = OFFICIAL_GOOGLE_CALENDAR_COLORS_LIST;
export const GOOGLE_ALL_COLOR_OPTIONS: GoogleColorDefinition[] = [
  ...GOOGLE_EVENT_COLOR_OPTIONS,
  ...GOOGLE_EXTENDED_COLOR_OPTIONS,
];

const DEFAULT_EVENT_COLOR: GoogleColorDefinition = {
  id: '7',
  name: 'Domyślny (Pawi)',
  hex: '#039be5',
  contrastText: '#ffffff',
  bg: '#e6f4fb',
  border: '#b3e5fc',
  text: '#01579b',
  category: 'standard',
};

export const BIRCH_TASK_COLOR: GoogleColorDefinition = {
  id: 'birch',
  name: 'Brzozowy',
  hex: '#a79b8e',
  contrastText: '#ffffff',
  bg: '#f6f4f1',
  border: '#d7d0c7',
  text: '#4a4137',
  category: 'special',
};

export const TASK_EVENT_COLOR: GoogleColorDefinition = BIRCH_TASK_COLOR;

/**
 * Alternative Google Calendar API colors.get background hex codes
 * Maps classic API background colors to the standard 1-11 event colors
 */
export const CLASSIC_GOOGLE_API_EVENT_HEX_MAP: Record<string, string> = {
  '#a4bdfc': '1',  // Lavender
  '#7ae7bf': '2',  // Sage
  '#dbadff': '3',  // Grape
  '#ff887c': '4',  // Flamingo
  '#fbd75b': '5',  // Banana
  '#ffb878': '6',  // Tangerine
  '#46d6db': '7',  // Peacock
  '#e1e1e1': '8',  // Graphite
  '#5484ed': '9',  // Blueberry
  '#51b749': '10', // Basil
  '#dc2127': '11', // Tomato
};

/**
 * Classic Google Calendar API colors.get calendar background hex codes
 * Maps classic calendar background hexes to the corresponding extended calendar colors
 */
export const CLASSIC_GOOGLE_API_CALENDAR_HEX_MAP: Record<string, string> = {
  '#cca6ac': 'cal-1',  // Radicchio
  '#f691b2': 'cal-2',  // Kwiat wiśni
  '#d06b64': 'cal-3',  // Flamingowy
  '#f83a22': 'cal-4',  // Pomidorowy
  '#fa573c': 'cal-5',  // Mandarynkowy
  '#ff7537': 'cal-6',  // Dyniowy
  '#ffad46': 'cal-7',  // Mango
  '#fad165': 'cal-8',  // Bananowy
  '#fbe983': 'cal-9',  // Cytrynowy
  '#b3dc6c': 'cal-10', // Awokado
  '#7bd148': 'cal-11', // Pistacjowy
  '#16a765': 'cal-12', // Bazyliowy
  '#92e1c0': 'cal-13', // Szałwiowy
  '#42d692': 'cal-14', // Eukaliptusowy
  '#9fe1e7': 'cal-15', // Pawi
  '#9fc6e7': 'cal-16', // Kobaltowy
  '#9a9cff': 'cal-17', // Lawendowy
  '#4986e7': 'cal-18', // Jagodowy
  '#b99aff': 'cal-19', // Wisteria
  '#a47ae2': 'cal-20', // Ametystowy
  '#cd74e6': 'cal-21', // Winogronowy
  '#ac725e': 'cal-22', // Kakaowy
  '#c2c2c2': 'cal-23', // Grafitowy
  '#cabdbf': 'cal-24', // Brzozowy
};

/**
 * Checks if an event is in the past (ended before current moment)
 */
export const isPastEvent = (event: CalendarEventItem): boolean => {
  const now = new Date();
  if (event.end?.dateTime) {
    return new Date(event.end.dateTime) < now;
  }
  if (event.end?.date) {
    const endD = new Date(event.end.date + 'T00:00:00');
    return endD < now;
  }
  if (event.start?.dateTime) {
    return new Date(event.start.dateTime) < now;
  }
  if (event.start?.date) {
    const endD = new Date(event.start.date + 'T23:59:59');
    return endD < now;
  }
  return false;
};

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

export const STANDARD_GOOGLE_COLOR_IDS = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);

/**
 * Fast lookup for any color by ID ('1'..'11', 'cal-1'..'cal-24', legacy '12'..'35') or HEX code
 */
export const findColorDefinition = (key: string): GoogleColorDefinition | null => {
  if (!key) return null;
  const trimmed = key.trim();

  // 1. Direct standard event colors (1-11)
  if (GOOGLE_EVENT_COLORS[trimmed]) {
    return GOOGLE_EVENT_COLORS[trimmed];
  }

  // 2. Direct extended calendar colors by ID ('cal-1'..'cal-24' or legacy '12'..'35' or 'api-cal-1'..)
  if (GOOGLE_EXTENDED_COLORS[trimmed]) {
    return GOOGLE_EXTENDED_COLORS[trimmed];
  }

  // 3. Normalized hex check
  const cleanHex = trimmed.toLowerCase();
  const hexWithHash = cleanHex.startsWith('#') ? cleanHex : `#${cleanHex}`;

  // 3a. Check classic Google API event hexes (#a4bdfc -> 1, etc.)
  if (CLASSIC_GOOGLE_API_EVENT_HEX_MAP[hexWithHash]) {
    const eventId = CLASSIC_GOOGLE_API_EVENT_HEX_MAP[hexWithHash];
    return GOOGLE_EVENT_COLORS[eventId];
  }

  // 3b. Check classic Google API calendar hexes (#cca6ac -> cal-1, etc.)
  if (CLASSIC_GOOGLE_API_CALENDAR_HEX_MAP[hexWithHash]) {
    const calId = CLASSIC_GOOGLE_API_CALENDAR_HEX_MAP[hexWithHash];
    if (GOOGLE_EXTENDED_COLORS[calId]) {
      return GOOGLE_EXTENDED_COLORS[calId];
    }
  }

  // 3c. Check modern Google event hexes (#7986cb -> 1, etc.)
  for (const col of GOOGLE_EVENT_COLOR_OPTIONS) {
    if (col.hex.toLowerCase() === hexWithHash) {
      return col;
    }
  }

  // 3d. Check 24 calendar palette hexes (both modern and classic)
  for (const col of OFFICIAL_GOOGLE_CALENDAR_COLORS_LIST) {
    if (col.hex.toLowerCase() === hexWithHash) {
      return col;
    }
    if (col.classicHex && col.classicHex.toLowerCase() === hexWithHash) {
      return col;
    }
  }

  // 4. Custom hex code
  if (trimmed.startsWith('#') || /^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return makeCustomColor(hexWithHash);
  }

  // 5. Lookup by Polish name or common alias (case-insensitive)
  const lowerName = trimmed.toLowerCase();
  const NOUN_TO_COLOR_ID: Record<string, string> = {
    // 1-11 standard event colors
    lawenda: '1',
    lawendowy: '1',
    szałwia: '2',
    szałwiowy: '2',
    winogrono: '3',
    winogronowy: '3',
    flaming: '4',
    flamingowy: '4',
    banan: '5',
    bananowy: '5',
    mandarynka: '6',
    mandarynkowy: '6',
    paw: '7',
    pawi: '7',
    grafit: '8',
    grafitowy: '8',
    jagoda: '9',
    jagodowy: '9',
    bazylia: '10',
    bazyliowy: '10',
    pomidor: '11',
    pomidorowy: '11',

    // Tasks
    brzoza: 'birch',
    brzozowy: 'birch',

    // 24 extended calendar colors
    radicchio: 'cal-1',
    'kwiat wiśni': 'cal-2',
    'kwiat wisni': 'cal-2',
    wiśnia: 'cal-2',
    wisnia: 'cal-2',
    wiśniowy: 'cal-2',
    wisniowy: 'cal-2',
    dynia: 'cal-6',
    dyniowy: 'cal-6',
    mango: 'cal-7',
    cytryna: 'cal-9',
    cytrynowy: 'cal-9',
    awokado: 'cal-10',
    pistacja: 'cal-11',
    pistacjowy: 'cal-11',
    eukaliptus: 'cal-14',
    eukaliptusowy: 'cal-14',
    kobalt: 'cal-16',
    kobaltowy: 'cal-16',
    wisteria: 'cal-19',
    ametyst: 'cal-20',
    ametystowy: 'cal-20',
    kakao: 'cal-22',
    kakaowy: 'cal-22',
  };

  if (NOUN_TO_COLOR_ID[lowerName]) {
    const matchedId = NOUN_TO_COLOR_ID[lowerName];
    if (matchedId === 'birch') return BIRCH_TASK_COLOR;
    if (GOOGLE_EVENT_COLORS[matchedId]) return GOOGLE_EVENT_COLORS[matchedId];
    if (GOOGLE_EXTENDED_COLORS[matchedId]) return GOOGLE_EXTENDED_COLORS[matchedId];
  }

  for (const col of GOOGLE_ALL_COLOR_OPTIONS) {
    if (col.name.toLowerCase() === lowerName) {
      return col;
    }
  }

  return null;
};

/**
 * Maps any extended, custom, or classic color to the closest standard Google Calendar color (1-11).
 * Preserves standard 1-11 event colors and Birch (tasks) as-is.
 */
export const mapToStandardGoogleColorIfNeeded = (def: GoogleColorDefinition): GoogleColorDefinition => {
  if (def.category === 'standard' && def.id && STANDARD_GOOGLE_COLOR_IDS.has(def.id)) {
    return def;
  }
  if (def.category === 'special' && def.id === 'birch') {
    return def;
  }

  // Look up semantic mapping or compute closest standard color
  const mappedId =
    (def.id && EXTENDED_TO_STANDARD_COLOR_MAP[def.id]) ||
    EXTENDED_TO_STANDARD_COLOR_MAP[def.hex.toLowerCase()] ||
    (def.classicHex && EXTENDED_TO_STANDARD_COLOR_MAP[def.classicHex.toLowerCase()]) ||
    findClosestStandardGoogleColorId(def.hex);

  return GOOGLE_EVENT_COLORS[mappedId] || def;
};

/**
 * Resolves styling colors according to:
 * 1. Task check: Google Tasks (gtask-) -> Birch color
 * 2. Event's own colorId (1-11 standard, or mapped to closest 1-11 if extended)
 * 3. Fallback colorId (e.g. from matched travel template)
 * 4. Inherited calendarColor from Google Calendar API (mapped to closest 1-11 if extended)
 * 5. Parent calendar lookup in calendars list by calendarId (mapped to closest 1-11 if extended)
 */
export const getGoogleEventColor = (
  event: CalendarEventItem,
  isTask: boolean = false,
  fallbackColorId?: string,
  calendars?: CalendarListItem[]
): GoogleColorDefinition => {
  // 1. Only tasks loaded from To Do (id starts with 'gtask-' or explicitly birch) have Birch color
  if (isTask || event.id.startsWith('gtask-') || event.colorId === 'birch') {
    return BIRCH_TASK_COLOR;
  }

  // 2. Direct event.colorId (e.g. edited in Google Calendar)
  if (event.colorId) {
    const resolved = findColorDefinition(event.colorId);
    if (resolved) return mapToStandardGoogleColorIfNeeded(resolved);
  }

  // 3. Fallback colorId (e.g. from matched template)
  if (fallbackColorId) {
    const resolved = findColorDefinition(fallbackColorId);
    if (resolved) return mapToStandardGoogleColorIfNeeded(resolved);
  }

  // 4. Inherited calendar color from Google Calendar API
  if (event.calendarColor) {
    const resolved = findColorDefinition(event.calendarColor);
    if (resolved) return mapToStandardGoogleColorIfNeeded(resolved);
    const closestId = findClosestStandardGoogleColorId(event.calendarColor);
    return GOOGLE_EVENT_COLORS[closestId] || DEFAULT_EVENT_COLOR;
  }

  // 5. Look up parent calendar in calendars list by event.calendarId
  if (event.calendarId && calendars && calendars.length > 0) {
    const matchedCal = calendars.find((c) => c.id === event.calendarId);
    if (matchedCal?.backgroundColor) {
      const resolved = findColorDefinition(matchedCal.backgroundColor);
      if (resolved) return mapToStandardGoogleColorIfNeeded(resolved);
      const closestId = findClosestStandardGoogleColorId(matchedCal.backgroundColor);
      return GOOGLE_EVENT_COLORS[closestId] || DEFAULT_EVENT_COLOR;
    }
  }

  return DEFAULT_EVENT_COLOR;
};

/**
 * Semantic mapping of each extended Google Calendar UI color to the closest standard Google Calendar API color (1-11)
 * IDs:
 * 1: Radicchio (#ad1457 / #cca6ac) -> 4 Flaming
 * 2: Kwiat wiśni (#d81b60 / #f691b2) -> 4 Flaming
 * 3: Flaming (#e67c73 / #d06b64) -> 4 Flaming
 * 4: Pomidor (#d50000 / #f83a22) -> 11 Pomidor
 * 5: Mandarynka (#f4511e / #fa573c) -> 6 Mandarynka
 * 6: Dynia (#ef6c00 / #ff7537) -> 6 Mandarynka
 * 7: Mango (#f09300 / #ffad46) -> 5 Banan
 * 8: Banan (#f6bf26 / #fad165) -> 5 Banan
 * 9: Cytryna (#e4c441 / #fbe983) -> 5 Banan
 * 10: Awokado (#c0ca33 / #b3dc6c) -> 2 Szałwia
 * 11: Pistacja (#7cb342 / #7bd148) -> 2 Szałwia
 * 12: Bazylia (#0b8043 / #16a765) -> 10 Bazylia
 * 13: Szałwia (#33b679 / #92e1c0) -> 2 Szałwia
 * 14: Eukaliptus (#009688 / #42d692) -> 2 Szałwia
 * 15: Paw (#039be5 / #9fe1e7) -> 7 Paw
 * 16: Kobalt (#4285f4 / #9fc6e7) -> 7 Paw
 * 17: Lawenda (#7986cb / #9a9cff) -> 1 Lawenda
 * 18: Jagoda (#3f51b5 / #4986e7) -> 9 Jagoda
 * 19: Wisteria (#b39ddb / #b99aff) -> 1 Lawenda
 * 20: Ametyst (#9e69af / #a47ae2) -> 3 Winogrono
 * 21: Winogrono (#8e24aa / #cd74e6) -> 3 Winogrono
 * 22: Kakao (#795548 / #ac725e) -> 6 Mandarynka
 * 23: Grafit (#616161 / #c2c2c2) -> 8 Grafit
 * 24: Brzoza (#a79b8e / #cabdbf) -> 8 Grafit
 */
export const EXTENDED_TO_STANDARD_COLOR_MAP: Record<string, string> = {
  // cal-ids (UI position order 1-24)
  'cal-1': '4',
  'cal-2': '4',
  'cal-3': '4',
  'cal-4': '11',
  'cal-5': '6',
  'cal-6': '6',
  'cal-7': '5',
  'cal-8': '5',
  'cal-9': '5',
  'cal-10': '2',
  'cal-11': '2',
  'cal-12': '10',
  'cal-13': '2',
  'cal-14': '2',
  'cal-15': '7',
  'cal-16': '7',
  'cal-17': '1',
  'cal-18': '9',
  'cal-19': '1',
  'cal-20': '3',
  'cal-21': '3',
  'cal-22': '6',
  'cal-23': '8',
  'cal-24': '8',

  // Modern UI Hex codes
  '#ad1457': '4',
  '#d81b60': '4',
  '#e67c73': '4',
  '#d50000': '11',
  '#f4511e': '6',
  '#ef6c00': '6',
  '#f09300': '5',
  '#f6bf26': '5',
  '#e4c441': '5',
  '#c0ca33': '2',
  '#7cb342': '2',
  '#0b8043': '10',
  '#33b679': '2',
  '#009688': '2',
  '#039be5': '7',
  '#4285f4': '7',
  '#7986cb': '1',
  '#3f51b5': '9',
  '#b39ddb': '1',
  '#9e69af': '3',
  '#8e24aa': '3',
  '#795548': '6',
  '#616161': '8',
  '#a79b8e': '8',

  // Classic API Hex codes
  '#cca6ac': '4',
  '#f691b2': '4',
  '#d06b64': '4',
  '#f83a22': '11',
  '#fa573c': '6',
  '#ff7537': '6',
  '#ffad46': '5',
  '#fad165': '5',
  '#fbe983': '5',
  '#b3dc6c': '2',
  '#7bd148': '2',
  '#16a765': '10',
  '#92e1c0': '2',
  '#42d692': '2',
  '#9fe1e7': '7',
  '#9fc6e7': '7',
  '#9a9cff': '1',
  '#4986e7': '9',
  '#b99aff': '1',
  '#a47ae2': '3',
  '#cd74e6': '3',
  '#ac725e': '6',
  '#c2c2c2': '8',
  '#cabdbf': '8',
};

/**
 * Finds the closest standard Google Calendar API color (1-11) for any given hex code using Euclidean RGB distance
 */
export const findClosestStandardGoogleColorId = (hex: string): string => {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;

  let bestId = '7'; // Peacock (Paw) as default
  let bestDist = Infinity;

  Object.entries(GOOGLE_EVENT_COLORS).forEach(([id, def]) => {
    const dClean = def.hex.replace('#', '');
    const dr = parseInt(dClean.substring(0, 2), 16) || 0;
    const dg = parseInt(dClean.substring(2, 4), 16) || 0;
    const db = parseInt(dClean.substring(4, 6), 16) || 0;
    // Perceptually-weighted RGB distance
    const dist = Math.sqrt(
      2 * Math.pow(r - dr, 2) + 4 * Math.pow(g - dg, 2) + 3 * Math.pow(b - db, 2)
    );
    if (dist < bestDist) {
      bestDist = dist;
      bestId = id;
    }
  });

  return bestId;
};

/**
 * Transforms an in-app colorId (which can be 1-11 standard, 1-24 calendar, or #hex custom)
 * into safe parameters for Google Calendar API:
 * - apiColorId: strictly in '1'..'11' (or undefined if no color specified) - PREVENTS "Invalid color id value" error!
 * - customColorId: original in-app colorId (hex or id)
 * - customColorHex: hex code for UI display and storage
 */
export const resolveSafeGoogleApiColor = (
  colorId?: string
): {
  apiColorId?: string;
  customColorId?: string;
  customColorHex?: string;
} => {
  if (!colorId || !colorId.trim()) {
    return {};
  }
  const trimmed = colorId.trim();

  // 1. If it's already a standard Google Calendar API event color (1-11)
  if (STANDARD_GOOGLE_COLOR_IDS.has(trimmed)) {
    return {
      apiColorId: trimmed,
      customColorId: trimmed,
      customColorHex: GOOGLE_EVENT_COLORS[trimmed]?.hex,
    };
  }

  // 2. Look up in predefined palette (extended / calendar colors)
  const def = findColorDefinition(trimmed);
  if (def) {
    if (def.category === 'standard' && def.id && STANDARD_GOOGLE_COLOR_IDS.has(def.id)) {
      return {
        apiColorId: def.id,
        customColorId: def.id,
        customColorHex: def.hex,
      };
    }
    const standardId =
      EXTENDED_TO_STANDARD_COLOR_MAP[trimmed] ||
      EXTENDED_TO_STANDARD_COLOR_MAP[def.hex.toLowerCase()] ||
      findClosestStandardGoogleColorId(def.hex);

    return {
      apiColorId: standardId,
      customColorId: def.hex,
      customColorHex: def.hex,
    };
  }

  // 3. Custom HEX color (starts with # or 3/6 hex chars)
  if (trimmed.startsWith('#') || /^[0-9a-fA-F]{6}$/.test(trimmed)) {
    const hex = trimmed.startsWith('#') ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`;
    const standardId =
      EXTENDED_TO_STANDARD_COLOR_MAP[hex] || findClosestStandardGoogleColorId(hex);
    return {
      apiColorId: standardId,
      customColorId: hex,
      customColorHex: hex,
    };
  }

  return {};
};
