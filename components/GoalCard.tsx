import React, { useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, Image, LayoutAnimation, Platform, UIManager, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { Goal, SubGoal, HelpRequest } from '../lib/types';
import { useGoal, useDeleteGoal, useUpdateGoal, useUpdateSubGoal, useCreateSubGoal, computeProgressFromTree } from '../hooks/use-goals';
import { useGroups } from '../hooks/use-groups';
import { useGoalShares, useShareGoalToGroup, useUnshareGoalFromGroup } from '../hooks/use-my-goals';
import { useHelpRequests, useAskForHelp, useResolveHelp } from '../hooks/use-help-requests';
import { useHelpOffers, useOfferHelp } from '../hooks/use-help-offers';
import { useAddReaction } from '../hooks/use-reactions';
import { useAuthStore } from '../stores/auth-store';
import { useAlert } from './AlertProvider';
import { SubGoalTree } from './SubGoalTree';
import { GoalFireAnimation } from './GoalFireAnimation';
import { useCelebrationStore } from '../stores/celebration-store';
import { ReactionBar } from './ReactionBar';
import { ReactionPicker } from './ReactionPicker';
import { COLORS } from '../constants';
import { supabase } from '../lib/supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

async function sendGoalCompletionPush(groupId: string, goalId: string, goalTitle: string, completerId: string) {
  try {
    await supabase.functions.invoke('send-group-push', {
      body: {
        group_id: groupId,
        exclude_user_id: completerId,
        title: '🎉 Goal completed!',
        body: `A group member completed "${goalTitle}"`,
        data: { type: 'goal_completed', group_id: groupId, goal_id: goalId },
      },
    });
  } catch (e) {
    console.warn('Failed to send goal completion push:', e);
  }
}

interface GoalCardProps {
  goal: Goal;
  groupId?: string;
  isExpanded: boolean;
  onToggleExpand: (goalId: string) => void;
}

function RightAction({ drag, onPress }: { drag: SharedValue<number>; onPress: () => void }) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value + 80 }],
  }));

  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <Reanimated.View
        style={[animatedStyle, { width: 80, marginLeft: 8, marginBottom: 6, borderRadius: 12 }]}
        className="flex-1 justify-center items-center bg-red-500"
      >
        <Feather name="trash-2" size={20} color="#fff" />
        <Text className="text-white text-xs font-semibold mt-1">Delete</Text>
      </Reanimated.View>
    </Pressable>
  );
}

