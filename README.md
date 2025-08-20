# Workflow Engine

一个基于 TypeScript 的通用工作流引擎，支持可暂停、可继续、可观察的执行模式。

## 核心特性

- ✅ **链式调用**: `new Workflow().add(worker1).add(worker2)`
- ✅ **嵌套工作流**: 支持无限层级的工作流嵌套
- ✅ **上下文传递**: 每个 Worker 可以访问前置执行结果和历史
- ✅ **可暂停/继续**: 支持运行时暂停和恢复执行
- ✅ **事件驱动**: 完全基于事件的状态和进度监听
- ✅ **外置存储**: 支持自定义存储实现
- ✅ **检查点**: 支持断点续传
- ✅ **类型安全**: 完整的 TypeScript 类型定义

## 快速开始

### 基本使用

```typescript
import Workflow, { Worker, WorkflowEvents } from './index';

// 1. 创建自定义 Worker
class MyWorker extends Worker {
  async execute(context: ExecutionContext): Promise<WorkerResult> {
    // 获取上一个 Worker 的结果
    const previousResult = ContextHelper.getPreviousResult(context);
    
    // 执行业务逻辑
    const result = await this.processData(context.data);
    
    return {
      workerId: this.id,
      workerName: this.name,
      success: true,
      data: result,
      executedAt: new Date(),
      duration: 0
    };
  }
}

// 2. 创建工作流
const workflow = new Workflow({
  id: 'my-workflow',
  name: 'My Data Pipeline'
});

// 3. 链式添加 Workers
workflow
  .add(new DataFetcherWorker())
  .add(new DataProcessorWorker())
  .add(new DataSaverWorker());

// 4. 监听事件
workflow.on(WorkflowEvents.PROGRESS_UPDATED, (data) => {
  console.log(`Progress: ${data.progress?.percentage}%`);
});

workflow.on(WorkflowEvents.COMPLETED, (data) => {
  console.log('Workflow completed!', data.data);
});

// 5. 执行工作流
const result = await workflow.execute({ input: 'data' });
```

### 嵌套工作流

```typescript
// 创建子工作流
const validationWorkflow = new Workflow({
  id: 'validation',
  name: 'Data Validation'
}).add(new ValidatorWorker());

// 创建主工作流，包含嵌套工作流
const mainWorkflow = new Workflow({
  id: 'main',
  name: 'Main Pipeline'
})
.add(new FetcherWorker())
.add(validationWorkflow)  // 嵌套工作流
.add(new SaverWorker());

await mainWorkflow.execute({ source: 'api' });
```

### 暂停和恢复

```typescript
// 开始执行
const executionPromise = workflow.execute({ data: 'test' });

// 暂停执行
await workflow.pause();

// 恢复执行
await workflow.resume();

// 取消执行
await workflow.cancel();

const result = await executionPromise;
```

### 事件监听

```typescript
// 监听所有事件类型
workflow.on(WorkflowEvents.STARTED, (data) => {
  console.log('Workflow started');
});

workflow.on(WorkflowEvents.WORKER_STARTED, (data) => {
  console.log(`Worker started: ${data.workerId}`);
});

workflow.on(WorkflowEvents.WORKER_COMPLETED, (data) => {
  console.log(`Worker completed: ${data.workerId}`);
});

workflow.on(WorkflowEvents.PROGRESS_UPDATED, (data) => {
  console.log(`Progress: ${data.progress?.percentage}%`);
});

workflow.on(WorkflowEvents.STATUS_CHANGED, (data) => {
  console.log(`Status: ${data.status?.from} → ${data.status?.to}`);
});

workflow.on(WorkflowEvents.PAUSED, (data) => {
  console.log('Workflow paused');
});

workflow.on(WorkflowEvents.RESUMED, (data) => {
  console.log('Workflow resumed');
});
```

### 使用外部 EventHub

```typescript
import { YourEventHub } from './your-eventhub';

const eventHub = new YourEventHub();

const workflow = new Workflow({
  id: 'workflow-with-external-hub',
  name: 'Workflow with External EventHub',
  eventHub: eventHub  // 使用外部 EventHub
});

// 现在所有事件都会通过您的 EventHub 发出
```

