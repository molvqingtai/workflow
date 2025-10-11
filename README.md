# Workflow

Type-safe workflow primitives for long-running TypeScript agents.

[![version](https://img.shields.io/github/v/release/molvqingtai/@whatfa/workflow)](https://www.npmjs.com/package/@whatfa/workflow) [![workflow](https://github.com/molvqingtai/@whatfa/workflow/actions/workflows/ci.yml/badge.svg)](https://github.com/molvqingtai/workflow/actions) [![download](https://img.shields.io/npm/dt/@whatfa/workflow)](https://www.npmjs.com/package/@whatfa/workflow) [![npm package minimized gzipped size](https://img.shields.io/bundlejs/size/@whatfa/workflow)](https://www.npmjs.com/package/@whatfa/workflow) [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/molvqingtai/workflow)

## Introduction
Workflow is a lightweight orchestration runtime that models long-lived processes as nested `Workflow → Work → Step` objects. Each layer tracks status, input/output payloads, and metadata, enabling you to observe and control complex agent pipelines. The core package is written in TypeScript with strong generic typing so callers can describe the shape of inputs, outputs, and metadata and receive inference-safe snapshots back.


## Features
- **Composable primitives** – express flow as `Workflow → Work → Step`, each with lifecycle controls (`start`, `pause`, `resume`, `stop`).
- **Strong typing** – generics propagate input, output, and metadata types across snapshots, events, and run contexts.
- **Event-first architecture** – observe progress via `workflow.on(...)` listeners fed by a typed `EventHub` implementation.
- **Runtime friendly** – zero dependencies outside the repository, ships as modern ESM with type declarations.

## Installation
```bash
# npm	npm install @whatfa/workflow
# pnpm	pnpm add @whatfa/workflow
# yarn	yarn add @whatfa/workflow
```

## Quick Start
```ts
import { Workflow, Work, Step } from '@whatfa/workflow'

type StepMeta = { retries: number }

const double = new Step<number, number, StepMeta>({
  id: 'double',
  meta: { retries: 0 },
  async run(value) {
    return value * 2
  }
})

const work = new Work<number, number>({ id: 'main', steps: [double] })

const workflow = new Workflow<number, Work<number, number>[], { createdBy: string }>({
  id: 'demo',
  works: [work],
  meta: { createdBy: 'docs' }
})

const result = await workflow.start(21)
console.log(result.output?.[0].output) // 42

workflow.on('workflow:change', (snapshot) => {
  snapshot.meta?.createdBy // type: string | undefined
})
```


### Snapshot & Event Typing
```ts
// continuing the quick start example above
type FlowMeta = { traceId: string }

const typedWorkflow = new Workflow<{ userId: string }, Work<number, number>[], FlowMeta>({
  works: [work],
  meta: { traceId: 'abc123' }
})

typedWorkflow.on('workflow:success', (snapshot) => {
  snapshot.meta.traceId // string
  snapshot.input?.userId // string | undefined
  snapshot.output?.[0].output // number | undefined
})
```

## License
MIT © molvqingtai
