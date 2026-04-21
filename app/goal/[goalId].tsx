import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  RefreshControl,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useGoal, useUpdateSubGoal, useUpdateGoal, useCreateSubGoal, computeProgressFromTree } from '../../hooks/use-goals';
import { useGoalShares, useShareGoalToGroup, useUnshareGoalFromGroup } from '../../hooks/use-my-goals';
import { useGroups } from '../../hooks/use-groups';
import { SubGoalTree } from '../../components/SubGoalTree';
import { GoalFireAnimation } from '../../components/GoalFireAnimation';
import { COLORS } from '../../constants';
import { useAlert } from '../../components/AlertProvider';
import type { SubGoal, Group } from '../../lib/types';

export default function PersonalGoalDetailScreen() {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  const router = useRouter();

  const { data: goal, isLoading, refetch } = useGoal(goalId!);
  const updateSubGoal = useUpdateSubGoal();
  const updateGoal = useUpdateGoal();
  const createSubGoal = useCreateSubGoal();
  const { data: shares = [] } = useGoalShares(goalId!);
  const { data: groups = [] } = useGroups();
  const shareGoal = useShareGoalToGroup();
  const unshareGoal = useUnshareGoalFromGroup();

  const [refreshing, setRefreshing] = useState(false);

  // Goal due date picker state
  const [showGoalDatePicker, setShowGoalDatePicker] = useState(false);
  const [showGoalTimePicker, setShowGoalTimePicker] = useState(false);
  const [tempGoalDate, setTempGoalDate] = useState<Date>(new Date());

  // Action due date picker state
  const [showActionDatePicker, setShowActionDatePicker] = useState(false);
  const [selectedSubGoal, setSelectedSubGoal] = useState<SubGoal | null>(null);
  const [tempActionDate, setTempActionDate] = useState<Date>(new Date());

  const [newActionTitle, setNewActionTitle] = useState('');
  const { showAlert } = useAlert();

  // Compute progress client-side from sub_goals so fire + progress bar stay in sync with optimistic updates
  const liveProgress = goal ? computeProgressFromTree(goal.sub_goals ?? []) : 0;

  const sharedGroupIds = new Set(shares.map((s) => s.group_id));
  const availableGroups = groups.filter((g) => !sharedGroupIds.has(g.id));

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleToggleSubGoal = (subGoal: SubGoal) => {
    const newStatus = subGoal.status === 'completed' ? 'in_progress' : 'completed';
    updateSubGoal.mutate(
      { subGoalId: subGoal.id, updates: { status: newStatus } },
      { onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }) },
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
        const existing = goal?.end_date ? new Date(goal.end_date) : new Date();
        const merged = new Date(selected);
        merged.setHours(existing.getHours(), existing.getMinutes(), 0, 0);
        setTempGoalDate(merged);
        setShowGoalTimePicker(true);
      }
    } else if (selected) {
      setTempGoalDate(selected);
    }
  };

  const onGoalTimeChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowGoalTimePicker(false);
      if (selected) {
        const merged = new Date(tempGoalDate);
        merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        updateGoal.mutate(
          { goalId: goalId!, updates: { end_date: merged.toISOString() } },
          { onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }) }
        );
      }
    } else if (selected) {
      setTempGoalDate(selected);
    }
  };

  const confirmGoalDate = () => {
    updateGoal.mutate(
      { goalId: goalId!, updates: { end_date: tempGoalDate.toISOString() } },
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

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Hero Header */}
      <View
        className="bg-white px-5 pt-3 pb-5"
        style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 }}
      >
        <View className="flex-row items-center mb-4">
          <Pressable
            className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center"
            onPress={() => router.back()}
          >
            <Feather name="arrow-left" size={18} color="#525252" />
          </Pressable>
          <View className="flex-1 mx-3">
            <Text className="text-xl font-bold text-gray-900 tracking-tight" numberOfLines={2}>
              {goal.title}
            </Text>
          </View>
          <GoalFireAnimation progress={liveProgress} size={52} />
        </View>

        {/* Status + Progress */}
        <View className="flex-row items-center mb-3">
          <View
            className={`px-2.5 py-1 rounded-full ${
              goal.status === 'completed' ? 'bg-green-100' : 'bg-blue-100'
            }`}
          >
            <Text
              className={`text-xs font-bold uppercase tracking-wider ${
                goal.status === 'completed' ? 'text-green-700' : 'text-blue-700'
              }`}
            >
              {goal.status === 'completed' ? 'Completed' : goal.status.replace('_', ' ')}
            </Text>
          </View>
          <View className="flex-1" />
          <Text className="text-2xl font-bold" style={{ color: COLORS.primary }}>
            {Math.round(liveProgress)}%
          </Text>
        </View>

        {/* Progress Bar */}
        <View className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <View
            style={{ width: `${Math.min(liveProgress, 100)}%`, backgroundColor: COLORS.primary }}
            className="h-full rounded-full"
          />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
        }
      >
        {/* Actions Section */}
        <View className="px-5 mt-5">
          <View className="flex-row items-center mb-3">
            <Feather name="check-circle" size={14} color="#9CA3AF" />
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1.5">
              Actions
            </Text>
            {(goal.sub_goals?.length ?? 0) > 0 && (
              <View className="bg-gray-200 rounded-full px-2 py-0.5 ml-2">
                <Text className="text-xs font-bold text-gray-500">
                  {goal.sub_goals!.filter(s => s.status === 'completed').length}/{goal.sub_goals!.length}
                </Text>
              </View>
            )}
          </View>
          <View
            className="bg-white rounded-2xl p-4"
            style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}
          >
            {(goal.sub_goals?.length ?? 0) > 0 && (
              <SubGoalTree subGoals={goal.sub_goals ?? []} onToggle={handleToggleSubGoal} onDueDatePress={handleActionDueDatePress} />
            )}
            {/* Add action input */}
            <View
              className="flex-row items-center"
              style={(goal.sub_goals?.length ?? 0) > 0 ? { marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' } : undefined}
            >
              <TextInput
                className="flex-1 bg-gray-50 rounded-xl px-3 py-2.5 text-base text-gray-900"
                placeholder="Add an action..."
                placeholderTextColor="#A3A3A3"
                value={newActionTitle}
                onChangeText={setNewActionTitle}
                onSubmitEditing={handleAddAction}
                returnKeyType="done"
              />
              {newActionTitle.trim().length > 0 && (
                <Pressable
                  className="ml-2 w-9 h-9 rounded-xl items-center justify-center"
                  style={{ backgroundColor: COLORS.primary }}
                  onPress={handleAddAction}
                >
                  <Feather name="plus" size={18} color="#FFF" />
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {/* Details Section */}
        <View className="px-5 mt-6">
          <View className="flex-row items-center mb-3">
            <Feather name="info" size={14} color="#9CA3AF" />
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1.5">
              Details
            </Text>
          </View>

          {/* Due Date */}
          <Pressable
            className="bg-white rounded-2xl p-4 flex-row items-center mb-2"
            style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}
            onPress={openGoalDatePicker}
          >
            <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: '#EFF6FF' }}>
              <Feather name="calendar" size={16} color={COLORS.primary} />
            </View>
            <View className="flex-1 ml-3">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Due Date</Text>
              <Text className="text-base font-medium text-gray-900 mt-0.5">
                {goal.end_date
                  ? `${new Date(goal.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${new Date(goal.end_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                  : 'No due date'}
              </Text>
            </View>
            <Feather name="chevron-right" size={14} color="#D4D4D4" />
          </Pressable>

          {/* Tangible Reward */}
          {goal.tangible_reward && (
            <View
              className="bg-white rounded-2xl p-4 flex-row items-center mb-2"
              style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}
            >
              <View className="w-10 h-10 rounded-xl bg-amber-50 items-center justify-center">
                <Feather name="gift" size={16} color="#F59E0B" />
              </View>
              <View className="flex-1 ml-3">
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Reward</Text>
                <Text className="text-base font-medium text-gray-900 mt-0.5">{goal.tangible_reward}</Text>
              </View>
            </View>
          )}

          {/* Description */}
          {goal.description && (
            <View
              className="bg-white rounded-2xl p-4 mb-2"
              style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}
            >
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Description</Text>
              <Text className="text-base text-gray-600 leading-5">{goal.description}</Text>
            </View>
          )}
        </View>

        {/* Groups Section */}
        <View className="px-5 mt-6 mb-8">
          <View className="flex-row items-center mb-3">
            <Feather name="users" size={14} color="#9CA3AF" />
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1.5">
              Groups
            </Text>
            {shares.length > 0 && (
              <View className="bg-green-100 rounded-full px-2 py-0.5 ml-2">
                <Text className="text-xs font-bold text-green-700">
                  Shared · {shares.length}
                </Text>
              </View>
            )}
            {shares.length === 0 && groups.length > 0 && (
              <View className="bg-gray-200 rounded-full px-2 py-0.5 ml-2">
                <Text className="text-xs font-bold text-gray-500">Not shared</Text>
              </View>
            )}
          </View>

          {/* Shared groups */}
          {shares.map((share) => (
            <View
              key={share.group_id}
              className="flex-row items-center bg-white rounded-2xl p-4 mb-2"
              style={{ borderWidth: 1.5, borderColor: '#BBF7D0', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}
            >
              <View className="w-10 h-10 rounded-xl bg-green-50 items-center justify-center">
                <Feather name="check-circle" size={16} color="#22C55E" />
              </View>
              <Text className="flex-1 text-base font-medium text-gray-900 ml-3">
                {share.group?.name ?? 'Unknown Group'}
              </Text>
              <Pressable
                className="p-2 rounded-lg bg-red-50"
                onPress={() => handleUnshare(share.group_id)}
              >
                <Feather name="x" size={14} color="#EF4444" />
              </Pressable>
            </View>
          ))}

          {/* Available groups to share to */}
          {availableGroups.map((group) => (
            <Pressable
              key={group.id}
              className="flex-row items-center bg-white rounded-2xl p-4 mb-2"
              style={{ borderWidth: 1.5, borderColor: '#F3F4F6', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}
              onPress={() => handleShare(group)}
            >
              <View className="w-10 h-10 rounded-xl bg-gray-50 items-center justify-center">
                <Feather name="users" size={14} color="#A3A3A3" />
              </View>
              <Text className="flex-1 text-base text-gray-400 ml-3">{group.name}</Text>
              <Feather name="plus-circle" size={18} color={COLORS.primary} />
            </Pressable>
          ))}

          {groups.length === 0 && (
            <Text className="text-base text-gray-300 text-center py-4">
              Join a group to share this goal
            </Text>
          )}
        </View>
      </ScrollView>

      {/* iOS Goal DateTime Picker Modal */}
      {Platform.OS === 'ios' && showGoalDatePicker && (
        <Modal transparent animationType="slide">
          <View className="flex-1 justify-end bg-black/30">
            <View className="bg-white rounded-t-3xl px-6 pt-4 pb-8">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-base font-semibold text-gray-900">Goal due date & time</Text>
                <Pressable onPress={confirmGoalDate}>
                  <Text style={{ color: COLORS.primary }} className="text-base font-semibold">Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={tempGoalDate}
                mode="datetime"
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
      {Platform.OS === 'android' && showGoalTimePicker && (
        <DateTimePicker value={tempGoalDate} mode="time" onChange={onGoalTimeChange} />
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
    </SafeAreaView>
  );
}
