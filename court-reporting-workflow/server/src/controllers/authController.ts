import type { Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";
import { comparePassword, generateToken } from "../utils/jwt.js";
import { ApiError } from "../utils/ApiError.js";

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password } = req.body;

    const user = await db.oneOrNone('SELECT * FROM "User" WHERE email = $1', [
      email,
    ]);

    if (!user || !(await comparePassword(password, user.password))) {
      throw new ApiError(401, "Invalid credentials");
    }

    const token = generateToken({ userId: user.id, role: user.role });
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};
