import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, Modal, Animated, Dimensions, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../constants';

// --------------- Types ---------------

interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface AlertConfig {
  title: string;
  message?: string;
  icon?: 'alert-circle' | 'check-circle' | 'info' | 'trash-2' | 'log-out' | 'x-circle' | 'user-plus' | 'users';
  buttons?: AlertButton[];
}

interface AlertContextType {
  showAlert: (config: AlertConfig) => void;
}

const AlertContext = createContext<AlertContextType>({
  showAlert: () => {},
});

export const useAlert = () => useContext(AlertContext);

// --------------- Provider ---------------

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  const showAlert = useCallback((cfg: AlertConfig) => {
    setConfig(cfg);
    setVisible(true);
    fadeAnim.setValue(0);
    scaleAnim.setValue(0.9);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 100, useNativeDriver: true }),
    ]).start();
  }, []);

  const dismiss = useCallback((onPress?: () => void) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setVisible(false);
      setConfig(null);
      onPress?.();
    });
  }, []);

  const getIcon = (icon?: AlertConfig['icon'], buttons?: AlertButton[]) => {
    const hasDestructive = buttons?.some((b) => b.style === 'destructive');
    const resolved = icon ?? (hasDestructive ? 'alert-circle' : 'check-circle');
    const iconColorMap: Record<string, { bg: string; fg: string }> = {
      'alert-circle': { bg: '#FEF2F2', fg: '#EF4444' },
      'x-circle': { bg: '#FEF2F2', fg: '#EF4444' },
      'trash-2': { bg: '#FEF2F2', fg: '#EF4444' },
      'log-out': { bg: '#FEF2F2', fg: '#EF4444' },
      'check-circle': { bg: '#F0FDF4', fg: '#22C55E' },
      'info': { bg: '#FBF1EB', fg: COLORS.primary },
      'user-plus': { bg: '#FBF1EB', fg: COLORS.primary },
      'users': { bg: '#FBF1EB', fg: COLORS.primary },
    };
    const colors = iconColorMap[resolved] ?? { bg: '#FBF1EB', fg: COLORS.primary };
    return { name: resolved, ...colors };
  };

  const buttons = config?.buttons ?? [{ text: 'OK', style: 'default' as const }];
  const iconInfo = getIcon(config?.icon, buttons);

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <Modal visible={visible} transparent statusBarTranslucent animationType="none">
        <Animated.View
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', opacity: fadeAnim }}
        >
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => dismiss()} />
          <Animated.View
            style={{
              width: Dimensions.get('window').width - 56,
              maxWidth: 340,
              backgroundColor: '#FFFFFF',
              borderRadius: 24,
              paddingTop: 28,
              paddingBottom: 20,
              paddingHorizontal: 24,
              transform: [{ scale: scaleAnim }],
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.15,
              shadowRadius: 24,
            }}
          >
            {/* Icon */}
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  backgroundColor: iconInfo.bg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name={iconInfo.name as any} size={24} color={iconInfo.fg} />
              </View>
            </View>

            {/* Title */}
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#171717', textAlign: 'center', marginBottom: 8 }}>
              {config?.title}
            </Text>

            {/* Message */}
            {config?.message && (
              <Text style={{ fontSize: 16, color: '#737373', textAlign: 'center', lineHeight: 22, marginBottom: 4 }}>
                {config.message}
              </Text>
            )}

            {/* Buttons */}
            <View style={{ marginTop: 20 }}>
              {buttons.length === 1 ? (
                // Single button — full width primary
                <Pressable
                  onPress={() => dismiss(buttons[0].onPress)}
                  style={{
                    backgroundColor: COLORS.primary,
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
                    {buttons[0].text}
                  </Text>
                </Pressable>
              ) : buttons.filter((b) => b.style !== 'cancel' && b.style !== 'destructive').length > 2 ? (
                // Many options — scrollable list (e.g. contact picker)
                <View>
                  <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                    {buttons
                      .filter((b) => b.style !== 'cancel')
                      .map((btn, idx) => (
                        <Pressable
                          key={idx}
                          onPress={() => dismiss(btn.onPress)}
                          style={{
                            backgroundColor: '#F9FAFB',
                            borderRadius: 12,
                            paddingVertical: 12,
                            paddingHorizontal: 14,
                            marginBottom: 6,
                            flexDirection: 'row',
                            alignItems: 'center',
                          }}
                        >
                          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#FBF1EB', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                            <Feather name="user" size={14} color={COLORS.primary} />
                          </View>
                          <Text style={{ color: '#171717', fontSize: 16, fontWeight: '500', flex: 1 }} numberOfLines={1}>
                            {btn.text}
                          </Text>
                          <Feather name="chevron-right" size={14} color="#D4D4D4" />
                        </Pressable>
                      ))}
                  </ScrollView>
                  {buttons
                    .filter((b) => b.style === 'cancel')
                    .map((btn, idx) => (
                      <Pressable
                        key={`cancel-${idx}`}
                        onPress={() => dismiss(btn.onPress)}
                        style={{
                          backgroundColor: '#F5F5F5',
                          borderRadius: 14,
                          paddingVertical: 14,
                          alignItems: 'center',
                          marginTop: 6,
                        }}
                      >
                        <Text style={{ color: '#525252', fontSize: 16, fontWeight: '600' }}>
                          {btn.text}
                        </Text>
                      </Pressable>
                    ))}
                </View>
              ) : (
                // 2-3 buttons — stack vertically, action first then cancel
                <View>
                  {buttons
                    .filter((b) => b.style !== 'cancel')
                    .map((btn, idx) => (
                      <Pressable
                        key={idx}
                        onPress={() => dismiss(btn.onPress)}
                        style={{
                          backgroundColor: btn.style === 'destructive' ? '#EF4444' : COLORS.primary,
                          borderRadius: 14,
                          paddingVertical: 14,
                          alignItems: 'center',
                          marginBottom: 8,
                        }}
                      >
                        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
                          {btn.text}
                        </Text>
                      </Pressable>
                    ))}
                  {buttons
                    .filter((b) => b.style === 'cancel')
                    .map((btn, idx) => (
                      <Pressable
                        key={`cancel-${idx}`}
                        onPress={() => dismiss(btn.onPress)}
                        style={{
                          backgroundColor: '#F5F5F5',
                          borderRadius: 14,
                          paddingVertical: 14,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: '#525252', fontSize: 16, fontWeight: '600' }}>
                          {btn.text}
                        </Text>
                      </Pressable>
                    ))}
                </View>
              )}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </AlertContext.Provider>
  );
}
