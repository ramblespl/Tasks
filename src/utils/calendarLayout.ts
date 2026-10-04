import { CalendarEventItem } from '../types';

export interface TimedEventLayout {
  event: CalendarEventItem;
  topPx: number;
  heightPx: number;
  leftPercent: number;
  widthPercent: number;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
}

/**
 * Computes top, height, left, and width styling for timed events in a 24-hour day column.
 * If two events overlap in time, the shorter one occupies half the width of the day column (50%),
 * while the longer one takes the remaining 50%, matching Google Calendar UX.
 */
export const computeDayTimedEventLayouts = (
  events: CalendarEventItem[],
  pixelsPerHour: number = 48,
  totalHeightPx: number = 1152
): TimedEventLayout[] => {
  if (!events || events.length === 0) return [];

  // 1. Calculate time intervals for each event
  const parsed = events
    .map((ev) => {
      if (!ev.start.dateTime) return null;
      const s = new Date(ev.start.dateTime);
      const e = ev.end?.dateTime
        ? new Date(ev.end.dateTime)
        : new Date(s.getTime() + 30 * 60000);

      const startMinutes = s.getHours() * 60 + s.getMinutes();
      let endMinutes = e.getHours() * 60 + e.getMinutes();

      // If event ends on next day or end <= start
      if (endMinutes <= startMinutes) {
        endMinutes = startMinutes + 30;
      }
      // Cap at 1440 minutes (24:00)
      endMinutes = Math.min(1440, endMinutes);

      const durationMinutes = Math.max(20, endMinutes - startMinutes);
      const topPx = (startMinutes / 60) * pixelsPerHour;
      const heightPx = Math.max(
        24,
        Math.min((durationMinutes / 60) * pixelsPerHour, totalHeightPx - topPx)
      );

      return {
        event: ev,
        topPx,
        heightPx,
        startMinutes,
        endMinutes,
        durationMinutes,
      };
    })
    .filter(Boolean) as Array<{
    event: CalendarEventItem;
    topPx: number;
    heightPx: number;
    startMinutes: number;
    endMinutes: number;
    durationMinutes: number;
  }>;

  if (parsed.length === 0) return [];

  // 2. Group into overlapping connected clusters
  const clusters: Array<typeof parsed> = [];
  const visited = new Set<string>();

  const overlaps = (a: (typeof parsed)[0], b: (typeof parsed)[0]) =>
    a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (visited.has(item.event.id)) continue;

    const cluster: typeof parsed = [item];
    visited.add(item.event.id);

    // BFS / Queue to find all connected overlapping events
    const queue = [item];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (let j = 0; j < parsed.length; j++) {
        const candidate = parsed[j];
        if (!visited.has(candidate.event.id) && overlaps(current, candidate)) {
          visited.add(candidate.event.id);
          cluster.push(candidate);
          queue.push(candidate);
        }
      }
    }

    clusters.push(cluster);
  }

  // 3. Position events within each cluster
  const layouts: TimedEventLayout[] = [];

  for (const cluster of clusters) {
    if (cluster.length === 1) {
      // Single event without overlaps takes full width
      layouts.push({
        ...cluster[0],
        leftPercent: 0,
        widthPercent: 100,
      });
      continue;
    }

    if (cluster.length === 2) {
      // Exactly two overlapping events:
      // "jeśli dwa wydarzenia są w tym samym czasie to to krótsze powinno zajmować połowę szerokości paska dnia"
      const [evA, evB] = cluster;
      let longer = evA;
      let shorter = evB;

      if (evB.durationMinutes > evA.durationMinutes) {
        longer = evB;
        shorter = evA;
      } else if (evA.durationMinutes === evB.durationMinutes) {
        // Equal durations: earlier start gets left column
        if (evB.startMinutes < evA.startMinutes) {
          longer = evB;
          shorter = evA;
        }
      }

      layouts.push({
        ...longer,
        leftPercent: 0,
        widthPercent: 50,
      });

      layouts.push({
        ...shorter,
        leftPercent: 50,
        widthPercent: 50,
      });
      continue;
    }

    // 3 or more overlapping events:
    // Sort cluster by duration descending (longer events first), then start time ascending
    cluster.sort((a, b) => {
      if (b.durationMinutes !== a.durationMinutes) {
        return b.durationMinutes - a.durationMinutes;
      }
      return a.startMinutes - b.startMinutes;
    });

    // Greedy column assignment
    const columns: Array<Array<(typeof cluster)[0]>> = [];
    const eventColumnMap = new Map<string, number>();

    for (const item of cluster) {
      let placedCol = -1;
      for (let c = 0; c < columns.length; c++) {
        const hasCollision = columns[c].some((existing) => overlaps(existing, item));
        if (!hasCollision) {
          columns[c].push(item);
          placedCol = c;
          break;
        }
      }

      if (placedCol === -1) {
        placedCol = columns.length;
        columns.push([item]);
      }

      eventColumnMap.set(item.event.id, placedCol);
    }

    const totalCols = Math.max(columns.length, 2);
    const colWidth = 100 / totalCols;

    for (const item of cluster) {
      const col = eventColumnMap.get(item.event.id) ?? 0;
      layouts.push({
        ...item,
        leftPercent: col * colWidth,
        widthPercent: colWidth,
      });
    }
  }

  return layouts;
};