export function GoalCard({ goal, groupId, isExpanded, onToggleExpand }: GoalCardProps) {
  const deleteGoal = useDeleteGoal();
  const updateGoal = useUpdateGoal();
  const updateSubGoal = useUpdateSubGoal();
  const createSubGoal = useCreateSubGoal();
  const askForHelp = useAskForHelp();
  const resolveHelp = useResolveHelp();
  const offerHelp = useOfferHelp();
  const addReaction = useAddReaction();
  const swipeableRef = useRef<any>(null);
  const { showAlert } = useAlert();
  const currentUser = useAuthStore((s) => s.user);

  // Fetch full goal data (with sub_goals) when expanded
  const { data: fullGoal } = useGoal(goal.id);
  const goalData = isExpanded && fullGoal ? fullGoal : goal;

  const liveProgress = goalData.sub_goals?.length
    ? computeProgressFromTree(goalData.sub_goals)
    : goalData.progress;
  // Derive completion from live sub-goal data when available, rather than relying solely on stale status
  const isComplete = goalData.sub_goals?.length
    ? liveProgress >= 100
    : goalData.status === 'completed';

  // In a group context, only the goal creator can modify actions
  const isGoalOwner = !groupId || (currentUser?.id === goal.created_by);

  const [newActionTitle, setNewActionTitle] = useState('');
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [selectedSubGoal, setSelectedSubGoal] = useState<SubGoal | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

  // Help request state
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpNote, setHelpNote] = useState('');

  // Help offer state
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerNote, setOfferNote] = useState('');

  // Celebration & reaction state
  const showCelebration = useCelebrationStore((s) => s.show);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const prevProgressRef = useRef(liveProgress);

  // Fetch active help request for this goal (only when expanded and in a group)
  const { data: activeHelpRequest } = useHelpRequests(
    isExpanded && groupId ? goal.id : undefined
  );

  // Fetch help offers for this goal (only when expanded and in a group)
  const { data: helpOffers = [] } = useHelpOffers(
    isExpanded && groupId ? goal.id : undefined
  );

  // Group sharing (only used on "Your Goals" screen, i.e. when no groupId)
  const isPersonalContext = !groupId;
  const { data: groups = [] } = useGroups();
  const { data: shares = [] } = useGoalShares(isPersonalContext ? goal.id : '');
  const shareGoal = useShareGoalToGroup();
  const unshareGoal = useUnshareGoalFromGroup();
  const sharedGroupIds = new Set(shares.map((s) => s.group_id));

  const handleDelete = () => {
    swipeableRef.current?.close();
    showAlert({
      title: 'Delete Goal',
      message: `Are you sure you want to delete "${goal.title}"?`,
      icon: 'trash-2',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteGoal.mutate(goal.id),
        },
      ],
    });
  };

  const handleToggleSubGoal = (subGoal: SubGoal) => {
    const newStatus = subGoal.status === 'completed' ? 'in_progress' : 'completed';
    updateSubGoal.mutate(
      { subGoalId: subGoal.id, updates: { status: newStatus } },
      {
        onSuccess: () => {
          // Check if goal just reached 100% completion
          if (newStatus === 'completed' && goalData.sub_goals) {
            const updatedTree = goalData.sub_goals.map((sg) =>
              sg.id === subGoal.id ? { ...sg, status: newStatus as SubGoal['status'] } : sg
            );
            const newProgress = computeProgressFromTree(updatedTree);
            if (newProgress >= 100 && prevProgressRef.current < 100) {
              showCelebration();
              // Update goal status to completed
              updateGoal.mutate({ goalId: goal.id, updates: { status: 'completed' } });
              // Send push to group members
              if (groupId && currentUser) {
                sendGoalCompletionPush(groupId, goal.id, goal.title, currentUser.id);
              }
            }
            prevProgressRef.current = newProgress;
          }
        },
        onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }),
      },
    );
  };

  const handleLongPress = () => {
    if (groupId) {
      setShowReactionPicker(true);
    }
  };

  const handleReactionSelect = (reactionType: string) => {
    addReaction.mutate({ goalId: goal.id, reactionType });
  };

  const handleAddAction = () => {
    const title = newActionTitle.trim();
    if (!title) return;
    createSubGoal.mutate(
      { goalId: goal.id, title },
      {
        onSuccess: () => setNewActionTitle(''),
        onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }),
      }
    );
  };

  const handleDueDatePress = (subGoal: SubGoal) => {
    setSelectedSubGoal(subGoal);
    setTempDate(subGoal.due_date ? new Date(subGoal.due_date) : new Date());
    setShowDatePicker(true);
  };

  const handleAskForHelp = () => {
    setHelpNote('');
    setShowHelpModal(true);
  };

  const handleSubmitHelp = () => {
    if (!helpNote.trim() || !groupId) return;
    askForHelp.mutate(
      { goalId: goal.id, groupId, note: helpNote.trim() },
      {
        onSuccess: () => {
          setShowHelpModal(false);
          setHelpNote('');
        },
        onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }),
      }
    );
  };

  const handleResolveHelp = (helpRequest: HelpRequest) => {
    showAlert({
      title: 'Resolve Help Request',
      message: 'Mark this help request as resolved?',
      icon: 'check-circle',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolve',
          style: 'default',
          onPress: () => resolveHelp.mutate(helpRequest.id),
        },
      ],
    });
  };

  const handleOfferHelp = () => {
    setOfferNote('');
    setShowOfferModal(true);
  };

  const handleSubmitOffer = () => {
    if (!offerNote.trim() || !groupId) return;
    offerHelp.mutate(
      { goalId: goal.id, groupId, note: offerNote.trim() },
      {
        onSuccess: () => {
          setShowOfferModal(false);
          setOfferNote('');
        },
        onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }),
      }
    );
  };

  const onDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (selected && selectedSubGoal) {
        updateSubGoal.mutate(
          { subGoalId: selectedSubGoal.id, updates: { due_date: selected.toISOString().split('T')[0] } },
          { onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }) },
        );
        setSelectedSubGoal(null);
      }
    } else if (selected) {
      setTempDate(selected);
    }
  };

  const confirmDate = () => {
    if (selectedSubGoal) {
      updateSubGoal.mutate(
        { subGoalId: selectedSubGoal.id, updates: { due_date: tempDate.toISOString().split('T')[0] } },
        { onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }) },
      );
    }
    setShowDatePicker(false);
    setSelectedSubGoal(null);
  };

  const handlePress = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggleExpand(goal.id);
  };

  return (
    <>
    <ReactionPicker
      visible={showReactionPicker}
      onSelect={handleReactionSelect}
      onClose={() => setShowReactionPicker(false)}
    />
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={2}
      rightThreshold={40}
      renderRightActions={isGoalOwner ? (_prog, drag) => <RightAction drag={drag} onPress={handleDelete} /> : undefined}
      overshootRight={false}
      enabled={isGoalOwner}
    >
      <View
        className={`bg-white rounded-xl mb-1.5 border ${isExpanded ? 'border-gray-200' : 'border-gray-100'}`}
        style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: isExpanded ? 0.06 : 0.04, shadowRadius: isExpanded ? 8 : 4, elevation: isExpanded ? 2 : 1 }}
      >
        {/* Header row - always visible */}
        <Pressable
          className="px-4 py-3.5"
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={400}
        >
          {/* Title/pill + Fire row */}
          <View className="flex-row items-center">
            <View className="flex-1">
              <Text
                className={`text-lg font-medium tracking-tight ${
                  isComplete ? 'text-gray-400' : 'text-gray-900'
                }`}
                numberOfLines={1}
              >
                {goalData.title}
              </Text>
              {isPersonalContext && (() => {
                const totalGroups = (goal.group?.name ? 1 : 0) + shares.length;
                if (totalGroups === 0) return null;
                const label = totalGroups === 1
                  ? (goal.group?.name ?? shares[0]?.group?.name ?? '1 group')
                  : `${totalGroups} groups`;
                return (
                  <View className="flex-row items-center" style={{ marginTop: 2 }}>
                    <View className="flex-row items-center bg-blue-50 rounded-full px-2 py-0.5">
                      <Feather name="users" size={10} color={COLORS.primary} />
                      <Text className="text-xs text-blue-500 ml-1" numberOfLines={1}>
                        {label}
                      </Text>
                    </View>
                  </View>
                );
              })()}
              {goal.creator_profile && (
                <View className="flex-row items-center" style={{ marginTop: 2 }}>
                  {goal.creator_profile.avatar_url ? (
                    <Image
                      source={{ uri: goal.creator_profile.avatar_url }}
                      className="w-[26px] h-[26px] rounded-full"
                    />
                  ) : (
                    <View className="w-[26px] h-[26px] rounded-full bg-gray-200 items-center justify-center">
                      <Text className="text-[10px] font-bold text-gray-500">
                        {goal.creator_profile.display_name?.charAt(0)?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                  )}
                  <Text className="text-xs text-gray-400 ml-1" numberOfLines={1}>
                    {goal.creator_profile.display_name}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ opacity: isComplete ? 0.5 : 1 }}>
              <GoalFireAnimation progress={liveProgress} lastActionAt={goalData.last_action_at} size={36} />
            </View>
          </View>
        </Pressable>

        {/* Reaction bar — only for group goals */}
        {groupId && <ReactionBar goalId={goal.id} />}

        {/* Expanded details */}
        {isExpanded && (
          <View className="px-4 pb-4">
            {/* Progress bar */}
            <View className="mb-4">
              <View className="flex-row justify-end mb-1.5">
                <Text className="text-xs font-semibold text-gray-600">{Math.round(liveProgress)}%</Text>
              </View>
              <View className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <View
                  style={{ width: `${Math.min(liveProgress, 100)}%`, backgroundColor: COLORS.primary }}
                  className="h-full rounded-full"
                />
              </View>
            </View>

            {/* Details row */}
            {goalData.tangible_reward && (
              <View className="flex-row items-center mb-3">
                <Feather name="gift" size={12} color="#F59E0B" />
                <Text className="text-xs text-gray-400 ml-1" numberOfLines={1}>
                  {goalData.tangible_reward}
                </Text>
              </View>
            )}

            {/* Sub-goals / Actions */}
            {(goalData.sub_goals?.length ?? 0) > 0 && (
              <View>
                <SubGoalTree
                  subGoals={goalData.sub_goals ?? []}
                  onToggle={isGoalOwner ? handleToggleSubGoal : undefined}
                  onDueDatePress={isGoalOwner ? handleDueDatePress : undefined}
                />
              </View>
            )}

            {/* Add action input — only for goal owner */}
            {isGoalOwner && <View className="flex-row items-center mb-1.5">
              <TextInput
                className="flex-1 bg-gray-50 rounded-lg px-3 py-2.5 text-base text-gray-900"
                placeholder="Add an action..."
                placeholderTextColor="#A3A3A3"
                value={newActionTitle}
                onChangeText={setNewActionTitle}
                onSubmitEditing={handleAddAction}
                returnKeyType="done"
              />
              {newActionTitle.trim().length > 0 && (
                <Pressable
                  className="ml-2 w-8 h-8 rounded-lg items-center justify-center"
                  style={{ backgroundColor: COLORS.primary }}
                  onPress={handleAddAction}
                >
                  <Feather name="plus" size={16} color="#FFF" />
                </Pressable>
              )}
            </View>}

            {/* Goal-level help section — only in group context */}
            {groupId && (
              <View>
                {/* Active help request inline */}
                {activeHelpRequest && (
                  <View className="flex-row items-center bg-orange-50 rounded-lg px-3 py-2.5 mb-2">
                    <Feather name="help-circle" size={14} color="#F97316" />
                    <View className="flex-1 ml-2">
                      <Text className="text-xs font-semibold text-orange-700">
                        {activeHelpRequest.requester_profile?.display_name ?? 'Someone'} needs help
                      </Text>
                      <Text className="text-xs text-orange-600 mt-0.5" numberOfLines={2}>
                        {activeHelpRequest.note}
                      </Text>
                    </View>
                    {isGoalOwner && (
                      <Pressable
                        className="ml-2 px-2.5 py-1.5 bg-white rounded-lg border border-orange-200"
                        onPress={() => handleResolveHelp(activeHelpRequest)}
                      >
                        <Text className="text-xs font-semibold text-green-700">Resolve</Text>
                      </Pressable>
                    )}
                  </View>
                )}

                {/* Help offers list */}
                {helpOffers.length > 0 && (
                  <View className="mb-2" style={{ gap: 4 }}>
                    {helpOffers.map((offer) => (
                      <View key={offer.id} className="flex-row items-center bg-teal-50 rounded-lg px-3 py-2">
                        <Feather name="life-buoy" size={12} color="#0D9488" />
                        <Text className="text-xs text-teal-700 ml-2 flex-1" numberOfLines={2}>
                          <Text className="font-semibold">{offer.offerer_profile?.display_name ?? 'Someone'}</Text>
                          {': '}{offer.note}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Help buttons */}
                <View className="flex-row" style={{ gap: 8 }}>
                  {/* Ask for Help — only goal owner, no active request, goal not complete */}
                  {isGoalOwner && !activeHelpRequest && !isComplete && (
                    <Pressable
                      className="flex-1 flex-row items-center justify-center bg-blue-50 rounded-lg py-2.5"
                      onPress={handleAskForHelp}
                    >
                      <Feather name="help-circle" size={14} color={COLORS.primary} />
                      <Text className="text-xs font-medium ml-1.5" style={{ color: COLORS.primary }}>Ask for Help</Text>
                    </Pressable>
                  )}

                  {/* Offer Help — only non-owners, goal not complete */}
                  {!isGoalOwner && !isComplete && (
                    <Pressable
                      className="flex-1 flex-row items-center justify-center bg-teal-50 rounded-lg py-2.5"
                      onPress={handleOfferHelp}
                    >
                      <Feather name="life-buoy" size={14} color="#0D9488" />
                      <Text className="text-xs font-medium ml-1.5 text-teal-700">Offer Help</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            )}

            {/* Share to group (only on Your Goals screen) */}
            {isPersonalContext && groups.length > 0 && (
              <View className="mt-3 pt-3 border-t border-gray-100">
                <Pressable
                  className="flex-row items-center"
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setShowGroupPicker(!showGroupPicker);
                  }}
                >
                  <Feather name="users" size={14} color="#9CA3AF" />
                  <Text className="text-xs font-medium text-gray-400 ml-1.5 flex-1">
                    {(() => {
                      const totalGroups = (goal.group_id ? 1 : 0) + shares.length;
                      if (totalGroups > 0) return `In ${totalGroups} group${totalGroups > 1 ? 's' : ''}`;
                      return 'Add to a group';
                    })()}
                  </Text>
                  <Feather name={showGroupPicker ? 'chevron-up' : 'chevron-down'} size={14} color="#D4D4D4" />
                </Pressable>

                {showGroupPicker && (
                  <View className="mt-2">
                    {groups.map((g) => {
                      const isNativeGroup = goal.group_id === g.id;
                      const isShared = sharedGroupIds.has(g.id);
                      const isChecked = isNativeGroup || isShared;
                      return (
                        <Pressable
                          key={g.id}
                          className="flex-row items-center py-2"
                          onPress={() => {
                            if (isNativeGroup) {
                              // Remove the goal from its native group
                              updateGoal.mutate({ goalId: goal.id, updates: { group_id: null } });
                            } else if (isShared) {
                              unshareGoal.mutate({ goalId: goal.id, groupId: g.id });
                            } else {
                              if (goal.group_id === null && !sharedGroupIds.size) {
                                // No group yet — set as native group
                                updateGoal.mutate({ goalId: goal.id, updates: { group_id: g.id } });
                              } else {
                                shareGoal.mutate({ goalId: goal.id, groupId: g.id });
                              }
                            }
                          }}
                        >
                          <View
                            className={`w-5 h-5 rounded items-center justify-center ${
                              isChecked ? 'bg-blue-500' : 'border border-gray-300'
                            }`}
                          >
                            {isChecked && <Feather name="check" size={12} color="#fff" />}
                          </View>
                          <Text className="text-base ml-2 flex-1 text-gray-700" numberOfLines={1}>
                            {g.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </View>

      {/* Date picker for action due dates */}
      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={tempDate}
          mode="date"
          onChange={onDateChange}
        />
      )}
      {showDatePicker && Platform.OS === 'ios' && (
        <Modal transparent animationType="fade">
          <Pressable className="flex-1 bg-black/30 justify-end" onPress={() => { setShowDatePicker(false); setSelectedSubGoal(null); }}>
            <View className="bg-white rounded-t-2xl px-4 pb-8 pt-4">
              <View className="flex-row justify-between items-center mb-2">
                <Pressable onPress={() => { setShowDatePicker(false); setSelectedSubGoal(null); }}>
                  <Text className="text-base text-gray-500">Cancel</Text>
                </Pressable>
                <Pressable onPress={confirmDate}>
                  <Text className="text-base font-semibold" style={{ color: COLORS.primary }}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                onChange={onDateChange}
              />
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Ask for Help modal */}
      {showHelpModal && (
        <Modal transparent animationType="fade">
          <Pressable
            className="flex-1 bg-black/30 justify-end"
            onPress={() => setShowHelpModal(false)}
          >
            <Pressable
              className="bg-white rounded-t-2xl px-5 pb-8 pt-5"
              onPress={() => {/* prevent dismiss when tapping content */}}
            >
              {/* Header */}
              <View className="flex-row items-center mb-4">
                <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center mr-3">
                  <Feather name="help-circle" size={18} color={COLORS.primary} />
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-bold text-gray-900">Ask for Help</Text>
                  <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>
                    {goalData.title}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowHelpModal(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="x" size={20} color="#A3A3A3" />
                </Pressable>
              </View>

              {/* Help note input */}
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

              {/* Actions */}
              <View className="flex-row mt-4">
                <Pressable
                  className="flex-1 py-3 rounded-xl mr-2 items-center bg-gray-100"
                  onPress={() => setShowHelpModal(false)}
                >
                  <Text className="text-base font-semibold text-gray-500">Cancel</Text>
                </Pressable>
                <Pressable
                  className={`flex-1 py-3 rounded-xl items-center ${
                    helpNote.trim().length > 0 ? '' : 'opacity-40'
                  }`}
                  style={{ backgroundColor: COLORS.primary }}
                  onPress={handleSubmitHelp}
                  disabled={helpNote.trim().length === 0 || askForHelp.isPending}
                >
                  <Text className="text-base font-semibold text-white">
                    {askForHelp.isPending ? 'Sending...' : 'Send'}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Offer Help modal */}
      {showOfferModal && (
        <Modal transparent animationType="fade">
          <Pressable
            className="flex-1 bg-black/30 justify-end"
            onPress={() => setShowOfferModal(false)}
          >
            <Pressable
              className="bg-white rounded-t-2xl px-5 pb-8 pt-5"
              onPress={() => {/* prevent dismiss when tapping content */}}
            >
              {/* Header */}
              <View className="flex-row items-center mb-4">
                <View className="w-9 h-9 rounded-xl bg-teal-50 items-center justify-center mr-3">
                  <Feather name="life-buoy" size={18} color="#0D9488" />
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-bold text-gray-900">Offer Help</Text>
                  <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>
                    {goalData.title}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowOfferModal(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="x" size={20} color="#A3A3A3" />
                </Pressable>
              </View>

              {/* Offer note input */}
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

              {/* Actions */}
              <View className="flex-row mt-4">
                <Pressable
                  className="flex-1 py-3 rounded-xl mr-2 items-center bg-gray-100"
                  onPress={() => setShowOfferModal(false)}
                >
                  <Text className="text-base font-semibold text-gray-500">Cancel</Text>
                </Pressable>
                <Pressable
                  className={`flex-1 py-3 rounded-xl items-center ${
                    offerNote.trim().length > 0 ? '' : 'opacity-40'
                  }`}
                  style={{ backgroundColor: '#0D9488' }}
                  onPress={handleSubmitOffer}
                  disabled={offerNote.trim().length === 0 || offerHelp.isPending}
                >
                  <Text className="text-base font-semibold text-white">
                    {offerHelp.isPending ? 'Sending...' : 'Offer Help'}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </ReanimatedSwipeable>
    </>
  );
}
