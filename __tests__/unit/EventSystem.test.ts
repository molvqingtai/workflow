import { describe, it, expect, beforeEach } from 'vitest'
import { Workflow, Work, Step } from 'workflow'

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

      // 监听所有事件
      step.on('step:start', () => events.push('step:start'))
      step.on('step:success', () => events.push('step:success'))

      const result = await step.run(10, {
        workflow: new Workflow({ id: 'dummy-workflow' }),
        work: new Work({ id: 'dummy' })
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

      const context = { workflow: new Workflow({ id: 'dummy-workflow' }), work: new Work({ id: 'dummy' }) }
      const runPromise = step.run(10, context)

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

      const context = { workflow: new Workflow({ id: 'dummy-workflow' }), work: new Work({ id: 'dummy' }) }
      await expect(step.run(10, context)).rejects.toThrow('Test error')

      expect(events).toContain('step:failed')
      expect(errors).toHaveLength(1)
    })
  })

  describe('Work级别事件', () => {
    it('应该正确触发Work生命周期事件', async () => {
      const events: string[] = []

      const workflow = new Workflow({
        id: 'event-workflow'
      })

      const work = new Work({
        id: 'event-work'
      })

      const step = new Step({
        id: 'work-step',
        run: async (input: number, context) => input * 2
      })

      work.add(step)
      workflow.add(work)

      // 监听Work事件
      work.on('work:start', () => events.push('work:start'))
      work.on('work:success', () => events.push('work:success'))

      // 监听Step事件（应该冒泡到Work）
      work.on('step:start', () => events.push('step:start'))
      work.on('step:success', () => events.push('step:success'))

      await workflow.run(10)

      expect(events).toContain('work:start')
      expect(events).toContain('work:success')
      expect(events).toContain('step:start')
      expect(events).toContain('step:success')
    })
  })

  describe('Workflow级别事件', () => {
    it('应该正确触发Workflow生命周期事件', async () => {
      const events: string[] = []

      const workflow = new Workflow({
        id: 'event-workflow'
      })

      const work = new Work({
        id: 'workflow-work'
      })

      const step = new Step({
        id: 'workflow-step',
        run: async (input: number, context) => input * 2
      })

      work.add(step)
      workflow.add(work)

      // 监听所有层级事件
      workflow.on('workflow:start', () => events.push('workflow:start'))
      workflow.on('workflow:success', () => events.push('workflow:success'))
      workflow.on('work:start', () => events.push('work:start'))
      workflow.on('work:success', () => events.push('work:success'))
      workflow.on('step:start', () => events.push('step:start'))
      workflow.on('step:success', () => events.push('step:success'))

      await workflow.run(10)

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

      await step.run(15, { workflow: new Workflow({ id: 'dummy-workflow' }), work: new Work({ id: 'dummy' }) })

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

      const context = { workflow: new Workflow({ id: 'dummy-workflow' }), work: new Work({ id: 'dummy' }) }
      await expect(step.run(10, context)).rejects.toThrow()

      expect(eventSnapshot).not.toBeNull()
      expect(eventSnapshot.status).toBe('failed')
      expect(eventSnapshot.error).toBe('Expected error')
    })
  })
})
