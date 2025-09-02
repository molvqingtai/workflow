import EventHub from './EventHub'
import { MemoryStorage, Storage } from './MemoryStorage'

// 创建全局共享的 MemoryStorage 实例
const memoryStorage = new MemoryStorage()

export const STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  SUCCESS: 'success',
  FAILED: 'failed'
} as const

export type WorkflowStatus = (typeof STATUS)[keyof typeof STATUS]
export type WorkStatus = (typeof STATUS)[keyof typeof STATUS]
export type StepStatus = (typeof STATUS)[keyof typeof STATUS]

export interface StepSnapshot<I = any, O = any> {
  id: string
  name?: string
  description?: string
  type: 'step'
  status: StepStatus
  input?: I
  output?: O
  error?: string
}

export interface WorkSnapshot<I = any, O = any> {
  id: string
  name?: string
  description?: string
  type: 'work'
  status: WorkStatus
  input?: I
  output?: O
  error?: string
  steps: Array<StepSnapshot<any, any>>
}

export interface WorkflowSnapshot<I = any, O extends WorkSnapshot[] = WorkSnapshot[]> {
  id: string
  name?: string
  description?: string
  type: 'workflow'
  status: WorkflowStatus
  input?: I
  output?: O
  error?: string
  works: Array<WorkSnapshot<any, any>>
}

export interface WorkflowOptions {
  id?: string
  name?: string
  description?: string
  storage?: Storage
}

export interface WorkOptions {
  id: string
  name?: string
  description?: string
  storage?: Storage
}

export interface StepOptions<I = any, O = any> {
  id: string
  name?: string
  description?: string
  storage?: Storage
  run: (input: I) => Promise<O>
}

class Snapshot<T extends Workflow<any> | Work<any, any> | Step> {
  private storage: Storage
  private runner: T
  constructor(runner: T, storage?: Storage) {
    this.runner = runner
    this.storage = storage ?? memoryStorage // 恢复使用全局默认值
  }

  // 专门的静态方法，类型明确
  static captureWorkflowSnapshot<I, O extends WorkSnapshot[] = WorkSnapshot[]>(
    workflow: Workflow<I>,
    storage?: Storage
  ): WorkflowSnapshot<I, O> {
    const s = storage ?? memoryStorage
    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      type: workflow.type,
      input: workflow.input,
      output: workflow.output as O,
      status: workflow.status,
      works: workflow.works.map((work) => Snapshot.captureWorkSnapshot(work, s))
    }
  }

  static captureWorkSnapshot<I, O>(
    work: Work<I, O>,
    storage?: Storage
  ): WorkSnapshot<I, O extends WorkUninitialized ? undefined : O> {
    const s = storage ?? memoryStorage
    return {
      id: work.id,
      name: work.name,
      description: work.description,
      type: work.type,
      input: work.input,
      output: work.output as O extends WorkUninitialized ? undefined : O,
      status: work.status,
      steps: work.steps.map((step) => Snapshot.captureStepSnapshot(step, s))
    }
  }

  static captureStepSnapshot<I, O>(step: Step<I, O>, _storage?: Storage): StepSnapshot<I, O> {
    return {
      id: step.id,
      name: step.name,
      description: step.description,
      type: step.type,
      input: step.input,
      output: step.output, // 现在 output 直接存储原始数据
      status: step.status
    }
  }

  captureSnapshot(): T extends Workflow<infer I>
    ? WorkflowSnapshot<I, WorkSnapshot[]>
    : T extends Work<infer I, infer O>
      ? WorkSnapshot<I, O extends WorkUninitialized ? undefined : O>
      : T extends Step<infer I, infer O>
        ? StepSnapshot<I, O>
        : never {
    if (this.runner.type === 'workflow') {
      return Snapshot.captureWorkflowSnapshot(this.runner as Workflow<any>, this.storage) as any
    } else if (this.runner.type === 'work') {
      return Snapshot.captureWorkSnapshot(this.runner as Work<any, any>, this.storage) as any
    } else if (this.runner.type === 'step') {
      return Snapshot.captureStepSnapshot(this.runner as Step<any, any>, this.storage) as any
    } else {
      throw new Error(`Unknown runner type: ${(this.runner as any).type}`)
    }
  }

  async saveSnapshot(): Promise<void> {
    switch (this.runner.type) {
      case 'workflow':
        return this.storage.set(`workflow:snapshot-${this.runner.id}`, this.captureSnapshot())
      case 'work':
        return this.storage.set(`work:snapshot-${this.runner.id}`, this.captureSnapshot())
      case 'step':
        return this.storage.set(`step:snapshot-${this.runner.id}`, this.captureSnapshot())
    }
  }

  async readSnapshot(): Promise<
    WorkflowSnapshot<any, any> | WorkSnapshot<any, any> | StepSnapshot<any, any> | null | undefined
  > {
    switch (this.runner.type) {
      case 'workflow':
        return await this.storage.get(`workflow:snapshot-${this.runner.id}`)
      case 'work':
        return await this.storage.get(`work:snapshot-${this.runner.id}`)
      case 'step':
        return await this.storage.get(`step:snapshot-${this.runner.id}`)
      default:
        return null
    }
  }
}

