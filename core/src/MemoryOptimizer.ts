import type { Workflow, Work, Step, WorkflowSnapshot, WorkSnapshot, StepSnapshot } from './Workflow'

/**
 * MemoryOptimizer - Uses WeakMap to manage lifecycle-bound data
 *
 * This utility helps prevent memory leaks by:
 * 1. Auto-cleaning listeners when components are garbage collected
 * 2. Breaking circular references between parent-child components
 * 3. Caching snapshots to avoid redundant calculations
 */
export class MemoryOptimizer {
  // Store cleanup functions for event listeners
  // When component is GC'd, the WeakMap entry is automatically removed
  private static listenerCleanups = new WeakMap<Work | Step, Array<() => void>>()

  // Store parent references without creating circular dependencies
  // Using WeakMap prevents the child from keeping parent alive
  private static parentWorkflows = new WeakMap<Work, Workflow<any, any, any>>()
  private static parentWorks = new WeakMap<Step, Work<any, any, any>>()

  // Cache snapshots to avoid redundant calculations
  // Automatically cleared when component is GC'd
  private static snapshotCache = new WeakMap<
    Workflow<any, any, any> | Work<any, any, any> | Step<any, any, any>,
    WorkflowSnapshot | WorkSnapshot | StepSnapshot
  >()

  // Track if component has changed since last snapshot
  private static changeFlags = new WeakMap<
    Workflow<any, any, any> | Work<any, any, any> | Step<any, any, any>,
    boolean
  >()

  /**
   * Store cleanup functions for a component's event listeners
   */
  static registerListenerCleanups(component: Work | Step, cleanups: Array<() => void>): void {
    const existing = this.listenerCleanups.get(component) || []
    this.listenerCleanups.set(component, [...existing, ...cleanups])
  }

  /**
   * Execute all cleanup functions for a component and remove them
   */
  static cleanupListeners(component: Work | Step): void {
    const cleanups = this.listenerCleanups.get(component)
    if (cleanups) {
      cleanups.forEach((cleanup) => cleanup())
      this.listenerCleanups.delete(component)
    }
  }

  /**
   * Set parent reference for a Work (parent is Workflow)
   */
  static setParentWorkflow(work: Work<any, any, any>, workflow: Workflow<any, any, any>): void {
    this.parentWorkflows.set(work, workflow)
  }

  /**
   * Get parent Workflow for a Work
   */
  static getParentWorkflow(work: Work<any, any, any>): Workflow<any, any, any> | undefined {
    return this.parentWorkflows.get(work)
  }

  /**
   * Remove parent Workflow reference for a Work
   */
  static clearParentWorkflow(work: Work<any, any, any>): void {
    this.parentWorkflows.delete(work)
  }

  /**
   * Set parent reference for a Step (parent is Work)
   */
  static setParentWork(step: Step<any, any, any>, work: Work<any, any, any>): void {
    this.parentWorks.set(step, work)
  }

  /**
   * Get parent Work for a Step
   */
  static getParentWork(step: Step<any, any, any>): Work<any, any, any> | undefined {
    return this.parentWorks.get(step)
  }

  /**
   * Remove parent Work reference for a Step
   */
  static clearParentWork(step: Step<any, any, any>): void {
    this.parentWorks.delete(step)
  }

  /**
   * Cache a snapshot for a component (generic version)
   */
  static cacheSnapshot<T extends WorkflowSnapshot | WorkSnapshot | StepSnapshot>(
    component: Workflow<any, any, any> | Work<any, any, any> | Step<any, any, any>,
    snapshot: T
  ): void {
    this.snapshotCache.set(component, snapshot)
    this.changeFlags.set(component, false)
  }

  /**
   * Get cached snapshot if component hasn't changed (generic version)
   * Returns typed snapshot without needing type assertion
   */
  static getCachedSnapshot<T extends WorkflowSnapshot | WorkSnapshot | StepSnapshot>(
    component: Workflow<any, any, any> | Work<any, any, any> | Step<any, any, any>
  ): T | undefined {
    const hasChanged = this.changeFlags.get(component)
    if (hasChanged === false) {
      return this.snapshotCache.get(component) as T | undefined
    }
    return undefined
  }

  /**
   * Mark component as changed, invalidating cached snapshot
   */
  static markChanged(component: Workflow<any, any, any> | Work<any, any, any> | Step<any, any, any>): void {
    this.changeFlags.set(component, true)
    this.snapshotCache.delete(component)
  }

  /**
   * Clear all cached data for a component
   */
  static clearComponent(component: Work | Step): void {
    this.cleanupListeners(component)
    this.snapshotCache.delete(component)
    this.changeFlags.delete(component)

    if ('work' in component) {
      // It's a Step
      this.clearParentWork(component as Step<any, any, any>)
    } else {
      // It's a Work
      this.clearParentWorkflow(component as Work<any, any, any>)
    }
  }

  /**
   * Get memory usage statistics (for debugging)
   * Note: WeakMaps don't expose size, so this is limited
   */
  static getStats(): { message: string } {
    return {
      message:
        'WeakMap-based storage is active. Entries are automatically cleaned up when components are garbage collected.'
    }
  }
}
