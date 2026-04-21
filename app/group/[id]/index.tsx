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
  LayoutAnimation,
  Platform,
  UIManager,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { useGroup, useLeaveGroup, useUpdateGroup } from '../../../hooks/use-groups';
import { useInviteToGroup } from '../../../hooks/use-invites';
import { useGoals } from '../../../hooks/use-goals';
import { useActivityFeed } from '../../../hooks/use-activity';
import { GoalCard } from '../../../components/GoalCard';
import { ActivityFeed } from '../../../components/ActivityFeed';
import { useAuthStore } from '../../../stores/auth-store';
import { COLORS } from '../../../constants';
import { useAlert } from '../../../components/AlertProvider';
import type { GoalStatus, InviteResult } from '../../../lib/types';

type Tab = 'goals' | 'activity';

export default function GroupDetailScreen() {
  const { id, expandGoal } = useLocalSearchParams<{ id: string; expandGoal?: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const { data: group, isLoading: groupLoading, refetch: refetchGroup } = useGroup(id!);
  const { data: goals = [], refetch: refetchGoals } = useGoals(id!);
  const { data: feedItems = [] } = useActivityFeed(id!);
  const leaveGroup = useLeaveGroup();
  const updateGroup = useUpdateGroup();
  const inviteToGroup = useInviteToGroup();

  const [activeTab, setActiveTab] = useState<Tab>('goals');
  const [refreshing, setRefreshing] = useState(false);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(expandGoal ?? null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<GoalStatus | 'all'>('active');
  const [memberFilter, setMemberFilter] = useState<string | 'all'>('all');
  const filterBtnRef = useRef<View>(null);
  const [filterPos, setFilterPos] = useState({ x: 0, y: 0 });
  const menuBtnRef = useRef<View>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePhoneInput, setInvitePhoneInput] = useState('');
  const [inviteList, setInviteList] = useState<{ name?: string; phone: string }[]>([]);
  const [inviteResults, setInviteResults] = useState<InviteResult[] | null>(null);
  const { showAlert } = useAlert();

  const handleToggleExpand = useCallback((goalId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedGoalId((prev) => (prev === goalId ? null : goalId));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchGroup(), refetchGoals()]);
    setRefreshing(false);
  };

  const handleShare = async () => {
    if (!group) return;
    await Share.share({
      message: `Join my group "${group.name}" on CoGoal! Use invite code: ${group.invite_code}`,
    });
  };

  const handleRename = () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === group?.name) {
      setRenameOpen(false);
      return;
    }
    updateGroup.mutate(
      { groupId: id!, name: trimmed },
      {
        onSuccess: () => setRenameOpen(false),
        onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }),
      }
    );
  };

  const handleLeave = () => {
    showAlert({
      title: 'Leave Group',
      message: 'Are you sure you want to leave this group?',
      icon: 'log-out',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            leaveGroup.mutate(
              { groupId: id! },
              {
                onSuccess: () => router.replace('/(tabs)'),
                onError: (err) => showAlert({ title: 'Error', message: err.message, icon: 'alert-circle' }),
              }
            );
          },
        },
      ],
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

  const addInvitePhone = () => {
    const phone = normalizePhone(invitePhoneInput);
    if (phone.length < 7) return;
    if (inviteList.some((i) => normalizePhone(i.phone) === phone)) {
      setInvitePhoneInput('');
      return;
    }
    setInviteList((prev) => [...prev, { phone }]);
    setInvitePhoneInput('');
  };

  const pickInviteFromContacts = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      showAlert({ title: 'Permission required', message: 'Please allow access to your contacts.', icon: 'info' });
      return;
    }
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
    });
    const withPhones = data.filter((c) => c.phoneNumbers && c.phoneNumbers.length > 0);
    if (!withPhones.length) {
      showAlert({ title: 'No contacts', message: 'No contacts with phone numbers found.', icon: 'info' });
      return;
    }
    showAlert({
      title: 'Select a contact',
      message: 'Choose someone to invite:',
      icon: 'user-plus',
      buttons: [
        ...withPhones.slice(0, 5).map((c) => ({
          text: `${c.name} (${c.phoneNumbers![0].number})`,
          onPress: () => {
            const phone = normalizePhone(c.phoneNumbers![0].number ?? '');
            if (phone.length < 7) return;
            if (inviteList.some((i) => normalizePhone(i.phone) === phone)) return;
            setInviteList((prev) => [...prev, { name: c.name ?? undefined, phone }]);
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    });
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
      `Hey! I invited you to join my group "${group?.name ?? ''}" on CoGoal. Download the app and sign up with this number!`
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

  const isOwner = group?.created_by === user?.id;

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
            onPress={() => router.back()}
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
          <View
            ref={menuBtnRef}
            collapsable={false}
          >
            <Pressable
              className="w-10 h-10 rounded-xl bg-gray-50 items-center justify-center"
              onPress={() => {
                menuBtnRef.current?.measureInWindow((x, y, w, h) => {
                  setMenuPos({ x: x + w, y: y + h + 6 });
                  setMenuOpen(true);
                });
              }}
            >
              <Feather name="more-horizontal" size={18} color="#525252" />
            </Pressable>
          </View>
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
                  <GoalCard key={goal.id} goal={goal} groupId={id!} isExpanded={expandedGoalId === goal.id} onToggleExpand={handleToggleExpand} />
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

      {/* Create Goal FAB */}
      {activeTab === 'goals' && (
        <View className="absolute bottom-6 right-6">
          <Pressable
            className="flex-row items-center rounded-2xl px-5 py-3.5"
            style={{ backgroundColor: COLORS.primary, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 5 }}
            onPress={() => router.push(`/group/${id}/goal/create` as any)}
          >
            <Feather name="plus" size={18} color="#FFF" />
            <Text className="text-white text-base font-semibold ml-2">New Goal</Text>
          </Pressable>
        </View>
      )}

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

      {/* Dropdown Menu */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable className="flex-1" onPress={() => setMenuOpen(false)}>
          <View
            style={{
              position: 'absolute',
              top: menuPos.y,
              right: 24,
              backgroundColor: '#fff',
              borderRadius: 14,
              paddingVertical: 6,
              minWidth: 180,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.12,
              shadowRadius: 16,
              elevation: 8,
              borderWidth: 1,
              borderColor: '#F3F4F6',
            }}
          >
            {isOwner && (
              <>
                <Pressable
                  className="flex-row items-center px-4 py-3"
                  onPress={() => { setMenuOpen(false); setRenameValue(group.name); setRenameOpen(true); }}
                >
                  <Feather name="edit-2" size={16} color="#525252" />
                  <Text className="text-base text-gray-700 ml-3 font-medium">Rename Group</Text>
                </Pressable>
                <View className="h-px bg-gray-100 mx-3" />
                <Pressable
                  className="flex-row items-center px-4 py-3"
                  onPress={() => { setMenuOpen(false); setInviteOpen(true); }}
                >
                  <Feather name="user-plus" size={16} color="#525252" />
                  <Text className="text-base text-gray-700 ml-3 font-medium">Invite Members</Text>
                </Pressable>
                <View className="h-px bg-gray-100 mx-3" />
              </>
            )}
            <Pressable
              className="flex-row items-center px-4 py-3"
              onPress={() => { setMenuOpen(false); handleShare(); }}
            >
              <Feather name="share-2" size={16} color="#525252" />
              <Text className="text-base text-gray-700 ml-3 font-medium">Share Invite</Text>
            </Pressable>
            <View className="h-px bg-gray-100 mx-3" />
            <Pressable
              className="flex-row items-center px-4 py-3"
              onPress={() => { setMenuOpen(false); handleLeave(); }}
            >
              <Feather name="log-out" size={16} color="#EF4444" />
              <Text className="text-base text-red-500 ml-3 font-medium">Leave Group</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Rename Group Modal */}
      <Modal
        visible={renameOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameOpen(false)}
      >
        <Pressable className="flex-1 bg-black/40 items-center justify-center" onPress={() => setRenameOpen(false)}>
          <Pressable
            className="bg-white rounded-2xl p-6 mx-8 w-full max-w-sm"
            onPress={() => {}}
          >
            <Text className="text-lg font-bold text-gray-900 mb-4">Rename Group</Text>
            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 mb-4"
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Group name"
              autoFocus
              maxLength={50}
            />
            <View className="flex-row justify-end">
              <Pressable className="px-4 py-2 mr-2" onPress={() => setRenameOpen(false)}>
                <Text className="text-base font-medium text-gray-500">Cancel</Text>
              </Pressable>
              <Pressable
                className="bg-gray-900 px-5 py-2 rounded-xl"
                onPress={handleRename}
              >
                <Text className="text-base font-medium text-white">Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
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
                            ? 'Has CoGoal — notification sent'
                            : "Doesn't have CoGoal — invite saved"}
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
                  <TextInput
                    className="flex-1 bg-gray-50 rounded-xl px-3 py-2.5 text-base text-gray-900"
                    placeholder="Phone number"
                    placeholderTextColor="#A3A3A3"
                    value={invitePhoneInput}
                    onChangeText={setInvitePhoneInput}
                    keyboardType="phone-pad"
                    onSubmitEditing={addInvitePhone}
                    returnKeyType="done"
                  />
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
