import React from 'react';
import { View, Pressable, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';

const TABS = [
  { label: 'Groups', icon: 'users' as const, path: '/(tabs)/groups' },
  { label: 'Goals', icon: 'target' as const, path: '/(tabs)' },
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
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
        backgroundColor: 'transparent',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#FFFFFF',
          borderRadius: 999,
          paddingVertical: 8,
          paddingHorizontal: 8,
          shadowColor: '#1F1B17',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.08,
          shadowRadius: 20,
          elevation: 10,
          borderWidth: 1,
          borderColor: '#F0EDE8',
        }}
      >
        {TABS.map((tab) => {
          const active = getIsActive(tab.path);
          return (
            <Pressable
              key={tab.path}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                height: 48,
                borderRadius: 999,
                backgroundColor: active ? COLORS.primary : 'transparent',
                paddingHorizontal: 12,
              }}
              onPress={() => router.navigate(tab.path as any)}
            >
              <Feather
                name={tab.icon}
                size={20}
                color={active ? '#FFFFFF' : '#7A716A'}
              />
              {active && (
                <Text
                  style={{
                    marginLeft: 8,
                    fontSize: 14,
                    fontWeight: '600',
                    color: '#FFFFFF',
                    letterSpacing: 0.1,
                  }}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
