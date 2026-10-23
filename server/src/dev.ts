import { createApp } from "./app.js";
import { env } from "./env.js";
import { vercelBlobStore } from "./sources/blobStore.js";
import { e2eFakeBlob } from "./e2eFakeBlob.js";

const fake = process.env.E2E_FAKE_BLOB === "1" ? e2eFakeBlob() : null;
const app = createApp({ blobStore: fake?.store ?? vercelBlobStore, extraRoutes: fake?.mount });

app.listen(env.PORT, "127.0.0.1", () => {
  console.log(`[api] listening on http://127.0.0.1:${env.PORT}${fake ? " (fake blob store)" : ""}`);
});
