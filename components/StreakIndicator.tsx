import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { CheckinCadence } from '../lib/types';

interface StreakIndicatorProps {
  currentStreak: number;
  longestStreak: number;
  cadence?: CheckinCadence;
  compact?: boolean;
  onPress?: () => void;
}

function getStreakUnit(cadence: CheckinCadence): string {
  switch (cadence) {
    case 'weekly':
      return 'wk';
    case 'every_2_days':
    case 'every_3_days':
      return 'check-in';
    default:
      return 'day';
  }
}

function getStreakUnitFull(cadence: CheckinCadence, count: number): string {
  switch (cadence) {
    case 'weekly':
      return count === 1 ? 'Week streak' : 'Week streak';
    case 'every_2_days':
    case 'every_3_days':
      return 'Check-in streak';
    default:
      return 'Day streak';
  }
}

/** Map streak count to equivalent days for color thresholds */
function getEquivalentDays(streak: number, cadence: CheckinCadence): number {
  const multiplier = cadence === 'weekly' ? 7 : cadence === 'every_3_days' ? 3 : cadence === 'every_2_days' ? 2 : 1;
  return streak * multiplier;
}

function getMilestones(cadence: CheckinCadence): number[] {
  switch (cadence) {
    case 'weekly':
      return [2, 4, 8];
    case 'every_3_days':
      return [3, 5, 10];
    case 'every_2_days':
      return [3, 7, 15];
    default:
      return [3, 7, 30];
  }
}

export function StreakIndicator({ currentStreak, longestStreak, cadence = 'daily', compact = false, onPress }: StreakIndicatorProps) {
  const eqDays = getEquivalentDays(currentStreak, cadence);
  const flameColor = eqDays >= 30 ? '#EF4444' : eqDays >= 7 ? '#F59E0B' : '#FB923C';
  const unit = getStreakUnit(cadence);

  if (compact) {
    const content = (
      <View className="flex-row items-center justify-center bg-gray-50 rounded-xl px-3 h-10">
        <Feather name="zap" size={13} color={flameColor} />
        <Text style={{ color: flameColor }} className="text-base font-bold ml-1">
          {currentStreak}
        </Text>
        <Text style={{ color: flameColor }} className="text-[10px] font-medium ml-0.5 opacity-70">
          {unit}
        </Text>
      </View>
    );
    return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
  }

  const milestones = getMilestones(cadence);
  const unitFull = getStreakUnitFull(cadence, currentStreak);

  return (
    <View>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View
            style={{ backgroundColor: flameColor + '15' }}
            className="w-11 h-11 rounded-xl items-center justify-center mr-3"
          >
            <Feather name="zap" size={20} color={flameColor} />
          </View>
          <View>
            <Text className="text-2xl font-bold text-gray-900 tracking-tight">{currentStreak}</Text>
            <Text className="text-xs text-gray-400">{unitFull}</Text>
          </View>
        </View>

        <View className="items-end">
          <Text className="text-base font-semibold text-gray-600">{longestStreak}</Text>
          <Text className="text-xs text-gray-400 uppercase tracking-wider">Best</Text>
        </View>
      </View>

      {/* Streak milestones */}
      <View className="flex-row mt-4 pt-3 border-t border-gray-100">
        {milestones.map((m) => (
          <StreakMilestone key={m} target={m} current={currentStreak} unit={unit} />
        ))}
      </View>
    </View>
  );
}

function StreakMilestone({ target, current, unit }: { target: number; current: number; unit: string }) {
  const reached = current >= target;

  return (
    <View className="flex-1 items-center">
      <View
        className={`w-7 h-7 rounded-lg items-center justify-center ${
          reached ? 'bg-green-500' : 'bg-gray-100'
        }`}
      >
        {reached ? (
          <Feather name="check" size={12} color="#fff" />
        ) : (
          <Text className="text-xs text-gray-400 font-medium">{target}</Text>
        )}
      </View>
      <Text className={`text-xs mt-1 font-medium ${reached ? 'text-green-600' : 'text-gray-400'}`}>
        {target}
      </Text>
      <Text className={`text-[10px] mt-0.5 ${reached ? 'text-green-500' : 'text-gray-300'}`}>
        {unit}{target !== 1 ? 's' : ''}
      </Text>
    </View>
  );
}
