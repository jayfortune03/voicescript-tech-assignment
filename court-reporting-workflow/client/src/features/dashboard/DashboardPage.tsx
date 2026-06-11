"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Add,
  AssignmentInd,
  CheckCircle,
  Logout,
  Paid,
  RateReview,
  Search,
  Sync,
} from "@mui/icons-material";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SOCKET_URL,
  api,
  authStorage,
  calculateJobPayout,
  moneyFormatter,
} from "@/lib/api";
import type { AuthUser, CreateJobInput, Job, JobStatus, User } from "@/lib/types";
import { AssignDialog } from "@/features/dashboard/AssignDialog";
import { CreateJobDialog } from "@/features/dashboard/CreateJobDialog";
import { LoginPanel } from "@/features/dashboard/LoginPanel";

const statuses: Array<JobStatus | "ALL"> = [
  "ALL",
  "NEW",
  "ASSIGNED",
  "TRANSCRIBED",
  "IN_REVIEW",
  "REVIEWED",
  "COMPLETED",
];

const statusLabels: Record<JobStatus, string> = {
  NEW: "New",
  ASSIGNED: "Assigned",
  TRANSCRIBED: "Transcribed",
  IN_REVIEW: "In review",
  REVIEWED: "Reviewed",
  COMPLETED: "Completed",
};

const statusColors: Record<
  JobStatus,
  "default" | "primary" | "secondary" | "info" | "success" | "warning"
> = {
  NEW: "default",
  ASSIGNED: "primary",
  TRANSCRIBED: "warning",
  IN_REVIEW: "info",
  REVIEWED: "secondary",
  COMPLETED: "success",
};

type SortDirection = "asc" | "desc";
type JobSortKey =
  | "caseName"
  | "status"
  | "location"
  | "duration"
  | "reporter"
  | "editor"
  | "payout";

function getNextStatus(job: Job): JobStatus | null {
  if (job.status === "ASSIGNED") return "TRANSCRIBED";
  if (job.status === "IN_REVIEW") return "REVIEWED";
  return null;
}

function canAdvanceStatus(job: Job, authUser: AuthUser) {
  if (authUser.role === "ADMIN") return Boolean(getNextStatus(job));
  if (authUser.role === "REPORTER") {
    return job.reporterId === authUser.id && job.status === "ASSIGNED";
  }
  if (authUser.role === "EDITOR") {
    return job.editorId === authUser.id && job.status === "IN_REVIEW";
  }
  return false;
}

function getAssignmentName(
  userId: string | null,
  usersById: Map<string, User>,
  authUser: AuthUser,
) {
  if (!userId) return "Unassigned";
  if (userId === authUser.id) return `${authUser.name} (you)`;
  return usersById.get(userId)?.name ?? "Assigned";
}

function getRolePayout(job: Job, authUser: AuthUser) {
  const payout = calculateJobPayout(job);

  if (authUser.role === "REPORTER") {
    return {
      primaryLabel: "Reporter earnings",
      primaryAmount: payout.reporterAmount,
      detail: `${moneyFormatter.format(2000)} x ${job.duration} min`,
      totalForCards: payout.reporterAmount,
    };
  }

  if (authUser.role === "EDITOR") {
    return {
      primaryLabel: "Editor earnings",
      primaryAmount: payout.editorAmount,
      detail: "Flat review fee",
      totalForCards: payout.editorAmount,
    };
  }

  return {
    primaryLabel: "Total payout",
    primaryAmount: payout.total,
    detail: `Reporter ${moneyFormatter.format(payout.reporterAmount)}${
      job.editorId ? `, editor ${moneyFormatter.format(payout.editorAmount)}` : ""
    }`,
    totalForCards: payout.total,
  };
}

