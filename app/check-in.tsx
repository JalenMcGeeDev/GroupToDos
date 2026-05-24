import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '../stores/auth-store';
import { useCelebrationStore } from '../stores/celebration-store';
import { useGroups } from '../hooks/use-groups';
import {
  useYesterdaysIntention,
  useTodaysIntention,
  useSaveIntention,
  useActiveGoalsWithSubGoals,
  useLogCheckinActions,
  useShareIntention,
  useCheckinInsight,
  type GoalForCheckin,
} from '../hooks/use-checkin';
import { IntentionRecorder, type IntentionMode } from '../components/IntentionRecorder';
import { supabase } from '../lib/supabase';
import { COLORS } from '../constants';
import type { SubGoal } from '../lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Motivational message selector
// ---------------------------------------------------------------------------

function getMotivationalMessage(streak: number, avgProgress: number): string {
  if (streak >= 30) return "You're unstoppable. An incredible streak!";
  if (streak >= 15) return "Impressive dedication — keep the momentum going!";
  if (streak >= 8) return "Solid consistency. You're building a real habit!";
  if (streak >= 4) return "You're picking up momentum. Great work!";
  if (avgProgress >= 75) return "So close to the finish line — push through!";
  if (avgProgress >= 50) return "Over halfway there. Stay the course!";
  if (avgProgress >= 25) return "You're making real progress. Keep going!";
  return "Every check-in counts. Keep showing up!";
}

// ---------------------------------------------------------------------------
// Step dots
// ---------------------------------------------------------------------------

