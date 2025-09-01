import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Workflow, Work, Step, MemoryStorage } from 'workflow'

describe('AutoRestore', () => {
  beforeEach(() => {
    // 启用时间模拟
    vi.useFakeTimers()
  })

  afterEach(() => {
    // 恢复真实时间
    vi.useRealTimers()
  })
  it('应该能够从暂停状态自动恢复工作流', async () => {
    // 创建共享的 storage
    const sharedStorage = new MemoryStorage()

    // 第一步：创建工作流并暂停
    const workflow1 = new Workflow({
      id: 'test-workflow',
      name: '测试工作流',
      storage: sharedStorage
    })

    const work1 = new Work({
      id: 'test-work',
      name: '测试工作',
      storage: sharedStorage
    })

    const step1 = new Step({
      id: 'test-step',
      name: '测试步骤',
      storage: sharedStorage,
      run: async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        return { result: 'step completed', data: input * 2 }
      }
    })

    work1.add(step1)
    workflow1.add(work1)

    // 开始执行并暂停
    const runPromise = workflow1.run(42)
    // 使用 mock timer 快进时间
    await vi.advanceTimersByTimeAsync(50)
    await workflow1.pause()

    expect(workflow1.status).toBe('paused')
    expect(step1.status).toBe('paused')

    // 第二步：重新创建相同ID的工作流，使用相同的 storage
    const workflow2 = new Workflow({
      id: 'test-workflow',
      name: '测试工作流',
      storage: sharedStorage
    })

    const work2 = new Work({
      id: 'test-work',
      name: '测试工作',
      storage: sharedStorage
    })

    const step2 = new Step({
      id: 'test-step',
      name: '测试步骤',
      storage: sharedStorage,
      run: async (input) => {
        return { result: 'step completed', data: input * 2 }
      }
    })

    work2.add(step2)
    workflow2.add(work2)

    // 只需要恢复顶层的 workflow，会递归恢复子组件
    await workflow2.restore()

    // 验证状态恢复
    expect(workflow2.status).toBe('paused')
    expect(step2.status).toBe('paused')
    expect(workflow2.input).toBe(42)
  })

  it('应该能够从暂停状态继续执行', async () => {
    // 创建共享的 storage
    const sharedStorage = new MemoryStorage()

    // 创建并暂停工作流
    const workflow1 = new Workflow({
      id: 'resume-test-workflow',
      storage: sharedStorage
    })

    const work1 = new Work({
      id: 'resume-test-work',
      storage: sharedStorage
    })

    const step1 = new Step({
      id: 'resume-test-step',
      storage: sharedStorage,
      run: async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 100)) // 添加延迟
        return { result: 'completed', value: input + 10 }
      }
    })

    work1.add(step1)
    workflow1.add(work1)

    const runPromise = workflow1.run(100)
    // 使用 mock timer 快进时间
    await vi.advanceTimersByTimeAsync(50)
    await workflow1.pause()

    // 重新创建并恢复，使用相同的 storage
    const workflow2 = new Workflow({
      id: 'resume-test-workflow',
      storage: sharedStorage
    })

    const work2 = new Work({
      id: 'resume-test-work',
      storage: sharedStorage
    })

    const step2 = new Step({
      id: 'resume-test-step',
      storage: sharedStorage,
      run: async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 100)) // 添加延迟
        return { result: 'completed', value: input + 10 }
      }
    })

    work2.add(step2)
    workflow2.add(work2)

    // 只需要恢复顶层的 workflow，会递归恢复子组件
    await workflow2.restore()

    // 继续执行
    await workflow2.resume()

    // 使用 mock timer 快进少量时间确保状态更新
    await vi.advanceTimersByTimeAsync(10)

    expect(workflow2.status).toBe('running')
    expect(step2.status).toBe('running')
  })

  it('没有快照时应该正常初始化', async () => {
    const workflow = new Workflow({
      id: 'new-workflow'
    })

    // 使用 mock timer 快进时间
    await vi.advanceTimersByTimeAsync(100)

    expect(workflow.status).toBe('pending')
    expect(workflow.input).toBeUndefined()
    expect(workflow.output).toBeUndefined()
  })
})
