import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useGroup } from '../../../../hooks/use-groups';
import { GoalCreationWizard } from '../../../../components/GoalCreationWizard';

export default function CreateGoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: group } = useGroup(id!);

  return <GoalCreationWizard groupId={id!} groupName={group?.name} />;
}
