import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  Workflow,
  Worker,
  MemoryStorage,
  ExecutionStatus,
  WorkflowEvents,
  WorkerEvents,
  type ExecutionContext,
  type NextFunction
} from 'workflow'

// 测试用的基础 Worker
class TestWorker extends Worker {
  private processTime: number

  constructor(id: string, processTime = 100) {
    super({ id, name: `TestWorker-${id}` })
    this.processTime = processTime
  }

  async execute(context: ExecutionContext, next: NextFunction): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.processTime))

    const resultData = `Result from ${this.id}`
    await next({ success: true, data: resultData })
  }
}

// 逻辑失败的 Worker（调用 next 但标记失败）
class LogicalFailureWorker extends Worker {
  private processTime: number
  private errorMessage: string

  constructor(id: string, errorMessage = 'Logical failure', processTime = 100) {
    super({ id, name: `FailureWorker-${id}` })
    this.processTime = processTime
    this.errorMessage = errorMessage
  }

  async execute(context: ExecutionContext, next: NextFunction): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.processTime))

    // 逻辑失败，但仍然调用 next 继续执行
    await next({
      success: false,
      error: this.errorMessage
    })
  }
}

// 执行失败的 Worker（不调用 next）
class ExecutionFailureWorker extends Worker {
  private processTime: number

  constructor(id: string, processTime = 100) {
    super({ id, name: `ExecutionFailureWorker-${id}` })
    this.processTime = processTime
  }

  async execute(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.processTime))
    // 不调用 next，表示执行失败，应该终止工作流
    return
  }
}

// 抛出错误的 Worker
class ErrorWorker extends Worker {
  private errorMessage: string

  constructor(id: string, errorMessage = 'Worker execution error') {
    super({ id, name: `ErrorWorker-${id}` })
    this.errorMessage = errorMessage
  }

  async execute(): Promise<void> {
    throw new Error(this.errorMessage)
  }
}

