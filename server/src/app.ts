import express from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import { errorMiddleware } from "./http.js";
import { authMiddleware } from "./auth/session.js";
import { authRouter } from "./auth/routes.js";
import { prefsRouter } from "./prefs/routes.js";
import { adminRouter } from "./admin/routes.js";
import { sourcesRouter } from "./sources/routes.js";
import { blobRouter } from "./blob/routes.js";
import { observabilityRouter, requestLog } from "./observability.js";
import { adminInvitesRouter, invitesRouter } from "./invites/routes.js";
import { httpListingsLoader, sharesRouter, type ListingsLoader } from "./shares/routes.js";
import type { BlobStore } from "./sources/blobStore.js";

export type AppDeps = {
  blobStore: BlobStore;
  /** Reads a version's listings for public share pages (defaults to fetching from storage). */
  loadListings?: ListingsLoader;
  /** Extra routes mounted before the 404 handler (tests, e2e fakes). */
  extraRoutes?: (app: express.Express) => void;
};

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.disable("x-powered-by");
  // Vercel (and the Vite dev proxy) sit in front of the app; trust one hop for req.ip.
  app.set("trust proxy", 1);
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));

  app.use(requestLog);
  app.use(authMiddleware);
  app.use("/api", observabilityRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/prefs", prefsRouter);
  app.use("/api/admin", adminInvitesRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/invites", invitesRouter);
  app.use("/api", sharesRouter(deps.loadListings ?? httpListingsLoader));
  app.use("/api/sources", sourcesRouter(deps.blobStore));
  app.use("/api/blob", blobRouter(deps.blobStore));
  deps.extraRoutes?.(app);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });
  app.use(errorMiddleware);
  return app;
}
