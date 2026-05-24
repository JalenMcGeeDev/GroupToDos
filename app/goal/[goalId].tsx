import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  RefreshControl,
  Platform,
  Modal,
  KeyboardAvoidingView,
  Image,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useGoal, useUpdateSubGoal, useUpdateGoal, useCreateSubGoal, useDeleteGoal, computeProgressFromTree } from '../../hooks/use-goals';
import { useGoalShares, useShareGoalToGroup, useUnshareGoalFromGroup } from '../../hooks/use-my-goals';
import { useGroups } from '../../hooks/use-groups';
import { useGoalReminders, useAddReminder, useDeleteReminder } from '../../hooks/use-reminders';
import { useHelpRequests, useAskForHelp, useResolveHelp } from '../../hooks/use-help-requests';
import { useHelpOffers, useOfferHelp, useDeleteHelpOffer } from '../../hooks/use-help-offers';
import { useAddReaction } from '../../hooks/use-reactions';
import { useMarkGoalViewed } from '../../hooks/use-goal-views';
import { SubGoalTree } from '../../components/SubGoalTree';
import { GoalFireAnimation } from '../../components/GoalFireAnimation';
import { GoalGallery, GoalGalleryRef } from '../../components/GoalGallery';
import { ReactionBar } from '../../components/ReactionBar';
import { ReactionPicker } from '../../components/ReactionPicker';
import { useAuthStore } from '../../stores/auth-store';
import { supabase } from '../../lib/supabase';
import { useCelebrationStore } from '../../stores/celebration-store';
import { COLORS } from '../../constants';
import { useAlert } from '../../components/AlertProvider';
import type { SubGoal, Group, HelpRequest } from '../../lib/types';

const FIRE_STAGE_INFO = [
  {
    progress: 0,
    lastActionAt: null as null,
    label: 'Cold',
    description: 'No recent activity. Log an action to get the fire started.',
  },
  {
    progress: 30,
    lastActionAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    label: 'Warming Up',
    description: 'Some progress or recent activity. Keep the momentum going.',
  },
  {
    progress: 60,
    lastActionAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    label: 'On Fire',
    description: 'Steady progress with consistent activity. You\u2019re building momentum!',
  },
  {
    progress: 95,
    lastActionAt: new Date().toISOString(),
    label: 'Blazing',
    description: 'High progress and very recent activity. You\u2019re absolutely crushing it!',
  },
];

