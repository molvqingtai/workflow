import { describe, it, expect } from 'vitest'
import { Workflow, Work, Step, RUN_STATUS } from 'workflow'

describe('完整流程集成测试', () => {
  describe('Workflow到Step的完整执行流程', () => {
    it('应该能够完整执行Workflow→Work→Step流程', async () => {
      const step1 = new Step({
        id: 'step-1',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return input * 2
        }
      })

      const step2 = new Step({
        id: 'step-2',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return input + 10
        }
      })

      const work = new Work({
        id: 'integration-work',
        steps: [step1, step2]
      })

      const workflow = new Workflow({
        id: 'integration-workflow',
        works: [work]
      })

      expect(workflow.status).toBe(RUN_STATUS.PENDING)
      expect(workflow.getSnapshot().status).toBe(RUN_STATUS.PENDING)
      const result = await workflow.start(5)

      // 验证完整执行结果
      expect(result.status).toBe(RUN_STATUS.SUCCESS)
      expect(result.input).toBe(5)
      expect(result.output).toHaveLength(1)
      expect(result.works[0].output).toBe(20) // (5 * 2) + 10

      // 验证Step级别的状态
      expect(step1.status).toBe(RUN_STATUS.SUCCESS)
      expect(step1.input).toBe(5)
      expect(step1.output).toBe(10)

      expect(step2.status).toBe(RUN_STATUS.SUCCESS)
      expect(step2.input).toBe(10)
      expect(step2.output).toBe(20)
    })

    it('应该能够暂停整个Workflow并影响到所有Step', async () => {
      let step1Started = false
      let step2Started = false

      const step1 = new Step({
        id: 'pause-step-1',
        run: async (input: number) => {
          step1Started = true
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      })

      const step2 = new Step({
        id: 'pause-step-2',
        run: async (input: number) => {
          step2Started = true
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input + 5
        }
      })

      const work = new Work({
        id: 'pause-work',
        steps: [step1, step2]
      })

      const workflow = new Workflow({
        id: 'pause-workflow',
        works: [work]
      })

      // 开始执行
      const runPromise = workflow.start(10)

      // 等待执行开始
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(step1Started).toBe(true)

      // 暂停workflow
      const pauseResult = await workflow.pause()
      expect(pauseResult.status).toBe(RUN_STATUS.PAUSED)

      // 验证所有组件都被暂停
      expect(work.status).toBe(RUN_STATUS.PAUSED)
      expect(step1.status).toBe(RUN_STATUS.PAUSED)

      // 恢复执行
      const resumeResult = await workflow.resume()
      expect(resumeResult.status).toBe(RUN_STATUS.RUNNING)

      // 等待执行完成
      const finalResult = await runPromise
      expect(finalResult.status).toBe(RUN_STATUS.SUCCESS)
      expect(finalResult.works[0].output).toBe(25) // (10 * 2) + 5
    })

    it('应该能够从快照数据重建完整的Workflow状态', async () => {
      // 创建一个执行过的workflow的快照数据
      const workflowSnapshot = {
        id: 'restored-workflow',
        name: 'Restored Workflow',
        description: 'A workflow restored from snapshot',
        type: 'workflow' as const,
        status: 'success' as const,
        input: 100,
        output: [{ status: 'success', output: 250 }],
        works: [
          {
            id: 'restored-work',
            name: 'Restored Work',
            type: 'work' as const,
            status: 'success' as const,
            input: 100,
            output: 250,
            steps: [
              {
                id: 'restored-step-1',
                name: 'Restored Step 1',
                type: 'step' as const,
                status: 'success' as const,
                input: 100,
                output: 200
              },
              {
                id: 'restored-step-2',
                name: 'Restored Step 2',
                type: 'step' as const,
                status: 'success' as const,
                input: 200,
                output: 250
              }
            ]
          }
        ]
      }

      // 从快照重建workflow
      const restoredStep1 = new Step({
        id: 'restored-step-1',
        name: 'Restored Step 1',
        status: 'success',
        input: 100,
        output: 200,
        run: async (input: number) => input * 2
      })

      const restoredStep2 = new Step({
        id: 'restored-step-2',
        name: 'Restored Step 2',
        status: 'success',
        input: 200,
        output: 250,
        run: async (input: number) => input + 50
      })

      const restoredWork = new Work({
        id: 'restored-work',
        name: 'Restored Work',
        status: 'success',
        input: 100,
        output: 250,
        steps: [restoredStep1, restoredStep2]
      })

      const restoredWorkflow = new Workflow({
        id: 'restored-workflow',
        name: 'Restored Workflow',
        description: 'A workflow restored from snapshot',
        status: 'success',
        input: 100,
        output: [{ status: 'success', output: 250 }],
        works: [restoredWork]
      })

      // 验证恢复的状态
      expect(restoredWorkflow.status).toBe('success')
      expect(restoredWorkflow.input).toBe(100)
      expect(restoredWorkflow.works).toHaveLength(1)
      expect(restoredWorkflow.works[0].status).toBe('success')
      expect(restoredWorkflow.works[0].output).toBe(250)

      // 验证Step级别的状态恢复
      expect(restoredStep1.status).toBe('success')
      expect(restoredStep1.input).toBe(100)
      expect(restoredStep1.output).toBe(200)

      expect(restoredStep2.status).toBe('success')
      expect(restoredStep2.input).toBe(200)
      expect(restoredStep2.output).toBe(250)

      // 验证能够生成正确的快照
      const currentSnapshot = restoredWorkflow.getSnapshot()
      expect(currentSnapshot.id).toBe(workflowSnapshot.id)
      expect(currentSnapshot.status).toBe(workflowSnapshot.status)
      expect(currentSnapshot.works).toHaveLength(1)
      expect(currentSnapshot.works[0].steps).toHaveLength(2)
    })

    it('应该能够处理执行中的错误并正确传播', async () => {
      const errorStep = new Step({
        id: 'error-step',
        run: async (input: number) => {
          throw new Error('Step execution failed')
        }
      })

      const normalStep = new Step({
        id: 'normal-step',
        run: async (input: number) => input * 2
      })

      const work = new Work({
        id: 'error-work',
        steps: [normalStep, errorStep] // error在第二个step
      })

      const workflow = new Workflow({
        id: 'error-workflow',
        works: [work]
      })

      // 执行应该失败
      await expect(workflow.start(10)).rejects.toThrow('Step execution failed')

      // 验证错误状态传播
      expect(workflow.status).toBe(RUN_STATUS.FAILED)
      expect(work.status).toBe(RUN_STATUS.FAILED)
      expect(errorStep.status).toBe(RUN_STATUS.FAILED)

      // 第一个step应该成功执行
      expect(normalStep.status).toBe(RUN_STATUS.SUCCESS)
      expect(normalStep.output).toBe(20)
    })
  })

  describe('多Work并行执行测试', () => {
    it('应该能够并行执行多个Work', async () => {
      const work1Step = new Step({
        id: 'work1-step',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 3
        }
      })

      const work2Step = new Step({
        id: 'work2-step',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return input + 100
        }
      })

      const work1 = new Work({
        id: 'parallel-work-1',
        steps: [work1Step]
      })

      const work2 = new Work({
        id: 'parallel-work-2',
        steps: [work2Step]
      })

      const workflow = new Workflow({
        id: 'parallel-workflow',
        works: [work1, work2]
      })

      const startTime = Date.now()
      const result = await workflow.start(10)
      const endTime = Date.now()

      // 验证并行执行（应该接近100ms而不是150ms）
      const executionTime = endTime - startTime
      expect(executionTime).toBeLessThan(130) // 给一些余量

      // 验证结果
      expect(result.status).toBe(RUN_STATUS.SUCCESS)
      expect(result.output).toHaveLength(2)
      expect(work1.output).toBe(30) // 10 * 3
      expect(work2.output).toBe(110) // 10 + 100
    })

    it('应该能够处理部分Work失败的情况', async () => {
      const successStep = new Step({
        id: 'success-step',
        run: async (input: number) => input * 2
      })

      const errorStep = new Step({
        id: 'error-step-2',
        run: async (input: number) => {
          throw new Error('Work 2 failed')
        }
      })

      const work1 = new Work({
        id: 'success-work',
        steps: [successStep]
      })

      const work2 = new Work({
        id: 'error-work-2',
        steps: [errorStep]
      })

      const workflow = new Workflow({
        id: 'partial-error-workflow',
        works: [work1, work2]
      })

      await expect(workflow.start(5)).rejects.toThrow()

      // workflow应该失败
      expect(workflow.status).toBe(RUN_STATUS.FAILED)

      // 成功的work应该完成
      expect(work1.status).toBe(RUN_STATUS.SUCCESS)
      expect(successStep.status).toBe(RUN_STATUS.SUCCESS)
      expect(successStep.output).toBe(10)

      // 失败的work应该失败
      expect(work2.status).toBe(RUN_STATUS.FAILED)
      expect(errorStep.status).toBe(RUN_STATUS.FAILED)
    })
  })

  describe('事件传播完整性测试', () => {
    it('应该能够正确传播所有层级的事件', async () => {
      const allEvents: string[] = []

      const step = new Step({
        id: 'event-step',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return input * 2
        }
      })

      const work = new Work({
        id: 'event-work',
        steps: [step]
      })

      const workflow = new Workflow({
        id: 'event-workflow',
        works: [work]
      })

      // 监听所有层级的事件
      workflow.on('workflow:start', () => allEvents.push('workflow:start'))
      workflow.on('workflow:success', () => allEvents.push('workflow:success'))
      workflow.on('work:start', () => allEvents.push('work:start'))
      workflow.on('work:success', () => allEvents.push('work:success'))
      workflow.on('step:start', () => allEvents.push('step:start'))
      workflow.on('step:success', () => allEvents.push('step:success'))

      await workflow.start(10)

      // 验证事件触发顺序和完整性
      expect(allEvents).toEqual([
        'workflow:start',
        'work:start',
        'step:start',
        'step:success',
        'work:success',
        'workflow:success'
      ])
    })

    it('应该能够正确传播暂停/恢复事件', async () => {
      const pauseResumeEvents: string[] = []

      const step = new Step({
        id: 'pause-resume-step',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      })

      const work = new Work({
        id: 'pause-resume-work',
        steps: [step]
      })

      const workflow = new Workflow({
        id: 'pause-resume-workflow',
        works: [work]
      })

      // 监听暂停/恢复事件
      workflow.on('workflow:pause', () => pauseResumeEvents.push('workflow:pause'))
      workflow.on('workflow:resume', () => pauseResumeEvents.push('workflow:resume'))
      workflow.on('work:pause', () => pauseResumeEvents.push('work:pause'))
      workflow.on('work:resume', () => pauseResumeEvents.push('work:resume'))
      workflow.on('step:pause', () => pauseResumeEvents.push('step:pause'))
      workflow.on('step:resume', () => pauseResumeEvents.push('step:resume'))

      const runPromise = workflow.start(10)

      await new Promise((resolve) => setTimeout(resolve, 50))
      await workflow.pause()
      await workflow.resume()
      await runPromise

      // 验证暂停/恢复事件传播
      expect(pauseResumeEvents).toContain('step:pause')
      expect(pauseResumeEvents).toContain('work:pause')
      expect(pauseResumeEvents).toContain('workflow:pause')
      expect(pauseResumeEvents).toContain('step:resume')
      expect(pauseResumeEvents).toContain('work:resume')
      expect(pauseResumeEvents).toContain('workflow:resume')
    })
  })

  describe('暂停→快照恢复→继续执行流程', () => {
    it('应该能够在暂停后从快照恢复并继续执行', async () => {
      // 第一阶段：创建并执行workflow，然后暂停
      const step1 = new Step({
        id: 'resume-step-1',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      })

      const step2 = new Step({
        id: 'resume-step-2',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input + 10
        }
      })

      const work = new Work({
        id: 'resume-work',
        steps: [step1, step2]
      })

      const originalWorkflow = new Workflow({
        id: 'resume-workflow',
        name: 'Resume Test Workflow',
        works: [work]
      })

      // 开始执行并暂停
      const runPromise = originalWorkflow.start(50)
      await new Promise((resolve) => setTimeout(resolve, 50)) // 等待第一个step开始

      // 暂停
      await originalWorkflow.pause()
      expect(originalWorkflow.status).toBe(RUN_STATUS.PAUSED)
      expect(work.status).toBe(RUN_STATUS.PAUSED)
      expect(step1.status).toBe(RUN_STATUS.PAUSED)

      // 获取暂停时的快照
      const pausedSnapshot = originalWorkflow.getSnapshot()
      expect(pausedSnapshot.status).toBe('paused')
      expect(pausedSnapshot.input).toBe(50)

      // 第二阶段：模拟页面刷新，使用真实快照恢复workflow
      // 从快照恢复时，paused状态应该转换为pending状态
      const convertStatusToPending = (status: string) => (status === 'paused' ? 'pending' : status)

      const restoredStep1 = new Step({
        id: pausedSnapshot.works[0].steps[0].id,
        name: pausedSnapshot.works[0].steps[0].name,
        status: convertStatusToPending(pausedSnapshot.works[0].steps[0].status) as any,
        input: pausedSnapshot.works[0].steps[0].input,
        output: pausedSnapshot.works[0].steps[0].output,
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      })

      const restoredStep2 = new Step({
        id: pausedSnapshot.works[0].steps[1].id,
        name: pausedSnapshot.works[0].steps[1].name,
        status: convertStatusToPending(pausedSnapshot.works[0].steps[1].status) as any,
        input: pausedSnapshot.works[0].steps[1].input,
        output: pausedSnapshot.works[0].steps[1].output,
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input + 10
        }
      })

      const restoredWork = new Work({
        id: pausedSnapshot.works[0].id,
        name: pausedSnapshot.works[0].name,
        status: convertStatusToPending(pausedSnapshot.works[0].status) as any,
        input: pausedSnapshot.works[0].input,
        output: pausedSnapshot.works[0].output,
        steps: [restoredStep1, restoredStep2]
      })

      const restoredWorkflow = new Workflow({
        id: pausedSnapshot.id,
        name: pausedSnapshot.name,
        status: convertStatusToPending(pausedSnapshot.status) as any,
        input: pausedSnapshot.input,
        output: pausedSnapshot.output,
        works: [restoredWork]
      })

      // 验证恢复的状态 - paused状态应该转换为pending
      expect(restoredWorkflow.status).toBe('pending')
      expect(restoredWork.status).toBe('pending')
      expect(restoredStep1.status).toBe('pending')

      // 第三阶段：重新执行workflow
      const finalResult = await restoredWorkflow.start(50)

      // 验证最终结果
      expect(finalResult.status).toBe(RUN_STATUS.SUCCESS)
      expect(restoredWork.output).toBe(110) // (50 * 2) + 10
      expect(restoredStep1.status).toBe(RUN_STATUS.SUCCESS)
      expect(restoredStep1.output).toBe(100)
      expect(restoredStep2.status).toBe(RUN_STATUS.SUCCESS)
      expect(restoredStep2.output).toBe(110)
    })

    it('应该能够处理执行中暂停的复杂场景', async () => {
      let step1Executed = false
      let step2Executed = false
      let step3Executed = false

      const step1 = new Step({
        id: 'complex-step-1',
        run: async (input: number) => {
          step1Executed = true
          return input * 2
        }
      })

      const step2 = new Step({
        id: 'complex-step-2',
        run: async (input: number) => {
          step2Executed = true
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input + 20
        }
      })

      const step3 = new Step({
        id: 'complex-step-3',
        run: async (input: number) => {
          step3Executed = true
          return input / 2
        }
      })

      const work = new Work({
        id: 'complex-resume-work',
        steps: [step1, step2, step3]
      })

      const workflow = new Workflow({
        id: 'complex-resume-workflow',
        works: [work]
      })

      // 开始执行
      const runPromise = workflow.start(10)

      // 等待第一个step完成，第二个step开始
      await new Promise((resolve) => setTimeout(resolve, 50))

      // 此时step1应该完成，step2正在执行
      expect(step1Executed).toBe(true)
      expect(step1.status).toBe(RUN_STATUS.SUCCESS)
      expect(step1.output).toBe(20)

      // 暂停
      await workflow.pause()
      expect(workflow.status).toBe(RUN_STATUS.PAUSED)

      // 获取快照用于恢复
      const midExecutionSnapshot = workflow.getSnapshot()

      // 验证快照包含了已完成的step1状态
      expect(midExecutionSnapshot.works[0].steps[0].status).toBe('success')
      expect(midExecutionSnapshot.works[0].steps[0].output).toBe(20)
      expect(midExecutionSnapshot.works[0].steps[1].status).toBe('paused')
      expect(midExecutionSnapshot.works[0].steps[2].status).toBe('pending')

      // 使用真实快照恢复 - success状态保持，paused状态改为pending
      const convertStatusToPending = (status: string) => (status === 'paused' ? 'pending' : status)

      const recoveredStep1 = new Step({
        id: midExecutionSnapshot.works[0].steps[0].id,
        name: midExecutionSnapshot.works[0].steps[0].name,
        status: convertStatusToPending(midExecutionSnapshot.works[0].steps[0].status) as any,
        input: midExecutionSnapshot.works[0].steps[0].input,
        output: midExecutionSnapshot.works[0].steps[0].output,
        run: async (input: number) => input * 2
      })

      const recoveredStep2 = new Step({
        id: midExecutionSnapshot.works[0].steps[1].id,
        name: midExecutionSnapshot.works[0].steps[1].name,
        status: convertStatusToPending(midExecutionSnapshot.works[0].steps[1].status) as any,
        input: midExecutionSnapshot.works[0].steps[1].input,
        output: midExecutionSnapshot.works[0].steps[1].output,
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input + 20
        }
      })

      const recoveredStep3 = new Step({
        id: midExecutionSnapshot.works[0].steps[2].id,
        name: midExecutionSnapshot.works[0].steps[2].name,
        status: convertStatusToPending(midExecutionSnapshot.works[0].steps[2].status) as any,
        input: midExecutionSnapshot.works[0].steps[2].input,
        output: midExecutionSnapshot.works[0].steps[2].output,
        run: async (input: number) => input / 2
      })

      const recoveredWork = new Work({
        id: midExecutionSnapshot.works[0].id,
        name: midExecutionSnapshot.works[0].name,
        status: convertStatusToPending(midExecutionSnapshot.works[0].status) as any,
        input: midExecutionSnapshot.works[0].input,
        output: midExecutionSnapshot.works[0].output,
        steps: [recoveredStep1, recoveredStep2, recoveredStep3]
      })

      const recoveredWorkflow = new Workflow({
        id: midExecutionSnapshot.id,
        name: midExecutionSnapshot.name,
        status: convertStatusToPending(midExecutionSnapshot.status) as any,
        input: midExecutionSnapshot.input,
        output: midExecutionSnapshot.output,
        works: [recoveredWork]
      })

      // 验证恢复状态：success保持不变，paused转为pending
      expect(recoveredStep1.status).toBe('success') // 已完成的保持success
      expect(recoveredStep2.status).toBe('pending') // paused -> pending
      expect(recoveredStep3.status).toBe('pending') // 保持pending

      // 重新执行workflow
      const finalResult = await recoveredWorkflow.start(10)

      // 验证最终结果
      expect(finalResult.status).toBe(RUN_STATUS.SUCCESS)
      expect(recoveredWork.output).toBe(20) // ((10 * 2) + 20) / 2 = 20

      // 验证所有步骤都正确执行
      expect(recoveredStep1.status).toBe(RUN_STATUS.SUCCESS)
      expect(recoveredStep1.output).toBe(20)
      expect(recoveredStep2.status).toBe(RUN_STATUS.SUCCESS)
      expect(recoveredStep2.output).toBe(40)
      expect(recoveredStep3.status).toBe(RUN_STATUS.SUCCESS)
      expect(recoveredStep3.output).toBe(20)
    })
  })

  describe('Stop功能集成测试', () => {
    it('应该能够停止正在运行的复杂workflow', async () => {
      const step1 = new Step({
        id: 'integration-stop-step1',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      })

      const step2 = new Step({
        id: 'integration-stop-step2',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input + 10
        }
      })

      const step3 = new Step({
        id: 'integration-stop-step3',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 3
        }
      })

      const work1 = new Work({
        id: 'integration-stop-work1',
        steps: [step1, step2]
      })

      const work2 = new Work({
        id: 'integration-stop-work2',
        steps: [step3]
      })

      const workflow = new Workflow({
        id: 'integration-stop-workflow',
        works: [work1, work2]
      })

      // 监听所有层级的stop事件
      const stopEvents: string[] = []
      workflow.on('workflow:stop', () => stopEvents.push('workflow:stop'))
      workflow.on('work:stop', () => stopEvents.push('work:stop'))
      workflow.on('step:stop', () => stopEvents.push('step:stop'))

      // 开始执行
      const runPromise = workflow.start(5)
      await new Promise((resolve) => setTimeout(resolve, 50))

      // 停止正在运行的workflow
      await workflow.stop()

      // 验证所有组件都被停止
      expect(workflow.status).toBe(RUN_STATUS.STOPPED)
      expect(work1.status).toBe(RUN_STATUS.STOPPED)
      expect(work2.status).toBe(RUN_STATUS.STOPPED)
      // 只有正在运行或暂停的step会被停止
      // step2和step3可能还没开始运行，所以状态可能不变

      // 验证stop事件被正确触发
      expect(stopEvents).toContain('workflow:stop')
      expect(stopEvents).toContain('work:stop')
      // step可能没有触发stop事件，因为它必须在RUNNING或PAUSED状态才能被停止

      // 不等待被停止的执行，因为它会永远等待
    })

    it('应该能够停止特定的正在运行的Work', async () => {
      const step1 = new Step({
        id: 'selective-stop-step1',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 200))
          return input * 2
        }
      })

      const step2 = new Step({
        id: 'selective-stop-step2',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return input + 10
        }
      })

      const work1 = new Work({
        id: 'selective-stop-work1',
        steps: [step1]
      })

      const work2 = new Work({
        id: 'selective-stop-work2',
        steps: [step2]
      })

      const workflow = new Workflow({
        id: 'selective-stop-workflow',
        works: [work1, work2]
      })

      // 开始执行
      const runPromise = workflow.start(5)
      await new Promise((resolve) => setTimeout(resolve, 100))

      // 只停止work1
      await work1.stop()

      // 验证work1和其step被停止
      expect(work1.status).toBe(RUN_STATUS.STOPPED)
      expect(step1.status).toBe(RUN_STATUS.STOPPED)

      // work2应该继续执行并完成
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(work2.status).toBe(RUN_STATUS.SUCCESS)
      expect(step2.status).toBe(RUN_STATUS.SUCCESS)

      // 不等待被停止的执行，因为它会永远等待
    })

    it('不能停止已完成的组件', async () => {
      const step = new Step({
        id: 'completed-step',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return input * 2
        }
      })

      const work = new Work({
        id: 'completed-work',
        steps: [step]
      })

      const workflow = new Workflow({
        id: 'completed-workflow',
        works: [work]
      })

      // 第一次执行并完成
      await workflow.start(5)
      expect(workflow.status).toBe(RUN_STATUS.SUCCESS)
      expect(step.output).toBe(10)

      // 尝试停止已完成的workflow（应该无操作）
      await workflow.stop()
      expect(workflow.status).toBe(RUN_STATUS.SUCCESS) // Workflow已完成，不能停止
      expect(work.status).toBe(RUN_STATUS.SUCCESS) // Work已完成，不能停止
      expect(step.status).toBe(RUN_STATUS.SUCCESS) // Step不能从SUCCESS状态停止

      // 由于workflow状态仍然是SUCCESS，不能重新启动
      const secondResult = await workflow.start(10)
      expect(secondResult.status).toBe(RUN_STATUS.SUCCESS)
      expect(secondResult.works[0].output).toBe(10) // 原来的输出保持不变
      expect(step.output).toBe(10)
    })

    it('应该能够停止暂停中的Step', async () => {
      const step = new Step({
        id: 'pause-stop-step',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 200))
          return input * 2
        }
      })

      const work = new Work({
        id: 'pause-stop-work',
        steps: [step]
      })

      const workflow = new Workflow({
        id: 'pause-stop-workflow',
        works: [work]
      })

      // 开始执行
      const runPromise = workflow.start(5)

      // 等待执行开始然后暂停
      await new Promise((resolve) => setTimeout(resolve, 50))
      await workflow.pause()
      expect(workflow.status).toBe(RUN_STATUS.PAUSED)

      // 停止暂停中的workflow（现在Step也可以从PAUSED状态停止）
      await workflow.stop()
      expect(workflow.status).toBe(RUN_STATUS.STOPPED)
      expect(work.status).toBe(RUN_STATUS.STOPPED)
      expect(step.status).toBe(RUN_STATUS.STOPPED)

      // 不等待被停止的执行，因为它会永远等待
    })
  })
})
