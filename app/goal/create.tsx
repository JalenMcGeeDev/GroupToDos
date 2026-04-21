import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useCreateGoal } from '../../hooks/use-goals';
import { useGenerateActions } from '../../hooks/use-generate-actions';
import { COLORS } from '../../constants';
import { useAlert } from '../../components/AlertProvider';

interface ActionDraft {
  title: string;
  dueDate: Date | null;
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDateTime(date: Date) {
  return `${formatDate(date)} at ${formatTime(date)}`;
}

export default function CreatePersonalGoalScreen() {
  const router = useRouter();
  const createGoal = useCreateGoal();
  const generateActions = useGenerateActions();
  const { showAlert } = useAlert();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState<Date>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setHours(17, 0, 0, 0);
    return d;
  });
  const [actions, setActions] = useState<ActionDraft[]>([
    { title: '', dueDate: null },
    { title: '', dueDate: null },
  ]);
  const actionRefs = useRef<(TextInput | null)[]>([]);

  // Goal due date picker state
  const [showGoalDatePicker, setShowGoalDatePicker] = useState(false);
  const [showGoalTimePicker, setShowGoalTimePicker] = useState(false);
  const [tempGoalDate, setTempGoalDate] = useState<Date>(dueDate);

  // Action due date picker state
  const [actionDateIndex, setActionDateIndex] = useState<number | null>(null);
  const [showActionDatePicker, setShowActionDatePicker] = useState(false);
  const [tempActionDate, setTempActionDate] = useState<Date>(new Date());

  const canCreate = title.trim().length > 0 && actions.some((a) => a.title.trim().length > 0);

  const addAction = () => {
    setActions([...actions, { title: '', dueDate: null }]);
    setTimeout(() => actionRefs.current[actions.length]?.focus(), 100);
  };

  const updateActionTitle = (index: number, text: string) => {
    setActions(actions.map((a, i) => (i === index ? { ...a, title: text } : a)));
  };

  const removeAction = (index: number) => {
    if (actions.length <= 1) return;
    setActions(actions.filter((_, i) => i !== index));
  };

  // --- Goal date/time picker handlers ---
  const openGoalDatePicker = () => {
    setTempGoalDate(dueDate);
    setShowGoalDatePicker(true);
  };

  const onGoalDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowGoalDatePicker(false);
      if (selected) {
        // Merge selected date with existing time
        const merged = new Date(selected);
        merged.setHours(dueDate.getHours(), dueDate.getMinutes(), 0, 0);
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
        setDueDate(merged);
      }
    } else if (selected) {
      setTempGoalDate(selected);
    }
  };

  const confirmGoalDate = () => {
    setDueDate(tempGoalDate);
    setShowGoalDatePicker(false);
  };

  // --- Action date picker handlers ---
  const openActionDatePicker = (index: number) => {
    setActionDateIndex(index);
    setTempActionDate(actions[index].dueDate ?? new Date());
    setShowActionDatePicker(true);
  };

  const onActionDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowActionDatePicker(false);
      if (selected && actionDateIndex !== null) {
        setActions(actions.map((a, i) => (i === actionDateIndex ? { ...a, dueDate: selected } : a)));
        setActionDateIndex(null);
      }
    } else if (selected) {
      setTempActionDate(selected);
    }
  };

  const confirmActionDate = () => {
    if (actionDateIndex !== null) {
      setActions(actions.map((a, i) => (i === actionDateIndex ? { ...a, dueDate: tempActionDate } : a)));
    }
    setShowActionDatePicker(false);
    setActionDateIndex(null);
  };

  const clearActionDate = (index: number) => {
    setActions(actions.map((a, i) => (i === index ? { ...a, dueDate: null } : a)));
  };

  const handleCreate = () => {
    if (!canCreate) return;

    const validActions = actions.filter((a) => a.title.trim());
    const now = new Date();

    createGoal.mutate(
      {
        title: title.trim(),
        startDate: now.toISOString().split('T')[0],
        endDate: dueDate.toISOString(),
        subGoals: validActions.map((a, i) => ({
          title: a.title.trim(),
          level: 'milestone' as const,
          sortOrder: i,
          dueDate: a.dueDate ? a.dueDate.toISOString().split('T')[0] : undefined,
        })),
      },
      {
        onSuccess: () => router.back(),
        onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }),
      }
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View className="flex-row items-center px-6 pt-3 pb-4">
          <Pressable
            className="w-10 h-10 rounded-xl bg-gray-50 items-center justify-center mr-3"
            onPress={() => router.back()}
          >
            <Feather name="arrow-left" size={18} color="#525252" />
          </Pressable>
          <Text className="text-xl font-bold text-gray-900 tracking-tight flex-1">New Goal</Text>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Goal Title */}
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            What's the goal?
          </Text>
          <TextInput
            className="text-lg font-semibold text-gray-900 py-3 border-b border-gray-100 mb-6"
            placeholder="e.g. Run a half marathon"
            placeholderTextColor="#D4D4D4"
            value={title}
            onChangeText={setTitle}
            autoFocus
          />

          {/* Due Date & Time */}
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Due date & time
          </Text>
          <Pressable
            className="flex-row items-center py-3 border-b border-gray-100 mb-8"
            onPress={openGoalDatePicker}
          >
            <Feather name="calendar" size={16} color={COLORS.primary} />
            <Text className="text-base text-gray-900 ml-2.5 flex-1">
              {formatDateTime(dueDate)}
            </Text>
            <Feather name="chevron-right" size={14} color="#D4D4D4" />
          </Pressable>

          {/* Actions */}
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Actions
            </Text>
            <Pressable
              className="flex-row items-center px-3 py-1.5 rounded-full"
              style={{
                backgroundColor: title.trim().length > 0 && !generateActions.isPending
                  ? '#EEF2FF'
                  : '#F5F5F5',
              }}
              onPress={() => {
                generateActions.mutate(title.trim(), {
                  onSuccess: (data) => {
                    setActions(
                      data.actions.map((a) => ({ title: a.title, dueDate: null }))
                    );
                  },
                  onError: (err) =>
                    showAlert({ title: 'Couldn\'t generate', message: err.message, icon: 'alert-circle' }),
                });
              }}
              disabled={title.trim().length === 0 || generateActions.isPending}
            >
              {generateActions.isPending ? (
                <ActivityIndicator size={12} color={COLORS.primary} />
              ) : (
                <Feather name="zap" size={12} color={title.trim().length > 0 ? COLORS.primary : '#D4D4D4'} />
              )}
              <Text
                className={`text-xs font-semibold ml-1 ${
                  title.trim().length > 0 ? 'text-blue-500' : 'text-gray-300'
                }`}
              >
                {generateActions.isPending ? 'Generating...' : 'Generate actions'}
              </Text>
            </Pressable>
          </View>
          <Text className="text-xs text-gray-300 mb-4">Steps to get there — check them off as you go</Text>

          {actions.map((action, i) => (
            <View key={i} className="mb-3">
              <View className="flex-row items-center">
                <View className="w-5 h-5 rounded-full border-2 border-gray-200 mr-3" />
                <TextInput
                  ref={(ref) => { actionRefs.current[i] = ref; }}
                  className="flex-1 text-base text-gray-900 py-2.5 border-b border-gray-100"
                  placeholder={`Action ${i + 1}`}
                  placeholderTextColor="#D4D4D4"
                  value={action.title}
                  onChangeText={(text) => updateActionTitle(i, text)}
                  returnKeyType="next"
                  onSubmitEditing={() => {
                    if (i === actions.length - 1) {
                      addAction();
                    } else {
                      actionRefs.current[i + 1]?.focus();
                    }
                  }}
                />
                {actions.length > 1 && (
                  <Pressable className="p-2 ml-1" onPress={() => removeAction(i)}>
                    <Feather name="x" size={14} color="#D4D4D4" />
                  </Pressable>
                )}
              </View>
              {/* Action due date row */}
              <View className="flex-row items-center ml-8 mt-1">
                <Pressable
                  className="flex-row items-center py-1"
                  onPress={() => openActionDatePicker(i)}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Feather
                    name="calendar"
                    size={12}
                    color={action.dueDate ? COLORS.primary : '#D4D4D4'}
                  />
                  <Text
                    className={`text-xs ml-1.5 ${action.dueDate ? 'text-gray-600' : 'text-gray-300'}`}
                  >
                    {action.dueDate ? formatDate(action.dueDate) : 'Add due date'}
                  </Text>
                </Pressable>
                {action.dueDate && (
                  <Pressable className="p-1 ml-1" onPress={() => clearActionDate(i)}>
                    <Feather name="x" size={10} color="#D4D4D4" />
                  </Pressable>
                )}
              </View>
            </View>
          ))}

          <Pressable
            className="flex-row items-center py-3 mt-1"
            onPress={addAction}
          >
            <Feather name="plus" size={16} color={COLORS.primary} />
            <Text style={{ color: COLORS.primary }} className="text-base font-medium ml-1.5">
              Add action
            </Text>
          </Pressable>
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

        {/* Android Goal Date then Time pickers */}
        {Platform.OS === 'android' && showGoalDatePicker && (
          <DateTimePicker
            value={tempGoalDate}
            mode="date"
            minimumDate={new Date()}
            onChange={onGoalDateChange}
          />
        )}
        {Platform.OS === 'android' && showGoalTimePicker && (
          <DateTimePicker
            value={tempGoalDate}
            mode="time"
            onChange={onGoalTimeChange}
          />
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

        {/* Android Action Date Picker */}
        {Platform.OS === 'android' && showActionDatePicker && (
          <DateTimePicker
            value={tempActionDate}
            mode="date"
            minimumDate={new Date()}
            onChange={onActionDateChange}
          />
        )}

        {/* Create Button */}
        <View
          className="px-6 py-5 bg-white"
          style={{ shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 3 }}
        >
          <Pressable
            className="rounded-2xl py-4 items-center"
            style={{
              backgroundColor: canCreate
                ? createGoal.isPending ? COLORS.primaryLight : COLORS.primary
                : '#F5F5F5',
            }}
            onPress={handleCreate}
            disabled={!canCreate || createGoal.isPending}
          >
            {createGoal.isPending ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text
                className={`text-base font-semibold tracking-wide ${canCreate ? 'text-white' : 'text-gray-300'}`}
              >
                Create Goal
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
