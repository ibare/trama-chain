import { createContext, useContext, type ReactNode } from 'react';
import { createAnimationLoop, type AnimationLoop } from '../canvas/animation-loop.js';
import { createViewportContainer, type ViewportContainer } from '../canvas/viewport.js';
import { createSocketRegistry, type SocketRegistry } from '../canvas/socket-registry.js';
import { createDragRegistry, type DragRegistry } from '../canvas/drag-registry.js';
import { createCableRegistry, type CableRegistry } from '../edge/cable-points-registry.js';
import { createNodeFlashRegistry, type NodeFlashRegistry } from '../pulse/node-flash-registry.js';
import { createPulseRegistry, type PulseRegistry } from '../pulse/pulse-registry.js';
import { createPulseSettingsStore, type PulseSettingsStore } from './pulse-settings.js';
import {
  createSimulationOrchestrator,
  type SimulationOrchestrator,
} from './simulation-orchestrator.js';
import { createTimeSettingsStore, type TimeSettingsStore } from './time-settings.js';
import { createModelStore, type ModelStoreInstance } from './model-store.js';
import { createUIStore, type UIStoreInstance } from './ui-store.js';

/**
 * 한 TramaEditor 인스턴스가 소유하는 가변 컨테이너 묶음.
 * - 모든 store와 registry는 인스턴스별로 격리되어 한 페이지 N개 에디터가 독립 동작.
 * - dispose()는 RAF·구독·DOM ref를 정리하여 mount/unmount 사이클을 견딘다.
 */
export interface TramaInstance {
  animationLoop: AnimationLoop;
  viewport: ViewportContainer;
  socketRegistry: SocketRegistry;
  dragRegistry: DragRegistry;
  cableRegistry: CableRegistry;
  nodeFlashRegistry: NodeFlashRegistry;
  pulseRegistry: PulseRegistry;
  pulseSettingsStore: PulseSettingsStore;
  timeSettingsStore: TimeSettingsStore;
  simulationOrchestrator: SimulationOrchestrator;
  modelStore: ModelStoreInstance;
  uiStore: UIStoreInstance;
  dispose(): void;
}

export function createTramaInstance(): TramaInstance {
  const animationLoop = createAnimationLoop();
  const viewport = createViewportContainer();
  const socketRegistry = createSocketRegistry();
  const dragRegistry = createDragRegistry();
  const cableRegistry = createCableRegistry();
  const nodeFlashRegistry = createNodeFlashRegistry();
  const pulseSettingsStore = createPulseSettingsStore();
  const timeSettingsStore = createTimeSettingsStore();
  const simulationOrchestrator = createSimulationOrchestrator({ timeSettingsStore });
  const pulseRegistry = createPulseRegistry({
    animationLoop,
    pulseSettingsStore,
    timeSettingsStore,
    simulationOrchestrator,
  });
  const modelStore = createModelStore({
    pulseRegistry,
    nodeFlashRegistry,
    timeSettingsStore,
    animationLoop,
    simulationOrchestrator,
  });
  const uiStore = createUIStore();

  return {
    animationLoop,
    viewport,
    socketRegistry,
    dragRegistry,
    cableRegistry,
    nodeFlashRegistry,
    pulseRegistry,
    pulseSettingsStore,
    timeSettingsStore,
    simulationOrchestrator,
    modelStore,
    uiStore,
    dispose(): void {
      pulseRegistry.dispose();
      simulationOrchestrator.dispose();
      animationLoop.dispose();
    },
  };
}

const TramaInstanceContext = createContext<TramaInstance | null>(null);

export function TramaInstanceProvider({
  instance,
  children,
}: {
  instance: TramaInstance;
  children: ReactNode;
}): JSX.Element {
  return (
    <TramaInstanceContext.Provider value={instance}>{children}</TramaInstanceContext.Provider>
  );
}

export function useTrama(): TramaInstance {
  const inst = useContext(TramaInstanceContext);
  if (!inst) {
    throw new Error(
      'useTrama() must be called inside <TramaInstanceProvider>. ' +
        '이 컴포넌트는 TramaEditor 트리 안에서만 동작합니다.',
    );
  }
  return inst;
}
