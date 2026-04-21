import React from 'react';
import { View, Pressable, Text, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';

const TABS = [
  { label: 'Your Goals', icon: 'target' as const, path: '/(tabs)' },
  { label: 'Your Groups', icon: 'users' as const, path: '/(tabs)/groups' },
  { label: 'Profile', icon: 'user' as const, path: '/(tabs)/profile' },
];

export function PersistentTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const getIsActive = (tabPath: string) => {
    switch (tabPath) {
      case '/(tabs)':
        return pathname === '/' || pathname === '/index' || pathname.startsWith('/goal');
      case '/(tabs)/groups':
        return pathname === '/groups' || pathname.startsWith('/group') || pathname === '/create-group' || pathname === '/join-group';
      case '/(tabs)/profile':
        return pathname === '/profile';
      default:
        return false;
    }
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: '#fff',
        paddingBottom: insets.bottom,
        paddingTop: 8,
        borderTopWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -1 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 0,
      }}
    >
      {TABS.map((tab) => {
        const active = getIsActive(tab.path);
        return (
          <Pressable
            key={tab.path}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 }}
            onPress={() => router.navigate(tab.path as any)}
          >
            <Feather name={tab.icon} size={22} color={active ? COLORS.primary : '#A3A3A3'} />
            <Text
              style={{
                fontSize: 12,
                fontWeight: '500',
                letterSpacing: 0.2,
                color: active ? COLORS.primary : '#A3A3A3',
                marginTop: 2,
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
