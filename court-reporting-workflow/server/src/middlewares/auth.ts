import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.js";
import { ApiError } from "../utils/ApiError.js";

// Extend Express Request untuk menyimpan data user
declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; role: string };
    }
  }
}

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new ApiError(401, "Unauthorized: No token provided"));
  }

  const token = authHeader.split(" ")[1] || "";
  try {
    const decoded = verifyToken(token);
    req.user = decoded; // Simpan data user ke request
    next();
  } catch (error) {
    next(new ApiError(401, "Unauthorized: Invalid token"));
  }
};
