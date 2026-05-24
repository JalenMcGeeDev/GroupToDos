import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const WIDGET_SESSION_KEY = 'cogo_widget_session';
const WIDGET_GOALS_CACHE_KEY = 'cogo_widget_goals_cache';

export interface WidgetSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user_id: string;
}

export interface WidgetSubGoal {
  id: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'missed';
  due_date: string | null;
}

export interface WidgetGoal {
  id: string;
  title: string;
  due_date: string | null;
  sub_goals: WidgetSubGoal[];
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

export async function readSession(): Promise<WidgetSession | null> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_SESSION_KEY);
    return raw ? (JSON.parse(raw) as WidgetSession) : null;
  } catch {
    return null;
  }
}

export async function refreshSessionIfNeeded(
  session: WidgetSession
): Promise<WidgetSession> {
  const now = Math.floor(Date.now() / 1000);
  // Refresh if the token expires within the next 5 minutes
  if (session.expires_at > now + 300) return session;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      }
    );
    if (!res.ok) return session;
    const json = await res.json();
    const updated: WidgetSession = {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: json.expires_at ?? now + 3600,
      user_id: session.user_id,
    };
    await AsyncStorage.setItem(WIDGET_SESSION_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return session;
  }
}

// ---------------------------------------------------------------------------
// Goal fetching
// ---------------------------------------------------------------------------

export async function fetchGoals(
  token: string,
  userId: string
): Promise<WidgetGoal[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const url =
      `${SUPABASE_URL}/rest/v1/goals` +
      `?select=id,title,due_date:end_date,sub_goals:sub_goals(id,title,status,due_date)` +
      `&status=eq.active` +
      `&created_by=eq.${userId}` +
      `&order=updated_at.desc` +
      `&limit=30`;

    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return readGoalsCache();
    const data = await res.json();
    return Array.isArray(data) ? (data as WidgetGoal[]) : [];
  } catch {
    clearTimeout(timeout);
    return readGoalsCache();
  }
}

// ---------------------------------------------------------------------------
// Sub-goal completion
// ---------------------------------------------------------------------------

export async function markSubGoalComplete(
  token: string,
  userId: string,
  subGoalId: string
): Promise<void> {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  await Promise.allSettled([
    fetch(`${SUPABASE_URL}/rest/v1/sub_goals?id=eq.${subGoalId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'completed' }),
    }),
    fetch(`${SUPABASE_URL}/rest/v1/action_logs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ user_id: userId, sub_goal_id: subGoalId, value: 1 }),
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Goals cache (offline fallback)
// ---------------------------------------------------------------------------

export async function readGoalsCache(): Promise<WidgetGoal[]> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_GOALS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as WidgetGoal[]) : [];
  } catch {
    return [];
  }
}

export async function writeGoalsCache(goals: WidgetGoal[]): Promise<void> {
  try {
    await AsyncStorage.setItem(WIDGET_GOALS_CACHE_KEY, JSON.stringify(goals));
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// Profile / Streak
// ---------------------------------------------------------------------------

export interface WidgetProfile {
  streak_current: number;
  streak_longest: number;
  last_action_date: string | null;
}

export interface WidgetActivityItem {
  id: string;
  type: string;
  display_name: string;
  title: string;
  note: string | null;
  created_at: string;
}

export interface WidgetGroupInfo {
  id: string;
  name: string;
}

const WIDGET_PROFILE_CACHE_KEY = 'cogo_widget_profile_cache';
const WIDGET_ACTIVITY_CACHE_KEY_PREFIX = 'cogo_widget_activity_';
const WIDGET_GROUP_CONFIG_KEY_PREFIX = 'cogo_widget_group_';

export async function fetchProfile(
  token: string,
  userId: string
): Promise<WidgetProfile | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const url =
      `${SUPABASE_URL}/rest/v1/profiles` +
      `?id=eq.${userId}` +
      `&select=streak_current,streak_longest,last_action_date` +
      `&limit=1`;

    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return readProfileCache();
    const data = await res.json();
    const profile = Array.isArray(data) && data.length > 0
      ? (data[0] as WidgetProfile)
      : null;
    if (profile) await writeProfileCache(profile);
    return profile;
  } catch {
    clearTimeout(timeout);
    return readProfileCache();
  }
}

export async function fetchUserGroups(
  token: string,
  userId: string
): Promise<WidgetGroupInfo[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const url =
      `${SUPABASE_URL}/rest/v1/group_members` +
      `?user_id=eq.${userId}` +
      `&select=group_id,groups:groups(id,name)`;

    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((row: any) => row.groups)
      .map((row: any) => ({
        id: row.groups.id as string,
        name: row.groups.name as string,
      }));
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

export async function fetchGroupActivity(
  token: string,
  groupId: string,
  limit = 8
): Promise<WidgetActivityItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_group_activity_feed`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_group_id: groupId,
          p_limit: limit,
          p_offset: 0,
        }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!res.ok) return readActivityCache(groupId);
    const data = await res.json();
    const items: WidgetActivityItem[] = Array.isArray(data)
      ? data.map((item: any) => ({
          id: item.id,
          type: item.type,
          display_name: item.display_name ?? 'Someone',
          title: item.title ?? '',
          note: item.note ?? null,
          created_at: item.created_at,
        }))
      : [];
    await writeActivityCache(groupId, items);
    return items;
  } catch {
    clearTimeout(timeout);
    return readActivityCache(groupId);
  }
}

// ---------------------------------------------------------------------------
// Widget group config (per widget instance)
// ---------------------------------------------------------------------------

export async function readWidgetGroupConfig(
  widgetId: number
): Promise<WidgetGroupInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(
      `${WIDGET_GROUP_CONFIG_KEY_PREFIX}${widgetId}`
    );
    return raw ? (JSON.parse(raw) as WidgetGroupInfo) : null;
  } catch {
    return null;
  }
}

export async function writeWidgetGroupConfig(
  widgetId: number,
  group: WidgetGroupInfo
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${WIDGET_GROUP_CONFIG_KEY_PREFIX}${widgetId}`,
      JSON.stringify(group)
    );
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// Profile cache
// ---------------------------------------------------------------------------

export async function readProfileCache(): Promise<WidgetProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_PROFILE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as WidgetProfile) : null;
  } catch {
    return null;
  }
}

export async function writeProfileCache(profile: WidgetProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(WIDGET_PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// Activity cache (per group)
// ---------------------------------------------------------------------------

async function readActivityCache(groupId: string): Promise<WidgetActivityItem[]> {
  try {
    const raw = await AsyncStorage.getItem(
      `${WIDGET_ACTIVITY_CACHE_KEY_PREFIX}${groupId}`
    );
    return raw ? (JSON.parse(raw) as WidgetActivityItem[]) : [];
  } catch {
    return [];
  }
}

async function writeActivityCache(
  groupId: string,
  items: WidgetActivityItem[]
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${WIDGET_ACTIVITY_CACHE_KEY_PREFIX}${groupId}`,
      JSON.stringify(items)
    );
  } catch {
    // Non-fatal
  }
}
