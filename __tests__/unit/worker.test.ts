import { describe, it, expect, beforeEach } from "vitest";
import {
  Worker,
  type WorkerResult,
  type ExecutionContext,
  type NextFunction,
  ExecutionStatus,
} from "workflow";

// 具体的测试 Worker 实现
class SimpleWorker extends Worker {
  constructor(id: string = `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, name?: string) {
    super({ id, name });
  }

  async execute(context: ExecutionContext, next: NextFunction): Promise<void> {
    await next({ success: true, data: `Processed: ${context.data}` });
  }
}

class AsyncWorker extends Worker {
  constructor(private delay: number = 100) {
    super({ id: "async-worker", name: "Async Worker" });
  }

  async execute(context: ExecutionContext, next: NextFunction): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.delay));
    await next({ success: true, data: `Async result after ${this.delay}ms` });
  }
}

class FailingWorker extends Worker {
  constructor() {
    super({ id: "failing-worker", name: "Failing Worker" });
  }

  async execute(context: ExecutionContext, next: NextFunction): Promise<void> {
    // 执行失败：不调用 next，直接返回
    return;
  }
}

class LogicalFailureWorker extends Worker {
  constructor() {
    super({ id: "logical-failure-worker", name: "Logical Failure Worker" });
  }

  async execute(context: ExecutionContext, next: NextFunction): Promise<void> {
    // 逻辑失败：调用 next 但标记失败
    await next({ 
      success: false, 
      error: "Intentional logical failure for testing"
    });
  }
}

class ContextDependentWorker extends Worker {
  constructor() {
    super({ id: "context-worker", name: "Context Dependent Worker" });
  }

  async execute(context: ExecutionContext, next: NextFunction): Promise<void> {
    // 查找历史中的特定结果
    const previousResult = context.history.find(
      (r) => r.workerId === "simple-worker",
    );

    await next({
      success: true,
      data: {
        currentData: context.data,
        previousWorkerResult: previousResult?.success ? previousResult.data : undefined,
        historyCount: context.history.length,
        executionPath: context.executionPath,
      }
    });
  }
}

describe("Worker 基类功能", () => {
  // 测试辅助函数：模拟 next 调用数据
  let capturedNextResult: any = undefined;
  let nextCallCount = 0;
  
  // 创建一个可以捕获数据的 mock next 函数
  const createCapturingMockNext = (): NextFunction => {
    return async (result: any): Promise<void> => {
      capturedNextResult = result;
      nextCallCount++;
    };
  };
  
  beforeEach(() => {
    capturedNextResult = undefined;
    nextCallCount = 0;
  });

  describe("Worker 构造和属性", () => {
    it("应该创建带有自动生成 ID 的 Worker", () => {
      const worker = new SimpleWorker();

      expect(worker.id).toBeDefined();
      expect(worker.id).toMatch(/^worker-\d+-[a-z0-9]+$/);
      expect(worker.name).toBe("Unnamed Worker");
      expect(worker.type).toBe("worker");
    });

    it("应该创建带有自定义 ID 和名称的 Worker", () => {
      const worker = new SimpleWorker("custom-id", "Custom Worker");

      expect(worker.id).toBe("custom-id");
      expect(worker.name).toBe("Custom Worker");
      expect(worker.type).toBe("worker");
    });
  });

  describe("Worker 执行", () => {
    it("应该成功执行并通过 next 传递数据", async () => {
      const worker = new SimpleWorker("test-worker", "Test Worker");
      const context: ExecutionContext = {
        data: "test input",
        metadata: {},
        history: [],
        workflowId: "test-workflow",
        executionPath: [],
        status: ExecutionStatus.RUNNING,
      };

      const mockNext = createCapturingMockNext();
      await worker.execute(context, mockNext);

      // 验证 next 被调用了
      expect(nextCallCount).toBe(1);
      expect(capturedNextResult.success).toBe(true);
      expect(capturedNextResult.data).toBe("Processed: test input");
    });

    it("应该处理异步执行", async () => {
      const worker = new AsyncWorker(50);
      const context: ExecutionContext = {
        data: "async input",
        metadata: {},
        history: [],
        workflowId: "test-workflow",
        executionPath: [],
        status: ExecutionStatus.RUNNING,
      };

      const mockNext = createCapturingMockNext();
      const startTime = Date.now();
      await worker.execute(context, mockNext);
      const endTime = Date.now();

      // 验证异步执行时间
      expect(endTime - startTime).toBeGreaterThanOrEqual(45); // 考虑时间误差
      // 验证 next 被调用并传递了正确的数据
      expect(nextCallCount).toBe(1);
      expect(capturedNextResult.success).toBe(true);
      expect(capturedNextResult.data).toBe("Async result after 50ms");
    });

    it("应该处理执行失败", async () => {
      const worker = new FailingWorker();
      const context: ExecutionContext = {
        data: "test input",
        metadata: {},
        history: [],
        workflowId: "test-workflow",
        executionPath: [],
        status: ExecutionStatus.RUNNING,
      };

      const mockNext = createCapturingMockNext();
      await worker.execute(context, mockNext);

      // 失败的 worker 不应该调用 next
      expect(nextCallCount).toBe(0);
      expect(capturedNextResult).toBeUndefined();
    });

    it("应该处理逻辑失败", async () => {
      const worker = new LogicalFailureWorker();
      const context: ExecutionContext = {
        data: "test input",
        metadata: {},
        history: [],
        workflowId: "test-workflow",
        executionPath: [],
        status: ExecutionStatus.RUNNING,
      };

      const mockNext = createCapturingMockNext();
      await worker.execute(context, mockNext);

      // 逻辑失败的 worker 应该调用 next 但标记失败
      expect(nextCallCount).toBe(1);
      expect(capturedNextResult.success).toBe(false);
      expect(capturedNextResult.error).toBe("Intentional logical failure for testing");
      expect(capturedNextResult.data).toBeUndefined(); // 失败结果不应该有 data
    });

    it("应该能够访问执行上下文", async () => {
      const worker = new ContextDependentWorker();
      const context: ExecutionContext = {
        data: "current data",
        metadata: { key: "value" },
        history: [
          {
            workerId: "simple-worker",
            workerName: "Simple Worker",
            success: true,
            data: "previous result",
            executedAt: Date.now(),
          },
        ],
        workflowId: "test-workflow",
        executionPath: ["simple-worker"],
        status: ExecutionStatus.RUNNING,
      };

      const mockNext = createCapturingMockNext();
      await worker.execute(context, mockNext);

      expect(nextCallCount).toBe(1);
      expect(capturedNextResult.success).toBe(true);
      expect(capturedNextResult.data).toEqual({
        currentData: "current data",
        previousWorkerResult: "previous result",
        historyCount: 1,
        executionPath: ["simple-worker"],
      });
    });
  });

  describe("Worker 类型系统", () => {
    it("Worker 应该具有正确的类型标识", () => {
      const worker = new SimpleWorker();

      expect(worker.type).toBe("worker");
    });

    it("应该能够通过类型进行区分", () => {
      const worker = new SimpleWorker();

      if (worker.type === "worker") {
        // TypeScript 应该能够推断这是一个 Worker
        expect(worker.execute).toBeDefined();
      } else {
        // 这个分支不应该执行
        expect(true).toBe(false);
      }
    });
  });

  describe("Worker 洋葱模型执行", () => {
    it("应该允许 Worker 通过 next 传递数据", async () => {
      class MinimalWorker extends Worker {
        constructor() {
          super({ id: "minimal-worker" });
        }

        async execute(context: ExecutionContext, next: NextFunction): Promise<void> {
          await next({ success: true, data: "minimal result" });
        }
      }

      const worker = new MinimalWorker();
      const context: ExecutionContext = {
        data: "test",
        metadata: {},
        history: [],
        workflowId: "test-workflow",
        executionPath: [],
        status: ExecutionStatus.RUNNING,
      };

      const mockNext = createCapturingMockNext();
      const result = await worker.execute(context, mockNext);

      // Worker.execute 应该返回 void
      expect(result).toBeUndefined();
      
      // 数据应该通过 next 传递
      expect(nextCallCount).toBe(1);
      expect(capturedNextResult.success).toBe(true);
      expect(capturedNextResult.data).toBe("minimal result");
      
      // 验证 worker 属性
      expect(worker.id).toBe("minimal-worker");
      expect(worker.name).toBe("Unnamed Worker");
    });

    it("应该支持通过 next 传递 metadata", async () => {
      class MetadataWorker extends Worker {
        constructor() {
          super({ id: "metadata-worker" });
        }

        async execute(context: ExecutionContext, next: NextFunction): Promise<void> {
          await next({
            success: true,
            data: "result with metadata",
            metadata: {
              category: "test",
              priority: "high"
            }
          });
        }
      }

      const worker = new MetadataWorker();
      const context: ExecutionContext = {
        data: "test",
        metadata: {},
        history: [],
        workflowId: "test-workflow",
        executionPath: [],
        status: ExecutionStatus.RUNNING,
      };

      const mockNext = createCapturingMockNext();
      await worker.execute(context, mockNext);

      // 验证数据通过 next 传递
      expect(nextCallCount).toBe(1);
      expect(capturedNextResult.success).toBe(true);
      expect(capturedNextResult.data).toBe("result with metadata");
      
      // 验证 metadata 被正确传递
      expect(capturedNextResult.metadata).toEqual({
        category: "test",
        priority: "high"
      });
    });
  });
});