import React from 'react';
import { Stack } from 'expo-router';

export default function GoalLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}
