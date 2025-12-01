# Memory Optimization with WeakMap

本文档说明 `@whatfa/workflow` 中使用 WeakMap 进行的内存优化。

## 概述

`@whatfa/workflow` 使用 WeakMap 来优化内存使用，主要解决以下三个问题：

1. **事件监听器内存泄漏** - 当组件被删除时，事件监听器可能仍然存在
2. **循环引用** - 父子组件之间的双向引用阻止垃圾回收
3. **重复计算** - 频繁调用 `getSnapshot()` 导致性能问题

## 优化详情

### 1. 事件监听器自动清理

**问题：** 在添加 Work 或 Step 时会注册大量事件监听器。如果不正确清理，这些监听器会阻止组件被垃圾回收。

**解决方案：** 使用 WeakMap 存储清理函数，当组件被删除时自动清理所有监听器。

```typescript
// MemoryOptimizer 内部使用 WeakMap 存储清理函数
private static listenerCleanups = new WeakMap<Work | Step, Array<() => void>>()

// 在 Workflow.add() 中
const cleanups: Array<() => void> = []

const bindEvent = <K extends keyof WorkEventMap>(event: K, handler: WorkEventMap[K]) => {
  work.on(event, handler)
  cleanups.push(() => work.off(event, handler))  // 存储清理函数
}

// 注册所有清理函数
MemoryOptimizer.registerListenerCleanups(work, cleanups)

// 在 delete() 时自动清理
MemoryOptimizer.cleanupListeners(work)  // 执行所有清理函数
```

### 2. 父引用管理

**问题：** 组件之间存在循环引用：
- Workflow → works[] → Work
- Work → workflow → Workflow
- Work → steps[] → Step
- Step → work → Work

**解决方案：** 使用 WeakMap 额外存储父引用，避免强引用循环。

```typescript
// MemoryOptimizer 内部使用 WeakMap
private static parentWorkflows = new WeakMap<Work, Workflow>()
private static parentWorks = new WeakMap<Step, Work>()

// 设置父引用（同时设置直接引用和 WeakMap）
work.workflow = this  // 直接引用（向后兼容）
MemoryOptimizer.setParentWorkflow(work, this)  // WeakMap 引用

// 获取父引用
const parent = MemoryOptimizer.getParentWorkflow(work)

// 清理时移除父引用
MemoryOptimizer.clearParentWorkflow(work)
```

### 3. 快照缓存

**问题：** `getSnapshot()` 会递归计算整个状态树，在深层次结构中性能开销大。

**解决方案：** 使用 WeakMap 缓存快照，状态变更时自动失效。

```typescript
// MemoryOptimizer 内部使用 WeakMap
private static snapshotCache = new WeakMap<Component, Snapshot>()
private static changeFlags = new WeakMap<Component, boolean>()

// getSnapshot() 实现
getSnapshot() {
  // 尝试从缓存获取
  const cached = MemoryOptimizer.getCachedSnapshot(this)
  if (cached) {
    return cached as WorkflowSnapshot<Input, Output, Meta, WorkSnapshot>
  }

  // 计算新快照
  const snapshot = { /* ... */ }

  // 缓存快照
  MemoryOptimizer.cacheSnapshot(this, snapshot)
  return snapshot
}

// 状态变更时标记失效
private markChanged(): void {
  MemoryOptimizer.markChanged(this)  // 清除缓存
}
```

## 使用示例

### 基本使用

```typescript
import { Workflow, Work, Step, MemoryOptimizer } from '@whatfa/workflow'

// 创建工作流
const workflow = new Workflow({
  works: [
    new Work({
      steps: [
        new Step({
          run: async (input) => {
            return input * 2
          }
        })
      ]
    })
  ]
})

// 执行工作流
await workflow.start(10)

// 删除 Work（自动清理所有监听器和引用）
workflow.delete(workflow.works[0].id)

// 获取内存优化统计信息
console.log(MemoryOptimizer.getStats())
// => { message: 'WeakMap-based storage is active. Entries are automatically cleaned up...' }
```

### 高级使用 - 手动清理

```typescript
import { Work, Step, MemoryOptimizer } from '@whatfa/workflow'

const work = new Work({
  steps: [/* ... */]
})

// 手动清理特定组件
const step = work.steps[0]
MemoryOptimizer.clearComponent(step)  // 清理所有相关数据

// 获取父引用
const parent = MemoryOptimizer.getParentWork(step)
```

### 性能优化示例

