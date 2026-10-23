import { createApp } from "../server/src/app.js";
import { vercelBlobStore } from "../server/src/sources/blobStore.js";

/** Vercel Function entry: every /api/* request is rewritten here (see vercel.json). */
export default createApp({ blobStore: vercelBlobStore });
