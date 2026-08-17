import { pool } from "../config/db.js";

/** Confirms the given user has access to the given company (via user_companies). */
export async function userCanAccessCompany(userId: string, companyId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2`,
    [userId, companyId]
  );
  return rows.length > 0;
}
