import { MemoryStorage, Storage } from './MemoryStorage'
import EventHub from './EventHub'
import { ExecutionEngine } from './ExecutionEngine'
import { StateManager, WorkflowSnapshot, WorkerSnapshot } from './StateManager'

// ===== 工作流相关类型定义 =====

// 基础状态枚举
export const ExecutionStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  SUCCESS: 'success',
  FAILED: 'failed',
  STOPPED: 'stopped',
  COMPLETED: 'completed'
} as const

export type ExecutionStatus = (typeof ExecutionStatus)[keyof typeof ExecutionStatus]

// 用户返回结果类型
export interface SuccessNextResult {
  success: true
  data?: unknown
  metadata?: Record<string, unknown>
}

export interface FailedNextResult {
  success: false
  error: string
  metadata?: Record<string, unknown>
}

export type NextResult = SuccessNextResult | FailedNextResult

// 系统完整结果类型
export interface SuccessWorkerResult {
  workerId: string
  workerName: string
  success: true
  data?: unknown
  metadata?: Record<string, unknown>
  executedAt: number
}

export interface FailedWorkerResult {
  workerId: string
  workerName: string
  success: false
  error: string
  metadata?: Record<string, unknown>
  executedAt: number
}

export type WorkerResult = SuccessWorkerResult | FailedWorkerResult

// 执行上下文
export interface ExecutionContext {
  data: unknown
  metadata: Record<string, unknown>
  history: WorkerResult[]
  workflowId: string
  executionPath: string[]
  status: ExecutionStatus
}

// 洋葱模型的 next 函数
export type NextFunction = (result: NextResult, target?: string | Worker | Workflow) => Promise<void>

// 配置接口
export interface WorkflowConfig {
  id: string
  name?: string
  description?: string
  storage?: Storage
}

export interface WorkerConfig {
  id: string
  name?: string
  description?: string
}


// Worker 基类
export abstract class Worker {
  readonly type = 'worker' as const
  readonly id: string
  readonly name: string
  readonly description?: string

  constructor(options: WorkerConfig) {
    this.id = options.id
    this.name = options.name || 'Unnamed Worker'
    this.description = options.description
  }

  abstract execute(context: ExecutionContext, next: NextFunction): Promise<void>
}

// 事件常量
export const WorkflowEvents = {
  STARTED: 'workflow:started',
  PROGRESS_UPDATED: 'workflow:progress:updated',
  STATUS_CHANGED: 'workflow:status:changed',
  PAUSED: 'workflow:paused',
  RESUMED: 'workflow:resumed',
  COMPLETED: 'workflow:completed',
  SUCCESS: 'workflow:success',
  FAILED: 'workflow:failed',
  STOPPED: 'workflow:stopped'
} as const

export const WorkerEvents = {
  WORKER_STARTED: 'workflow:worker:started',
  WORKER_COMPLETED: 'workflow:worker:completed',
  WORKER_SUCCESS: 'workflow:worker:success',
  WORKER_FAILED: 'workflow:worker:failed'
} as const

// 事件数据接口
export interface BaseEventData {
  workflowId: string
  timestamp: number
}

export interface WorkflowStartedEventData extends BaseEventData {
  data: unknown
}

export interface WorkflowProgressEventData extends BaseEventData {
  progress: {
    current: number
    total: number
    percentage: number
  }
}

export interface WorkflowStatusChangedEventData extends BaseEventData {
  status: {
    from: ExecutionStatus
    to: ExecutionStatus
  }
}

export interface WorkflowPausedEventData extends BaseEventData {}
export interface WorkflowResumedEventData extends BaseEventData {}

export interface WorkflowCompletedEventData extends BaseEventData {
  data?: unknown
}

export interface WorkflowSuccessEventData extends BaseEventData {
  data?: unknown
}

export interface WorkflowFailedEventData extends BaseEventData {
  error: string
}

export interface WorkflowStoppedEventData extends BaseEventData {}

export interface WorkerStartedEventData extends BaseEventData {
  workerId: string
}

export interface WorkerCompletedEventData extends BaseEventData {
  workerId: string
  data?: unknown
}

export interface WorkerSuccessEventData extends BaseEventData {
  workerId: string
  data?: unknown
}

export interface WorkerFailedEventData extends BaseEventData {
  workerId: string
  error?: string
}

