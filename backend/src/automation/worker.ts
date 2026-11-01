
import { processNextAutomationEvent } from './processor'

const POLL_INTERVAL_MS = 5000

let workerTimer: ReturnType<typeof setInterval> | undefined
let workerRunning = false
let workerBusy = false
let workerStopping = false

/**
 * Runs one automation processing cycle.
 *
 * Only one cycle can run at a time in this process.
 */
async function runWorkerCycle(): Promise<void> {
  if (workerBusy || workerStopping) {
    return
  }

  workerBusy = true

  try {
    const result = await processNextAutomationEvent()

    if (result.processed) {
      console.log(
        `Automation worker cycle completed. Event: ${result.eventId}, status: ${result.status}`,
      )
    }
  } catch (error: unknown) {
    console.error(
      'Automation worker cycle failed:',
      error instanceof Error ? error.message : 'Unknown error',
    )
  } finally {
    workerBusy = false
  }
}

/**
 * Starts automatic background processing.
 *
 * The worker is disabled unless explicitly enabled
 * through the AUTOMATION_WORKER_ENABLED environment variable.
 */
export function startAutomationWorker(): boolean {
  if (workerRunning) {
    console.log('Automation worker is already running.')
    return true
  }

  if (
    process.env.AUTOMATION_WORKER_ENABLED !== 'true'
  ) {
    console.log(
      'Automation worker is disabled. Set AUTOMATION_WORKER_ENABLED=true to enable it.',
    )
    return false
  }

  workerStopping = false
  workerRunning = true

  console.log(
    `Automation worker started. Polling every ${POLL_INTERVAL_MS / 1000} seconds.`,
  )

  // Run one cycle immediately, then continue polling.
  void runWorkerCycle()

  workerTimer = setInterval(() => {
    void runWorkerCycle()
  }, POLL_INTERVAL_MS)

  return true
}

/**
 * Pauses automatic processing without losing pending events.
 */
export function pauseAutomationWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer)
    workerTimer = undefined
  }

  workerRunning = false

  console.log('Automation worker paused.')
}

/**
 * Resumes automatic processing if it was enabled.
 */
export function resumeAutomationWorker(): boolean {
  if (
    process.env.AUTOMATION_WORKER_ENABLED !== 'true'
  ) {
    console.log(
      'Automation worker cannot resume because it is disabled in configuration.',
    )
    return false
  }

  return startAutomationWorker()
}

/**
 * Stops the worker and waits for its current cycle to finish.
 */
export async function stopAutomationWorker(): Promise<void> {
  workerStopping = true

  if (workerTimer) {
    clearInterval(workerTimer)
    workerTimer = undefined
  }

  workerRunning = false

  while (workerBusy) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100)
    })
  }

  workerStopping = false

  console.log('Automation worker stopped.')
}

/**
 * Returns the current worker state.
 */
export function getAutomationWorkerStatus(): {
  running: boolean
  busy: boolean
  enabled: boolean
} {
  return {
    running: workerRunning,
    busy: workerBusy,
    enabled:
      process.env.AUTOMATION_WORKER_ENABLED === 'true',
  }
}
