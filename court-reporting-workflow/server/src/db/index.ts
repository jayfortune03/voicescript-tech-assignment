// server/src/db/index.ts
import pgPromise from "pg-promise";
import dotenv from "dotenv";

dotenv.config();

// Inisialisasi pg-promise
const pgp = pgPromise({});

// Buat koneksi database murni menggunakan variabel yang dipecah
export const db = pgp({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "mydatabase",
  user: process.env.DB_USER || "myuser",
  password: process.env.DB_PASSWORD || "mypassword",
});
