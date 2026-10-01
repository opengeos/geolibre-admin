import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Run an async loader and track its result, re-running when `deps` change.
 *
 * @param load - The loader.
 * @param deps - Values that trigger a reload.
 * @returns The data, error, loading flag, and a manual reload.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  const run = useCallback(load, deps);

  const reload = useCallback(async () => {
    const id = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const value = await run();
      if (id === generation.current) setData(value);
    } catch (caught) {
      if (id === generation.current) setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (id === generation.current) setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}

/**
 * Wrap a mutation so the caller gets a busy flag and an error message.
 *
 * @returns `run(action)` plus the busy and error state.
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { run, busy, error, setError };
}
