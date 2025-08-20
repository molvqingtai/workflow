import { ExecutionStatus } from './workflow'
import type {
  Worker,
  Workflow,
  NextFunction,
  NextResult,
  WorkerResult,
  ExecutionContext,
  WorkflowEventMap
} from './workflow'
import { WorkflowEvents, WorkerEvents } from './workflow'
import EventHub from './EventHub'

/**
 * 工作流执行状态管理器
 * 负责管理工作流的执行状态、上下文和执行栈
 */
export class ExecutionState {
  private _currentNodeId: string
  private _executedNodes: Set<string>
  private _context: ExecutionContext
  private _status: ExecutionStatus
  private _executionStack: string[]

  constructor(startNodeId: string, initialContext: ExecutionContext) {
    this._currentNodeId = startNodeId
    this._executedNodes = new Set()
    this._context = initialContext
    this._status = ExecutionStatus.RUNNING
    this._executionStack = []
  }

  // Getters
  get currentNodeId(): string {
    return this._currentNodeId
  }

  get executedNodes(): Set<string> {
    return new Set(this._executedNodes) // 返回副本，防止外部修改
  }

  get context(): ExecutionContext {
    return { ...this._context } // 返回副本，防止外部修改
  }

  get status(): ExecutionStatus {
    return this._status
  }

  get executionStack(): string[] {
    return [...this._executionStack] // 返回副本，防止外部修改
  }

  // 状态修改方法
  setCurrentNode(nodeId: string): void {
    this._currentNodeId = nodeId
  }

  addExecutedNode(nodeId: string): void {
    this._executedNodes.add(nodeId)
  }

  updateContext(newContext: ExecutionContext): void {
    this._context = newContext
  }

  updateContextData(data: unknown): void {
    this._context = {
      ...this._context,
      data
    }
  }

  setStatus(status: ExecutionStatus): void {
    this._status = status
  }

  pushToStack(nodeId: string): void {
    this._executionStack.push(nodeId)
  }

  popFromStack(): string | undefined {
    return this._executionStack.pop()
  }

  hasInStack(nodeId: string): boolean {
    return this._executionStack.includes(nodeId)
  }

  // 重置状态（用于重新开始）
  reset(startNodeId: string, initialContext: ExecutionContext): void {
    this._currentNodeId = startNodeId
    this._executedNodes.clear()
    this._context = initialContext
    this._status = ExecutionStatus.RUNNING
    this._executionStack = []
  }

  // 获取执行进度信息
  getProgress(totalNodes: number): { current: number; total: number; percentage: number } {
    const current = this._executedNodes.size
    const percentage = totalNodes === 0 ? 100 : Math.round((current / totalNodes) * 100)

    return {
      current,
      total: totalNodes,
      percentage
    }
  }
}

/**
 * 工作流执行引擎
 * 负责核心的洋葱模型执行逻辑
 */
export class ExecutionEngine {
  private eventEmitter: EventHub<WorkflowEventMap>
  private executionState: ExecutionState | null = null
  private pauseRequested = false
  private stopRequested = false

  constructor(eventEmitter: EventHub<WorkflowEventMap>) {
    this.eventEmitter = eventEmitter
  }

  /**
   * 开始执行
   */
  async start(
    nodePool: Map<string, Worker | Workflow>,
    executionOrder: string[],
    initialData: unknown,
    workflowId: string,
    startNodeId?: string
  ): Promise<WorkerResult> {
    const nodeId = startNodeId || executionOrder[0]
    if (!nodeId) {
      throw new Error('No workers added to workflow')
    }

    // 初始化执行状态
    const initialContext: ExecutionContext = {
      data: initialData,
      metadata: {},
      history: [],
      workflowId,
      executionPath: [],
      status: ExecutionStatus.RUNNING
    }

    this.executionState = new ExecutionState(nodeId, initialContext)
    this.pauseRequested = false
    this.stopRequested = false

    // 发射开始事件
    this.eventEmitter.emit(WorkflowEvents.STARTED, {
      workflowId,
      timestamp: Date.now(),
      data: initialData
    })

    return this.executeNode(nodePool, executionOrder, nodeId, initialData)
  }