// 事件监听器映射
export type WorkflowEventMap = {
  [WorkflowEvents.STARTED]: (event: WorkflowStartedEventData) => void
  [WorkflowEvents.PROGRESS_UPDATED]: (event: WorkflowProgressEventData) => void
  [WorkflowEvents.STATUS_CHANGED]: (event: WorkflowStatusChangedEventData) => void
  [WorkflowEvents.PAUSED]: (event: WorkflowPausedEventData) => void
  [WorkflowEvents.RESUMED]: (event: WorkflowResumedEventData) => void
  [WorkflowEvents.COMPLETED]: (event: WorkflowCompletedEventData) => void
  [WorkflowEvents.SUCCESS]: (event: WorkflowSuccessEventData) => void
  [WorkflowEvents.FAILED]: (event: WorkflowFailedEventData) => void
  [WorkflowEvents.STOPPED]: (event: WorkflowStoppedEventData) => void
  [WorkerEvents.WORKER_STARTED]: (event: WorkerStartedEventData) => void
  [WorkerEvents.WORKER_COMPLETED]: (event: WorkerCompletedEventData) => void
  [WorkerEvents.WORKER_SUCCESS]: (event: WorkerSuccessEventData) => void
  [WorkerEvents.WORKER_FAILED]: (event: WorkerFailedEventData) => void
}

// ===== 工作流实现 =====

/**
 * 工作流类 - 使用重构后的分层架构
 * 保持原有API完全兼容，内部使用优化后的实现
 * 使用组合模式获得事件功能，避免方法名冲突
 */
export class Workflow {
  readonly type = 'workflow' as const
  readonly id: string
  readonly name: string
  readonly description?: string

  // 事件系统 (组合模式)
  private eventHub: EventHub<WorkflowEventMap>

  // 核心组件
  private executionEngine: ExecutionEngine
  private stateManager: StateManager

  // 节点管理
  private nodePool: Map<string, Worker | Workflow> = new Map()
  private executionOrder: string[] = []

  constructor(options: WorkflowConfig) {
    this.id = options.id
    this.name = options.name || 'Unnamed Workflow'
    this.description = options.description

    const storage = options.storage || new MemoryStorage()

    // 初始化事件系统
    this.eventHub = new EventHub<WorkflowEventMap>()

    // 直接绑定事件方法
    this.on = this.eventHub.on.bind(this.eventHub)
    this.once = this.eventHub.once.bind(this.eventHub)
    this.emit = this.eventHub.emit.bind(this.eventHub)
    this.off = this.eventHub.off.bind(this.eventHub)

    // 初始化核心组件
    this.executionEngine = new ExecutionEngine(this.eventHub)
    this.stateManager = new StateManager(storage, this.id)
  }

  // ===== 构建 API =====

  add(item: Worker | Workflow): Workflow {
    this.nodePool.set(item.id, item)
    this.executionOrder.push(item.id)
    return this
  }

  remove(id: string): boolean {
    const removed = this.nodePool.delete(id)
    if (removed) {
      const index = this.executionOrder.indexOf(id)
      if (index > -1) {
        this.executionOrder.splice(index, 1)
      }
    }
    return removed
  }

  has(id: string): boolean {
    return this.nodePool.has(id)
  }

  query(id: string): Worker | Workflow | undefined {
    return this.nodePool.get(id)
  }

  size(): number {
    return this.nodePool.size
  }

  clear(): void {
    this.nodePool.clear()
    this.executionOrder = []
  }

  // ===== 查询 API =====

  getWorkers(): Worker[] {
    return Array.from(this.nodePool.values()).filter((item): item is Worker => item.type === 'worker')
  }

  getWorkflows(): Workflow[] {
    return Array.from(this.nodePool.values()).filter((item): item is Workflow => item.type === 'workflow')
  }

  getAll(): (Worker | Workflow)[] {
    return Array.from(this.nodePool.values())
  }

  queryWorkers(predicate?: (worker: Worker) => boolean): Worker[] {
    const workers = this.getWorkers()
    return predicate ? workers.filter(predicate) : workers
  }

  queryWorkflows(predicate?: (workflow: Workflow) => boolean): Workflow[] {
    const workflows = this.getWorkflows()
    return predicate ? workflows.filter(predicate) : workflows
  }

  queryExecution(): {
    status: ExecutionStatus
    progress: { current: number; total: number; percentage: number }
    currentNode?: Worker | Workflow
    executedNodes: (Worker | Workflow)[]
    executionStack: (Worker | Workflow)[]
    completedItems: (Worker | Workflow)[]
    successfulItems: (Worker | Workflow)[]
    failedItems: (Worker | Workflow)[]
  } | null {
    const executionState = this.executionEngine.getExecutionState()
    if (!executionState) {
      return null
    }

    const progress = executionState.getProgress(this.nodePool.size)
    const currentNode = this.nodePool.get(executionState.currentNodeId)

    const executedNodes = Array.from(executionState.executedNodes)
      .map((id) => this.nodePool.get(id))
      .filter((item): item is Worker | Workflow => !!item)

    const executionStack = executionState.executionStack
      .map((id) => this.nodePool.get(id))
      .filter((item): item is Worker | Workflow => !!item)

    return {
      status: executionState.status,
      progress,
      currentNode,
      executedNodes,
      executionStack,
      completedItems: this.queryByStatus(ExecutionStatus.COMPLETED),
      successfulItems: this.queryByStatus(ExecutionStatus.SUCCESS),
      failedItems: this.queryByStatus(ExecutionStatus.FAILED)
    }
  }

