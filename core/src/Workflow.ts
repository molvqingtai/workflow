import EventHub from './EventHub'
import uuid from './utils/uuid'
import { MemoryOptimizer } from './MemoryOptimizer'

type UnknownRecord = Record<string, unknown>

type MaybePromise<T> = T | Promise<T>

export const RUN_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  SUCCESS: 'success',
  FAILED: 'failed',
  STOPPED: 'stopped'
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

  /**
   * Get snapshot with caching optimization
   */
  getSnapshot(): WorkflowSnapshot<Input, Output, Meta, WorkSnapshot> {
    const cached = MemoryOptimizer.getCachedSnapshot<WorkflowSnapshot<Input, Output, Meta, WorkSnapshot>>(this)
    if (cached) {
      return cached
    }

    const snapshot: WorkflowSnapshot<Input, Output, Meta, WorkSnapshot> = {
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

    MemoryOptimizer.cacheSnapshot(this, snapshot)
    return snapshot
  }

  /**
   * Mark this component as changed (invalidates snapshot cache)
   */
  private markChanged(): void {
    MemoryOptimizer.markChanged(this)
  }

  /**
   * Add a work to the workflow with proper listener management
   */
  add(work: Work<any, any, any>) {
    // Set parent references (both direct and WeakMap)
    work.workflow = this
    MemoryOptimizer.setParentWorkflow(work, this)

    // Remove duplicate and add work
    this.works = [...this.works.filter((w) => w.id !== work.id), work]

    // Store listener cleanup functions in WeakMap
    const cleanups: Array<() => void> = []

    // Helper to register event with cleanup
    const bindEvent = <K extends keyof WorkEventMap>(event: K, handler: WorkEventMap[K]) => {
      work.on(event, handler)
      cleanups.push(() => work.off(event, handler))
    }

    // Bind all work events
    bindEvent(WORK_EVENT.START, (snapshot) => {
      this.eventHub.emit(WORK_EVENT.START, snapshot)
    })
    bindEvent(WORK_EVENT.PAUSE, (snapshot) => {
      this.eventHub.emit(WORK_EVENT.PAUSE, snapshot)
    })
    bindEvent(WORK_EVENT.RESUME, (snapshot) => {
      this.eventHub.emit(WORK_EVENT.RESUME, snapshot)
    })
    bindEvent(WORK_EVENT.STOP, (snapshot) => {
      this.eventHub.emit(WORK_EVENT.STOP, snapshot)
    })
    bindEvent(WORK_EVENT.SUCCESS, (snapshot) => {
      this.eventHub.emit(WORK_EVENT.SUCCESS, snapshot)
    })
    bindEvent(WORK_EVENT.FAILED, (snapshot) => {
      this.eventHub.emit(WORK_EVENT.FAILED, snapshot)
    })

    // Bind all step events
    bindEvent(STEP_EVENT.START, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.START, snapshot)
    })
    bindEvent(STEP_EVENT.PAUSE, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.PAUSE, snapshot)
    })
    bindEvent(STEP_EVENT.RESUME, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.RESUME, snapshot)
    })
    bindEvent(STEP_EVENT.SUCCESS, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.SUCCESS, snapshot)
    })
    bindEvent(STEP_EVENT.FAILED, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.FAILED, snapshot)
    })
    bindEvent(STEP_EVENT.CHANGE, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
    })
    bindEvent(STEP_EVENT.STOP, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.STOP, snapshot)
    })

    // Work change event invalidates workflow cache
    bindEvent(WORK_EVENT.CHANGE, (snapshot) => {
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      this.markChanged()
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, this.getSnapshot())
    })

    // Register cleanup functions
    MemoryOptimizer.registerListenerCleanups(work, cleanups)

    this.markChanged()
    const snapshot = this.getSnapshot()
    this.eventHub.emit(WORKFLOW_EVENT.ADD, snapshot)
    this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
    return this
  }

  query(workId: string) {
    return this.works.find((work) => work.id === workId)
  }

  /**
   * Delete a work with proper cleanup
   */
  delete(workId: string) {
    this.works = this.works.filter((work) => {
      if (work.id === workId) {
        // Cleanup all listeners registered for this work
        MemoryOptimizer.cleanupListeners(work)
        // Clear parent reference
        MemoryOptimizer.clearParentWorkflow(work)
        // Clear work's own event hub
        work.eventHub.off()
        work.workflow = undefined
        return false
      }
      return true
    })

    this.markChanged()
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
      this.markChanged()
      let snapshot = this.getSnapshot()
      this.eventHub.emit(WORKFLOW_EVENT.START, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      this.output = (await Promise.all(
        this.works.map((work) => work.start(input as any, { workflow: this }))
      )) as Output
      this.status = RUN_STATUS.SUCCESS
      this.markChanged()
      snapshot = this.getSnapshot()
      this.eventHub.emit(WORKFLOW_EVENT.SUCCESS, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      this.markChanged()
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
      this.markChanged()
      const snapshot = this.getSnapshot()
      this.eventHub.emit(WORKFLOW_EVENT.PAUSE, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      this.markChanged()
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
      this.markChanged()
      const snapshot = this.getSnapshot()
      this.eventHub.emit(WORKFLOW_EVENT.RESUME, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      this.markChanged()
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
    this.markChanged()
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

  /**
   * Get snapshot with caching optimization
   */
  getSnapshot(): WorkSnapshot<Input, Output, Meta> {
    const cached = MemoryOptimizer.getCachedSnapshot<WorkSnapshot<Input, Output, Meta>>(this)
    if (cached) {
      return cached
    }

    const snapshot: WorkSnapshot<Input, Output, Meta> = {
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

    MemoryOptimizer.cacheSnapshot(this, snapshot)
    return snapshot
  }

  /**
   * Mark this component as changed (invalidates snapshot cache)
   */
  private markChanged(): void {
    MemoryOptimizer.markChanged(this)
  }

  /**
   * Add a step to the work with proper listener management
   */
  add(step: Step<any, any, any>) {
    // Set parent references (both direct and WeakMap)
    step.work = this
    MemoryOptimizer.setParentWork(step, this)

    // Remove duplicate and add step
    this.steps = [...this.steps.filter((s) => s.id !== step.id), step]

    // Store listener cleanup functions in WeakMap
    const cleanups: Array<() => void> = []

    // Helper to register event with cleanup
    const bindEvent = <K extends keyof StepEventMap>(event: K, handler: StepEventMap[K]) => {
      step.on(event, handler)
      cleanups.push(() => step.off(event, handler))
    }

    bindEvent(STEP_EVENT.START, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.START, snapshot)
      if (this.status === RUN_STATUS.RUNNING) return
      this.status = RUN_STATUS.RUNNING
      this.markChanged()
      const workSnapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.START, workSnapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, workSnapshot)
    })

    bindEvent(STEP_EVENT.PAUSE, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.PAUSE, snapshot)
      if (this.status === RUN_STATUS.PAUSED) return
      this.status = RUN_STATUS.PAUSED
      this.markChanged()
      const workSnapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.PAUSE, workSnapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, workSnapshot)
    })

    bindEvent(STEP_EVENT.RESUME, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.RESUME, snapshot)
      if (this.status === RUN_STATUS.RUNNING) return
      this.status = RUN_STATUS.RUNNING
      this.markChanged()
      const workSnapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.RESUME, workSnapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, workSnapshot)
    })

    bindEvent(STEP_EVENT.STOP, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.STOP, snapshot)
      if (this.status === RUN_STATUS.STOPPED) return
      this.status = RUN_STATUS.STOPPED
      this.markChanged()
      const workSnapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.STOP, workSnapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, workSnapshot)
    })

    bindEvent(STEP_EVENT.SUCCESS, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.SUCCESS, snapshot)
    })

    bindEvent(STEP_EVENT.FAILED, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.FAILED, snapshot)
    })

    // Step change event invalidates work cache
    bindEvent(STEP_EVENT.CHANGE, (snapshot) => {
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
      this.markChanged()
      this.eventHub.emit(WORK_EVENT.CHANGE, this.getSnapshot())
    })

    // Register cleanup functions
    MemoryOptimizer.registerListenerCleanups(step, cleanups)

    this.markChanged()
    this.eventHub.emit(WORK_EVENT.ADD, this.getSnapshot())
    this.eventHub.emit(WORK_EVENT.CHANGE, this.getSnapshot())
    return this
  }

  /**
   * Delete a step with proper cleanup
   */
  delete(stepId: string) {
    this.steps = this.steps.filter((step) => {
      if (step.id === stepId) {
        // Cleanup all listeners registered for this step
        MemoryOptimizer.cleanupListeners(step)
        // Clear parent reference
        MemoryOptimizer.clearParentWork(step)
        // Clear step's own event hub
        step.eventHub.off()
        step.work = undefined
        return false
      }
      return true
    })

    this.markChanged()
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
      this.markChanged()
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
      this.markChanged()
      snapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.SUCCESS, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      this.markChanged()
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
      this.markChanged()
      const snapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.PAUSE, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      this.markChanged()
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
      this.markChanged()
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
      this.markChanged()
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
      this.markChanged()
      const snapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.STOP, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      this.markChanged()
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

  /**
   * Get snapshot with caching optimization
   */
  getSnapshot(): StepSnapshot<Input, Output, Meta> {
    const cached = MemoryOptimizer.getCachedSnapshot<StepSnapshot<Input, Output, Meta>>(this)
    if (cached) {
      return cached
    }

    const snapshot: StepSnapshot<Input, Output, Meta> = {
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

    MemoryOptimizer.cacheSnapshot(this, snapshot)
    return snapshot
  }

  /**
   * Mark this component as changed (invalidates snapshot cache)
   */
  private markChanged(): void {
    MemoryOptimizer.markChanged(this)
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
      this.markChanged()
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
      this.markChanged()
      snapshot = this.getSnapshot()
      this.eventHub.emit(STEP_EVENT.SUCCESS, snapshot)
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      this.markChanged()
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
      this.pauseResolvers = Promise.withResolvers<void>()
      this.markChanged()
      const snapshot = this.getSnapshot()
      this.eventHub.emit(STEP_EVENT.PAUSE, snapshot)
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      this.markChanged()
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
      this.markChanged()
      const snapshot = this.getSnapshot()
      this.eventHub.emit(STEP_EVENT.RESUME, snapshot)
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      this.markChanged()
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
      this.markChanged()
      const snapshot = this.getSnapshot()
      this.eventHub.emit(STEP_EVENT.STOP, snapshot)
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = RUN_STATUS.FAILED
      this.error = (error as Error).message
      this.markChanged()
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
