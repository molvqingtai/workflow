import type { Workflow, Work, Step, WorkflowStatus, WorkStatus, StepStatus } from './Workflow'

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

export class Snapshot<T extends Workflow | Work | Step> {
  readonly runner: T
  constructor(runner: T) {
    this.runner = runner
  }

  capture(): T extends Workflow
    ? WorkflowSnapshot
    : T extends Work
      ? WorkSnapshot
      : T extends Step
        ? StepSnapshot
        : never {
    switch (this.runner.type) {
      case 'workflow': {
        const workflow = this.runner as Workflow
        return {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          type: 'workflow',
          status: workflow.status,
          input: workflow.input,
          output: workflow.output,
          error: workflow.error,
          works: workflow.works.map((work) => new Snapshot(work).capture())
        } as any
      }
      case 'work': {
        const work = this.runner as Work
        return {
          id: work.id,
          name: work.name,
          description: work.description,
          type: 'work',
          status: work.status,
          input: work.input,
          output: work.output,
          error: work.error,
          steps: work.steps.map((step) => new Snapshot(step).capture())
        } as any
      }
      case 'step': {
        const step = this.runner as Step
        return {
          id: step.id,
          name: step.name,
          description: step.description,
          type: 'step',
          status: step.status,
          input: step.input,
          output: step.output,
          error: step.error
        } as any
      }
      default:
        throw new Error('Unknown runner type')
    }
  }

  async restore(): Promise<T | undefined> {
    return this.read().then(async (snapshot) => {
      if (!snapshot) return undefined
      switch (this.runner.type) {
        case 'workflow': {
          const workflow = this.runner as Workflow
          workflow.status = snapshot.status
          workflow.input = snapshot.input
          workflow.output = snapshot.output
          workflow.error = snapshot.error
          workflow.works = (await Promise.all(workflow.works.map((work) => new Snapshot(work).restore()))).filter(
            (work) => !!work
          )
          break
        }
        case 'work': {
          const work = this.runner as Work
          work.status = snapshot.status
          work.input = snapshot.input
          work.output = snapshot.output
          work.error = snapshot.error
          work.steps = (await Promise.all(work.steps.map((step) => new Snapshot(step).restore()))).filter(
            (step) => !!step
          )
          break
        }
        case 'step': {
          const step = this.runner as Step
          step.status = snapshot.status
          step.input = snapshot.input
          step.output = snapshot.output
          step.error = snapshot.error
          break
        }
      }
      return this.runner
    })
  }

  // save 方法
  async save(): Promise<
    T extends Workflow ? WorkflowSnapshot : T extends Work ? WorkSnapshot : T extends Step ? StepSnapshot : never
  > {
    const data = this.capture()
    await this.runner.storage?.set(`${this.runner.type}:${this.runner.id}`, data)
    return data as any
  }

  // read 方法
  async read(): Promise<
    | (T extends Workflow ? WorkflowSnapshot : T extends Work ? WorkSnapshot : T extends Step ? StepSnapshot : never)
    | null
    | undefined
  > {
    return this.runner.storage?.get(`${this.runner.type}:${this.runner.id}`) as any
  }
}
