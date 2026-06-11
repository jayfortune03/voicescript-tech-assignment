"use client";

import { FormEvent, useState } from "react";
import { Login } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { api, authStorage } from "@/lib/api";
import type { AuthUser } from "@/lib/types";

type LoginPanelProps = {
  onLogin: (user: AuthUser) => void;
};

export function LoginPanel({ onLogin }: LoginPanelProps) {
  const [email, setEmail] = useState("admin@app.com");
  const [password, setPassword] = useState("password123");

  const loginMutation = useMutation({
    mutationFn: () => api.login(email, password),
    onSuccess: (data) => {
      authStorage.setAuth(data.token, data.user);
      onLogin(data.user);
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    loginMutation.mutate();
  };

  return (
    <Container maxWidth="xs" sx={{ py: 10 }}>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={3} component="form" onSubmit={handleSubmit}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              Court Workflow
            </Typography>
            <Typography color="text.secondary">
              Sign in as an admin, reporter, or editor to manage your workflow.
            </Typography>
          </Box>

          {loginMutation.isError ? (
            <Alert severity="error">
              {loginMutation.error.message || "Unable to sign in"}
            </Alert>
          ) : null}

          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            fullWidth
          />
          <Button
            type="submit"
            variant="contained"
            size="large"
            startIcon={<Login />}
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? "Signing in" : "Sign in"}
          </Button>
        </Stack>
      </Paper>
    </Container>
  );
}
