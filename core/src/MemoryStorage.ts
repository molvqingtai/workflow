import type { WorkflowSnapshot, WorkSnapshot, StepSnapshot } from './Snapshot'

// 所有快照类型的联合类型
type AnySnapshot = WorkflowSnapshot | WorkSnapshot | StepSnapshot

// Storage interface
export interface Storage {
  get(key: string): Promise<AnySnapshot | undefined | null>
  set(key: string, value: AnySnapshot): Promise<any>
  delete(key: string): Promise<any>
}

export class MemoryStorage implements Storage {
  private data = new Map<string, AnySnapshot>()

  async get(key: string): Promise<AnySnapshot | undefined | null> {
    return this.data.get(key)
  }

  async set(key: string, value: AnySnapshot): Promise<any> {
    this.data.set(key, value)
  }

  async delete(key: string): Promise<any> {
    this.data.delete(key)
  }
}