function StepDots({ current }: { current: Step }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      {([1, 2, 3] as Step[]).map((s) => (
        <View
          key={s}
          style={{
            width: s === current ? 20 : 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: s === current ? COLORS.primary : COLORS.border,
          }}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <View style={{ height: 4, backgroundColor: COLORS.borderLight, borderRadius: 2, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: COLORS.primary, borderRadius: 2 }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  icon,
  color,
  bg,
  value,
  label,
}: {
  icon: string;
  color: string;
  bg: string;
  value: string | number;
  label: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.borderLight,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
        }}
      >
        <Feather name={icon as any} size={16} color={color} />
      </View>
      <Text style={{ fontSize: 22, fontWeight: '700', color: COLORS.text, lineHeight: 26 }}>
        {value}
      </Text>
      <Text style={{ fontSize: 11, color: COLORS.textTertiary, fontWeight: '500', marginTop: 2, textAlign: 'center' }}>
        {label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function CheckInScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const celebrate = useCelebrationStore((s) => s.show);

  const [step, setStep] = useState<Step>(1);
  const [intentionMode, setIntentionMode] = useState<IntentionMode>('video');
  const [intentionText, setIntentionText] = useState('');
  const [intentionLocalUri, setIntentionLocalUri] = useState<string | null>(null);
  const [shareWithGroups, setShareWithGroups] = useState(true);
  const [expandedGoalIds, setExpandedGoalIds] = useState<Set<string>>(new Set());
  const [checkedSubGoalIds, setCheckedSubGoalIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Data
  const { data: yesterdaysIntention } = useYesterdaysIntention();
  const { data: todaysIntention } = useTodaysIntention();
  const { data: goals = [], isLoading: goalsLoading } = useActiveGoalsWithSubGoals();
  const { data: groups = [] } = useGroups();
  const { data: insight } = useCheckinInsight(goals);

  // Mutations
  const saveIntention = useSaveIntention();
  const logActions = useLogCheckinActions();
  const shareIntention = useShareIntention();

  // Pre-fill if user already set today's intention
  useEffect(() => {
    if (todaysIntention) {
      setIntentionMode((todaysIntention.media_type as IntentionMode) ?? 'text');
      if (todaysIntention.text) setIntentionText(todaysIntention.text);
      setShareWithGroups(todaysIntention.share_with_groups);
    }
  }, [todaysIntention]);

  // ---------------------------------------------------------------------------
  // Step 1 → Step 2: save intention
  // ---------------------------------------------------------------------------

  const step1Ready =
    intentionMode === 'text'
      ? intentionText.trim().length > 0
      : intentionLocalUri !== null;

  const handleStep1Next = useCallback(() => {
    if (!step1Ready) return;
    // Advance immediately — save happens in the background
    setStep(2);
    saveIntention.mutate({
      text: intentionMode === 'text' ? intentionText : null,
      localUri: intentionMode !== 'text' ? intentionLocalUri : null,
      mediaType: intentionMode,
      shareWithGroups,
    });
  }, [step1Ready, intentionMode, intentionText, intentionLocalUri, shareWithGroups, saveIntention]);

  // ---------------------------------------------------------------------------
  // Toggle goal expanded
  // ---------------------------------------------------------------------------

  const toggleGoalExpanded = useCallback((goalId: string) => {
    setExpandedGoalIds((prev) => {
      const next = new Set(prev);
      if (next.has(goalId)) {
        next.delete(goalId);
      } else {
        next.add(goalId);
      }
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Toggle sub-goal checked
  // ---------------------------------------------------------------------------

  const toggleSubGoal = useCallback((subGoalId: string) => {
    setCheckedSubGoalIds((prev) => {
      const next = new Set(prev);
      if (next.has(subGoalId)) {
        next.delete(subGoalId);
      } else {
        next.add(subGoalId);
      }
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Detect which goals will be completed by the checked sub-goals
  // ---------------------------------------------------------------------------

  const getCompletedGoals = useCallback((): GoalForCheckin[] => {
    return goals.filter((goal) => {
      const incompleteSubGoals = goal.sub_goals.filter((sg) => sg.status !== 'completed');
      if (incompleteSubGoals.length === 0) return false; // already complete
      return incompleteSubGoals.every((sg) => checkedSubGoalIds.has(sg.id));
    });
  }, [goals, checkedSubGoalIds]);

  // ---------------------------------------------------------------------------
  // Step 3 "Complete Check-In": log actions, detect completions, share intention
  // ---------------------------------------------------------------------------

  // Optimistic avg progress: factor in sub-goals checked in Step 2
  const optimisticAvgProgress = useMemo(() => {
    if (goals.length === 0) return insight?.avgProgress ?? 0;
    const total = goals.reduce((sum, g) => {
      const totalSgs = g.sub_goals.length;
      if (totalSgs === 0) return sum + (g.progress ?? 0);
      const alreadyCompleted = g.sub_goals.filter((sg) => sg.status === 'completed').length;
      const newlyChecked = g.sub_goals.filter(
        (sg) => sg.status !== 'completed' && checkedSubGoalIds.has(sg.id)
      ).length;
      const optimisticCompleted = Math.min(totalSgs, alreadyCompleted + newlyChecked);
      return sum + Math.round((optimisticCompleted / totalSgs) * 100);
    }, 0);
    return Math.round(total / goals.length);
  }, [goals, checkedSubGoalIds, insight?.avgProgress]);

  const handleDone = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const subGoalIds = Array.from(checkedSubGoalIds);

      // 1. Log checked actions + mark sub-goals completed
      if (subGoalIds.length > 0) {
        await logActions.mutateAsync(subGoalIds);
      }

      // 2. Notify groups for any goals now fully completed
      const completedGoals = getCompletedGoals();
      if (completedGoals.length > 0) {
        await Promise.allSettled(
          completedGoals
            .filter((g) => !!g.group_id)
            .map((g) =>
              supabase.functions.invoke('send-group-push', {
                body: {
                  group_id: g.group_id,
                  exclude_user_id: profile?.id,
                  title: '🏆 Goal completed!',
                  body: `${profile?.display_name ?? 'A teammate'} just completed "${g.title}"!`,
                  data: { type: 'goal_completed', goal_id: g.id, group_id: g.group_id },
                },
              })
            )
        );
      }

      // 3. Share intention to groups if toggled on
      if (shareWithGroups && groups.length > 0) {
        const shareText =
          intentionMode === 'text'
            ? intentionText.trim()
            : intentionMode === 'video'
            ? '📹 Shared a video intention for today'
            : '🎙️ Shared a voice intention for today';
        if (shareText) {
          const groupIds = groups.map((g) => g.id);
          await shareIntention.mutateAsync({ intentionText: shareText, groupIds });
        }
      }

      // 4. Always celebrate completing a check-in, then go to groups
      celebrate();
      router.replace('/(tabs)/groups');
    } catch (e) {
      // Captured by individual mutation onError handlers
      setSubmitting(false);
    }
  }, [
    submitting,
    checkedSubGoalIds,
    logActions,
    getCompletedGoals,
    celebrate,
    profile,
    shareWithGroups,
    intentionMode,
    intentionText,
    groups,
    shareIntention,
    router,
  ]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const streakUnit =
    profile?.checkin_cadence === 'weekly'
      ? 'wks'
      : profile?.checkin_cadence === 'every_2_days' || profile?.checkin_cadence === 'every_3_days'
      ? 'check-ins'
      : 'days';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header — step dots centered, X top-right */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 16,
          }}
        >
          {/* Spacer to balance the X button */}
          <View style={{ width: 36 }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <StepDots current={step} />
          </View>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: COLORS.borderLight,
            }}
            hitSlop={8}
          >
            <Feather name="x" size={16} color={COLORS.textSecondary} />
          </Pressable>
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* STEP 1 — Intention                                                  */}
        {/* ------------------------------------------------------------------ */}
        {step === 1 && (
          <>
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 16 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={{ fontSize: 26, fontWeight: '700', color: COLORS.text, marginBottom: 4 }}>
                Today's Intention
              </Text>
              <Text style={{ fontSize: 15, color: COLORS.textTertiary, marginBottom: 20 }}>
                Set the tone for your day.
              </Text>

              {/* Yesterday's intention — reflection context */}
              {yesterdaysIntention && (
                <View
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 16,
                    borderWidth: 1,
                    borderColor: COLORS.borderLight,
                    flexDirection: 'row',
                    gap: 10,
                  }}
                >
                  <Feather name="clock" size={14} color={COLORS.textTertiary} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.textTertiary, marginBottom: 3 }}>
                      YESTERDAY'S INTENTION
                    </Text>
                    <Text style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 }}>
                      {yesterdaysIntention.media_type === 'video'
                        ? '📹 You shared a video intention'
                        : yesterdaysIntention.media_type === 'voice'
                        ? '🎙️ You shared a voice intention'
                        : yesterdaysIntention.text}
                    </Text>
                  </View>
                </View>
              )}

              {/* Intention recorder — video (default), voice, or text */}
              <IntentionRecorder
                mode={intentionMode}
                text={intentionText}
                onModeChange={(m) => {
                  setIntentionMode(m);
                  setIntentionLocalUri(null);
                }}
                onTextChange={setIntentionText}
                onMediaCaptured={setIntentionLocalUri}
                onMediaCleared={() => setIntentionLocalUri(null)}
              />

              {/* Share with groups toggle */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#fff',
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: COLORS.borderLight,
                  padding: 14,
                  marginTop: 16,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    backgroundColor: COLORS.primary + '15',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Feather name="users" size={15} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>
                    Share with your groups
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.textTertiary, marginTop: 1 }}>
                    Group members will be notified
                  </Text>
                </View>
                <Switch
                  value={shareWithGroups}
                  onValueChange={setShareWithGroups}
                  trackColor={{ false: COLORS.borderLight, true: COLORS.primary + '80' }}
                  thumbColor={shareWithGroups ? COLORS.primary : '#fff'}
                  ios_backgroundColor={COLORS.borderLight}
                />
              </View>
            </ScrollView>

            {/* Pinned footer — [Back] + [Skip or Continue] */}
            <View
              style={{
                flexDirection: 'row',
                gap: 12,
                paddingHorizontal: 24,
                paddingTop: 12,
                paddingBottom: 20,
                backgroundColor: COLORS.background,
                borderTopWidth: 1,
                borderTopColor: COLORS.borderLight,
              }}
            >
              {/* Skip or Continue */}
              {step1Ready ? (
                <Pressable
                  onPress={handleStep1Next}
                  style={{
                    flex: 1,
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: COLORS.primary,
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>
                    Continue
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => setStep(2)}
                  style={{
                    flex: 1,
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1.5,
                    borderColor: COLORS.border,
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.textSecondary }}>
                    Skip
                  </Text>
                </Pressable>
              )}
            </View>
          </>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP 2 — Actions                                                     */}
        {/* ------------------------------------------------------------------ */}
        {step === 2 && (
          <View style={{ flex: 1 }}>
            <View style={{ paddingHorizontal: 24, marginBottom: 16 }}>
              <Text style={{ fontSize: 26, fontWeight: '700', color: COLORS.text, marginBottom: 4 }}>
                Check Off Actions
              </Text>
              <Text style={{ fontSize: 15, color: COLORS.textTertiary }}>
                What did you work on today?
              </Text>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
              showsVerticalScrollIndicator={false}
            >
              {goalsLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <ActivityIndicator color={COLORS.primary} />
                </View>
              ) : goals.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Feather name="target" size={32} color={COLORS.borderLight} />
                  <Text style={{ color: COLORS.textTertiary, fontSize: 15, marginTop: 12 }}>
                    No active goals
                  </Text>
                </View>
              ) : (
                goals.map((goal) => {
                  const incompleteSubGoals = goal.sub_goals.filter(
                    (sg) => sg.status !== 'completed'
                  );
                  const isExpanded = expandedGoalIds.has(goal.id);
                  const checkedCount = incompleteSubGoals.filter((sg) =>
                    checkedSubGoalIds.has(sg.id)
                  ).length;

                  return (
                    <GoalCheckinCard
                      key={goal.id}
                      goal={goal}
                      incompleteSubGoals={incompleteSubGoals}
                      isExpanded={isExpanded}
                      checkedSubGoalIds={checkedSubGoalIds}
                      checkedCount={checkedCount}
                      onToggleExpand={() => toggleGoalExpanded(goal.id)}
                      onToggleSubGoal={toggleSubGoal}
                    />
                  );
                })
              )}
            </ScrollView>

            {/* Next button — pinned at bottom */}
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: 20,
                paddingBottom: Platform.OS === 'ios' ? 28 : 20,
                backgroundColor: COLORS.background,
                borderTopWidth: 1,
                borderTopColor: COLORS.borderLight,
              }}
            >
              {checkedSubGoalIds.size > 0 && (
                <Text
                  style={{
                    textAlign: 'center',
                    fontSize: 13,
                    color: COLORS.primary,
                    fontWeight: '600',
                    marginBottom: 10,
                  }}
                >
                  {checkedSubGoalIds.size} action{checkedSubGoalIds.size !== 1 ? 's' : ''} selected
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {/* Back */}
                <Pressable
                  onPress={() => setStep(1)}
                  style={{
                    width: 52,
                    borderRadius: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1.5,
                    borderColor: COLORS.border,
                  }}
                >
                  <Feather name="arrow-left" size={18} color={COLORS.textSecondary} />
                </Pressable>

                {/* Skip or Next */}
                {checkedSubGoalIds.size > 0 ? (
                  <Pressable
                    onPress={() => setStep(3)}
                    style={{
                      flex: 1,
                      borderRadius: 16,
                      paddingVertical: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: COLORS.primary,
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}>Next</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => setStep(3)}
                    style={{
                      flex: 1,
                      borderRadius: 16,
                      paddingVertical: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#FFFFFF',
                      borderWidth: 1.5,
                      borderColor: COLORS.border,
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.textSecondary }}>Skip</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP 3 — Insight                                                     */}
        {/* ------------------------------------------------------------------ */}
        {step === 3 && (
          <View style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={{ fontSize: 26, fontWeight: '700', color: COLORS.text, marginBottom: 4 }}>
              Your Progress
            </Text>
            <Text style={{ fontSize: 15, color: COLORS.textTertiary, marginBottom: 28 }}>
              Here's where you stand.
            </Text>

            {/* Stat cards — 2×2 grid */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              <StatCard
                icon="zap"
                color="#F59E0B"
                bg="#FEF3C7"
                value={profile?.streak_current ?? 0}
                label={`${streakUnit} streak`}
              />
              <StatCard
                icon="check-square"
                color="#16A34A"
                bg="#DCFCE7"
                value={insight?.checkinsThisWeek ?? 0}
                label="check-ins this week"
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 28 }}>
              <StatCard
                icon="target"
                color={COLORS.primary}
                bg={COLORS.primary + '15'}
                value={insight?.activeGoalCount ?? 0}
                label="active goals"
              />
              <StatCard
                icon="trending-up"
                color="#8B5CF6"
                bg="#EDE9FE"
                value={`${optimisticAvgProgress}%`}
                label="avg. goal progress"
              />
            </View>

            {/* Motivational message */}
            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 16,
                padding: 20,
                borderWidth: 1,
                borderColor: COLORS.borderLight,
                alignItems: 'center',
                marginBottom: 32,
              }}
            >
              <Text style={{ fontSize: 28, marginBottom: 10 }}>🌟</Text>
              <Text
                style={{
                  fontSize: 15,
                  color: COLORS.textSecondary,
                  textAlign: 'center',
                  lineHeight: 22,
                  fontWeight: '500',
                }}
              >
                {getMotivationalMessage(
                  profile?.streak_current ?? 0,
                  insight?.avgProgress ?? 0
                )}
              </Text>
            </View>

          </ScrollView>

          {/* Pinned footer — [Back] + [Complete Check-In] */}
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              flexDirection: 'row',
              gap: 12,
              padding: 20,
              paddingBottom: Platform.OS === 'ios' ? 28 : 20,
              backgroundColor: COLORS.background,
              borderTopWidth: 1,
              borderTopColor: COLORS.borderLight,
            }}
          >
            <Pressable
              onPress={() => setStep(2)}
              style={{
                width: 52,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#FFFFFF',
                borderWidth: 1.5,
                borderColor: COLORS.border,
              }}
            >
              <Feather name="arrow-left" size={18} color={COLORS.textSecondary} />
            </Pressable>
            <Pressable
              onPress={handleDone}
              disabled={submitting}
              style={{
                flex: 1,
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: submitting ? COLORS.borderLight : COLORS.primary,
              }}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}>Complete Check-In</Text>
              )}
            </Pressable>
          </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// GoalCheckinCard — collapsible goal card with sub-goal checkboxes