  /**
   * 继续执行（从暂停状态恢复）
   */
  async continue(
    nodePool: Map<string, Worker | Workflow>,
    executionOrder: string[],
    existingState: ExecutionState
  ): Promise<WorkerResult> {
    this.executionState = existingState
    this.pauseRequested = false
    this.stopRequested = false

    return this.executeNode(nodePool, executionOrder, existingState.currentNodeId, existingState.context.data)
  }

  /**
   * 暂停执行
   */
  pause(): void {
    this.pauseRequested = true
  }

  /**
   * 停止执行
   */
  stop(): void {
    this.stopRequested = true
  }

  /**
   * 获取当前执行状态
   */
  getExecutionState(): ExecutionState | null {
    return this.executionState
  }

  /**
   * 核心执行方法 - 洋葱模型
   */
  private async executeNode(
    nodePool: Map<string, Worker | Workflow>,
    executionOrder: string[],
    nodeId: string,
    data: unknown
  ): Promise<WorkerResult> {
    if (!this.executionState) {
      throw new Error('Execution state not initialized')
    }

    // 检查停止/暂停请求
    if (this.stopRequested) {
      return this.handleStop()
    }
    if (this.pauseRequested) {
      return this.handlePause()
    }

    // 检查循环调用
    if (this.executionState.hasInStack(nodeId)) {
      throw new Error(`Circular execution detected: ${this.executionState.executionStack.join(' -> ')} -> ${nodeId}`)
    }

    const node = nodePool.get(nodeId)
    if (!node) {
      throw new Error(`Node ${nodeId} not found in pool`)
    }

    // 更新执行状态
    this.executionState.setCurrentNode(nodeId)
    this.executionState.pushToStack(nodeId)
    this.executionState.addExecutedNode(nodeId)
    this.executionState.updateContextData(data)

    try {
      // 创建 next 函数
      const next = this.createNextFunction(nodePool, executionOrder)

      // 执行节点
      const result = await this.executeItem(node, next)

      // 发射进度更新事件
      this.emitProgressUpdate(nodePool.size)

      // 移除当前节点从执行栈
      this.executionState.popFromStack()

      return result
    } catch (error: unknown) {
      // 移除当前节点从执行栈
      this.executionState.popFromStack()
      throw error
    }
  }

  /**
   * 创建 next 函数
   */
  private createNextFunction(nodePool: Map<string, Worker | Workflow>, executionOrder: string[]): NextFunction {
    return async (result: NextResult, target?: string | Worker | Workflow): Promise<void> => {
      if (!this.executionState) {
        throw new Error('Execution state not initialized')
      }

      let targetId: string | undefined

      if (!target) {
        // 按执行顺序获取下一个节点
        targetId = this.getNextNodeInOrder(executionOrder)
        if (!targetId) {
          // 没有下一个节点，工作流结束
          if (result.success && result.data !== undefined) {
            this.executionState.updateContextData(result.data)
          }
          await this.handleCompletion()
          return
        }
      } else if (typeof target === 'string') {
        targetId = target
      } else {
        targetId = target.id
        // 验证对象是否在当前工作流中
        if (!nodePool.has(targetId)) {
          throw new Error(
            `Target ${target.type} "${targetId}" is not part of this workflow. Please add it to the workflow first.`
          )
        }
      }

      const nextData = result.success && result.data !== undefined ? result.data : this.executionState.context.data
      await this.executeNode(nodePool, executionOrder, targetId, nextData)
    }
  }

  /**
   * 执行单个节点（Worker 或 Workflow）
   */
  private async executeItem(item: Worker | Workflow, next: NextFunction): Promise<WorkerResult> {
    if (!this.executionState) {
      throw new Error('Execution state not initialized')
    }

    // 发射 Worker 开始事件
    this.eventEmitter.emit(WorkerEvents.WORKER_STARTED, {
      workflowId: this.executionState.context.workflowId,
      workerId: item.id,
      timestamp: Date.now()
    })

    if (item.type === 'worker') {
      return this.executeWorker(item as Worker, next)
    } else {
      return this.executeNestedWorkflow(item as Workflow)
    }
  }

