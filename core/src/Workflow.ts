import EventHub from './EventHub'
import uuid from './utils/uuid'

type UnknownRecord = Record<string, unknown>

type MaybePromise<T> = T | Promise<T>

export const RUN_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  SUCCESS: 'success',
  FAILED: 'failed',
  STOPPED: 'stoped'
} as const

export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS]

export interface StepSnapshot<Input = unknown, Output = unknown, Meta extends UnknownRecord = UnknownRecord> {
  id: string
  name?: string
  description?: string
  type: 'step'
  status: RunStatus
  input?: Input
  output?: Output
  context?: unknown
  error?: string
  meta?: Meta
}

export interface WorkSnapshot<
  Input = unknown,
  Output = unknown,
  Meta extends UnknownRecord = UnknownRecord,
  StepSnap extends StepSnapshot = StepSnapshot
> {
  id: string
  name?: string
  description?: string
  type: 'work'
  status: RunStatus
  input?: Input
  output?: Output
  error?: string
  meta?: Meta
  steps: Array<StepSnap>
}

export interface WorkflowSnapshot<
  Input = unknown,
  Output = unknown,
  Meta extends UnknownRecord = UnknownRecord,
  WorkSnap extends WorkSnapshot = WorkSnapshot
> {
  id: string
  name?: string
  description?: string
  type: 'workflow'
  status: RunStatus
  input?: Input
  output?: Output
  error?: string
  meta?: Meta
  works: Array<WorkSnap>
}

export const WORKFLOW_EVENT = {
  START: 'workflow:start',
  SUCCESS: 'workflow:success',
  FAILED: 'workflow:failed',
  PAUSE: 'workflow:pause',
  RESUME: 'workflow:resume',
  STOP: 'workflow:stop',
  CHANGE: 'workflow:change',
  ADD: 'workflow:add',
  DELETE: 'workflow:delete'
} as const

export const WORK_EVENT = {
  START: 'work:start',
  SUCCESS: 'work:success',
  FAILED: 'work:failed',
  PAUSE: 'work:pause',
  RESUME: 'work:resume',
  STOP: 'work:stop',
  CHANGE: 'work:change',
  ADD: 'work:add',
  DELETE: 'work:delete'
} as const

export const STEP_EVENT = {
  START: 'step:start',
  SUCCESS: 'step:success',
  FAILED: 'step:failed',
  PAUSE: 'step:pause',
  RESUME: 'step:resume',
  STOP: 'step:stop',
  CHANGE: 'step:change'
} as const

export type WorkflowEvent = keyof typeof WORKFLOW_EVENT

export type WorkEvent = keyof typeof WORK_EVENT

export type StepEvent = keyof typeof STEP_EVENT

export type StepEventMap<StepSnap extends StepSnapshot = StepSnapshot> = {
  [STEP_EVENT.START]: (snapshot: StepSnap) => void
  [STEP_EVENT.SUCCESS]: (snapshot: StepSnap) => void
  [STEP_EVENT.FAILED]: (snapshot: StepSnap) => void
  [STEP_EVENT.PAUSE]: (snapshot: StepSnap) => void
  [STEP_EVENT.RESUME]: (snapshot: StepSnap) => void
  [STEP_EVENT.CHANGE]: (snapshot: StepSnap) => void
  [STEP_EVENT.STOP]: (snapshot: StepSnap) => void
}

export type WorkEventMap<WorkSnap extends WorkSnapshot = WorkSnapshot, StepSnap extends StepSnapshot = StepSnapshot> = {
  [WORK_EVENT.START]: (snapshot: WorkSnap) => void
  [WORK_EVENT.SUCCESS]: (snapshot: WorkSnap) => void
  [WORK_EVENT.FAILED]: (snapshot: WorkSnap) => void
  [WORK_EVENT.PAUSE]: (snapshot: WorkSnap) => void
  [WORK_EVENT.RESUME]: (snapshot: WorkSnap) => void
  [WORK_EVENT.CHANGE]: (snapshot: WorkSnap) => void
  [WORK_EVENT.STOP]: (snapshot: WorkSnap) => void
  [WORK_EVENT.ADD]: (snapshot: WorkSnap) => void
  [WORK_EVENT.DELETE]: (snapshot: WorkSnap) => void
} & StepEventMap<StepSnap>

