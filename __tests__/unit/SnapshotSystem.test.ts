import { describe, it, expect, beforeEach } from 'vitest'
import { Workflow, Work, Step, MemoryStorage } from 'workflow'

describe('快照系统测试', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
  })

  describe('基础快照功能', () => {
    it('应该能够在执行完成后自动恢复状态', async () => {
      // 第一步：创建Step并执行
      const step1 = new Step({
        id: 'basic-snapshot-step',
        storage,
        run: async (input: number, context) => input * 3
      }).preload()

      const context = {
        workflow: new Workflow({ id: 'test-workflow' }),
        work: new Work({ id: 'test-work' })
      }

      // 执行并验证结果
      const result1 = await step1.run(10, context)
      expect(result1.status).toBe('success')
      expect(result1.output).toBe(30)

      // 第二步：创建相同ID的新Step实例
      const step2 = new Step({
        id: 'basic-snapshot-step', // 相同的ID
        storage, // 相同的存储
        run: async (input: number, context) => input * 3
      }).preload()

      // 等待preload完成
      await new Promise((resolve) => setTimeout(resolve, 200))

      // 验证状态已从快照恢复
      expect(step2.status).toBe('success')
      expect(step2.input).toBe(10)
      expect(step2.output).toBe(30)

      // 再次运行应该直接返回快照结果
      const result2 = await step2.run(10, context)
      expect(result2.status).toBe('success')
      expect(result2.output).toBe(30)
    })

    it('应该能够恢复Work的完整状态', async () => {
      // 第一步：创建并执行Work
      const workflow1 = new Workflow({
        id: 'work-test-workflow',
        storage
      }).preload()

      const work1 = new Work({
        id: 'work-snapshot-test',
        storage
      }).preload()

      const step1 = new Step({
        id: 'work-step-test',
        storage,
        run: async (input: number, context) => input + 15
      }).preload()

      work1.add(step1)
      workflow1.add(work1)

      // 执行完整流程
      const result1 = await workflow1.run(5)
      expect(result1.status).toBe('success')
      expect(result1.works[0].output).toBe(20)

      // 第二步：创建新实例验证恢复
      const work2 = new Work({
        id: 'work-snapshot-test', // 相同ID
        storage
      }).preload()

      const step2 = new Step({
        id: 'work-step-test', // 相同ID
        storage,
        run: async (input: number, context) => input + 15
      }).preload()

      work2.add(step2)

      // 等待preload恢复状态
      await new Promise((resolve) => setTimeout(resolve, 200))

      // 验证Work和Step状态都已恢复
      expect(work2.status).toBe('success')
      expect(work2.input).toBe(5)
      expect(work2.output).toBe(20)
      expect(step2.status).toBe('success')
      expect(step2.output).toBe(20)
    })

    it('应该能够恢复Workflow的完整状态', async () => {
      // 创建并执行Workflow
      const workflow1 = new Workflow({
        id: 'full-workflow-test',
        storage
      }).preload()

      const work1 = new Work({
        id: 'full-work-test',
        storage
      }).preload()

      const step1 = new Step({
        id: 'full-step-test',
        storage,
        run: async (input: number, context) => input * 5
      }).preload()

      work1.add(step1)
      workflow1.add(work1)

      const result1 = await workflow1.run(8)
      expect(result1.status).toBe('success')
      expect(result1.works[0].output).toBe(40)

      // 创建新Workflow实例验证恢复
      const workflow2 = new Workflow({
        id: 'full-workflow-test', // 相同ID
        storage
      }).preload()

      // 等待preload恢复
      await new Promise((resolve) => setTimeout(resolve, 200))

      // 验证Workflow状态恢复
      expect(workflow2.status).toBe('success')
      expect(workflow2.input).toBe(8)
      expect(workflow2.works).toHaveLength(0) // 注意：works数组在构造时为空，需要重新添加

      // 重新运行应该返回相同结果
      const result2 = await workflow2.run(8)
      expect(result2.status).toBe('success')
    })
  })

  describe('失败状态的快照', () => {
    it('应该能够恢复失败状态', async () => {
      // 创建会失败的Step
      const step1 = new Step({
        id: 'error-test-step',
        storage,
        run: async (input: number, context) => {
          throw new Error('Test failure')
        }
      }).preload()

      const context = {
        workflow: new Workflow({ id: 'error-workflow' }),
        work: new Work({ id: 'error-work' })
      }

      // 执行并捕获错误
      await expect(step1.run(123, context)).rejects.toThrow('Test failure')
      expect(step1.status).toBe('failed')

      // 创建新实例验证错误状态恢复
      const step2 = new Step({
        id: 'error-test-step', // 相同ID
        storage,
        run: async (input: number, context) => {
          throw new Error('Test failure')
        }
      }).preload()

      // 等待preload恢复
      await new Promise((resolve) => setTimeout(resolve, 200))

      // 验证错误状态已恢复
      expect(step2.status).toBe('failed')
      expect(step2.input).toBe(123)

      // 再次运行应该直接返回失败状态
      const result = await step2.run(123, context)
      expect(result.status).toBe('failed')
    })
  })

  describe('存储隔离验证', () => {
    it('不同存储实例应该有独立的快照', async () => {
      const storage1 = new MemoryStorage()
      const storage2 = new MemoryStorage() // 完全独立的存储

      // 在storage1中执行
      const step1 = new Step({
        id: 'isolation-test-step',
        storage: storage1,
        run: async (input: number, context) => input * 100
      }).preload()

      const context = {
        workflow: new Workflow({ id: 'isolation-workflow' }),
        work: new Work({ id: 'isolation-work' })
      }

      await step1.run(3, context)
      expect(step1.output).toBe(300)

      // 在storage2中创建相同ID的Step
      const step2 = new Step({
        id: 'isolation-test-step', // 相同ID
        storage: storage2, // 不同存储
        run: async (input: number, context) => input * 100
      }).preload()

      // 等待preload
      await new Promise((resolve) => setTimeout(resolve, 200))

      // 应该没有恢复任何状态（因为存储不同）
      expect(step2.status).toBe('pending')
      expect(step2.input).toBeUndefined()
      expect(step2.output).toBeUndefined()

      // 独立执行应该正常
      const result = await step2.run(7, context)
      expect(result.status).toBe('success')
      expect(result.output).toBe(700)
    })

    it('共享存储应该能够跨实例恢复', async () => {
      const sharedStorage = new MemoryStorage()

      // 第一个实例
      const step1 = new Step({
        id: 'shared-test-step',
        storage: sharedStorage,
        run: async (input: number, context) => input + 200
      }).preload()

      const context = {
        workflow: new Workflow({ id: 'shared-workflow' }),
        work: new Work({ id: 'shared-work' })
      }

      await step1.run(50, context)
      expect(step1.output).toBe(250)

      // 第二个实例使用相同的存储引用
      const step2 = new Step({
        id: 'shared-test-step', // 相同ID
        storage: sharedStorage, // 共享存储
        run: async (input: number, context) => input + 200
      }).preload()

      // 等待恢复
      await new Promise((resolve) => setTimeout(resolve, 200))

      // 验证状态共享成功
      expect(step2.status).toBe('success')
      expect(step2.input).toBe(50)
      expect(step2.output).toBe(250)
    })
  })

  describe('复杂数据的快照', () => {
    it('应该能够正确保存和恢复复杂数据结构', async () => {
      const step1 = new Step({
        id: 'complex-data-step',
        name: 'Complex Data Processor',
        description: 'Processes complex data structures',
        storage,
        run: async (input: { items: number[]; metadata: { type: string; version: number } }, context) => {
          return {
            processed: input.items.map((x) => x * 2),
            summary: {
              total: input.items.reduce((a, b) => a + b, 0) * 2,
              count: input.items.length,
              type: input.metadata.type,
              version: input.metadata.version + 1
            },
            timestamp: Date.now()
          }
        }
      }).preload()

      const complexInput = {
        items: [1, 2, 3, 4, 5],
        metadata: { type: 'test-data', version: 1 }
      }

      const context = {
        workflow: new Workflow({ id: 'complex-workflow' }),
        work: new Work({ id: 'complex-work' })
      }

      // 执行并验证复杂数据处理
      const result1 = await step1.run(complexInput, context)
      expect(result1.status).toBe('success')
      expect(result1.output.processed).toEqual([2, 4, 6, 8, 10])
      expect(result1.output.summary.total).toBe(30)
      expect(result1.output.summary.version).toBe(2)

      // 创建新实例验证复杂数据恢复
      const step2 = new Step({
        id: 'complex-data-step',
        storage,
        run: async (input: any, context) => ({ placeholder: true })
      }).preload()

      await new Promise((resolve) => setTimeout(resolve, 200))

      // 验证复杂数据完整恢复
      expect(step2.status).toBe('success')
      expect(step2.input).toEqual(complexInput)
      expect(step2.output.processed).toEqual([2, 4, 6, 8, 10])
      expect(step2.output.summary.total).toBe(30)
      expect(step2.output.summary.version).toBe(2)
      expect(step2.output.timestamp).toBeDefined()
    })
  })
})
