import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { createThread, listMessages, listThreads, postMessage } from "../controllers/chat.controller.js";

export const chatRouter = Router();

chatRouter.use(requireAuth);
chatRouter.get("/threads", listThreads);
chatRouter.post("/threads", createThread);
chatRouter.get("/threads/:threadId/messages", listMessages);
chatRouter.post("/threads/:threadId/messages", postMessage);
