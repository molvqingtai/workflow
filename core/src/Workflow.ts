import EventHub from './EventHub'
import uuid from './utils/uuid'

export const RUN_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  SUCCESS: 'success',
  FAILED: 'failed',
  STOPPED: 'stoped'
} as const

export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS]

export interface WorkflowSnapshot {
  id: string
  name?: string
  description?: string
  type: 'workflow'
  status: RunStatus
  input?: any
  output?: any
  error?: string
  meta?: Record<string, any>
  works: Array<WorkSnapshot>
}

export interface WorkSnapshot {
  id: string
  name?: string
  description?: string
  type: 'work'
  status: RunStatus
  input?: any
  output?: any
  error?: string
  meta?: Record<string, any>
  steps: Array<StepSnapshot>
}

export interface StepSnapshot {
  id: string
  name?: string
  description?: string
  type: 'step'
  status: RunStatus
  input?: any
  output?: any
  context?: any
  error?: string
  meta?: Record<string, any>
}

export const WORKFLOW_EVENT = {
  START: 'workflow:start',
  SUCCESS: 'workflow:success',
  FAILED: 'workflow:failed',
  PAUSE: 'workflow:pause',
  RESUME: 'workflow:resume',
  STOP: 'workflow:stop',
  CHANGE: 'workflow:change'
} as const

