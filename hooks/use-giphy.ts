import { useState, useCallback, useRef } from 'react';

const GIPHY_API_KEY = process.env.EXPO_PUBLIC_GIPHY_API_KEY ?? '';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

export interface GiphyGif {
  id: string;
  title: string;
  /** Fixed-width small preview (200px wide) */
  previewUrl: string;
  /** Original full-size URL */
  originalUrl: string;
}

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyResponse {
  data: Array<{
    id: string;
    title: string;
    images: {
      fixed_width_small: GiphyImage;
      fixed_width: GiphyImage;
      original: GiphyImage;
    };
  }>;
}

function mapGifs(data: GiphyResponse['data']): GiphyGif[] {
  return data.map((g) => ({
    id: g.id,
    title: g.title,
    previewUrl: g.images.fixed_width_small.url,
    originalUrl: g.images.fixed_width.url,
  }));
}

export function useGiphySearch() {
  const [results, setResults] = useState<GiphyGif[]>([]);
  const [trending, setTrending] = useState<GiphyGif[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchTrending = useCallback(async () => {
    if (trending.length > 0) return; // already loaded
    try {
      setIsLoading(true);
      const res = await fetch(
        `${GIPHY_BASE}/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=pg`,
      );
      const json: GiphyResponse = await res.json();
      setTrending(mapGifs(json.data));
    } catch (e) {
      console.warn('Giphy trending fetch failed:', e);
    } finally {
      setIsLoading(false);
    }
  }, [trending.length]);

  const search = useCallback((q: string) => {
    setQuery(q);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!q.trim()) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        setIsLoading(true);
        const res = await fetch(
          `${GIPHY_BASE}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=20&rating=pg`,
        );
        const json: GiphyResponse = await res.json();
        setResults(mapGifs(json.data));
      } catch (e) {
        console.warn('Giphy search failed:', e);
      } finally {
        setIsLoading(false);
      }
    }, 350);
  }, []);

  const displayGifs = query.trim() ? results : trending;

  return { displayGifs, isLoading, query, search, fetchTrending };
}

/** Encode a Giphy GIF as a reaction_type string for the DB */
export function encodeGifReaction(gifId: string): string {
  return `gif:${gifId}`;
}

/** Check if a reaction_type is a GIF reaction */
export function isGifReaction(reactionType: string): boolean {
  return reactionType.startsWith('gif:');
}

/** Extract the Giphy GIF ID from a reaction_type */
export function getGifId(reactionType: string): string {
  return reactionType.slice(4); // remove 'gif:'
}

/** Get the fixed_width URL for a Giphy GIF by ID */
export function getGifUrl(gifId: string): string {
  return `https://media.giphy.com/media/${gifId}/giphy-downsized.gif`;
}

/** Get a small preview URL for a Giphy GIF by ID */
export function getGifPreviewUrl(gifId: string): string {
  return `https://media.giphy.com/media/${gifId}/100w.gif`;
}
