import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Logo, ThemeToggle } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { Alert, Card, Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(120),
    email: z.string().email("Enter a valid email address"),
    password: z.string().min(8, "Use at least 8 characters").max(128),
    confirm: z.string(),
    signupCode: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="h-1 bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-500" aria-hidden />
      <header className="flex items-center justify-between px-4 py-3 sm:px-8">
        <Link to="/" aria-label="MeetCite home">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <Card className="p-6">{children}</Card>
        </div>
      </main>
    </div>
  );
}

function TextField(props: {
  id: string;
  label: string;
  type: string;
  autoComplete: string;
  registration: UseFormRegisterReturn;
  error?: string;
}) {
  const errorId = `${props.id}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        type={props.type}
        autoComplete={props.autoComplete}
        aria-invalid={!!props.error}
        aria-describedby={props.error ? errorId : undefined}
        {...props.registration}
      />
      <FieldError id={errorId} message={props.error} />
    </div>
  );
}

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/";
  const [error, setError] = useState<string>();
  const { register, handleSubmit, formState } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(undefined);
    try {
      signIn(await api.login(values));
      navigate(from, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    }
  });

  return (
    <AuthShell title="Welcome back" subtitle="Log in to see your meetings.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert variant="destructive">{error}</Alert>}
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          registration={register("email")}
          error={formState.errors.email?.message}
        />
        <TextField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          registration={register("password")}
          error={formState.errors.password?.message}
        />
        <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
          {formState.isSubmitting && <Spinner />} Log in
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link to="/register" className="font-medium text-primary underline-offset-4 hover:underline">
            Create one
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const { register, handleSubmit, formState } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
  });
  const errors = formState.errors;
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: 5 * 60_000 });
  const codeRequired = config.data?.signup_code_required ?? false;

  const onSubmit = handleSubmit(async ({ name, email, password, signupCode }) => {
    setError(undefined);
    if (codeRequired && !signupCode) {
      setError("Enter the sign-up code you were given.");
      return;
    }
    try {
      signIn(await api.register({ name, email, password, signup_code: signupCode || undefined }));
      navigate("/", { replace: true });
    } catch (e) {
      setError((e as Error).message);
    }
  });

  return (
    <AuthShell title="Create your account" subtitle="Turn meeting recordings into clear, checkable minutes.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert variant="destructive">{error}</Alert>}
        <TextField
          id="name"
          label="Name"
          type="text"
          autoComplete="name"
          registration={register("name")}
          error={errors.name?.message}
        />
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          registration={register("email")}
          error={errors.email?.message}
        />
        <TextField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          registration={register("password")}
          error={errors.password?.message}
        />
        <TextField
          id="confirm"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          registration={register("confirm")}
          error={errors.confirm?.message}
        />
        {codeRequired && (
          <TextField
            id="signupCode"
            label="Sign-up code"
            type="text"
            autoComplete="off"
            registration={register("signupCode")}
            error={errors.signupCode?.message}
          />
        )}
        <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
          {formState.isSubmitting && <Spinner />} Create account
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already registered?{" "}
          <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
