import { CalendarEventItem } from '../types';

export interface TimedEventLayout {
  event: CalendarEventItem;
  topPx: number;
  heightPx: number;
  leftPercent: number;
  widthPercent: number;
  zIndex?: number;
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

      const durationMinutes = Math.max(15, endMinutes - startMinutes);
      const topPx = (startMinutes / 60) * pixelsPerHour;
      const heightPx = Math.max(
        16,
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
        zIndex: 10,
      });
      continue;
    }

    if (cluster.length === 2) {
      // Exactly two overlapping events:
      // Wydarzenie krótsze najeżdża na dłuższe (tak jak w UI google calendar)
      const [evA, evB] = cluster;
      let longer = evA;
      let shorter = evB;

      if (evB.durationMinutes > evA.durationMinutes) {
        longer = evB;
        shorter = evA;
      } else if (evA.durationMinutes === evB.durationMinutes) {
        // Equal durations: earlier start gets base (longer), later gets overlay (shorter)
        if (evB.startMinutes < evA.startMinutes) {
          longer = evB;
          shorter = evA;
        }
      }

      // Longer event sits at left: 0% with width 85% and zIndex 10
      layouts.push({
        ...longer,
        leftPercent: 0,
        widthPercent: 85,
        zIndex: 10,
      });

      // Shorter event overlays on top of the longer event, shifted to right with higher zIndex 20
      layouts.push({
        ...shorter,
        leftPercent: 25,
        widthPercent: 75,
        zIndex: 20,
      });
      continue;
    }

    // 3 or more overlapping events:
    // Sort cluster by duration descending (longer events first -> lower zIndex, shorter events later -> higher zIndex)
    cluster.sort((a, b) => {
      if (b.durationMinutes !== a.durationMinutes) {
        return b.durationMinutes - a.durationMinutes;
      }
      return a.startMinutes - b.startMinutes;
    });

    const step = Math.min(22, Math.floor(60 / (cluster.length - 1)));
    for (let i = 0; i < cluster.length; i++) {
      const item = cluster[i];
      const leftPercent = i * step;
      const widthPercent = Math.max(50, 100 - leftPercent);
      layouts.push({
        ...item,
        leftPercent,
        widthPercent,
        zIndex: 10 + i * 5,
      });
    }
  }

  return layouts;
};
