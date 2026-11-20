// Run in its own Node process: an onProjectCreated that never settles, with nothing else keeping
// the process alive. create must still fail with the project ID at the deadline.
import { MagicHourError } from "../../src/index.js";
import { fakeApi } from "./fake-api.js";

const client = fakeApi().client({ timeoutMs: 300, onProjectCreated: () => new Promise(() => {}) });
try {
  await client.create("ai-image-generator", { image_count: 1, style: { prompt: "Mug" } });
  console.log("unexpected success");
} catch (error) {
  console.log(error instanceof MagicHourError ? `projectId=${error.projectId}` : `other: ${error}`);
}
