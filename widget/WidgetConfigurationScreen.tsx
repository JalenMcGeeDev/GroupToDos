import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from 'react-native';
import type { WidgetConfigurationScreenProps } from 'react-native-android-widget';

import {
  readSession,
  refreshSessionIfNeeded,
  fetchUserGroups,
  writeWidgetGroupConfig,
  type WidgetGroupInfo,
} from './widget-data';
import { GroupActivityWidgetMedium } from './GroupActivityWidgetMedium';
import { GroupActivityWidgetLarge } from './GroupActivityWidgetLarge';

export function WidgetConfigurationScreen({
  widgetInfo,
  renderWidget,
  setResult,
}: WidgetConfigurationScreenProps) {
  const [groups, setGroups] = useState<WidgetGroupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const session = await readSession();
        if (!session) {
          setError('Not logged in. Open Cogo first, then try adding the widget again.');
          setLoading(false);
          return;
        }
        const fresh = await refreshSessionIfNeeded(session);
        const userGroups = await fetchUserGroups(fresh.access_token, fresh.user_id);
        setGroups(userGroups);
      } catch {
        setError('Failed to load groups. Check your connection and try again.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleGroupSelect(group: WidgetGroupInfo) {
    await writeWidgetGroupConfig(widgetInfo.widgetId, group);
    const isLarge = widgetInfo.widgetName === 'GroupActivityWidgetLarge';
    renderWidget(
      isLarge
        ? <GroupActivityWidgetLarge items={[]} groupName={group.name} loading />
        : <GroupActivityWidgetMedium items={[]} groupName={group.name} loading />
    );
    setResult('ok');
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Choose a Group</Text>
        <Text style={styles.subtitle}>
          Select which group to show in your widget
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#3B82F6" style={styles.spinner} />
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setResult('cancel')}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            No groups found. Join or create a group in Cogo first.
          </Text>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setResult('cancel')}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {groups.map((group) => (
            <TouchableOpacity
              key={group.id}
              style={styles.groupRow}
              onPress={() => handleGroupSelect(group)}
            >
              <Text style={styles.groupName}>{group.name}</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.groupRow, styles.cancelRow]}
            onPress={() => setResult('cancel')}
          >
            <Text style={styles.cancelRowText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C2C2E',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#8E8E93',
  },
  spinner: {
    marginTop: 40,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 32,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2C2C2E',
  },
  groupName: {
    fontSize: 17,
    color: '#FFFFFF',
  },
  chevron: {
    fontSize: 20,
    color: '#8E8E93',
  },
  cancelRow: {
    justifyContent: 'center',
    marginTop: 12,
    borderBottomWidth: 0,
  },
  cancelRowText: {
    fontSize: 17,
    color: '#FF3B30',
  },
});
