import { describe, it, expect, beforeEach } from 'vitest'
import { Workflow, Work, Step, RUN_STATUS } from '@whatfa/workflow'

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

      const result = await workflow.start(10)

      expect(result.status).toBe('success')
      expect(result.input).toBe(10)
      expect(result.output).toHaveLength(1)
      expect(result.output?.[0].status).toBe('success')
      expect(result.output?.[0].output).toBe(20)
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

      const result = await workflow.start(5)

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

      const result = await workflow.start(5)

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
          // Simulate a long-running execution
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      })

      // Start execution
      const runPromise = step.start(10, {
        workflow: new Workflow({ id: 'dummy-workflow', works: [] }),
        work: new Work({ id: 'dummy', steps: [] })
      })

      // Wait for execution to begin
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(stepStarted).toBe(true)

      // Pause
      const pauseResult = await step.pause()
      expect(pauseResult.status).toBe('paused')

      // Resume
      const resumeResult = await step.resume()
      expect(resumeResult.status).toBe('running')

      // Wait for completion
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

      const runPromise = workflow.start(10)

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
        step.start(10, {
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

      await expect(workflow.start(5)).rejects.toThrow('Step 2 failed')

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

      await expect(workflow.start(5)).rejects.toThrow()

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

      const result = await step.start(10, {
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
      const result1 = await step.start(10, context)
      const result2 = await step.start(10, context)

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
      const runPromise = step.start(10, context)
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

  describe('停止功能', () => {
    it('应该能够停止正在运行的Step', async () => {
      let stepStarted = false

      const step = new Step({
        id: 'stop-step',
        run: async (input: number, context) => {
          stepStarted = true
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      })

      const context = {
        workflow: new Workflow({ id: 'dummy-workflow', works: [] }),
        work: new Work({ id: 'dummy', steps: [] })
      }

      // Start execution
      const runPromise = step.start(10, context)
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(stepStarted).toBe(true)
      expect(step.status).toBe('running')

      // Stop the step while it is running
      const stopResult = await step.stop()
      expect(stopResult.status).toBe(RUN_STATUS.STOPPED)
      expect(step.status).toBe(RUN_STATUS.STOPPED)

      // Do not await the stopped execution because it would hang forever
    })

    it('应该能够停止正在运行的Work', async () => {
      let step1Started = false

      const step1 = new Step({
        id: 'stop-work-step1',
        run: async (input: number, context) => {
          step1Started = true
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input + 1
        }
      })

      const step2 = new Step({
        id: 'stop-work-step2',
        run: async (input: number, context) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      })

      const work = new Work({
        id: 'stop-work',
        steps: [step1, step2]
      })

      const workflow = new Workflow({
        id: 'stop-workflow',
        works: [work]
      })

      // Start execution
      const runPromise = workflow.start(10)
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(step1Started).toBe(true)

      // Stop the work while it is running
      const stopResult = await work.stop()
      expect(stopResult.status).toBe(RUN_STATUS.STOPPED)

      // Verify whether each step is stopped
      expect(step1.status).toBe(RUN_STATUS.STOPPED)
      expect(step2.status).toBe(RUN_STATUS.PENDING) // step2 hasn't started yet, so it cannot be stopped

      // Do not await the stopped execution because it would hang forever
    })

    it('应该能够停止正在运行的Workflow', async () => {
      const step1 = new Step({
        id: 'stop-workflow-step1',
        run: async (input: number, context) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input + 10
        }
      })

      const step2 = new Step({
        id: 'stop-workflow-step2',
        run: async (input: number, context) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 3
        }
      })

      const work1 = new Work({
        id: 'stop-workflow-work1',
        steps: [step1]
      })

      const work2 = new Work({
        id: 'stop-workflow-work2',
        steps: [step2]
      })

      const workflow = new Workflow({
        id: 'stop-workflow',
        works: [work1, work2]
      })

      // Start execution
      const runPromise = workflow.start(5)
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Stop the workflow while it is running
      const stopResult = await workflow.stop()
      expect(stopResult.status).toBe(RUN_STATUS.STOPPED)

      // Verify all works and steps are stopped
      expect(work1.status).toBe(RUN_STATUS.STOPPED)
      expect(work2.status).toBe(RUN_STATUS.STOPPED)
      expect(step1.status).toBe(RUN_STATUS.STOPPED)
      expect(step2.status).toBe(RUN_STATUS.STOPPED)

      // Do not await the stopped execution because it would hang forever
    })

    it('不能停止PENDING状态的Step', async () => {
      const step = new Step({
        id: 'pending-step',
        run: async (input: number, context) => input * 2
      })

      expect(step.status).toBe(RUN_STATUS.PENDING)

      // Attempt to stop a PENDING step (should no-op)
      const stopResult = await step.stop()
      expect(stopResult.status).toBe(RUN_STATUS.PENDING)
      expect(step.status).toBe(RUN_STATUS.PENDING)
    })

    it('应该能够停止暂停中的Step', async () => {
      const step = new Step({
        id: 'paused-step',
        run: async (input: number, context) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      })

      const context = {
        workflow: new Workflow({ id: 'dummy-workflow', works: [] }),
        work: new Work({ id: 'dummy', steps: [] })
      }

      // Start execution
      const runPromise = step.start(10, context)
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Pause execution
      await step.pause()
      expect(step.status).toBe('paused')

      // Stop the step while it is paused
      const stopResult = await step.stop()
      expect(stopResult.status).toBe(RUN_STATUS.STOPPED)
      expect(step.status).toBe(RUN_STATUS.STOPPED)

      // Do not await the stopped execution because it would hang forever
    })

    it('不能停止已完成的Step', async () => {
      const step = new Step({
        id: 'completed-step',
        run: async (input: number, context) => input * 2
      })

      const context = {
        workflow: new Workflow({ id: 'dummy-workflow', works: [] }),
        work: new Work({ id: 'dummy', steps: [] })
      }

      // Complete the execution first
      await step.start(10, context)
      expect(step.status).toBe('success')
      expect(step.output).toBe(20)

      // Attempt to stop a completed step (should no-op)
      const stopResult = await step.stop()
      expect(stopResult.status).toBe('success')
      expect(step.status).toBe('success')
    })

    it('不能停止失败的Step', async () => {
      const step = new Step({
        id: 'failed-step',
        run: async (input: number, context) => {
          throw new Error('Test error')
        }
      })

      const context = {
        workflow: new Workflow({ id: 'dummy-workflow', works: [] }),
        work: new Work({ id: 'dummy', steps: [] })
      }

      // Force the execution to fail first
      try {
        await step.start(10, context)
      } catch (error) {
        // Ignore the error
      }
      expect(step.status).toBe('failed')

      // Attempt to stop the failed step (should no-op)
      const stopResult = await step.stop()
      expect(stopResult.status).toBe('failed')
      expect(step.status).toBe('failed')
    })
  })
})
