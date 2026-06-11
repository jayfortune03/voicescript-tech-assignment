import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import jobRoutes from "./routes/jobRoutes.js";
import { logger } from "./middlewares/logger.js";
import { errorHandler } from "./middlewares/errorHandler.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT"],
  },
});

app.use(cors());
app.use(express.json());

app.use(logger);
app.use("/api/jobs", jobRoutes);
app.use(errorHandler);

// Socket.io connection listener
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Test route
app.get("/health", (req, res) => {
  res
    .status(200)
    .json({ status: "OK", message: "Court Reporting API is running" });
});

const PORT = process.env.PORT || 3004;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
