import { ExecutionStatus } from './workflow'
import type { Worker, Workflow, WorkerResult } from './workflow'
import type { Storage } from './MemoryStorage'
import { ExecutionState } from './ExecutionEngine'

// 快照数据结构
export interface WorkerSnapshot {
  id: string
  name?: string
  description?: string
  type: 'worker'
  status: ExecutionStatus
  result?: WorkerResult
}

export interface WorkflowSnapshot {
  id: string
  name?: string
  description?: string
  type: 'workflow'
  status: ExecutionStatus
  children: Array<WorkerSnapshot | WorkflowSnapshot>
}

/**
 * 状态管理器
 * 负责工作流状态的序列化、反序列化和持久化
 */
export class StateManager {
  private storage: Storage
  private workflowId: string

  constructor(storage: Storage, workflowId: string) {
    this.storage = storage
    this.workflowId = workflowId
  }

  /**
   * 自动恢复状态
   */
  async autoRestore(nodePool: Map<string, Worker | Workflow>, executionOrder: string[]): Promise<ExecutionState | null> {
    const snapshot = await this.storage.get(`workflow:${this.workflowId}:state`)
    if (!snapshot) {
      return null
    }

    try {
      this.validateSnapshot(snapshot, nodePool)
      const restoredState = this.deserializeSnapshot(snapshot, executionOrder)

      const completedCount = snapshot.children.filter(
        (c) => c.status === ExecutionStatus.SUCCESS || c.status === ExecutionStatus.FAILED
      ).length

      console.log(`🔄 恢复状态: ${completedCount}/${snapshot.children.length} 已完成`)
      return restoredState
    } catch (error) {
      console.error('Failed to restore state:', error)
      return null
    }
  }

  /**
   * 自动保存状态
   */
  async autoSave(
    executionState: ExecutionState,
    nodePool: Map<string, Worker | Workflow>,
    executionOrder: string[],
    workflowName: string
  ): Promise<void> {
    try {
      const snapshot = this.serializeState(executionState, nodePool, executionOrder, workflowName)
      await this.storage.set(`workflow:${this.workflowId}:state`, snapshot)
    } catch (error) {
      console.error('Auto-save failed:', error)
    }
  }

  /**
   * 清理状态存储
   */
  async cleanupState(): Promise<void> {
    await this.storage.delete(`workflow:${this.workflowId}:state`)
  }

  /**
   * 序列化执行状态
   */
  private serializeState(
    executionState: ExecutionState,
    nodePool: Map<string, Worker | Workflow>,
    executionOrder: string[],
    workflowName: string
  ): WorkflowSnapshot {
    const children = executionOrder
      .map((workerId) => nodePool.get(workerId))
      .filter((item) => !!item)
      .map((item) => {
        if (item!.type === 'worker') {
          return this.serializeWorker(item as Worker, executionState)
        } else {
          return this.serializeNestedWorkflow(item as Workflow)
        }
      })

    // 从 nodePool 获取工作流实例来访问描述
    const workflowInstance = [...nodePool.values()].find(item => item.type === 'workflow' && item.id === this.workflowId) as Workflow | undefined

    return {
      id: this.workflowId,
      name: workflowName,
      description: workflowInstance?.description,
      type: 'workflow',
      status: executionState.status,
      children
    }
  }

  /**
   * 序列化 Worker
   */
  private serializeWorker(worker: Worker, executionState: ExecutionState): WorkerSnapshot {
    const isExecuted = executionState.executedNodes.has(worker.id)
    const result = executionState.context.history.find((h) => h.workerId === worker.id)

    const status: ExecutionStatus =
      isExecuted && result
        ? result.success
          ? ExecutionStatus.SUCCESS
          : ExecutionStatus.FAILED
        : ExecutionStatus.PENDING

    return {
      id: worker.id,
      name: worker.name,
      description: worker.description,
      type: 'worker',
      status,
      result
    }
  }

  /**
   * 序列化嵌套工作流
   */
  private serializeNestedWorkflow(workflow: Workflow): WorkflowSnapshot {
    try {
      // 尝试序列化嵌套工作流的状态
      return (workflow as any).serialize() // 需要访问 serialize 方法
    } catch {
      // 如果嵌套工作流没有执行状态，返回基本快照
      return {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        type: 'workflow',
        status: ExecutionStatus.PENDING,
        children: []
      }
    }
  }

  /**
   * 反序列化快照
   */
  private deserializeSnapshot(snapshot: WorkflowSnapshot, executionOrder: string[]): ExecutionState {
    const { executedNodes, history } = snapshot.children.reduce(
      (acc, child) => {
        if (child.type === 'worker') {
          const workerSnapshot = child as WorkerSnapshot
          if (workerSnapshot.status === ExecutionStatus.SUCCESS || workerSnapshot.status === ExecutionStatus.FAILED) {
            acc.executedNodes.add(workerSnapshot.id)
            if (workerSnapshot.result) {
              acc.history.push(workerSnapshot.result)
            }
          }
        } else {
          // 处理嵌套工作流
          if (child.status === ExecutionStatus.SUCCESS || child.status === ExecutionStatus.FAILED) {
            acc.executedNodes.add(child.id)
          }
        }
        return acc
      },
      { executedNodes: new Set<string>(), history: [] as any[] }
    )

    // 计算当前数据
    const currentData = history.length > 0 ? history[history.length - 1].data : undefined

    // 找到当前应该执行的节点
    const currentNodeId = executionOrder[0] // 洋葱模型中由 next 函数控制流程

    // 重建执行状态
    const restoredState = new ExecutionState(currentNodeId, {
      data: currentData,
      metadata: {},
      history,
      workflowId: this.workflowId,
      executionPath: [],
      status: snapshot.status
    })

    // 恢复已执行的节点
    executedNodes.forEach((nodeId) => restoredState.addExecutedNode(nodeId))
    restoredState.setStatus(snapshot.status)

    return restoredState
  }

  /**
   * 验证快照是否与当前工作流匹配
   */
  private validateSnapshot(snapshot: WorkflowSnapshot, nodePool: Map<string, Worker | Workflow>): void {
    this.validateSnapshotChildren(snapshot.children, nodePool)
  }

  /**
   * 验证快照子节点
   */
  private validateSnapshotChildren(
    children: Array<WorkerSnapshot | WorkflowSnapshot>,
    nodePool: Map<string, Worker | Workflow>
  ): void {
    const missingNodes = children.filter((child) => !nodePool.has(child.id))
    if (missingNodes.length > 0) {
      const missingNode = missingNodes[0]
      throw new Error(`Required ${missingNode.type} ${missingNode.id} not found in current workflow`)
    }

    // 递归验证嵌套工作流
    children
      .filter((child): child is WorkflowSnapshot => child.type === 'workflow')
      .forEach((child) => {
        const nestedWorkflow = nodePool.get(child.id) as Workflow
        if (nestedWorkflow && (nestedWorkflow as any).validateSnapshotChildren) {
          ;(nestedWorkflow as any).validateSnapshotChildren(child.children)
        }
      })
  }
}