export const WORK_EVENT = {
  START: 'work:start',
  SUCCESS: 'work:success',
  FAILED: 'work:failed',
  PAUSE: 'work:pause',
  RESUME: 'work:resume',
  STOP: 'work:stop',
  CHANGE: 'work:change'
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

export type WorkEvent = keyof typeof WORKFLOW_EVENT

export type StepEvent = keyof typeof STEP_EVENT

export type StepEventMap = {
  [STEP_EVENT.START]: (snapshot: StepSnapshot) => void
  [STEP_EVENT.SUCCESS]: (snapshot: StepSnapshot) => void
  [STEP_EVENT.FAILED]: (snapshot: StepSnapshot) => void
  [STEP_EVENT.PAUSE]: (snapshot: StepSnapshot) => void
  [STEP_EVENT.RESUME]: (snapshot: StepSnapshot) => void
  [STEP_EVENT.CHANGE]: (snapshot: StepSnapshot) => void
  [STEP_EVENT.STOP]: (snapshot: StepSnapshot) => void
}

export type WorkEventMap = {
  [WORK_EVENT.START]: (snapshot: WorkSnapshot) => void
  [WORK_EVENT.SUCCESS]: (snapshot: WorkSnapshot) => void
  [WORK_EVENT.FAILED]: (snapshot: WorkSnapshot) => void
  [WORK_EVENT.PAUSE]: (snapshot: WorkSnapshot) => void
  [WORK_EVENT.RESUME]: (snapshot: WorkSnapshot) => void
  [WORK_EVENT.CHANGE]: (snapshot: WorkSnapshot) => void
  [WORK_EVENT.STOP]: (snapshot: WorkSnapshot) => void
} & StepEventMap

export type WorkflowEventMap = {
  [WORKFLOW_EVENT.START]: (snapshot: WorkflowSnapshot) => void
  [WORKFLOW_EVENT.SUCCESS]: (snapshot: WorkflowSnapshot) => void
  [WORKFLOW_EVENT.FAILED]: (snapshot: WorkflowSnapshot) => void
  [WORKFLOW_EVENT.PAUSE]: (snapshot: WorkflowSnapshot) => void
  [WORKFLOW_EVENT.RESUME]: (snapshot: WorkflowSnapshot) => void
  [WORKFLOW_EVENT.CHANGE]: (snapshot: WorkflowSnapshot) => void
  [WORKFLOW_EVENT.STOP]: (snapshot: WorkflowSnapshot) => void
} & WorkEventMap

export interface WorkflowOptions {
  id?: string
  name?: string
  description?: string
  status?: RunStatus
  input?: any
  output?: any
  error?: string
  meta?: Record<string, any>
  works: Work[]
}

export interface WorkOptions {
  id?: string
  name?: string
  description?: string
  status?: RunStatus
  input?: any
  output?: any
  error?: string
  meta?: Record<string, any>
  steps: Step[]
}

export interface StepOptions {
  id?: string
  name?: string
  description?: string
  status?: RunStatus
  input?: any
  output?: any
  error?: string
  meta?: Record<string, any>
  run: (input: any, context?: StepContext) => Promise<any>
}

export interface WorkContext {
  workflow?: Workflow
}

export interface StepContext {
  workflow?: Workflow
  work?: Work
}

export class Workflow {
  id: string
  readonly type = 'workflow'
  name?: string
  description?: string
  input: any
  output?: any
  error?: string
  status: RunStatus
  meta?: Record<string, any>
  works: Work[] = []
  readonly eventHub: EventHub<WorkflowEventMap>

  constructor(options?: WorkflowOptions) {
    this.id = options?.id ?? uuid()
    this.name = options?.name
    this.description = options?.description
    this.status = options?.status ?? RUN_STATUS.PENDING
    this.input = options?.input
    this.output = options?.output
    this.error = options?.error
    this.meta = options?.meta
    this.eventHub = new EventHub<WorkflowEventMap>()
    options?.works.forEach((work) => this.add(work))
  }

  getSnapshot(): WorkflowSnapshot {
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

  add(work: Work) {
    this.works = [...this.works.filter((w) => w.id !== work.id), work]
    work.on(WORK_EVENT.START, (snapshot) => {
      this.eventHub.emit(WORK_EVENT.START, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
    })

    work.on(WORK_EVENT.PAUSE, async (snapshot) => {
      this.eventHub.emit(WORK_EVENT.PAUSE, snapshot)
      if (this.status === RUN_STATUS.PAUSED) return
      if (this.works.every((work) => work.status === RUN_STATUS.PAUSED)) {
        this.status = RUN_STATUS.PAUSED
        const workflowSnapshot = this.getSnapshot()
        this.eventHub.emit(WORKFLOW_EVENT.PAUSE, workflowSnapshot)
        this.eventHub.emit(WORKFLOW_EVENT.CHANGE, workflowSnapshot)
      }
    })
    work.on(WORK_EVENT.RESUME, async (snapshot) => {
      this.eventHub.emit(WORK_EVENT.RESUME, snapshot)
      if (this.status === RUN_STATUS.RUNNING) return
      if (this.works.every((work) => work.status === RUN_STATUS.RUNNING)) {
        this.status = RUN_STATUS.RUNNING
        const workflowSnapshot = this.getSnapshot()
        this.eventHub.emit(WORKFLOW_EVENT.RESUME, workflowSnapshot)
        this.eventHub.emit(WORKFLOW_EVENT.CHANGE, workflowSnapshot)
      }
    })

    work.on(WORK_EVENT.STOP, async (snapshot) => {
      this.eventHub.emit(WORK_EVENT.STOP, snapshot)
      if (this.status === RUN_STATUS.STOPPED) return
      if (this.works.every((work) => work.status === RUN_STATUS.STOPPED)) {
        this.status = RUN_STATUS.STOPPED
        const workflowSnapshot = this.getSnapshot()
        this.eventHub.emit(WORKFLOW_EVENT.STOP, workflowSnapshot)
        this.eventHub.emit(WORKFLOW_EVENT.CHANGE, workflowSnapshot)
      }
    })

    work.on(WORK_EVENT.SUCCESS, (snapshot) => {
      this.eventHub.emit(WORK_EVENT.SUCCESS, snapshot)
    })
    work.on(WORK_EVENT.FAILED, (snapshot) => {
      this.eventHub.emit(WORK_EVENT.FAILED, snapshot)
    })

    work.on(WORK_EVENT.CHANGE, (snapshot) => {
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, this.getSnapshot())
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
  }

  async start(input?: any) {
    try {
      if (this.status !== RUN_STATUS.PENDING) {
        return this
      }
      this.input = input
      this.status = RUN_STATUS.RUNNING
      let snapshot = this.getSnapshot()
      this.eventHub.emit(WORKFLOW_EVENT.START, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      this.output = await Promise.all(this.works.map((work) => work.start(input, { workflow: this })))
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
      if (this.status !== RUN_STATUS.RUNNING) {
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

export class Work {
  id: string
  readonly type = 'work'
  name?: string
  description?: string
  input: any
  output: any
  error?: string
  meta?: Record<string, any>
  status: RunStatus = RUN_STATUS.PENDING
  steps: Step[] = []
  readonly eventHub: EventHub<WorkEventMap>
  constructor(options?: WorkOptions) {
    this.id = options?.id ?? uuid()
    this.name = options?.name
    this.description = options?.description
    this.status = options?.status ?? RUN_STATUS.PENDING
    this.input = options?.input
    this.output = options?.output
    this.error = options?.error
    this.meta = options?.meta
    this.eventHub = new EventHub<WorkEventMap>()
    options?.steps.forEach((step) => this.add(step))
  }

  getSnapshot(): WorkSnapshot {
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

  add(step: Step) {
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
  }

  delete(stepId: string) {
    this.steps = this.steps.filter((step) => {
      if (step.id === stepId) {
        step.eventHub.off()
        return false
      }
      return true
    })
  }

  query(stepId: string) {
    return this.steps.find((step) => step.id === stepId)
  }

  async start(input: any, context?: WorkContext) {
    try {
      if (this.status !== RUN_STATUS.PENDING && this.status !== RUN_STATUS.STOPPED) {
        return this
      }
      this.input = input
      this.status = RUN_STATUS.RUNNING
      let snapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.START, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      let currentInput = input
      for (const step of this.steps) {
        const res = await step.start(currentInput, { ...context, work: this })
        currentInput = res.output
      }
      this.status = RUN_STATUS.SUCCESS
      this.output = currentInput
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
      if (this.status !== RUN_STATUS.RUNNING) {
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
      await Promise.all(this.steps.map((step) => step.resume()))
      const snapshot = this.getSnapshot()
      this.eventHub.emit(WORK_EVENT.RESUME, snapshot)
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

export class Step {
  id: string
  readonly type = 'step'
  name?: string
  description?: string
  input: any
  output: any
  error?: string
  meta?: any
  status: RunStatus = RUN_STATUS.PENDING
  readonly eventHub: EventHub<StepEventMap>
  private pauseResolvers?: PromiseWithResolvers<void>
  private stopResolvers?: PromiseWithResolvers<void>
  private run?: (input: any, context?: StepContext) => Promise<any>
  constructor(options?: StepOptions) {
    this.id = options?.id ?? uuid()
    this.name = options?.name
    this.description = options?.description
    this.status = options?.status ?? RUN_STATUS.PENDING
    this.input = options?.input
    this.output = options?.output
    this.error = options?.error
    this.meta = options?.meta
    this.run = options?.run
    this.eventHub = new EventHub<StepEventMap>()
  }

  getSnapshot(): StepSnapshot {
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

  async start(input: any, context?: StepContext) {
    try {
      if (this.status !== RUN_STATUS.PENDING && this.status !== RUN_STATUS.STOPPED) {
        return this
      }
      this.input = input
      this.status = RUN_STATUS.RUNNING
      let snapshot = this.getSnapshot()
      this.eventHub.emit(STEP_EVENT.START, snapshot)
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
      await this.pauseResolvers?.promise
      await this.stopResolvers?.promise
      const output = await this.run?.(input, context)
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
    }
  }
  async pause() {
    try {
      if (this.status !== RUN_STATUS.RUNNING) {
        return this
      }
      this.status = RUN_STATUS.PAUSED
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
