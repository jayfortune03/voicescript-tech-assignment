import type { Server } from "socket.io";

let realtimeServer: Server | null = null;

type JobUpdatedPayload = {
  action: string;
  job: unknown;
};

export const setRealtimeServer = (server: Server) => {
  realtimeServer = server;
};

export const emitJobUpdated = (payload: JobUpdatedPayload) => {
  realtimeServer?.emit("jobUpdated", payload);
};