export type WorkflowEventMap<
  WorkflowSnap extends WorkflowSnapshot = WorkflowSnapshot,
  WorkSnap extends WorkSnapshot = WorkSnapshot,
  StepSnap extends StepSnapshot = StepSnapshot
> = {
  [WORKFLOW_EVENT.START]: (snapshot: WorkflowSnap) => void
  [WORKFLOW_EVENT.SUCCESS]: (snapshot: WorkflowSnap) => void
  [WORKFLOW_EVENT.FAILED]: (snapshot: WorkflowSnap) => void
  [WORKFLOW_EVENT.PAUSE]: (snapshot: WorkflowSnap) => void
  [WORKFLOW_EVENT.RESUME]: (snapshot: WorkflowSnap) => void
  [WORKFLOW_EVENT.CHANGE]: (snapshot: WorkflowSnap) => void
  [WORKFLOW_EVENT.STOP]: (snapshot: WorkflowSnap) => void
  [WORKFLOW_EVENT.ADD]: (snapshot: WorkflowSnap) => void
  [WORKFLOW_EVENT.DELETE]: (snapshot: WorkflowSnap) => void
} & WorkEventMap<WorkSnap, StepSnap>

export interface WorkflowOptions<
  Input = unknown,
  Output = Array<Work<any, any, any>>,
  Meta extends UnknownRecord = UnknownRecord
> {
  id?: string
  name?: string
  description?: string
  status?: RunStatus
  input?: Input
  output?: Output
  error?: string
  meta?: Meta
  works: Array<Work<any, any, any>>
}

export interface WorkOptions<Input = unknown, Output = Input, Meta extends UnknownRecord = UnknownRecord> {
  id?: string
  name?: string
  description?: string
  status?: RunStatus
  input?: Input
  output?: Output
  error?: string
  meta?: Meta
  steps: Array<Step<any, any, any>>
}

export interface StepOptions<Input = unknown, Output = unknown, Meta extends UnknownRecord = UnknownRecord> {
  id?: string
  name?: string
  description?: string
  status?: RunStatus
  input?: Input
  output?: Output
  error?: string
  meta?: Meta
  run: (input: Input, context: RunContext<Step<Input, Output, Meta>>) => MaybePromise<Output>
}

export interface WorkContext<WF extends Workflow<any, any, any> | undefined = Workflow<any, any, any>> {
  workflow?: WF
}

export interface StepContext<
  WF extends Workflow<any, any, any> | undefined = Workflow<any, any, any>,
  W extends Work<any, any, any> | undefined = Work<any, any, any>
> {
  workflow?: WF
  work?: W
}

export type RunContext<
  S extends Step<any, any, any> = Step,
  WF extends Workflow<any, any, any> | undefined = Workflow<any, any, any>,
  W extends Work<any, any, any> | undefined = Work<any, any, any>
> = StepContext<WF, W> & S

export class Workflow<
  Input = unknown,
  Output = Array<Work<any, any, any>>,
  Meta extends UnknownRecord = UnknownRecord
