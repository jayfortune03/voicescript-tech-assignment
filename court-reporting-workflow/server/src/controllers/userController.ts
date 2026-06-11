import type { Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";

export const getUsers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { role } = req.query;

    const params: string[] = [];
    let query = `
      SELECT id, name, email, role, city, "isAvailable"
      FROM "User"
    `;

    if (typeof role === "string" && role.length > 0) {
      query += ` WHERE role = $1`;
      params.push(role);
    }

    query += ` ORDER BY role ASC, name ASC`;

    const users = await db.any(query, params);
    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
};
