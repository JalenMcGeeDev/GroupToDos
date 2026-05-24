import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Modal,
  Animated,
  Dimensions,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import LottieView from 'lottie-react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useCreateGoal } from '../hooks/use-goals';
import { useGenerateActions } from '../hooks/use-generate-actions';
import { COLORS } from '../constants';
import { useAlert } from './AlertProvider';
import { supabase } from '../lib/supabase';
import * as Notifications from 'expo-notifications';

interface ActionDraft {
  title: string;
  dueDate: Date | null;
}

export interface GoalCreationWizardProps {
  groupId?: string;
  groupName?: string;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const TOTAL_STEPS = 4;

const QUICK_DATES = [
  { label: '1W', compute: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d; } },
  { label: '1M', compute: () => { const d = new Date(); d.setMonth(d.getMonth() + 1); d.setHours(9, 0, 0, 0); return d; } },
  { label: '1Y', compute: () => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); d.setHours(9, 0, 0, 0); return d; } },
];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const QUICK_REMINDERS = [
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '1Y', days: 365 },
];

function quickReminderDate(dueDate: Date | null, days: number): Date {
  const base = dueDate ? new Date(dueDate) : new Date();
  if (dueDate) { base.setDate(base.getDate() - days); } else { base.setDate(base.getDate() + days); }
  base.setHours(9, 0, 0, 0);
  return base;
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(date: Date) {
  return (
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' +
    date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

function HintCard({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  text: string;
}) {
  return (
    <View
      className="flex-row items-start p-3 rounded-xl mb-6"
      style={{ backgroundColor: '#FFF8F5' }}
    >
      <Feather name={icon} size={14} color={COLORS.primary} style={{ marginTop: 1 }} />
      <Text className="text-sm text-gray-500 ml-2 flex-1 leading-5">{text}</Text>
    </View>
  );
}

function ReviewSection({
  label,
  onEdit,
  children,
}: {
  label: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-5 pb-5 border-b border-gray-100">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {label}
        </Text>
        <Pressable onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text className="text-xs font-semibold" style={{ color: COLORS.primary }}>
            Edit
          </Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

export function GoalCreationWizard({ groupId, groupName }: GoalCreationWizardProps) {
  const router = useRouter();
  const createGoal = useCreateGoal();
  const generateActions = useGenerateActions();
  const { showAlert } = useAlert();
  const insets = useSafeAreaInsets();
  const [keyboardPad, setKeyboardPad] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      setKeyboardPad(e.endCoordinates.height - insets.bottom);
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardPad(0));
    return () => { show.remove(); hide.remove(); };
  }, [insets.bottom]);

  // --- Form state ---
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [actions, setActions] = useState<ActionDraft[]>([
    { title: '', dueDate: null },
  ]);
  const [goalDueDate, setGoalDueDate] = useState<Date | null>(null);
  const [goalReminder, setGoalReminder] = useState<Date | null>(null);
  const [actionReminders, setActionReminders] = useState<(Date | null)[]>([]);
  const [showCreatedModal, setShowCreatedModal] = useState(false);
  const actionRefs = useRef<(TextInput | null)[]>([]);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Step state ---
  const [step, setStep] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // --- Goal date picker state ---
  const [showGoalDatePicker, setShowGoalDatePicker] = useState(false);
  const [tempGoalDate, setTempGoalDate] = useState<Date>(new Date());

  // --- Action date picker state ---
  const [actionDateIndex, setActionDateIndex] = useState<number | null>(null);
  const [showActionDatePicker, setShowActionDatePicker] = useState(false);
  const [tempActionDate, setTempActionDate] = useState<Date>(new Date());

  // --- Reminder picker state ---
  // reminderTarget: 'goal' | action index number
  const [reminderTarget, setReminderTarget] = useState<'goal' | number | null>(null);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [showReminderTimePicker, setShowReminderTimePicker] = useState(false);
  const [tempReminderDate, setTempReminderDate] = useState<Date>(new Date());

  // --- Navigation ---
  const animateToStep = (nextStep: number, direction: 1 | -1) => {
    slideAnim.setValue(direction * SCREEN_WIDTH);
    setStep(nextStep);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    }).start(() => {
      if (nextStep === 1) {
        setTimeout(() => actionRefs.current[0]?.focus(), 50);
      }
    });
  };

  const goNext = () => animateToStep(step + 1, 1);
  const goBack = () => {
    if (step === 0) router.back();
    else animateToStep(step - 1, -1);
  };
  const goToStep = (n: number) => animateToStep(n, n < step ? -1 : 1);

  // --- Derived ---
  const canGoNext0 = title.trim().length > 0;
  const canGoNext1 = actions.some((a) => a.title.trim().length > 0);
  const isLastStep = step === TOTAL_STEPS - 1;
  const isNextDisabled = (step === 0 && !canGoNext0) || (step === 1 && !canGoNext1);

  // --- Action helpers ---
  const addAction = () => {
    setActions((prev) => [...prev, { title: '', dueDate: null }]);
    setTimeout(() => actionRefs.current[actions.length]?.focus(), 100);
  };

  const updateActionTitle = (index: number, text: string) =>
    setActions((prev) => {
      const updated = prev.map((a, i) => (i === index ? { ...a, title: text } : a));
      // auto-append a new empty slot when the last action gets typed into
      if (index === prev.length - 1 && text.trim() !== '') {
        return [...updated, { title: '', dueDate: null }];
      }
      return updated;
    });

  const removeAction = (index: number) => {
    if (actions.length <= 1) return;
    setActions((prev) => prev.filter((_, i) => i !== index));
  };

  const clearActionDate = (index: number) =>
    setActions((prev) => prev.map((a, i) => (i === index ? { ...a, dueDate: null } : a)));

  // --- Goal date handlers ---
  const openGoalDatePicker = () => {
    const base = goalDueDate ? new Date(goalDueDate) : new Date();
    base.setHours(9, 0, 0, 0);
    setTempGoalDate(base);
    setShowGoalDatePicker(true);
  };

  const onGoalDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    setShowGoalDatePicker(false);
    if (selected) {
      const d = new Date(selected);
      d.setHours(9, 0, 0, 0);
      setGoalDueDate(d);
    }
  };

  const confirmGoalDate = () => {
    const d = new Date(tempGoalDate);
    d.setHours(9, 0, 0, 0);
    setGoalDueDate(d);
    setShowGoalDatePicker(false);
  };

  // --- Action date handlers ---
  const openActionDatePicker = (index: number) => {
    setActionDateIndex(index);
    setTempActionDate(actions[index].dueDate ?? new Date());
    setShowActionDatePicker(true);
  };

  const onActionDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowActionDatePicker(false);
      if (selected && actionDateIndex !== null) {
        setActions((prev) =>
          prev.map((a, i) => (i === actionDateIndex ? { ...a, dueDate: selected } : a))
        );
        setActionDateIndex(null);
      }
    } else if (selected) {
      setTempActionDate(selected);
    }
  };

  const confirmActionDate = () => {
    if (actionDateIndex !== null) {
      setActions((prev) =>
        prev.map((a, i) => (i === actionDateIndex ? { ...a, dueDate: tempActionDate } : a))
      );
    }
    setShowActionDatePicker(false);
    setActionDateIndex(null);
  };

  // --- Reminder helpers ---
  const defaultReminderDate = (base: Date | null): Date => {
    if (base) {
      const d = new Date(base);
      d.setDate(d.getDate() - 1);
      d.setHours(9, 0, 0, 0);
      if (d < new Date()) { d.setTime(new Date().getTime() + 60 * 60 * 1000); }
      return d;
    }
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    return d;
  };

  const openReminderPicker = (target: 'goal' | number) => {
    const base = target === 'goal'
      ? goalDueDate
      : (actions[target as number]?.dueDate ?? null);
    const current = target === 'goal'
      ? goalReminder
      : (actionReminders[target as number] ?? null);
    setReminderTarget(target);
    setTempReminderDate(current ?? defaultReminderDate(base));
    setShowReminderPicker(true);
  };

  const confirmReminder = (dateOverride?: Date) => {
    const date = dateOverride ?? tempReminderDate;
    if (reminderTarget === 'goal') {
      setGoalReminder(date);
    } else if (reminderTarget !== null) {
      setActionReminders((prev) => {
        const next = [...prev];
        next[reminderTarget as number] = date;
        return next;
      });
    }
    setShowReminderPicker(false);
    setReminderTarget(null);
  };

  const clearReminder = (target: 'goal' | number) => {
    if (target === 'goal') {
      setGoalReminder(null);
    } else {
      setActionReminders((prev) => {
        const next = [...prev];
        next[target as number] = null;
        return next;
      });
    }
  };

  // --- Submit ---
  const handleCreate = () => {
    const validActions = actions.filter((a) => a.title.trim());
    const now = new Date();

    const scheduleAndStoreReminders = async (goalId: string, goalGroupId: string | null, goalTitle: string) => {
      // Ensure permissions
      const { status } = await Notifications.getPermissionsAsync();
      const effectiveStatus =
        status !== 'granted' ? (await Notifications.requestPermissionsAsync()).status : status;
      if (effectiveStatus !== 'granted') return;

      const reminderRows: {
        goal_id: string;
        sub_goal_id: string | null;
        notification_id: string;
        remind_at: string;
      }[] = [];

      const dataBase = {
        goal_id: goalId,
        ...(goalGroupId ? { group_id: goalGroupId } : {}),
      };

      // Goal-level reminder
      if (goalReminder && goalReminder > new Date()) {
        const notifId = await Notifications.scheduleNotificationAsync({
          content: {
            title: '🎯 Goal reminder',
            body: goalTitle,
            sound: true,
            data: { type: 'goal_reminder', ...dataBase },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: goalReminder },
        });
        reminderRows.push({
          goal_id: goalId,
          sub_goal_id: null,
          notification_id: notifId,
          remind_at: goalReminder.toISOString(),
        });
      }

      // Action reminders — look up sub-goal IDs by sort_order
      const hasActionReminders = validActions.some((_, i) => {
        const r = actionReminders[i];
        return r && r > new Date();
      });

      let subGoalIds: (string | null)[] = validActions.map(() => null);
      if (hasActionReminders) {
        const { data: subGoals } = await supabase
          .from('sub_goals')
          .select('id, sort_order')
          .eq('goal_id', goalId)
          .order('sort_order', { ascending: true });
        if (subGoals) {
          subGoalIds = validActions.map((_, i) => (subGoals[i] as any)?.id ?? null);
        }
      }

      for (let i = 0; i < validActions.length; i++) {
        const r = actionReminders[i];
        if (r && r > new Date()) {
          const notifId = await Notifications.scheduleNotificationAsync({
            content: {
              title: '✅ Action reminder',
              body: `${goalTitle} · ${validActions[i].title}`,
              sound: true,
              data: {
                type: 'action_reminder',
                ...dataBase,
                ...(subGoalIds[i] ? { sub_goal_id: subGoalIds[i] } : {}),
              },
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r },
          });
          reminderRows.push({
            goal_id: goalId,
            sub_goal_id: subGoalIds[i],
            notification_id: notifId,
            remind_at: r.toISOString(),
          });
        }
      }

      // Persist notification IDs so they can be cancelled and crons can de-dupe
      if (reminderRows.length > 0) {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          await supabase
            .from('scheduled_reminders')
            .insert(reminderRows.map((r) => ({ ...r, user_id: authUser.id })));
        }
      }
    };

    createGoal.mutate(
      {
        ...(groupId ? { groupId } : {}),
        title: title.trim(),
        description: description.trim() || undefined,
        startDate: now.toISOString().split('T')[0],
        endDate: goalDueDate ? goalDueDate.toISOString() : undefined,
        subGoals: validActions.map((a, i) => ({
          title: a.title.trim(),
          level: 'milestone' as const,
          sortOrder: i,
          dueDate: a.dueDate ? a.dueDate.toISOString().split('T')[0] : undefined,
        })),
      },
      {
        onSuccess: (goal) => {
          scheduleAndStoreReminders(goal.id, goal.group_id ?? null, title.trim()).catch(() => {
            showAlert({
              title: 'Reminder error',
              message: 'Goal created, but some reminders could not be scheduled. Check notification permissions.',
              icon: 'bell',
            });
          });
          setShowCreatedModal(true);
          dismissTimerRef.current = setTimeout(() => {
            setShowCreatedModal(false);
            router.back();
          }, 2000);
        },
        onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }),
      }
    );
  };

  // --- Step renderers ---

  const renderStep0 = () => (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 120 }}
      keyboardShouldPersistTaps="handled"
    >
      <HintCard
        icon="target"
        text='Good goals are Specific and Measurable. Try "Run 5km without stopping by June 30" instead of "Get fit".'
      />
      <Text className="text-2xl font-bold text-gray-900 mb-6">What's the goal?</Text>
      <TextInput
        className="text-lg font-semibold text-gray-900 py-3 border-b-2 border-gray-100 mb-4"
        placeholder="e.g. Run a half marathon"
        placeholderTextColor="#D4D4D4"
        value={title}
        onChangeText={setTitle}
        autoFocus
        returnKeyType="next"
        onSubmitEditing={() => { if (canGoNext0) goNext(); }}
      />
      <TextInput
        className="text-sm text-gray-500 py-3 border-b border-gray-100 leading-5"
        placeholder="Description (optional)"
        placeholderTextColor="#D4D4D4"
        value={description}
        onChangeText={setDescription}
        multiline
        blurOnSubmit={false}
        returnKeyType="default"
      />
    </ScrollView>
  );

  const renderStep1 = () => (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 120 }}
      keyboardShouldPersistTaps="handled"
    >
      <HintCard
        icon="list"
        text="Break your goal into small, concrete actions. The more specific each action, the easier it is to track your progress."
      />
      <View className="flex-row items-center justify-between mb-6">
        <Text className="text-2xl font-bold text-gray-900">What are the actions?</Text>
        <Pressable
          className="flex-row items-center px-3 py-1.5 rounded-full"
          style={{
            backgroundColor:
              title.trim().length > 0 && !generateActions.isPending ? '#FFF0EB' : '#F5F5F5',
          }}
          onPress={() => {
            generateActions.mutate(title.trim(), {
              onSuccess: (data) =>
                setActions([
                  ...data.actions.map((a) => ({ title: a.title, dueDate: null })),
                  { title: '', dueDate: null },
                ]),
              onError: (err) =>
                showAlert({
                  title: "Couldn't generate",
                  message: err.message,
                  icon: 'alert-circle',
                }),
            });
          }}
          disabled={title.trim().length === 0 || generateActions.isPending}
        >
          {generateActions.isPending ? (
            <ActivityIndicator size={12} color={COLORS.primary} />
          ) : (
            <Feather
              name="zap"
              size={12}
              color={title.trim().length > 0 ? COLORS.primary : '#D4D4D4'}
            />
          )}
          <Text
            className="text-xs font-semibold ml-1"
            style={{ color: title.trim().length > 0 ? COLORS.primary : '#D4D4D4' }}
          >
            {generateActions.isPending ? 'Generating…' : 'Generate'}
          </Text>
        </Pressable>
      </View>

      {actions.map((action, i) => {
        const isVisible = i === 0 || actions[i - 1].title.trim() !== '';
        if (!isVisible) return null;
        return (
          <View key={i} className="mb-3">
            <View className="flex-row items-center">
              <TextInput
                ref={(ref) => { actionRefs.current[i] = ref; }}
                className="flex-1 text-base text-gray-900 py-2.5 border-b border-gray-100"
                placeholder={`Action ${i + 1}`}
                placeholderTextColor="#D4D4D4"
                value={action.title}
                onChangeText={(text) => updateActionTitle(i, text)}
                returnKeyType="next"
                onSubmitEditing={() => {
                  setTimeout(() => actionRefs.current[i + 1]?.focus(), 50);
                }}
              />
              {action.title.trim() !== '' && (
                <Pressable className="p-2 ml-1" onPress={() => removeAction(i)}>
                  <Feather name="x" size={14} color="#D4D4D4" />
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );

  const renderStep2 = () => {
    const filledActions = actions.filter((a) => a.title.trim());
    const filledWithIndex = actions
      .map((action, i) => ({ action, i }))
      .filter(({ action }) => action.title.trim());

    return (
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <HintCard
          icon="clock"
          text="Goals with a deadline are significantly more likely to be achieved. Pick a realistic target date — you can always adjust it later."
        />
        <Text className="text-2xl font-bold text-gray-900 mb-6">
          When do you want to finish?
        </Text>

        {/* ── Goal section ── */}
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Goal
        </Text>
        <View className="rounded-2xl border border-gray-100 overflow-hidden mb-6">
          {/* Due date row */}
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Feather name="calendar" size={15} color="#9CA3AF" />
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#9CA3AF', marginLeft: 8, flex: 1 }}>Due date</Text>
              {goalDueDate && (
                <>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text, marginRight: 8 }}>{formatDate(goalDueDate)}</Text>
                  <Pressable onPress={() => { setGoalDueDate(null); setGoalReminder(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="x" size={13} color="#D4D4D4" />
                  </Pressable>
                </>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {QUICK_DATES.map(({ label, compute }) => {
                const qd = compute();
                const isSelected = !!goalDueDate && isSameDay(goalDueDate, qd);
                return (
                  <Pressable
                    key={label}
                    onPress={() => setGoalDueDate(compute())}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: isSelected ? COLORS.primary : '#F3F4F6' }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: isSelected ? '#fff' : '#6B7280' }}>{label}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={openGoalDatePicker}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}
              >
                <Feather name="calendar" size={14} color="#6B7280" />
              </Pressable>
            </View>
          </View>
          {/* Reminder row */}
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Feather name="bell" size={15} color="#9CA3AF" />
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#9CA3AF', marginLeft: 8, flex: 1 }}>Reminder</Text>
              {goalReminder && (
                <>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.primary, marginRight: 8 }}>{formatDateTime(goalReminder)}</Text>
                  <Pressable onPress={() => clearReminder('goal')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="x" size={13} color="#D4D4D4" />
                  </Pressable>
                </>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {QUICK_REMINDERS.map(({ label, days }) => {
                const rd = quickReminderDate(goalDueDate, days);
                const isSelected = !!goalReminder && isSameDay(goalReminder, rd);
                return (
                  <Pressable
                    key={label}
                    onPress={() => setGoalReminder(quickReminderDate(goalDueDate, days))}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: isSelected ? COLORS.primary : '#F3F4F6' }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: isSelected ? '#fff' : '#6B7280' }}>{label}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => openReminderPicker('goal')}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}
              >
                <Feather name="calendar" size={14} color="#6B7280" />
              </Pressable>
            </View>
          </View>
        </View>

        {/* ── Per-action section ── */}
        {filledActions.length > 0 && (
          <>
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Actions
            </Text>
            {filledWithIndex.map(({ action, i }) => {
              const reminder = actionReminders[i] ?? null;
              return (
                <View key={i} className="rounded-2xl border border-gray-100 overflow-hidden mb-3">
                  {/* Action label */}
                  <View className="px-4 pt-3 pb-2">
                    <Text className="text-sm font-semibold text-gray-800" numberOfLines={2}>
                      {action.title}
                    </Text>
                  </View>
                  {/* Due date row */}
                  <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Feather name="calendar" size={13} color="#9CA3AF" />
                      <Text style={{ fontSize: 11, fontWeight: '500', color: '#9CA3AF', marginLeft: 7, flex: 1 }}>Due date</Text>
                      {action.dueDate && (
                        <>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.text, marginRight: 8 }}>{formatDate(action.dueDate)}</Text>
                          <Pressable onPress={() => clearActionDate(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Feather name="x" size={12} color="#D4D4D4" />
                          </Pressable>
                        </>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      {QUICK_DATES.map(({ label, compute }) => {
                        const qd = compute();
                        const isSelected = !!action.dueDate && isSameDay(action.dueDate, qd);
                        return (
                          <Pressable
                            key={label}
                            onPress={() => setActions((prev) => prev.map((a, idx) => idx === i ? { ...a, dueDate: compute() } : a))}
                            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: isSelected ? COLORS.primary : '#F3F4F6' }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '600', color: isSelected ? '#fff' : '#6B7280' }}>{label}</Text>
                          </Pressable>
                        );
                      })}
                      <Pressable
                        onPress={() => openActionDatePicker(i)}
                        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Feather name="calendar" size={13} color="#6B7280" />
                      </Pressable>
                    </View>
                  </View>
                  {/* Reminder row */}
                  <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Feather name="bell" size={13} color="#9CA3AF" />
                      <Text style={{ fontSize: 11, fontWeight: '500', color: '#9CA3AF', marginLeft: 7, flex: 1 }}>Reminder</Text>
                      {reminder && (
                        <>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.primary, marginRight: 8 }}>{formatDateTime(reminder)}</Text>
                          <Pressable onPress={() => clearReminder(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Feather name="x" size={12} color="#D4D4D4" />
                          </Pressable>
                        </>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      {QUICK_REMINDERS.map(({ label, days }) => {
                        const rd = quickReminderDate(action.dueDate, days);
                        const isSelected = !!reminder && isSameDay(reminder, rd);
                        return (
                          <Pressable
                            key={label}
                            onPress={() => setActionReminders((prev) => { const next = [...prev]; next[i] = quickReminderDate(action.dueDate, days); return next; })}
                            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: isSelected ? COLORS.primary : '#F3F4F6' }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '600', color: isSelected ? '#fff' : '#6B7280' }}>{label}</Text>
                          </Pressable>
                        );
                      })}
                      <Pressable
                        onPress={() => openReminderPicker(i)}
                        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Feather name="calendar" size={13} color="#6B7280" />
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    );
  };

  const renderStep3 = () => {
    const validActions = actions.filter((a) => a.title.trim());
    return (
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Goal label + edit row */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
            paddingHorizontal: 4,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.8, textTransform: 'uppercase' }}>
            Goal
          </Text>
          <Pressable onPress={() => goToStep(0)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: '600' }}>Edit</Text>
          </Pressable>
        </View>

        {/* Hero goal card */}
        <View
          style={{ backgroundColor: COLORS.text, borderRadius: 24, padding: 28, marginBottom: 12 }}
        >
          {/* Goal title */}
          <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800', lineHeight: 34, marginBottom: 6 }}>
            {title}
          </Text>
          {description.trim() ? (
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginBottom: 16 }}>
              {description}
            </Text>
          ) : <View style={{ marginBottom: 16 }} />}

          {/* Date / reminder pills */}
          {(goalDueDate || goalReminder) && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {goalDueDate && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    borderRadius: 99,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <Feather name="calendar" size={12} color="rgba(255,255,255,0.7)" />
                  <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600', marginLeft: 6 }}>
                    {formatDate(goalDueDate)}
                  </Text>
                </View>
              )}
              {goalReminder && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: 'rgba(217,119,87,0.25)',
                    borderRadius: 99,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <Feather name="bell" size={12} color={COLORS.primaryLight} />
                  <Text style={{ color: COLORS.primaryLight, fontSize: 12, fontWeight: '600', marginLeft: 6 }}>
                    {formatDateTime(goalReminder)}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Actions label row */}
        {validActions.length > 0 && (
          <>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 8,
                marginBottom: 10,
                paddingHorizontal: 4,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                {validActions.length} {validActions.length === 1 ? 'Action' : 'Actions'}
              </Text>
              <Pressable onPress={() => goToStep(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: '600' }}>Edit</Text>
              </Pressable>
            </View>

            {validActions.map((a, i) => {
              const reminder = actionReminders[i] ?? null;
              const hasMeta = !!(a.dueDate || reminder);
              return (
                <View
                  key={i}
                  style={{
                    backgroundColor: '#F7F5F2',
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  {/* Number badge */}
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: COLORS.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                      flexShrink: 0,
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{i + 1}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: hasMeta ? 8 : 0 }}>
                      {a.title}
                    </Text>
                    {hasMeta && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {a.dueDate && (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              backgroundColor: '#fff',
                              borderRadius: 99,
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                            }}
                          >
                            <Feather name="calendar" size={11} color="#9CA3AF" />
                            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600', marginLeft: 5 }}>
                              {formatDate(a.dueDate)}
                            </Text>
                          </View>
                        )}
                        {reminder && (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              backgroundColor: '#FFF0EB',
                              borderRadius: 99,
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                            }}
                          >
                            <Feather name="bell" size={11} color={COLORS.primary} />
                            <Text style={{ color: COLORS.primary, fontSize: 11, fontWeight: '600', marginLeft: 5 }}>
                              {formatDateTime(reminder)}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    );
  };

  const renderStepContent = () => {
    switch (step) {
      case 0:
        return renderStep0();
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      default:
        return null;
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
        {/* Header */}
        <View className="flex-row items-center px-6 pt-3 pb-2">
          <Pressable
            className="w-10 h-10 rounded-xl bg-gray-50 items-center justify-center mr-3"
            onPress={goBack}
          >
            <Feather name={step === 0 ? 'x' : 'arrow-left'} size={18} color="#525252" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-xl font-bold text-gray-900 tracking-tight">
              {'New Goal'}
            </Text>
            {groupName && <Text className="text-xs text-gray-400">{groupName}</Text>}
          </View>
        </View>

        {/* Progress bar */}
        <View className="flex-row px-6 pb-3" style={{ gap: 6 }}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: i <= step ? COLORS.primary : '#E5E5E5',
              }}
            />
          ))}
        </View>

        {/* Animated step content */}
        <Animated.View style={{ flex: 1, transform: [{ translateX: slideAnim }] }}>
          {renderStepContent()}
        </Animated.View>

        {/* iOS Goal Date Picker Modal */}
        {Platform.OS === 'ios' && showGoalDatePicker && (
          <Modal transparent animationType="slide">
            <View className="flex-1 justify-end bg-black/30">
              <View className="bg-white rounded-t-3xl px-6 pt-4 pb-8">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-base font-semibold text-gray-900">Goal due date</Text>
                  <Pressable onPress={confirmGoalDate}>
                    <Text className="text-base font-semibold" style={{ color: COLORS.primary }}>
                      Done
                    </Text>
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
          <DateTimePicker
            value={tempGoalDate}
            mode="date"
            minimumDate={new Date()}
            onChange={onGoalDateChange}
          />
        )}

        {/* iOS Action Date Picker Modal */}
        {Platform.OS === 'ios' && showActionDatePicker && (
          <Modal transparent animationType="slide">
            <View className="flex-1 justify-end bg-black/30">
              <View className="bg-white rounded-t-3xl px-6 pt-4 pb-8">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-base font-semibold text-gray-900">Step due date</Text>
                  <Pressable onPress={confirmActionDate}>
                    <Text
                      className="text-base font-semibold"
                      style={{ color: COLORS.primary }}
                    >
                      Done
                    </Text>
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
          <DateTimePicker
            value={tempActionDate}
            mode="date"
            minimumDate={new Date()}
            onChange={onActionDateChange}
          />
        )}

        {/* Goal Created Celebration Modal */}
        <Modal transparent statusBarTranslucent animationType="fade" visible={showCreatedModal}>
          <Pressable
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.6)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onPress={() => { if (dismissTimerRef.current) { clearTimeout(dismissTimerRef.current); dismissTimerRef.current = null; } setShowCreatedModal(false); router.back(); }}
          >
            <LottieView
              source={require('../assets/lottie/celebration-confetti.json')}
              autoPlay
              loop
              speed={1}
              style={{ position: 'absolute', width: '100%', height: '100%' }}
            />
            <Text style={{ fontSize: 64 }}>🎯</Text>
            <Text
              style={{
                fontSize: 30,
                fontWeight: '800',
                color: '#FFFFFF',
                textAlign: 'center',
                marginTop: 12,
                textShadowColor: 'rgba(0,0,0,0.4)',
                textShadowOffset: { width: 0, height: 2 },
                textShadowRadius: 6,
              }}
            >
              Goal Created!
            </Text>
            <Text
              style={{
                fontSize: 16,
                color: '#E5E5E5',
                textAlign: 'center',
                marginTop: 8,
                textShadowColor: 'rgba(0,0,0,0.3)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 4,
              }}
            >
              Now go get it 🔥
            </Text>
          </Pressable>
        </Modal>

        {Platform.OS === 'ios' && showReminderPicker && (
          <Modal transparent animationType="slide">
            <View className="flex-1 justify-end bg-black/30">
              <View className="bg-white rounded-t-3xl px-6 pt-4 pb-8">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-base font-semibold text-gray-900">
                    {reminderTarget === 'goal' ? 'Goal reminder' : 'Action reminder'}
                  </Text>
                  <Pressable onPress={confirmReminder}>
                    <Text className="text-base font-semibold" style={{ color: COLORS.primary }}>
                      Done
                    </Text>
                  </Pressable>
                </View>
                <Text className="text-xs text-gray-400 mb-3">
                  You'll get a notification at this date and time.
                </Text>
                <DateTimePicker
                  value={tempReminderDate}
                  mode="datetime"
                  display="spinner"
                  minimumDate={new Date()}
                  onChange={(_, d) => d && setTempReminderDate(d)}
                />
              </View>
            </View>
          </Modal>
        )}
        {Platform.OS === 'android' && showReminderPicker && (
          <DateTimePicker
            value={tempReminderDate}
            mode="date"
            minimumDate={new Date()}
            onChange={(_, d) => {
              setShowReminderPicker(false);
              if (d) {
                const next = new Date(d);
                next.setHours(tempReminderDate.getHours(), tempReminderDate.getMinutes(), 0, 0);
                setTempReminderDate(next);
                setShowReminderTimePicker(true);
              } else {
                setReminderTarget(null);
              }
            }}
          />
        )}
        {Platform.OS === 'android' && showReminderTimePicker && (
          <DateTimePicker
            value={tempReminderDate}
            mode="time"
            onChange={(_, d) => {
              setShowReminderTimePicker(false);
              if (d) {
                const merged = new Date(tempReminderDate);
                merged.setHours(d.getHours(), d.getMinutes(), 0, 0);
                confirmReminder(merged);
              } else {
                setReminderTarget(null);
              }
            }}
          />
        )}

        {/* Bottom CTA */}
        <View
          className="px-6 py-5 bg-white"
          style={{
            paddingBottom: keyboardPad > 0 ? keyboardPad + 20 : 20,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.04,
            shadowRadius: 8,
            elevation: 3,
          }}
        >
          <Pressable
            className="rounded-2xl py-4 items-center"
            style={{
              backgroundColor: isNextDisabled
                ? '#F5F5F5'
                : isLastStep && createGoal.isPending
                ? COLORS.primaryLight
                : COLORS.primary,
            }}
            onPress={isLastStep ? handleCreate : goNext}
            disabled={isNextDisabled || (isLastStep && createGoal.isPending)}
          >
            {isLastStep && createGoal.isPending ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text
                className="text-base font-semibold tracking-wide"
                style={{ color: isNextDisabled ? '#D4D4D4' : '#FFF' }}
              >
                {isLastStep ? 'Create Goal' : 'Next'}
              </Text>
            )}
          </Pressable>
        </View>
    </SafeAreaView>
  );
}
