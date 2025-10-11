import { describe, it, expect } from 'vitest'
import { Workflow, Work, Step, RUN_STATUS } from '@whatfa/workflow'
import type { RunStatus } from '@whatfa/workflow'

const asNumber = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined)

describe('End-to-End Integration Tests', () => {
  describe('Workflow-to-Step Full Execution', () => {
    it('runs the Workflow -> Work -> Step sequence', async () => {
      const step1 = new Step({
        id: 'step-1',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return input * 2
        }
      })

      const step2 = new Step({
        id: 'step-2',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return input + 10
        }
      })

      const work = new Work({
        id: 'integration-work',
        steps: [step1, step2]
      })

      const workflow = new Workflow({
        id: 'integration-workflow',
        works: [work]
      })

      expect(workflow.status).toBe(RUN_STATUS.PENDING)
      expect(workflow.getSnapshot().status).toBe(RUN_STATUS.PENDING)
      const result = await workflow.start(5)

      // Validate the overall execution result
      expect(result.status).toBe(RUN_STATUS.SUCCESS)
      expect(result.input).toBe(5)
      expect(result.output).toHaveLength(1)
      expect(result.works[0].output).toBe(20) // (5 * 2) + 10

      // Validate step-level state
      expect(step1.status).toBe(RUN_STATUS.SUCCESS)
      expect(step1.input).toBe(5)
      expect(step1.output).toBe(10)

      expect(step2.status).toBe(RUN_STATUS.SUCCESS)
      expect(step2.input).toBe(10)
      expect(step2.output).toBe(20)
    })

    it('pauses the workflow and all steps', async () => {
      let step1Started = false
      let step2Started = false

      const step1 = new Step({
        id: 'pause-step-1',
        run: async (input: number) => {
          step1Started = true
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      })

      const step2 = new Step({
        id: 'pause-step-2',
        run: async (input: number) => {
          step2Started = true
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input + 5
        }
      })

      const work = new Work({
        id: 'pause-work',
        steps: [step1, step2]
      })

      const workflow = new Workflow({
        id: 'pause-workflow',
        works: [work]
      })

      // Start execution
      const runPromise = workflow.start(10)

      // Wait for execution to begin
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(step1Started).toBe(true)

      // Pause the workflow
      const pauseResult = await workflow.pause()
      expect(pauseResult.status).toBe(RUN_STATUS.PAUSED)

      // Verify every component is paused
      expect(work.status).toBe(RUN_STATUS.PAUSED)
      expect(step1.status).toBe(RUN_STATUS.PAUSED)

      // Resume execution
      const resumeResult = await workflow.resume()
      expect(resumeResult.status).toBe(RUN_STATUS.RUNNING)

      // Wait for the run to complete
      const finalResult = await runPromise
      expect(finalResult.status).toBe(RUN_STATUS.SUCCESS)
      expect(finalResult.works[0].output).toBe(25) // (10 * 2) + 5
    })

    it('rebuilds workflow state from snapshot data', async () => {
      // Create snapshot data from a previously executed workflow
      const workflowSnapshot = {
        id: 'restored-workflow',
        name: 'Restored Workflow',
        description: 'A workflow restored from snapshot',
        type: 'workflow' as const,
        status: 'success' as const,
        input: 100,
        output: [{ status: 'success', output: 250 }],
        works: [
          {
            id: 'restored-work',
            name: 'Restored Work',
            type: 'work' as const,
            status: 'success' as const,
            input: 100,
            output: 250,
            steps: [
              {
                id: 'restored-step-1',
                name: 'Restored Step 1',
                type: 'step' as const,
                status: 'success' as const,
                input: 100,
                output: 200
              },
              {
                id: 'restored-step-2',
                name: 'Restored Step 2',
                type: 'step' as const,
                status: 'success' as const,
                input: 200,
                output: 250
              }
            ]
          }
        ]
      }

      // Rebuild the workflow from the snapshot
      const restoredStep1 = new Step({
        id: 'restored-step-1',
        name: 'Restored Step 1',
        status: 'success',
        input: 100,
        output: 200,
        run: async (input: number) => input * 2
      })

      const restoredStep2 = new Step({
        id: 'restored-step-2',
        name: 'Restored Step 2',
        status: 'success',
        input: 200,
        output: 250,
        run: async (input: number) => input + 50
      })

      const restoredWork = new Work({
        id: 'restored-work',
        name: 'Restored Work',
        status: 'success',
        input: 100,
        output: 250,
        steps: [restoredStep1, restoredStep2]
      })

      const restoredWorkflow = new Workflow({
        id: 'restored-workflow',
        name: 'Restored Workflow',
        description: 'A workflow restored from snapshot',
        status: 'success',
        input: 100,
        output: [{ status: 'success', output: 250 }],
        works: [restoredWork]
      })

      // Validate the restored workflow state
      expect(restoredWorkflow.status).toBe('success')
      expect(restoredWorkflow.input).toBe(100)
      expect(restoredWorkflow.works).toHaveLength(1)
      expect(restoredWorkflow.works[0].status).toBe('success')
      expect(restoredWorkflow.works[0].output).toBe(250)

      // Validate restored step state
      expect(restoredStep1.status).toBe('success')
      expect(restoredStep1.input).toBe(100)
      expect(restoredStep1.output).toBe(200)

      expect(restoredStep2.status).toBe('success')
      expect(restoredStep2.input).toBe(200)
      expect(restoredStep2.output).toBe(250)

      // Confirm the snapshot is produced correctly
      const currentSnapshot = restoredWorkflow.getSnapshot()
      expect(currentSnapshot.id).toBe(workflowSnapshot.id)
      expect(currentSnapshot.status).toBe(workflowSnapshot.status)
      expect(currentSnapshot.works).toHaveLength(1)
      expect(currentSnapshot.works[0].steps).toHaveLength(2)
    })

    it('handles runtime errors and propagates status', async () => {
      const errorStep = new Step({
        id: 'error-step',
        run: async (input: number) => {
          throw new Error('Step execution failed')
        }
      })

      const normalStep = new Step({
        id: 'normal-step',
        run: async (input: number) => input * 2
      })

      const work = new Work({
        id: 'error-work',
        steps: [normalStep, errorStep] // error occurs at the second step
      })

      const workflow = new Workflow({
        id: 'error-workflow',
        works: [work]
      })

      // Execution should fail
      await expect(workflow.start(10)).rejects.toThrow('Step execution failed')

      // Validate error state propagation
      expect(workflow.status).toBe(RUN_STATUS.FAILED)
      expect(work.status).toBe(RUN_STATUS.FAILED)
      expect(errorStep.status).toBe(RUN_STATUS.FAILED)

      // The first step should still succeed
      expect(normalStep.status).toBe(RUN_STATUS.SUCCESS)
      expect(normalStep.output).toBe(20)
    })
  })

  describe('Parallel Work Execution', () => {
    it('executes multiple works in parallel', async () => {
      const work1Step = new Step({
        id: 'work1-step',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 3
        }
      })

      const work2Step = new Step({
        id: 'work2-step',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return input + 100
        }
      })

      const work1 = new Work({
        id: 'parallel-work-1',
        steps: [work1Step]
      })

      const work2 = new Work({
        id: 'parallel-work-2',
        steps: [work2Step]
      })

      const workflow = new Workflow({
        id: 'parallel-workflow',
        works: [work1, work2]
      })

      const startTime = Date.now()
      const result = await workflow.start(10)
      const endTime = Date.now()

      // Confirm parallel execution (should be ~100ms, not 150ms)
      const executionTime = endTime - startTime
      expect(executionTime).toBeLessThan(130) // allow small buffer

      // Validate results
      expect(result.status).toBe(RUN_STATUS.SUCCESS)
      expect(result.output).toHaveLength(2)
      expect(work1.output).toBe(30) // 10 * 3
      expect(work2.output).toBe(110) // 10 + 100
    })

    it('handles partial work failure', async () => {
      const successStep = new Step({
        id: 'success-step',
        run: async (input: number) => input * 2
      })

      const errorStep = new Step({
        id: 'error-step-2',
        run: async (input: number) => {
          throw new Error('Work 2 failed')
        }
      })

      const work1 = new Work({
        id: 'success-work',
        steps: [successStep]
      })

      const work2 = new Work({
        id: 'error-work-2',
        steps: [errorStep]
      })

      const workflow = new Workflow({
        id: 'partial-error-workflow',
        works: [work1, work2]
      })

      await expect(workflow.start(5)).rejects.toThrow()

      // Workflow should fail
      expect(workflow.status).toBe(RUN_STATUS.FAILED)

      // Successful work should complete
      expect(work1.status).toBe(RUN_STATUS.SUCCESS)
      expect(successStep.status).toBe(RUN_STATUS.SUCCESS)
      expect(successStep.output).toBe(10)

      // Failing work should fail
      expect(work2.status).toBe(RUN_STATUS.FAILED)
      expect(errorStep.status).toBe(RUN_STATUS.FAILED)
    })
  })

  describe('Event Propagation Integrity', () => {
    it('propagates events through all levels', async () => {
      const allEvents: string[] = []

      const step = new Step({
        id: 'event-step',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return input * 2
        }
      })

      const work = new Work({
        id: 'event-work',
        steps: [step]
      })

      const workflow = new Workflow({
        id: 'event-workflow',
        works: [work]
      })

      // Listen for events across all levels
      workflow.on('workflow:start', () => allEvents.push('workflow:start'))
      workflow.on('workflow:success', () => allEvents.push('workflow:success'))
      workflow.on('work:start', () => allEvents.push('work:start'))
      workflow.on('work:success', () => allEvents.push('work:success'))
      workflow.on('step:start', () => allEvents.push('step:start'))
      workflow.on('step:success', () => allEvents.push('step:success'))

      await workflow.start(10)

      // Verify the order and completeness of events
      expect(allEvents).toEqual([
        'workflow:start',
        'work:start',
        'step:start',
        'step:success',
        'work:success',
        'workflow:success'
      ])
    })

    it('propagates pause and resume events', async () => {
      const pauseResumeEvents: string[] = []

      const step = new Step({
        id: 'pause-resume-step',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      })

      const work = new Work({
        id: 'pause-resume-work',
        steps: [step]
      })

      const workflow = new Workflow({
        id: 'pause-resume-workflow',
        works: [work]
      })

      // Listen for pause/resume events
      workflow.on('workflow:pause', () => pauseResumeEvents.push('workflow:pause'))
      workflow.on('workflow:resume', () => pauseResumeEvents.push('workflow:resume'))
      workflow.on('work:pause', () => pauseResumeEvents.push('work:pause'))
      workflow.on('work:resume', () => pauseResumeEvents.push('work:resume'))
      workflow.on('step:pause', () => pauseResumeEvents.push('step:pause'))
      workflow.on('step:resume', () => pauseResumeEvents.push('step:resume'))

      const runPromise = workflow.start(10)

      await new Promise((resolve) => setTimeout(resolve, 50))
      await workflow.pause()
      await workflow.resume()
      await runPromise

      // Verify pause/resume propagation
      expect(pauseResumeEvents).toContain('step:pause')
      expect(pauseResumeEvents).toContain('work:pause')
      expect(pauseResumeEvents).toContain('workflow:pause')
      expect(pauseResumeEvents).toContain('step:resume')
      expect(pauseResumeEvents).toContain('work:resume')
      expect(pauseResumeEvents).toContain('workflow:resume')
    })
  })

  describe('Pause -> Snapshot Restore -> Resume', () => {
    it('restores from snapshot after pause and continues', async () => {
      // Phase one: execute the workflow and then pause it
      const step1 = new Step({
        id: 'resume-step-1',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      })

      const step2 = new Step({
        id: 'resume-step-2',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input + 10
        }
      })

      const work = new Work({
        id: 'resume-work',
        steps: [step1, step2]
      })

      const originalWorkflow = new Workflow({
        id: 'resume-workflow',
        name: 'Resume Test Workflow',
        works: [work]
      })

      // Start execution and pause
      const runPromise = originalWorkflow.start(50)
      await new Promise((resolve) => setTimeout(resolve, 50)) // wait for the first step to start

      // Pause
      await originalWorkflow.pause()
      expect(originalWorkflow.status).toBe(RUN_STATUS.PAUSED)
      expect(work.status).toBe(RUN_STATUS.PAUSED)
      expect(step1.status).toBe(RUN_STATUS.PAUSED)

      // Capture the snapshot while paused
      const pausedSnapshot = originalWorkflow.getSnapshot()
      expect(pausedSnapshot.status).toBe('paused')
      expect(pausedSnapshot.input).toBe(50)

      // Phase two: simulate a page refresh and restore from the real snapshot
      // When restoring, convert paused status back to pending
      const convertStatusToPending = (status: RunStatus): RunStatus =>
        status === RUN_STATUS.PAUSED ? RUN_STATUS.PENDING : status

      const [step1Snapshot, step2Snapshot] = pausedSnapshot.works[0].steps
      const workSnapshot = pausedSnapshot.works[0]

      const restoredStep1 = new Step<number, number>({
        id: step1Snapshot.id,
        name: step1Snapshot.name,
        status: convertStatusToPending(step1Snapshot.status),
        input: typeof step1Snapshot.input === 'number' ? step1Snapshot.input : undefined,
        output: typeof step1Snapshot.output === 'number' ? step1Snapshot.output : undefined,
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      })

      const restoredStep2 = new Step<number, number>({
        id: step2Snapshot.id,
        name: step2Snapshot.name,
        status: convertStatusToPending(step2Snapshot.status),
        input: typeof step2Snapshot.input === 'number' ? step2Snapshot.input : undefined,
        output: typeof step2Snapshot.output === 'number' ? step2Snapshot.output : undefined,
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input + 10
        }
      })

      const restoredWork = new Work<number, number>({
        id: workSnapshot.id,
        name: workSnapshot.name,
        status: convertStatusToPending(workSnapshot.status),
        input: typeof workSnapshot.input === 'number' ? workSnapshot.input : undefined,
        output: typeof workSnapshot.output === 'number' ? workSnapshot.output : undefined,
        steps: [restoredStep1, restoredStep2]
      })

      const workflowOutput = Array.isArray(pausedSnapshot.output)
        ? (pausedSnapshot.output as Work<number, number>[])
        : undefined

      const restoredWorkflow = new Workflow<number, Work<number, number>[]>({
        id: pausedSnapshot.id,
        name: pausedSnapshot.name,
        status: convertStatusToPending(pausedSnapshot.status),
        input: typeof pausedSnapshot.input === 'number' ? pausedSnapshot.input : undefined,
        output: workflowOutput,
        works: [restoredWork]
      })

      // Validate restored state: paused -> pending
      expect(restoredWorkflow.status).toBe('pending')
      expect(restoredWork.status).toBe('pending')
      expect(restoredStep1.status).toBe('pending')

      // Phase three: rerun the workflow
      const finalResult = await restoredWorkflow.start(50)

      // Validate the final result
      expect(finalResult.status).toBe(RUN_STATUS.SUCCESS)
      expect(restoredWork.output).toBe(110) // (50 * 2) + 10
      expect(restoredStep1.status).toBe(RUN_STATUS.SUCCESS)
      expect(restoredStep1.output).toBe(100)
      expect(restoredStep2.status).toBe(RUN_STATUS.SUCCESS)
      expect(restoredStep2.output).toBe(110)
    })

    it('handles complex mid-execution pause scenarios', async () => {
      let step1Executed = false
      let step2Executed = false
      let step3Executed = false

      const step1 = new Step({
        id: 'complex-step-1',
        run: async (input: number) => {
          step1Executed = true
          return input * 2
        }
      })

      const step2 = new Step({
        id: 'complex-step-2',
        run: async (input: number) => {
          step2Executed = true
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input + 20
        }
      })

      const step3 = new Step({
        id: 'complex-step-3',
        run: async (input: number) => {
          step3Executed = true
          return input / 2
        }
      })

      const work = new Work({
        id: 'complex-resume-work',
        steps: [step1, step2, step3]
      })

      const workflow = new Workflow({
        id: 'complex-resume-workflow',
        works: [work]
      })

      // Start execution
      const runPromise = workflow.start(10)

      // Wait for step1 to finish and step2 to start
      await new Promise((resolve) => setTimeout(resolve, 50))

      // At this point step1 is done and step2 is running
      expect(step1Executed).toBe(true)
      expect(step1.status).toBe(RUN_STATUS.SUCCESS)
      expect(step1.output).toBe(20)

      // Pause execution
      await workflow.pause()
      expect(workflow.status).toBe(RUN_STATUS.PAUSED)

      // Capture a snapshot for recovery
      const midExecutionSnapshot = workflow.getSnapshot()

      // Verify the snapshot records step1 as completed
      expect(midExecutionSnapshot.works[0].steps[0].status).toBe('success')
      expect(midExecutionSnapshot.works[0].steps[0].output).toBe(20)
      expect(midExecutionSnapshot.works[0].steps[1].status).toBe('paused')
      expect(midExecutionSnapshot.works[0].steps[2].status).toBe('pending')

      // Restore from snapshot: keep success, convert paused to pending
      const convertStatusToPending = (status: RunStatus): RunStatus =>
        status === RUN_STATUS.PAUSED ? RUN_STATUS.PENDING : status

      const [recoveredStepSnapshot1, recoveredStepSnapshot2, recoveredStepSnapshot3] =
        midExecutionSnapshot.works[0].steps
      const recoveredWorkSnapshot = midExecutionSnapshot.works[0]

      const recoveredStep1 = new Step<number, number>({
        id: recoveredStepSnapshot1.id,
        name: recoveredStepSnapshot1.name,
        status: convertStatusToPending(recoveredStepSnapshot1.status),
        input: asNumber(recoveredStepSnapshot1.input),
        output: asNumber(recoveredStepSnapshot1.output),
        run: async (input: number) => input * 2
      })

      const recoveredStep2 = new Step<number, number>({
        id: recoveredStepSnapshot2.id,
        name: recoveredStepSnapshot2.name,
        status: convertStatusToPending(recoveredStepSnapshot2.status),
        input: asNumber(recoveredStepSnapshot2.input),
        output: asNumber(recoveredStepSnapshot2.output),
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input + 20
        }
      })

      const recoveredStep3 = new Step<number, number>({
        id: recoveredStepSnapshot3.id,
        name: recoveredStepSnapshot3.name,
        status: convertStatusToPending(recoveredStepSnapshot3.status),
        input: asNumber(recoveredStepSnapshot3.input),
        output: asNumber(recoveredStepSnapshot3.output),
        run: async (input: number) => input / 2
      })

      const recoveredWork = new Work<number, number>({
        id: recoveredWorkSnapshot.id,
        name: recoveredWorkSnapshot.name,
        status: convertStatusToPending(recoveredWorkSnapshot.status),
        input: asNumber(recoveredWorkSnapshot.input),
        output: asNumber(recoveredWorkSnapshot.output),
        steps: [recoveredStep1, recoveredStep2, recoveredStep3]
      })

      const midExecutionWorkflowOutput = Array.isArray(midExecutionSnapshot.output)
        ? (midExecutionSnapshot.output as Work<number, number>[])
        : undefined

      const recoveredWorkflow = new Workflow<number, Work<number, number>[]>({
        id: midExecutionSnapshot.id,
        name: midExecutionSnapshot.name,
        status: convertStatusToPending(midExecutionSnapshot.status),
        input: asNumber(midExecutionSnapshot.input),
        output: midExecutionWorkflowOutput,
        works: [recoveredWork]
      })

      // Verify restored statuses: success unchanged, paused becomes pending
      expect(recoveredStep1.status).toBe('success') // completed step stays success
      expect(recoveredStep2.status).toBe('pending') // paused becomes pending
      expect(recoveredStep3.status).toBe('pending') // remains pending

      // Replay the workflow
      const finalResult = await recoveredWorkflow.start(10)

      // Validate the final result
      expect(finalResult.status).toBe(RUN_STATUS.SUCCESS)
      expect(recoveredWork.output).toBe(20) // ((10 * 2) + 20) / 2 = 20

      // Verify every step ran correctly
      expect(recoveredStep1.status).toBe(RUN_STATUS.SUCCESS)
      expect(recoveredStep1.output).toBe(20)
      expect(recoveredStep2.status).toBe(RUN_STATUS.SUCCESS)
      expect(recoveredStep2.output).toBe(40)
      expect(recoveredStep3.status).toBe(RUN_STATUS.SUCCESS)
      expect(recoveredStep3.output).toBe(20)
    })
  })

  describe('Stop Control Integration', () => {
    it('stops a complex running workflow', async () => {
      const step1 = new Step({
        id: 'integration-stop-step1',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 2
        }
      })

      const step2 = new Step({
        id: 'integration-stop-step2',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input + 10
        }
      })

      const step3 = new Step({
        id: 'integration-stop-step3',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return input * 3
        }
      })

      const work1 = new Work({
        id: 'integration-stop-work1',
        steps: [step1, step2]
      })

      const work2 = new Work({
        id: 'integration-stop-work2',
        steps: [step3]
      })

      const workflow = new Workflow({
        id: 'integration-stop-workflow',
        works: [work1, work2]
      })

      // Listen for stop events across every level
      const stopEvents: string[] = []
      workflow.on('workflow:stop', () => stopEvents.push('workflow:stop'))
      workflow.on('work:stop', () => stopEvents.push('work:stop'))
      workflow.on('step:stop', () => stopEvents.push('step:stop'))

      // Start execution
      const runPromise = workflow.start(5)
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Stop the workflow while it is running
      await workflow.stop()

      // Verify every component is stopped
      expect(workflow.status).toBe(RUN_STATUS.STOPPED)
      expect(work1.status).toBe(RUN_STATUS.STOPPED)
      expect(work2.status).toBe(RUN_STATUS.STOPPED)
      // Only running or paused steps will be stopped
      // step2 and step3 may not have started yet, so their status may stay unchanged

      // Verify stop events fired as expected
      expect(stopEvents).toContain('workflow:stop')
      expect(stopEvents).toContain('work:stop')
      // Steps may not emit stop because they must be RUNNING or PAUSED to stop

      // Do not await the stopped execution because it would hang forever
    })

    it('stops a specific running work', async () => {
      const step1 = new Step({
        id: 'selective-stop-step1',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 200))
          return input * 2
        }
      })

      const step2 = new Step({
        id: 'selective-stop-step2',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return input + 10
        }
      })

      const work1 = new Work({
        id: 'selective-stop-work1',
        steps: [step1]
      })

      const work2 = new Work({
        id: 'selective-stop-work2',
        steps: [step2]
      })

      const workflow = new Workflow({
        id: 'selective-stop-workflow',
        works: [work1, work2]
      })

      // Start execution
      const runPromise = workflow.start(5)
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Stop only work1
      await work1.stop()

      // Verify work1 and its step are stopped
      expect(work1.status).toBe(RUN_STATUS.STOPPED)
      expect(step1.status).toBe(RUN_STATUS.STOPPED)

      // work2 should continue executing and finish
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(work2.status).toBe(RUN_STATUS.SUCCESS)
      expect(step2.status).toBe(RUN_STATUS.SUCCESS)

      // Do not await the stopped execution because it would hang forever
    })

    it('does not stop completed components', async () => {
      const step = new Step({
        id: 'completed-step',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return input * 2
        }
      })

      const work = new Work({
        id: 'completed-work',
        steps: [step]
      })

      const workflow = new Workflow({
        id: 'completed-workflow',
        works: [work]
      })

      // Execute once and finish
      await workflow.start(5)
      expect(workflow.status).toBe(RUN_STATUS.SUCCESS)
      expect(step.output).toBe(10)

      // Attempt to stop the completed workflow (should no-op)
      await workflow.stop()
      expect(workflow.status).toBe(RUN_STATUS.SUCCESS) // Workflow already completed, cannot stop
      expect(work.status).toBe(RUN_STATUS.SUCCESS) // Work already completed, cannot stop
      expect(step.status).toBe(RUN_STATUS.SUCCESS) // Step cannot be stopped once SUCCESS

      // Cannot restart because the workflow remains SUCCESS
      const secondResult = await workflow.start(10)
      expect(secondResult.status).toBe(RUN_STATUS.SUCCESS)
      expect(secondResult.works[0].output).toBe(10) // previous output remains unchanged
      expect(step.output).toBe(10)
    })

    it('stops a paused step within the workflow', async () => {
      const step = new Step({
        id: 'pause-stop-step',
        run: async (input: number) => {
          await new Promise((resolve) => setTimeout(resolve, 200))
          return input * 2
        }
      })

      const work = new Work({
        id: 'pause-stop-work',
        steps: [step]
      })

      const workflow = new Workflow({
        id: 'pause-stop-workflow',
        works: [work]
      })

      // Start execution
      const runPromise = workflow.start(5)

      // Wait for execution to begin, then pause
      await new Promise((resolve) => setTimeout(resolve, 50))
      await workflow.pause()
      expect(workflow.status).toBe(RUN_STATUS.PAUSED)

      // Stop the paused workflow (steps can now stop from PAUSED)
      await workflow.stop()
      expect(workflow.status).toBe(RUN_STATUS.STOPPED)
      expect(work.status).toBe(RUN_STATUS.STOPPED)
      expect(step.status).toBe(RUN_STATUS.STOPPED)

      // Do not await the stopped execution because it would hang forever
    })
  })
})
