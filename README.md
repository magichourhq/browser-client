# Magic Hour Browser Client

Browser client for the [Magic Hour API](https://docs.magichour.ai), published to npm as `@magichourhq/browser-client`.

```sh
npm install @magichourhq/browser-client
```

> [!WARNING]
> Anyone using the page can read the API key. Use the key of the person using your app, never a shared key.

```ts
import { MagicHourClient } from "@magichourhq/browser-client";

const client = new MagicHourClient({ apiKey });
const id = await client.create("ai-image-generator", "image", {
  image_count: 1,
  style: { prompt: "A red apple on a white table" },
});
const project = await client.wait(id, "image");
const bytes = await client.download(project.downloads[0].url);
```

The client never retries a request that starts a paid generation. If that request fails and the API did not clearly reject it, the error says the generation may have started, so check the account before trying again.

Supported browsers: Chrome 66, Edge 79, Firefox 60, Safari 12.1, iOS Safari 12.2, Samsung Internet 9, Opera 53, and later versions.
