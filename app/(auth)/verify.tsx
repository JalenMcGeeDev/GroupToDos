import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../constants';
import { useAlert } from '../../components/AlertProvider';

const CODE_LENGTH = 6;

export default function VerifyScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { showAlert } = useAlert();

  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(30);
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleChange = (text: string, index: number) => {
    // Only allow digits
    const digit = text.replace(/\D/g, '').slice(-1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);

    if (digit && index < CODE_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (digit && index === CODE_LENGTH - 1 && newCode.every((d) => d)) {
      verifyCode(newCode.join(''));
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      const newCode = [...code];
      newCode[index - 1] = '';
      setCode(newCode);
      inputs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (digits.length === CODE_LENGTH) {
      const newCode = digits.split('');
      setCode(newCode);
      inputs.current[CODE_LENGTH - 1]?.focus();
      verifyCode(digits);
    }
  };

  const verifyCode = async (otp: string) => {
    if (!phone) return;
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token: otp,
      type: 'sms',
    });
    setLoading(false);

    if (error) {
      showAlert({ title: 'Invalid Code', message: error.message, icon: 'alert-circle' });
      setCode(Array(CODE_LENGTH).fill(''));
      inputs.current[0]?.focus();
    }
    // On success, auth state listener in auth-store handles navigation
  };

  const handleResend = async () => {
    if (!phone || resendCooldown > 0) return;
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) {
      showAlert({ title: 'Error', message: error.message, icon: 'alert-circle' });
    } else {
      setResendCooldown(30);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 px-7">
        {/* Back button */}
        <Pressable
          className="mt-14 mb-8 w-10 h-10 rounded-full bg-gray-50 items-center justify-center"
          onPress={() => router.back()}
        >
          <Feather name="arrow-left" size={20} color="#404040" />
        </Pressable>

        <View className="mb-10">
          <Text className="text-2xl font-bold text-gray-900 tracking-tight">Enter code</Text>
          <Text className="text-base text-gray-400 mt-2 leading-6">
            We sent a 6-digit code to{'\n'}
            <Text className="text-gray-900 font-medium">{phone}</Text>
          </Text>
        </View>

        {/* OTP Inputs */}
        <View className="flex-row justify-between mb-8" style={{ gap: 8 }}>
          {code.map((digit, i) => (
            <TextInput
              key={i}
              ref={(ref) => { inputs.current[i] = ref; }}
              className={`flex-1 text-center text-xl font-bold rounded-xl py-3 ${
                digit ? 'bg-gray-50 text-gray-900' : 'bg-gray-50 text-gray-300'
              }`}
              style={{ borderWidth: 1.5, borderColor: digit ? COLORS.primary : '#E5E5E5' }}
              value={digit}
              onChangeText={(text) => {
                if (text.length > 1) {
                  handlePaste(text);
                } else {
                  handleChange(text, i);
                }
              }}
              onKeyPress={(e) => handleKeyPress(e, i)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
              autoFocus={i === 0}
            />
          ))}
        </View>

        {/* Verify button */}
        {loading && (
          <View className="items-center py-4">
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text className="text-base text-gray-400 mt-2">Verifying...</Text>
          </View>
        )}

        {/* Resend */}
        <View className="items-center mt-6">
          {resendCooldown > 0 ? (
            <Text className="text-base text-gray-300">
              Resend code in {resendCooldown}s
            </Text>
          ) : (
            <Pressable onPress={handleResend}>
              <Text style={{ color: COLORS.primary }} className="text-base font-semibold">
                Resend Code
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
