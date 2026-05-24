import {
  createInMemoryRunManager,
  createInMemoryStreamBridge,
  createInMemoryThreadStore,
  createLocalActivityRuntime,
  type LocalActivityRuntime
} from "@mh/core/agent";

function createRuntime() {
  return createLocalActivityRuntime({
    threadStore: createInMemoryThreadStore(),
    runManager: createInMemoryRunManager(),
    streamBridge: createInMemoryStreamBridge()
  });
}

let runtime = createRuntime();

export function getAgentRuntime(): LocalActivityRuntime {
  return runtime;
}

export function resetAgentRuntimeForTests() {
  runtime = createRuntime();
  return runtime;
}
