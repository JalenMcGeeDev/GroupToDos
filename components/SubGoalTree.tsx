import React, { useState } from 'react';
import { View, Text, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../constants';
import type { SubGoal } from '../lib/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface SubGoalTreeProps {
  subGoals: SubGoal[];
  onToggle?: (subGoal: SubGoal) => void;
  onDueDatePress?: (subGoal: SubGoal) => void;
}

export function SubGoalTree({
  subGoals,
  onToggle,
  onDueDatePress,
}: SubGoalTreeProps) {
  return (
    <View>
      {subGoals.map((subGoal) => (
        <ActionCard
          key={subGoal.id}
          subGoal={subGoal}
          onToggle={onToggle}
          onDueDatePress={onDueDatePress}
          depth={0}
        />
      ))}
    </View>
  );
}

function ActionCard({
  subGoal,
  onToggle,
  onDueDatePress,
  depth,
}: {
  subGoal: SubGoal;
  onToggle?: (subGoal: SubGoal) => void;
  onDueDatePress?: (subGoal: SubGoal) => void;
  depth: number;
}) {
  const [treeExpanded, setTreeExpanded] = useState(true);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const isCompleted = subGoal.status === 'completed';
  const hasChildren = subGoal.children && subGoal.children.length > 0;
  const isLeaf = !hasChildren;

  const handleCirclePress = () => {
    if (hasChildren) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setTreeExpanded(!treeExpanded);
    } else {
      onToggle?.(subGoal);
    }
  };

  const handleRowPress = () => {
    if (hasChildren) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setTreeExpanded(!treeExpanded);
    } else if (onDueDatePress) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setDetailExpanded(!detailExpanded);
    }
  };

  return (
    <View style={{ marginLeft: depth * 12 }}>
      <View
        className={`bg-white rounded-lg mb-1.5 ${isCompleted ? 'border-gray-100' : 'border-gray-200'}`}
        style={{ borderWidth: 0.5, borderColor: isCompleted ? '#F3F4F6' : '#E5E7EB' }}
      >
        {/* Main row */}
        <Pressable onPress={handleRowPress}>
          <View className="px-3 py-2.5 flex-row items-center">
            {/* Check circle */}
            <Pressable
              onPress={handleCirclePress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              disabled={!hasChildren && !onToggle}
            >
              <View
                className={`w-5 h-5 rounded-full items-center justify-center ${
                  isCompleted
                    ? 'bg-green-500'
                    : onToggle || hasChildren
                      ? 'border-[1.5px] border-gray-300'
                      : 'bg-gray-200'
                }`}
              >
                {isCompleted ? (
                  <Feather name="check" size={11} color="#fff" />
                ) : hasChildren ? (
                  <Feather name={treeExpanded ? 'chevron-down' : 'chevron-right'} size={10} color="#A3A3A3" />
                ) : null}
              </View>
            </Pressable>

            {/* Title */}
            <Text
              className={`text-[13px] flex-1 ml-2.5 ${
                isCompleted ? 'text-gray-400 line-through' : 'text-gray-900 font-medium'
              }`}
              numberOfLines={2}
            >
              {subGoal.title}
            </Text>

            {/* Due date chip (display only — hidden when expanded to avoid duplication) */}
            {subGoal.due_date && !detailExpanded && (
              <View className="flex-row items-center bg-gray-50 px-2 py-0.5 rounded ml-2">
                <Feather name="calendar" size={9} color={COLORS.primary} />
                <Text className="text-[10px] text-gray-500 ml-1">
                  {new Date(subGoal.due_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
            )}

            {/* Expand/collapse chevron for leaf actions — only when owner */}
            {isLeaf && onDueDatePress && (
              <View className="ml-1.5">
                <Feather
                  name={detailExpanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color="#A3A3A3"
                />
              </View>
            )}
          </View>
        </Pressable>

        {/* Expanded detail panel for leaf actions — only when owner can edit */}
        {isLeaf && detailExpanded && onDueDatePress && (
          <View className="px-3 pb-2.5 pt-1">
            {/* Action buttons row */}
            <View className="flex-row mt-1.5" style={{ gap: 6 }}>
              <Pressable
                className="flex-1 flex-row items-center justify-center bg-gray-50 rounded-lg py-2"
                onPress={() => onDueDatePress(subGoal)}
              >
                <Feather name="calendar" size={12} color={subGoal.due_date ? COLORS.primary : '#525252'} />
                <Text className={`text-xs ml-1 ${subGoal.due_date ? 'text-gray-900' : 'text-gray-400'}`}>
                  {subGoal.due_date
                    ? new Date(subGoal.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : 'Add due date'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* Children */}
      {treeExpanded && hasChildren && (
        <View>
          {subGoal.children!.map((child) => (
            <ActionCard
              key={child.id}
              subGoal={child}
              onToggle={onToggle}
              onDueDatePress={onDueDatePress}
              depth={depth + 1}
            />
          ))}
        </View>
      )}
    </View>
  );
}
