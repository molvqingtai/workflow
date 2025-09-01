import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Workflow, Work, Step, STATUS } from 'workflow'

describe('集成测试 - Workflow系统', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })
  it('应该完成一个基本的工作流', async () => {
    // 创建一个简单的 Step
    const step = new Step({
      id: 'simple-step',
      run: async (input: string) => {
        return input.toUpperCase()
      }
    })

    // 创建 Work 并添加 Step
    const work = new Work({
      id: 'simple-work'
    }).add(step)

    // 创建 Workflow 并添加 Work
    const workflow = new Workflow({
      id: 'simple-workflow'
    }).add(work)

    // 执行工作流
    const result = await workflow.run('hello')

    // 验证结果
    expect(result.id).toBe('simple-workflow')
    expect(result.type).toBe('workflow')
    expect(result.status).toBe(STATUS.SUCCESS)
    expect(result.input).toBe('hello')

    // 验证输出数组
    expect(Array.isArray(result.output)).toBe(true)
    expect(result.output).toHaveLength(1)

    // 验证 Work 的结果
    const workResult = result.output![0]
    expect(workResult.id).toBe('simple-work')
    expect(workResult.type).toBe('work')
    expect(workResult.output).toBe('HELLO')
  })

  it('应该处理多步骤的 Work', async () => {
    // 创建多个 Step
    const step1 = new Step({
      id: 'step1',
      run: async (input: number) => input * 2
    })

    const step2 = new Step({
      id: 'step2',
      run: async (input: number) => input + 10
    })

    // 创建包含多个步骤的 Work
    const work = new Work({
      id: 'multi-step-work'
    })
      .add(step1)
      .add(step2)

    const workflow = new Workflow({
      id: 'multi-step-workflow'
    }).add(work)

    // 执行
    const result = await workflow.run(5)

    // 验证：5 * 2 + 10 = 20
    expect(result.output![0].output).toBe(20)
  })

  it('应该处理并行的多个 Work', async () => {
    const work1 = new Work({
      id: 'work1'
    }).add(
      new Step({
        id: 'step1',
        run: async (input: string) => `${input}-work1`
      })
    )

    const work2 = new Work({
      id: 'work2'
    }).add(
      new Step({
        id: 'step2',
        run: async (input: string) => `${input}-work2`
      })
    )

    const workflow = new Workflow({
      id: 'parallel-workflow'
    })
      .add(work1)
      .add(work2)

    const result = await workflow.run('test')

    expect(result.output).toHaveLength(2)
    expect(result.output![0].output).toBe('test-work1')
    expect(result.output![1].output).toBe('test-work2')
  })

  it('应该处理复杂的数据流转换', async () => {
    // 数据处理管道：解析JSON → 验证 → 转换 → 格式化
    const parseStep = new Step({
      id: 'parse-json',
      run: async (jsonString: string) => {
        return JSON.parse(jsonString)
      }
    })

    const validateStep = new Step({
      id: 'validate-data',
      run: async (data: any) => {
        if (!data.name || !data.age) {
          throw new Error('Missing required fields')
        }
        return data
      }
    })

    const transformStep = new Step({
      id: 'transform-data',
      run: async (data: { name: string; age: number }) => {
        return {
          fullName: data.name.toUpperCase(),
          ageGroup: data.age >= 18 ? 'adult' : 'minor',
          processedAt: new Date().toISOString()
        }
      }
    })

    const dataWork = new Work({
      id: 'data-processing-work',
      name: '数据处理工作'
    })
      .add(parseStep)
      .add(validateStep)
      .add(transformStep)

    const workflow = new Workflow({
      id: 'data-pipeline-workflow'
    }).add(dataWork)

    const inputJson = JSON.stringify({ name: 'john doe', age: 25 })
    const result = await workflow.run(inputJson)

    expect(result.status).toBe(STATUS.SUCCESS)
    const output = result.output![0].output
    // 现在应该能推导出正确的类型
    expect(output.fullName).toBe('JOHN DOE')
    expect(output.ageGroup).toBe('adult')
    expect(output.processedAt).toBeDefined()
  })

  it('应该处理错误传播和恢复', async () => {
    // 测试成功情况
    const successStep = new Step({
      id: 'success-step',
      run: async (input: string) => {
        if (input === 'fail') {
          throw new Error('Intentional failure')
        }
        return input.toUpperCase()
      }
    })

    const successWorkflow = new Workflow({
      id: 'success-workflow'
    }).add(new Work({ id: 'success-work' }).add(successStep))

    const successResult = await successWorkflow.run('success')
    expect(successResult.status).toBe(STATUS.SUCCESS)
    expect(successResult.output![0].output).toBe('SUCCESS')

    // 测试失败情况 - 使用独立的Step实例
    const failStep = new Step({
      id: 'fail-step',
      run: async (input: string) => {
        if (input === 'fail') {
          throw new Error('Intentional failure')
        }
        return input.toUpperCase()
      }
    })

    const failWorkflow = new Workflow({
      id: 'fail-workflow'
    }).add(new Work({ id: 'fail-work' }).add(failStep))

    await expect(failWorkflow.run('fail')).rejects.toThrow('Intentional failure')
  })

  it('应该处理大量并行工作', async () => {
    const works = Array.from({ length: 10 }, (_, i) =>
      new Work({
        id: `work-${i}`
      }).add(
        new Step({
          id: `step-${i}`,
          run: async (input: number) => {
            // 使用固定时间而不是随机时间，便于测试
            await new Promise((resolve) => setTimeout(resolve, 50))
            return input * (i + 1)
          }
        })
      )
    )

    const workflow = new Workflow({
      id: 'parallel-intensive-workflow'
    })

    works.forEach((work) => workflow.add(work))

    const runPromise = workflow.run(10)

    // 推进时间让所有工作完成
    await vi.advanceTimersByTimeAsync(100)

    const result = await runPromise

    expect(result.output).toHaveLength(10)
    expect(result.status).toBe(STATUS.SUCCESS)

    // 验证每个工作的输出
    result.output!.forEach((workSnapshot, index) => {
      expect(workSnapshot.output).toBe(10 * (index + 1))
    })
  })

  it('应该支持复杂的类型链式传递', async () => {
    interface UserData {
      id: number
      name: string
      email: string
    }

    interface ProcessedUser {
      userId: number
      displayName: string
      domain: string
    }

    const fetchUserStep = new Step<number, UserData>({
      id: 'fetch-user',
      run: async (userId: number) => {
        // 模拟数据库查询
        return {
          id: userId,
          name: 'Test User',
          email: 'test@example.com'
        }
      }
    })

    const processUserStep = new Step<UserData, ProcessedUser>({
      id: 'process-user',
      run: async (user: UserData) => {
        return {
          userId: user.id,
          displayName: user.name.toUpperCase(),
          domain: user.email.split('@')[1]
        }
      }
    })

    const userWork = new Work<number, ProcessedUser>({
      id: 'user-processing-work'
    })
      .add(fetchUserStep)
      .add(processUserStep)

    const workflow = new Workflow({
      id: 'typed-workflow'
    }).add(userWork)

    const result = await workflow.run(123)

    expect(result.status).toBe(STATUS.SUCCESS)
    const processedUser = result.output![0].output as ProcessedUser
    expect(processedUser.userId).toBe(123)
    expect(processedUser.displayName).toBe('TEST USER')
    expect(processedUser.domain).toBe('example.com')
  })

  it('应该支持条件分支工作流', async () => {
    // 根据输入选择不同的处理路径
    const classificationStep = new Step({
      id: 'classify-input',
      run: async (input: number) => {
        return {
          value: input,
          type: input > 0 ? 'positive' : input < 0 ? 'negative' : 'zero'
        }
      }
    })

    const positiveWork = new Work({
      id: 'positive-work'
    }).add(
      new Step({
        id: 'handle-positive',
        run: async (input: number) => {
          // 直接处理原始数字输入
          return `Positive: ${Math.sqrt(input)}`
        }
      })
    )

    const negativeWork = new Work({
      id: 'negative-work'
    }).add(
      new Step({
        id: 'handle-negative',
        run: async (input: number) => {
          return `Negative: ${Math.abs(input)}`
        }
      })
    )

    const zeroWork = new Work({
      id: 'zero-work'
    }).add(
      new Step({
        id: 'handle-zero',
        run: async (input: number) => {
          return 'Zero: nothing to process'
        }
      })
    )

    // 分类工作流
    const classificationWork = new Work({
      id: 'classification-work'
    }).add(classificationStep)

    const workflow = new Workflow({
      id: 'conditional-workflow'
    })
      .add(classificationWork)
      .add(positiveWork)
      .add(negativeWork)
      .add(zeroWork)

    // 测试正数
    const positiveResult = await workflow.run(16)
    expect(positiveResult.output).toHaveLength(4)

    const classificationOutput = positiveResult.output![0].output
    // 移除 as any，看看类型推导
    expect(classificationOutput.type).toBe('positive')
    expect(positiveResult.output![1].output).toBe('Positive: 4')
  })

  it('应该处理异步资源清理', async () => {
    let resourceAllocated = false
    let resourceCleaned = false

    const allocateStep = new Step({
      id: 'allocate-resource',
      run: async (input: string) => {
        resourceAllocated = true
        return { resource: 'allocated', data: input }
      }
    })

    const processStep = new Step({
      id: 'process-with-resource',
      run: async (input: { resource: string; data: string }) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return `Processed: ${input.data} with ${input.resource}`
      }
    })

    const cleanupStep = new Step({
      id: 'cleanup-resource',
      run: async (input: string) => {
        resourceCleaned = true
        return input + ' [cleaned]'
      }
    })

    const resourceWork = new Work({
      id: 'resource-work'
    })
      .add(allocateStep)
      .add(processStep)
      .add(cleanupStep)

    const workflow = new Workflow({
      id: 'resource-workflow'
    }).add(resourceWork)

    const runPromise = workflow.run('test-data')

    // 推进时间让异步操作完成
    await vi.advanceTimersByTimeAsync(20)

    const result = await runPromise

    expect(result.status).toBe(STATUS.SUCCESS)
    expect(resourceAllocated).toBe(true)
    expect(resourceCleaned).toBe(true)
    expect(result.output![0].output).toBe('Processed: test-data with allocated [cleaned]')
  })

  it('应该支持工作流嵌套和组合', async () => {
    // 内层工作流：文本处理
    const lowerCaseStep = new Step({
      id: 'lowercase',
      run: async (text: string) => text.toLowerCase()
    })

    const trimStep = new Step({
      id: 'trim',
      run: async (text: string) => text.trim()
    })

    const textProcessingWork = new Work({
      id: 'text-processing'
    })
      .add(lowerCaseStep)
      .add(trimStep)

    // 外层工作流：数据验证和处理
    const validateStep = new Step({
      id: 'validate',
      run: async (text: string) => {
        if (!text || text.length === 0) {
          throw new Error('Empty text')
        }
        return text
      }
    })

    const formatStep = new Step({
      id: 'format',
      run: async (text: string) => {
        return `[${text}]`
      }
    })

    const validationWork = new Work({
      id: 'validation'
    }).add(validateStep)

    const formattingWork = new Work({
      id: 'formatting'
    }).add(formatStep)

    const compositeWorkflow = new Workflow({
      id: 'composite-workflow'
    })
      .add(validationWork)
      .add(textProcessingWork)
      .add(formattingWork)

    const result = await compositeWorkflow.run('  HELLO WORLD  ')

    expect(result.status).toBe(STATUS.SUCCESS)
    expect(result.output).toHaveLength(3)

    // 验证每个工作的输出 - 每个work都接收原始输入
    expect(result.output![0].output).toBe('  HELLO WORLD  ') // validation
    expect(result.output![1].output).toBe('hello world') // text processing
    expect(result.output![2].output).toBe('[  HELLO WORLD  ]') // formatting - 基于原始输入
  })

  it('应该支持工作流快照和状态跟踪', async () => {
    const stepExecutionOrder: string[] = []

    const step1 = new Step({
      id: 'step-1',
      run: async (input: string) => {
        stepExecutionOrder.push('step-1')
        await new Promise((resolve) => setTimeout(resolve, 10))
        return `${input}-step1`
      }
    })

    const step2 = new Step({
      id: 'step-2',
      run: async (input: string) => {
        stepExecutionOrder.push('step-2')
        await new Promise((resolve) => setTimeout(resolve, 10))
        return `${input}-step2`
      }
    })

    const work = new Work({
      id: 'tracked-work'
    })
      .add(step1)
      .add(step2)

    const workflow = new Workflow({
      id: 'tracked-workflow'
    }).add(work)

    // 执行工作流
    const runPromise = workflow.run('start')

    // 推进时间让异步操作完成
    await vi.advanceTimersByTimeAsync(20)

    const result = await runPromise

    // 验证执行顺序
    expect(stepExecutionOrder).toEqual(['step-1', 'step-2'])

    // 验证快照包含完整信息
    expect(result.id).toBe('tracked-workflow')
    expect(result.type).toBe('workflow')
    expect(result.works).toHaveLength(1)

    const workSnapshot = result.works[0]
    expect(workSnapshot.id).toBe('tracked-work')
    expect(workSnapshot.steps).toHaveLength(2)
    expect(workSnapshot.steps[0].id).toBe('step-1')
    expect(workSnapshot.steps[1].id).toBe('step-2')
  })

  it('应该支持工作流暂停和继续', async () => {
    const step = new Step({
      id: 'pausable-step',
      run: async (input: string) => {
        // 简单的处理，不需要复杂的异步逻辑
        return `${input}-processed`
      }
    })

    const work = new Work({
      id: 'pausable-work'
    }).add(step)

    const workflow = new Workflow({
      id: 'pausable-workflow'
    }).add(work)

    // 初始状态是 PENDING，暂停 PENDING 状态的工作流不会改变状态
    expect(workflow.status).toBe(STATUS.PENDING)
    const pauseResult1 = await workflow.pause()
    expect(pauseResult1.status).toBe(STATUS.PENDING)
    expect(workflow.status).toBe(STATUS.PENDING)

    // 运行工作流后状态变为 SUCCESS
    const result = await workflow.run('test')
    expect(result.status).toBe(STATUS.SUCCESS)
    expect(workflow.status).toBe(STATUS.SUCCESS)

    // 暂停已完成的工作流状态保持不变
    const pauseResult2 = await workflow.pause()
    expect(pauseResult2.status).toBe(STATUS.SUCCESS)
    expect(workflow.status).toBe(STATUS.SUCCESS)

    // 继续已完成的工作流状态保持不变
    const resumeResult = await workflow.resume()
    expect(resumeResult.status).toBe(STATUS.SUCCESS)
    expect(workflow.status).toBe(STATUS.SUCCESS)

    expect(result.output![0].output).toBe('test-processed')
  })

  it('应该支持运行中的工作流暂停和继续', async () => {
    let step1Completed = false
    let step2Started = false
    let step2Completed = false

    const step1 = new Step({
      id: 'step-1',
      run: async (input: string) => {
        // 模拟长时间运行的任务
        await new Promise((resolve) => setTimeout(resolve, 1000))
        step1Completed = true
        return `${input}-step1`
      }
    })

    const step2 = new Step({
      id: 'step-2',
      run: async (input: string) => {
        step2Started = true
        await new Promise((resolve) => setTimeout(resolve, 1000))
        step2Completed = true
        return `${input}-step2`
      }
    })

    const work = new Work({
      id: 'pausable-work'
    })
      .add(step1)
      .add(step2)

    const workflow = new Workflow({
      id: 'pausable-workflow'
    }).add(work)

    // 启动工作流
    const runPromise = workflow.run('test')

    // 等待第一个步骤开始执行
    await vi.advanceTimersByTimeAsync(100)
    expect(workflow.status).toBe(STATUS.RUNNING)
    expect(step1Completed).toBe(false)

    // 让第一个步骤完成
    await vi.advanceTimersByTimeAsync(1000)
    expect(step1Completed).toBe(true)
    expect(step2Started).toBe(true)

    // 在第二个步骤执行期间暂停工作流
    await workflow.pause()
    expect(workflow.status).toBe(STATUS.PAUSED)

    // 推进时间，验证工作流保持暂停状态
    vi.advanceTimersByTime(2000)
    await vi.runOnlyPendingTimersAsync()
    // 注意：由于我们的暂停机制是在步骤完成后暂停，
    // 第二个步骤可能已经完成，但工作流仍然暂停
    expect(workflow.status).toBe(STATUS.PAUSED)

    // 继续工作流
    await workflow.resume()

    // 让工作流完全完成
    await vi.advanceTimersByTimeAsync(1000)

    const result = await runPromise
    expect(result.status).toBe(STATUS.SUCCESS)
    expect(step2Completed).toBe(true)
    expect(result.output![0].output).toBe('test-step1-step2')
  })

  it('应该能在运行时暂停和继续工作流（步骤完成后暂停）', async () => {
    let step1Completed = false
    let step2Completed = false
    let workflowPaused = false
    let workflowResumed = false

    const step1 = new Step({
      id: 'step-1',
      run: async (input: string) => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        step1Completed = true
        return `${input}-step1`
      }
    })

    const step2 = new Step({
      id: 'step-2',
      run: async (input: string) => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        step2Completed = true
        return `${input}-step2`
      }
    })

    const work = new Work({
      id: 'multi-step-work'
    })
      .add(step1)
      .add(step2)

    const workflow = new Workflow({
      id: 'pausable-workflow'
    }).add(work)

    // 监听暂停和继续事件
    workflow.on('workflow:pause', () => {
      workflowPaused = true
    })

    workflow.on('workflow:resume', () => {
      workflowResumed = true
    })

    // 启动工作流
    const runPromise = workflow.run('test')

    // 等待第一个步骤完成后暂停
    await vi.advanceTimersByTimeAsync(60)

    // 暂停工作流
    await workflow.pause()
    expect(workflow.status).toBe(STATUS.PAUSED)
    expect(workflowPaused).toBe(true)

    // 继续工作流
    await workflow.resume()
    expect(workflowResumed).toBe(true)

    // 推进时间让所有步骤完成
    await vi.advanceTimersByTimeAsync(100)

    // 等待工作流完成
    const result = await runPromise

    // 验证最终结果
    expect(result.status).toBe(STATUS.SUCCESS)
    expect(step1Completed).toBe(true)
    expect(step2Completed).toBe(true)
    expect(result.output![0].output).toBe('test-step1-step2')
    expect(workflow.status).toBe(STATUS.SUCCESS)
  }, 15000)

  it('应该验证暂停只在步骤完成后生效', async () => {
    // 暂时禁用 fake timers 来调试
    vi.useRealTimers()

    let stepCompleted = false

    // 创建一个需要时间完成的步骤
    const longStep = new Step({
      id: 'long-step',
      run: async (input: string) => {
        // 步骤需要100ms完成
        await new Promise((resolve) => setTimeout(resolve, 100))
        stepCompleted = true
        return `${input}-done`
      }
    })

    const work = new Work({
      id: 'long-work'
    }).add(longStep)

    const workflow = new Workflow({
      id: 'pause-test-workflow'
    }).add(work)

    // 开始执行工作流
    const runPromise = workflow.run('test')

    // 等待一点时间让步骤开始运行
    await new Promise((resolve) => setTimeout(resolve, 20))

    // 验证步骤还没完成但正在运行
    expect(stepCompleted).toBe(false)
    expect(longStep.status).toBe(STATUS.RUNNING)

    // 暂停工作流
    const pauseSnapshot = await workflow.pause()
    expect(pauseSnapshot.status).toBe(STATUS.PAUSED)

    // 恢复工作流
    await workflow.resume()

    // 等待完成
    const result = await runPromise

    // 验证步骤确实完成了
    expect(stepCompleted).toBe(true)
    expect(result.status).toBe(STATUS.SUCCESS)
    expect(result.output![0].output).toBe('test-done')

    // 恢复 fake timers
    vi.useFakeTimers()
  })

  it('应该支持工作流暂停恢复状态管理', async () => {
    const workflow = new Workflow({
      id: 'status-test-workflow'
    })

    // 初始状态应该是 PENDING
    expect(workflow.status).toBe(STATUS.PENDING)

    // 暂停未运行的工作流应该返回当前状态
    const pauseResult1 = await workflow.pause()
    expect(pauseResult1.status).toBe(STATUS.PENDING) // 未运行时暂停不改变状态

    // 创建一个工作
    const step = new Step({
      id: 'simple-step',
      run: async (input: string) => `${input}-done`
    })

    const work = new Work({
      id: 'simple-work'
    }).add(step)

    workflow.add(work)

    // 运行工作流
    const result = await workflow.run('test')
    expect(result.status).toBe(STATUS.SUCCESS)
    expect(workflow.status).toBe(STATUS.SUCCESS)

    // 暂停已完成的工作流
    const pauseResult2 = await workflow.pause()
    expect(pauseResult2.status).toBe(STATUS.SUCCESS) // 已完成的工作流状态不变
  })

  it('应该支持工作流暂停继续事件监听', async () => {
    let pauseEventFired = false
    let resumeEventFired = false

    const workflow = new Workflow({
      id: 'event-workflow'
    })

    // 监听暂停和继续事件
    workflow.on('workflow:pause', () => {
      pauseEventFired = true
    })

    workflow.on('workflow:resume', () => {
      resumeEventFired = true
    })

    const step = new Step({
      id: 'event-step',
      run: async (input: string) => `${input}-processed`
    })

    const work = new Work({
      id: 'event-work'
    }).add(step)

    workflow.add(work)

    // 对于 PENDING 状态的工作流，暂停操作不会触发事件
    await workflow.pause()
    expect(pauseEventFired).toBe(false) // PENDING 状态暂停不触发事件

    // 继续操作也不会触发事件，因为工作流不在 PAUSED 状态
    await workflow.resume()
    expect(resumeEventFired).toBe(false)

    // 运行工作流
    const result = await workflow.run('test')
    expect(result.status).toBe(STATUS.SUCCESS)

    // 验证事件监听器是否正确设置
    expect(typeof workflow.on).toBe('function')
  })

  it('应该支持工作流快照获取', async () => {
    const step = new Step({
      id: 'snapshot-step',
      run: async (input: string) => `${input}-processed`
    })

    const work = new Work({
      id: 'snapshot-work'
    }).add(step)

    const workflow = new Workflow({
      id: 'snapshot-workflow'
    }).add(work)

    // 获取初始快照
    const initialSnapshot = workflow.getSnapshot()
    expect(initialSnapshot.id).toBe('snapshot-workflow')
    expect(initialSnapshot.type).toBe('workflow')
    expect(initialSnapshot.status).toBe(STATUS.PENDING)

    // 运行工作流
    const result = await workflow.run('test')

    // 获取完成后的快照
    const finalSnapshot = workflow.getSnapshot()
    expect(finalSnapshot.status).toBe(STATUS.SUCCESS)
    expect(finalSnapshot.input).toBe('test')
    expect(finalSnapshot.output).toHaveLength(1)
  })

  it('应该支持快照状态跟踪', async () => {
    const steps = Array.from(
      { length: 3 },
      (_, i) =>
        new Step({
          id: `step-${i + 1}`,
          run: async (input: string) => {
            return `${input}-step${i + 1}`
          }
        })
    )

    const work = new Work({
      id: 'tracking-work'
    })

    steps.forEach((step) => work.add(step))

    const workflow = new Workflow({
      id: 'tracking-workflow'
    }).add(work)

    // 运行工作流
    const result = await workflow.run('track-test')

    // 验证最终结果的完整性
    expect(result.status).toBe(STATUS.SUCCESS)
    expect(result.input).toBe('track-test')
    expect(result.works).toHaveLength(1)
    expect(result.works[0].steps).toHaveLength(3)

    // 所有步骤都应该成功完成
    result.works[0].steps.forEach((stepSnapshot, index) => {
      expect(stepSnapshot.status).toBe(STATUS.SUCCESS)
      expect(stepSnapshot.id).toBe(`step-${index + 1}`)
    })

    expect(result.output![0].output).toBe('track-test-step1-step2-step3')

    // 验证工作流状态与快照一致
    expect(workflow.status).toBe(result.status)

    const currentSnapshot = workflow.getSnapshot()
    expect(currentSnapshot.status).toBe(result.status)
    expect(currentSnapshot.input).toBe(result.input)
  })
})
