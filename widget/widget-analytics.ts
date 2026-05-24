/**
 * Safe PostHog wrapper for the widget task handler (headless JS context).
 *
 * posthog-react-native initialises AppState and other RN APIs at module load
 * time. Some of those APIs may be unavailable in the headless widget context,
 * so we lazy-require the singleton and fall back to a raw HTTP POST to the
 * PostHog /capture REST endpoint if it throws.
 */

const POSTHOG_API_KEY = 'phc_t3JmRCqWrE4sG66HQQTn7yHxFQKFoustuXiTD95gC5ZV';
const POSTHOG_HOST = 'https://us.i.posthog.com';

// null  = not yet attempted
// false = failed to load
let _ph: any = null;

function getPostHog(): any | null {
  if (_ph !== null) return _ph || null;
  try {
    _ph = require('../lib/posthog').default;
    return _ph;
  } catch {
    _ph = false;
    return null;
  }
}

export async function widgetCapture(
  userId: string,
  event: string,
  properties: Record<string, unknown> = {}
): Promise<void> {
  const props = { ...properties, source: 'android_widget' };
  const ph = getPostHog();

  if (ph) {
    try {
      ph.identify(userId);
      ph.capture(event, props);
      return;
    } catch {
      // Fall through to REST fallback
    }
  }

  // REST fallback — always works in any JS context
  try {
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_API_KEY,
        event,
        distinct_id: userId,
        properties: props,
      }),
    });
  } catch {
    // Analytics failure is always non-fatal
  }
}