export default function PersonalGoalDetailScreen() {
  const { goalId, groupId, section } = useLocalSearchParams<{ goalId: string; groupId?: string; section?: string }>();
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const isGroupContext = !!groupId;

  const { data: goal, isLoading, refetch } = useGoal(goalId!);
  const updateSubGoal = useUpdateSubGoal();
  const updateGoal = useUpdateGoal();
  const createSubGoal = useCreateSubGoal();
  const deleteGoal = useDeleteGoal();
  const { data: shares = [] } = useGoalShares(goalId!);
  const { data: groups = [] } = useGroups();
  const shareGoal = useShareGoalToGroup();
  const unshareGoal = useUnshareGoalFromGroup();

  // Requests & offers — always fetched for the goal (across all groups)
  const { data: helpRequests = [] } = useHelpRequests(goalId!);
  const { data: helpOffers = [] } = useHelpOffers(goalId!);
  const askForHelp = useAskForHelp();
  const resolveHelp = useResolveHelp();
  const offerHelp = useOfferHelp();
  const deleteHelpOffer = useDeleteHelpOffer();
  const addReaction = useAddReaction();
  const markGoalViewed = useMarkGoalViewed();
  const { data: reminders = [] } = useGoalReminders(goalId!);
  const addReminder = useAddReminder();
  const deleteReminder = useDeleteReminder();

  const isOwner = !isGroupContext || (goal ? currentUser?.id === goal.created_by : false);

  // Mark goal as viewed when a non-owner opens it in group context
  useEffect(() => {
    if (isGroupContext && goalId) {
      markGoalViewed.mutate(goalId);
    }
  }, [goalId, isGroupContext]);

  // Edit drafts
  const [titleDraft, setTitleDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  React.useEffect(() => {
    if (goal) {
      setTitleDraft(goal.title);
      setDescriptionDraft(goal.description ?? '');
    }
  }, [goal?.id, goal?.title, goal?.description]);

  // Help/offer modal state
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpNote, setHelpNote] = useState('');
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerNote, setOfferNote] = useState('');
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showFireInfo, setShowFireInfo] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  // Goal due date picker state
  const [showGoalDatePicker, setShowGoalDatePicker] = useState(false);
  const [tempGoalDate, setTempGoalDate] = useState<Date>(new Date());

  // Action due date picker state
  const [showActionDatePicker, setShowActionDatePicker] = useState(false);
  const [selectedSubGoal, setSelectedSubGoal] = useState<SubGoal | null>(null);
  const [tempActionDate, setTempActionDate] = useState<Date>(new Date());

  // Reminder picker state
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [tempReminderDate, setTempReminderDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  });
  const [reminderPickerStep, setReminderPickerStep] = useState<'date' | 'time'>('date');

  const [newActionTitle, setNewActionTitle] = useState('');
  const [showActionInput, setShowActionInput] = useState(false);
  const actionInputRef = useRef<any>(null);
  const descriptionInputRef = useRef<any>(null);
  const galleryRef = useRef<GoalGalleryRef>(null);
  const scrollViewRef = useRef<import('react-native').ScrollView>(null);
  const pendingScrollSection = useRef<string | null>(section ?? null);
  const highlightAnim = useRef(new Animated.Value(0)).current;
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
  const { showAlert } = useAlert();

  // When a section pill is tapped we arrive with a `section` param.
  // We store it as a pending scroll target and clear it once we've scrolled,
  // so it doesn't re-trigger on subsequent renders.
  useEffect(() => {
    if (section) pendingScrollSection.current = section;
  }, [section]);

  const scrollToSection = (key: string, y: number) => {
    if (pendingScrollSection.current === key) {
      pendingScrollSection.current = null;
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y, animated: true });
        setHighlightedSection(key);
        highlightAnim.setValue(0);
        Animated.sequence([
          Animated.timing(highlightAnim, { toValue: 1, duration: 350, useNativeDriver: false }),
          Animated.delay(700),
          Animated.timing(highlightAnim, { toValue: 0, duration: 600, useNativeDriver: false }),
        ]).start(() => setHighlightedSection(null));
      }, 50);
    }
  };

  const highlightBorderColor = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#ECE7E1', '#D97757'],
  });
  const highlightBgColor = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FFFFFF', '#FEF4F0'],
  });

  // Compute progress client-side from sub_goals so fire + progress bar stay in sync with optimistic updates
  const liveProgress = goal ? computeProgressFromTree(goal.sub_goals ?? []) : 0;

  const sharedGroupIds = new Set(shares.map((s) => s.group_id));
  const availableGroups = groups.filter((g) => !sharedGroupIds.has(g.id));

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const celebrate = useCelebrationStore((s) => s.show);

  const handleToggleSubGoal = (subGoal: SubGoal) => {
    const newStatus = subGoal.status === 'completed' ? 'in_progress' : 'completed';

    // Check optimistically if this toggle will complete all sub-goals
    const willCompleteAll =
      newStatus === 'completed' &&
      (goal?.sub_goals ?? []).every((s) => s.id === subGoal.id || s.status === 'completed');

    const notifyGroupId = groupId ?? goal?.group_id ?? null;

    updateSubGoal.mutate(
      { subGoalId: subGoal.id, updates: { status: newStatus } },
      {
        onSuccess: () => {
          if (willCompleteAll) {
            celebrate();
            if (notifyGroupId) {
              const name = currentUser?.user_metadata?.display_name ?? 'A teammate';
              supabase.functions.invoke('send-group-push', {
                body: {
                  group_id: notifyGroupId,
                  exclude_user_id: currentUser?.id ?? '',
                  title: '🏆 Goal completed!',
                  body: `${name} just completed a goal. Come congratulate them!`,
                  data: { type: 'goal_completed', group_id: notifyGroupId, goal_id: goalId },
                },
              }).catch(() => {/* non-blocking */});
            }
          }
        },
        onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }),
      },
    );
  };

  const handleShare = (group: Group) => {
    shareGoal.mutate(
      { goalId: goalId!, groupId: group.id },
      { onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }) }
    );
  };

  const handleUnshare = (groupId: string) => {
    showAlert({
      title: 'Remove from group?',
      message: 'This goal will no longer be visible in that group.',
      icon: 'alert-circle',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => unshareGoal.mutate({ goalId: goalId!, groupId }),
        },
      ],
    });
  };

  const openGoalDatePicker = () => {
    setTempGoalDate(goal?.end_date ? new Date(goal.end_date) : new Date());
    setShowGoalDatePicker(true);
  };

  const onGoalDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowGoalDatePicker(false);
      if (selected) {
        const d = new Date(selected);
        d.setHours(9, 0, 0, 0);
        updateGoal.mutate(
          { goalId: goalId!, updates: { end_date: d.toISOString() } },
          { onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }) }
        );
      }
    } else if (selected) {
      setTempGoalDate(selected);
    }
  };

  const confirmGoalDate = () => {
    const d = new Date(tempGoalDate);
    d.setHours(9, 0, 0, 0);
    updateGoal.mutate(
      { goalId: goalId!, updates: { end_date: d.toISOString() } },
      { onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }) }
    );
    setShowGoalDatePicker(false);
  };

  const handleActionDueDatePress = (subGoal: SubGoal) => {
    setSelectedSubGoal(subGoal);
    setTempActionDate(subGoal.due_date ? new Date(subGoal.due_date) : new Date());
    setShowActionDatePicker(true);
  };

  const onActionDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowActionDatePicker(false);
      if (selected && selectedSubGoal) {
        const dateStr = selected.toISOString().split('T')[0];
        updateSubGoal.mutate(
          { subGoalId: selectedSubGoal.id, updates: { due_date: dateStr } },
          { onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }) }
        );
        setSelectedSubGoal(null);
      }
    } else if (selected) {
      setTempActionDate(selected);
    }
  };

  const confirmActionDate = () => {
    if (selectedSubGoal) {
      const dateStr = tempActionDate.toISOString().split('T')[0];
      updateSubGoal.mutate(
        { subGoalId: selectedSubGoal.id, updates: { due_date: dateStr } },
        { onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }) }
      );
    }
    setShowActionDatePicker(false);
    setSelectedSubGoal(null);
  };

  const onReminderDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowReminderPicker(false);
      if (selected) {
        const d = new Date(selected);
        d.setHours(tempReminderDate.getHours(), tempReminderDate.getMinutes(), 0, 0);
        setTempReminderDate(d);
        setReminderPickerStep('time');
        setShowReminderPicker(true);
      }
    } else if (selected) {
      setTempReminderDate(selected);
    }
  };

  const onReminderTimeChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowReminderPicker(false);
      setReminderPickerStep('date');
      if (selected) {
        const d = new Date(tempReminderDate);
        d.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        addReminder.mutate(
          { goalId: goalId!, remindAt: d },
          {
            onError: (err) => showAlert({
              title: 'Could not set reminder',
              message: (err as Error).message ?? 'Please try again.',
              icon: 'alert-circle',
              buttons: [{ text: 'OK' }],
            }),
          }
        );
      }
    } else if (selected) {
      setTempReminderDate(selected);
    }
  };

  const confirmReminderDate = () => {
    setReminderPickerStep('time');
  };

  const confirmReminderTime = () => {
    setShowReminderPicker(false);
    setReminderPickerStep('date');
    addReminder.mutate(
      { goalId: goalId!, remindAt: tempReminderDate },
      {
        onError: (err) => showAlert({
          title: 'Could not set reminder',
          message: (err as Error).message ?? 'Please try again.',
          icon: 'alert-circle',
          buttons: [{ text: 'OK' }],
        }),
      }
    );
  };

  const handleAddAction = () => {
    const title = newActionTitle.trim();
    if (!title || !goal) return;
    createSubGoal.mutate(
      { goalId: goal.id, title },
      {
        onSuccess: () => setNewActionTitle(''),
        onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }),
      }
    );
  };

  if (isLoading || !goal) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <Text className="text-gray-400">{isLoading ? 'Loading...' : 'Goal not found'}</Text>
      </SafeAreaView>
    );
  }

  const completedActions = goal.sub_goals?.filter((s) => s.status === 'completed').length ?? 0;
  const totalActions = goal.sub_goals?.length ?? 0;
  const homeGroup = !isGroupContext && goal.group_id ? groups.find((g) => g.id === goal.group_id) : null;
  const totalShared = (homeGroup ? 1 : 0) + shares.length;

  const sectionTitleStyle = { fontSize: 13, fontWeight: '600' as const, color: COLORS.textSecondary, letterSpacing: 0.2 };
  const cardStyle = {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  };
  const cardActionTextStyle = { fontSize: 13, fontWeight: '600' as const, color: COLORS.primary };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['top', 'left', 'right']}>
      {/* Top bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
        <Pressable
          style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}
          onPress={() => {
            if (isGroupContext) {
              router.back();
            } else {
              router.navigate('/(tabs)' as any);
            }
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => setShowFireInfo(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <GoalFireAnimation progress={liveProgress} lastActionAt={goal.last_action_at} size={36} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — title + meta */}
        <View style={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 20 }}>
          {isOwner ? (
            <TextInput
              style={{ fontSize: 30, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5, lineHeight: 36, padding: 0 }}
              value={titleDraft}
              onChangeText={setTitleDraft}
              onBlur={() => {
                const trimmed = titleDraft.trim();
                if (trimmed && trimmed !== goal.title) {
                  updateGoal.mutate({ goalId: goal.id, updates: { title: trimmed } });
                } else if (!trimmed) {
                  setTitleDraft(goal.title);
                }
              }}
              multiline
              blurOnSubmit
              returnKeyType="done"
            />
          ) : (
            <Text style={{ fontSize: 30, fontWeight: '700', color: COLORS.text, letterSpacing: -0.5, lineHeight: 36 }}>
              {goal.title}
            </Text>
          )}

          {/* Creator strip (group context) */}
          {isGroupContext && goal.creator_profile && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
              {goal.creator_profile.avatar_url ? (
                <Image source={{ uri: goal.creator_profile.avatar_url }} style={{ width: 22, height: 22, borderRadius: 11 }} />
              ) : (
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.borderLight, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, color: COLORS.textSecondary, fontWeight: '600' }}>
                    {goal.creator_profile.display_name?.charAt(0)?.toUpperCase() ?? '?'}
                  </Text>
                </View>
              )}
              <Text style={{ fontSize: 14, color: COLORS.textSecondary, marginLeft: 8 }}>
                {goal.creator_profile.display_name}
              </Text>
            </View>
          )}

          {/* Progress */}
          {totalActions > 0 && (
            <View style={{ marginTop: 18 }}>
              <View style={{ height: 6, backgroundColor: COLORS.borderLight, borderRadius: 3, overflow: 'hidden' }}>
                <View
                  style={{
                    width: `${liveProgress}%`,
                    height: '100%',
                    backgroundColor: COLORS.primary,
                    borderRadius: 3,
                  }}
                />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                <Text style={{ fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' }}>
                  {completedActions} of {totalActions} actions
                </Text>
                <View style={{ flex: 1 }} />
                <Text style={{ fontSize: 13, color: COLORS.text, fontWeight: '600' }}>{Math.round(liveProgress)}%</Text>
              </View>
            </View>
          )}
        </View>

        {/* Description card */}
        {(isOwner || goal.description) && (
          <View style={cardStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Text style={[sectionTitleStyle, { flex: 1 }]}>Description</Text>
              {isOwner && descriptionDraft.trim() !== (goal.description ?? '') ? (
                <Pressable
                  onPress={() => {
                    const trimmed = descriptionDraft.trim();
                    updateGoal.mutate({ goalId: goal.id, updates: { description: trimmed || null } });
                  }}
                >
                  <Text style={cardActionTextStyle}>Save</Text>
                </Pressable>
              ) : null}
            </View>
            {isOwner ? (
              <TextInput
                ref={descriptionInputRef}
                style={{ fontSize: 16, color: COLORS.text, lineHeight: 22, padding: 0 }}
                placeholder="Add a description..."
                placeholderTextColor={COLORS.textTertiary}
                value={descriptionDraft}
                onChangeText={setDescriptionDraft}
                multiline
                blurOnSubmit={false}
              />
            ) : (
              <Text style={{ fontSize: 16, color: COLORS.text, lineHeight: 22 }}>{goal.description}</Text>
            )}
          </View>
        )}

        {/* Actions card */}
        <Animated.View
          style={[
            cardStyle,
            highlightedSection === 'actions' && { borderColor: highlightBorderColor, backgroundColor: highlightBgColor },
          ]}
          onLayout={e => scrollToSection('actions', e.nativeEvent.layout.y)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={sectionTitleStyle}>Actions</Text>
            {totalActions > 0 && (
              <View style={{ marginLeft: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: COLORS.borderLight }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.textSecondary }}>{completedActions}/{totalActions}</Text>
              </View>
            )}
            <View style={{ flex: 1 }} />
            {isOwner && (
              <Pressable onPress={() => { setNewActionTitle(''); setShowActionInput(true); setTimeout(() => actionInputRef.current?.focus(), 50); }}>
                <Text style={cardActionTextStyle}>+ Add</Text>
              </Pressable>
            )}
          </View>

          {isOwner && showActionInput && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <TextInput
                ref={actionInputRef}
                style={{
                  flex: 1,
                  backgroundColor: COLORS.borderLight,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 15,
                  color: COLORS.text,
                }}
                placeholder="Action title..."
                placeholderTextColor={COLORS.textTertiary}
                value={newActionTitle}
                onChangeText={setNewActionTitle}
                onSubmitEditing={() => { handleAddAction(); setShowActionInput(false); }}
                onBlur={() => { if (!newActionTitle.trim()) setShowActionInput(false); }}
                returnKeyType="done"
                autoFocus
              />
              {newActionTitle.trim().length > 0 && (
                <Pressable
                  style={{ marginLeft: 8, width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary }}
                  onPress={() => { handleAddAction(); setShowActionInput(false); }}
                >
                  <Feather name="plus" size={18} color="#FFF" />
                </Pressable>
              )}
            </View>
          )}

          {totalActions > 0 ? (
            <SubGoalTree
              subGoals={goal.sub_goals ?? []}
              onToggle={isOwner ? handleToggleSubGoal : undefined}
              onDueDatePress={isOwner ? handleActionDueDatePress : undefined}
            />
          ) : (
            !showActionInput && (
              <Text style={{ fontSize: 14, color: COLORS.textTertiary, paddingVertical: 4 }}>No actions yet</Text>
            )
          )}
        </Animated.View>

        {/* Due date card */}
        <View style={cardStyle}>
          <Text style={[sectionTitleStyle, { marginBottom: 4 }]}>Due date</Text>
          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}
            onPress={isOwner ? openGoalDatePicker : undefined}
          >
            <Feather name="calendar" size={15} color={COLORS.textTertiary} style={{ width: 20 }} />
            <Text style={{ flex: 1, fontSize: 15, color: COLORS.text, marginLeft: 10 }}>
              {goal.end_date
                ? new Date(goal.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : 'No due date'}
            </Text>
            {isOwner && <Feather name="chevron-right" size={16} color={COLORS.textTertiary} />}
          </Pressable>

          {goal.tangible_reward && (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.borderLight }}>
              <Feather name="gift" size={15} color={COLORS.textTertiary} style={{ width: 20 }} />
              <Text style={{ flex: 1, fontSize: 15, color: COLORS.text, marginLeft: 10 }}>{goal.tangible_reward}</Text>
            </View>
          )}
        </View>

        {/* Reminders card — owner only */}
        {isOwner && (
          <View style={cardStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={[sectionTitleStyle, { flex: 1 }]}>Reminders</Text>
              <Pressable
                onPress={() => {
                  const d = new Date();
                  d.setHours(d.getHours() + 1, 0, 0, 0);
                  setTempReminderDate(d);
                  setReminderPickerStep('date');
                  setShowReminderPicker(true);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={cardActionTextStyle}>+ Add</Text>
              </Pressable>
            </View>

            {reminders.length === 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
                <Feather name="bell" size={15} color={COLORS.textTertiary} style={{ width: 20 }} />
                <Text style={{ flex: 1, fontSize: 15, color: COLORS.textTertiary, marginLeft: 10 }}>No reminders</Text>
              </View>
            ) : (
              reminders.map((r, i) => {
                const date = new Date(r.remind_at);
                const isPast = date < new Date();
                return (
                  <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: COLORS.borderLight }}>
                    <Feather name="bell" size={15} color={isPast ? COLORS.textTertiary : COLORS.textSecondary} style={{ width: 20 }} />
                    <Text style={{ flex: 1, fontSize: 15, color: isPast ? COLORS.textTertiary : COLORS.text, marginLeft: 10 }}>
                      {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {'  ·  '}
                      {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      {isPast ? '  ·  Past' : ''}
                    </Text>
                    <Pressable
                      onPress={() => deleteReminder.mutate({ reminder: r })}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="x" size={16} color={COLORS.textTertiary} />
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* Groups card — personal context only */}
        {!isGroupContext && (
          <View style={cardStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text style={sectionTitleStyle}>Shared with</Text>
              {totalShared > 0 ? (
                <View style={{ marginLeft: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: '#E6F4EA' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#15803D' }}>{totalShared} group{totalShared === 1 ? '' : 's'}</Text>
                </View>
              ) : groups.length > 0 ? (
                <View style={{ marginLeft: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: COLORS.borderLight }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.textSecondary }}>Private</Text>
                </View>
              ) : null}
            </View>

            {homeGroup && (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#E6F4EA', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="check" size={16} color="#15803D" />
                </View>
                <Text style={{ flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '500', marginLeft: 12 }}>{homeGroup.name}</Text>
                <Text style={{ fontSize: 12, color: COLORS.textTertiary }}>Created here</Text>
              </View>
            )}

            {shares.map((share) => (
              <View key={share.group_id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#E6F4EA', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="check" size={16} color="#15803D" />
                </View>
                <Text style={{ flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '500', marginLeft: 12 }}>
                  {share.group?.name ?? 'Unknown Group'}
                </Text>
                <Pressable onPress={() => handleUnshare(share.group_id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={16} color={COLORS.textTertiary} />
                </Pressable>
              </View>
            ))}

            {availableGroups.filter((g) => g.id !== goal.group_id).map((group) => (
              <Pressable
                key={group.id}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}
                onPress={() => handleShare(group)}
              >
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: COLORS.borderLight, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="users" size={16} color={COLORS.textTertiary} />
                </View>
                <Text style={{ flex: 1, fontSize: 15, color: COLORS.textSecondary, marginLeft: 12 }}>{group.name}</Text>
                <Feather name="plus-circle" size={20} color={COLORS.primary} />
              </Pressable>
            ))}

            {groups.length === 0 && (
              <Text style={{ fontSize: 14, color: COLORS.textTertiary, textAlign: 'center', paddingVertical: 12 }}>
                Join a group to share this goal
              </Text>
            )}
          </View>
        )}

        {/* Gallery card */}
        <Animated.View
          style={[
            cardStyle,
            highlightedSection === 'gallery' && { borderColor: highlightBorderColor, backgroundColor: highlightBgColor },
          ]}
          onLayout={e => scrollToSection('gallery', e.nativeEvent.layout.y)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[sectionTitleStyle, { flex: 1 }]}>Gallery</Text>
            {isOwner && (
              <Pressable onPress={() => galleryRef.current?.addPhoto()}>
                <Text style={cardActionTextStyle}>+ Add photo</Text>
              </Pressable>
            )}
          </View>
          <GoalGallery ref={galleryRef} goalId={goal.id} isCreator={isOwner} />
        </Animated.View>

        {/* Requests card */}
        <Animated.View
          style={[
            cardStyle,
            highlightedSection === 'help' && { borderColor: highlightBorderColor, backgroundColor: highlightBgColor },
          ]}
          onLayout={e => scrollToSection('help', e.nativeEvent.layout.y)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[sectionTitleStyle, { flex: 1 }]}>Requests for help</Text>
            {isGroupContext && isOwner && (
              <Pressable onPress={() => { setHelpNote(''); setShowHelpModal(true); }}>
                <Text style={cardActionTextStyle}>+ Request help</Text>
              </Pressable>
            )}
          </View>

          {helpRequests.length > 0 ? (
            <View style={{ gap: 14 }}>
              {helpRequests.map((req) => (
                <View key={req.id} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#FBE7DD', alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="help-circle" size={16} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.text }}>
                        {req.requester_profile?.display_name ?? 'Someone'} needs help
                      </Text>
                      {req.group && (
                        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: COLORS.borderLight }}>
                          <Text style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' }}>{req.group.name}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 2, lineHeight: 19 }} numberOfLines={3}>
                      {req.note}
                    </Text>
                  </View>
                  {isOwner && (
                    <Pressable
                      style={{ marginLeft: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: '#E6F4EA' }}
                      onPress={() => {
                        showAlert({
                          title: 'Resolve Help Request',
                          message: 'Mark this help request as resolved?',
                          icon: 'check-circle',
                          buttons: [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Resolve', style: 'default', onPress: () => resolveHelp.mutate(req.id) },
                          ],
                        });
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#15803D' }}>Resolve</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: 14, color: COLORS.textTertiary, paddingVertical: 4, textAlign: 'center' }}>No active requests</Text>
          )}
        </Animated.View>

        {/* Offers card */}
        <View style={cardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[sectionTitleStyle, { flex: 1 }]}>Offers of help</Text>
            {helpOffers.length > 0 && (
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: '#CCFBF1' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#0F766E' }}>{helpOffers.length}</Text>
              </View>
            )}
          </View>

          {helpOffers.length > 0 && (
            <View style={{ gap: 12 }}>
              {helpOffers.map((offer) => (
                <View key={offer.id} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="life-buoy" size={16} color="#0D9488" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.text }}>
                        {offer.offerer_profile?.display_name ?? 'Someone'}
                      </Text>
                      {offer.group && (
                        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: COLORS.borderLight }}>
                          <Text style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' }}>{offer.group.name}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 2, lineHeight: 19 }}>{offer.note}</Text>
                  </View>
                  {offer.offered_by === currentUser?.id && (
                    <Pressable
                      onPress={() =>
                        showAlert({
                          title: 'Delete Offer',
                          message: 'Remove your offer of help?',
                          icon: 'trash-2',
                          buttons: [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: () => deleteHelpOffer.mutate(offer.id),
                            },
                          ],
                        })
                      }
                      hitSlop={8}
                      style={{ padding: 4, marginLeft: 4 }}
                    >
                      <Feather name="trash-2" size={15} color={COLORS.textTertiary} />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}

          {!isOwner && (
            <Pressable
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                paddingVertical: 12,
                marginTop: helpOffers.length > 0 ? 12 : 0,
                borderTopWidth: helpOffers.length > 0 ? 1 : 0,
                borderTopColor: COLORS.borderLight,
              }}
              onPress={() => { setOfferNote(''); setShowOfferModal(true); }}
            >
              <Feather name="plus" size={14} color="#0D9488" />
              <Text style={{ fontSize: 14, fontWeight: '600', marginLeft: 6, color: '#0D9488' }}>Offer help</Text>
            </Pressable>
          )}

          {isOwner && helpOffers.length === 0 && (
            <Text style={{ fontSize: 14, color: COLORS.textTertiary, textAlign: 'center', paddingVertical: 4 }}>No offers yet</Text>
          )}
        </View>

        {/* Delete Goal — bottom of page, owner only */}
        {isOwner && (
          <Pressable
            onPress={() => {
              showAlert({
                title: 'Delete Goal',
                message: `Are you sure you want to delete "${goal.title}"?`,
                icon: 'trash-2',
                buttons: [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => deleteGoal.mutate(goal.id, {
                      onSuccess: () => router.back(),
                      onError: (err: any) => showAlert({
                        title: 'Delete failed',
                        message: err.message ?? 'Could not delete goal.',
                        icon: 'alert-circle',
                        buttons: [{ text: 'OK' }],
                      }),
                    }),
                  },
                ],
              });
            }}
            style={{ alignItems: 'center', paddingVertical: 24 }}
          >
            <Text style={{ fontSize: 13, color: COLORS.textTertiary, fontWeight: '500' }}>Delete Goal</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* iOS Reminder Date Picker Modal */}
      {Platform.OS === 'ios' && showReminderPicker && reminderPickerStep === 'date' && (
        <Modal transparent animationType="slide">
          <View className="flex-1 justify-end bg-black/30">
            <View className="bg-white rounded-t-3xl px-6 pt-4 pb-8">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-base font-semibold text-gray-900">Reminder date</Text>
                <Pressable onPress={confirmReminderDate}>
                  <Text style={{ color: COLORS.primary }} className="text-base font-semibold">Next</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={tempReminderDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_, d) => d && setTempReminderDate(d)}
              />
            </View>
          </View>
        </Modal>
      )}
      {Platform.OS === 'android' && showReminderPicker && reminderPickerStep === 'date' && (
        <DateTimePicker value={tempReminderDate} mode="date" minimumDate={new Date()} onChange={onReminderDateChange} />
      )}

      {/* iOS Reminder Time Picker Modal */}
      {Platform.OS === 'ios' && showReminderPicker && reminderPickerStep === 'time' && (
        <Modal transparent animationType="slide">
          <View className="flex-1 justify-end bg-black/30">
            <View className="bg-white rounded-t-3xl px-6 pt-4 pb-8">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-base font-semibold text-gray-900">Reminder time</Text>
                <Pressable onPress={confirmReminderTime}>
                  <Text style={{ color: COLORS.primary }} className="text-base font-semibold">Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={tempReminderDate}
                mode="time"
                display="spinner"
                onChange={(_, d) => d && setTempReminderDate(d)}
              />
            </View>
          </View>
        </Modal>
      )}
      {Platform.OS === 'android' && showReminderPicker && reminderPickerStep === 'time' && (
        <DateTimePicker value={tempReminderDate} mode="time" onChange={onReminderTimeChange} />
      )}

      {/* iOS Goal DateTime Picker Modal */}
      {Platform.OS === 'ios' && showGoalDatePicker && (
        <Modal transparent animationType="slide">
          <View className="flex-1 justify-end bg-black/30">
            <View className="bg-white rounded-t-3xl px-6 pt-4 pb-8">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-base font-semibold text-gray-900">Goal due date</Text>
                <Pressable onPress={confirmGoalDate}>
                  <Text style={{ color: COLORS.primary }} className="text-base font-semibold">Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={tempGoalDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_, d) => d && setTempGoalDate(d)}
              />
            </View>
          </View>
        </Modal>
      )}
      {Platform.OS === 'android' && showGoalDatePicker && (
        <DateTimePicker value={tempGoalDate} mode="date" minimumDate={new Date()} onChange={onGoalDateChange} />
      )}

      {/* iOS Action Date Picker Modal */}
      {Platform.OS === 'ios' && showActionDatePicker && (
        <Modal transparent animationType="slide">
          <View className="flex-1 justify-end bg-black/30">
            <View className="bg-white rounded-t-3xl px-6 pt-4 pb-8">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-base font-semibold text-gray-900">Action due date</Text>
                <Pressable onPress={confirmActionDate}>
                  <Text style={{ color: COLORS.primary }} className="text-base font-semibold">Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={tempActionDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_, d) => d && setTempActionDate(d)}
              />
            </View>
          </View>
        </Modal>
      )}
      {Platform.OS === 'android' && showActionDatePicker && (
        <DateTimePicker value={tempActionDate} mode="date" minimumDate={new Date()} onChange={onActionDateChange} />
      )}

      {/* Reaction picker (group context) */}
      {isGroupContext && (
        <ReactionPicker
          visible={showReactionPicker}
          onSelect={(reactionType) => addReaction.mutate({ goalId: goal.id, reactionType })}
          onClose={() => setShowReactionPicker(false)}
        />
      )}

      {/* Fire Info modal */}
      {showFireInfo && (
        <Modal transparent animationType="fade">
          <Pressable className="flex-1 bg-black/40 justify-center px-6" onPress={() => setShowFireInfo(false)}>
            <Pressable className="bg-white rounded-2xl px-5 pt-5 pb-6" onPress={() => {/* prevent dismiss */}}>
              <View className="flex-row items-center mb-4">
                <Text className="text-xl font-bold text-gray-900 flex-1">Goal Fire Stages</Text>
                <Pressable onPress={() => setShowFireInfo(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={20} color="#A3A3A3" />
                </Pressable>
              </View>
              <Text className="text-sm text-gray-400 mb-4 -mt-2">Your fire reflects progress and how recently you’ve been active.</Text>
              {FIRE_STAGE_INFO.map((stage) => (
                <View key={stage.label} className="flex-row items-center mb-3">
                  <GoalFireAnimation progress={stage.progress} lastActionAt={stage.lastActionAt} size={40} />
                  <View className="ml-3 flex-1">
                    <Text className="text-base font-semibold text-gray-800">{stage.label}</Text>
                    <Text className="text-sm text-gray-400 mt-0.5">{stage.description}</Text>
                  </View>
                </View>
              ))}
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Ask for Help modal */}
      {showHelpModal && (
        <Modal transparent animationType="fade">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
          <Pressable className="flex-1 bg-black/30 justify-end" onPress={() => setShowHelpModal(false)}>
            <Pressable className="bg-white rounded-t-2xl px-5 pb-8 pt-5" onPress={() => {/* prevent dismiss */}}>
              <View className="flex-row items-center mb-4">
                <View className="w-9 h-9 rounded-xl bg-primary-50 items-center justify-center mr-3">
                  <Feather name="help-circle" size={18} color={COLORS.primary} />
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-bold text-gray-900">Ask for Help</Text>
                  <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>{goal.title}</Text>
                </View>
                <Pressable onPress={() => setShowHelpModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={20} color="#A3A3A3" />
                </Pressable>
              </View>
              <Text className="text-base text-gray-600 mb-2">Describe what you need help with:</Text>
              <TextInput
                className="bg-gray-50 rounded-xl px-4 py-3 text-base text-gray-900 min-h-[80px]"
                placeholder="e.g., I need help staying accountable for this action..."
                placeholderTextColor="#A3A3A3"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                value={helpNote}
                onChangeText={setHelpNote}
                autoFocus
              />
              <View className="flex-row mt-4">
                <Pressable className="flex-1 py-3 rounded-xl mr-2 items-center bg-gray-100" onPress={() => setShowHelpModal(false)}>
                  <Text className="text-base font-semibold text-gray-500">Cancel</Text>
                </Pressable>
                <Pressable
                  className={`flex-1 py-3 rounded-xl items-center ${helpNote.trim().length > 0 ? '' : 'opacity-40'}`}
                  style={{ backgroundColor: COLORS.primary }}
                  onPress={() => {
                    const targetGroupId = groupId ?? shares[0]?.group_id ?? homeGroup?.id;
                    if (!helpNote.trim() || !targetGroupId) return;
                    askForHelp.mutate(
                      { goalId: goal.id, groupId: targetGroupId, note: helpNote.trim() },
                      {
                        onSuccess: () => { setShowHelpModal(false); setHelpNote(''); },
                        onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }),
                      }
                    );
                  }}
                  disabled={helpNote.trim().length === 0 || askForHelp.isPending}
                >
                  <Text className="text-base font-semibold text-white">{askForHelp.isPending ? 'Sending...' : 'Send'}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Offer Help modal */}
      {showOfferModal && (
        <Modal transparent animationType="fade">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
          <Pressable className="flex-1 bg-black/30 justify-end" onPress={() => setShowOfferModal(false)}>
            <Pressable className="bg-white rounded-t-2xl px-5 pb-8 pt-5" onPress={() => {/* prevent dismiss */}}>
              <View className="flex-row items-center mb-4">
                <View className="w-9 h-9 rounded-xl bg-teal-50 items-center justify-center mr-3">
                  <Feather name="life-buoy" size={18} color="#0D9488" />
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-bold text-gray-900">Offer Help</Text>
                  <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>{goal.title}</Text>
                </View>
                <Pressable onPress={() => setShowOfferModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={20} color="#A3A3A3" />
                </Pressable>
              </View>
              <Text className="text-base text-gray-600 mb-2">How would you like to help?</Text>
              <TextInput
                className="bg-gray-50 rounded-xl px-4 py-3 text-base text-gray-900 min-h-[80px]"
                placeholder="e.g., I can help you with this — let's work on it together!"
                placeholderTextColor="#A3A3A3"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                value={offerNote}
                onChangeText={setOfferNote}
                autoFocus
              />
              <View className="flex-row mt-4">
                <Pressable className="flex-1 py-3 rounded-xl mr-2 items-center bg-gray-100" onPress={() => setShowOfferModal(false)}>
                  <Text className="text-base font-semibold text-gray-500">Cancel</Text>
                </Pressable>
                <Pressable
                  className={`flex-1 py-3 rounded-xl items-center ${offerNote.trim().length > 0 ? '' : 'opacity-40'}`}
                  style={{ backgroundColor: '#0D9488' }}
                  onPress={() => {
                    const targetGroupId = groupId ?? shares[0]?.group_id;
                    if (!offerNote.trim() || !targetGroupId) return;
                    offerHelp.mutate(
                      { goalId: goal.id, groupId: targetGroupId, note: offerNote.trim() },
                      {
                        onSuccess: () => { setShowOfferModal(false); setOfferNote(''); },
                        onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }),
                      }
                    );
                  }}
                  disabled={offerNote.trim().length === 0 || offerHelp.isPending}
                >
                  <Text className="text-base font-semibold text-white">{offerHelp.isPending ? 'Sending...' : 'Offer Help'}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </SafeAreaView>
  );
}
