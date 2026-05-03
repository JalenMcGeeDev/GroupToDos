import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Share,
  RefreshControl,
  Modal,
  FlatList,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
  Linking,
  ActivityIndicator,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import * as ExpoImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../../lib/supabase';

const isExpoGo = Constants.executionEnvironment === 'storeClient';
const CROP_THEME = { cropperToolbarColor: '#C15F3C', cropperToolbarWidgetColor: '#FFFFFF', cropperTitleColor: '#FFFFFF' };

const STOCK_COVERS = [
  { url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&q=80', label: 'Gradient' },
  { url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80', label: 'Mountains' },
  { url: 'https://images.unsplash.com/photo-1518066000714-58c45f1a2c0a?w=800&q=80', label: 'Night Sky' },
  { url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&q=80', label: 'Forest' },
  { url: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=800&q=80', label: 'Ocean' },
  { url: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=800&q=80', label: 'City Night' },
  { url: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&q=80', label: 'Desert' },
  { url: 'https://images.unsplash.com/photo-1490750967868-88df5691cc48?w=800&q=80', label: 'Flowers' },
  { url: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=800&q=80', label: 'Abstract' },
  { url: 'https://images.unsplash.com/photo-1511300636408-a63a89df3482?w=800&q=80', label: 'Sunrise' },
];
import { useGroup, useLeaveGroup, useUpdateGroup } from '../../../hooks/use-groups';
import { useInviteToGroup } from '../../../hooks/use-invites';
import { useGoals } from '../../../hooks/use-goals';
import { useGoalViews } from '../../../hooks/use-goal-views';
import { useActivityFeed } from '../../../hooks/use-activity';
import { GoalCard } from '../../../components/GoalCard';
import { ActivityFeed } from '../../../components/ActivityFeed';
import { useAuthStore } from '../../../stores/auth-store';
import { COLORS } from '../../../constants';
import { useAlert } from '../../../components/AlertProvider';
import type { GoalStatus, InviteResult } from '../../../lib/types';

type Tab = 'goals' | 'activity';

export default function GroupDetailScreen() {
  const { id, expandGoal, invite } = useLocalSearchParams<{ id: string; expandGoal?: string; invite?: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const { data: group, isLoading: groupLoading, refetch: refetchGroup } = useGroup(id!);
  const { data: goals = [], refetch: refetchGoals } = useGoals(id!);
  const goalIds = useMemo(() => goals.map((g) => g.id), [goals]);
  const { data: goalViewMap = {} } = useGoalViews(goalIds);
  const { data: feedItems = [] } = useActivityFeed(id!);
  const inviteToGroup = useInviteToGroup();

  const [activeTab, setActiveTab] = useState<Tab>('goals');
  const [refreshing, setRefreshing] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<GoalStatus | 'all'>('all');
  const [memberFilter, setMemberFilter] = useState<string | 'all'>('all');
  const filterBtnRef = useRef<View>(null);
  const [filterPos, setFilterPos] = useState({ x: 0, y: 0 });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePhoneInput, setInvitePhoneInput] = useState('');
  const [inviteList, setInviteList] = useState<{ name?: string; phone: string }[]>([]);
  const [inviteResults, setInviteResults] = useState<InviteResult[] | null>(null);
  // Contacts picker modal state
  const [contactsModalOpen, setContactsModalOpen] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [allContacts, setAllContacts] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [contactSelection, setContactSelection] = useState<Map<string, { name: string; phone: string }>>(new Map());
  const { showAlert } = useAlert();

  // Deep-link: if a goal id was passed via expandGoal, navigate to the detail screen
  React.useEffect(() => {
    if (expandGoal && id) {
      router.replace({ pathname: '/goal/[goalId]', params: { goalId: expandGoal, groupId: id } });
    }
  }, [expandGoal, id]);

  // Auto-open invite modal when navigated here with ?invite=1
  React.useEffect(() => {
    if (invite === '1') {
      setInviteOpen(true);
    }
  }, [invite]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchGroup(), refetchGoals()]);
    setRefreshing(false);
  };

  const handleShare = async () => {
    if (!group) return;
    await Share.share({
      message: `Join my group "${group.name}" on Cogo! Use invite code: ${group.invite_code}`,
    });
  };

  const filteredGoals = useMemo(() => {
    let result = goals;
    if (statusFilter !== 'all') {
      result = result.filter((g) => g.status === statusFilter);
    }
    if (memberFilter !== 'all') {
      result = result.filter((g) => g.created_by === memberFilter);
    }
    return result;
  }, [goals, statusFilter, memberFilter]);

  // ---- Invite helpers ----
  const normalizePhone = (raw: string) => raw.replace(/[^\d]/g, '');

  const formatInvitePhone = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const addInvitePhone = () => {
    const digits = normalizePhone(invitePhoneInput);
    if (digits.length !== 10) {
      showAlert({ title: 'Invalid number', message: 'Please enter a 10-digit US phone number in xxx-xxx-xxxx format.', icon: 'alert-circle' });
      return;
    }
    if (inviteList.some((i) => normalizePhone(i.phone) === digits)) {
      setInvitePhoneInput('');
      return;
    }
    setInviteList((prev) => [...prev, { phone: digits }]);
    setInvitePhoneInput('');
  };

  const filteredContactsForInvite = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return allContacts;
    const qDigits = q.replace(/\D/g, '');
    return allContacts.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (qDigits && c.phone.includes(qDigits)) return true;
      return false;
    });
  }, [allContacts, contactSearch]);

  const pickInviteFromContacts = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      showAlert({ title: 'Permission required', message: 'Please allow access to your contacts.', icon: 'info' });
      return;
    }
    // Pre-populate selection with already-added invitees
    const preSelected = new Map<string, { name: string; phone: string }>();
    for (const i of inviteList) {
      preSelected.set(i.phone, { name: i.name ?? '', phone: i.phone });
    }
    setContactSelection(preSelected);
    setContactsModalOpen(true);
    setContactsLoading(true);
    try {
      const pageSize = 500;
      let pageOffset = 0;
      const all: { id: string; name: string; phone: string }[] = [];
      while (true) {
        const page = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
          pageSize,
          pageOffset,
        });
        for (const c of page.data) {
          if (!c.phoneNumbers?.length) continue;
          for (const pn of c.phoneNumbers) {
            const norm = normalizePhone(pn.number ?? '');
            if (norm.length < 7) continue;
            all.push({ id: `${c.id}-${pn.id ?? norm}`, name: c.name || norm, phone: norm });
          }
        }
        if (!page.hasNextPage || !page.data.length) break;
        pageOffset += pageSize;
      }
      const seen = new Set<string>();
      const deduped: { id: string; name: string; phone: string }[] = [];
      for (const c of all) {
        if (seen.has(c.phone)) continue;
        seen.add(c.phone);
        deduped.push(c);
      }
      deduped.sort((a, b) => a.name.localeCompare(b.name));
      setAllContacts(deduped);
    } catch (e) {
      showAlert({ title: 'Could not load contacts', message: (e as Error).message, icon: 'alert-circle' });
    } finally {
      setContactsLoading(false);
    }
  };

  const handleSendInvites = () => {
    if (inviteList.length === 0) return;
    inviteToGroup.mutate(
      {
        groupId: id!,
        phones: inviteList.map((i) => ({ phone: normalizePhone(i.phone), name: i.name })),
      },
      {
        onSuccess: (results) => {
          setInviteResults(results);
          setInviteList([]);
        },
        onError: (err) => {
          showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' });
        },
      }
    );
  };

  const openSmsComposer = (phone: string) => {
    const message = encodeURIComponent(
      `Hey! I invited you to join my group "${group?.name ?? ''}" on Cogo. Download the app and sign up with this number!`
    );
    const separator = Platform.OS === 'ios' ? '&' : '?';
    Linking.openURL(`sms:${phone}${separator}body=${message}`);
  };

  const closeInviteModal = () => {
    setInviteOpen(false);
    setInviteList([]);
    setInviteResults(null);
    setInvitePhoneInput('');
  };

  const filterLabel = useMemo(() => {
    const parts: string[] = [];
    if (statusFilter === 'all') parts.push('All statuses');
    else parts.push(statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1));
    if (memberFilter !== 'all') {
      const member = group?.members.find((m) => m.user_id === memberFilter);
      parts.push(member?.profile?.display_name ?? 'Member');
    }
    return parts.join(' · ');
  }, [statusFilter, memberFilter, group]);

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'goals', label: 'Goals', icon: 'target' },
    { key: 'activity', label: 'Feed', icon: 'activity' },
  ];

  if (groupLoading || !group) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
        <Text className="text-gray-400">{groupLoading ? 'Loading...' : 'Group not found'}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-6 pt-3 pb-4">
        {/* Top row: back arrow, centered group name, action buttons */}
        <View className="flex-row items-center justify-between">
          <Pressable
            className="w-10 h-10 rounded-xl bg-gray-50 items-center justify-center"
            onPress={() => router.replace('/(tabs)/groups')}
          >
            <Feather name="arrow-left" size={18} color="#525252" />
          </Pressable>
          <View className="flex-1 items-center" style={{ paddingVertical: 10 }}>
            <Text className="text-xl font-bold text-gray-900 tracking-tight text-center">{group.name}</Text>
            {group.members.length > 0 && (
              <Text className="text-xs text-gray-400 text-center" numberOfLines={1}>
                {(() => {
                  const names = group.members
                    .map((m) => m.profile?.display_name ?? 'Unknown')
                    .sort();
                  const MAX_LENGTH = 40;
                  let result = '';
                  let included = 0;
                  for (const name of names) {
                    const next = result ? `${result}, ${name}` : name;
                    if (next.length > MAX_LENGTH && included > 0) {
                      return `${result} +${names.length - included} more`;
                    }
                    result = next;
                    included++;
                  }
                  return result;
                })()}
              </Text>
            )}
          </View>
          {activeTab === 'goals' ? (
            <Pressable
              className="w-10 h-10 rounded-xl bg-gray-50 items-center justify-center"
              onPress={() => router.push(`/group/${id}/goal/create` as any)}
            >
              <Feather name="plus" size={18} color="#525252" />
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>
      </View>

      {/* Tabs + Filter Row */}
      <View className="flex-row items-center justify-between px-6 mb-4">
        {/* Left: Tab buttons */}
        <View className="flex-row items-center">
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              className={`flex-row items-center py-2.5 px-4 rounded-xl mr-1.5 ${
                activeTab === tab.key ? 'bg-gray-900' : 'bg-gray-50'
              }`}
              onPress={() => setActiveTab(tab.key)}
            >
              <Feather
                name={tab.icon as any}
                size={14}
                color={activeTab === tab.key ? '#FFF' : '#A3A3A3'}
              />
              <Text
                className={`text-xs font-semibold ml-1.5 uppercase tracking-wider ${
                  activeTab === tab.key ? 'text-white' : 'text-gray-400'
                }`}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Right: Filter dropdown trigger */}
        {activeTab === 'goals' && (
          <View ref={filterBtnRef} collapsable={false}>
            <Pressable
              className="flex-row items-center bg-gray-50 rounded-xl px-3 py-2.5"
              onPress={() => {
                filterBtnRef.current?.measureInWindow((x, y, w, h) => {
                  setFilterPos({ x: x + w, y: y + h + 6 });
                  setFilterOpen(true);
                });
              }}
            >
              <Feather name="filter" size={13} color="#737373" />
              <Text className="text-xs font-medium text-gray-500 ml-1.5" numberOfLines={1}>
                {filterLabel}
              </Text>
              <Feather name="chevron-down" size={12} color="#A3A3A3" style={{ marginLeft: 4 }} />
            </Pressable>
          </View>
        )}
      </View>

      {/* Tab Content */}
      <ScrollView
        className="flex-1 bg-gray-50"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
        }
      >
        {activeTab === 'goals' && (
          <View>
            {filteredGoals.length > 0 ? (
              <View className="mb-2">
                {filteredGoals.map((goal) => (
                  <GoalCard key={goal.id} goal={goal} groupId={id!} viewedAt={goalViewMap[goal.id] ?? null} />
                ))}
              </View>
            ) : (
              <View className="items-center py-16">
                <View className="w-14 h-14 rounded-2xl bg-gray-50 items-center justify-center mb-4">
                  <Feather name="target" size={24} color="#D4D4D4" />
                </View>
                <Text className="text-base text-gray-400 text-center leading-5">
                  {goals.length === 0
                    ? `No goals yet.\nCreate your first goal to get started!`
                    : 'No goals match this filter.'}
                </Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'activity' && (
          <ActivityFeed items={feedItems} />
        )}
      </ScrollView>



      {/* Filter Dropdown */}
      <Modal
        visible={filterOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterOpen(false)}
      >
        <Pressable className="flex-1" onPress={() => setFilterOpen(false)}>
          <View
            style={{
              position: 'absolute',
              top: filterPos.y,
              right: 24,
              backgroundColor: '#fff',
              borderRadius: 14,
              paddingVertical: 6,
              minWidth: 200,
              maxWidth: 260,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.12,
              shadowRadius: 16,
              elevation: 8,
              borderWidth: 1,
              borderColor: '#F3F4F6',
            }}
          >
            {/* Status filters */}
            <Text className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Status
            </Text>
            {([['all', 'All'], ['active', 'Active'], ['completed', 'Completed'], ['archived', 'Archived']] as const).map(
              ([value, label]) => (
                <Pressable
                  key={value}
                  className="flex-row items-center px-4 py-2.5"
                  onPress={() => {
                    setStatusFilter(value as GoalStatus | 'all');
                    setFilterOpen(false);
                  }}
                >
                  <Feather
                    name={statusFilter === value ? 'check-circle' : 'circle'}
                    size={14}
                    color={statusFilter === value ? COLORS.primary : '#D4D4D4'}
                  />
                  <Text
                    className={`text-base ml-2.5 ${
                      statusFilter === value ? 'font-semibold text-gray-900' : 'text-gray-600'
                    }`}
                  >
                    {label}
                  </Text>
                </Pressable>
              )
            )}

            {/* Member filters */}
            {group && group.members.length > 1 && (
              <>
                <View className="h-px bg-gray-100 mx-3 my-1" />
                <Text className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Member
                </Text>
                <Pressable
                  className="flex-row items-center px-4 py-2.5"
                  onPress={() => {
                    setMemberFilter('all');
                    setFilterOpen(false);
                  }}
                >
                  <Feather
                    name={memberFilter === 'all' ? 'check-circle' : 'circle'}
                    size={14}
                    color={memberFilter === 'all' ? COLORS.primary : '#D4D4D4'}
                  />
                  <Text
                    className={`text-base ml-2.5 ${
                      memberFilter === 'all' ? 'font-semibold text-gray-900' : 'text-gray-600'
                    }`}
                  >
                    Everyone
                  </Text>
                </Pressable>
                {group.members.map((member) => (
                  <Pressable
                    key={member.user_id}
                    className="flex-row items-center px-4 py-2.5"
                    onPress={() => {
                      setMemberFilter(member.user_id);
                      setFilterOpen(false);
                    }}
                  >
                    <Feather
                      name={memberFilter === member.user_id ? 'check-circle' : 'circle'}
                      size={14}
                      color={memberFilter === member.user_id ? COLORS.primary : '#D4D4D4'}
                    />
                    <Text
                      className={`text-base ml-2.5 ${
                        memberFilter === member.user_id ? 'font-semibold text-gray-900' : 'text-gray-600'
                      }`}
                      numberOfLines={1}
                    >
                      {member.profile?.display_name ?? 'Unknown'}
                    </Text>
                  </Pressable>
                ))}
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Contacts Picker Modal */}
      <Modal
        visible={contactsModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setContactsModalOpen(false); setContactSearch(''); }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
              <Pressable
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}
                onPress={() => { setContactsModalOpen(false); setContactSearch(''); }}
              >
                <Feather name="x" size={18} color="#525252" />
              </Pressable>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827', flex: 1 }}>
                {contactSelection.size > 0 ? `${contactSelection.size} selected` : 'Choose Contacts'}
              </Text>
              <Pressable
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: COLORS.primary }}
                onPress={() => {
                  // Merge selection into inviteList (dedupe by phone)
                  const existing = new Map(inviteList.map((i) => [i.phone, i]));
                  for (const [phone, contact] of contactSelection) {
                    existing.set(phone, { name: contact.name || undefined, phone });
                  }
                  setInviteList(Array.from(existing.values()));
                  setContactsModalOpen(false);
                  setContactSearch('');
                }}
              >
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Done</Text>
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Feather name="search" size={16} color="#9CA3AF" />
                <TextInput
                  style={{ flex: 1, marginLeft: 8, fontSize: 16, color: '#111827' }}
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
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={{ color: '#9CA3AF', fontSize: 14, marginTop: 12 }}>Loading contacts…</Text>
              </View>
            ) : (
              <FlatList
                data={filteredContactsForInvite}
                keyExtractor={(item) => item.id}
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <View style={{ alignItems: 'center', paddingVertical: 64, paddingHorizontal: 32 }}>
                    <Feather name="users" size={28} color="#D4D4D4" />
                    <Text style={{ color: '#9CA3AF', fontSize: 16, fontWeight: '600', marginTop: 12 }}>
                      {allContacts.length === 0 ? 'No contacts found' : 'No matches'}
                    </Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const selected = contactSelection.has(item.phone);
                  return (
                    <Pressable
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 }}
                      onPress={() => {
                        setContactSelection((prev) => {
                          const next = new Map(prev);
                          if (next.has(item.phone)) {
                            next.delete(item.phone);
                          } else {
                            next.set(item.phone, { name: item.name, phone: item.phone });
                          }
                          return next;
                        });
                      }}
                    >
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: selected ? COLORS.primary + '20' : '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                        <Feather name={selected ? 'check' : 'user'} size={16} color={selected ? COLORS.primary : '#9CA3AF'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '500', color: '#111827' }}>{item.name}</Text>
                        <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{item.phone}</Text>
                      </View>
                    </Pressable>
                  );
                }}
              />
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Invite Members Modal */}
      <Modal
        visible={inviteOpen}
        transparent
        animationType="fade"
        onRequestClose={closeInviteModal}
      >
        <Pressable className="flex-1 bg-black/40 items-center justify-center" onPress={closeInviteModal}>
          <Pressable
            className="bg-white rounded-2xl p-6 mx-6 w-full max-w-sm"
            style={{ maxHeight: '80%' }}
            onPress={() => {}}
          >
            <Text className="text-lg font-bold text-gray-900 mb-4">Invite Members</Text>

            {inviteResults ? (
              <ScrollView>
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
                            ? 'Has Cogo — notification sent'
                            : "Doesn't have Cogo — invite saved"}
                        </Text>
                      </View>
                      {!result.isExistingUser && (
                        <Pressable
                          className="px-3 py-1.5 rounded-lg bg-gray-100"
                          onPress={() => openSmsComposer(result.phone)}
                        >
                          <Text className="text-xs font-medium" style={{ color: COLORS.primary }}>Text</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
                <Pressable
                  className="rounded-xl py-3 items-center mt-4"
                  style={{ backgroundColor: COLORS.primary }}
                  onPress={closeInviteModal}
                >
                  <Text className="text-white text-base font-semibold">Done</Text>
                </Pressable>
              </ScrollView>
            ) : (
              <>
                {/* Added invitees */}
                {inviteList.map((invitee, index) => (
                  <View key={index} className="flex-row items-center py-2" style={index > 0 ? { borderTopWidth: 1, borderTopColor: '#F3F4F6' } : undefined}>
                    <View className="w-8 h-8 rounded-full bg-green-50 items-center justify-center">
                      <Feather name="user" size={12} color="#22C55E" />
                    </View>
                    <View className="flex-1 ml-2.5">
                      {invitee.name && <Text className="text-base font-medium text-gray-900">{invitee.name}</Text>}
                      <Text className={`text-xs ${invitee.name ? 'text-gray-400' : 'text-base font-medium text-gray-900'}`}>{invitee.phone}</Text>
                    </View>
                    <Pressable className="p-1.5 rounded-lg bg-red-50" onPress={() => setInviteList((prev) => prev.filter((_, i) => i !== index))}>
                      <Feather name="x" size={12} color="#EF4444" />
                    </Pressable>
                  </View>
                ))}

                {/* Phone input */}
                <View className="flex-row items-center mt-2">
                  <View className="flex-1 flex-row items-center bg-gray-50 rounded-xl px-3">
                    <Text className="text-base text-gray-400 mr-1">+1</Text>
                    <TextInput
                      className="flex-1 py-2.5 text-base text-gray-900"
                      placeholder="555-123-4567"
                      placeholderTextColor="#A3A3A3"
                      value={invitePhoneInput}
                      onChangeText={(t) => setInvitePhoneInput(formatInvitePhone(t))}
                      keyboardType="phone-pad"
                      onSubmitEditing={addInvitePhone}
                      returnKeyType="done"
                      maxLength={12}
                    />
                  </View>
                  {invitePhoneInput.trim().length > 0 && (
                    <Pressable
                      className="ml-2 w-8 h-8 rounded-xl items-center justify-center"
                      style={{ backgroundColor: COLORS.primary }}
                      onPress={addInvitePhone}
                    >
                      <Feather name="plus" size={16} color="#FFF" />
                    </Pressable>
                  )}
                </View>

                {/* Contacts button */}
                <Pressable
                  className="flex-row items-center justify-center mt-3 py-2.5 rounded-xl bg-gray-50"
                  onPress={pickInviteFromContacts}
                >
                  <Feather name="book" size={14} color={COLORS.primary} />
                  <Text className="text-base font-medium ml-2" style={{ color: COLORS.primary }}>Choose from Contacts</Text>
                </Pressable>

                {/* Action buttons */}
                <View className="flex-row justify-end mt-4">
                  <Pressable className="px-4 py-2 mr-2" onPress={closeInviteModal}>
                    <Text className="text-base font-medium text-gray-500">Cancel</Text>
                  </Pressable>
                  <Pressable
                    className="px-5 py-2 rounded-xl items-center"
                    style={{ backgroundColor: inviteList.length === 0 ? COLORS.primaryLight : COLORS.primary }}
                    onPress={handleSendInvites}
                    disabled={inviteList.length === 0 || inviteToGroup.isPending}
                  >
                    {inviteToGroup.isPending ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <Text className="text-base font-medium text-white">Send Invites</Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
