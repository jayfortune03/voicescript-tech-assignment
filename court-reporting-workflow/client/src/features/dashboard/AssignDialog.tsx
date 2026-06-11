"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  ListSubheader,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import type { Job, User, UserRole } from "@/lib/types";

type AssignDialogProps = {
  open: boolean;
  job: Job | null;
  users: User[];
  role: Extract<UserRole, "REPORTER" | "EDITOR">;
  loading: boolean;
  onClose: () => void;
  onSubmit: (userId: string) => void;
};

export function AssignDialog({
  open,
  job,
  users,
  role,
  loading,
  onClose,
  onSubmit,
}: AssignDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState("");

  const visibleUsers = useMemo(() => {
    if (!job || role !== "REPORTER" || job.locationType !== "PHYSICAL") {
      return users;
    }

    return [...users].sort((a, b) => {
      const aSameCity = a.city === job.city ? 0 : 1;
      const bSameCity = b.city === job.city ? 0 : 1;
      return aSameCity - bSameCity || a.name.localeCompare(b.name);
    });
  }, [job, role, users]);

  const title = role === "REPORTER" ? "Assign Reporter" : "Assign Editor";
  const helper =
    role === "REPORTER" && job?.locationType === "PHYSICAL"
      ? `Physical jobs prefer reporters in ${job.city}. Same-city reporters are listed first, but remote assignment is still allowed.`
      : "Only available users can be assigned.";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      TransitionProps={{
        onEntered: () => setSelectedUserId(""),
      }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography color="text.secondary">{helper}</Typography>
          <FormControl fullWidth>
            <InputLabel id="assign-user-label">User</InputLabel>
            <Select
              labelId="assign-user-label"
              label="User"
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
            >
              <ListSubheader>Available</ListSubheader>
              {visibleUsers
                .filter((user) => user.isAvailable)
                .map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <span>{user.name}</span>
                      {user.city ? <Chip size="small" label={user.city} /> : null}
                      {role === "REPORTER" &&
                      job?.locationType === "PHYSICAL" &&
                      user.city === job.city ? (
                        <Chip size="small" color="success" label="Preferred" />
                      ) : null}
                    </Stack>
                  </MenuItem>
                ))}
              <ListSubheader>Unavailable</ListSubheader>
              {visibleUsers
                .filter((user) => !user.isAvailable)
                .map((user) => (
                  <MenuItem key={user.id} value={user.id} disabled>
                    {user.name} {user.city ? `- ${user.city}` : ""}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!selectedUserId || loading}
          onClick={() => onSubmit(selectedUserId)}
        >
          {loading ? "Assigning" : "Assign"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