### 上下文和历史访问

```typescript
import { ContextHelper } from './index';

class MyWorker extends Worker {
  async execute(context: ExecutionContext): Promise<WorkerResult> {
    // 获取上一个 Worker 的结果
    const previousResult = ContextHelper.getPreviousResult(context);
    
    // 获取指定 Worker 的结果
    const fetcherResult = ContextHelper.getWorkerResult(context, 'data-fetcher');
    
    // 检查某个 Worker 是否执行成功
    const isFetcherSuccessful = ContextHelper.isWorkerSuccessful(context, 'data-fetcher');
    
    // 获取所有成功的结果
    const successfulResults = ContextHelper.getSuccessfulResults(context);
    
    // 合并所有历史数据
    const mergedData = ContextHelper.mergeHistoryData(context);
    
    // 访问执行路径
    console.log('Execution path:', context.executionPath);
    
    // 访问全局元数据
    console.log('Metadata:', context.metadata);
    
    return {
      workerId: this.id,
      workerName: this.name,
      success: true,
      data: processedData,
      executedAt: new Date(),
      duration: 0
    };
  }
}
```

### 自定义存储

```typescript
class CustomStorage implements Storage {
  get(key: string): any {
    // 从数据库/文件系统/Redis 等获取数据
  }
  
  set(key: string, value: any): void {
    // 保存到数据库/文件系统/Redis 等
  }
}

const workflow = new Workflow({
  id: 'workflow-with-storage',
  name: 'Workflow with Custom Storage',
  storage: new CustomStorage()
});
```

## API 参考

### Workflow 类

#### 构造函数选项

```typescript
interface WorkflowConfig {
  id?: string;           // 工作流ID，默认自动生成
  name?: string;         // 工作流名称
  description?: string;  // 描述
  storage?: Storage;     // 存储实现，默认内存存储
  eventHub?: EventHub;   // 事件中心，默认内置实现
}
```

#### 主要方法

- `add(worker: Worker | Workflow): Workflow` - 添加 Worker 或嵌套工作流
- `execute(initialData?: any): Promise<WorkerResult>` - 执行工作流
- `pause(): Promise<void>` - 暂停执行
- `resume(): Promise<void>` - 恢复执行
- `cancel(): Promise<void>` - 取消执行
- `has(item: string | Worker | Workflow): boolean` - 检查是否包含
- `query(item: string | Worker | Workflow): Worker | Workflow | undefined` - 查询项目
- `remove(item: string | Worker | Workflow): boolean` - 移除项目
- `size(): number` - 获取项目数量
- `clear(): void` - 清空所有项目
- `on(event: string, listener: Function): void` - 监听事件
- `off(event: string, listener: Function): void` - 取消监听
- `once(event: string, listener: Function): void` - 一次性监听

### Worker 抽象类

```typescript
abstract class Worker {
  readonly id: string;
  readonly name: string;
  readonly type: 'worker';
  readonly description?: string;
  
  constructor(options: WorkerConfig);
  abstract execute(context: ExecutionContext): Promise<WorkerResult>;
}
```

### 事件类型

```typescript
const WorkflowEvents = {
  STARTED: 'workflow:started',
  WORKER_STARTED: 'workflow:worker:started',
  WORKER_COMPLETED: 'workflow:worker:completed',
  WORKER_FAILED: 'workflow:worker:failed',
  PROGRESS_UPDATED: 'workflow:progress:updated',
  STATUS_CHANGED: 'workflow:status:changed',
  PAUSED: 'workflow:paused',
  RESUMED: 'workflow:resumed',
  COMPLETED: 'workflow:completed',
  FAILED: 'workflow:failed',
  CANCELLED: 'workflow:cancelled'
};
```

### 执行状态

```typescript
enum ExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}
```

## 运行示例

```bash
# 安装依赖
npm install

# 编译 TypeScript
npx tsc

# 运行示例
node example.js
```

## 许可证

MIT License