import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  connectionLimit: 8,
  timezone: "Z",
});

export const db = drizzle(pool, { schema, mode: "default" });
