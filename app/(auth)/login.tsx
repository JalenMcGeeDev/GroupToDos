import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../constants';
import { useAlert } from '../../components/AlertProvider';

export default function LoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const { showAlert } = useAlert();

  const formatPhone = (raw: string): string => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
    return `+${digits}`;
  };

  const handleSendOTP = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      showAlert({ title: 'Error', message: 'Please enter a valid phone number.', icon: 'alert-circle' });
      return;
    }

    setLoading(true);
    const formatted = formatPhone(phone);
    const { error } = await supabase.auth.signInWithOtp({ phone: formatted });
    setLoading(false);

    if (error) {
      showAlert({ title: 'Error', message: error.message, icon: 'alert-circle' });
    } else {
      router.push({ pathname: '/(auth)/verify', params: { phone: formatted } });
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 px-7 pt-24 pb-12">
        {/* Brand */}
        <View className="mb-12">
          <View
            className="w-14 h-14 rounded-2xl items-center justify-center mb-6"
            style={{ backgroundColor: COLORS.primary }}
          >
            <Feather name="target" size={28} color="#FFF" />
          </View>
          <Text className="text-3xl font-bold text-gray-900 tracking-tight">Cogo</Text>
          <Text className="text-base text-gray-400 mt-2">
            Enter your phone number to get started
          </Text>
        </View>

        {/* Phone Input */}
        <View className="mb-8">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Phone Number
          </Text>
          <View className="flex-row items-center border-b border-gray-200 pb-3">
            <Text className="text-base text-gray-400 mr-2">+1</Text>
            <TextInput
              className="flex-1 text-base text-gray-900"
              placeholder="(555) 123-4567"
              placeholderTextColor="#D4D4D4"
              keyboardType="phone-pad"
              autoComplete="tel"
              value={phone}
              onChangeText={setPhone}
              maxLength={14}
            />
          </View>
        </View>

        {/* Continue Button */}
        <Pressable
          className="rounded-2xl py-4 items-center"
          style={{ backgroundColor: loading ? COLORS.primaryLight : COLORS.primary }}
          onPress={handleSendOTP}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text className="text-white text-base font-semibold tracking-wide">Continue</Text>
          )}
        </Pressable>

        <Text className="text-xs text-gray-300 text-center mt-4 leading-5 px-4">
          We'll send you a verification code via SMS
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
