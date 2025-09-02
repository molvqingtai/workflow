import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Step, STATUS } from 'workflow'

describe('Step', () => {
  let step: Step<number, string>

  beforeEach(() => {
    step = new Step({
      id: 'test-step',
      name: 'Test Step',
      description: 'A test step',
      run: async (input: number) => {
        await new Promise((resolve) => setTimeout(resolve, 10)) // 模拟异步操作
        if (input < 0) {
          throw new Error('Negative input not allowed')
        }
        return `Result: ${input * 2}`
      }
    })
  })

  describe('构造函数', () => {
    it('应该正确初始化Step', () => {
      expect(step.id).toBe('test-step')
      expect(step.name).toBe('Test Step')
      expect(step.description).toBe('A test step')
      expect(step.type).toBe('step')
      expect(step.status).toBe(STATUS.PENDING)
      expect(step.output).toBeUndefined()
      expect(step.input).toBeUndefined()
    })
  })

  describe('run方法', () => {
    it('应该成功执行并返回快照', async () => {
      const snapshot = await step.run(5)

      // 验证返回的快照
      expect(snapshot.id).toBe('test-step')
      expect(snapshot.type).toBe('step')
      expect(snapshot.input).toBe(5)
      expect(snapshot.output).toBe('Result: 10')
      expect(snapshot.status).toBe(STATUS.SUCCESS)

      // 验证 step 实例的状态
      expect(step.status).toBe(STATUS.SUCCESS)
      expect(step.input).toBe(5)
      expect(step.output).toBe('Result: 10')
    })

    it('应该处理失败情况并抛出错误', async () => {
      // 创建一个新的步骤实例来测试失败情况，避免状态污染
      const failStep = new Step({
        id: 'fail-step',
        name: 'Fail Step',
        description: 'A failing step',
        run: async (input: number) => {
          if (input < 0) {
            throw new Error('Negative input not allowed')
          }
          return `Result: ${input}`
        }
      })

      await expect(failStep.run(-1)).rejects.toThrow('Negative input not allowed')
      expect(failStep.status).toBe(STATUS.FAILED)
      expect(failStep.input).toBe(-1)
      expect(failStep.output).toBeUndefined()
    })

    it('应该在重复执行时返回快照', async () => {
      const snapshot1 = await step.run(5)
      const snapshot2 = await step.run(10) // 重复运行，应该返回相同的快照

      expect(snapshot1).toEqual(snapshot2)
      expect(snapshot2.input).toBe(5) // 保持原始输入
      expect(snapshot2.output).toBe('Result: 10') // 保持原始输出
    })

    it('失败的步骤重复运行时应该返回失败快照', async () => {
      // 创建一个新的步骤实例来测试失败情况
      const failStep = new Step({
        id: 'fail-repeat-step',
        name: 'Fail Repeat Step',
        description: 'A failing step for repeat test',
        run: async (input: number) => {
          if (input < 0) {
            throw new Error('Negative input not allowed')
          }
          return `Result: ${input}`
        }
      })

      // 第一次运行失败
      await expect(failStep.run(-1)).rejects.toThrow('Negative input not allowed')
      expect(failStep.status).toBe(STATUS.FAILED)

      // 重复运行应该返回失败状态的快照
      const snapshot = await failStep.run(-1)
      expect(snapshot.status).toBe(STATUS.FAILED)
      expect(snapshot.input).toBe(-1)
    })
  })

  describe('快照功能', () => {
    it('应该能够创建快照', async () => {
      // 创建一个新的步骤实例来测试快照功能，避免状态污染
      const snapStep = new Step({
        id: 'snap-step',
        name: 'Snap Step',
        description: 'A snapshot step',
        run: async (input: number) => `Result: ${input * 2}`
      })

      await snapStep.run(42)

      const snapshot = snapStep.getSnapshot()
      expect(snapshot.id).toBe('snap-step')
      expect(snapshot.name).toBe('Snap Step')
      expect(snapshot.type).toBe('step')
      expect(snapshot.status).toBe(STATUS.SUCCESS)
      expect(snapshot.input).toBe(42)
      expect(snapshot.output).toBe('Result: 84')
    })
  })
})
