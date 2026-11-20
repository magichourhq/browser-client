// Run in its own Node process with the default 10-minute timeout. A caller's unused deadline
// signal and finished calls must not keep the process alive, or a script would hang.
import { fakeApi } from "./fake-api.js";

const api = fakeApi({ statuses: ["complete"] });
const client = api.client();
const signal = client.signal();
const id = await client.create("ai-image-generator", { image_count: 1, style: { prompt: "Mug" } });
const project = await client.wait(id, "image", signal);
await client.download(project.downloads[0].url, signal);
console.log("done");
