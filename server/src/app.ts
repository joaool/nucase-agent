import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import express from "express";
import "express-async-errors";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.routes.js";
import { companiesRouter } from "./routes/companies.routes.js";
import { financialDataRouter } from "./routes/financialData.routes.js";
import { chatRouter } from "./routes/chat.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

export const app = express();

app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/financial", financialDataRouter);
app.use("/api/chat", chatRouter);

// Single-service deployment: serve the built client (client/dist) from the
// same origin/process as the API, so there's no cross-site cookie issue and
// no separate static host to stand up. This runs from server/dist/src/app.js
// at runtime, hence the three ".." to reach the repo root. Guarded by
// existsSync rather than NODE_ENV so it's a no-op in local dev (server runs
// on :4000, client on :5173 via Vite) unless you've actually run the client
// build — nothing to configure either way. Must come before notFoundHandler
// so client routes/assets aren't 404'd first.
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);