> {
  id: string
  readonly type = 'workflow'
  name?: string
  description?: string
  input?: Input
  output?: Output
  error?: string
  status: RunStatus
  meta?: Meta
  works: Array<Work<any, any, any>> = []
  readonly eventHub: EventHub<WorkflowEventMap<WorkflowSnapshot<Input, Output, Meta>, WorkSnapshot, StepSnapshot>>

  constructor(options?: WorkflowOptions<Input, Output, Meta>) {
    this.id = options?.id ?? uuid()
    this.name = options?.name
    this.description = options?.description
    this.status = options?.status ?? RUN_STATUS.PENDING
    this.input = options?.input
    this.output = options?.output
    this.error = options?.error
    this.meta = options?.meta
    this.eventHub = new EventHub<WorkflowEventMap<WorkflowSnapshot<Input, Output, Meta>, WorkSnapshot, StepSnapshot>>()
    options?.works.forEach((work) => this.add(work))
  }

  getSnapshot(): WorkflowSnapshot<Input, Output, Meta, WorkSnapshot> {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: this.type,
      status: this.status,
      input: this.input,
      output: this.output,
      error: this.error,
      meta: this.meta,
      works: this.works.map((work) => work.getSnapshot())
    }
  }

  add(work: Work<any, any, any>) {
    work.workflow = this
    this.works = [...this.works.filter((w) => w.id !== work.id), work]
    work.on(WORK_EVENT.START, (snapshot) => {
      this.eventHub.emit(WORK_EVENT.START, snapshot)
    })
    work.on(WORK_EVENT.PAUSE, async (snapshot) => {
      this.eventHub.emit(WORK_EVENT.PAUSE, snapshot)
    })
    work.on(WORK_EVENT.RESUME, async (snapshot) => {
      this.eventHub.emit(WORK_EVENT.RESUME, snapshot)
    })
    work.on(WORK_EVENT.STOP, async (snapshot) => {
      this.eventHub.emit(WORK_EVENT.STOP, snapshot)
    })
    work.on(WORK_EVENT.SUCCESS, (snapshot) => {
      this.eventHub.emit(WORK_EVENT.SUCCESS, snapshot)
    })
    work.on(WORK_EVENT.FAILED, (snapshot) => {
      this.eventHub.emit(WORK_EVENT.FAILED, snapshot)
    })
    work.on(STEP_EVENT.START, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.START, snapshot)
    })
    work.on(STEP_EVENT.PAUSE, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.PAUSE, snapshot)
    })
    work.on(STEP_EVENT.RESUME, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.RESUME, snapshot)
    })
    work.on(STEP_EVENT.SUCCESS, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.SUCCESS, snapshot)
    })
    work.on(STEP_EVENT.FAILED, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.FAILED, snapshot)
    })
    work.on(STEP_EVENT.CHANGE, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
    })
    work.on(STEP_EVENT.STOP, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.STOP, snapshot)
    })

    work.on(WORK_EVENT.CHANGE, (snapshot) => {
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, this.getSnapshot())
    })

    const snapshot = this.getSnapshot()
    this.eventHub.emit(WORKFLOW_EVENT.ADD, snapshot)
    this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
    return this
  }

  query(workId: string) {
    return this.works.find((work) => work.id === workId)
  }

  delete(workId: string) {
    this.works = this.works.filter((work) => {
      if (work.id === workId) {
        work.eventHub.off()
        return false
      }
      return true
    })
    this.eventHub.emit(WORKFLOW_EVENT.DELETE, this.getSnapshot())
    this.eventHub.emit(WORKFLOW_EVENT.CHANGE, this.getSnapshot())
    return this
  }

  async start(input?: Input) {
    try {
      if (
        this.status === RUN_STATUS.FAILED ||
        this.status === RUN_STATUS.SUCCESS ||
        this.status === RUN_STATUS.STOPPED
      ) {
        return this
      }
      this.input = input
      this.status = RUN_STATUS.RUNNING
      let snapshot = this.getSnapshot()
      this.eventHub.emit(WORKFLOW_EVENT.START, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      this.output = (await Promise.all(
        this.works.map((work) => work.start(input as any, { workflow: this }))
      )) as Output
      this.status = RUN_STATUS.SUCCESS
      snapshot = this.getSnapshot()
      this.eventHub.emit(WORKFLOW_EVENT.SUCCESS, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.getSnapshot()
      this.eventHub.emit(WORKFLOW_EVENT.FAILED, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      throw error
    }
  }

  async pause() {
    try {
      if (this.status === RUN_STATUS.PAUSED || this.status !== RUN_STATUS.RUNNING) {
        return this
      }
      this.status = RUN_STATUS.PAUSED
      await Promise.all(this.works.map((work) => work.pause()))
      const snapshot = this.getSnapshot()
      this.eventHub.emit(WORKFLOW_EVENT.PAUSE, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.getSnapshot()
      this.eventHub.emit(WORKFLOW_EVENT.FAILED, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      throw error
    }
  }
  async resume() {
    try {
      if (this.status !== RUN_STATUS.PAUSED) {
        return this
      }
      this.status = RUN_STATUS.RUNNING
      await Promise.all(this.works.map((work) => work.resume()))
      const snapshot = this.getSnapshot()
      this.eventHub.emit(WORKFLOW_EVENT.RESUME, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.getSnapshot()
      this.eventHub.emit(WORKFLOW_EVENT.FAILED, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      throw error
    }
  }

  async stop() {
    if (
      this.status === RUN_STATUS.PENDING ||
      this.status === RUN_STATUS.STOPPED ||
      this.status === RUN_STATUS.SUCCESS ||
      this.status === RUN_STATUS.FAILED
    ) {
      return this
    }
    this.status = RUN_STATUS.STOPPED
    await Promise.all(this.works.map((work) => work.stop()))
    const snapshot = this.getSnapshot()
    this.eventHub.emit(WORKFLOW_EVENT.STOP, snapshot)
    this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
    return this
  }

  on<K extends keyof WorkflowEventMap>(event: K, listener: WorkflowEventMap[K]) {
    this.eventHub.on(event, listener)
  }

  off<K extends keyof WorkflowEventMap>(event: K, listener: WorkflowEventMap[K]) {
    this.eventHub.off(event, listener)
  }
}

export class Work<Input = unknown, Output = Input, Meta extends UnknownRecord = UnknownRecord> {
  id: string
  readonly type = 'work'
  name?: string
  description?: string
  input?: Input
  output?: Output
  error?: string
  meta?: Meta
  status: RunStatus = RUN_STATUS.PENDING
  steps: Step<any, any, any>[] = []
  workflow?: Workflow<any, any, any>
  readonly eventHub: EventHub<WorkEventMap<WorkSnapshot<Input, Output, Meta>, StepSnapshot>>
  private running: boolean = false
  constructor(options?: WorkOptions<Input, Output, Meta>) {
    this.id = options?.id ?? uuid()
    this.name = options?.name
    this.description = options?.description
    this.status = options?.status ?? RUN_STATUS.PENDING
    this.input = options?.input
    this.output = options?.output
    this.error = options?.error
    this.meta = options?.meta
    this.eventHub = new EventHub<WorkEventMap<WorkSnapshot<Input, Output, Meta>, StepSnapshot>>()
    options?.steps.forEach((step) => this.add(step))
  }

  getSnapshot(): WorkSnapshot<Input, Output, Meta> {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: this.type,
      status: this.status,
      input: this.input,
      output: this.output,
      error: this.error,
      meta: this.meta,
      steps: this.steps.map((step) => step.getSnapshot())
    }
  }

  add(step: Step<any, any, any>) {
    step.work = this
    this.steps = [...this.steps.filter((s) => s.id !== step.id), step]
    step.on(STEP_EVENT.START, async (snapshot) => {
      this.eventHub.emit(STEP_EVENT.START, snapshot)
      if (this.status === RUN_STATUS.RUNNING) return
      this.status = RUN_STATUS.RUNNING
      const workSnapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.START, workSnapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, workSnapshot)
    })

    step.on(STEP_EVENT.PAUSE, async (snapshot) => {
      this.eventHub.emit(STEP_EVENT.PAUSE, snapshot)
      if (this.status === RUN_STATUS.PAUSED) return
      this.status = RUN_STATUS.PAUSED
      const workSnapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.PAUSE, workSnapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, workSnapshot)
    })

    step.on(STEP_EVENT.RESUME, async (snapshot) => {
      this.eventHub.emit(STEP_EVENT.RESUME, snapshot)
      if (this.status === RUN_STATUS.RUNNING) return
      this.status = RUN_STATUS.RUNNING
      const workSnapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.RESUME, workSnapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, workSnapshot)
    })

    step.on(STEP_EVENT.STOP, async (snapshot) => {
      this.eventHub.emit(STEP_EVENT.STOP, snapshot)
      if (this.status === RUN_STATUS.STOPPED) return
      this.status = RUN_STATUS.STOPPED
      const workSnapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.STOP, workSnapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, workSnapshot)
    })

    step.on(STEP_EVENT.SUCCESS, async (snapshot) => {
      this.eventHub.emit(STEP_EVENT.SUCCESS, snapshot)
    })

    step.on(STEP_EVENT.FAILED, async (snapshot) => {
      this.eventHub.emit(STEP_EVENT.FAILED, snapshot)
    })

    step.on(STEP_EVENT.CHANGE, async (snapshot) => {
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, this.getSnapshot())
    })

    this.eventHub.emit(WORK_EVENT.ADD, this.getSnapshot())
    this.eventHub.emit(WORK_EVENT.CHANGE, this.getSnapshot())
    return this
  }

  delete(stepId: string) {
    this.steps = this.steps.filter((step) => {
      if (step.id === stepId) {
        step.eventHub.off()
        return false
      }
      return true
    })
    this.eventHub.emit(WORK_EVENT.DELETE, this.getSnapshot())
    this.eventHub.emit(WORK_EVENT.CHANGE, this.getSnapshot())
    return this
  }

  query(stepId: string) {
    return this.steps.find((step) => step.id === stepId)
  }

  async start(input: Input, context?: WorkContext) {
    try {
      this.running = true
      if (
        this.status === RUN_STATUS.FAILED ||
        this.status === RUN_STATUS.SUCCESS ||
        this.status === RUN_STATUS.STOPPED
      ) {
        return this
      }
      this.input = input
      this.status = RUN_STATUS.RUNNING
      let snapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.START, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      let currentInput: unknown = input
      for (const step of this.steps) {
        const res = await step.start(currentInput as any, { ...context, work: this })
        currentInput = res.output
      }
      this.status = RUN_STATUS.SUCCESS
      this.output = currentInput as Output
      snapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.SUCCESS, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.FAILED, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      throw error
    }
  }
  async pause() {
    try {
      if (this.status === RUN_STATUS.PAUSED || this.status !== RUN_STATUS.RUNNING) {
        return this
      }
      this.status = RUN_STATUS.PAUSED
      await Promise.all(this.steps.map((step) => step.pause()))
      const snapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.PAUSE, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.FAILED, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      throw error
    }
  }

  async resume() {
    try {
      if (this.status !== RUN_STATUS.PAUSED) {
        return this
      }
      this.status = RUN_STATUS.RUNNING
      const snapshot = this.getSnapshot()
      if (this.running) {
        this.eventHub.emit(WORK_EVENT.RESUME, snapshot)
        this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
        await Promise.all(this.steps.map((step) => step.resume()))
      } else {
        await Promise.all(this.steps.map((step) => step.resume()))
        await this.start(this.input as Input, { workflow: this.workflow })
      }
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.FAILED, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      throw error
    }
  }

  async stop() {
    try {
      if (
        this.status === RUN_STATUS.PENDING ||
        this.status === RUN_STATUS.STOPPED ||
        this.status === RUN_STATUS.SUCCESS ||
        this.status === RUN_STATUS.FAILED
      ) {
        return this
      }
      this.status = RUN_STATUS.STOPPED
      await Promise.all(this.steps.map((step) => step.stop()))
      const snapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.STOP, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.FAILED, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      throw error
    }
  }

  on<K extends keyof WorkEventMap>(event: K, listener: WorkEventMap[K]) {
    this.eventHub.on(event, listener)
  }

  off<K extends keyof WorkEventMap>(event: K, listener: WorkEventMap[K]) {
    this.eventHub.off(event, listener)
  }
}

