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
      await expect(step.run(-1)).rejects.toThrow('Negative input not allowed')
      expect(step.status).toBe(STATUS.FAILED)
      expect(step.input).toBe(-1)
      expect(step.output).toBeUndefined()
    })

    it('应该防止重复执行', async () => {
      await step.run(5)
      await expect(step.run(10)).rejects.toThrow('Step is already started')
    })
  })

  describe('快照功能', () => {
    it('应该能够创建快照', async () => {
      await step.run(42)

      const snapshot = step.getSnapshot()
      expect(snapshot.id).toBe('test-step')
      expect(snapshot.name).toBe('Test Step')
      expect(snapshot.type).toBe('step')
      expect(snapshot.status).toBe(STATUS.SUCCESS)
      expect(snapshot.input).toBe(42)
      expect(snapshot.output).toBe('Result: 84')
    })
  })
})
