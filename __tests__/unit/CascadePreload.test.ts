import { describe, it, expect, beforeEach } from 'vitest'
import { Workflow, Work, Step, MemoryStorage } from 'workflow'

describe('级联预加载测试', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
  })

  describe('级联预加载功能', () => {
    it('应该能够通过 workflow.preload() 级联预加载所有子组件', async () => {
      // 第一步：创建并执行完整的工作流
      const workflow1 = new Workflow({
        id: 'cascade-workflow',
        storage
      })

      const work1 = new Work({
        id: 'cascade-work1',
        storage
      })

      const work2 = new Work({
        id: 'cascade-work2',
        storage
      })

      const step1 = new Step({
        id: 'cascade-step1',
        storage,
        run: async (input: number, context) => input + 100
      })

      const step2 = new Step({
        id: 'cascade-step2',
        storage,
        run: async (input: number, context) => input * 2
      })

      const step3 = new Step({
        id: 'cascade-step3',
        storage,
        run: async (input: number, context) => input - 50
      })

      // 构建工作流结构
      work1.add(step1).add(step2)
      work2.add(step3)
      workflow1.add(work1).add(work2)

      // 只对根 workflow 调用 preload
      workflow1.preload()

      // 执行工作流
      const result1 = await workflow1.run(10)
      expect(result1.status).toBe('success')
      expect(result1.works[0].output).toBe(220) // (10 + 100) * 2
      expect(result1.works[1].output).toBe(-40) // 10 - 50

      // 第二步：创建新的工作流实例，只调用 workflow.preload()
      const workflow2 = new Workflow({
        id: 'cascade-workflow', // 相同ID
        storage
      })

      const work3 = new Work({
        id: 'cascade-work1', // 相同ID
        storage
      })

      const work4 = new Work({
        id: 'cascade-work2', // 相同ID
        storage
      })

      const step4 = new Step({
        id: 'cascade-step1', // 相同ID
        storage,
        run: async (input: number, context) => input + 100
      })

      const step5 = new Step({
        id: 'cascade-step2', // 相同ID
        storage,
        run: async (input: number, context) => input * 2
      })

      const step6 = new Step({
        id: 'cascade-step3', // 相同ID
        storage,
        run: async (input: number, context) => input - 50
      })

      // 重新构建相同结构
      work3.add(step4).add(step5)
      work4.add(step6)
      workflow2.add(work3).add(work4)

      // 只对 workflow 调用 preload，应该级联预加载所有子组件
      workflow2.preload()

      // 等待级联预加载完成
      await new Promise((resolve) => setTimeout(resolve, 300))

      // 验证 Workflow 状态恢复
      expect(workflow2.status).toBe('success')
      expect(workflow2.input).toBe(10)

      // 验证 Work 状态恢复
      expect(work3.status).toBe('success')
      expect(work3.input).toBe(10)
      expect(work3.output).toBe(220)

      expect(work4.status).toBe('success')
      expect(work4.input).toBe(10)
      expect(work4.output).toBe(-40)

      // 验证 Step 状态恢复
      expect(step4.status).toBe('success')
      expect(step4.input).toBe(10)
      expect(step4.output).toBe(110)

      expect(step5.status).toBe('success')
      expect(step5.input).toBe(110)
      expect(step5.output).toBe(220)

      expect(step6.status).toBe('success')
      expect(step6.input).toBe(10)
      expect(step6.output).toBe(-40)

      // 再次运行应该直接返回缓存结果
      const result2 = await workflow2.run(10)
      expect(result2.status).toBe('success')
      expect(result2.works[0].output).toBe(220)
      expect(result2.works[1].output).toBe(-40)
    })

    it('应该能够级联预加载复杂的嵌套结构', async () => {
      // 第一步：创建复杂的嵌套工作流并完整执行
      const workflow1 = new Workflow({
        id: 'nested-cascade-workflow',
        storage
      })

      const work1 = new Work({
        id: 'nested-work1',
        storage
      })

      const work2 = new Work({
        id: 'nested-work2',
        storage
      })

      const work3 = new Work({
        id: 'nested-work3',
        storage
      })

      // 为每个work添加多个步骤
      const step1 = new Step({
        id: 'nested-step1',
        storage,
        run: async (input: number, context) => input + 5
      })

      const step2 = new Step({
        id: 'nested-step2',
        storage,
        run: async (input: number, context) => input * 2
      })

      const step3 = new Step({
        id: 'nested-step3',
        storage,
        run: async (input: number, context) => input - 3
      })

      const step4 = new Step({
        id: 'nested-step4',
        storage,
        run: async (input: number, context) => input / 2
      })

      const step5 = new Step({
        id: 'nested-step5',
        storage,
        run: async (input: number, context) => input + 100
      })

      // 构建复杂的结构
      work1.add(step1).add(step2) // (input + 5) * 2
      work2.add(step3) // input - 3
      work3.add(step4).add(step5) // (input / 2) + 100

      workflow1.add(work1).add(work2).add(work3)
      workflow1.preload()

      // 执行完整的工作流
      const result1 = await workflow1.run(10)
      expect(result1.status).toBe('success')
      expect(result1.works[0].output).toBe(30) // (10 + 5) * 2
      expect(result1.works[1].output).toBe(7) // 10 - 3
      expect(result1.works[2].output).toBe(105) // (10 / 2) + 100

      // 第二步：创建新的工作流实例并重新构建相同结构
      const workflow2 = new Workflow({
        id: 'nested-cascade-workflow',
        storage
      })

      const newWork1 = new Work({ id: 'nested-work1', storage })
      const newWork2 = new Work({ id: 'nested-work2', storage })
      const newWork3 = new Work({ id: 'nested-work3', storage })

      const newStep1 = new Step({ id: 'nested-step1', storage, run: async (input: number, context) => input + 5 })
      const newStep2 = new Step({ id: 'nested-step2', storage, run: async (input: number, context) => input * 2 })
      const newStep3 = new Step({ id: 'nested-step3', storage, run: async (input: number, context) => input - 3 })
      const newStep4 = new Step({ id: 'nested-step4', storage, run: async (input: number, context) => input / 2 })
      const newStep5 = new Step({ id: 'nested-step5', storage, run: async (input: number, context) => input + 100 })

      newWork1.add(newStep1).add(newStep2)
      newWork2.add(newStep3)
      newWork3.add(newStep4).add(newStep5)
      workflow2.add(newWork1).add(newWork2).add(newWork3)

      // 只调用一次 workflow2.preload() 应该级联预加载所有子组件
      workflow2.preload()
      await new Promise((resolve) => setTimeout(resolve, 300))

      // 验证 Workflow 级别的恢复
      expect(workflow2.status).toBe('success')
      expect(workflow2.input).toBe(10)

      // 验证所有 Work 级别的恢复
      expect(newWork1.status).toBe('success')
      expect(newWork1.input).toBe(10)
      expect(newWork1.output).toBe(30)

      expect(newWork2.status).toBe('success')
      expect(newWork2.input).toBe(10)
      expect(newWork2.output).toBe(7)

      expect(newWork3.status).toBe('success')
      expect(newWork3.input).toBe(10)
      expect(newWork3.output).toBe(105)

      // 验证所有 Step 级别的恢复
      expect(newStep1.status).toBe('success')
      expect(newStep1.input).toBe(10)
      expect(newStep1.output).toBe(15)

      expect(newStep2.status).toBe('success')
      expect(newStep2.input).toBe(15)
      expect(newStep2.output).toBe(30)

      expect(newStep3.status).toBe('success')
      expect(newStep3.input).toBe(10)
      expect(newStep3.output).toBe(7)

      expect(newStep4.status).toBe('success')
      expect(newStep4.input).toBe(10)
      expect(newStep4.output).toBe(5)

      expect(newStep5.status).toBe('success')
      expect(newStep5.input).toBe(5)
      expect(newStep5.output).toBe(105)

      // 再次运行应该返回相同结果
      const result2 = await workflow2.run(10)
      expect(result2.status).toBe('success')
      expect(result2.works[0].output).toBe(30)
      expect(result2.works[1].output).toBe(7)
      expect(result2.works[2].output).toBe(105)
    })

    it('级联预加载应该正确处理错误状态', async () => {
      // 第一步：创建会失败的工作流
      const workflow1 = new Workflow({
        id: 'error-cascade-workflow',
        storage
      })

      const work1 = new Work({
        id: 'error-cascade-work',
        storage
      })

      const step1 = new Step({
        id: 'error-cascade-step1',
        storage,
        run: async (input: number, context) => input + 10
      })

      const step2 = new Step({
        id: 'error-cascade-step2',
        storage,
        run: async (input: number, context) => {
          throw new Error('Cascade test error')
        }
      })

      work1.add(step1).add(step2)
      workflow1.add(work1)
      workflow1.preload()

      // 执行并捕获错误
      await expect(workflow1.run(30)).rejects.toThrow('Cascade test error')
      expect(workflow1.status).toBe('failed')

      // 第二步：创建新实例进行级联预加载
      const workflow2 = new Workflow({
        id: 'error-cascade-workflow',
        storage
      })

      const work2 = new Work({
        id: 'error-cascade-work',
        storage
      })

      const step3 = new Step({
        id: 'error-cascade-step1',
        storage,
        run: async (input: number, context) => input + 10
      })

      const step4 = new Step({
        id: 'error-cascade-step2',
        storage,
        run: async (input: number, context) => {
          throw new Error('Cascade test error')
        }
      })

      work2.add(step3).add(step4)
      workflow2.add(work2)

      // 级联预加载
      workflow2.preload()
      await new Promise((resolve) => setTimeout(resolve, 300))

      // 验证错误状态级联恢复
      expect(workflow2.status).toBe('failed')
      expect(work2.status).toBe('failed')
      expect(step3.status).toBe('success') // 第一个步骤应该成功
      expect(step3.output).toBe(40)
      expect(step4.status).toBe('failed') // 第二个步骤应该失败

      // 再次运行应该直接返回失败状态
      const result = await workflow2.run(30)
      expect(result.status).toBe('failed')
    })
  })

  describe('无预加载 vs 级联预加载对比', () => {
    it('没有预加载时应该是初始状态', async () => {
      // 先执行一个工作流
      const workflow1 = new Workflow({
        id: 'no-preload-test',
        storage
      })

      const work1 = new Work({
        id: 'no-preload-work',
        storage
      })

      const step1 = new Step({
        id: 'no-preload-step',
        storage,
        run: async (input: number, context) => input * 10
      })

      work1.add(step1)
      workflow1.add(work1)
      workflow1.preload()

      await workflow1.run(5)
      expect(workflow1.status).toBe('success')

      // 创建新实例但不调用预加载
      const workflow2 = new Workflow({
        id: 'no-preload-test',
        storage
      })

      const work2 = new Work({
        id: 'no-preload-work',
        storage
      })

      const step2 = new Step({
        id: 'no-preload-step',
        storage,
        run: async (input: number, context) => input * 10
      })

      work2.add(step2)
      workflow2.add(work2)

      // 不调用预加载，状态应该是初始状态
      expect(workflow2.status).toBe('pending')
      expect(work2.status).toBe('pending')
      expect(step2.status).toBe('pending')

      // 调用预加载后状态应该恢复
      workflow2.preload()
      await new Promise((resolve) => setTimeout(resolve, 200))

      expect(workflow2.status).toBe('success')
      expect(work2.status).toBe('success')
      expect(step2.status).toBe('success')
    })
  })
})
