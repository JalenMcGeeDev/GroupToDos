import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import type { Goal, GoalWithSubGoals, SubGoal } from '../lib/types';

const GOAL_SELECT = '*, creator_profile:profiles!goals_created_by_fkey(*), sub_goals:sub_goals(*)' as const;

export function useGoals(groupId: string) {
  return useQuery({
    queryKey: ['goals', groupId],
    queryFn: async (): Promise<Goal[]> => {
      // Fetch goals directly in this group
      const { data: directGoals, error: directError } = await supabase
        .from('goals')
        .select(GOAL_SELECT)
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

      if (directError) throw directError;

      // Fetch goals shared to this group
      const { data: shares, error: sharesError } = await supabase
        .from('goal_group_shares')
        .select('goal_id')
        .eq('group_id', groupId);

      if (sharesError) throw sharesError;

      const sharedGoalIds = (shares ?? []).map((s: { goal_id: string }) => s.goal_id);
      let sharedGoals: Goal[] = [];

      if (sharedGoalIds.length > 0) {
        const { data, error } = await supabase
          .from('goals')
          .select(GOAL_SELECT)
          .in('id', sharedGoalIds)
          .order('created_at', { ascending: false });

        if (error) throw error;
        sharedGoals = (data as Goal[]) ?? [];
      }

      // Merge and deduplicate
      const allGoals = [...(directGoals as Goal[] ?? [])];
      const existingIds = new Set(allGoals.map((g) => g.id));
      for (const g of sharedGoals) {
        if (!existingIds.has(g.id)) {
          allGoals.push(g);
        }
      }

      return allGoals;
    },
    enabled: !!groupId,
  });
}

export function useGoal(goalId: string) {
  return useQuery({
    queryKey: ['goal', goalId],
    queryFn: async (): Promise<GoalWithSubGoals | null> => {
      const [{ data: goal, error: goalError }, { data: subGoals, error: sgError }] = await Promise.all([
        supabase.from('goals').select('*').eq('id', goalId).single(),
        supabase
          .from('sub_goals')
          .select('*, assigned_profile:profiles!sub_goals_assigned_to_fkey(*)')
          .eq('goal_id', goalId)
          .order('sort_order', { ascending: true }),
      ]);

      if (goalError || !goal) return null;
      if (sgError) throw sgError;

      // Build tree structure
      const subGoalList = (subGoals as SubGoal[]) ?? [];
      const tree = buildSubGoalTree(subGoalList);

      return {
        ...(goal as Goal),
        sub_goals: tree,
      };
    },
    enabled: !!goalId,
  });
}

// Build a tree from flat sub-goals list
function buildSubGoalTree(subGoals: SubGoal[]): SubGoal[] {
  const map = new Map<string, SubGoal>();
  const roots: SubGoal[] = [];

  // Initialize map with children arrays
  subGoals.forEach((sg) => {
    map.set(sg.id, { ...sg, children: [] });
  });

  // Build tree
  subGoals.forEach((sg) => {
    const node = map.get(sg.id)!;
    if (sg.parent_id && map.has(sg.parent_id)) {
      map.get(sg.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

interface CreateGoalInput {
  groupId?: string;
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  tangibleReward?: string;
  subGoals: CreateSubGoalInput[];
}

interface CreateSubGoalInput {
  title: string;
  description?: string;
  level: SubGoal['level'];
  targetValue?: number;
  dueDate?: string;
  assignedTo?: string;
  sortOrder: number;
  children?: CreateSubGoalInput[];
}

export function useCreateGoal() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async (input: CreateGoalInput) => {
      if (!user) throw new Error('Not authenticated');

      // Create the goal
      const { data: goal, error: goalError } = await supabase
        .from('goals')
        .insert({
          group_id: input.groupId ?? null,
          title: input.title,
          description: input.description ?? null,
          start_date: input.startDate,
          end_date: input.endDate ?? null,
          tangible_reward: input.tangibleReward ?? null,
          created_by: user.id,
        })
        .select()
        .single();

      if (goalError || !goal) throw goalError ?? new Error('Failed to create goal');

      // Create sub-goals recursively (auto-assign to creator)
      const defaultAssignee = user.id;
      await createSubGoalsRecursive(goal.id, null, input.subGoals, defaultAssignee);

      // Send push notification to group members
      if (input.groupId) {
        try {
          await supabase.functions.invoke('send-group-push', {
            body: {
              group_id: input.groupId,
              exclude_user_id: user.id,
              title: 'New goal created!',
              body: `${user.user_metadata?.display_name ?? 'A teammate'} created "${input.title}"`,
              data: { type: 'teammate_action', group_id: input.groupId, goal_id: goal.id },
            },
          });
        } catch (e) {
          console.warn('Failed to send goal creation push:', e);
        }
      }

      return goal as Goal;
    },
    onSuccess: (_, variables) => {
      if (variables.groupId) {
        queryClient.invalidateQueries({ queryKey: ['goals', variables.groupId] });
        queryClient.invalidateQueries({ queryKey: ['group', variables.groupId] });
      }
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
    },
  });
}

async function createSubGoalsRecursive(
  goalId: string,
  parentId: string | null,
  subGoals: CreateSubGoalInput[],
  defaultAssignee?: string
): Promise<void> {
  for (const sg of subGoals) {
    const { data, error } = await supabase
      .from('sub_goals')
      .insert({
        goal_id: goalId,
        parent_id: parentId,
        title: sg.title,
        description: sg.description ?? null,
        level: sg.level,
        target_value: sg.targetValue ?? 1,
        due_date: sg.dueDate ?? null,
        assigned_to: sg.assignedTo ?? defaultAssignee ?? null,
        sort_order: sg.sortOrder,
      })
      .select()
      .single();

    if (error || !data) throw error ?? new Error('Failed to create sub-goal');

    if (sg.children?.length) {
      await createSubGoalsRecursive(goalId, data.id, sg.children, defaultAssignee);
    }
  }
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      goalId,
      updates,
    }: {
      goalId: string;
      updates: Partial<Pick<Goal, 'title' | 'description' | 'end_date' | 'tangible_reward' | 'status'>>;
    }) => {
      const { data, error } = await supabase
        .from('goals')
        .update(updates)
        .eq('id', goalId)
        .select()
        .single();

      if (error) throw error;
      return data as Goal;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['goal', data.id] });
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
    },
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (goalId: string) => {
      const { error } = await supabase.from('goals').delete().eq('id', goalId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
    },
  });
}

