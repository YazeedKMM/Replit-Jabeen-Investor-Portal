import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { TFunction } from "i18next";
import type { User } from "@workspace/api-client-react";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useBranding, logoUrl } from "@/theme/theme-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LanguageSwitcher } from "@/components/language-switcher";
import { apiErrorMessage } from "@/lib/api-error";
import { MfaVerifyStep } from "./mfa-verify";

const makeLoginSchema = (t: TFunction) =>
  z.object({
    email: z.string().email(t("validation.invalidEmail")),
    password: z.string().min(1, t("validation.passwordRequired")),
  });

const makeRegisterSchema = (t: TFunction) =>
  z.object({
    fullName: z.string().min(2, t("validation.fullNameMin")),
    email: z.string().email(t("validation.invalidEmail")),
    password: z.string().min(8, t("validation.passwordMin")),
    companyName: z.string().min(2, t("validation.companyRequired")),
    title: z.string().optional(),
    phone: z.string().optional(),
  });

type LoginForm = z.infer<ReturnType<typeof makeLoginSchema>>;
type RegisterForm = z.infer<ReturnType<typeof makeRegisterSchema>>;

type MfaStepState = { type: "none" } | { type: "verify"; mfaToken: string };

/**
 * Tenant brand mark for the pre-auth surface. Uploaded logos come from the
 * branding API via useBranding()/logoUrl(); with no logo the brand name
 * renders as display text. Logos never mirror in RTL.
 */
export function BrandMark() {
  const { branding } = useBranding();
  const light = logoUrl(branding.logos?.light);
  const dark = logoUrl(branding.logos?.dark);

  if (!light && !dark) {
    return (
      <span className="font-display text-3xl font-semibold text-foreground">{branding.name}</span>
    );
  }
  return (
    <>
      <img src={light ?? dark ?? undefined} alt={branding.name} className="h-12 w-auto dark:hidden" />
      <img src={dark ?? light ?? undefined} alt={branding.name} className="hidden h-12 w-auto dark:block" />
    </>
  );
}