  /**
   * 执行 Worker
   */
  private async executeWorker(worker: Worker, next: NextFunction): Promise<WorkerResult> {
    if (!this.executionState) {
      throw new Error('Execution state not initialized')
    }

    let nextCalled = false
    let workerResult: WorkerResult | null = null

    // 包装 next 函数
    const wrappedNext: NextFunction = async (userResult: NextResult, target?: string | Worker | Workflow) => {
      nextCalled = true

      // 创建完整的 Worker 结果
      if (userResult.success) {
        workerResult = {
          workerId: worker.id,
          workerName: worker.name,
          success: true,
          data: userResult.data,
          metadata: userResult.metadata || {},
          executedAt: Date.now()
        }

        // 发射成功事件
        this.eventEmitter.emit(WorkerEvents.WORKER_SUCCESS, {
          workflowId: this.executionState!.context.workflowId,
          workerId: worker.id,
          timestamp: Date.now(),
          data: workerResult.data
        })
      } else {
        workerResult = {
          workerId: worker.id,
          workerName: worker.name,
          success: false,
          error: userResult.error,
          metadata: userResult.metadata || {},
          executedAt: Date.now()
        }

        // 发射失败事件
        this.eventEmitter.emit(WorkerEvents.WORKER_FAILED, {
          workflowId: this.executionState!.context.workflowId,
          workerId: worker.id,
          timestamp: Date.now(),
          error: workerResult.error
        })
      }

      // 更新上下文和历史记录
      this.updateContextWithResult(workerResult)

      // 继续调用原始的 next 函数
      await next(userResult, target)
    }

    try {
      await worker.execute(this.executionState.context, wrappedNext)

      if (!nextCalled) {
        // Worker 没有调用 next，执行失败
        const failureResult: WorkerResult = {
          workerId: worker.id,
          workerName: worker.name,
          success: false,
          error: `Worker ${worker.id} execution failed - did not call next()`,
          metadata: {},
          executedAt: Date.now()
        }

        this.updateContextWithResult(failureResult)

        this.eventEmitter.emit(WorkerEvents.WORKER_FAILED, {
          workflowId: this.executionState.context.workflowId,
          workerId: worker.id,
          timestamp: Date.now(),
          error: failureResult.error
        })

        await this.handleCompletion()
        return failureResult
      } else {
        // 检查是否已完成
        if (this.executionState.status === ExecutionStatus.COMPLETED) {
          return this.createCompletionResult()
        } else {
          return workerResult || this.createDefaultResult(worker)
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      this.eventEmitter.emit(WorkerEvents.WORKER_FAILED, {
        workflowId: this.executionState.context.workflowId,
        workerId: worker.id,
        timestamp: Date.now(),
        error: errorMessage
      })

      throw error
    }
  }

  /**
   * 执行嵌套工作流
   */
  private async executeNestedWorkflow(workflow: Workflow): Promise<WorkerResult> {
    if (!this.executionState) {
      throw new Error('Execution state not initialized')
    }

    const result = await workflow.start(this.executionState.context.data)

    const workflowResult: WorkerResult = {
      ...result,
      workerId: workflow.id,
      workerName: workflow.name,
      executedAt: Date.now()
    }

    if (result.success) {
      this.eventEmitter.emit(WorkerEvents.WORKER_SUCCESS, {
        workflowId: this.executionState.context.workflowId,
        workerId: workflow.id,
        timestamp: Date.now(),
        data: result.data
      })
    } else {
      this.eventEmitter.emit(WorkerEvents.WORKER_FAILED, {
        workflowId: this.executionState.context.workflowId,
        workerId: workflow.id,
        timestamp: Date.now(),
        error: result.error
      })
    }

    this.updateContextWithResult(workflowResult)
    return workflowResult
  }

  /**
   * 获取执行顺序中的下一个节点
   */
  private getNextNodeInOrder(executionOrder: string[]): string | undefined {
    if (!this.executionState) return undefined

    const currentIndex = executionOrder.indexOf(this.executionState.currentNodeId)
    if (currentIndex >= 0 && currentIndex < executionOrder.length - 1) {
      return executionOrder[currentIndex + 1]
    }
    return undefined
  }

  /**
   * 更新上下文与结果
   */
  private updateContextWithResult(result: WorkerResult): void {
    if (!this.executionState) return

    const updatedContext: ExecutionContext = {
      ...this.executionState.context,
      data: result.success && result.data !== undefined ? result.data : this.executionState.context.data,
      history: [...this.executionState.context.history, result],
      executionPath: [...this.executionState.context.executionPath, result.workerId],
      metadata: {
        ...this.executionState.context.metadata,
        ...result.metadata
      }
    }

    this.executionState.updateContext(updatedContext)
  }

  /**
   * 处理暂停
   */
  private handlePause(): WorkerResult {
    if (!this.executionState) {
      throw new Error('Execution state not initialized')
    }

    this.executionState.setStatus(ExecutionStatus.PAUSED)

    this.eventEmitter.emit(WorkflowEvents.PAUSED, {
      workflowId: this.executionState.context.workflowId,
      timestamp: Date.now()
    })

    const lastResult =
      this.executionState.context.history.length > 0
        ? this.executionState.context.history[this.executionState.context.history.length - 1]
        : null

    return {
      workerId: lastResult?.workerId || this.executionState.context.workflowId,
      workerName: lastResult?.workerName || 'Workflow',
      success: false,
      error: 'Workflow paused',
      metadata: {},
      executedAt: Date.now()
    }
  }

  /**
   * 处理停止
   */
  private handleStop(): WorkerResult {
    if (!this.executionState) {
      throw new Error('Execution state not initialized')
    }

    this.executionState.setStatus(ExecutionStatus.STOPPED)

    this.eventEmitter.emit(WorkflowEvents.STOPPED, {
      workflowId: this.executionState.context.workflowId,
      timestamp: Date.now()
    })

    return {
      workerId: this.executionState.context.workflowId,
      workerName: 'Workflow',
      success: false,
      error: 'Workflow stopped',
      metadata: {},
      executedAt: Date.now()
    }
  }

  /**
   * 处理完成
   */
  private async handleCompletion(): Promise<void> {
    if (!this.executionState) return

    const oldStatus = this.executionState.status
    this.executionState.setStatus(ExecutionStatus.COMPLETED)

    // 发射状态变更事件
    this.eventEmitter.emit(WorkflowEvents.STATUS_CHANGED, {
      workflowId: this.executionState.context.workflowId,
      timestamp: Date.now(),
      status: { from: oldStatus, to: ExecutionStatus.COMPLETED }
    })

    // 检查是否有失败的任务
    const hasFailedTasks = this.executionState.context.history.some((h) => !h.success)

    // 发射完成事件
    this.eventEmitter.emit(WorkflowEvents.COMPLETED, {
      workflowId: this.executionState.context.workflowId,
      timestamp: Date.now(),
      data: this.executionState.context.data
    })

    // 如果没有失败任务，发射成功事件
    if (!hasFailedTasks) {
      this.eventEmitter.emit(WorkflowEvents.SUCCESS, {
        workflowId: this.executionState.context.workflowId,
        timestamp: Date.now(),
        data: this.executionState.context.data
      })
    }
  }

  /**
   * 创建完成结果
   */
  private createCompletionResult(): WorkerResult {
    if (!this.executionState) {
      throw new Error('Execution state not initialized')
    }

    const lastResult =
      this.executionState.context.history.length > 0
        ? this.executionState.context.history[this.executionState.context.history.length - 1]
        : null

    return {
      workerId: lastResult?.workerId || this.executionState.context.workflowId,
      workerName: lastResult?.workerName || 'Workflow',
      success: true,
      data: this.executionState.context.data,
      metadata: this.executionState.context.metadata,
      executedAt: Date.now()
    }
  }

  /**
   * 创建默认结果
   */
  private createDefaultResult(worker: Worker): WorkerResult {
    if (!this.executionState) {
      throw new Error('Execution state not initialized')
    }

    return {
      workerId: worker.id,
      workerName: worker.name,
      success: true,
      data: this.executionState.context.data,
      metadata: {},
      executedAt: Date.now()
    }
  }

  /**
   * 发射进度更新事件
   */
  private emitProgressUpdate(totalNodes: number): void {
    if (!this.executionState) return

    const progress = this.executionState.getProgress(totalNodes)

    this.eventEmitter.emit(WorkflowEvents.PROGRESS_UPDATED, {
      workflowId: this.executionState.context.workflowId,
      timestamp: Date.now(),
      progress
    })
  }
}
