/**
 * Phase 1: events are buffered locally (and logged in dev).
 * Phase 2 will flush this buffer to the backend (`analytics_events` table).
 */
export type AnalyticsEventName =
  | 'session_start'
  | 'session_end'
  | 'tutorial_step'
  | 'merge'
  | 'generate'
  | 'energy_empty'
  | 'order_delivered'
  | 'chapter_completed'
  | 'offer_shown'
  | 'offer_clicked'
  | 'purchase'
  | 'ad_watched'
  | 'auto_merge_used'
  | 'level_up'
  | 'action_rejected';

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  payload: Record<string, unknown>;
  at: number;
}

const MAX_BUFFER = 500;
const buffer: AnalyticsEvent[] = [];

export function track(name: AnalyticsEventName, payload: Record<string, unknown> = {}): void {
  buffer.push({ name, payload, at: Date.now() });
  if (buffer.length > MAX_BUFFER) buffer.shift();
  if (import.meta.env.DEV) console.debug('[analytics]', name, payload);
}

/** Returns and clears buffered events (for the future network flush). */
export function drainAnalytics(): AnalyticsEvent[] {
  return buffer.splice(0, buffer.length);
}