class Workflow<I = any> {
  readonly id: string
  readonly name?: string
  readonly description?: string
  readonly type = 'workflow' as const
  readonly isComputed: boolean = false
  status: WorkflowStatus = STATUS.PENDING
  works: Work<I, any>[] = []
  private eventHub: EventHub
  private storage: Storage
  private snapshot: Snapshot<this>
  input?: I
  output?: WorkSnapshot[]
  constructor(options?: WorkflowOptions) {
    this.eventHub = new EventHub()
    this.storage = options?.storage ?? memoryStorage
    this.snapshot = new Snapshot(this, this.storage)
    this.id = options?.id ?? `workflow-${Date.now()}`
    this.name = options?.name
    this.description = options?.description
  }

  // 公共方法：手动恢复状态
  async restore() {
    await this.autoRestore()
  }

  private async autoRestore() {
    const snapshot = await this.snapshot.readSnapshot()
    if (snapshot) {
      this.status = snapshot.status
      this.input = snapshot.input
      this.output = snapshot.output
      // 递归恢复所有 works 的状态
      await Promise.all(this.works.map((work) => work.restore()))
    }
  }

  // 添加 Work 到工作流
  add(work: Work<I, any>): Workflow<I> {
    this.works.push(work)
    work.on('work:start', (snapshot) => {
      this.snapshot.saveSnapshot()
      this.eventHub.emit('work:start', snapshot)
    })
    work.on('work:pause', (snapshot) => {
      this.snapshot.saveSnapshot()
      this.eventHub.emit('work:pause', snapshot)
    })
    work.on('work:resume', (snapshot) => {
      this.snapshot.saveSnapshot()
      this.eventHub.emit('work:resume', snapshot)
    })
    work.on('work:success', (snapshot) => {
      this.snapshot.saveSnapshot()
      this.eventHub.emit('work:success', snapshot)
    })
    work.on('work:failed', (error) => {
      this.snapshot.saveSnapshot()
      this.eventHub.emit('work:error', error)
    })
    work.on('step:start', (snapshot) => {
      this.snapshot.saveSnapshot()
      this.eventHub.emit('step:start', snapshot)
    })
    work.on('step:pause', (snapshot) => {
      this.snapshot.saveSnapshot()
      this.eventHub.emit('step:pause', snapshot)
    })
    work.on('step:resume', (snapshot) => {
      this.snapshot.saveSnapshot()
      this.eventHub.emit('step:resume', snapshot)
    })
    work.on('step:success', (snapshot) => {
      this.snapshot.saveSnapshot()
      this.eventHub.emit('step:success', snapshot)
    })
    work.on('step:failed', (snapshot) => {
      this.snapshot.saveSnapshot()
      this.eventHub.emit('step:failed', snapshot)
    })
    return this
  }