describe('Workflow 测试', () => {
  let workflow: Workflow
  let storage: MemoryStorage

  beforeEach(() => {
    vi.useFakeTimers()
    storage = new MemoryStorage()
    workflow = new Workflow({
      id: 'test-workflow',
      name: 'Test Workflow',
      storage
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('基础功能', () => {
    it('应该能够添加和查询 Worker', () => {
      const worker1 = new TestWorker('worker1')
      const worker2 = new TestWorker('worker2')

      workflow.add(worker1).add(worker2)

      expect(workflow.size()).toBe(2)
      expect(workflow.has('worker1')).toBe(true)
      expect(workflow.has('worker2')).toBe(true)
      expect(workflow.query('worker1')).toBe(worker1)
    })

    it('应该能够成功执行单个 Worker', async () => {
      const worker = new TestWorker('worker1', 50)
      workflow.add(worker)

      const resultPromise = workflow.start('initial data')
      await vi.advanceTimersByTimeAsync(100)
      const result = await resultPromise

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('Result from worker1')
      }
      expect(result.workerId).toBe('worker1')
    })

    it('应该能够顺序执行多个 Worker', async () => {
      const worker1 = new TestWorker('worker1', 30)
      const worker2 = new TestWorker('worker2', 30)
      const worker3 = new TestWorker('worker3', 30)

      workflow.add(worker1).add(worker2).add(worker3)

      const resultPromise = workflow.start('initial data')
      await vi.advanceTimersByTimeAsync(120)
      const result = await resultPromise

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('Result from worker3') // 最后一个 Worker 的结果
      }

      // 验证历史记录
      const history = workflow.queryHistory()
      expect(history).toHaveLength(3)
      expect(history[0].workerId).toBe('worker1')
      expect(history[1].workerId).toBe('worker2')
      expect(history[2].workerId).toBe('worker3')
      expect(history.every((h) => h.success)).toBe(true)
    })
  })

  describe('失败处理机制', () => {
    it('应该区分逻辑失败和执行失败', async () => {
      const worker1 = new TestWorker('worker1', 30)
      const worker2 = new LogicalFailureWorker('worker2', 'Business logic failed', 30) // 逻辑失败
      const worker3 = new TestWorker('worker3', 30)
      const worker4 = new ExecutionFailureWorker('worker4', 30) // 执行失败，应该终止
      const worker5 = new TestWorker('worker5', 30) // 不应该被执行

      workflow.add(worker1).add(worker2).add(worker3).add(worker4).add(worker5)

      const resultPromise = workflow.start('initial data')
      await vi.advanceTimersByTimeAsync(150)
      const result = await resultPromise

      // 工作流应该在执行失败处终止，但整体标记为完成
      expect(result.success).toBe(true)

      // 历史记录应该包含4个worker：worker1(成功)、worker2(逻辑失败)、worker3(成功)、worker4(执行失败)
      const history = workflow.queryHistory()
      expect(history).toHaveLength(4)

      expect(history[0].workerId).toBe('worker1')
      expect(history[0].success).toBe(true)

      expect(history[1].workerId).toBe('worker2')
      expect(history[1].success).toBe(false)
      if (!history[1].success) {
        expect(history[1].error).toBe('Business logic failed')
      }

      expect(history[2].workerId).toBe('worker3')
      expect(history[2].success).toBe(true)

      expect(history[3].workerId).toBe('worker4')
      expect(history[3].success).toBe(false)
      if (!history[3].success) {
        expect(history[3].error).toContain('execution failed')
      }

      // worker5 不应该被执行
      expect(history.find((h) => h.workerId === 'worker5')).toBeUndefined()
    })

    it('应该在逻辑失败后继续执行', async () => {
      const worker1 = new TestWorker('worker1', 30)
      const worker2 = new LogicalFailureWorker('worker2', 'Expected failure', 30)
      const worker3 = new TestWorker('worker3', 30)

      workflow.add(worker1).add(worker2).add(worker3)

      const resultPromise = workflow.start('initial data')
      await vi.advanceTimersByTimeAsync(120)
      const result = await resultPromise

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('Result from worker3')
      }

      const history = workflow.queryHistory()
      expect(history).toHaveLength(3)
      expect(history[0].success).toBe(true)
      expect(history[1].success).toBe(false)
      expect(history[2].success).toBe(true)
    })

    it('应该在执行失败时终止工作流', async () => {
      const worker1 = new TestWorker('worker1', 30)
      const worker2 = new ExecutionFailureWorker('worker2', 30)
      const worker3 = new TestWorker('worker3', 30)

      workflow.add(worker1).add(worker2).add(worker3)

      const resultPromise = workflow.start('initial data')
      await vi.advanceTimersByTimeAsync(100)
      const result = await resultPromise

      expect(result.success).toBe(true) // handleCompletion 返回成功

      const history = workflow.queryHistory()
      expect(history).toHaveLength(2) // 只有 worker1 和 worker2
      expect(history[0].success).toBe(true)
      expect(history[1].success).toBe(false)

      // worker3 不应该被执行
      expect(history.find((h) => h.workerId === 'worker3')).toBeUndefined()
    })

    it('应该在 Worker 抛出错误时终止工作流', async () => {
      const worker1 = new TestWorker('worker1', 30)
      const worker2 = new ErrorWorker('worker2', 'Critical error')
      const worker3 = new TestWorker('worker3', 30)

      workflow.add(worker1).add(worker2).add(worker3)

      const resultPromise = workflow.start('initial data')

      // 执行错误应该抛出，而不是返回失败结果
      const expectRejects = expect(resultPromise).rejects.toThrow('Critical error')

      await vi.advanceTimersByTimeAsync(100)
      await expectRejects

      const history = workflow.queryHistory()
      expect(history).toHaveLength(1) // 抛出错误时不记录到历史，只有第一个成功的worker
      expect(history[0].success).toBe(true)
    })
  })

  describe('状态查询', () => {
    it('应该正确查询成功和失败的任务', async () => {
      const worker1 = new TestWorker('worker1', 30)
      const worker2 = new LogicalFailureWorker('worker2', 'Test failure', 30)
      const worker3 = new TestWorker('worker3', 30)

      workflow.add(worker1).add(worker2).add(worker3)

      const resultPromise = workflow.start('initial data')
      await vi.advanceTimersByTimeAsync(120)
      await resultPromise

      const successfulItems = workflow.queryByStatus(ExecutionStatus.SUCCESS)
      expect(successfulItems).toHaveLength(2)
      expect(successfulItems.map((item) => item.id)).toEqual(['worker1', 'worker3'])

      const failedItems = workflow.queryByStatus(ExecutionStatus.FAILED)
      expect(failedItems).toHaveLength(1)
      expect(failedItems[0].id).toBe('worker2')

      const completedItems = workflow.queryByStatus(ExecutionStatus.COMPLETED)
      expect(completedItems).toHaveLength(3)
    })
  })

  describe('事件系统', () => {
    it('应该触发正确的事件', async () => {
      const worker = new TestWorker('worker1', 30)
      workflow.add(worker)

      const startedSpy = vi.fn()
      const workerStartedSpy = vi.fn()
      const workerSuccessSpy = vi.fn()
      const completedSpy = vi.fn()
      const successSpy = vi.fn()

      workflow.on(WorkflowEvents.STARTED, startedSpy)
      workflow.on(WorkerEvents.WORKER_STARTED, workerStartedSpy)
      workflow.on(WorkerEvents.WORKER_SUCCESS, workerSuccessSpy)
      workflow.on(WorkflowEvents.COMPLETED, completedSpy)
      workflow.on(WorkflowEvents.SUCCESS, successSpy)

      const resultPromise = workflow.start('initial data')
      await vi.advanceTimersByTimeAsync(50)
      await resultPromise

      expect(startedSpy).toHaveBeenCalled()
      expect(workerStartedSpy).toHaveBeenCalled()
      expect(workerSuccessSpy).toHaveBeenCalled()
      expect(completedSpy).toHaveBeenCalled()
      expect(successSpy).toHaveBeenCalled()
    })

    it('应该触发失败事件', async () => {
      const worker1 = new TestWorker('worker1', 30)
      const worker2 = new LogicalFailureWorker('worker2', 'Test failure', 30)

      workflow.add(worker1).add(worker2)

      const workerFailedSpy = vi.fn()
      const completedSpy = vi.fn()
      const successSpy = vi.fn()

      workflow.on(WorkerEvents.WORKER_FAILED, workerFailedSpy)
      workflow.on(WorkflowEvents.COMPLETED, completedSpy)
      workflow.on(WorkflowEvents.SUCCESS, successSpy)

      const resultPromise = workflow.start('initial data')
      await vi.advanceTimersByTimeAsync(80)
      await resultPromise

      expect(workerFailedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: 'test-workflow',
          workerId: 'worker2',
          error: 'Test failure'
        })
      )

      // 有失败任务时不应该触发 SUCCESS 事件
      expect(completedSpy).toHaveBeenCalled()
      expect(successSpy).not.toHaveBeenCalled()
    })

    it('应该触发执行失败事件', async () => {
      const worker = new ExecutionFailureWorker('worker1', 30)
      workflow.add(worker)

      const workerFailedSpy = vi.fn()
      workflow.on(WorkerEvents.WORKER_FAILED, workerFailedSpy)

      const resultPromise = workflow.start('initial data')
      await vi.advanceTimersByTimeAsync(50)
      await resultPromise

      expect(workerFailedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: 'test-workflow',
          workerId: 'worker1',
          error: expect.stringContaining('execution failed')
        })
      )
    })
  })
})