export class Step<Input = unknown, Output = Input, Meta extends UnknownRecord = UnknownRecord> {
  id: string
  readonly type = 'step'
  name?: string
  description?: string
  input?: Input
  output?: Output
  error?: string
  meta?: Meta
  status: RunStatus = RUN_STATUS.PENDING
  work?: Work<any, any, any>
  readonly eventHub: EventHub<StepEventMap<StepSnapshot<Input, Output, Meta>>>
  private pauseResolvers?: PromiseWithResolvers<void>
  private stopResolvers?: PromiseWithResolvers<void>
  private run?: (input: Input, context: RunContext<Step<Input, Output, Meta>>) => MaybePromise<Output>
  private runned: boolean = false
  constructor(options?: StepOptions<Input, Output, Meta>) {
    this.id = options?.id ?? uuid()
    this.name = options?.name
    this.description = options?.description
    this.status = options?.status ?? RUN_STATUS.PENDING
    this.input = options?.input
    this.output = options?.output
    this.error = options?.error
    this.meta = options?.meta
    this.run = options?.run
    this.runned = options?.status === RUN_STATUS.SUCCESS || options?.status === RUN_STATUS.FAILED
    this.eventHub = new EventHub<StepEventMap<StepSnapshot<Input, Output, Meta>>>()
  }