  // 运行工作流：并行执行所有 works，返回 WorkflowSnapshot
  async run(input: I): Promise<WorkflowSnapshot<I, WorkSnapshot[]>> {
    // 确保已经恢复状态
    await this.autoRestore()

    // 如果不是 PENDING 状态，说明已经运行过了，直接返回快照
    if (this.status !== STATUS.PENDING) {
      return this.snapshot.captureSnapshot()
    }
    // PENDING 状态继续执行

    try {
      this.input = input
      this.status = STATUS.RUNNING

      const snapshot = this.snapshot.captureSnapshot()
      this.snapshot.saveSnapshot()
      this.eventHub.emit('workflow:start', snapshot)

      // 并行执行所有 works，每个 work 返回 WorkSnapshot
      const workSnapshots = await Promise.all(this.works.map((work) => work.run(input)))
      this.output = workSnapshots
      this.status = STATUS.SUCCESS

      const finalSnapshot = this.snapshot.captureSnapshot()
      this.snapshot.saveSnapshot()
      this.eventHub.emit('workflow:success', finalSnapshot)
      return finalSnapshot
    } catch (error) {
      this.status = STATUS.FAILED
      this.snapshot.saveSnapshot()
      this.eventHub.emit('workflow:failed', this.snapshot.captureSnapshot())
      throw error
    }
  }

  async pause(): Promise<WorkflowSnapshot> {
    await this.autoRestore()
    if (this.status !== STATUS.RUNNING) {
      const snapshot = this.snapshot.captureSnapshot()
      return snapshot
    }
    this.status = STATUS.PAUSED
    await Promise.all(this.works.map((work) => work.pause()))
    const snapshot = this.snapshot.captureSnapshot()
    this.snapshot.saveSnapshot() // 保存快照
    this.eventHub.emit('workflow:pause', snapshot)
    return snapshot
  }

  async resume(): Promise<WorkflowSnapshot> {
    await this.autoRestore()
    if (this.status !== STATUS.PAUSED) {
      const snapshot = this.snapshot.captureSnapshot()
      return snapshot
    }
    this.status = STATUS.RUNNING
    await Promise.all(this.works.map((work) => work.resume()))
    const snapshot = this.snapshot.captureSnapshot()
    this.snapshot.saveSnapshot()
    this.eventHub.emit('workflow:resume', snapshot)
    return snapshot
  }

  on(event: string, listener: (...args: any[]) => void) {
    this.eventHub.on(event, listener)
  }

  // 公共快照访问方法
  getSnapshot(): WorkflowSnapshot<I, WorkSnapshot[]> {
    return this.snapshot.captureSnapshot()
  }
}

// 用于标记 Work 未初始化状态的特殊类型
type WorkUninitialized = { readonly __workBrand: 'uninitialized' }

class Work<I = any, O = WorkUninitialized> {
  readonly id: string
  readonly name?: string
  readonly description?: string
  readonly type = 'work' as const
  steps: Step<any, any>[] = []
  status: WorkStatus = STATUS.PENDING
  readonly isComputed: boolean = false
  input?: I
  output?: O extends WorkUninitialized ? undefined : O
  error?: string
  private eventHub: EventHub
  private storage: Storage
  private snapshot: Snapshot<this>

  constructor(options: WorkOptions) {
    this.id = options.id
    this.name = options.name
    this.description = options.description
    this.eventHub = new EventHub()
    this.storage = options?.storage ?? memoryStorage
    this.snapshot = new Snapshot(this, this.storage)
  }

  // 公共方法：手动恢复状态
  async restore() {
    await this.autoRestore()
  }

  private async autoRestore() {
    const snapshot = await this.snapshot.readSnapshot()
    if (snapshot) {
      this.status = snapshot.status
      this.input = snapshot.input
      this.output = snapshot.output
      this.error = snapshot.error

      // 递归恢复所有 steps 的状态
      await Promise.all(this.steps.map((step) => step.restore()))
    }
  }

  // 第一个步骤：Work未初始化时，从Step推导输入和输出类型
  add<StepI, StepO>(this: Work<any, WorkUninitialized>, step: Step<StepI, StepO>): Work<StepI, StepO>

  // 链式推导：当前Work的输出类型作为下一个Step的输入类型
  add<NextStepO>(this: Work<I, Exclude<O, WorkUninitialized>>, step: Step<O, NextStepO>): Work<I, NextStepO>

  // 预定义输出类型的Work：添加Step，Step必须从Work当前输出类型到新的输出类型（兼容性保留）
  add<FinalO>(this: Work<I, Exclude<O, WorkUninitialized>>, step: Step<I, FinalO>): Work<I, FinalO>

