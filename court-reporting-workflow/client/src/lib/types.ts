export type JobStatus =
  | "NEW"
  | "ASSIGNED"
  | "TRANSCRIBED"
  | "IN_REVIEW"
  | "REVIEWED"
  | "COMPLETED";

export type LocationType = "PHYSICAL" | "REMOTE";
export type UserRole = "ADMIN" | "REPORTER" | "EDITOR";

export type Job = {
  id: string;
  caseName: string;
  duration: number;
  locationType: LocationType;
  city: string | null;
  status: JobStatus;
  version: number;
  reporterId: string | null;
  editorId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  city: string | null;
  isAvailable: boolean;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

export type CreateJobInput = {
  caseName: string;
  duration: number;
  locationType: LocationType;
  city: string | null;
};
