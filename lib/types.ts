// ============================================================
// TypeScript types matching the Supabase database schema
// ============================================================

// ---------- Enums ----------

export type GoalStatus = 'active' | 'completed' | 'archived';

export type SubGoalLevel = 'milestone';

export type SubGoalStatus = 'not_started' | 'in_progress' | 'completed' | 'missed';

export type MemberRole = 'owner' | 'admin' | 'member';

export type CommentTargetType = 'action_log' | 'goal' | 'sub_goal';

export type NotificationType =
  | 'checkin_reminder'
  | 'teammate_action'
  | 'milestone_celebration'
  | 'streak_alert'
  | 'streak_broken'
  | 'goal_completed'
  | 'goal_reaction'
  | 'comment'
  | 'group_invite'
  | 'member_joined'
  | 'help_requested'
  | 'help_offered'
  | 'due_date_reminder'
  | 'due_date_missed';

export type CheckinCadence = 'daily' | 'every_2_days' | 'every_3_days' | 'weekly';

// ---------- Database Row Types ----------

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  onboarding_completed: boolean;
  checkin_cadence: CheckinCadence;
  streak_current: number;
  streak_longest: number;
  last_action_date: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  created_by: string;
  cover_image: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
  // Joined profile data
  profile?: Profile;
}

export interface Goal {
  id: string;
  group_id: string | null;
  title: string;
  description: string | null;
  status: GoalStatus;
  start_date: string;
  end_date: string | null;
  tangible_reward: string | null;
  progress: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_action_at: string | null;
  goal_activity_at: string | null;
  // Joined data
  creator_profile?: Profile;
  sub_goals?: SubGoal[];
  group?: { name: string } | null;
  // Bundled lightweight counts (included when fetched via list queries)
  goal_photos?: { id: string }[];
  help_requests?: { id: string; resolved: boolean }[];
  help_offers?: { id: string }[];
}

export interface SubGoal {
  id: string;
  goal_id: string;
  parent_id: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  level: SubGoalLevel;
  status: SubGoalStatus;
  target_value: number | null;
  current_value: number | null;
  due_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Client-side additions
  children?: SubGoal[];
  assigned_profile?: Profile;
}

export interface ActionLog {
  id: string;
  user_id: string;
  sub_goal_id: string;
  note: string | null;
  media_url: string | null;
  value: number;
  created_at: string;
  // Joined data
  profile?: Profile;
  sub_goal?: SubGoal;
}

export interface Comment {
  id: string;
  user_id: string;
  target_type: CommentTargetType;
  target_id: string;
  body: string | null;
  voice_url: string | null;
  created_at: string;
  profile?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export interface GoalReaction {
  id: string;
  goal_id: string;
  user_id: string;
  reaction_type: string;
  created_at: string;
  profile?: Profile;
}

export interface HabitLog {
  id: string;
  user_id: string;
  sub_goal_id: string;
  log_date: string;
  completed: boolean;
  created_at: string;
}

export interface GoalPhoto {
  id: string;
  goal_id: string;
  uploaded_by: string;
  storage_url: string;
  created_at: string;
  uploader_profile?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>;
}

export interface GoalPhotoReaction {
  id: string;
  photo_id: string;
  user_id: string;
  reaction_type: string;
  created_at: string;
}

// ---------- Activity Feed Item ----------

export type GroupActivityType =
  | 'action_completed'
  | 'goal_created'
  | 'goal_completed'
  | 'goal_shared'
  | 'action_added'
  | 'action_due_date_changed'
  | 'member_joined'
  | 'member_left'
  | 'help_requested'
  | 'help_resolved'
  | 'help_offered'
  | 'goal_reaction'
  | 'goal_photo_added'
  | 'intention_shared';

export interface FeedItem {
  id: string;
  type: GroupActivityType;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  title: string;
  note: string | null;
  media_url: string | null;
  created_at: string;
}

// ---------- Group with extras ----------

export interface GroupWithDetails extends Group {
  members: GroupMember[];
  active_goals: Goal[];
  member_count: number;
}

// ---------- Goal with sub-goal tree ----------

export interface GoalWithSubGoals extends Goal {
  sub_goals: SubGoal[];
}

// ---------- Goal-Group Share ----------

export interface GoalGroupShare {
  goal_id: string;
  group_id: string;
  shared_by: string;
  shared_at: string;
  group?: Group;
}

// ---------- Help Requests ----------

export interface HelpRequest {
  id: string;
  goal_id: string;
  sub_goal_id: string | null;
  requested_by: string;
  group_id: string;
  note: string;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
  requester_profile?: Profile;
  group?: { id: string; name: string };
}

// ---------- Help Offers ----------

export interface HelpOffer {
  id: string;
  goal_id: string;
  sub_goal_id: string | null;
  offered_by: string;
  group_id: string;
  note: string;
  created_at: string;
  offerer_profile?: Profile;
  group?: { id: string; name: string };
}

// ---------- Group Invites ----------

export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export interface GroupInvite {
  id: string;
  group_id: string;
  invited_by: string;
  phone: string;
  name: string | null;
  status: InviteStatus;
  resolved_user_id: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  // Joined data
  group?: Group;
  inviter_profile?: Profile;
}

export interface InviteResult {
  phone: string;
  name?: string;
  isExistingUser: boolean;
  inviteId: string;
}

// ---------- Push Tokens ----------

export interface PushToken {
  id: string;
  user_id: string;
  token: string;
  platform: string;
  created_at: string;
  updated_at: string;
}

// ---------- AI Generation ----------

export interface GenerateActionsResponse {
  actions: { title: string }[];
}

// ---------- Daily Intentions ----------

export interface DailyIntention {
  id: string;
  user_id: string;
  date: string; // ISO date 'YYYY-MM-DD'
  text: string | null;
  media_url: string | null;
  media_type: 'video' | 'voice' | 'text' | null;
  share_with_groups: boolean;
  created_at: string;
}

// ---------- Goal Views (unseen dot tracking) ----------

export interface GoalView {
  user_id: string;
  goal_id: string;
  viewed_at: string;
}
