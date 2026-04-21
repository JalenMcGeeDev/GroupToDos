import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { useCreateGroup } from '../hooks/use-groups';
import { useInviteToGroup } from '../hooks/use-invites';
import { COLORS } from '../constants';
import { useAlert } from '../components/AlertProvider';
import type { InviteResult } from '../lib/types';

export default function CreateGroupScreen() {
  const router = useRouter();
  const createGroup = useCreateGroup();
  const inviteToGroup = useInviteToGroup();

  const [name, setName] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [invitees, setInvitees] = useState<{ name?: string; phone: string }[]>([]);
  const [inviteResults, setInviteResults] = useState<InviteResult[] | null>(null);
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);
  const { showAlert } = useAlert();

  const normalizePhone = (raw: string) => raw.replace(/[^\d]/g, '');

  const addPhone = () => {
    const phone = normalizePhone(phoneInput);
    if (phone.length < 7) {
      showAlert({ title: 'Invalid number', message: 'Please enter a valid phone number.', icon: 'alert-circle' });
      return;
    }
    if (invitees.some((i) => normalizePhone(i.phone) === phone)) {
      showAlert({ title: 'Duplicate', message: 'This number has already been added.', icon: 'info' });
      setPhoneInput('');
      return;
    }
    setInvitees((prev) => [...prev, { phone }]);
    setPhoneInput('');
  };

  const removeInvitee = (index: number) => {
    setInvitees((prev) => prev.filter((_, i) => i !== index));
  };

  const pickFromContacts = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      showAlert({ title: 'Permission required', message: 'Please allow access to your contacts to invite people.', icon: 'info' });
      return;
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
    });

    if (!data.length) {
      showAlert({ title: 'No contacts', message: 'No contacts found on this device.', icon: 'info' });
      return;
    }

    // Filter contacts that have phone numbers
    const withPhones = data.filter((c) => c.phoneNumbers && c.phoneNumbers.length > 0);
    if (!withPhones.length) {
      showAlert({ title: 'No contacts', message: 'No contacts with phone numbers found.', icon: 'info' });
      return;
    }

    // For now, show a simple selection of the first phone number per contact
    // In a production app, you'd use a proper multi-select picker
    const options = withPhones.slice(0, 50).map((c) => ({
      text: `${c.name} (${c.phoneNumbers![0].number})`,
      onPress: () => {
        const phone = normalizePhone(c.phoneNumbers![0].number ?? '');
        if (phone.length < 7) return;
        if (invitees.some((i) => normalizePhone(i.phone) === phone)) return;
        setInvitees((prev) => [...prev, { name: c.name ?? undefined, phone }]);
      },
    }));

    // Show first 5 as branded alert buttons
    showAlert({
      title: 'Select a contact',
      message: 'Choose someone to invite:',
      icon: 'user-plus',
      buttons: [
        ...options.slice(0, 5).map((opt) => ({ text: opt.text, onPress: opt.onPress })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    });
  };

  const openSmsComposer = (phone: string) => {
    const message = encodeURIComponent(
      `Hey! I invited you to join my group on CoGoal. Download the app and sign up with this number to get started!`
    );
    const separator = Platform.OS === 'ios' ? '&' : '?';
    Linking.openURL(`sms:${phone}${separator}body=${message}`);
  };

  const handleCreate = () => {
    if (!name.trim()) {
      showAlert({ title: 'Error', message: 'Please enter a group name.', icon: 'alert-circle' });
      return;
    }

    createGroup.mutate(
      {
        name: name.trim(),
        invitePhones: invitees.map((i) => normalizePhone(i.phone)),
      },
      {
        onSuccess: async (group) => {
          if (invitees.length === 0) {
            router.replace(`/group/${group.id}` as any);
            return;
          }

          setCreatedGroupId(group.id);

          // Send invites
          inviteToGroup.mutate(
            {
              groupId: group.id,
              phones: invitees.map((i) => ({
                phone: normalizePhone(i.phone),
                name: i.name,
              })),
            },
            {
              onSuccess: (results) => {
                setInviteResults(results);
              },
              onError: (err) => {
                showAlert({ title: 'Invite Error', message: err.message, icon: 'alert-circle' });
                router.replace(`/group/${group.id}` as any);
              },
            }
          );
        },
        onError: (err) => {
          showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' });
        },
      }
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Header */}
          <View className="bg-white px-5 pt-3 pb-5" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 }}>
            <View className="flex-row items-center">
              <Pressable
                className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center mr-3"
                onPress={() => router.back()}
              >
                <Feather name="arrow-left" size={18} color="#525252" />
              </Pressable>
              <Text className="text-xl font-bold text-gray-900 tracking-tight">New Group</Text>
            </View>
          </View>

          <View className="px-5 mt-5">
            {/* Group Name */}
            <View className="flex-row items-center mb-3">
              <Feather name="edit-3" size={14} color="#9CA3AF" />
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1.5">
                Group Name
              </Text>
            </View>
            <View
              className="bg-white rounded-2xl p-4 mb-6"
              style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}
            >
              <TextInput
                className="text-base text-gray-900"
                placeholder="e.g. Fitness Squad"
                placeholderTextColor="#D4D4D4"
                value={name}
                onChangeText={setName}
                autoFocus
              />
            </View>

            {/* Invite People */}
            <View className="flex-row items-center mb-3">
              <Feather name="user-plus" size={14} color="#9CA3AF" />
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1.5">
                Invite People
              </Text>
              {invitees.length > 0 && (
                <View className="bg-gray-200 rounded-full px-2 py-0.5 ml-2">
                  <Text className="text-xs font-bold text-gray-500">{invitees.length}</Text>
                </View>
              )}
            </View>

            <View
              className="bg-white rounded-2xl p-4"
              style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}
            >
              {/* Added invitees */}
              {invitees.map((invitee, index) => (
                <View
                  key={index}
                  className="flex-row items-center py-2.5"
                  style={index > 0 ? { borderTopWidth: 1, borderTopColor: '#F3F4F6' } : undefined}
                >
                  <View className="w-9 h-9 rounded-full bg-green-50 items-center justify-center">
                    <Feather name="user" size={14} color="#22C55E" />
                  </View>
                  <View className="flex-1 ml-3">
                    {invitee.name && (
                      <Text className="text-base font-medium text-gray-900">{invitee.name}</Text>
                    )}
                    <Text className={`text-xs ${invitee.name ? 'text-gray-400' : 'text-base font-medium text-gray-900'}`}>
                      {invitee.phone}
                    </Text>
                  </View>
                  <Pressable
                    className="p-2 rounded-lg bg-red-50"
                    onPress={() => removeInvitee(index)}
                  >
                    <Feather name="x" size={14} color="#EF4444" />
                  </Pressable>
                </View>
              ))}

              {/* Separator if there are invitees */}
              {invitees.length > 0 && (
                <View style={{ borderTopWidth: 1, borderTopColor: '#F3F4F6', marginTop: 4, marginBottom: 8 }} />
              )}

              {/* Phone input row */}
              <View className="flex-row items-center">
                <TextInput
                  className="flex-1 bg-gray-50 rounded-xl px-3 py-2.5 text-base text-gray-900"
                  placeholder="Phone number"
                  placeholderTextColor="#A3A3A3"
                  value={phoneInput}
                  onChangeText={setPhoneInput}
                  keyboardType="phone-pad"
                  onSubmitEditing={addPhone}
                  returnKeyType="done"
                />
                {phoneInput.trim().length > 0 && (
                  <Pressable
                    className="ml-2 w-9 h-9 rounded-xl items-center justify-center"
                    style={{ backgroundColor: COLORS.primary }}
                    onPress={addPhone}
                  >
                    <Feather name="plus" size={18} color="#FFF" />
                  </Pressable>
                )}
              </View>

              {/* Contacts button */}
              <Pressable
                className="flex-row items-center justify-center mt-3 py-2.5 rounded-xl bg-gray-50"
                onPress={pickFromContacts}
              >
                <Feather name="book" size={14} color={COLORS.primary} />
                <Text className="text-base font-medium ml-2" style={{ color: COLORS.primary }}>
                  Choose from Contacts
                </Text>
              </Pressable>
            </View>

            {/* Create Button / Invite Results */}
            {inviteResults ? (
              <View className="mt-6">
                <View className="flex-row items-center mb-3">
                  <Feather name="check-circle" size={14} color={COLORS.success} />
                  <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1.5">
                    Invites Sent
                  </Text>
                </View>
                <View
                  className="bg-white rounded-2xl p-4"
                  style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}
                >
                  {inviteResults.map((result, index) => (
                    <View
                      key={result.inviteId}
                      className="py-3"
                      style={index > 0 ? { borderTopWidth: 1, borderTopColor: '#F3F4F6' } : undefined}
                    >
                      <View className="flex-row items-center">
                        <View
                          className="w-9 h-9 rounded-full items-center justify-center"
                          style={{ backgroundColor: result.isExistingUser ? '#DCFCE7' : '#FEF3C7' }}
                        >
                          <Feather
                            name={result.isExistingUser ? 'check' : 'clock'}
                            size={14}
                            color={result.isExistingUser ? '#22C55E' : '#F59E0B'}
                          />
                        </View>
                        <View className="flex-1 ml-3">
                          <Text className="text-base font-medium text-gray-900">
                            {result.name ?? result.phone}
                          </Text>
                          <Text className="text-xs text-gray-400 mt-0.5">
                            {result.isExistingUser
                              ? 'Has CoGoal — notification sent'
                              : "Doesn't have CoGoal yet — invite saved"}
                          </Text>
                        </View>
                        {!result.isExistingUser && (
                          <Pressable
                            className="px-3 py-1.5 rounded-lg bg-gray-100"
                            onPress={() => openSmsComposer(result.phone)}
                          >
                            <Text className="text-xs font-medium" style={{ color: COLORS.primary }}>
                              Text
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  ))}
                </View>

                {/* Send text to all non-users */}
                {inviteResults.some((r) => !r.isExistingUser) && (
                  <Pressable
                    className="flex-row items-center justify-center mt-4 py-3 rounded-2xl bg-gray-100"
                    onPress={() => {
                      const nonUsers = inviteResults
                        .filter((r) => !r.isExistingUser)
                        .map((r) => r.phone);
                      const message = encodeURIComponent(
                        `Hey! I invited you to join my group on CoGoal. Download the app and sign up with this number to get started!`
                      );
                      const phones = nonUsers.join(',');
                      const separator = Platform.OS === 'ios' ? '&' : '?';
                      Linking.openURL(`sms:${phones}${separator}body=${message}`);
                    }}
                  >
                    <Feather name="message-circle" size={16} color={COLORS.primary} />
                    <Text className="text-base font-medium ml-2" style={{ color: COLORS.primary }}>
                      Text All New Users
                    </Text>
                  </Pressable>
                )}

                {/* Go to group */}
                <Pressable
                  className="rounded-2xl py-4 items-center mt-4"
                  style={{ backgroundColor: COLORS.primary }}
                  onPress={() => router.replace(`/group/${createdGroupId}` as any)}
                >
                  <Text className="text-white text-base font-semibold tracking-wide">
                    Go to Group
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                className="rounded-2xl py-4 items-center mt-8"
                style={{
                  backgroundColor: (createGroup.isPending || inviteToGroup.isPending) ? COLORS.primaryLight : COLORS.primary,
                }}
                onPress={handleCreate}
                disabled={createGroup.isPending || inviteToGroup.isPending}
              >
                {(createGroup.isPending || inviteToGroup.isPending) ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text className="text-white text-base font-semibold tracking-wide">Create Group</Text>
                )}
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