  // 实现
  add(step: Step<any, any>): any {
    this.steps.push(step)

    step.on('step:start', async (snapshot) => {
      this.eventHub.emit('step:start', snapshot)
    })

    step.on('step:pause', async (snapshot) => {
      this.eventHub.emit('step:pause', snapshot)
      if (this.status !== STATUS.PAUSED) {
        this.status = STATUS.PAUSED
        this.eventHub.emit('work:pause', this.snapshot.captureSnapshot())
      }
    })

    step.on('step:resume', async (snapshot) => {
      this.eventHub.emit('step:resume', snapshot)
      if (this.status !== STATUS.RUNNING) {
        this.status = STATUS.RUNNING
        this.eventHub.emit('work:resume', this.snapshot.captureSnapshot())
      }
    })

    step.on('step:success', async (snapshot) => {
      this.eventHub.emit('step:success', snapshot)
    })

    step.on('step:failed', async (snapshot) => {
      this.eventHub.emit('step:failed', snapshot)
      if (this.status !== STATUS.FAILED) {
        this.status = STATUS.FAILED
        this.eventHub.emit('work:failed', this.snapshot.captureSnapshot())
      }
    })

    return this
  }

  // 运行工作：串行执行所有 steps，返回 WorkSnapshot
  async run(input: I): Promise<WorkSnapshot<I, O>> {
    // 每次都先恢复最新状态
    await this.autoRestore()

    // 如果不是 PENDING 状态，说明已经运行过了，直接返回快照
    if (this.status !== STATUS.PENDING) {
      return this.snapshot.captureSnapshot() as WorkSnapshot<I, O>
    }
    // 只有 PENDING 状态才继续执行

    try {
      this.input = input
      this.status = STATUS.RUNNING
      const snapshot = this.snapshot.captureSnapshot()
      this.snapshot.saveSnapshot()
      this.eventHub.emit('work:start', snapshot)

      // 串行执行步骤链
      let currentInput = input
      for (const step of this.steps) {
        const stepSnapshot = await step.run(currentInput)
        currentInput = stepSnapshot.output
      }

      ;(this.output as any) = currentInput
      this.status = STATUS.SUCCESS

      const finalSnapshot = this.snapshot.captureSnapshot() as WorkSnapshot<I, O>
      this.snapshot.saveSnapshot()
      this.eventHub.emit('work:success', finalSnapshot)
      return finalSnapshot
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = error instanceof Error ? error.message : String(error)
      this.snapshot.saveSnapshot()
      this.eventHub.emit('work:failed', error)
      throw error
    }
  }

  async pause(): Promise<WorkSnapshot> {
    try {
      if (this.status !== STATUS.RUNNING) {
        const snapshot = this.snapshot.captureSnapshot()
        return snapshot
      }
      this.status = STATUS.PAUSED
      await Promise.all(this.steps.map((step) => step.pause()))
      const snapshot = this.snapshot.captureSnapshot()
      this.snapshot.saveSnapshot() // 保存快照
      this.eventHub.emit('work:pause', snapshot)
      return snapshot
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = error instanceof Error ? error.message : String(error)
      this.eventHub.emit('work:failed', error)
      throw error
    }
  }

  async resume(): Promise<WorkSnapshot> {
    try {
      if (this.status !== STATUS.PAUSED) {
        const snapshot = this.snapshot.captureSnapshot()
        return snapshot
      }
      this.status = STATUS.RUNNING
      await Promise.all(this.steps.map((step) => step.resume()))
      const snapshot = this.snapshot.captureSnapshot()
      this.snapshot.saveSnapshot()
      this.eventHub.emit('work:resume', snapshot)
      return snapshot
    } catch (error) {
      this.status = STATUS.FAILED
      this.snapshot.saveSnapshot()
      this.eventHub.emit('work:failed', error)
      throw error
    }
  }

  on(event: string, listener: (...args: any[]) => void) {
    this.eventHub.on(event, listener)
  }

  // 公共快照访问方法
  getSnapshot(): WorkSnapshot<I, O extends WorkUninitialized ? undefined : O> {
    return this.snapshot.captureSnapshot()
  }
}

/**
 * Step：工作流中的基本执行单元
 * @template I - 输入类型
 * @template O - 输出类型
 */
