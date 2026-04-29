import React, { useRef, useState, useEffect } from 'react';
import { View, Text, Pressable, Image, Platform, UIManager, Modal, Animated } from 'react-native';
import { Pressable as GHPressable, RectButton } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { Goal } from '../lib/types';
import { useDeleteGoal, computeProgressFromTree } from '../hooks/use-goals';
import { useAddReaction, useGoalReactions } from '../hooks/use-reactions';
import { useGoalComments } from '../hooks/use-comments';
import { useAuthStore } from '../stores/auth-store';
import { useAlert } from './AlertProvider';
import { GoalFireAnimation } from './GoalFireAnimation';
import { ReactionPicker } from './ReactionPicker';
import { RepliesSheet } from './RepliesSheet';
import { COLORS } from '../constants';

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
    description: "Steady progress with consistent activity. You're building momentum!",
  },
  {
    progress: 95,
    lastActionAt: new Date().toISOString(),
    label: 'Blazing',
    description: "High progress and very recent activity. You're absolutely crushing it!",
  },
];

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface GoalCardProps {
  goal: Goal;
  groupId?: string;
  viewedAt?: string | null;
}

function PulsingDot() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.2, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View
      style={{
        opacity,
        width: 7,
        height: 7,
        borderRadius: 3.5,
        backgroundColor: '#F97316',
        marginLeft: 5,
        marginTop: 1,
      }}
    />
  );
}

