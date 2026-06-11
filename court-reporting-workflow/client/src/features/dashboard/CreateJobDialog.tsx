"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import type { CreateJobInput, LocationType } from "@/lib/types";

type CreateJobDialogProps = {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (input: CreateJobInput) => void;
};

export function CreateJobDialog({
  open,
  loading,
  onClose,
  onSubmit,
}: CreateJobDialogProps) {
  const [caseName, setCaseName] = useState("");
  const [durationInput, setDurationInput] = useState("60");
  const [locationType, setLocationType] = useState<LocationType>("REMOTE");
  const [city, setCity] = useState("");
  const duration = Number(durationInput);
  const durationError =
    durationInput.length > 0 && (!Number.isInteger(duration) || duration <= 0);

  useEffect(() => {
    if (!open) return;
    setCaseName("");
    setDurationInput("60");
    setLocationType("REMOTE");
    setCity("");
  }, [open]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (durationError || !durationInput) return;

    onSubmit({
      caseName,
      duration,
      locationType,
      city: city.trim() || null,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Create Job</DialogTitle>
      <DialogContent>
        <Stack
          spacing={2}
          sx={{ pt: 1 }}
          component="form"
          id="create-job-form"
          onSubmit={handleSubmit}
        >
          <TextField
            label="Case name"
            value={caseName}
            onChange={(event) => setCaseName(event.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Duration"
            value={durationInput}
            onChange={(event) => {
              const digitsOnly = event.target.value.replace(/\D/g, "");
              setDurationInput(digitsOnly.replace(/^0+(?=\d)/, ""));
            }}
            inputMode="numeric"
            error={durationError}
            helperText={durationError ? "Duration must be at least 1 minute." : ""}
            required
            fullWidth
          />
          <FormControl fullWidth>
            <InputLabel id="location-type-label">Location</InputLabel>
            <Select
              labelId="location-type-label"
              label="Location"
              value={locationType}
              onChange={(event) =>
                setLocationType(event.target.value as LocationType)
              }
            >
              <MenuItem value="REMOTE">Remote</MenuItem>
              <MenuItem value="PHYSICAL">Physical</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="City"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            required={locationType === "PHYSICAL"}
            helperText={
              locationType === "PHYSICAL"
                ? "Used to prefer same-city reporters."
                : "Optional for remote jobs."
            }
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          type="submit"
          form="create-job-form"
          variant="contained"
          disabled={loading}
        >
          {loading ? "Creating" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