// ---------------------------------------------------------------------------

interface GoalCheckinCardProps {
  goal: GoalForCheckin;
  incompleteSubGoals: SubGoal[];
  isExpanded: boolean;
  checkedSubGoalIds: Set<string>;
  checkedCount: number;
  onToggleExpand: () => void;
  onToggleSubGoal: (id: string) => void;
}

function GoalCheckinCard({
  goal,
  incompleteSubGoals,
  isExpanded,
  checkedSubGoalIds,
  checkedCount,
  onToggleExpand,
  onToggleSubGoal,
}: GoalCheckinCardProps) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: checkedCount > 0 ? COLORS.primary + '40' : COLORS.borderLight,
        marginBottom: 12,
        overflow: 'hidden',
      }}
    >
      {/* Goal header row */}
      <Pressable
        onPress={onToggleExpand}
        style={{ padding: 16 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text
              style={{ fontSize: 15, fontWeight: '600', color: COLORS.text, lineHeight: 20 }}
              numberOfLines={2}
            >
              {goal.title}
            </Text>
            <Text style={{ fontSize: 12, color: COLORS.textTertiary, marginTop: 2 }}>
              {Math.round(goal.progress ?? 0)}% complete
              {checkedCount > 0 ? ` · ${checkedCount} selected` : ''}
            </Text>
          </View>
          <Feather
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={COLORS.textTertiary}
          />
        </View>
        <ProgressBar value={goal.progress ?? 0} />
      </Pressable>

      {/* Sub-goals list */}
      {isExpanded && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: COLORS.borderLight,
          }}
        >
          {incompleteSubGoals.length === 0 ? (
            <View style={{ padding: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: COLORS.textTertiary }}>
                All actions complete 🎉
              </Text>
            </View>
          ) : (
            incompleteSubGoals.map((sg, idx) => {
              const checked = checkedSubGoalIds.has(sg.id);
              return (
                <Pressable
                  key={sg.id}
                  onPress={() => onToggleSubGoal(sg.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    backgroundColor: checked ? COLORS.primary + '08' : 'transparent',
                    borderTopWidth: idx === 0 ? 0 : 1,
                    borderTopColor: COLORS.borderLight,
                  }}
                >
                  {/* Checkbox */}
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      borderWidth: checked ? 0 : 1.5,
                      borderColor: checked ? undefined : COLORS.border,
                      backgroundColor: checked ? COLORS.primary : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                      flexShrink: 0,
                    }}
                  >
                    {checked && <Feather name="check" size={13} color="#fff" />}
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 14,
                      color: checked ? COLORS.primary : COLORS.text,
                      fontWeight: checked ? '600' : '400',
                      lineHeight: 20,
                      textDecorationLine: checked ? 'line-through' : 'none',
                    }}
                  >
                    {sg.title}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}