function RightAction({ onPress }: { onPress: () => void }) {
  return (
    <RectButton
      onPress={onPress}
      style={{
        width: 76,
        marginLeft: 8,
        marginBottom: 8,
        borderRadius: 12,
        backgroundColor: '#ef4444',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Feather name="trash-2" size={20} color="#fff" />
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', marginTop: 4 }}>Delete</Text>
    </RectButton>
  );
}

export const GoalCard = React.memo(function GoalCard({ goal, groupId, viewedAt }: GoalCardProps) {
  const router = useRouter();
  const deleteGoal = useDeleteGoal();
  const addReaction = useAddReaction();
  const swipeableRef = useRef<any>(null);
  const { showAlert } = useAlert();
  const currentUser = useAuthStore((s) => s.user);

  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showFireInfo, setShowFireInfo] = useState(false);
  const [showReplies, setShowReplies] = useState(false);

  const { data: reactions = [] } = useGoalReactions(goal.id, !!groupId);
  const { data: comments = [] } = useGoalComments(goal.id, !!groupId);
  const replyCount = reactions.reduce((sum, r) => sum + r.count, 0) + comments.length;

  // Stat pill computations (group context only)
  const totalActions = goal.sub_goals?.length ?? 0;
  const completedActions = goal.sub_goals?.filter(s => s.status === 'completed').length ?? 0;
  const photoCount = goal.goal_photos?.length ?? 0;
  const helpCount =
    (goal.help_requests?.filter(r => !r.resolved).length ?? 0) +
    (goal.help_offers?.length ?? 0);

  const liveProgress = goal.sub_goals?.length
    ? computeProgressFromTree(goal.sub_goals)
    : goal.progress;
  const isComplete = goal.sub_goals?.length
    ? liveProgress >= 100
    : goal.status === 'completed';

  const isPersonalContext = !groupId;
  const isGoalOwner = isPersonalContext || currentUser?.id === goal.created_by;

  // Show dot for non-owners when there's activity since the user last viewed
  const hasUnseen =
    !isGoalOwner &&
    !!groupId &&
    !!goal.goal_activity_at &&
    (!viewedAt || goal.goal_activity_at > viewedAt);

  const handleDelete = () => {
    swipeableRef.current?.close();
    showAlert({
      title: 'Delete Goal',
      message: `Are you sure you want to delete "${goal.title}"?`,
      icon: 'trash-2',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteGoal.mutate(goal.id, {
          onError: (err: any) => showAlert({ title: 'Delete failed', message: err.message ?? 'Could not delete goal.', icon: 'alert-circle' }),
        }) },
      ],
    });
  };

  const handlePress = () => {
    router.push({
      pathname: '/goal/[goalId]',
      params: groupId ? { goalId: goal.id, groupId } : { goalId: goal.id },
    });
  };

  const handleLongPress = () => {
    if (groupId) setShowReactionPicker(true);
  };

  const handleReactionSelect = (reactionType: string) => {
    addReaction.mutate({ goalId: goal.id, reactionType });
  };

  const groupPillLabel = isPersonalContext ? goal.group?.name ?? null : null;

  return (
    <>
      <ReactionPicker
        visible={showReactionPicker}
        onSelect={handleReactionSelect}
        onClose={() => setShowReactionPicker(false)}
      />
      {groupId && (
        <RepliesSheet
          visible={showReplies}
          onClose={() => setShowReplies(false)}
          goalId={goal.id}
        />
      )}
      {showFireInfo && (
        <Modal transparent animationType="fade">
          <Pressable className="flex-1 bg-black/40 justify-center px-6" onPress={() => setShowFireInfo(false)}>
            <Pressable className="bg-white rounded-2xl px-5 pt-5 pb-6" onPress={() => {}}>
              <View className="flex-row items-center mb-4">
                <Text className="text-xl font-bold text-gray-900 flex-1">Goal Fire Stages</Text>
                <Pressable onPress={() => setShowFireInfo(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={20} color="#A3A3A3" />
                </Pressable>
              </View>
              <Text className="text-sm text-gray-400 mb-4 -mt-2">Your fire reflects progress and how recently you've been active.</Text>
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
      <ReanimatedSwipeable
        ref={swipeableRef}
        friction={2}
        rightThreshold={40}
        renderRightActions={isGoalOwner ? () => <RightAction onPress={handleDelete} /> : undefined}
        overshootRight={false}
        enabled={isGoalOwner}
      >
        <View
          className="bg-white rounded-xl mb-2 border border-gray-100"
          style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}
        >
          <Pressable
            className="px-4 pt-3 pb-2"
            onPress={handlePress}
            onLongPress={handleLongPress}
            delayLongPress={400}
          >
            {/* avatar (top-left) | content column | fire (top-right) */}
            <View className="flex-row items-start">
              {goal.creator_profile?.avatar_url ? (
                <Image
                  source={{ uri: goal.creator_profile.avatar_url }}
                  style={{ width: 24, height: 24, borderRadius: 12 }}
                />
              ) : (
                <View style={{ width: 24, height: 24, borderRadius: 12 }} className="bg-gray-200 items-center justify-center">
                  <Text className="text-[10px] font-bold text-gray-500">
                    {goal.creator_profile?.display_name?.charAt(0)?.toUpperCase() ?? '?'}
                  </Text>
                </View>
              )}

              {/* Column: username → title → description */}
              <View className="flex-1 mx-2.5">
                <View className="flex-row items-center">
                  <Text className="text-sm font-normal flex-shrink" style={{ color: '#A39B92' }} numberOfLines={1}>
                    {goal.creator_profile?.display_name ?? 'Unknown'}
                    {goal.end_date && (() => {
                      const daysLeft = Math.ceil(
                        (new Date(goal.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                      );
                      return daysLeft > 0
                        ? ` · ${daysLeft}d left`
                        : daysLeft === 0
                        ? ' · due today'
                        : ` · ${Math.abs(daysLeft)}d overdue`;
                    })()}
                  </Text>
                  {hasUnseen && <PulsingDot />}
                  {groupPillLabel && (
                    <View className="flex-row items-center bg-primary-50 rounded-full px-2 py-0.5 ml-2">
                      <Feather name="users" size={10} color={COLORS.primary} />
                      <Text className="text-xs text-primary-600 ml-1" numberOfLines={1}>
                        {groupPillLabel}
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  className={`text-lg font-semibold tracking-tight mt-0.5 ${
                    isComplete ? 'text-gray-400 line-through' : 'text-gray-900'
                  }`}
                  numberOfLines={2}
                >
                  {goal.title}
                </Text>
                {goal.description ? (
                  <Text className="text-sm text-gray-500 leading-5 mt-1" numberOfLines={2}>
                    {goal.description}
                  </Text>
                ) : null}
              </View>

              {/* Fire or Celebrate button (top-right) */}
              {groupId && isComplete && !isGoalOwner ? (
                <Pressable
                  onPress={() => setShowReplies(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                    borderRadius: 999,
                    backgroundColor: COLORS.primary + '15',
                    borderWidth: 1,
                    borderColor: COLORS.primary + '35',
                  }}
                >
                  <Text style={{ fontSize: 14 }}>🎉</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.primary }}>
                    Celebrate {goal.creator_profile?.display_name?.split(' ')[0] ?? 'them'}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => setShowFireInfo(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ opacity: isComplete ? 0.5 : 1, width: 24, height: 24 }}
                >
                  <GoalFireAnimation progress={liveProgress} lastActionAt={goal.last_action_at} size={24} />
                </Pressable>
              )}
            </View>
          </Pressable>

          {/* Pill row — only for group goals */}
          {groupId && (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                marginLeft: 50,
                marginBottom: 10,
                marginTop: 4,
                gap: 6,
              }}
            >
              {/* Replies pill (always shown for group goals) */}
              <Pressable
                onPress={() => setShowReplies(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: replyCount > 0 ? COLORS.primary + '40' : '#ECE7E1',
                  backgroundColor: replyCount > 0 ? COLORS.primary + '10' : '#F7F5F2',
                  gap: 5,
                }}
              >
                <Feather
                  name="message-circle"
                  size={13}
                  color={replyCount > 0 ? COLORS.primary : '#A39B92'}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: replyCount > 0 ? COLORS.primary : '#A39B92',
                  }}
                >
                  {replyCount > 0 ? `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}` : 'Reply'}
                </Text>
              </Pressable>

              {/* Stat pills — hidden for completed goals viewed by non-owners */}
              {!(isComplete && !isGoalOwner) && (
                <>
                  {/* Actions pill: x/y sub-goals completed */}
                  {totalActions > 0 && (
                    <Pressable
                      onPress={() => router.push({ pathname: '/goal/[goalId]', params: { goalId: goal.id, groupId: groupId as string, section: 'actions' } })}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        alignSelf: 'flex-start',
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: '#ECE7E1',
                        backgroundColor: '#F7F5F2',
                        gap: 5,
                      }}
                    >
                      <Feather name="check-square" size={13} color="#A39B92" />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#A39B92' }}>
                        {completedActions}/{totalActions}
                      </Text>
                    </Pressable>
                  )}

                  {/* Gallery pill: photo count */}
                  {photoCount > 0 && (
                    <Pressable
                      onPress={() => router.push({ pathname: '/goal/[goalId]', params: { goalId: goal.id, groupId: groupId as string, section: 'gallery' } })}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        alignSelf: 'flex-start',
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: '#ECE7E1',
                        backgroundColor: '#F7F5F2',
                        gap: 5,
                      }}
                    >
                      <Feather name="image" size={13} color="#A39B92" />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#A39B92' }}>
                        {photoCount}
                      </Text>
                    </Pressable>
                  )}

                  {/* Help pill: unresolved requests + offers */}
                  {helpCount > 0 && (
                    <Pressable
                      onPress={() => router.push({ pathname: '/goal/[goalId]', params: { goalId: goal.id, groupId: groupId as string, section: 'help' } })}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        alignSelf: 'flex-start',
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: '#ECE7E1',
                        backgroundColor: '#F7F5F2',
                        gap: 5,
                      }}
                    >
                      <Feather name="life-buoy" size={13} color="#A39B92" />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#A39B92' }}>
                        {helpCount}
                      </Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          )}
        </View>
      </ReanimatedSwipeable>
    </>
  );
});
