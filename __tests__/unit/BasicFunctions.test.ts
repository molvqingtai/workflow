import { describe, it, expect, beforeEach } from 'vitest'
import { Workflow, Work, Step } from 'workflow'

describe('基础功能测试', () => {
  describe('正常执行流程', () => {
    it('应该能够正常执行完整的工作流', async () => {
      const step = new Step({
        id: 'test-step',
        run: async (input: number, context) => {
          return input * 2
        }
      })

      const work = new Work({
        id: 'test-work',
        steps: [step]
      })

      const workflow = new Workflow({
        id: 'test-workflow',
        works: [work]
      })

      const result = await workflow.run(10)

      expect(result.status).toBe('success')
      expect(result.input).toBe(10)
      expect(result.output).toHaveLength(1)
      expect(result.output[0].status).toBe('success')
      expect(result.output[0].output).toBe(20)
    })

    it('应该能够执行多个Step的Work', async () => {
      const step1 = new Step({
        id: 'step1',
        run: async (input: number, context) => input + 1
      })

      const step2 = new Step({
        id: 'step2',
        run: async (input: number, context) => input * 2
      })

      const work = new Work({
        id: 'multi-step-work',
        steps: [step1, step2]
      })

      const workflow = new Workflow({
        id: 'multi-step-workflow',
        works: [work]
      })

      const result = await workflow.run(5)

      expect(result.status).toBe('success')
      expect(result.works[0].status).toBe('success')
      expect(result.works[0].output).toBe(12) // (5 + 1) * 2
    })

    it('应该能够执行多个Work的Workflow', async () => {
      const step1 = new Step({
        id: 'step1',
        run: async (input: number, context) => input + 10
      })

      const step2 = new Step({
        id: 'step2',
        run: async (input: number, context) => input * 3
      })

      const work1 = new Work({
        id: 'work1',
        steps: [step1]
      })

      const work2 = new Work({
        id: 'work2',
        steps: [step2]
      })

      const workflow = new Workflow({
        id: 'multi-work-workflow',
        works: [work1, work2]
      })

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
        run: async (input: number, context) => {
          stepStarted = true
          // 模拟长时间运行
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      })

      // 开始执行
      const runPromise = step.run(10, {
        workflow: new Workflow({ id: 'dummy-workflow', works: [] }),
        work: new Work({ id: 'dummy', steps: [] })
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
      const step = new Step({
        id: 'pause-work-step',
        run: async (input: number, context) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      })

      const work = new Work({
        id: 'pause-work',
        steps: [step]
      })

      const workflow = new Workflow({
        id: 'pause-workflow',
        works: [work]
      })

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
        run: async (input: number, context) => {
          throw new Error('Step execution failed')
        }
      })

      await expect(
        step.run(10, {
          workflow: new Workflow({ id: 'dummy-workflow', works: [] }),
          work: new Work({ id: 'dummy', steps: [] })
        })
      ).rejects.toThrow('Step execution failed')

      expect(step.status).toBe('failed')
    })

    it('Work中Step失败时应该传播错误', async () => {
      const step1 = new Step({
        id: 'success-step',
        run: async (input: number, context) => input + 1
      })

      const step2 = new Step({
        id: 'error-step',
        run: async (input: number, context) => {
          throw new Error('Step 2 failed')
        }
      })

      const work = new Work({
        id: 'error-work',
        steps: [step1, step2]
      })

      const workflow = new Workflow({
        id: 'error-workflow',
        works: [work]
      })

      await expect(workflow.run(5)).rejects.toThrow('Step 2 failed')

      expect(workflow.status).toBe('failed')
    })

    it('Workflow中Work失败时应该传播错误', async () => {
      const successStep = new Step({
        id: 'success-step',
        run: async (input: number, context) => input * 2
      })

      const errorStep = new Step({
        id: 'error-step',
        run: async (input: number, context) => {
          throw new Error('Work 2 failed')
        }
      })

      const work1 = new Work({
        id: 'success-work',
        steps: [successStep]
      })

      const work2 = new Work({
        id: 'error-work',
        steps: [errorStep]
      })

      const workflow = new Workflow({
        id: 'error-workflow',
        works: [work1, work2]
      })

      await expect(workflow.run(5)).rejects.toThrow()

      expect(workflow.status).toBe('failed')
    })
  })

  describe('状态管理', () => {
    it('应该正确维护执行状态', async () => {
      const step = new Step({
        id: 'status-step',
        run: async (input: number, context) => {
          expect(step.status).toBe('running')
          return input * 2
        }
      })

      expect(step.status).toBe('pending')

      const result = await step.run(10, {
        workflow: new Workflow({ id: 'dummy-workflow', works: [] }),
        work: new Work({ id: 'dummy', steps: [] })
      })

      expect(step.status).toBe('success')
      expect(result.status).toBe('success')
    })

    it('应该防止重复执行', async () => {
      const step = new Step({
        id: 'duplicate-step',
        run: async (input: number, context) => input * 2
      })

      const context = {
        workflow: new Workflow({ id: 'dummy-workflow', works: [] }),
        work: new Work({ id: 'dummy', steps: [] })
      }
      const result1 = await step.run(10, context)
      const result2 = await step.run(10, context)

      expect(result1.status).toBe('success')
      expect(result2.status).toBe('success')
      expect(result1.output).toBe(result2.output)
    })

    it('应该正确处理暂停状态', async () => {
      const step = new Step({
        id: 'pause-status-step',
        run: async (input: number, context) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      })

      const context = {
        workflow: new Workflow({ id: 'dummy-workflow', works: [] }),
        work: new Work({ id: 'dummy', steps: [] })
      }
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
