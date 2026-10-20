import { useState, useEffect } from 'react';
import { ipcService } from './ipc';

// In-memory data URL cache for content-addressed files
const cache = new Map<string, string>();
const pendingFetches = new Map<string, Promise<string>>();
const listeners = new Set<(fileId: string, url: string) => void>();

export const imageCache = {
  get: (fileId: string): string | undefined => {
    return cache.get(fileId);
  },

  set: (fileId: string, dataUrl: string): void => {
    cache.set(fileId, dataUrl);
    listeners.forEach((cb) => cb(fileId, dataUrl));
  },

  has: (fileId: string): boolean => {
    return cache.has(fileId);
  },

  load: async (fileId: string): Promise<string> => {
    if (cache.has(fileId)) {
      return cache.get(fileId)!;
    }
    if (pendingFetches.has(fileId)) {
      return pendingFetches.get(fileId)!;
    }

    const promise = (async () => {
      try {
        const dataUrl = await ipcService.getImageFile(fileId);
        cache.set(fileId, dataUrl);
        listeners.forEach((cb) => cb(fileId, dataUrl));
        return dataUrl;
      } finally {
        pendingFetches.delete(fileId);
      }
    })();

    pendingFetches.set(fileId, promise);
    return promise;
  },

  subscribe: (callback: (fileId: string, url: string) => void): (() => void) => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },
};

/**
 * React hook that returns { url, loading, error } for a content-addressed image
 * attachment, falling back to a direct URL if provided.
 */
export const useImageAttachment = (fileId?: string, fallbackUrl?: string) => {
  const [url, setUrl] = useState<string | undefined>(() => {
    if (fileId && imageCache.has(fileId)) {
      return imageCache.get(fileId);
    }
    return fallbackUrl;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    return Boolean(fileId && !imageCache.has(fileId));
  });
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    if (!fileId) {
      setUrl(fallbackUrl);
      setLoading(false);
      setError(false);
      return;
    }

    if (imageCache.has(fileId)) {
      setUrl(imageCache.get(fileId));
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);
    let cancelled = false;

    imageCache
      .load(fileId)
      .then((dataUrl) => {
        if (!cancelled) {
          setUrl(dataUrl);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn(`Could not load image attachment ${fileId}:`, err);
          setError(true);
          setLoading(false);
        }
      });

    const unsubscribe = imageCache.subscribe((updatedId, updatedUrl) => {
      if (updatedId === fileId && !cancelled) {
        setUrl(updatedUrl);
        setLoading(false);
        setError(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [fileId, fallbackUrl]);

  return { url: url || fallbackUrl, loading, error };
};
