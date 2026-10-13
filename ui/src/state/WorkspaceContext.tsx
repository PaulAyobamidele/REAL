import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { joinRows, type SimulationRow } from '@/domain/evidence';
import type { RoundSummary } from '@/domain/lineage';
import { parseSimulationsCsv } from '@/services/csv';
import type { ClusterMap } from '@/services/schemas';
import {
  joinPath,
  KNOWN_FILES,
  loadClusterMap,
  loadTrace,
  loadWorkspace,
  StaticSource,
  type FileSource,
  type Trace,
  type Workspace,
} from '@/services/workspace';

/**
 * Loaded-data state: the workspace, its rounds and their reports, plus
 * on-demand caches for the per-simulation data. Distinct from UI state
 * (which step, which obstacle) and from draft decisions (state/draft.ts).
 */
export type WorkspaceStatus =
  | { status: 'idle' }
  | { status: 'loading'; label: string }
  | { status: 'ready'; workspace: Workspace }
  | { status: 'error'; error: Error; label: string };

export interface WorkspaceApi {
  state: WorkspaceStatus;
  workspace: Workspace | null;
  /** The bundled example workspace served next to the build, when present. */
  exampleSource: StaticSource | null;
  probing: boolean;
  open: (source: FileSource) => Promise<void>;
  reload: () => Promise<void>;
  close: () => void;
  roundById: (id: string) => RoundSummary | undefined;
  simulations: (round: RoundSummary) => Promise<SimulationRow[]>;
  trace: (round: RoundSummary, path: string) => Promise<Trace>;
  clusterMap: (round: RoundSummary) => Promise<ClusterMap>;
  mediaUrl: (round: RoundSummary, file: string) => Promise<string>;
}

const WorkspaceContext = createContext<WorkspaceApi | null>(null);

/** Where a statically served workspace lives, relative to the page. */
export const STATIC_WORKSPACE_URL = './workspace';

export function WorkspaceProvider({
  children,
  autoOpenExample = true,
  initialSource = null,
}: {
  children: ReactNode;
  /** Open the bundled example workspace (served at ./workspace/) when it exists. */
  autoOpenExample?: boolean;
  /** A source to open on mount (tests, embedding). */
  initialSource?: FileSource | null;
}) {
  const [state, setState] = useState<WorkspaceStatus>({ status: 'idle' });
  const [exampleSource, setExampleSource] = useState<StaticSource | null>(null);
  const [probing, setProbing] = useState(true);
  const simulationCache = useRef(new Map<string, Promise<SimulationRow[]>>());
  const traceCache = useRef(new Map<string, Promise<Trace>>());
  const clusterMapCache = useRef(new Map<string, Promise<ClusterMap>>());
  const sourceRef = useRef<FileSource | null>(null);

  const open = useCallback(async (source: FileSource) => {
    sourceRef.current = source;
    simulationCache.current.clear();
    traceCache.current.clear();
    clusterMapCache.current.clear();
    setState({ status: 'loading', label: source.label });
    try {
      const workspace = await loadWorkspace(source);
      setState({ status: 'ready', workspace });
    } catch (error) {
      setState({
        status: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
        label: source.label,
      });
    }
  }, []);

  const reload = useCallback(async () => {
    if (sourceRef.current) await open(sourceRef.current);
  }, [open]);

  const close = useCallback(() => {
    sourceRef.current = null;
    simulationCache.current.clear();
    traceCache.current.clear();
    clusterMapCache.current.clear();
    setState({ status: 'idle' });
  }, []);

  useEffect(() => {
    if (initialSource) void open(initialSource);
  }, [initialSource, open]);

  useEffect(() => {
    let live = true;
    StaticSource.probe(STATIC_WORKSPACE_URL).then((found) => {
      if (!live) return;
      setExampleSource(found);
      setProbing(false);
      if (found && autoOpenExample && !sourceRef.current) void open(found);
    });
    return () => {
      live = false;
    };
  }, [autoOpenExample, open]);

  const workspace = state.status === 'ready' ? state.workspace : null;

  const roundById = useCallback(
    (id: string) => workspace?.rounds.find((r) => r.id === id || r.dir === id),
    [workspace],
  );

  const simulations = useCallback((round: RoundSummary) => {
    const source = sourceRef.current;
    if (!source) return Promise.reject(new Error('no workspace open'));
    const key = round.dir;
    let pending = simulationCache.current.get(key);
    if (!pending) {
      const path = joinPath(round.dir, KNOWN_FILES.simulations);
      pending = source
        .readText(path)
        .then((text) => joinRows(parseSimulationsCsv(text, path), round.report?.simulations));
      simulationCache.current.set(key, pending);
      pending.catch(() => simulationCache.current.delete(key));
    }
    return pending;
  }, []);

  const trace = useCallback((round: RoundSummary, path: string) => {
    const source = sourceRef.current;
    if (!source) return Promise.reject(new Error('no workspace open'));
    const key = joinPath(round.dir, path);
    let pending = traceCache.current.get(key);
    if (!pending) {
      pending = loadTrace(source, round.dir, path);
      traceCache.current.set(key, pending);
      pending.catch(() => traceCache.current.delete(key));
    }
    return pending;
  }, []);

  const clusterMap = useCallback((round: RoundSummary) => {
    const source = sourceRef.current;
    if (!source) return Promise.reject(new Error('no workspace open'));
    let pending = clusterMapCache.current.get(round.dir);
    if (!pending) {
      pending = loadClusterMap(source, round.dir);
      clusterMapCache.current.set(round.dir, pending);
      pending.catch(() => clusterMapCache.current.delete(round.dir));
    }
    return pending;
  }, []);

  const mediaUrl = useCallback((round: RoundSummary, file: string) => {
    const source = sourceRef.current;
    if (!source) return Promise.reject(new Error('no workspace open'));
    return source.mediaUrl(joinPath(round.dir, file));
  }, []);

  const api = useMemo<WorkspaceApi>(
    () => ({
      state,
      workspace,
      exampleSource,
      probing,
      open,
      reload,
      close,
      roundById,
      simulations,
      trace,
      clusterMap,
      mediaUrl,
    }),
    [
      state,
      workspace,
      exampleSource,
      probing,
      open,
      reload,
      close,
      roundById,
      simulations,
      trace,
      clusterMap,
      mediaUrl,
    ],
  );
  return <WorkspaceContext.Provider value={api}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceApi {
  const api = useContext(WorkspaceContext);
  if (!api) throw new Error('useWorkspace outside WorkspaceProvider');
  return api;
}
