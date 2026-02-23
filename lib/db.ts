import { Pool } from "pg";

const globalForPg = global as unknown as {
  pgPoolDb1?: Pool;
  pgPoolDb2?: Pool;
};

/* ================================
   DB1 (OLD DATABASE)
================================ */
export const poolDb1 =
  globalForPg.pgPoolDb1 ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });

/* ================================
   DB2 (NEW DATABASE)
================================ */
export const poolDb2 =
  globalForPg.pgPoolDb2 ??
  new Pool({
    connectionString: process.env.DATABASE_URL_2,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPoolDb1 = poolDb1;
  globalForPg.pgPoolDb2 = poolDb2;
}