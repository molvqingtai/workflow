import EventHub from './EventHub'

export interface WorkflowSnapshot {
  id: string
  name?: string
  description?: string
  type: 'workflow'
  status: WorkflowStatus
  input?: any
  output?: any
  error?: string
  works: Array<WorkSnapshot>
}

export interface WorkSnapshot {
  id: string
  name?: string
  description?: string
  type: 'work'
  status: WorkStatus
  input?: any
  output?: any
  error?: string
  steps: Array<StepSnapshot>
}

export interface StepSnapshot {
  id: string
  name?: string
  description?: string
  type: 'step'
  status: StepStatus
  input?: any
  output?: any
  context?: any
  error?: string
}

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
  snapshot?: WorkflowSnapshot
}

export interface WorkOptions {
  id: string
  name?: string
  description?: string
  snapshot?: WorkSnapshot
}

export interface StepOptions {
  id: string
  name?: string
  description?: string
  snapshot?: StepSnapshot
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
  private eventHub: EventHub<WorkflowEventMap>
  private snapshot: WorkflowSnapshot
  private preloadPromise?: Promise<void>
  constructor(options: WorkflowOptions) {
    this.id = options.id
    this.name = options.name
    this.description = options.description
    this.eventHub = new EventHub<WorkflowEventMap>()
    this.snapshot = options.snapshot ?? this.toSnapshot()
    if (options.snapshot) {
      this.fromSnapshot(options.snapshot)
    }
  }