export function DashboardPage() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [statusFilter, setStatusFilter] = useState<JobStatus | "ALL">("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [assignReporterJob, setAssignReporterJob] = useState<Job | null>(null);
  const [assignEditorJob, setAssignEditorJob] = useState<Job | null>(null);
  const [jobSearch, setJobSearch] = useState("");
  const [sortKey, setSortKey] = useState<JobSortKey>("caseName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<
    "connecting" | "connected" | "disconnected" | "idle" | "refresh_required"
  >("connecting");
  const [lastRealtimeAt, setLastRealtimeAt] = useState<Date | null>(null);
  const queryClient = useQueryClient();
  const isAdmin = authUser?.role === "ADMIN";

  useEffect(() => {
    if (!authStorage.getToken()) return;
    setAuthUser(authStorage.getUser());
  }, []);

  const jobsQuery = useQuery({
    queryKey: ["jobs", isAdmin ? statusFilter : "ALL"],
    queryFn: () => api.getJobs(isAdmin ? statusFilter : "ALL"),
    enabled: Boolean(authUser),
  });

  const reportersQuery = useQuery({
    queryKey: ["users", "REPORTER"],
    queryFn: () => api.getUsers("REPORTER"),
    enabled: isAdmin,
  });

  const editorsQuery = useQuery({
    queryKey: ["users", "EDITOR"],
    queryFn: () => api.getUsers("EDITOR"),
    enabled: isAdmin,
  });

  useEffect(() => {
    if (!authUser) {
      setRealtimeStatus("disconnected");
      return;
    }

    setRealtimeStatus("connecting");
    const socketPromise = import("socket.io-client").then(({ io }) => {
      const refreshRealtimeData = () => {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: ["jobs"] }),
          queryClient.invalidateQueries({ queryKey: ["users"] }),
        ]);
      };

      let refreshRequired = false;
      let idleTimer: number | null = null;

      const socket = io(SOCKET_URL, {
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        transports: ["websocket", "polling"],
      });

      const resetIdleTimer = () => {
        if (idleTimer) {
          window.clearTimeout(idleTimer);
        }

        idleTimer = window.setTimeout(
          () => {
            if (socket.connected) {
              socket.disconnect();
            }
            setRealtimeStatus("idle");
          },
          5 * 60 * 1000,
        );
      };

      const handleActivity = () => {
        resetIdleTimer();

        if (refreshRequired) return;
        if (!socket.connected) {
          setRealtimeStatus("connecting");
          socket.connect();
        }
      };

      socket.on("connect", () => {
        refreshRequired = false;
        setRealtimeStatus("connected");
        resetIdleTimer();
        refreshRealtimeData();
      });

      socket.on("disconnect", () => {
        if (!refreshRequired) {
          setRealtimeStatus("disconnected");
        }
      });

      socket.on("connect_error", () => {
        if (!refreshRequired) {
          setRealtimeStatus("disconnected");
        }
      });

      socket.io.on("reconnect_attempt", () => {
        setRealtimeStatus("connecting");
      });

      socket.io.on("reconnect", () => {
        refreshRequired = false;
        setRealtimeStatus("connected");
        setLastRealtimeAt(new Date());
        resetIdleTimer();
        refreshRealtimeData();
      });

      socket.io.on("reconnect_failed", () => {
        refreshRequired = true;
        setRealtimeStatus("refresh_required");
      });

      socket.on("jobUpdated", () => {
        setLastRealtimeAt(new Date());
        resetIdleTimer();
        refreshRealtimeData();
      });

      window.addEventListener("pointerdown", handleActivity);
      window.addEventListener("keydown", handleActivity);
      window.addEventListener("focus", handleActivity);
      document.addEventListener("visibilitychange", handleActivity);
      resetIdleTimer();

      socket.on("disconnect", () => {
        if (idleTimer) {
          window.clearTimeout(idleTimer);
        }
      });

      return () => {
        window.removeEventListener("pointerdown", handleActivity);
        window.removeEventListener("keydown", handleActivity);
        window.removeEventListener("focus", handleActivity);
        document.removeEventListener("visibilitychange", handleActivity);
        if (idleTimer) {
          window.clearTimeout(idleTimer);
        }
        socket.disconnect();
      };
    });

    return () => {
      void socketPromise.then((cleanupSocket) => cleanupSocket());
    };
  }, [authUser, queryClient]);

  const invalidateDashboard = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["jobs"] }),
      queryClient.invalidateQueries({ queryKey: ["users"] }),
    ]);
  };

  const createJobMutation = useMutation({
    mutationFn: (input: CreateJobInput) => api.createJob(input),
    onSuccess: async () => {
      setCreateOpen(false);
      setError(null);
      await invalidateDashboard();
    },
    onError: (mutationError) => setError(mutationError.message),
  });

  const assignReporterMutation = useMutation({
    mutationFn: ({ job, userId }: { job: Job; userId: string }) =>
      api.assignReporter(job.id, userId, job.version),
    onSuccess: async () => {
      setAssignReporterJob(null);
      setError(null);
      await invalidateDashboard();
    },
    onError: (mutationError) => setError(mutationError.message),
  });

  const assignEditorMutation = useMutation({
    mutationFn: ({ job, userId }: { job: Job; userId: string }) =>
      api.assignEditor(job.id, userId, job.version),
    onSuccess: async () => {
      setAssignEditorJob(null);
      setError(null);
      await invalidateDashboard();
    },
    onError: (mutationError) => setError(mutationError.message),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ job, status }: { job: Job; status: JobStatus }) =>
      api.updateStatus(job.id, status, job.version),
    onSuccess: async () => {
      setError(null);
      await invalidateDashboard();
    },
    onError: (mutationError) => setError(mutationError.message),
  });

  const payMutation = useMutation({
    mutationFn: (job: Job) => api.processPayment(job.id),
    onSuccess: async () => {
      setError(null);
      await invalidateDashboard();
    },
    onError: (mutationError) => setError(mutationError.message),
  });

  const rawJobs = jobsQuery.data ?? [];
  const jobs = useMemo(() => {
    if (!authUser) return [];
    if (authUser.role === "ADMIN") return rawJobs;
    if (authUser.role === "REPORTER") {
      return rawJobs.filter((job) => job.reporterId === authUser.id);
    }
    if (authUser.role === "EDITOR") {
      return rawJobs.filter((job) => job.editorId === authUser.id);
    }
    return [];
  }, [authUser, rawJobs]);
  const reporterUsers = reportersQuery.data ?? [];
  const editorUsers = editorsQuery.data ?? [];
  const reportersById = useMemo(
    () => new Map(reporterUsers.map((user) => [user.id, user])),
    [reporterUsers],
  );
  const editorsById = useMemo(
    () => new Map(editorUsers.map((user) => [user.id, user])),
    [editorUsers],
  );
  const users = [...reporterUsers, ...editorUsers];

  const handleLogout = () => {
    authStorage.clear();
    setStatusFilter("ALL");
    setAuthUser(null);
    queryClient.clear();
  };

  if (!authUser) {
    return (
      <LoginPanel
        onLogin={(user) => {
          setStatusFilter("ALL");
          setAuthUser(user);
        }}
      />
    );
  }

  const totalEstimatedPayout = jobs.reduce(
    (sum, job) => sum + getRolePayout(job, authUser).totalForCards,
    0,
  );
  const activeJobs = jobs.filter((job) => job.status !== "COMPLETED").length;
  const completedJobs = jobs.filter((job) => job.status === "COMPLETED").length;
  const pendingActionJobs = jobs.filter((job) => canAdvanceStatus(job, authUser)).length;
  const reporterEarnings = jobs.reduce(
    (sum, job) => sum + calculateJobPayout(job).reporterAmount,
    0,
  );
  const editorEarnings = jobs.reduce(
    (sum, job) => sum + calculateJobPayout(job).editorAmount,
    0,
  );
  const availableUsers = users.filter((user) => user.isAvailable).length;
  const firstJobCardLabel =
    authUser.role === "ADMIN"
      ? "Visible jobs"
      : authUser.role === "REPORTER"
        ? "My reporting jobs"
        : "My review jobs";
  const secondJobCardLabel =
    authUser.role === "ADMIN" ? "Active jobs" : "Needs my action";
  const secondJobCardValue =
    authUser.role === "ADMIN" ? activeJobs : pendingActionJobs;
  const realtimeLabel =
    realtimeStatus === "connected"
      ? "Live"
      : realtimeStatus === "connecting"
        ? "Connecting"
        : realtimeStatus === "idle"
          ? "Idle"
          : realtimeStatus === "refresh_required"
            ? "Refresh required"
            : "Offline";
  const realtimeTooltip =
    realtimeStatus === "connected"
      ? lastRealtimeAt
        ? `Connected. Last realtime update: ${lastRealtimeAt.toLocaleTimeString()}`
        : "Connected. Waiting for realtime updates."
      : realtimeStatus === "idle"
        ? "Disconnected after 5 minutes of inactivity. Interact with the page to reconnect."
        : realtimeStatus === "refresh_required"
          ? "Realtime reconnect failed after 3 attempts. Refresh the page."
          : "Realtime connection is not active.";
  const normalizedSearch = jobSearch.trim().toLowerCase();
  const getJobSortValue = (job: Job, key: JobSortKey): string | number => {
    if (key === "caseName") return job.caseName.toLowerCase();
    if (key === "status") return statusLabels[job.status];
    if (key === "location") {
      return job.locationType === "PHYSICAL"
        ? `physical ${job.city ?? ""}`.toLowerCase()
        : "remote";
    }
    if (key === "duration") return job.duration;
    if (key === "reporter") {
      return getAssignmentName(job.reporterId, reportersById, authUser).toLowerCase();
    }
    if (key === "editor") {
      return getAssignmentName(job.editorId, editorsById, authUser).toLowerCase();
    }
    return getRolePayout(job, authUser).primaryAmount;
  };
  const displayedJobs = jobs
    .filter((job) => {
      if (!normalizedSearch) return true;

      const haystack = [
        job.caseName,
        job.status,
        statusLabels[job.status],
        job.locationType,
        job.city ?? "",
        String(job.duration),
        getAssignmentName(job.reporterId, reportersById, authUser),
        getAssignmentName(job.editorId, editorsById, authUser),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    })
    .sort((a, b) => {
      const aValue = getJobSortValue(a, sortKey);
      const bValue = getJobSortValue(b, sortKey);
      const directionMultiplier = sortDirection === "asc" ? 1 : -1;

      if (typeof aValue === "number" && typeof bValue === "number") {
        return (aValue - bValue) * directionMultiplier;
      }

      return String(aValue).localeCompare(String(bValue)) * directionMultiplier;
    });
  const handleSort = (key: JobSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="static"
        color="inherit"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Container maxWidth="xl">
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems={{ xs: "stretch", sm: "center" }}
            justifyContent="space-between"
            sx={{ py: 2 }}
          >
            <Box>
              <Typography variant="h5" component="h1">
                Court Reporting Workflow
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {authUser.name} - {authUser.role}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              {isAdmin ? (
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={() => setCreateOpen(true)}
                >
                  New job
                </Button>
              ) : null}
              <Tooltip title={realtimeTooltip}>
                <Chip
                  label={realtimeLabel}
                  color={
                    realtimeStatus === "connected"
                      ? "success"
                      : realtimeStatus === "refresh_required"
                        ? "warning"
                        : "default"
                  }
                  variant={realtimeStatus === "connected" ? "filled" : "outlined"}
                  sx={{ alignSelf: "center" }}
                />
              </Tooltip>
              <Tooltip title="Refresh">
                <IconButton onClick={() => void invalidateDashboard()}>
                  <Sync />
                </IconButton>
              </Tooltip>
              <Tooltip title="Sign out">
                <IconButton onClick={handleLogout}>
                  <Logout />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
        </Container>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Stack spacing={3}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            alignItems={{ xs: "stretch", md: "center" }}
            justifyContent="space-between"
          >
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                  lg: isAdmin
                    ? "repeat(4, minmax(0, 1fr))"
                    : "repeat(4, minmax(0, 1fr))",
                },
                gap: 2,
                width: "100%",
              }}
            >
              <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
                <Typography variant="body2" color="text.secondary">
                  {firstJobCardLabel}
                </Typography>
                <Typography variant="h4">{jobs.length}</Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
                <Typography variant="body2" color="text.secondary">
                  {secondJobCardLabel}
                </Typography>
                <Typography variant="h4">{secondJobCardValue}</Typography>
              </Paper>
              {!isAdmin ? (
                <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
                  <Typography variant="body2" color="text.secondary">
                    Completed jobs
                  </Typography>
                  <Typography variant="h4">{completedJobs}</Typography>
                </Paper>
              ) : null}
              <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
                <Typography variant="body2" color="text.secondary">
                  {isAdmin ? "Estimated payout" : "My estimated earnings"}
                </Typography>
                <Typography variant="h4">
                  {moneyFormatter.format(totalEstimatedPayout)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {isAdmin
                    ? `Reporter ${moneyFormatter.format(
                        reporterEarnings,
                      )}, editor ${moneyFormatter.format(editorEarnings)}`
                    : authUser.role === "REPORTER"
                      ? `${moneyFormatter.format(2000)} per minute`
                      : `${moneyFormatter.format(50000)} flat review fee`}
                </Typography>
              </Paper>
              {isAdmin ? (
                <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
                  <Typography variant="body2" color="text.secondary">
                    Available staff
                  </Typography>
                  <Typography variant="h4">
                    {availableUsers}/{users.length}
                  </Typography>
                </Paper>
              ) : null}
            </Box>
          </Stack>

          {error ? (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          ) : null}

          {jobsQuery.isError ? (
            <Alert severity="error">{jobsQuery.error.message}</Alert>
          ) : null}

          {isAdmin ? (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" },
                gap: 2,
              }}
            >
              {[
                { title: "Reporters", rows: reporterUsers },
                { title: "Editors", rows: editorUsers },
              ].map((section) => (
                <TableContainer key={section.title} component={Paper} variant="outlined">
                  <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
                    <Typography variant="h6">{section.title}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Availability by city
                    </Typography>
                  </Box>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>User</TableCell>
                        <TableCell>City</TableCell>
                        <TableCell>Availability</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {section.rows.map((user) => (
                        <TableRow key={user.id} hover>
                          <TableCell>
                            <Typography fontWeight={700}>{user.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {user.email}
                            </Typography>
                          </TableCell>
                          <TableCell>{user.city ?? "-"}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              color={user.isAvailable ? "success" : "warning"}
                              label={user.isAvailable ? "Available" : "Busy"}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ))}
            </Box>
          ) : null}

          <TableContainer component={Paper} variant="outlined">
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ xs: "stretch", sm: "center" }}
              justifyContent="space-between"
              sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}
            >
              <Box>
                <Typography variant="h6">Jobs</Typography>
                <Typography variant="body2" color="text.secondary">
                  {isAdmin
                    ? "Filter and manage all workflow jobs."
                    : "Assigned work for your role."}
                </Typography>
              </Box>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <TextField
                  size="small"
                  label="Search jobs"
                  value={jobSearch}
                  onChange={(event) => setJobSearch(event.target.value)}
                  InputProps={{
                    startAdornment: <Search fontSize="small" sx={{ mr: 1 }} />,
                  }}
                  sx={{ minWidth: { xs: "100%", sm: 240 } }}
                />
                {isAdmin ? (
                  <FormControl size="small" sx={{ minWidth: 220 }}>
                    <InputLabel id="status-filter-label">Status</InputLabel>
                    <Select
                      labelId="status-filter-label"
                      label="Status"
                      value={statusFilter}
                      onChange={(event) =>
                        setStatusFilter(event.target.value as JobStatus | "ALL")
                      }
                    >
                      {statuses.map((status) => (
                        <MenuItem key={status} value={status}>
                          {status === "ALL" ? "All statuses" : statusLabels[status]}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : null}
              </Stack>
            </Stack>
            <Table size="medium">
              <TableHead>
                <TableRow>
                  {[
                    ["caseName", "Case"],
                    ["status", "Status"],
                    ["location", "Location"],
                    ["duration", "Duration"],
                    ["reporter", "Reporter"],
                    ["editor", "Editor"],
                    ["payout", "Payout"],
                  ].map(([key, label]) => (
                    <TableCell key={key}>
                      <TableSortLabel
                        active={sortKey === key}
                        direction={sortKey === key ? sortDirection : "asc"}
                        onClick={() => handleSort(key as JobSortKey)}
                      >
                        {label}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {displayedJobs.map((job) => {
                  const payout = getRolePayout(job, authUser);
                  const nextStatus = getNextStatus(job);
                  const canAdvance = authUser
                    ? canAdvanceStatus(job, authUser)
                    : false;

                  return (
                    <TableRow key={job.id} hover>
                      <TableCell>
                        <Typography fontWeight={700}>{job.caseName}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Version {job.version}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={statusLabels[job.status]}
                          color={statusColors[job.status]}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {job.locationType === "PHYSICAL"
                          ? `Physical - ${job.city ?? "No city"}`
                          : "Remote"}
                      </TableCell>
                      <TableCell>{job.duration} min</TableCell>
                      <TableCell>
                        {getAssignmentName(job.reporterId, reportersById, authUser)}
                      </TableCell>
                      <TableCell>
                        {getAssignmentName(job.editorId, editorsById, authUser)}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {moneyFormatter.format(payout.primaryAmount)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {payout.primaryLabel}: {payout.detail}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          {isAdmin ? (
                            <Tooltip title="Assign reporter">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={job.status !== "NEW"}
                                  onClick={() => setAssignReporterJob(job)}
                                >
                                  <AssignmentInd fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          ) : null}
                          <Tooltip title="Mark transcribed or reviewed">
                            <span>
                              <IconButton
                                size="small"
                                disabled={
                                  !nextStatus ||
                                  !canAdvance ||
                                  updateStatusMutation.isPending
                                }
                                onClick={() =>
                                  nextStatus
                                    ? updateStatusMutation.mutate({
                                        job,
                                        status: nextStatus,
                                      })
                                    : undefined
                                }
                              >
                                <CheckCircle fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          {isAdmin ? (
                            <Tooltip title="Assign editor">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={job.status !== "TRANSCRIBED"}
                                  onClick={() => setAssignEditorJob(job)}
                                >
                                  <RateReview fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          ) : null}
                          {isAdmin ? (
                            <Tooltip title="Process payment">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={
                                    job.status !== "REVIEWED" || payMutation.isPending
                                  }
                                  onClick={() => payMutation.mutate(job)}
                                >
                                  <Paid fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          ) : null}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {!jobsQuery.isLoading && displayedJobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Box sx={{ py: 6, textAlign: "center" }}>
                        <Typography variant="h6">No jobs found</Typography>
                        <Typography color="text.secondary">
                          Create a job or adjust the search/filter.
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      </Container>

      <CreateJobDialog
        open={createOpen}
        loading={createJobMutation.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={(input) => createJobMutation.mutate(input)}
      />
      <AssignDialog
        open={Boolean(assignReporterJob)}
        job={assignReporterJob}
        users={reportersQuery.data ?? []}
        role="REPORTER"
        loading={assignReporterMutation.isPending}
        onClose={() => setAssignReporterJob(null)}
        onSubmit={(userId) =>
          assignReporterJob
            ? assignReporterMutation.mutate({ job: assignReporterJob, userId })
            : undefined
        }
      />
      <AssignDialog
        open={Boolean(assignEditorJob)}
        job={assignEditorJob}
        users={editorsQuery.data ?? []}
        role="EDITOR"
        loading={assignEditorMutation.isPending}
        onClose={() => setAssignEditorJob(null)}
        onSubmit={(userId) =>
          assignEditorJob
            ? assignEditorMutation.mutate({ job: assignEditorJob, userId })
            : undefined
        }
      />
    </Box>
  );
}
