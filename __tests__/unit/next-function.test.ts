import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Workflow, Worker, MemoryStorage, ExecutionStatus, type ExecutionContext, type NextFunction } from 'workflow'

// 测试用的 Worker 类，支持不同的跳转方式
class NextTestWorker extends Worker {
  constructor(
    id: string,
    private jumpTo?: 'string' | 'object' | 'none'
  ) {
    super({ id, name: `NextTestWorker-${id}` })
  }

  async execute(context: ExecutionContext, next: NextFunction): Promise<void> {
    const resultData = `Result from ${this.id}`

    // 根据配置决定如何跳转
    switch (this.jumpTo) {
      case 'string':
        // 使用字符串 ID 跳转到 worker3
        await next({ success: true, data: resultData }, 'worker3')
        break

      case 'object':
        // 这里会在测试中动态设置对象引用
        await next({ success: true, data: resultData })
        break

      default:
        // 默认按顺序执行
        await next({ success: true, data: resultData })
        break
    }
  }

  // 用于动态设置跳转目标对象
  setJumpTarget(targetWorker: Worker) {
    this.execute = async (context: ExecutionContext, next: NextFunction): Promise<void> => {
      const resultData = `Result from ${this.id}`
      await next({ success: true, data: resultData }, targetWorker)
    }
  }
}

describe('NextFunction 增强功能测试', () => {
  let workflow: Workflow
  let storage: MemoryStorage

  beforeEach(() => {
    vi.useFakeTimers()
    storage = new MemoryStorage()
    workflow = new Workflow({
      id: 'next-function-test',
      name: 'NextFunction Test Workflow',
      storage
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('使用字符串 ID 跳转', () => {
    it('应该能够通过字符串 ID 跳转到指定 Worker', async () => {
      const worker1 = new NextTestWorker('worker1', 'string')
      const worker2 = new NextTestWorker('worker2')
      const worker3 = new NextTestWorker('worker3')

      workflow.add(worker1).add(worker2).add(worker3)

      const executionPromise = workflow.start('test data')
      await vi.advanceTimersByTimeAsync(100)
      const result = await executionPromise

      expect(result.success).toBe(true)

      // 验证执行顺序：worker1 -> worker3 (跳过了 worker2)
      const history = workflow.queryHistory()
      expect(history).toHaveLength(2)
      expect(history[0].workerId).toBe('worker1')
      expect(history[1].workerId).toBe('worker3')

      // worker2 应该未执行
      const completedItems = workflow.queryByStatus(ExecutionStatus.COMPLETED)
      const completedIds = completedItems.map((item) => item.id)
      expect(completedIds).toContain('worker1')
      expect(completedIds).toContain('worker3')
      expect(completedIds).not.toContain('worker2')
    })
  })

  describe('使用对象引用跳转', () => {
    it('应该能够通过 Worker 对象跳转', async () => {
      const worker1 = new NextTestWorker('worker1')
      const worker2 = new NextTestWorker('worker2')
      const worker3 = new NextTestWorker('worker3')

      // 设置 worker1 跳转到 worker3 对象
      worker1.setJumpTarget(worker3)

      workflow.add(worker1).add(worker2).add(worker3)

      const executionPromise = workflow.start('test data')
      await vi.advanceTimersByTimeAsync(100)
      const result = await executionPromise

      expect(result.success).toBe(true)

      // 验证执行顺序：worker1 -> worker3 (跳过了 worker2)
      const history = workflow.queryHistory()
      expect(history).toHaveLength(2)
      expect(history[0].workerId).toBe('worker1')
      expect(history[1].workerId).toBe('worker3')
    })

    it('应该能够通过 Workflow 对象跳转', async () => {
      const worker1 = new NextTestWorker('worker1')
      const subWorkflow = new Workflow({
        id: 'sub-workflow',
        name: 'Sub Workflow',
        storage
      })
      const subWorker = new NextTestWorker('sub-worker')
      subWorkflow.add(subWorker)

      // 设置 worker1 跳转到子工作流对象
      worker1.execute = async (context: ExecutionContext, next: NextFunction): Promise<void> => {
        const resultData = `Result from worker1`
        await next({ success: true, data: resultData }, subWorkflow)
      }

      workflow.add(worker1).add(subWorkflow)

      const executionPromise = workflow.start('test data')
      await vi.advanceTimersByTimeAsync(100)
      const result = await executionPromise

      expect(result.success).toBe(true)

      // 验证历史记录
      const history = workflow.queryHistory()
      expect(history).toHaveLength(2)
      expect(history[0].workerId).toBe('worker1')
      expect(history[1].workerId).toBe('sub-workflow')
    })
  })

  describe('错误处理', () => {
    it('应该在目标对象不在工作流中时抛出执行错误', async () => {
      const worker1 = new NextTestWorker('worker1')
      const outsideWorker = new NextTestWorker('outside-worker')

      // 设置 worker1 跳转到不在工作流中的 worker
      worker1.setJumpTarget(outsideWorker)

      workflow.add(worker1)

      const executionPromise = workflow.start('test data')

      // 执行错误应该抛出异常
      const expectRejects = expect(executionPromise).rejects.toThrow(
        'Target worker "outside-worker" is not part of this workflow'
      )

      await vi.advanceTimersByTimeAsync(100)
      await expectRejects
    })

    it('应该在字符串 ID 不存在时抛出执行错误', async () => {
      const worker1 = new NextTestWorker('worker1', 'string')

      workflow.add(worker1)

      const executionPromise = workflow.start('test data')

      // 执行错误应该抛出异常
      const expectRejects = expect(executionPromise).rejects.toThrow('Node worker3 not found in pool')

      await vi.advanceTimersByTimeAsync(100)
      await expectRejects
    })
  })

  describe('向后兼容性', () => {
    it('不传目标参数时应该按默认顺序执行', async () => {
      const worker1 = new NextTestWorker('worker1')
      const worker2 = new NextTestWorker('worker2')
      const worker3 = new NextTestWorker('worker3')

      workflow.add(worker1).add(worker2).add(worker3)

      const executionPromise = workflow.start('test data')
      await vi.advanceTimersByTimeAsync(100)
      const result = await executionPromise

      expect(result.success).toBe(true)

      // 验证按顺序执行：worker1 -> worker2 -> worker3
      const history = workflow.queryHistory()
      expect(history).toHaveLength(3)
      expect(history[0].workerId).toBe('worker1')
      expect(history[1].workerId).toBe('worker2')
      expect(history[2].workerId).toBe('worker3')
    })
  })
})
