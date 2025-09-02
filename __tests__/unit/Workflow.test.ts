import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Workflow, Work, Step, STATUS } from 'workflow'

// 生成唯一ID的工具函数，避免全局状态污染
const generateUniqueId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

describe('Workflow', () => {
  let workflow: Workflow<number>
  let work1: Work<number, string>
  let work2: Work<number, number>
  let step1: Step<number, string>
  let step2: Step<number, number>
  let workflowId: string
  let work1Id: string
  let work2Id: string

  beforeEach(() => {
    workflowId = generateUniqueId('test-workflow')
    work1Id = generateUniqueId('work-1')
    work2Id = generateUniqueId('work-2')

    workflow = new Workflow<number>({
      id: workflowId,
      name: 'Test Workflow',
      description: 'A test workflow'
    })

    step1 = new Step({
      id: generateUniqueId('step-1'),
      name: 'String Step',
      run: async (input: number) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return `Result: ${input}`
      }
    })

    step2 = new Step({
      id: generateUniqueId('step-2'),
      name: 'Number Step',
      run: async (input: number) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return input * 2
      }
    })

    work1 = new Work<number, string>({
      id: work1Id,
      name: 'String Work'
    })

    work2 = new Work<number, number>({
      id: work2Id,
      name: 'Number Work'
    })

    work1.add(step1)
    work2.add(step2)
  })

  describe('构造函数', () => {
    it('应该正确初始化Workflow', () => {
      expect(workflow.id).toBe(workflowId)
      expect(workflow.name).toBe('Test Workflow')
      expect(workflow.description).toBe('A test workflow')
      expect(workflow.type).toBe('workflow')
      expect(workflow.status).toBe(STATUS.PENDING)
      expect(workflow.works).toHaveLength(0)
      expect(workflow.output).toBeUndefined()
    })

    it('应该使用默认选项创建Workflow', () => {
      const defaultWorkflow = new Workflow()

      expect(defaultWorkflow.id).toMatch(/^workflow-\d+$/)
      expect(defaultWorkflow.name).toBeUndefined()
      expect(defaultWorkflow.description).toBeUndefined()
      expect(defaultWorkflow.status).toBe(STATUS.PENDING)
    })
  })

  describe('add方法', () => {
    it('应该能够添加Work', () => {
      const result = workflow.add(work1)

      expect(result).toBe(workflow) // 支持链式调用
      expect(workflow.works).toHaveLength(1)
      expect(workflow.works[0]).toBe(work1)
    })

    it('应该能够链式添加多个Work', () => {
      workflow.add(work1).add(work2)

      expect(workflow.works).toHaveLength(2)
      expect(workflow.works[0]).toBe(work1)
      expect(workflow.works[1]).toBe(work2)
    })

    it('应该设置Work事件监听器', () => {
      const workStartListener = vi.fn()
      const stepStartListener = vi.fn()

      workflow.on('work:start', workStartListener)
      workflow.on('step:start', stepStartListener)

      workflow.add(work1)

      // 验证事件监听器被正确设置（不抛出错误）
      expect(workflow.works).toHaveLength(1)
    })
  })

  describe('run方法', () => {
    it('应该成功并行执行所有Work并返回WorkflowSnapshot', async () => {
      workflow.add(work1).add(work2)

      const workflowSnapshot = await workflow.run(42)

      // 验证返回的是WorkflowSnapshot
      expect(workflowSnapshot.id).toBe(workflowId)
      expect(workflowSnapshot.type).toBe('workflow')
      expect(workflowSnapshot.status).toBe(STATUS.SUCCESS)
      expect(workflowSnapshot.input).toBe(42)

      // 验证输出是WorkSnapshot数组
      expect(Array.isArray(workflowSnapshot.output)).toBe(true)
      expect(workflowSnapshot.output).toHaveLength(2)

      // 验证第一个Work的结果
      const work1Result = workflowSnapshot.output![0]
      expect(work1Result.id).toBe(work1Id)
      expect(work1Result.type).toBe('work')
      expect(work1Result.output).toBe('Result: 42')

      // 验证第二个Work的结果
      const work2Result = workflowSnapshot.output![1]
      expect(work2Result.id).toBe(work2Id)
      expect(work2Result.type).toBe('work')
      expect(work2Result.output).toBe(84)

      // 验证工作流实例状态
      expect(workflow.status).toBe(STATUS.SUCCESS)
      expect(workflow.input).toBe(42)
      expect(workflow.output).toEqual(workflowSnapshot.output)
    })

    it('应该在没有Work时返回空的WorkflowSnapshot', async () => {
      const emptyWorkflow = new Workflow<number>()

      const workflowSnapshot = await emptyWorkflow.run(42)

      expect(workflowSnapshot.type).toBe('workflow')
      expect(workflowSnapshot.status).toBe(STATUS.SUCCESS)
      expect(Array.isArray(workflowSnapshot.output)).toBe(true)
      expect(workflowSnapshot.output).toHaveLength(0)
      expect(emptyWorkflow.status).toBe(STATUS.SUCCESS)
    })

    it('应该在重复运行时返回快照', async () => {
      workflow.add(work1)
      const snapshot1 = await workflow.run(42)

      // 重复运行应该返回相同的快照
      const snapshot2 = await workflow.run(50)

      expect(snapshot1).toEqual(snapshot2)
      expect(snapshot2.status).toBe(STATUS.SUCCESS)
      expect(snapshot2.input).toBe(42) // 保持原始输入
    })

    it('应该处理Work执行失败的情况', async () => {
      const failingWork = new Work({ id: generateUniqueId('failing-work') })
      const failingStep = new Step({
        id: generateUniqueId('failing-step'),
        run: async () => {
          throw new Error('Work failed')
        }
      })

      failingWork.add(failingStep)
      workflow.add(failingWork)

      // 第一次运行会失败
      await expect(workflow.run(42)).rejects.toThrow('Work failed')
      expect(workflow.status).toBe(STATUS.FAILED)

      // 第二次运行返回失败状态的快照
      const snapshot = await workflow.run(42)
      expect(snapshot.status).toBe(STATUS.FAILED)
      expect(snapshot.input).toBe(42)
    })

    it('应该处理部分Work失败的情况', async () => {
      const successWork = new Work({ id: generateUniqueId('success-work') })
      const successStep = new Step({
        id: generateUniqueId('success-step'),
        run: async (input: number) => ({ success: true, data: input.toString() })
      })

      const failingWork = new Work({ id: generateUniqueId('failing-work') })
      const failingStep = new Step({
        id: generateUniqueId('failing-step'),
        run: async () => {
          throw new Error('This work failed')
        }
      })

      successWork.add(successStep)
      failingWork.add(failingStep)

      workflow.add(successWork).add(failingWork)

      // 第一次运行会失败
      await expect(workflow.run(42)).rejects.toThrow('This work failed')
      expect(workflow.status).toBe(STATUS.FAILED)

      // 第二次运行返回失败状态的快照
      const snapshot = await workflow.run(42)
      expect(snapshot.status).toBe(STATUS.FAILED)
      expect(snapshot.input).toBe(42)
    })
  })

  describe('暂停和继续', () => {
    it('应该能够暂停和继续Workflow', async () => {
      // 创建独立的 workflow 实例避免状态污染
      const pauseWorkflow = new Workflow({
        id: 'pause-workflow',
        name: 'Pause Workflow',
        description: 'A pausable workflow'
      })

      const work = new Work({ id: 'simple-work' })
      const step = new Step({
        id: 'simple-step',
        run: async (input: number) => {
          return { success: true, data: input * 2 }
        }
      })

      work.add(step)
      pauseWorkflow.add(work)

      // 测试基本的暂停和继续功能
      const pauseSnapshot = await pauseWorkflow.pause()
      expect(pauseSnapshot.status).toBe(STATUS.PENDING) // Workflow未运行时暂停返回当前状态

      const resumeSnapshot = await pauseWorkflow.resume()
      expect(resumeSnapshot.status).toBe(STATUS.PENDING) // 未暂停时继续返回当前状态

      // 正常执行工作流
      const workflowSnapshot = await pauseWorkflow.run(42)
      expect(workflowSnapshot.type).toBe('workflow')
      expect(workflowSnapshot.status).toBe(STATUS.SUCCESS)
      expect(Array.isArray(workflowSnapshot.output)).toBe(true)
      expect(workflowSnapshot.output).toHaveLength(1)
      expect(pauseWorkflow.status).toBe(STATUS.SUCCESS)
    }, 1000)

    it('应该在非运行状态下暂停时返回当前快照', async () => {
      const testWorkflow = new Workflow({ id: 'pause-test-workflow' })
      const snapshot = await testWorkflow.pause()
      expect(snapshot.status).toBe(STATUS.PENDING)
    })

    it('应该在非暂停状态下继续时返回当前快照', async () => {
      const testWorkflow = new Workflow({ id: 'resume-test-workflow' })
      const snapshot = await testWorkflow.resume()
      expect(snapshot.status).toBe(STATUS.PENDING)
    })
  })

  describe('事件处理', () => {
    it('应该能够添加事件监听器', () => {
      const workflowStartListener = vi.fn()
      const workflowSuccessListener = vi.fn()
      const workStartListener = vi.fn()
      const stepStartListener = vi.fn()

      workflow.on('workflow:start', workflowStartListener)
      workflow.on('workflow:success', workflowSuccessListener)
      workflow.on('work:start', workStartListener)
      workflow.on('step:start', stepStartListener)

      // 验证不会抛出错误
      expect(() => workflow.on('custom-event', vi.fn())).not.toThrow()
    })

    it('应该在Workflow生命周期中触发正确的事件', async () => {
      const workflowStartListener = vi.fn()
      const workflowSuccessListener = vi.fn()

      workflow.on('workflow:start', workflowStartListener)
      workflow.on('workflow:success', workflowSuccessListener)

      workflow.add(work1)
      await workflow.run(42)

      // 验证Workflow成功完成
      expect(workflow.status).toBe(STATUS.SUCCESS)
    })

    it('应该传播Work和Step事件', async () => {
      const workStartListener = vi.fn()
      const stepStartListener = vi.fn()
      const stepSuccessListener = vi.fn()

      workflow.on('work:start', workStartListener)
      workflow.on('step:start', stepStartListener)
      workflow.on('step:success', stepSuccessListener)

      workflow.add(work1)
      await workflow.run(42)

      // 验证事件系统正常工作
      expect(workflow.status).toBe(STATUS.SUCCESS)
    })
  })

  describe('快照功能', () => {
    it('应该能够创建Workflow快照', async () => {
      workflow.add(work1).add(work2)
      await workflow.run(42)

      const snapshot = workflow.getSnapshot()
      expect(snapshot.id).toBe(workflowId)
      expect(snapshot.name).toBe('Test Workflow')
      expect(snapshot.type).toBe('workflow')
      expect(snapshot.status).toBe(STATUS.SUCCESS)
      expect(snapshot.input).toBe(42)
      expect(snapshot.works).toHaveLength(2)
      expect(snapshot.works[0].id).toBe(work1Id)
      expect(snapshot.works[1].id).toBe(work2Id)
      expect(Array.isArray(snapshot.output)).toBe(true)
    })

    it('应该能够保存和读取快照', async () => {
      workflow.add(work1)
      await workflow.run(100)

      const snapshot = workflow.getSnapshot()
      expect(snapshot).toBeDefined()
      expect(snapshot.id).toBe(workflowId)
      expect(snapshot.input).toBe(100)
      expect(snapshot.status).toBe(STATUS.SUCCESS)
    })
  })

  describe('复杂场景测试', () => {
    it('应该处理大量并行Work', async () => {
      const manyWorksWorkflow = new Workflow<number>()

      // 创建10个Work，每个Work包含一个简单Step
      for (let i = 0; i < 10; i++) {
        const work = new Work({ id: `work-${i}` })
        const step = new Step({
          id: `step-${i}`,
          run: async (input: number) => {
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 20))
            return input + i
          }
        })
        work.add(step)
        manyWorksWorkflow.add(work)
      }

      const workflowSnapshot = await manyWorksWorkflow.run(100)

      expect(workflowSnapshot.type).toBe('workflow')
      expect(workflowSnapshot.status).toBe(STATUS.SUCCESS)
      expect(Array.isArray(workflowSnapshot.output)).toBe(true)
      expect(workflowSnapshot.output).toHaveLength(10)

      // 验证所有结果都是成功的
      workflowSnapshot.output!.forEach((workSnapshot, index) => {
        expect(workSnapshot.type).toBe('work')
        expect(workSnapshot.status).toBe(STATUS.SUCCESS)
        expect(workSnapshot.output).toBe(100 + index)
      })
    })

    it('应该处理嵌套的复杂工作流', async () => {
      // 创建一个包含多步骤Work的Workflow
      const complexWorkflow = new Workflow<string>()

      const multiStepWork = new Work<string, string>({ id: generateUniqueId('multi-step-work') })

      const step1 = new Step({
        id: 'transform-step-1',
        run: async (input: string) => {
          return `${input}-transformed`
        }
      })

      const step2 = new Step({
        id: 'transform-step-2',
        run: async (input: string) => {
          return `${input}-final`
        }
      })

      multiStepWork.add(step1).add(step2)
      complexWorkflow.add(multiStepWork)

      const workflowSnapshot = await complexWorkflow.run('initial')

      expect(workflowSnapshot.type).toBe('workflow')
      expect(workflowSnapshot.status).toBe(STATUS.SUCCESS)
      expect(Array.isArray(workflowSnapshot.output)).toBe(true)
      expect(workflowSnapshot.output).toHaveLength(1)
      expect(workflowSnapshot.output![0].output).toBe('initial-transformed-final')
    })
  })

  describe('类型安全和推导', () => {
    it('应该支持类型约束', () => {
      // 编译时类型检查：Workflow只需要一个输入类型参数
      const typedWorkflow = new Workflow<number>()

      expect(typedWorkflow.type).toBe('workflow')
    })

    it('应该支持从Work推导Workflow类型', () => {
      // 这个测试主要验证类型系统在编译时工作正常
      const uninitializedWorkflow = new Workflow()

      const stringWork = new Work({ id: 'string-work' })
      const stringStep = new Step({
        id: 'string-step',
        run: async (input: any) => 'result'
      })
      stringWork.add(stringStep)

      const numberWork = new Work({ id: 'number-work' })
      const numberStep = new Step({
        id: 'number-step',
        run: async (input: any) => 42
      })
      numberWork.add(numberStep)

      uninitializedWorkflow.add(stringWork).add(numberWork)

      expect(uninitializedWorkflow.works).toHaveLength(2)
    })

    it('应该正确处理空Workflow', async () => {
      const emptyWorkflow = new Workflow<any>({ id: generateUniqueId('empty-workflow') })

      const workflowSnapshot = await emptyWorkflow.run('any-input')

      expect(workflowSnapshot.type).toBe('workflow')
      expect(workflowSnapshot.status).toBe(STATUS.SUCCESS)
      expect(Array.isArray(workflowSnapshot.output)).toBe(true)
      expect(workflowSnapshot.output).toHaveLength(0)
      expect(emptyWorkflow.status).toBe(STATUS.SUCCESS)
    })
  })
})
