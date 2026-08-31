import { logger } from './logger.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type SendExpoPushInput = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

/**
 * Best-effort Expo push send. Uses the global `fetch` (Node 20+, per
 * package.json engines) rather than adding an HTTP client dependency.
 *
 * Never throws: a failed push must not fail the caller — the notification
 * row is already persisted by the time this runs, so push is a delivery
 * nicety, not the source of truth. Single attempt, no retry queue — per
 * CLAUDE.md, no background job infra until there's a concrete need. If
 * push reliability becomes a real product requirement, that's the trigger
 * to revisit (e.g. a retry queue), not before.
 */
export async function sendExpoPush(input: SendExpoPushInput): Promise<void> {
  const { to, title, body, data } = input;
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, title, body, data, sound: 'default' }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status, to }, 'expo push: non-OK response');
      return;
    }
    const json = (await res.json()) as { data?: { status?: string; message?: string } };
    if (json.data?.status === 'error') {
      logger.warn({ to, message: json.data.message }, 'expo push: delivery error');
    }
  } catch (err) {
    logger.warn({ err, to }, 'expo push: send failed');
  }
}
