import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { listMyCompanies } from "../controllers/companies.controller.js";

export const companiesRouter = Router();

companiesRouter.use(requireAuth);
companiesRouter.get("/", listMyCompanies);
