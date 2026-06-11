import { Router } from "express";
import { getUsers } from "../controllers/userController.js";
import { authenticate } from "../middlewares/auth.js";
import { authorize } from "../middlewares/authorize.js";

const router = Router();

router.get("/", authenticate, authorize(["ADMIN"]), getUsers);

export default router;
