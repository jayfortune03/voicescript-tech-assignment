import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const SECRET = process.env.JWT_SECRET || "fallback_secret";

export const hashPassword = async (password: string) =>
  await bcrypt.hash(password, 10);
export const comparePassword = async (pass: string, hash: string) =>
  await bcrypt.compare(pass, hash);

export const generateToken = (payload: { userId: string; role: string }) => {
  return jwt.sign(payload, SECRET, { expiresIn: "24h" });
};

export const verifyToken = (token: string) => {
  return jwt.verify(token, SECRET) as { userId: string; role: string };
};
