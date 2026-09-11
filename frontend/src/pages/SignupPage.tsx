import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useAuth } from "../lib/auth";

export const SignupPage: React.FC = () => {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await signup(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-[380px]">
        <div className="flex items-center justify-center mb-8">
          <img src="/logo.png" alt="TrueLoot" className="h-9 w-auto" />
        </div>

        <Card className="p-8">
          <h1 className="text-[22px] font-semibold text-center mb-1">Create your account</h1>
          <p className="text-[13px] text-ink-muted text-center mb-6">Starts on the Free plan -- no card required</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              type="email"
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@studio.com"
              required
              autoFocus
            />
            <Input
              type="password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              minLength={8}
              required
              hint="Minimum 8 characters."
            />
            {error && <div className="text-[13px] text-danger bg-danger-soft rounded-md px-3 py-2">{error}</div>}
            <Button type="submit" disabled={isSubmitting} className="mt-1">
              {isSubmitting ? "Creating account..." : "Create Account"}
            </Button>
          </form>
        </Card>

        <p className="text-center text-[13px] text-ink-muted mt-5">
          Already have an account?{" "}
          <Link to="/login" className="text-accent font-medium hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
};
