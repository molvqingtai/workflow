import EventHub from './EventHub'
import { MemoryStorage, type Storage } from './MemoryStorage'
import { Snapshot } from './Snapshot'
import type { StepSnapshot, WorkSnapshot, WorkflowSnapshot } from './Snapshot'

export const WORKFLOW_EVENT = {
  START: 'workflow:start',
  SUCCESS: 'workflow:success',
  FAILED: 'workflow:failed',
  PAUSE: 'workflow:pause',
  RESUME: 'workflow:resume',
  PRELOAD: 'workflow:preload',
  CHANGE: 'workflow:change'
} as const

export const WORK_EVENT = {
  START: 'work:start',
  SUCCESS: 'work:success',
  FAILED: 'work:failed',
  PAUSE: 'work:pause',
  RESUME: 'work:resume',
  PRELOAD: 'work:preload',
  CHANGE: 'work:change'
} as const

export const STEP_EVENT = {
  START: 'step:start',
  SUCCESS: 'step:success',
  FAILED: 'step:failed',
  PAUSE: 'step:pause',
  RESUME: 'step:resume',
  PRELOAD: 'step:preload',
  CHANGE: 'step:change'
} as const

export type StepEventMap = {
  [STEP_EVENT.START]: (snapshot: StepSnapshot) => void
  [STEP_EVENT.SUCCESS]: (snapshot: StepSnapshot) => void
  [STEP_EVENT.FAILED]: (snapshot: StepSnapshot) => void
  [STEP_EVENT.PAUSE]: (snapshot: StepSnapshot) => void
  [STEP_EVENT.RESUME]: (snapshot: StepSnapshot) => void
  [STEP_EVENT.PRELOAD]: (snapshot?: StepSnapshot) => void
  [STEP_EVENT.CHANGE]: (snapshot: StepSnapshot) => void
}

export type WorkEventMap = {
  [WORK_EVENT.START]: (snapshot: WorkSnapshot) => void
  [WORK_EVENT.SUCCESS]: (snapshot: WorkSnapshot) => void
  [WORK_EVENT.FAILED]: (snapshot: WorkSnapshot) => void
  [WORK_EVENT.PAUSE]: (snapshot: WorkSnapshot) => void
  [WORK_EVENT.RESUME]: (snapshot: WorkSnapshot) => void
  [WORK_EVENT.PRELOAD]: (snapshot?: WorkSnapshot) => void
  [WORK_EVENT.CHANGE]: (snapshot: WorkSnapshot) => void
} & StepEventMap

export type WorkflowEventMap = {
  [WORKFLOW_EVENT.START]: (snapshot: WorkflowSnapshot) => void
  [WORKFLOW_EVENT.SUCCESS]: (snapshot: WorkflowSnapshot) => void
  [WORKFLOW_EVENT.FAILED]: (snapshot: WorkflowSnapshot) => void
  [WORKFLOW_EVENT.PAUSE]: (snapshot: WorkflowSnapshot) => void
  [WORKFLOW_EVENT.RESUME]: (snapshot: WorkflowSnapshot) => void
  [WORKFLOW_EVENT.PRELOAD]: (snapshot?: WorkflowSnapshot) => void
  [WORKFLOW_EVENT.CHANGE]: (snapshot: WorkflowSnapshot) => void
} & WorkEventMap

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

export interface WorkflowOptions {
  id: string
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

export interface StepOptions {
  id: string
  name?: string
  description?: string
  storage?: Storage
  run: (input: any, context: StepContext) => Promise<any>
}

export interface WorkContext {
  workflow: Workflow
}

export interface StepContext {
  workflow: Workflow
  work: Work
}

export class Workflow {
  id: string
  type = 'workflow'
  name?: string
  description?: string
  input: any
  output: any
  error?: string
  status: WorkflowStatus = STATUS.PENDING
  works: Work[] = []
  storage: Storage
  private eventHub: EventHub<WorkflowEventMap>
  private snapshot = new Snapshot(this)
  private preloadPromise?: Promise<void>
  constructor(options: WorkflowOptions) {
    this.id = options.id
    this.name = options.name
    this.description = options.description
    this.storage = options?.storage ?? new MemoryStorage()
    this.eventHub = new EventHub<WorkflowEventMap>()
  }

  preload() {
    this.preloadPromise = this.snapshot.restore().then((res) => {
      const snapshot = res?.snapshot?.capture()
      this.eventHub.emit(WORKFLOW_EVENT.PRELOAD, snapshot)
      snapshot && this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
    })
    return this
  }

