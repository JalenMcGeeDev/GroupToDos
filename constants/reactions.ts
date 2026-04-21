import { isGifReaction } from '../hooks/use-giphy';

// ─── Curated emoji reactions ────────────────────────────────
export const REACTION_EMOJIS = ['👏', '🙌', '💪', '❤️', '🔥', '⭐', '🎯', '💯'] as const;

// ─── Helper to get a display label for a reaction ───────────
export function getReactionLabel(reactionType: string): string {
  if (isGifReaction(reactionType)) return 'GIF';
  return reactionType; // emoji is its own label
}