  toSnapshot(): WorkflowSnapshot {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: 'workflow',
      status: this.status,
      input: this.input,
      output: this.output,
      error: this.error,
      works: this.works.map((work) => work.toSnapshot())
    }
  }

  fromSnapshot(snapshot: WorkflowSnapshot) {
    this.id = snapshot.id
    this.name = snapshot.name
    this.description = snapshot.description
    this.type = snapshot.type
    this.status = snapshot.status
    this.input = snapshot.input
    this.output = snapshot.output
    this.error = snapshot.error
    this.snapshot = snapshot
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
      let snapshot = this.toSnapshot()
      this.eventHub.emit(WORKFLOW_EVENT.START, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      this.output = await Promise.all(this.works.map((work) => work.run(input, { workflow: this })))
      this.status = STATUS.SUCCESS
      snapshot = this.toSnapshot()
      this.eventHub.emit(WORKFLOW_EVENT.SUCCESS, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.toSnapshot()
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
      const snapshot = this.toSnapshot()
      this.eventHub.emit(WORKFLOW_EVENT.PAUSE, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.toSnapshot()
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
      const snapshot = this.toSnapshot()
      this.eventHub.emit(WORKFLOW_EVENT.RESUME, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.toSnapshot()
      this.eventHub.emit(WORKFLOW_EVENT.FAILED, snapshot)
      this.eventHub.emit(WORKFLOW_EVENT.CHANGE, snapshot)
      throw error
    }
  }
  add(work: Work) {
    this.works.push(work)
    const snapshot = this.snapshot.works.find((w) => w.id === work.id)
    snapshot && work.fromSnapshot(snapshot)

    this.eventHub.emit(WORKFLOW_EVENT.CHANGE, this.toSnapshot())

    work.on(WORK_EVENT.START, (snapshot) => {
      this.eventHub.emit(WORK_EVENT.START, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
    })

    work.on(WORK_EVENT.PAUSE, async (snapshot) => {
      this.eventHub.emit(WORK_EVENT.PAUSE, snapshot)
      if (this.status === STATUS.PAUSED) return
      if (this.works.every((work) => work.status === STATUS.PAUSED)) {
        this.status = STATUS.PAUSED
        const workflowSnapshot = this.toSnapshot()
        this.eventHub.emit(WORKFLOW_EVENT.PAUSE, workflowSnapshot)
        this.eventHub.emit(WORKFLOW_EVENT.CHANGE, workflowSnapshot)
      }
    })
    work.on(WORK_EVENT.RESUME, async (snapshot) => {
      this.eventHub.emit(WORK_EVENT.RESUME, snapshot)
      if (this.status === STATUS.RUNNING) return
      if (this.works.every((work) => work.status === STATUS.RUNNING)) {
        this.status = STATUS.RUNNING
        const workflowSnapshot = this.toSnapshot()
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
  private eventHub: EventHub<WorkEventMap>
  private snapshot: WorkSnapshot
  private preloadPromise?: Promise<void>
  constructor(options: WorkOptions) {
    this.id = options.id
    this.name = options.name
    this.description = options.description
    this.eventHub = new EventHub<WorkEventMap>()
    this.snapshot = options.snapshot ?? this.toSnapshot()
    if (options.snapshot) {
      this.fromSnapshot(options.snapshot)
    }
  }

  toSnapshot(): WorkSnapshot {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: 'work',
      status: this.status,
      input: this.input,
      output: this.output,
      error: this.error,
      steps: this.steps.map((step) => step.toSnapshot())
    }
  }

  fromSnapshot(snapshot: WorkSnapshot) {
    this.id = snapshot.id
    this.name = snapshot.name
    this.description = snapshot.description
    this.type = snapshot.type
    this.status = snapshot.status
    this.input = snapshot.input
    this.output = snapshot.output
    this.error = snapshot.error
    this.snapshot = snapshot
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
      let snapshot = this.toSnapshot()
      this.eventHub.emit(WORK_EVENT.START, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      let currentInput = input
      for (const step of this.steps) {
        const res = await step.run(currentInput, { ...context, work: this })
        currentInput = res.output
      }
      this.status = STATUS.SUCCESS
      this.output = currentInput
      snapshot = this.toSnapshot()
      this.eventHub.emit(WORK_EVENT.SUCCESS, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.toSnapshot()
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
      const snapshot = this.toSnapshot()
      this.eventHub.emit(WORK_EVENT.PAUSE, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.toSnapshot()
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
      const snapshot = this.toSnapshot()
      this.eventHub.emit(WORK_EVENT.RESUME, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.toSnapshot()
      this.eventHub.emit(WORK_EVENT.FAILED, snapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, snapshot)
      throw error
    }
  }

  add(step: Step) {
    this.steps.push(step)
    const snapshot = this.snapshot.steps.find((s) => s.id === step.id)
    snapshot && step.fromSnapshot(snapshot)

    this.eventHub.emit(WORK_EVENT.CHANGE, this.toSnapshot())

    step.on(STEP_EVENT.START, async (snapshot) => {
      this.eventHub.emit(STEP_EVENT.START, snapshot)

      if (this.status === STATUS.RUNNING) return
      this.status = STATUS.RUNNING
      const workSnapshot = this.toSnapshot()
      this.eventHub.emit(WORK_EVENT.START, workSnapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, workSnapshot)
    })

    step.on(STEP_EVENT.PAUSE, async (snapshot) => {
      this.eventHub.emit(STEP_EVENT.PAUSE, snapshot)

      if (this.status === STATUS.PAUSED) return
      this.status = STATUS.PAUSED
      const workSnapshot = this.toSnapshot()
      this.eventHub.emit(WORK_EVENT.PAUSE, workSnapshot)
      this.eventHub.emit(WORK_EVENT.CHANGE, workSnapshot)
    })

    step.on(STEP_EVENT.RESUME, async (snapshot) => {
      this.eventHub.emit(STEP_EVENT.RESUME, snapshot)

      if (this.status === STATUS.RUNNING) return
      this.status = STATUS.RUNNING
      const workSnapshot = this.toSnapshot()
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
  private eventHub: EventHub<StepEventMap>
  private snapshot: StepSnapshot
  private preloadPromise?: Promise<void>
  private pauseResolvers?: PromiseWithResolvers<void>
  private _run: (input: any, context: StepContext) => Promise<any>
  constructor(options: StepOptions) {
    this.id = options.id
    this.name = options.name
    this.description = options.description
    this.eventHub = new EventHub<StepEventMap>()
    this.snapshot = options.snapshot ?? this.toSnapshot()
    this._run = options.run
    if (options.snapshot) {
      this.fromSnapshot(options.snapshot)
    }
  }
  toSnapshot(): StepSnapshot {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: 'step',
      status: this.status,
      input: this.input,
      output: this.output,
      error: this.error
    }
  }
  fromSnapshot(snapshot: StepSnapshot) {
    this.id = snapshot.id
    this.name = snapshot.name
    this.description = snapshot.description
    this.type = snapshot.type
    this.status = snapshot.status
    this.input = snapshot.input
    this.output = snapshot.output
    this.error = snapshot.error
    this.snapshot = snapshot
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
      let snapshot = this.toSnapshot()
      this.eventHub.emit(STEP_EVENT.START, snapshot)
      await this.pauseResolvers?.promise
      const output = await this._run(input, context)
      await this.pauseResolvers?.promise
      this.output = output
      this.status = STATUS.SUCCESS
      snapshot = this.toSnapshot()
      this.eventHub.emit(STEP_EVENT.SUCCESS, snapshot)
      return this
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.toSnapshot()
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
      const snapshot = this.toSnapshot()
      this.eventHub.emit(STEP_EVENT.PAUSE, snapshot)
      return this
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.toSnapshot()
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
      const snapshot = this.toSnapshot()
      this.eventHub.emit(STEP_EVENT.RESUME, snapshot)
      this.eventHub.emit(STEP_EVENT.CHANGE, snapshot)
      return this
    } catch (error) {
      this.status = STATUS.FAILED
      this.error = (error as Error).message
      const snapshot = this.toSnapshot()
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
