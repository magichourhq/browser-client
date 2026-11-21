# Magic Hour Browser Client

[![npm](https://img.shields.io/npm/v/@magichourhq/browser-client)](https://www.npmjs.com/package/@magichourhq/browser-client)

Browser client for the [Magic Hour API](https://docs.magichour.ai), published to npm as `@magichourhq/browser-client`.

It's built for Magic Hour integrations that run in a web page, such as the Canva app, where requests go straight from the browser to the API. It covers what those integrations share:

- Upload an image to use as input.
- Start an image or video generation, with request bodies typed from [`@magichourhq/api-types`](https://github.com/magichourhq/api-types).
- Wait for the generation to finish, then download the result.
- Turn API failures into short errors with the API's error `code` and message. Errors never include the API key or signed URLs; any URL in an API message is replaced with `<url>`.
- Give apps that translate their UI a catalog of every error message, with stable IDs.

```sh
npm install @magichourhq/browser-client
```

> [!WARNING]
> Anyone using the page can read the API key. Use the key of the person using your app, never a shared key.

```ts
import { MagicHourClient } from "@magichourhq/browser-client";

const client = new MagicHourClient({ apiKey });
const id = await client.create("ai-image-generator", {
  image_count: 1,
  style: { prompt: "A red apple on a white table" },
});
const project = await client.wait(id, "image");
const bytes = await client.download(project.downloads[0].url);
```

The client never retries a request that starts a paid generation. If that request fails and the API did not clearly reject it, the error says the generation may have started, so check the account before trying again.

Supported browsers: Chrome 66, Edge 79, Firefox 60, Safari 12.1, iOS Safari 12.2, Samsung Internet 9, Opera 53, and later versions.
