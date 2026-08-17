import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getFinancialTable, listFinancialTabs } from "../controllers/financialData.controller.js";

export const financialDataRouter = Router();

financialDataRouter.use(requireAuth);
financialDataRouter.get("/tabs", listFinancialTabs);
financialDataRouter.get("/:tableKey", getFinancialTable);
