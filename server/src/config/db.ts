import { Pool, types } from "pg";
import { env } from "./env.js";

// By default pg parses DATE columns into a JS Date object at *local*
// midnight, which res.json() then serializes via .toISOString() — silently
// shifting the date backward (into the previous day, at 23:00 or 22:00) on
// any machine whose local offset from UTC isn't exactly zero, and only for
// dates that fall on the DST side of the year (Europe/Lisbon's WEST=+1 vs
// WET=+0), which is why it looked like some dates were fine and others
// weren't. Return the raw 'YYYY-MM-DD' string instead — we never do date
// arithmetic server-side, so there's nothing a Date object buys us here.
types.setTypeParser(types.builtins.DATE, (value) => value);

export const pool = new Pool({ connectionString: env.databaseUrl });

pool.on("error", (err) => {
  console.error("Unexpected Postgres pool error", err);
});
