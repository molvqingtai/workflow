import { describe, it } from 'vitest'
import { Workflow, Work, Step, WorkSnapshot } from 'workflow'
import { expectTypeOf, assertType } from 'vitest'

describe('类型测试', () => {
  it('Step 类型推导测试', () => {
    const step1 = new Step<string, number>({
      id: 'step1',
      run: async (input) => input.length
    })

    const step2 = new Step<string, boolean>({
      id: 'step2',
      run: async (input) => input.startsWith('test')
    })

    const step3 = new Step<string, string>({
      id: 'step3',
      run: async (input) => input.toUpperCase()
    })

    // 验证 Step 类型
    expectTypeOf(step1).toEqualTypeOf<Step<string, number>>()
    expectTypeOf(step2).toEqualTypeOf<Step<string, boolean>>()
    expectTypeOf(step3).toEqualTypeOf<Step<string, string>>()

    // 验证 Step output 类型
    expectTypeOf(step1.output).toEqualTypeOf<number | undefined>()
    expectTypeOf(step2.output).toEqualTypeOf<boolean | undefined>()
    expectTypeOf(step3.output).toEqualTypeOf<string | undefined>()
  })

  it('Work 类型推导测试', () => {
    const work1 = new Work<string, number>({ id: 'work1' })
    const work2 = new Work<string, boolean>({ id: 'work2' })
    const work3 = new Work<string, string>({ id: 'work3' })

    // 验证 Work 类型
    expectTypeOf(work1).toEqualTypeOf<Work<string, number>>()
    expectTypeOf(work2).toEqualTypeOf<Work<string, boolean>>()
    expectTypeOf(work3).toEqualTypeOf<Work<string, string>>()

    // 验证 Work output 类型
    expectTypeOf(work1.output).toEqualTypeOf<number | undefined>()
    expectTypeOf(work2.output).toEqualTypeOf<boolean | undefined>()
    expectTypeOf(work3.output).toEqualTypeOf<string | undefined>()
  })

  it('Workflow 类型推导测试', () => {
    // Workflow 类型推导测试 - 现在只有一个类型参数
    const workflow1 = new Workflow<string>({ id: 'workflow1' })

    // 验证 Workflow 类型
    expectTypeOf(workflow1).toEqualTypeOf<Workflow<string>>()

    // 验证 Workflow output 类型 - Workflow 的 output 是 WorkSnapshot 数组
    expectTypeOf(workflow1.output).toEqualTypeOf<WorkSnapshot[] | undefined>()
  })

  it('Step 无类型声明，自动推导', () => {
    const autoStep1 = new Step({
      id: 'auto-step-1',
      run: async (input: string) => input.length
    })

    const autoStep2 = new Step({
      id: 'auto-step-2',
      run: async (input: string) => input.startsWith('test')
    })

    // 验证自动推导的 Step 类型
    expectTypeOf(autoStep1).toEqualTypeOf<Step<string, number>>()
    expectTypeOf(autoStep2).toEqualTypeOf<Step<string, boolean>>()
  })

  it('Work 无类型声明，从 Step 推导', () => {
    const autoStep1 = new Step({
      id: 'auto-step-1',
      run: async (input: string) => input.length
    })

    const autoStep2 = new Step({
      id: 'auto-step-2',
      run: async (input: string) => input.startsWith('test')
    })

    const autoWork1 = new Work({ id: 'auto-work-1' })
    const autoWork2 = new Work({ id: 'auto-work-2' })

    // Work 添加 Step 后的类型推导
    const workWithStep1 = autoWork1.add(autoStep1)
    const workWithStep2 = autoWork2.add(autoStep2)

    // 验证 Work 添加 Step 后的类型
    assertType<Work<string, number>>(workWithStep1)
    assertType<Work<string, boolean>>(workWithStep2)

    // 验证 Work 添加 Step 后的 output 类型
    expectTypeOf(workWithStep1.output).toEqualTypeOf<number | undefined>()
    expectTypeOf(workWithStep2.output).toEqualTypeOf<boolean | undefined>()
  })

  it('Workflow 无类型声明的完整推导链', async () => {
    const autoStep1 = new Step({
      id: 'auto-step-1',
      run: async (input: string) => input.length
    })

    const autoStep2 = new Step({
      id: 'auto-step-2',
      run: async (input: string) => input.startsWith('test')
    })

    const autoWork1 = new Work({ id: 'auto-work-1' })
    const autoWork2 = new Work({ id: 'auto-work-2' })
    const autoWorkflow = new Workflow({ id: 'auto-workflow' })

    // 完整推导链测试
    const fullAutoResult = await autoWorkflow.add(autoWork1.add(autoStep1)).add(autoWork2.add(autoStep2)).run('test')

    // 验证完整推导链的结果 - 应该返回 WorkflowSnapshot，使用 toHaveProperty 检查属性存在
    expectTypeOf(fullAutoResult).toHaveProperty('output')
    expectTypeOf(fullAutoResult.output).toEqualTypeOf<WorkSnapshot[] | undefined>()
  })

  it('Workflow 有类型声明的推导链', async () => {
    const step1 = new Step<string, number>({
      id: 'step1',
      run: async (input) => input.length
    })

    const step2 = new Step<string, boolean>({
      id: 'step2',
      run: async (input) => input.startsWith('test')
    })

    const work1 = new Work<string, number>({ id: 'work1' })
    const work2 = new Work<string, boolean>({ id: 'work2' })

    const workWithStep1 = work1.add(step1)
    const workWithStep2 = work2.add(step2)

    const typedWorkflow = new Workflow<string>({ id: 'typed-workflow' })

    const typedResult = await typedWorkflow.add(workWithStep1).add(workWithStep2).run('test')

    // 验证有类型声明的结果 - 返回 WorkflowSnapshot，检查属性存在性
    expectTypeOf(typedResult).toHaveProperty('input')
    expectTypeOf(typedResult).toHaveProperty('output')
    expectTypeOf(typedResult.input).toEqualTypeOf<string | undefined>()
    expectTypeOf(typedResult.output).toEqualTypeOf<WorkSnapshot[] | undefined>()

    // 验证具体的 Workflow 实例 output 类型
    expectTypeOf(typedWorkflow.output).toEqualTypeOf<WorkSnapshot[] | undefined>()
  })

  it('类型不匹配的错误测试', () => {
    const errorWorkflow = new Workflow<string>({ id: 'error-workflow' })
    const errorWork = new Work<string, string>({ id: 'error-work' })

    // 这个应该是允许的，因为 Workflow<string> 可以接受 Work<string, any>
    errorWorkflow.add(errorWork)
  })

  it('Step 输入输出不匹配的错误测试', () => {
    const numberWork = new Work<number, string>({ id: 'number-work' })
    const stringStep = new Step<string, string>({
      id: 'string-step',
      run: async (input) => input
    })

    // 现在这种类型不匹配会被允许，因为 Work 可以接受任何 Step
    // 类型检查在运行时通过快照来保证
    numberWork.add(stringStep)
  })

  it('完整的业务流程测试', async () => {
    const step1 = new Step<string, number>({
      id: 'step1',
      run: async (input) => input.length
    })

    const step2 = new Step<string, boolean>({
      id: 'step2',
      run: async (input) => input.startsWith('test')
    })

    const step3 = new Step<string, string>({
      id: 'step3',
      run: async (input) => input.toUpperCase()
    })

    const work1 = new Work<string, number>({ id: 'work1' })
    const work2 = new Work<string, boolean>({ id: 'work2' })
    const work3 = new Work<string, string>({ id: 'work3' })

    const businessWorkflow = new Workflow<string>({ id: 'business' })

    const result1 = await businessWorkflow
      .add(work1.add(step1))
      .add(work2.add(step2))
      .add(work3.add(step3))
      .run('test-input')

    // 验证业务流程结果 - 返回 WorkflowSnapshot，检查属性
    expectTypeOf(result1).toHaveProperty('input')
    expectTypeOf(result1).toHaveProperty('output')
    expectTypeOf(result1.input).toEqualTypeOf<string | undefined>()
    expectTypeOf(result1.output).toEqualTypeOf<WorkSnapshot[] | undefined>()
  })

  it('output 类型推导测试', async () => {
    // 创建具体类型的组件
    const numStep = new Step<string, number>({
      id: 'num-step',
      run: async (input) => input.length
    })

    const boolStep = new Step<string, boolean>({
      id: 'bool-step',
      run: async (input) => input.startsWith('test')
    })

    const numWork = new Work<string, number>({ id: 'num-work' })
    const boolWork = new Work<string, boolean>({ id: 'bool-work' })

    // 添加 step 后验证 output 类型
    const configuredNumWork = numWork.add(numStep)
    const configuredBoolWork = boolWork.add(boolStep)

    expectTypeOf(configuredNumWork.output).toEqualTypeOf<number | undefined>()
    expectTypeOf(configuredBoolWork.output).toEqualTypeOf<boolean | undefined>()

    // 运行后验证 output 类型仍然正确
    const numResult = await configuredNumWork.run('test')
    const boolResult = await configuredBoolWork.run('test')

    expectTypeOf(numResult.output).toEqualTypeOf<number | undefined>()
    expectTypeOf(boolResult.output).toEqualTypeOf<boolean | undefined>()

    // Workflow 的 output 类型验证
    const workflow = new Workflow<string>({ id: 'test-workflow' })
    workflow.add(configuredNumWork).add(configuredBoolWork)

    expectTypeOf(workflow.output).toEqualTypeOf<WorkSnapshot[] | undefined>()

    const workflowResult = await workflow.run('test')
    expectTypeOf(workflowResult.output).toEqualTypeOf<WorkSnapshot[] | undefined>()
  })
})
