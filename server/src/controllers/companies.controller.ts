import type { Request, Response } from "express";
import { pool } from "../config/db.js";

export async function listMyCompanies(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const { rows } = await pool.query(
    `SELECT c.id, c.name
     FROM companies c
     JOIN user_companies uc ON uc.company_id = c.id
     WHERE uc.user_id = $1
     ORDER BY c.name`,
    [userId]
  );
  res.json(rows);
}
