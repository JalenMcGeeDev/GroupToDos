import React from 'react';
import { View, Text } from 'react-native';
import { GOAL_COLOR } from '../lib/frameworks';

interface ProgressDashboardProps {
  progress: number;
}

export function ProgressDashboard({ progress }: ProgressDashboardProps) {
  return (
    <View>
      <View className="flex-row justify-between mb-1.5">
        <Text className="text-xs text-gray-400 uppercase tracking-wider">Progress</Text>
        <Text className="text-xs font-semibold text-gray-600">{Math.round(progress)}%</Text>
      </View>
      <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <View
          style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: GOAL_COLOR }}
          className="h-full rounded-full"
        />
      </View>
    </View>
  );
}