class Step<I = any, O = any> {
  readonly id: string
  readonly name?: string
  readonly description?: string
  readonly type = 'step' as const
  status: StepStatus = STATUS.PENDING
  readonly runComputed: boolean = false
  input?: I
  output?: O // 存储原始数据
  private eventHub: EventHub
  storage: Storage
  private snapshot: Snapshot<this>
  private pauseResolvers?: PromiseWithResolvers<void>
  readonly _run: (input: I) => Promise<O>

  constructor(options: StepOptions<I, O>) {
    this.id = options.id
    this.name = options.name
    this.description = options.description
    this.eventHub = new EventHub()
    this.storage = options?.storage ?? memoryStorage
    this.snapshot = new Snapshot(this, this.storage)
    this._run = options.run
  }

  // 公共方法：手动恢复状态
  async restore() {
    await this.autoRestore()
  }

  private async autoRestore() {
    const snapshot = await this.snapshot.readSnapshot()
    if (snapshot) {
      this.status = snapshot.status
      this.input = snapshot.input
      this.output = snapshot.output

      // 如果是暂停状态，恢复pauseResolvers
      if (this.status === STATUS.PAUSED) {
        this.pauseResolvers = Promise.withResolvers<void>()
      }
    }
  }

  async run(input: I): Promise<StepSnapshot<I, O>> {
    try {
      // 每次都先恢复最新状态
      await this.autoRestore()

      // 如果不是 PENDING 状态，说明已经运行过了，直接返回快照
      if (this.status !== STATUS.PENDING) {
        return this.snapshot.captureSnapshot()
      }
      // PENDING 状态或暂停恢复后继续执行

      this.input = input

      // 检查是否在启动前就被暂停
      if (this.pauseResolvers) {
        await this.pauseResolvers.promise
      }

      this.status = STATUS.RUNNING
      this.snapshot.saveSnapshot()
      // 执行用户的 run 函数，获取原始数据
      const rawData = await this._run(input)

      // 存储原始数据到 output
      this.output = rawData

      this.status = STATUS.SUCCESS

      // 创建快照并返回
      const finalSnapshot = this.snapshot.captureSnapshot()
      this.snapshot.saveSnapshot()
      this.eventHub.emit('step:success', finalSnapshot)

      // 检查是否在完成前被暂停
      if (this.pauseResolvers) {
        await this.pauseResolvers.promise
      }

      return finalSnapshot
    } catch (error) {
      this.status = STATUS.FAILED
      this.snapshot.saveSnapshot()
      this.eventHub.emit('step:failed', error)
      throw error
    }
  }
  async pause(): Promise<StepSnapshot> {
    try {
      if (this.status !== STATUS.RUNNING) {
        const snapshot = this.snapshot.captureSnapshot()
        return snapshot
      }
      this.status = STATUS.PAUSED
      this.pauseResolvers = Promise.withResolvers<void>()
      const snapshot = this.snapshot.captureSnapshot()
      this.snapshot.saveSnapshot() // 保存快照
      this.eventHub.emit('step:pause', snapshot)
      return snapshot
    } catch (error) {
      this.status = STATUS.FAILED
      this.eventHub.emit('step:failed', error)
      throw error
    }
  }

  async resume(): Promise<StepSnapshot> {
    try {
      if (this.status === STATUS.PAUSED) {
        // 继续执行（默认行为）
        this.status = STATUS.RUNNING
        this.pauseResolvers?.resolve()
        const snapshot = this.snapshot.captureSnapshot()
        this.snapshot.saveSnapshot()
        this.eventHub.emit('step:resume', snapshot)
        return snapshot
      }
      const snapshot = this.snapshot.captureSnapshot()
      return snapshot
    } catch (error) {
      this.status = STATUS.FAILED
      this.snapshot.saveSnapshot()
      this.eventHub.emit('step:failed', error)
      throw error
    }
  }

  on(event: string, listener: (...args: any[]) => void) {
    this.eventHub.on(event, listener)
  }

  off(event?: string, listener?: (...args: any[]) => void) {
    this.eventHub.off(event, listener)
  }

  // 公共快照访问方法
  getSnapshot(): StepSnapshot<I, O> {
    return this.snapshot.captureSnapshot()
  }
}

export { Workflow, Work, Step, MemoryStorage }
