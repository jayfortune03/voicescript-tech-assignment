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
  const [duration, setDuration] = useState(60);
  const [locationType, setLocationType] = useState<LocationType>("REMOTE");
  const [city, setCity] = useState("");

  useEffect(() => {
    if (!open) return;
    setCaseName("");
    setDuration(60);
    setLocationType("REMOTE");
    setCity("");
  }, [open]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
            type="number"
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
            inputProps={{ min: 1 }}
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
