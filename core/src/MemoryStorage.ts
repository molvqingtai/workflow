import type { WorkflowSnapshot } from './StateManager'

// Storage interface
export interface Storage {
  get(key: string): Promise<WorkflowSnapshot | undefined | null>
  set(key: string, value: WorkflowSnapshot): Promise<any>
  delete(key: string): Promise<any>
}

export class MemoryStorage implements Storage {
  private data = new Map<string, WorkflowSnapshot>()

  async get(key: string): Promise<WorkflowSnapshot | undefined | null> {
    return this.data.get(key)
  }

  async set(key: string, value: WorkflowSnapshot): Promise<any> {
    this.data.set(key, value)
  }

  async delete(key: string): Promise<any> {
    this.data.delete(key)
  }
}