export function useUpdateSubGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      subGoalId,
      updates,
    }: {
      subGoalId: string;
      updates: Partial<Pick<SubGoal, 'status' | 'current_value' | 'title' | 'description' | 'due_date'>>;
    }) => {
      const { data, error } = await supabase
        .from('sub_goals')
        .update(updates)
        .eq('id', subGoalId)
        .select()
        .single();

      if (error) throw error;
      return data as SubGoal;
    },
    onMutate: async ({ subGoalId, updates }) => {
      // Optimistically update the cached goal data so UI toggles instantly
      const queries = queryClient.getQueriesData<GoalWithSubGoals>({ queryKey: ['goal'] });
      const previous = new Map(queries);

      for (const [key, goal] of queries) {
        if (!goal?.sub_goals) continue;
        queryClient.setQueryData(key, {
          ...goal,
          sub_goals: updateSubGoalInTree(goal.sub_goals, subGoalId, updates),
        });
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Roll back optimistic update on failure
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: (_data, _err, variables) => {
      // Always refetch to ensure consistency
      // Find the goal_id from cache since _data may be undefined on error
      const queries = queryClient.getQueriesData<GoalWithSubGoals>({ queryKey: ['goal'] });
      for (const [key] of queries) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
    },
  });
}

function updateSubGoalInTree(
  subGoals: SubGoal[],
  targetId: string,
  updates: Partial<SubGoal>,
): SubGoal[] {
  return subGoals.map((sg) => {
    if (sg.id === targetId) {
      return { ...sg, ...updates };
    }
    if (sg.children?.length) {
      return { ...sg, children: updateSubGoalInTree(sg.children, targetId, updates) };
    }
    return sg;
  });
}

export function useCreateSubGoal() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: async ({ goalId, title, dueDate }: { goalId: string; title: string; dueDate?: string }) => {
      if (!user) throw new Error('Not authenticated');

      // Get the next sort_order for top-level sub-goals
      const { data: existing } = await supabase
        .from('sub_goals')
        .select('sort_order')
        .eq('goal_id', goalId)
        .is('parent_id', null)
        .order('sort_order', { ascending: false })
        .limit(1);

      const nextOrder = ((existing?.[0]?.sort_order as number) ?? -1) + 1;

      const { data, error } = await supabase
        .from('sub_goals')
        .insert({
          goal_id: goalId,
          parent_id: null,
          title,
          level: 'milestone' as SubGoal['level'],
          target_value: 1,
          due_date: dueDate ?? null,
          assigned_to: user.id,
          sort_order: nextOrder,
        })
        .select('*, assigned_profile:profiles!sub_goals_assigned_to_fkey(*)')
        .single();

      if (error || !data) throw error ?? new Error('Failed to create action');
      return data as SubGoal;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['goal', variables.goalId] });
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
    },
  });
}

/** Compute progress client-side from sub_goals tree (mirrors DB calculate_goal_progress). */
export function computeProgressFromTree(subGoals: SubGoal[]): number {
  // Only count top-level (parent_id is null = roots of the tree)
  const total = subGoals.length;
  if (total === 0) return 0;
  const completed = subGoals.filter((sg) => sg.status === 'completed').length;
  return (completed / total) * 100;
}
