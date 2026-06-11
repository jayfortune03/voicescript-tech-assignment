import type {
  AuthUser,
  CreateJobInput,
  Job,
  JobStatus,
  LoginResponse,
  User,
  UserRole,
} from "@/lib/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3004/api";
export const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export const authStorage = {
  tokenKey: "court-workflow-token",
  userKey: "court-workflow-user",
  storage() {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  },
  getToken() {
    if (typeof window === "undefined") return null;
    return this.storage()?.getItem(this.tokenKey) ?? null;
  },
  getUser() {
    if (typeof window === "undefined") return null;
    const rawUser = this.storage()?.getItem(this.userKey);
    if (!rawUser) return null;

    try {
      return JSON.parse(rawUser) as AuthUser;
    } catch {
      return null;
    }
  },
  setAuth(token: string, user: AuthUser) {
    window.localStorage.setItem(this.tokenKey, token);
    window.localStorage.setItem(this.userKey, JSON.stringify(user));
  },
  clear() {
    window.localStorage.removeItem(this.tokenKey);
    window.localStorage.removeItem(this.userKey);
  },
};

async function request<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  const token = authStorage.getToken();
  if (options.auth !== false && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new ApiError(body?.error ?? "Request failed", response.status);
  }

  return response.json() as Promise<T>;
}

export const api = {
  login(email: string, password: string) {
    return request<LoginResponse>("/auth/login", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email, password }),
    });
  },
  getJobs(status?: JobStatus | "ALL") {
    const query = status && status !== "ALL" ? `?status=${status}` : "";
    return request<Job[]>(`/jobs${query}`);
  },
  createJob(input: CreateJobInput) {
    return request<Job>("/jobs", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  getUsers(role?: UserRole) {
    const query = role ? `?role=${role}` : "";
    return request<User[]>(`/users${query}`);
  },
  assignReporter(jobId: string, reporterId: string, version: number) {
    return request<Job>(`/jobs/${jobId}/assign-reporter`, {
      method: "POST",
      body: JSON.stringify({ reporterId, version }),
    });
  },
  assignEditor(jobId: string, editorId: string, version: number) {
    return request<Job>(`/jobs/${jobId}/assign-editor`, {
      method: "POST",
      body: JSON.stringify({ editorId, version }),
    });
  },
  updateStatus(jobId: string, status: JobStatus, version: number) {
    return request<Job>(`/jobs/${jobId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, version }),
    });
  },
  processPayment(jobId: string) {
    return request<{ job: Job }>(`/jobs/${jobId}/pay`, {
      method: "POST",
    });
  },
};

export const moneyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function calculateJobPayout(job: Pick<Job, "duration" | "editorId">) {
  const reporterAmount = job.duration * 2000;
  const editorAmount = job.editorId ? 50000 : 0;

  return {
    reporterAmount,
    editorAmount,
    total: reporterAmount + editorAmount,
  };
}