  getSnapshot(): StepSnapshot<Input, Output, Meta> {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: this.type,
      status: this.status,
      input: this.input,
      output: this.output,
      error: this.error,
      meta: this.meta
    }
  }

  async start(input: Input, context?: StepContext) {
    try {
      if (
        this.runned ||
        this.status === RUN_STATUS.FAILED ||
        this.status === RUN_STATUS.SUCCESS ||
        this.status === RUN_STATUS.STOPPED
      ) {
        return this
      }
      this.input = input
      this.status = RUN_STATUS.RUNNING
      let snapshot = this.getSnapshot()
      this.eventHub.emit(STEP_EVENT.START, snapshot)
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
      await this.pauseResolvers?.promise
      await this.stopResolvers?.promise
      const output = await this.run?.(input, { ...context, ...this } as RunContext<Step<Input, Output, Meta>>)
      await this.pauseResolvers?.promise
      await this.stopResolvers?.promise
      this.output = output
      this.status = RUN_STATUS.SUCCESS
      snapshot = this.getSnapshot()
      this.eventHub.emit(STEP_EVENT.SUCCESS, snapshot)
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.getSnapshot()
      this.eventHub.emit(STEP_EVENT.FAILED, snapshot)
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
      throw error
    } finally {
      this.runned = true
    }
  }
  async pause() {
    try {
      if (this.status === RUN_STATUS.PAUSED || this.status !== RUN_STATUS.RUNNING) {
        return this
      }
      this.status = RUN_STATUS.PAUSED
      // this.pauseResolvers?.resolve()
      this.pauseResolvers = Promise.withResolvers<void>()
      const snapshot = this.getSnapshot()
      this.eventHub.emit(STEP_EVENT.PAUSE, snapshot)
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.getSnapshot()
      this.eventHub.emit(STEP_EVENT.FAILED, snapshot)
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
      throw error
    }
  }
  async resume() {
    try {
      if (this.status !== RUN_STATUS.PAUSED) {
        return this
      }
      this.status = RUN_STATUS.RUNNING
      this.pauseResolvers?.resolve()
      const snapshot = this.getSnapshot()
      this.eventHub.emit(STEP_EVENT.RESUME, snapshot)
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.getSnapshot()
      this.eventHub.emit(STEP_EVENT.FAILED, snapshot)
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
      throw error
    }
  }

  async stop() {
    try {
      if (
        this.status === RUN_STATUS.PENDING ||
        this.status === RUN_STATUS.STOPPED ||
        this.status === RUN_STATUS.SUCCESS ||
        this.status === RUN_STATUS.FAILED
      ) {
        return this
      }
      this.status = RUN_STATUS.STOPPED
      this.stopResolvers = Promise.withResolvers<void>()
      const snapshot = this.getSnapshot()
      this.eventHub.emit(STEP_EVENT.STOP, snapshot)
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.getSnapshot()
      this.eventHub.emit(STEP_EVENT.FAILED, snapshot)
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
      throw error
    }
  }

  on<K extends keyof StepEventMap>(event: K, listener: StepEventMap[K]) {
    this.eventHub.on(event, listener)
  }

  off<K extends keyof StepEventMap>(event: K, listener: StepEventMap[K]) {
    this.eventHub.off(event, listener)
  }
}
