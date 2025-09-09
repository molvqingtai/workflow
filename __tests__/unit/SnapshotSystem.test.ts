import { describe, it, expect } from 'vitest'
import { Workflow, Work, Step } from 'workflow'

describe('快照系统测试', () => {
  describe('toSnapshot 功能', () => {
    it('应该能够生成Step的完整快照', async () => {
      const step = new Step({
        id: 'test-step',
        name: 'Test Step',
        description: 'A test step',
        run: async (input: number, context) => input * 2
      })

      // 执行step以产生状态
      const context = { 
        workflow: new Workflow({ id: 'test-workflow' }), 
        work: new Work({ id: 'test-work' }) 
      }
      await step.run(10, context)

      // 生成快照
      const snapshot = step.toSnapshot()

      expect(snapshot).toEqual({
        id: 'test-step',
        name: 'Test Step',
        description: 'A test step',
        type: 'step',
        status: 'success',
        input: 10,
        output: 20,
        error: undefined
      })
    })

    it('应该能够生成Work的完整快照', async () => {
      const work = new Work({
        id: 'test-work',
        name: 'Test Work'
      })

      const step1 = new Step({
        id: 'step1',
        run: async (input: number, context) => input + 5
      })

      const step2 = new Step({
        id: 'step2',
        run: async (input: number, context) => input * 2
      })

      work.add(step1).add(step2)

      // 执行work
      const context = { workflow: new Workflow({ id: 'test-workflow' }) }
      await work.run(10, context)

      // 生成快照
      const snapshot = work.toSnapshot()

      expect(snapshot.id).toBe('test-work')
      expect(snapshot.name).toBe('Test Work')
      expect(snapshot.type).toBe('work')
      expect(snapshot.status).toBe('success')
      expect(snapshot.input).toBe(10)
      expect(snapshot.output).toBe(30) // (10 + 5) * 2
      expect(snapshot.steps).toHaveLength(2)
      expect(snapshot.steps[0].id).toBe('step1')
      expect(snapshot.steps[0].output).toBe(15)
      expect(snapshot.steps[1].id).toBe('step2')
      expect(snapshot.steps[1].output).toBe(30)
    })

    it('应该能够生成Workflow的完整快照', async () => {
      const workflow = new Workflow({
        id: 'test-workflow',
        name: 'Test Workflow',
        description: 'A test workflow'
      })

      const work1 = new Work({ id: 'work1' })
      const work2 = new Work({ id: 'work2' })

      const step1 = new Step({
        id: 'step1',
        run: async (input: number, context) => input + 100
      })

      const step2 = new Step({
        id: 'step2',
        run: async (input: number, context) => input * 3
      })

      work1.add(step1)
      work2.add(step2)
      workflow.add(work1).add(work2)

      // 执行workflow
      await workflow.run(5)

      // 生成快照
      const snapshot = workflow.toSnapshot()

      expect(snapshot.id).toBe('test-workflow')
      expect(snapshot.name).toBe('Test Workflow')
      expect(snapshot.description).toBe('A test workflow')
      expect(snapshot.type).toBe('workflow')
      expect(snapshot.status).toBe('success')
      expect(snapshot.input).toBe(5)
      expect(snapshot.output).toHaveLength(2)
      expect(snapshot.works).toHaveLength(2)
      
      // 验证嵌套的work快照
      expect(snapshot.works[0].id).toBe('work1')
      expect(snapshot.works[0].output).toBe(105)
      expect(snapshot.works[1].id).toBe('work2')
      expect(snapshot.works[1].output).toBe(15)
    })

    it('应该能够生成失败状态的快照', async () => {
      const step = new Step({
        id: 'error-step',
        run: async (input: number, context) => {
          throw new Error('Test error')
        }
      })

      const context = { 
        workflow: new Workflow({ id: 'test-workflow' }), 
        work: new Work({ id: 'test-work' }) 
      }

      // 执行失败的step
      try {
        await step.run(10, context)
      } catch (error) {
        // 期望抛出错误
      }

      // 生成快照
      const snapshot = step.toSnapshot()

      expect(snapshot.id).toBe('error-step')
      expect(snapshot.status).toBe('failed')
      expect(snapshot.input).toBe(10)
      expect(snapshot.output).toBeUndefined()
      expect(snapshot.error).toBe('Test error')
    })
  })

  describe('fromSnapshot 功能', () => {
    it('应该能够从快照恢复Step状态', () => {
      const step = new Step({
        id: 'restore-step',
        run: async (input: number, context) => input * 2
      })

      // 创建模拟快照
      const mockSnapshot = {
        id: 'restore-step',
        name: 'Restored Step',
        description: 'A restored step',
        type: 'step' as const,
        status: 'success' as const,
        input: 20,
        output: 40,
        error: undefined
      }

      // 从快照恢复
      const result = step.fromSnapshot(mockSnapshot)

      // 验证恢复结果
      expect(result).toBe(step) // 应该返回自身
      expect(step.id).toBe('restore-step')
      expect(step.name).toBe('Restored Step')
      expect(step.description).toBe('A restored step')
      expect(step.status).toBe('success')
      expect(step.input).toBe(20)
      expect(step.output).toBe(40)
      expect(step.error).toBeUndefined()
    })

    it('应该能够从快照恢复Work状态', () => {
      const work = new Work({
        id: 'restore-work'
      })

      // 创建模拟快照
      const mockSnapshot = {
        id: 'restore-work',
        name: 'Restored Work',
        type: 'work' as const,
        status: 'success' as const,
        input: 15,
        output: 45,
        error: undefined,
        steps: [
          {
            id: 'step1',
            type: 'step' as const,
            status: 'success' as const,
            input: 15,
            output: 30
          },
          {
            id: 'step2',
            type: 'step' as const,
            status: 'success' as const,
            input: 30,
            output: 45
          }
        ]
      }

      // 从快照恢复
      work.fromSnapshot(mockSnapshot)

      // 验证恢复结果
      expect(work.id).toBe('restore-work')
      expect(work.name).toBe('Restored Work')
      expect(work.status).toBe('success')
      expect(work.input).toBe(15)
      expect(work.output).toBe(45)
    })

    it('应该能够从快照恢复Workflow状态', () => {
      const workflow = new Workflow({
        id: 'restore-workflow'
      })

      // 创建模拟快照
      const mockSnapshot = {
        id: 'restore-workflow',
        name: 'Restored Workflow',
        description: 'A restored workflow',
        type: 'workflow' as const,
        status: 'success' as const,
        input: 25,
        output: [
          { id: 'work1', status: 'success' as const, output: 125 },
          { id: 'work2', status: 'success' as const, output: 75 }
        ],
        error: undefined,
        works: [
          {
            id: 'work1',
            type: 'work' as const,
            status: 'success' as const,
            input: 25,
            output: 125,
            steps: []
          },
          {
            id: 'work2',
            type: 'work' as const,
            status: 'success' as const,
            input: 25,
            output: 75,
            steps: []
          }
        ]
      }

      // 从快照恢复
      workflow.fromSnapshot(mockSnapshot)

      // 验证恢复结果
      expect(workflow.id).toBe('restore-workflow')
      expect(workflow.name).toBe('Restored Workflow')
      expect(workflow.description).toBe('A restored workflow')
      expect(workflow.status).toBe('success')
      expect(workflow.input).toBe(25)
      expect(workflow.output).toHaveLength(2)
    })

    it('应该能够从快照恢复失败状态', () => {
      const step = new Step({
        id: 'failed-step',
        run: async (input: number, context) => input * 2
      })

      // 创建失败状态的快照
      const failedSnapshot = {
        id: 'failed-step',
        type: 'step' as const,
        status: 'failed' as const,
        input: 10,
        output: undefined,
        error: 'Execution failed'
      }

      // 从快照恢复
      step.fromSnapshot(failedSnapshot)

      // 验证失败状态恢复
      expect(step.status).toBe('failed')
      expect(step.input).toBe(10)
      expect(step.output).toBeUndefined()
      expect(step.error).toBe('Execution failed')
    })
  })

  describe('构造函数快照参数', () => {
    it('应该能够在构造时直接传入Step快照', () => {
      const snapshot = {
        id: 'constructor-step',
        name: 'Constructor Step',
        type: 'step' as const,
        status: 'success' as const,
        input: 50,
        output: 100,
        error: undefined
      }

      const step = new Step({
        id: 'constructor-step',
        snapshot,
        run: async (input: number, context) => input * 2
      })

      // 验证构造时自动恢复
      expect(step.id).toBe('constructor-step')
      expect(step.name).toBe('Constructor Step')
      expect(step.status).toBe('success')
      expect(step.input).toBe(50)
      expect(step.output).toBe(100)
    })

    it('应该能够在构造时直接传入Work快照', () => {
      const snapshot = {
        id: 'constructor-work',
        name: 'Constructor Work',
        type: 'work' as const,
        status: 'success' as const,
        input: 30,
        output: 90,
        steps: []
      }

      const work = new Work({
        id: 'constructor-work',
        snapshot
      })

      // 验证构造时自动恢复
      expect(work.id).toBe('constructor-work')
      expect(work.name).toBe('Constructor Work')
      expect(work.status).toBe('success')
      expect(work.input).toBe(30)
      expect(work.output).toBe(90)
    })

    it('应该能够在构造时直接传入Workflow快照', () => {
      const snapshot = {
        id: 'constructor-workflow',
        name: 'Constructor Workflow',
        type: 'workflow' as const,
        status: 'success' as const,
        input: 40,
        output: [{ id: 'work1', status: 'success' as const, output: 160 }],
        works: [
          {
            id: 'work1',
            type: 'work' as const,
            status: 'success' as const,
            input: 40,
            output: 160,
            steps: []
          }
        ]
      }

      const workflow = new Workflow({
        id: 'constructor-workflow',
        snapshot
      })

      // 验证构造时自动恢复
      expect(workflow.id).toBe('constructor-workflow')
      expect(workflow.name).toBe('Constructor Workflow')
      expect(workflow.status).toBe('success')
      expect(workflow.input).toBe(40)
      expect(workflow.output).toHaveLength(1)
    })
  })

  describe('级联恢复功能', () => {
    it('应该能够在add时自动恢复子组件状态', () => {
      // 创建包含子组件快照的Work快照
      const workSnapshot = {
        id: 'cascade-work',
        type: 'work' as const,
        status: 'success' as const,
        input: 60,
        output: 180,
        steps: [
          {
            id: 'cascade-step',
            type: 'step' as const,
            status: 'success' as const,
            input: 60,
            output: 180
          }
        ]
      }

      // 使用快照创建Work
      const work = new Work({
        id: 'cascade-work',
        snapshot: workSnapshot
      })

      // 创建Step（不带快照）
      const step = new Step({
        id: 'cascade-step',
        run: async (input: number, context) => input * 3
      })

      // 添加时应该自动恢复状态
      work.add(step)

      // 验证级联恢复 - step应该从work的快照中恢复状态
      expect(work.status).toBe('success')
      expect(work.input).toBe(60)
      expect(work.output).toBe(180)
      expect(step.status).toBe('success')
      expect(step.input).toBe(60)
      expect(step.output).toBe(180)
    })
  })

  describe('复杂数据快照', () => {
    it('应该能够处理复杂数据结构的快照', async () => {
      const step = new Step({
        id: 'complex-step',
        run: async (input: { values: number[], meta: { name: string, count: number } }, context) => {
          return {
            processed: input.values.map(v => v * 2),
            summary: {
              total: input.values.reduce((a, b) => a + b, 0) * 2,
              count: input.values.length,
              name: input.meta.name,
              version: input.meta.count + 1
            }
          }
        }
      })

      const complexInput = {
        values: [1, 2, 3, 4],
        meta: { name: 'test', count: 1 }
      }

      const context = { 
        workflow: new Workflow({ id: 'complex-workflow' }), 
        work: new Work({ id: 'complex-work' }) 
      }

      // 执行复杂数据处理
      await step.run(complexInput, context)

      // 生成快照
      const snapshot = step.toSnapshot()

      // 验证复杂数据在快照中的完整性
      expect(snapshot.input).toEqual(complexInput)
      expect(snapshot.output.processed).toEqual([2, 4, 6, 8])
      expect(snapshot.output.summary.total).toBe(20)
      expect(snapshot.output.summary.name).toBe('test')
      expect(snapshot.output.summary.version).toBe(2)

      // 从快照恢复
      const restoredStep = new Step({
        id: 'complex-step-restored',
        run: async (input: any, context) => ({ placeholder: true })
      })

      restoredStep.fromSnapshot(snapshot)

      // 验证复杂数据完整恢复
      expect(restoredStep.input).toEqual(complexInput)
      expect(restoredStep.output.processed).toEqual([2, 4, 6, 8])
      expect(restoredStep.output.summary.total).toBe(20)
    })
  })
})