/** Inline field error (react-hook-form), programmatically tied to its input via id. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login, register, user, isLoading, handleAuthResult } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [mfaStep, setMfaStep] = useState<MfaStepState>({ type: "none" });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const searchParams = new URLSearchParams(window.location.search);
  const redirect = searchParams.get("redirect");

  const loginSchema = useMemo(() => makeLoginSchema(t), [t]);
  const registerSchema = useMemo(() => makeRegisterSchema(t), [t]);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", email: "", password: "", companyName: "", title: "", phone: "" },
  });

  // Redirect if already logged in — runs in an effect, never during render
  // (calling setLocation during render triggers a setState-in-render warning).
  useEffect(() => {
    if (!user || isLoading) return;
    if (redirect) {
      setLocation(redirect);
    } else if (user.role === "investor") {
      setLocation("/my-projects");
    } else {
      setLocation("/dashboard");
    }
  }, [user, isLoading, redirect, setLocation]);

  if (user && !isLoading) {
    return null;
  }

  const navigateAfterLogin = (role: string) => {
    if (redirect) {
      setLocation(redirect);
    } else if (role === "investor") {
      setLocation("/my-projects");
    } else {
      setLocation("/dashboard");
    }
  };

  const onLoginSubmit = async (data: LoginForm) => {
    setLoginError(null);
    try {
      const result = await login(data);

      if (result.mfaRequired && result.mfaToken) {
        setMfaStep({ type: "verify", mfaToken: result.mfaToken });
        return;
      }

      if (result.mfaSetupRequired && result.mfaToken) {
        // Fresh staff enrollment happens on the dedicated /mfa/setup page.
        setLocation(`/mfa/setup?token=${encodeURIComponent(result.mfaToken)}&required=1`);
        return;
      }

      // Full session issued
      if (result.accessToken && result.user) {
        toast({ title: t("auth.toast.welcomeBackTitle"), description: t("auth.toast.welcomeBackDesc") });
        navigateAfterLogin(result.user.role);
      } else {
        // Defensive: the server returned 200 with none of the known outcomes.
        setLoginError(t("auth.toast.signInFailedTitle"));
      }
    } catch (error: unknown) {
      setLoginError(apiErrorMessage(error, t("auth.toast.invalidCredentials")));
    }
  };

  // TODO(backend): there is no password-recovery endpoint yet — the only
  // "recovery" in the API is MFA recovery codes (api-server/src/lib/mfa.ts),
  // which is unrelated. When a real reset flow lands (e.g.
  // POST /api/auth/forgot-password + a reset page), wire this handler to it.
  // Until then, direct users to the administrator.
  const onForgotPassword = () => {
    toast({
      title: t("auth.forgotPasswordTitle"),
      description: t("auth.forgotPasswordDesc"),
    });
  };

  const onMfaVerifySuccess = (accessToken: string, mfaUser: User) => {
    handleAuthResult({ accessToken, user: mfaUser });
    toast({ title: t("auth.toast.welcomeBackTitle"), description: t("auth.toast.welcomeBackMfaDesc") });
    navigateAfterLogin(mfaUser.role);
  };

  const onRegisterSubmit = async (data: RegisterForm) => {
    setRegisterError(null);
    try {
      await register(data);
      toast({ title: t("auth.toast.accountCreatedTitle"), description: t("auth.toast.accountCreatedDesc") });
      setLocation("/my-projects");
    } catch (error: unknown) {
      setRegisterError(apiErrorMessage(error, t("auth.toast.couldNotCreateAccount")));
    }
  };

  const submitLogin = loginForm.handleSubmit(onLoginSubmit);
  const submitRegister = registerForm.handleSubmit(onRegisterSubmit);
  const loginErrors = loginForm.formState.errors;
  const registerErrors = registerForm.formState.errors;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="flex items-center justify-end p-4 sm:px-6">
        <LanguageSwitcher />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-10 pt-4 sm:items-center sm:pb-24 sm:pt-0">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center gap-4 text-center">
            <BrandMark />
            <h1 className="font-display text-4xl font-semibold text-foreground">
              {t("auth.productHeading")}
            </h1>
          </div>

          <div className="rounded-xl border border-card-border bg-card p-6 shadow-sm sm:p-8">
            {mfaStep.type === "verify" ? (
              <MfaVerifyStep
                mfaToken={mfaStep.mfaToken}
                onSuccess={onMfaVerifySuccess}
                onBack={() => setMfaStep({ type: "none" })}
              />
            ) : (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "login" | "register")} className="w-full">
                <TabsList className="mb-6 grid h-11 w-full grid-cols-2">
                  <TabsTrigger value="login" className="h-full text-sm font-medium">
                    {t("auth.tabSignIn")}
                  </TabsTrigger>
                  <TabsTrigger value="register" className="h-full text-sm font-medium">
                    {t("auth.tabRegister")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="space-y-6">
                  <div className="space-y-1.5">
                    <h2 className="font-display text-2xl font-semibold text-foreground">{t("auth.welcomeBack")}</h2>
                    <p className="text-sm text-muted-foreground">{t("auth.welcomeBackDesc")}</p>
                  </div>

                  <form onSubmit={submitLogin} noValidate className="space-y-5">
                    {loginError && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" aria-hidden="true" />
                        <AlertDescription>{loginError}</AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="login-email">{t("auth.workEmail")}</Label>
                      <Input
                        id="login-email"
                        type="email"
                        autoComplete="username"
                        inputMode="email"
                        placeholder="name@company.com"
                        aria-invalid={!!loginErrors.email}
                        aria-describedby={loginErrors.email ? "login-email-error" : undefined}
                        {...loginForm.register("email")}
                      />
                      <FieldError id="login-email-error" message={loginErrors.email?.message} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="login-password">{t("auth.password")}</Label>
                      <Input
                        id="login-password"
                        type="password"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        aria-invalid={!!loginErrors.password}
                        aria-describedby={loginErrors.password ? "login-password-error" : undefined}
                        {...loginForm.register("password")}
                      />
                      <FieldError id="login-password-error" message={loginErrors.password?.message} />
                    </div>

                    <div className="-mt-1 text-end">
                      <button
                        type="button"
                        onClick={onForgotPassword}
                        className="text-sm font-medium text-secondary hover:underline"
                      >
                        {t("auth.forgotPassword")}
                      </button>
                    </div>

                    <Button type="submit" size="lg" className="w-full" disabled={loginForm.formState.isSubmitting}>
                      {loginForm.formState.isSubmitting && <Spinner aria-hidden="true" />}
                      {loginForm.formState.isSubmitting ? t("auth.signingIn") : t("auth.signInButton")}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="register" className="space-y-6">
                  <div className="space-y-1.5">
                    <h2 className="font-display text-2xl font-semibold text-foreground">
                      {t("auth.investorRegistration")}
                    </h2>
                    <p className="text-sm text-muted-foreground">{t("auth.investorRegistrationDesc")}</p>
                  </div>

                  <form onSubmit={submitRegister} noValidate className="space-y-4">
                    {registerError && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" aria-hidden="true" />
                        <AlertDescription>{registerError}</AlertDescription>
                      </Alert>
                    )}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="register-fullname">{t("auth.fullName")}</Label>
                        <Input
                          id="register-fullname"
                          autoComplete="name"
                          aria-invalid={!!registerErrors.fullName}
                          aria-describedby={registerErrors.fullName ? "register-fullname-error" : undefined}
                          {...registerForm.register("fullName")}
                        />
                        <FieldError id="register-fullname-error" message={registerErrors.fullName?.message} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-company">{t("auth.company")}</Label>
                        <Input
                          id="register-company"
                          autoComplete="organization"
                          aria-invalid={!!registerErrors.companyName}
                          aria-describedby={registerErrors.companyName ? "register-company-error" : undefined}
                          {...registerForm.register("companyName")}
                        />
                        <FieldError id="register-company-error" message={registerErrors.companyName?.message} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-email">{t("auth.workEmail")}</Label>
                      <Input
                        id="register-email"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        placeholder="name@company.com"
                        aria-invalid={!!registerErrors.email}
                        aria-describedby={registerErrors.email ? "register-email-error" : undefined}
                        {...registerForm.register("email")}
                      />
                      <FieldError id="register-email-error" message={registerErrors.email?.message} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-password">{t("auth.password")}</Label>
                      <Input
                        id="register-password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="••••••••"
                        aria-invalid={!!registerErrors.password}
                        aria-describedby={registerErrors.password ? "register-password-error" : undefined}
                        {...registerForm.register("password")}
                      />
                      <FieldError id="register-password-error" message={registerErrors.password?.message} />
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="register-title">
                          {t("auth.jobTitle")}{" "}
                          <span className="text-muted-foreground">{t("auth.optional")}</span>
                        </Label>
                        <Input
                          id="register-title"
                          autoComplete="organization-title"
                          {...registerForm.register("title")}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-phone">
                          {t("auth.phone")}{" "}
                          <span className="text-muted-foreground">{t("auth.optional")}</span>
                        </Label>
                        <Input
                          id="register-phone"
                          type="tel"
                          autoComplete="tel"
                          inputMode="tel"
                          {...registerForm.register("phone")}
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      size="lg"
                      className="w-full"
                      disabled={registerForm.formState.isSubmitting}
                    >
                      {registerForm.formState.isSubmitting && <Spinner aria-hidden="true" />}
                      {registerForm.formState.isSubmitting
                        ? t("auth.creatingAccount")
                        : t("auth.registerButton")}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            )}
          </div>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} {t("auth.footerCompany")}
          </p>
        </div>
      </main>
    </div>
  );
}
