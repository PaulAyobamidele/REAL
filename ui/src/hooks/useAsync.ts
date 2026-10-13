import { useEffect, useState, type DependencyList } from 'react';

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: Error };

/** Run an async loader when `deps` change; stale results are dropped. */
export function useAsync<T>(
  loader: (() => Promise<T>) | null,
  deps: DependencyList,
): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: loader ? 'loading' : 'idle' });
  useEffect(() => {
    if (!loader) {
      setState({ status: 'idle' });
      return;
    }
    let live = true;
    setState({ status: 'loading' });
    loader().then(
      (data) => live && setState({ status: 'ready', data }),
      (error: unknown) =>
        live &&
        setState({
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