  queryHistory(): WorkerResult[] {
    const executionState = this.executionEngine.getExecutionState()
    return executionState?.context.history || []
  }

  queryByName(name: string): (Worker | Workflow)[] {
    return this.getAll().filter((item) => item.name.includes(name))
  }

  queryByType(type: 'worker' | 'workflow'): (Worker | Workflow)[] {
    return this.getAll().filter((item) => item.type === type)
  }

  queryByStatus(status: ExecutionStatus): (Worker | Workflow)[] {
    const executionState = this.executionEngine.getExecutionState()
    if (!executionState) {
      return []
    }

    // 特殊处理 COMPLETED 状态
    if (status === ExecutionStatus.COMPLETED) {
      return [...this.queryByStatus(ExecutionStatus.SUCCESS), ...this.queryByStatus(ExecutionStatus.FAILED)]
    }

    return this.getAll()
      .map((item) => {
        const historyResult = executionState.context.history.find((h) => h.workerId === item.id)
        const itemStatus: ExecutionStatus = historyResult
          ? historyResult.success
            ? ExecutionStatus.SUCCESS
            : ExecutionStatus.FAILED
          : ExecutionStatus.PENDING
        return { item, itemStatus }
      })
      .filter(({ itemStatus }) => itemStatus === status)
      .map(({ item }) => item)
  }

  // ===== 事件 API =====
  // 通过构造函数中的直接绑定获得事件方法
  on!: EventHub<WorkflowEventMap>['on']
  once!: EventHub<WorkflowEventMap>['once']
  emit!: EventHub<WorkflowEventMap>['emit']
  off!: EventHub<WorkflowEventMap>['off']

  // ===== 执行控制 API =====

  async start(initialData: unknown, startTarget?: string): Promise<WorkerResult> {
    this.validateNodePool()

    // 尝试自动恢复状态
    const restoredState = await this.stateManager.autoRestore(this.nodePool, this.executionOrder)

    if (restoredState) {
      console.log('▶️ 从暂停点继续执行')
      this.emitStatusChange(ExecutionStatus.PAUSED, ExecutionStatus.RUNNING)
      return this.executionEngine.continue(this.nodePool, this.executionOrder, restoredState)
    } else {
      console.log('🚀 开始新的执行')
      return this.executionEngine.start(this.nodePool, this.executionOrder, initialData, this.id, startTarget)
    }
  }

  async pause(): Promise<void> {
    const executionState = this.executionEngine.getExecutionState()
    if (executionState?.status === ExecutionStatus.RUNNING) {
      this.executionEngine.pause()
      this.emitStatusChange(ExecutionStatus.RUNNING, ExecutionStatus.PAUSED)
    }
  }

  async resume(): Promise<void> {
    const executionState = this.executionEngine.getExecutionState()
    if (executionState?.status === ExecutionStatus.PAUSED) {
      this.emitStatusChange(ExecutionStatus.PAUSED, ExecutionStatus.RUNNING)
      this.emit(WorkflowEvents.RESUMED, {
        workflowId: this.id,
        timestamp: Date.now()
      })

      // 继续执行会由 ExecutionEngine 处理
    }
  }

  async stop(): Promise<void> {
    const executionState = this.executionEngine.getExecutionState()
    if (executionState) {
      const oldStatus = executionState.status
      this.executionEngine.stop()
      this.emitStatusChange(oldStatus, ExecutionStatus.STOPPED)
    }
  }

  // ===== 序列化 API =====

  serialize(): WorkflowSnapshot {
    const executionState = this.executionEngine.getExecutionState()
    if (!executionState) {
      throw new Error('No execution state to serialize')
    }

    return (this.stateManager as any).serializeState(executionState, this.nodePool, this.executionOrder, this.name)
  }

  deserialize(snapshot: WorkflowSnapshot): void {
    // 验证快照
    this.validateSnapshot(snapshot)

    // 由 StateManager 处理反序列化逻辑
    // 实际的状态恢复会在下次 start() 时通过 autoRestore 完成
  }

  // ===== 私有方法 =====

  private validateNodePool(): void {
    if (this.executionOrder.length === 0) {
      throw new Error('No workers added to workflow')
    }
  }

  private validateSnapshot(snapshot: WorkflowSnapshot): void {
    const missingNodes = snapshot.children.filter((child) => !this.nodePool.has(child.id))
    if (missingNodes.length > 0) {
      const missingNode = missingNodes[0]
      throw new Error(`Required ${missingNode.type} ${missingNode.id} not found in current workflow`)
    }
  }

  private emitStatusChange(from: ExecutionStatus, to: ExecutionStatus): void {
    this.emit(WorkflowEvents.STATUS_CHANGED, {
      workflowId: this.id,
      timestamp: Date.now(),
      status: { from, to }
    })
  }
}

export default Workflow