  async run(input?: any) {
    try {
      await this.preloadPromise
      if (this.status !== STATUS.PENDING) {
        return this
      }
      this.input = input
      this.status = STATUS.RUNNING
      let snapshot = await this.snapshot.save()
      this.eventHub.emit(WORKFLOW_EVENT.START, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      this.output = await Promise.all(this.works.map((work) => work.run(input, { workflow: this })))
      this.status = STATUS.SUCCESS
      snapshot = await this.snapshot.save()
      this.eventHub.emit(WORKFLOW_EVENT.SUCCESS, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = await this.snapshot.save()
      this.eventHub.emit(WORKFLOW_EVENT.FAILED, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      throw error
    }
  }
  async pause() {
    try {
      if (this.status !== STATUS.RUNNING) {
        return this
      }
      this.status = STATUS.PAUSED
      await Promise.all(this.works.map((work) => work.pause()))
      const snapshot = await this.snapshot.save()
      this.eventHub.emit(WORKFLOW_EVENT.PAUSE, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = await this.snapshot.save()
      this.eventHub.emit(WORKFLOW_EVENT.FAILED, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      throw error
    }
  }
  async resume() {
    try {
      if (this.status !== STATUS.PAUSED) {
        return this
      }
      this.status = STATUS.RUNNING
      await Promise.all(this.works.map((work) => work.resume()))
      const snapshot = await this.snapshot.save()
      this.eventHub.emit(WORKFLOW_EVENT.RESUME, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = await this.snapshot.save()
      this.eventHub.emit(WORKFLOW_EVENT.FAILED, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      throw error
    }
  }
  add(work: Work) {
    work.storage ??= this.storage
    this.works.push(work)

    work.on(WORK_EVENT.START, (snapshot) => {
      this.eventHub.emit(WORK_EVENT.START, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
    })

    work.on(WORK_EVENT.PAUSE, async (snapshot) => {
      this.eventHub.emit(WORK_EVENT.PAUSE, snapshot)
      if (this.status === STATUS.PAUSED) return
      if (this.works.every((work) => work.status === STATUS.PAUSED)) {
        this.status = STATUS.PAUSED
        const workflowSnapshot = await this.snapshot.save()
        this.eventHub.emit(WORKFLOW_EVENT.PAUSE, workflowSnapshot)
        this.eventHub.emit(WORKFLOW_EVENT.CHANGE, workflowSnapshot)
      }
    })
    work.on(WORK_EVENT.RESUME, async (snapshot) => {
      this.eventHub.emit(WORK_EVENT.RESUME, snapshot)
      if (this.status === STATUS.RUNNING) return
      if (this.works.every((work) => work.status === STATUS.RUNNING)) {
        this.status = STATUS.RUNNING
        const workflowSnapshot = await this.snapshot.save()
        this.eventHub.emit(WORKFLOW_EVENT.RESUME, workflowSnapshot)
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
  type = 'work'
  name?: string
  description?: string
  input: any
  output: any
  error?: string
  status: WorkStatus = STATUS.PENDING
  steps: Step[] = []
  storage?: Storage
  private eventHub: EventHub<WorkEventMap>
  private snapshot = new Snapshot(this)
  private preloadPromise?: Promise<void>
  constructor(options: WorkOptions) {
    this.id = options.id
    this.name = options.name
    this.description = options.description
    this.storage = options?.storage
    this.eventHub = new EventHub<WorkEventMap>()
  }
  preload() {
    this.preloadPromise = this.snapshot.restore().then((res) => {
      const snapshot = res?.snapshot?.capture()
      this.eventHub.emit(WORK_EVENT.PRELOAD, snapshot)
      snapshot && this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
    })
    return this
  }
  async run(input: any, context: WorkContext) {
    try {
      await this.preloadPromise
      if (this.status !== STATUS.PENDING) {
        return this
      }
      this.input = input
      this.status = STATUS.RUNNING
      let snapshot = await this.snapshot.save()
      this.eventHub.emit(WORK_EVENT.START, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      let currentInput = input
      for (const step of this.steps) {
        const res = await step.run(currentInput, { ...context, work: this })
        currentInput = res.output
      }
      this.status = STATUS.SUCCESS
      this.output = currentInput
      snapshot = await this.snapshot.save()
      this.eventHub.emit(WORK_EVENT.SUCCESS, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = await this.snapshot.save()
      this.eventHub.emit(WORK_EVENT.FAILED, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      throw error
    }
  }
  async pause() {
    try {
      if (this.status !== STATUS.RUNNING) {
        return this
      }
      this.status = STATUS.PAUSED
      await Promise.all(this.steps.map((step) => step.pause()))
      const snapshot = await this.snapshot.save()
      this.eventHub.emit(WORK_EVENT.PAUSE, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = await this.snapshot.save()
      this.eventHub.emit(WORK_EVENT.FAILED, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      throw error
    }
  }

  async resume() {
    try {
      if (this.status !== STATUS.PAUSED) {
        return this
      }
      this.status = STATUS.RUNNING
      await Promise.all(this.steps.map((step) => step.resume()))
      const snapshot = await this.snapshot.save()
      this.eventHub.emit(WORK_EVENT.RESUME, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = await this.snapshot.save()
      this.eventHub.emit(WORK_EVENT.FAILED, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      throw error
    }
  }

  add(step: Step) {
    step.storage ??= this.storage
    this.steps.push(step)

    step.on(STEP_EVENT.START, async (snapshot) => {
      this.eventHub.emit(STEP_EVENT.START, snapshot)

      if (this.status === STATUS.RUNNING) return
      this.status = STATUS.RUNNING
      const workSnapshot = await this.snapshot.save()
      this.eventHub.emit(WORK_EVENT.START, workSnapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, workSnapshot)
    })

    step.on(STEP_EVENT.PAUSE, async (snapshot) => {
      this.eventHub.emit(STEP_EVENT.PAUSE, snapshot)

      if (this.status === STATUS.PAUSED) return
      this.status = STATUS.PAUSED
      const workSnapshot = await this.snapshot.save()
      this.eventHub.emit(WORK_EVENT.PAUSE, workSnapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, workSnapshot)
    })

    step.on(STEP_EVENT.RESUME, async (snapshot) => {
      this.eventHub.emit(STEP_EVENT.RESUME, snapshot)

      if (this.status === STATUS.RUNNING) return
      this.status = STATUS.RUNNING
      const workSnapshot = await this.snapshot.save()
      this.eventHub.emit(WORK_EVENT.RESUME, workSnapshot)
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
    })
    return this
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
  type = 'step'
  name?: string
  description?: string
  input: any
  output: any
  error?: string
  status: StepStatus = STATUS.PENDING
  storage?: Storage
  private eventHub: EventHub<StepEventMap>
  private snapshot = new Snapshot(this)
  private preloadPromise?: Promise<void>
  private pauseResolvers?: PromiseWithResolvers<void>
  private _run: (input: any, context: StepContext) => Promise<any>
  constructor(options: StepOptions) {
    this.id = options.id
    this.name = options.name
    this.description = options.description
    this.storage = options?.storage
    this.eventHub = new EventHub<StepEventMap>()
    this._run = options.run
  }
  preload() {
    this.preloadPromise = this.snapshot.restore().then((res) => {
      const snapshot = res?.snapshot?.capture()
      this.eventHub.emit(STEP_EVENT.PRELOAD, snapshot)
      snapshot && this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
    })
    return this
  }
  async run(input: any, context: StepContext) {
    try {
      await this.preloadPromise
      if (this.status !== STATUS.PENDING) {
        return this
      }
      this.input = input
      this.status = STATUS.RUNNING
      let snapshot = await this.snapshot.save()
      this.eventHub.emit(STEP_EVENT.START, snapshot)
      await this.pauseResolvers?.promise
      const output = await this._run(input, context)
      await this.pauseResolvers?.promise
      this.output = output
      this.status = STATUS.SUCCESS
      snapshot = await this.snapshot.save()
      this.eventHub.emit(STEP_EVENT.SUCCESS, snapshot)
      return this
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = await this.snapshot.save()
      this.eventHub.emit(STEP_EVENT.FAILED, snapshot)
      throw error
    }
  }
  async pause() {
    try {
      await this.preloadPromise
      if (this.status !== STATUS.RUNNING) {
        return this
      }
      this.status = STATUS.PAUSED
      this.pauseResolvers = Promise.withResolvers<void>()
      const snapshot = await this.snapshot.save()
      this.eventHub.emit(STEP_EVENT.PAUSE, snapshot)
      return this
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = await this.snapshot.save()
      this.eventHub.emit(STEP_EVENT.FAILED, snapshot)
      throw error
    }
  }
  async resume() {
    try {
      if (this.status !== STATUS.PAUSED) {
        return this
      }
      this.pauseResolvers?.resolve()
      this.status = STATUS.RUNNING
      const snapshot = await this.snapshot.save()
      this.eventHub.emit(STEP_EVENT.RESUME, snapshot)
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = await this.snapshot.save()
      this.eventHub.emit(STEP_EVENT.FAILED, snapshot)
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
