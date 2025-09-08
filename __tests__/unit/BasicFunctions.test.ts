import { describe, it, expect, beforeEach } from 'vitest'
import { Workflow, Work, Step, MemoryStorage } from 'workflow'

describe('基础功能测试', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
  })

  describe('正常执行流程', () => {
    it('应该能够正常执行完整的工作流', async () => {
      const workflow = new Workflow({
        id: 'test-workflow',
        storage
      }).preload()

      const work = new Work({
        id: 'test-work',
        storage
      }).preload()

      const step = new Step({
        id: 'test-step',
        storage,
        run: async (input: number, context) => {
          return input * 2
        }
      }).preload()

      work.add(step)
      workflow.add(work)

      const result = await workflow.run(10)

      expect(result.status).toBe('success')
      expect(result.input).toBe(10)
      expect(result.output).toHaveLength(1)
      expect(result.output[0].status).toBe('success')
      expect(result.output[0].output).toBe(20)
    })

    it('应该能够执行多个Step的Work', async () => {
      const workflow = new Workflow({
        id: 'multi-step-workflow',
        storage
      }).preload()

      const work = new Work({
        id: 'multi-step-work',
        storage
      }).preload()

      const step1 = new Step({
        id: 'step1',
        storage,
        run: async (input: number, context) => input + 1
      }).preload()

      const step2 = new Step({
        id: 'step2',
        storage,
        run: async (input: number, context) => input * 2
      }).preload()

      work.add(step1).add(step2)
      workflow.add(work)

      const result = await workflow.run(5)

      expect(result.status).toBe('success')
      expect(result.works[0].status).toBe('success')
      expect(result.works[0].output).toBe(12) // (5 + 1) * 2
    })

    it('应该能够执行多个Work的Workflow', async () => {
      const workflow = new Workflow({
        id: 'multi-work-workflow',
        storage
      }).preload()

      const work1 = new Work({
        id: 'work1',
        storage
      }).preload()

      const work2 = new Work({
        id: 'work2',
        storage
      }).preload()

      const step1 = new Step({
        id: 'step1',
        storage,
        run: async (input: number, context) => input + 10
      }).preload()

      const step2 = new Step({
        id: 'step2',
        storage,
        run: async (input: number, context) => input * 3
      }).preload()

      work1.add(step1)
      work2.add(step2)
      workflow.add(work1).add(work2)

      const result = await workflow.run(5)

      expect(result.status).toBe('success')
      expect(result.works).toHaveLength(2)
      expect(result.works[0].output).toBe(15) // 5 + 10
      expect(result.works[1].output).toBe(15) // 5 * 3
    })
  })

  describe('暂停和恢复功能', () => {
    it('应该能够暂停和恢复Step', async () => {
      let stepStarted = false

      const step = new Step({
        id: 'pause-step',
        storage,
        run: async (input: number, context) => {
          stepStarted = true
          // 模拟长时间运行
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      }).preload()

      // 开始执行
      const runPromise = step.run(10, {
        workflow: new Workflow({ id: 'dummy-workflow' }),
        work: new Work({ id: 'dummy' })
      })

      // 等待执行开始
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(stepStarted).toBe(true)

      // 暂停
      const pauseResult = await step.pause()
      expect(pauseResult.status).toBe('paused')

      // 恢复
      const resumeResult = await step.resume()
      expect(resumeResult.status).toBe('running')

      // 等待完成
      const result = await runPromise
      expect(result.status).toBe('success')
      expect(result.output).toBe(20)
    })

    it('应该能够暂停和恢复Work', async () => {
      const workflow = new Workflow({
        id: 'pause-workflow',
        storage
      }).preload()

      const work = new Work({
        id: 'pause-work',
        storage
      }).preload()

      const step = new Step({
        id: 'pause-work-step',
        storage,
        run: async (input: number, context) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      }).preload()

      work.add(step)
      workflow.add(work)

      const runPromise = workflow.run(10)

      await new Promise((resolve) => setTimeout(resolve, 50))

      const pauseResult = await workflow.pause()
      expect(pauseResult.status).toBe('paused')

      const resumeResult = await workflow.resume()
      expect(resumeResult.status).toBe('running')

      const result = await runPromise
      expect(result.status).toBe('success')
      expect(result.works[0].output).toBe(20)
    })
  })

  describe('错误处理', () => {
    it('Step执行失败时应该正确处理错误', async () => {
      const step = new Step({
        id: 'error-step',
        storage,
        run: async (input: number, context) => {
          throw new Error('Step execution failed')
        }
      }).preload()

      await expect(
        step.run(10, { workflow: new Workflow({ id: 'dummy-workflow' }), work: new Work({ id: 'dummy' }) })
      ).rejects.toThrow('Step execution failed')

      expect(step.status).toBe('failed')
    })

    it('Work中Step失败时应该传播错误', async () => {
      const workflow = new Workflow({
        id: 'error-workflow',
        storage
      }).preload()

      const work = new Work({
        id: 'error-work',
        storage
      }).preload()

      const step1 = new Step({
        id: 'success-step',
        storage,
        run: async (input: number, context) => input + 1
      }).preload()

      const step2 = new Step({
        id: 'error-step',
        storage,
        run: async (input: number, context) => {
          throw new Error('Step 2 failed')
        }
      }).preload()

      work.add(step1).add(step2)
      workflow.add(work)

      await expect(workflow.run(5)).rejects.toThrow('Step 2 failed')

      expect(workflow.status).toBe('failed')
    })

    it('Workflow中Work失败时应该传播错误', async () => {
      const workflow = new Workflow({
        id: 'error-workflow',
        storage
      }).preload()

      const work1 = new Work({
        id: 'success-work',
        storage
      }).preload()

      const work2 = new Work({
        id: 'error-work',
        storage
      }).preload()

      const successStep = new Step({
        id: 'success-step',
        storage,
        run: async (input: number, context) => input * 2
      }).preload()

      const errorStep = new Step({
        id: 'error-step',
        storage,
        run: async (input: number, context) => {
          throw new Error('Work 2 failed')
        }
      }).preload()

      work1.add(successStep)
      work2.add(errorStep)
      workflow.add(work1).add(work2)

      await expect(workflow.run(5)).rejects.toThrow()

      expect(workflow.status).toBe('failed')
    })
  })

  describe('状态管理', () => {
    it('应该正确维护执行状态', async () => {
      const step = new Step({
        id: 'status-step',
        storage,
        run: async (input: number, context) => {
          expect(step.status).toBe('running')
          return input * 2
        }
      }).preload()

      expect(step.status).toBe('pending')

      const result = await step.run(10, {
        workflow: new Workflow({ id: 'dummy-workflow' }),
        work: new Work({ id: 'dummy' })
      })

      expect(step.status).toBe('success')
      expect(result.status).toBe('success')
    })

    it('应该防止重复执行', async () => {
      const step = new Step({
        id: 'duplicate-step',
        storage,
        run: async (input: number, context) => input * 2
      }).preload()

      const context = { workflow: new Workflow({ id: 'dummy-workflow' }), work: new Work({ id: 'dummy' }) }
      const result1 = await step.run(10, context)
      const result2 = await step.run(10, context)

      expect(result1.status).toBe('success')
      expect(result2.status).toBe('success')
      expect(result1.output).toBe(result2.output)
    })

    it('应该正确处理暂停状态', async () => {
      const step = new Step({
        id: 'pause-status-step',
        storage,
        run: async (input: number, context) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      }).preload()

      const context = { workflow: new Workflow({ id: 'dummy-workflow' }), work: new Work({ id: 'dummy' }) }
      const runPromise = step.run(10, context)
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(step.status).toBe('running')

      await step.pause()
      expect(step.status).toBe('paused')

      await step.resume()
      expect(step.status).toBe('running')

      await runPromise
      expect(step.status).toBe('success')
    })
  })
})
