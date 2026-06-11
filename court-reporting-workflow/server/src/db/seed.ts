import { db } from "./index.js";
import bcrypt from "bcrypt";

async function runSeed() {
  try {
    console.log("🚀 Starting database seeding...");

    await db.none(
      'TRUNCATE TABLE "Payment", "Job", "User" RESTART IDENTITY CASCADE;',
    );

    const password = await bcrypt.hash("password123", 10);
    const pgp = db.$config.pgp;

    const users = [
      {
        name: "System Admin",
        email: "admin@app.com",
        role: "ADMIN",
        city: "Jakarta",
      },
      {
        name: "Editor Alpha",
        email: "edit1@app.com",
        role: "EDITOR",
        city: "Tangerang",
      },
      {
        name: "Editor Beta",
        email: "edit2@app.com",
        role: "EDITOR",
        city: "Jakarta",
      },
      {
        name: "Editor Gamma",
        email: "edit3@app.com",
        role: "EDITOR",
        city: "Bogor",
      },
      {
        name: "Reporter A",
        email: "rep1@app.com",
        role: "REPORTER",
        city: "Tangerang",
      },
      {
        name: "Reporter B",
        email: "rep2@app.com",
        role: "REPORTER",
        city: "Tangerang",
      },
      {
        name: "Reporter C",
        email: "rep3@app.com",
        role: "REPORTER",
        city: "Jakarta",
      },
      {
        name: "Reporter D",
        email: "rep4@app.com",
        role: "REPORTER",
        city: "Jakarta",
      },
      {
        name: "Reporter E",
        email: "rep5@app.com",
        role: "REPORTER",
        city: "Bogor",
      },
    ];

    const cs = new pgp.helpers.ColumnSet(
      ["name", "email", "role", "city", "password"],
      { table: "User" },
    );

    const values = users.map((u) => ({
      ...u,
      password: password,
    }));

    const query = pgp.helpers.insert(values, cs);
    await db.none(query);

    console.log("✅ Seeding completed successfully!");
  } catch (err) {
    console.error("❌ Seeding failed:", err);
  } finally {
    await db.$pool.end();
  }
}

runSeed();
