import React, { useMemo, useState } from 'react';
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
  Modal,
  FlatList,
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

type ContactRow = { id: string; name: string; phone: string };

/** Strip everything but digits, then take the last 10 digits (US-only). */
function normalizeUSPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/** Format raw input as XXX-XXX-XXXX while typing. */
function formatUSPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

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

  // Contacts picker modal state
  const [contactsModalOpen, setContactsModalOpen] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [contactSearch, setContactSearch] = useState('');

  const onChangePhone = (text: string) => setPhoneInput(formatUSPhone(text));

  const addPhone = () => {
    const phone = normalizeUSPhone(phoneInput);
    if (phone.length !== 10) {
      showAlert({
        title: 'Invalid number',
        message: 'Please enter a 10-digit US phone number (e.g. 555-123-4567). Country code is added automatically.',
        icon: 'alert-circle',
      });
      return;
    }
    if (invitees.some((i) => normalizeUSPhone(i.phone) === phone)) {
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

  const openContactsPicker = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      showAlert({
        title: 'Permission required',
        message: 'Please allow access to your contacts to invite people.',
        icon: 'info',
      });
      return;
    }

    setContactsModalOpen(true);
    setContactsLoading(true);
    try {
      // Page through ALL contacts so we don't silently truncate the list.
      const pageSize = 500;
      let pageOffset = 0;
      const all: ContactRow[] = [];
      // Loop until expo-contacts reports no more pages.
      // hasNextPage is provided alongside `data`.
       
      while (true) {
        const page = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
          pageSize,
          pageOffset,
        });
        for (const c of page.data) {
          if (!c.phoneNumbers?.length) continue;
          for (const pn of c.phoneNumbers) {
            const norm = normalizeUSPhone(pn.number ?? '');
            if (norm.length !== 10) continue;
            all.push({
              id: `${c.id}-${pn.id ?? norm}`,
              name: c.name || pn.label || norm,
              phone: norm,
            });
          }
        }
        if (!page.hasNextPage || !page.data.length) break;
        pageOffset += pageSize;
      }

      // Dedupe by normalized phone, keep first occurrence
      const seen = new Set<string>();
      const deduped: ContactRow[] = [];
      for (const c of all) {
        if (seen.has(c.phone)) continue;
        seen.add(c.phone);
        deduped.push(c);
      }
      deduped.sort((a, b) => a.name.localeCompare(b.name));
      setContacts(deduped);
    } catch (e) {
      showAlert({
        title: 'Could not load contacts',
        message: (e as Error).message,
        icon: 'alert-circle',
      });
    } finally {
      setContactsLoading(false);
    }
  };

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return contacts;
    const qDigits = q.replace(/\D/g, '');
    return contacts.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (qDigits && c.phone.includes(qDigits)) return true;
      return false;
    });
  }, [contacts, contactSearch]);

  const toggleContact = (c: ContactRow) => {
    setInvitees((prev) => {
      const exists = prev.find((i) => normalizeUSPhone(i.phone) === c.phone);
      if (exists) return prev.filter((i) => normalizeUSPhone(i.phone) !== c.phone);
      return [...prev, { name: c.name, phone: c.phone }];
    });
  };

  const inviteePhoneSet = useMemo(
    () => new Set(invitees.map((i) => normalizeUSPhone(i.phone))),
    [invitees]
  );

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
        invitePhones: invitees.map((i) => normalizeUSPhone(i.phone)),
      },
      {
        onSuccess: async (group) => {
          if (invitees.length === 0) {
            router.replace(`/group/${group.id}` as any);
            return;
          }

          setCreatedGroupId(group.id);

          // Send invites — phones are normalized to canonical 10-digit form
          // here; the server adds the +1 country code at storage time.
          inviteToGroup.mutate(
            {
              groupId: group.id,
              phones: invitees.map((i) => ({
                phone: normalizeUSPhone(i.phone),
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
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
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
                      {formatUSPhone(invitee.phone)}
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
                <View className="flex-1 flex-row items-center bg-gray-50 rounded-xl px-3">
                  <Text className="text-base text-gray-400 mr-2">+1</Text>
                  <TextInput
                    className="flex-1 py-2.5 text-base text-gray-900"
                    placeholder="555-123-4567"
                    placeholderTextColor="#A3A3A3"
                    value={phoneInput}
                    onChangeText={onChangePhone}
                    keyboardType="phone-pad"
                    onSubmitEditing={addPhone}
                    returnKeyType="done"
                    maxLength={12}
                  />
                </View>
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
                onPress={openContactsPicker}
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
                            {result.name ?? formatUSPhone(result.phone)}
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

      {/* Contacts picker modal */}
      <Modal
        visible={contactsModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setContactsModalOpen(false)}
      >
        <SafeAreaView className="flex-1 bg-white">
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
          <View className="flex-row items-center px-5 pt-3 pb-3 border-b border-gray-100">
            <Pressable
              className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center mr-3"
              onPress={() => setContactsModalOpen(false)}
            >
              <Feather name="x" size={18} color="#525252" />
            </Pressable>
            <Text className="text-xl font-bold text-gray-900 tracking-tight flex-1">
              Choose Contacts
            </Text>
            <Pressable
              className="px-3 py-2 rounded-xl"
              style={{ backgroundColor: COLORS.primary }}
              onPress={() => setContactsModalOpen(false)}
            >
              <Text className="text-white text-sm font-semibold">Done</Text>
            </Pressable>
          </View>

          <View className="px-5 pt-3 pb-2">
            <View className="flex-row items-center bg-gray-100 rounded-xl px-3 py-2">
              <Feather name="search" size={16} color="#9CA3AF" />
              <TextInput
                className="flex-1 ml-2 text-base text-gray-900"
                placeholder="Search contacts"
                placeholderTextColor="#A3A3A3"
                value={contactSearch}
                onChangeText={setContactSearch}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {contactSearch.length > 0 && (
                <Pressable onPress={() => setContactSearch('')}>
                  <Feather name="x-circle" size={16} color="#9CA3AF" />
                </Pressable>
              )}
            </View>
          </View>

          {contactsLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={COLORS.primary} />
              <Text className="text-sm text-gray-400 mt-3">Loading contacts…</Text>
            </View>
          ) : (
            <FlatList
              data={filteredContacts}
              keyExtractor={(item) => item.id}
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View className="items-center py-16 px-8">
                  <Feather name="users" size={28} color="#D4D4D4" />
                  <Text className="text-base font-semibold text-gray-400 mt-3">
                    {contacts.length === 0 ? 'No contacts found' : 'No matches'}
                  </Text>
                  <Text className="text-sm text-gray-300 text-center mt-1 leading-5">
                    {contacts.length === 0
                      ? 'No contacts with valid US phone numbers were found on this device.'
                      : 'Try a different name or phone number.'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const selected = inviteePhoneSet.has(item.phone);
                return (
                  <Pressable
                    className="flex-row items-center px-5 py-3"
                    onPress={() => toggleContact(item)}
                  >
                    <View
                      className="w-10 h-10 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: selected ? COLORS.primary + '15' : '#F3F4F6' }}
                    >
                      <Feather
                        name={selected ? 'check' : 'user'}
                        size={16}
                        color={selected ? COLORS.primary : '#9CA3AF'}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-base font-medium text-gray-900">{item.name}</Text>
                      <Text className="text-xs text-gray-400 mt-0.5">{formatUSPhone(item.phone)}</Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