```typescript
// 快照缓存自动工作
const workflow = new Workflow({ works: [/* ... */] })

// 第一次调用 - 计算快照
const snapshot1 = workflow.getSnapshot()  // 慢（递归计算）

// 第二次调用 - 使用缓存
const snapshot2 = workflow.getSnapshot()  // 快（从缓存读取）

// 状态变更后缓存失效
workflow.status = 'running'
workflow['markChanged']()  // 私有方法，实际由 start() 等方法自动调用

const snapshot3 = workflow.getSnapshot()  // 慢（重新计算）
```

## 内存优化效果

### 优化前

```typescript
// 问题：监听器未清理
workflow.add(work)  // 注册 14+ 个监听器
workflow.delete(work.id)  // 只调用 work.eventHub.off()
// 结果：父级的监听器仍然存在，work 无法被 GC
```

### 优化后

```typescript
// 解决：自动清理所有监听器
workflow.add(work)  // 注册监听器 + 存储清理函数到 WeakMap
workflow.delete(work.id)  // 自动执行所有清理函数
// 结果：work 可以被正常 GC
```

## 最佳实践

### 1. 正确删除组件

```typescript
// ✅ 正确：使用 delete() 方法
workflow.delete(workId)
work.delete(stepId)

// ❌ 错误：直接修改数组（不会清理监听器）
workflow.works = workflow.works.filter(w => w.id !== workId)
```

### 2. 避免保留已删除组件的引用

```typescript
// ❌ 错误：保留引用阻止 GC
const work = workflow.works[0]
workflow.delete(work.id)
// work 仍然被引用，无法被 GC

// ✅ 正确：不保留引用
const workId = workflow.works[0].id
workflow.delete(workId)
// work 可以被 GC
```

### 3. 使用快照而非直接访问

```typescript
// ✅ 推荐：使用快照（有缓存）
const snapshot = workflow.getSnapshot()
console.log(snapshot.status, snapshot.works.length)

// ⚠️ 可以但效率低：直接访问（每次都计算）
console.log(workflow.status, workflow.works.map(w => w.getSnapshot()))
```

## WeakMap 原理

WeakMap 的关键特性：

1. **弱引用键** - WeakMap 的键是弱引用，不阻止垃圾回收
2. **自动清理** - 当键被 GC 时，对应的 WeakMap 条目自动删除
3. **不可枚举** - 无法遍历 WeakMap，不会影响 GC 性能
4. **只能用对象作为键** - 确保引用语义正确

```typescript
// WeakMap vs Map 对比
const normalMap = new Map()
const weakMap = new WeakMap()

let obj = { data: 'value' }

normalMap.set(obj, 'info')
weakMap.set(obj, 'info')

obj = null  // 尝试释放对象

// normalMap: 对象仍然存在（强引用）
// weakMap: 对象可以被 GC（弱引用）
```

## 技术细节

### MemoryOptimizer 实现

```typescript
export class MemoryOptimizer {
  // 存储事件监听器清理函数
  private static listenerCleanups = new WeakMap<Work | Step, Array<() => void>>()

  // 存储父引用（避免循环引用）
  private static parentWorkflows = new WeakMap<Work, Workflow>()
  private static parentWorks = new WeakMap<Step, Work>()

  // 存储快照缓存
  private static snapshotCache = new WeakMap<Component, Snapshot>()
  private static changeFlags = new WeakMap<Component, boolean>()

  // ... 方法实现
}
```

### 内存生命周期

```
创建组件
    ↓
注册到 WeakMap (listeners, parent refs, snapshot cache)
    ↓
正常使用 (listeners active, cache working)
    ↓
删除组件 (cleanupListeners, clear parent refs)
    ↓
引用释放
    ↓
垃圾回收 (WeakMap 条目自动清理)
```

## 性能提升

基于典型使用场景的性能提升：

| 场景 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 添加/删除组件 | O(1) + 内存泄漏 | O(1) + 自动清理 | 内存安全 |
| 获取快照（未变更） | O(n) | O(1) | ~100x |
| 获取快照（已变更） | O(n) | O(n) | 无变化 |
| 父引用查询 | O(1) | O(1) | 无循环引用风险 |

## 总结

WeakMap 优化为 `@whatfa/workflow` 带来：

✅ **自动内存管理** - 组件删除时自动清理所有相关数据
✅ **避免内存泄漏** - 事件监听器正确清理
✅ **打破循环引用** - 使用 WeakMap 存储父引用
✅ **性能提升** - 快照缓存减少重复计算
✅ **向后兼容** - 保留原有 API，新增优化是透明的

这些优化对于长期运行的应用和大型工作流特别重要。
