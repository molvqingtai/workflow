// 导出核心组件
export { MemoryStorage, type Storage } from './MemoryStorage'

// 导出主要的工作流类和相关类型
export { Workflow, Worker, ExecutionStatus } from './workflow'

export type {
  SuccessNextResult,
  FailedNextResult,
  NextResult,
  WorkerResult,
  ExecutionContext,
  WorkflowConfig,
  WorkerConfig,
  NextFunction
} from './workflow'

export type { WorkerSnapshot, WorkflowSnapshot } from './StateManager'

// 导出分层架构组件（高级用法）
export {
  WorkflowEvents,
  WorkerEvents,
  type BaseEventData,
  type WorkflowStartedEventData,
  type WorkflowProgressEventData,
  type WorkflowStatusChangedEventData,
  type WorkflowPausedEventData,
  type WorkflowResumedEventData,
  type WorkflowCompletedEventData,
  type WorkflowSuccessEventData,
  type WorkflowFailedEventData,
  type WorkflowStoppedEventData,
  type WorkerStartedEventData,
  type WorkerCompletedEventData,
  type WorkerSuccessEventData,
  type WorkerFailedEventData,
  type WorkflowEventMap
} from './workflow'
export { ExecutionEngine, ExecutionState } from './ExecutionEngine'
export { StateManager } from './StateManager'

// 保持默认导出
export { default } from './workflow'
