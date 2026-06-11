import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError.js";

export const authorize = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ApiError(403, "Forbidden: You do not have permission"));
    }
    next();
  };
};
