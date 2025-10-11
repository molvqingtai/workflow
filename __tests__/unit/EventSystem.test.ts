import { describe, it, expect, beforeEach } from 'vitest'
import { Workflow, Work, Step, RUN_STATUS } from '@whatfa/workflow'

describe('事件系统测试', () => {
  describe('Step级别事件', () => {
    it('应该正确触发Step生命周期事件', async () => {
      const events: string[] = []

      const step = new Step({
        id: 'event-step',
        run: async (input: number, context) => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return input * 2
        }
      })

      // Listen to every step event
      step.on('step:start', () => events.push('step:start'))
      step.on('step:success', () => events.push('step:success'))

      const result = await step.start(10, {
        workflow: new Workflow({ id: 'dummy-workflow', works: [] }),
        work: new Work({ id: 'dummy', steps: [] })
      })

      expect(events).toContain('step:start')
      expect(events).toContain('step:success')
      expect(result.status).toBe('success')
    })

    it('应该正确触发Step暂停恢复事件', async () => {
      const events: string[] = []

      const step = new Step({
        id: 'pause-event-step',
        run: async (input: number, context) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      })

      step.on('step:pause', () => events.push('step:pause'))
      step.on('step:resume', () => events.push('step:resume'))

      const context = {
        workflow: new Workflow({ id: 'dummy-workflow', works: [] }),
        work: new Work({ id: 'dummy', steps: [] })
      }
      const runPromise = step.start(10, context)

      await new Promise((resolve) => setTimeout(resolve, 50))
      await step.pause()
      await step.resume()
      await runPromise

      expect(events).toContain('step:pause')
      expect(events).toContain('step:resume')
    })

    it('应该正确触发Step失败事件', async () => {
      const events: string[] = []
      const errors: any[] = []

      const step = new Step({
        id: 'error-event-step',
        run: async (input: number, context) => {
          throw new Error('Test error')
        }
      })

      step.on('step:failed', (snapshot) => {
        events.push('step:failed')
        errors.push(snapshot)
      })

      const context = {
        workflow: new Workflow({ id: 'dummy-workflow', works: [] }),
        work: new Work({ id: 'dummy', steps: [] })
      }
      await expect(step.start(10, context)).rejects.toThrow('Test error')

      expect(events).toContain('step:failed')
      expect(errors).toHaveLength(1)
    })
  })

  describe('Work级别事件', () => {
    it('应该正确触发Work生命周期事件', async () => {
      const events: string[] = []

      const step = new Step({
        id: 'work-step',
        run: async (input: number, context) => input * 2
      })

      const work = new Work({
        id: 'event-work',
        steps: [step]
      })

      const workflow = new Workflow({
        id: 'event-workflow',
        works: [work]
      })

      // Listen for work events
      work.on('work:start', () => events.push('work:start'))
      work.on('work:success', () => events.push('work:success'))

      // Listen for step events (they should bubble to the work)
      work.on('step:start', () => events.push('step:start'))
      work.on('step:success', () => events.push('step:success'))

      await workflow.start(10)

      expect(events).toContain('work:start')
      expect(events).toContain('work:success')
      expect(events).toContain('step:start')
      expect(events).toContain('step:success')
    })
  })

  describe('Workflow级别事件', () => {
    it('应该正确触发Workflow生命周期事件', async () => {
      const events: string[] = []

      const step = new Step({
        id: 'workflow-step',
        run: async (input: number, context) => input * 2
      })

      const work = new Work({
        id: 'workflow-work',
        steps: [step]
      })

      const workflow = new Workflow({
        id: 'event-workflow',
        works: [work]
      })

      // Listen for events across every level
      workflow.on('workflow:start', () => events.push('workflow:start'))
      workflow.on('workflow:success', () => events.push('workflow:success'))
      workflow.on('work:start', () => events.push('work:start'))
      workflow.on('work:success', () => events.push('work:success'))
      workflow.on('step:start', () => events.push('step:start'))
      workflow.on('step:success', () => events.push('step:success'))

      await workflow.start(10)

      expect(events).toContain('workflow:start')
      expect(events).toContain('workflow:success')
      expect(events).toContain('work:start')
      expect(events).toContain('work:success')
      expect(events).toContain('step:start')
      expect(events).toContain('step:success')
    })
  })

  describe('事件数据完整性', () => {
    it('事件应该携带正确的快照数据', async () => {
      let eventSnapshot: any = null

      const step = new Step({
        id: 'snapshot-step',
        run: async (input: number, context) => input * 2
      })

      step.on('step:success', (snapshot) => {
        eventSnapshot = snapshot
      })

      await step.start(15, {
        workflow: new Workflow({ id: 'dummy-workflow', works: [] }),
        work: new Work({ id: 'dummy', steps: [] })
      })

      expect(eventSnapshot).not.toBeNull()
      expect(eventSnapshot.id).toBe('snapshot-step')
      expect(eventSnapshot.status).toBe('success')
      expect(eventSnapshot.input).toBe(15)
      expect(eventSnapshot.output).toBe(30)
    })

    it('错误事件应该携带错误信息', async () => {
      let eventSnapshot: any = null

      const step = new Step({
        id: 'error-snapshot-step',
        run: async (input: number, context) => {
          throw new Error('Expected error')
        }
      })

      step.on('step:failed', (snapshot) => {
        eventSnapshot = snapshot
      })

      const context = {
        workflow: new Workflow({ id: 'dummy-workflow', works: [] }),
        work: new Work({ id: 'dummy', steps: [] })
      }
      await expect(step.start(10, context)).rejects.toThrow()

      expect(eventSnapshot).not.toBeNull()
      expect(eventSnapshot.status).toBe('failed')
      expect(eventSnapshot.error).toBe('Expected error')
    })

    describe('Stop事件测试', () => {
      it('应该正确触发Step stop事件', async () => {
        const events: string[] = []

        const step = new Step({
          id: 'stop-event-step',
          run: async (input: number, context) => {
            await new Promise((resolve) => setTimeout(resolve, 100))
            return input * 2
          }
        })

        step.on('step:stop', () => events.push('step:stop'))
        step.on('step:change', () => events.push('step:change'))

        const context = {
          workflow: new Workflow({ id: 'dummy-workflow', works: [] }),
          work: new Work({ id: 'dummy', steps: [] })
        }

        // Start execution and then stop it
        const runPromise = step.start(10, context)
        await new Promise((resolve) => setTimeout(resolve, 50))
        await step.stop()

        expect(events).toContain('step:stop')
        expect(events).toContain('step:change')
        expect(step.status).toBe(RUN_STATUS.STOPPED)

        // Do not await the stopped execution because it would hang forever
      })

      it('应该正确触发Work stop事件', async () => {
        const events: string[] = []

        const step = new Step({
          id: 'work-stop-step',
          run: async (input: number, context) => {
            await new Promise((resolve) => setTimeout(resolve, 100))
            return input * 2
          }
        })

        const work = new Work({
          id: 'stop-event-work',
          steps: [step]
        })

        const workflow = new Workflow({
          id: 'stop-event-workflow',
          works: [work]
        })

        work.on('work:stop', () => events.push('work:stop'))
        work.on('work:change', () => events.push('work:change'))
        work.on('step:stop', () => events.push('step:stop'))

        // Start execution and then stop the work
        const runPromise = workflow.start(10)
        await new Promise((resolve) => setTimeout(resolve, 50))
        await work.stop()

        expect(events).toContain('work:stop')
        expect(events).toContain('work:change')
        // The step:stop event may not fire because the step must be RUNNING or PAUSED to stop it
        expect(work.status).toBe(RUN_STATUS.STOPPED)

        // Do not await the stopped execution because it would hang forever
      })

      it('应该正确触发Workflow stop事件', async () => {
        const events: string[] = []

        const step = new Step({
          id: 'workflow-stop-step',
          run: async (input: number, context) => {
            await new Promise((resolve) => setTimeout(resolve, 100))
            return input * 2
          }
        })

        const work = new Work({
          id: 'workflow-stop-work',
          steps: [step]
        })

        const workflow = new Workflow({
          id: 'stop-event-workflow',
          works: [work]
        })

        workflow.on('workflow:stop', () => events.push('workflow:stop'))
        workflow.on('workflow:change', () => events.push('workflow:change'))
        workflow.on('work:stop', () => events.push('work:stop'))
        workflow.on('step:stop', () => events.push('step:stop'))

        // Start execution and then stop the workflow
        const runPromise = workflow.start(10)
        await new Promise((resolve) => setTimeout(resolve, 50))
        await workflow.stop()

        expect(events).toContain('workflow:stop')
        expect(events).toContain('workflow:change')
        expect(events).toContain('work:stop')
        // The step:stop event may not fire because the step must be RUNNING or PAUSED to stop it
        expect(workflow.status).toBe(RUN_STATUS.STOPPED)

        // Do not await the stopped execution because it would hang forever
      })

      it('stop事件应该携带正确的快照数据', async () => {
        let eventSnapshot: any = null

        const step = new Step({
          id: 'stop-snapshot-step',
          run: async (input: number, context) => {
            await new Promise((resolve) => setTimeout(resolve, 100))
            return input * 2
          }
        })

        step.on('step:stop', (snapshot) => {
          eventSnapshot = snapshot
        })

        const context = {
          workflow: new Workflow({ id: 'dummy-workflow', works: [] }),
          work: new Work({ id: 'dummy', steps: [] })
        }

        // Start execution and then stop it
        const runPromise = step.start(15, context)
        await new Promise((resolve) => setTimeout(resolve, 50))
        await step.stop()

        expect(eventSnapshot).not.toBeNull()
        expect(eventSnapshot.id).toBe('stop-snapshot-step')
        expect(eventSnapshot.status).toBe(RUN_STATUS.STOPPED)
        expect(eventSnapshot.input).toBe(15)

        // Do not await the stopped execution because it would hang forever
      })

      it('停止已完成的组件不应该触发stop事件', async () => {
        const events: string[] = []

        const step = new Step({
          id: 'completed-stop-step',
          run: async (input: number, context) => input * 2
        })

        step.on('step:stop', () => events.push('step:stop'))
        step.on('step:change', () => events.push('step:change'))

        const context = {
          workflow: new Workflow({ id: 'dummy-workflow', works: [] }),
          work: new Work({ id: 'dummy', steps: [] })
        }

        // Complete execution first
        await step.start(10, context)
        expect(step.status).toBe('success')

        // Clear captured events
        events.length = 0

        // Attempt to stop the completed step (should no-op)
        await step.stop()

        expect(events).not.toContain('step:stop')
        expect(events).not.toContain('step:change')
        expect(step.status).toBe('success')
      })

      it('停止失败的组件不应该触发stop事件', async () => {
        const events: string[] = []

        const step = new Step({
          id: 'failed-stop-step',
          run: async (input: number, context) => {
            throw new Error('Test error')
          }
        })

        step.on('step:stop', () => events.push('step:stop'))
        step.on('step:change', () => events.push('step:change'))

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

        // Clear captured events
        events.length = 0

        // Attempt to stop the failed step (should no-op)
        await step.stop()

        expect(events).not.toContain('step:stop')
        expect(events).not.toContain('step:change')
        expect(step.status).toBe('failed')
      })
    })
  })
})
