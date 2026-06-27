import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { TFunction } from "i18next";
import { useAuth } from "@/hooks/use-auth";
import { DgaTextField } from "@/components/ui/dga-text-field";
import { DgaForm } from "@/components/ui/dga-form";
import { DgaSubmitButton } from "@/components/ui/dga-brand-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Activity, MapPin } from "lucide-react";
import { MfaVerifyStep } from "./mfa-verify";
import { MfaSetupFlow } from "./mfa-setup";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLanguage } from "@/hooks/use-language";
import { useTranslation } from "react-i18next";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const makeLoginSchema = (t: TFunction) => z.object({
  email: z.string().email(t("validation.invalidEmail")),
  password: z.string().min(1, t("validation.passwordRequired")),
});

const makeRegisterSchema = (t: TFunction) => z.object({
  fullName: z.string().min(2, t("validation.fullNameMin")),
  email: z.string().email(t("validation.invalidEmail")),
  password: z.string().min(8, t("validation.passwordMin")),
  companyName: z.string().min(2, t("validation.companyRequired")),
  title: z.string().optional(),
  phone: z.string().optional(),
});

type LoginForm = z.infer<ReturnType<typeof makeLoginSchema>>;
type RegisterForm = z.infer<ReturnType<typeof makeRegisterSchema>>;

type MfaStepState =
  | { type: "none" }
  | { type: "verify"; mfaToken: string }
  | { type: "setup"; mfaToken: string };

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login, register, user, isLoading, handleAuthResult } = useAuth();
  const { toast } = useToast();
  const { dir } = useLanguage();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [mfaStep, setMfaStep] = useState<MfaStepState>({ type: "none" });
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
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      companyName: "",
      title: "",
      phone: "",
    },
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

  const onLoginSubmit = async (data: z.infer<typeof loginSchema>) => {
    try {
      const result = await login(data);

      if (result.mfaRequired && result.mfaToken) {
        setMfaStep({ type: "verify", mfaToken: result.mfaToken });
        return;
      }

      if (result.mfaSetupRequired && result.mfaToken) {
        setMfaStep({ type: "setup", mfaToken: result.mfaToken });
        return;
      }

      // Full session issued
      if (result.accessToken && result.user) {
        toast({ title: t("auth.toast.welcomeBackTitle"), description: t("auth.toast.welcomeBackDesc") });
        navigateAfterLogin(result.user.role);
      }
    } catch (error: any) {
      toast({
        title: t("auth.toast.signInFailedTitle"),
        description: error.data?.message || t("auth.toast.invalidCredentials"),
        variant: "destructive",
      });
    }
  };

  // TODO(backend): there is no password-recovery endpoint yet — the only
  // "recovery" in the API is MFA recovery codes (api-server/src/lib/mfa.ts),
  // which is unrelated. When a real reset flow lands (e.g.
  // POST /api/auth/forgot-password + a reset page), wire this handler to it.
  // Until then, direct users to the JABEEN administrator.
  const onForgotPassword = () => {
    toast({
      title: t("auth.forgotPasswordTitle"),
      description: t("auth.forgotPasswordDesc"),
    });
  };

  const onMfaVerifySuccess = (accessToken: string, user: any) => {
    handleAuthResult({ accessToken, user });
    toast({ title: t("auth.toast.welcomeBackTitle"), description: t("auth.toast.welcomeBackMfaDesc") });
    navigateAfterLogin(user.role);
  };

  const onMfaSetupComplete = (accessToken: string, user: any) => {
    handleAuthResult({ accessToken, user });
    toast({ title: t("auth.toast.mfaEnabledTitle"), description: t("auth.toast.mfaEnabledDesc") });
    navigateAfterLogin(user.role);
  };

  const onRegisterSubmit = async (data: z.infer<typeof registerSchema>) => {
    try {
      await register(data);
      toast({ title: t("auth.toast.accountCreatedTitle"), description: t("auth.toast.accountCreatedDesc") });
      setLocation("/my-projects");
    } catch (error: any) {
      toast({
        title: t("auth.toast.registrationFailedTitle"),
        description: error.data?.message || t("auth.toast.couldNotCreateAccount"),
        variant: "destructive",
      });
    }
  };

  const submitLogin = loginForm.handleSubmit(onLoginSubmit);
  const submitRegister = registerForm.handleSubmit(onRegisterSubmit);

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      {/* Brand Side */}
      <div className="relative w-full md:w-1/2 lg:w-[60%] min-h-[42vh] md:min-h-0 flex flex-col p-8 md:p-12 text-white justify-between overflow-hidden bg-[#0c0a08]">
        {/* Jubail Industrial City — petrochemical complex at golden hour */}
        <img
          src={`${BASE}/jubail-refinery.webp`}
          alt=""
          aria-hidden="true"
          width={1920}
          height={1080}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-[60%_center]"
        />
        {/* Legibility scrim — darken left + bottom where text sits, so it holds AA contrast over the photo */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `linear-gradient(${dir === "rtl" ? 255 : 105}deg, rgba(7,5,3,0.86) 0%, rgba(7,5,3,0.62) 34%, rgba(7,5,3,0.18) 64%, rgba(7,5,3,0.08) 100%)` }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(0deg, rgba(7,5,3,0.72) 0%, rgba(7,5,3,0) 32%)' }}
        />
        {/* Focused scrim centered on the headline/feature text zone. The large
            headline sits over the brightest sunset pixels where the diagonal
            scrim above is only ~0.39 alpha (≈2.9:1 white-on-image, below AA).
            This radial adds darkening only behind the text column and fades to
            transparent before the refinery, so the photo isn't flattened. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(120% 82% at ${dir === "rtl" ? "70%" : "30%"} 47%, rgba(7,5,3,0.58) 0%, rgba(7,5,3,0.36) 40%, rgba(7,5,3,0) 72%)` }}
        />
        {/* Faint warm wash to seat the photo in the gold identity */}
        <div className="absolute inset-0 pointer-events-none mix-blend-soft-light bg-primary/15" />

        <div className="relative z-10 login-rise" style={{ ['--rise-delay' as any]: '0ms' }}>
          <img src={`${BASE}/jabeen-logo.svg`} alt="JABEEN" className="h-14 w-auto brightness-0 invert" />
        </div>

        <div className="relative z-10 max-w-xl mt-12 md:mt-0">
          <span
            className="login-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/90 backdrop-blur-sm"
            style={{ ['--rise-delay' as any]: '80ms' }}
          >
            <MapPin className="h-3.5 w-3.5" />
            {t("auth.brandChip")}
          </span>
          <h1
            className="login-rise text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.08] mt-5 mb-5"
            style={{ ['--rise-delay' as any]: '140ms', textShadow: '0 2px 24px rgba(0,0,0,0.45)' }}
          >
            {t("auth.headline")}
          </h1>
          <p
            className="login-rise text-white/85 text-lg md:text-xl font-medium max-w-md"
            style={{ ['--rise-delay' as any]: '210ms', textShadow: '0 1px 16px rgba(0,0,0,0.4)' }}
          >
            {t("auth.subCopy")}
          </p>

          <div
            className="login-rise mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-white/80"
            style={{ ['--rise-delay' as any]: '280ms' }}
          >
            <span className="inline-flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary-foreground/90" aria-hidden="true" />
              {t("auth.featureMilestones")}
            </span>
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary-foreground/90" aria-hidden="true" />
              {t("auth.featureSecure")}
            </span>
          </div>
        </div>

        <div
          className="relative z-10 mt-12 md:mt-0 login-rise"
          style={{ ['--rise-delay' as any]: '340ms' }}
        >
          <p className="text-sm font-medium text-white/55">
            © {new Date().getFullYear()} {t("auth.footerCompany")}
          </p>
        </div>
      </div>

      {/* Form Side */}
      <div className="w-full md:w-1/2 lg:w-[40%] flex items-center justify-center p-8 bg-card relative">
        <div className="absolute top-4 end-4 z-20">
          <LanguageSwitcher />
        </div>
        <div className="w-full max-w-[420px] login-rise" style={{ ['--rise-delay' as any]: '120ms' }}>

          {/* MFA Verify Step */}
          {mfaStep.type === "verify" && (
            <MfaVerifyStep
              mfaToken={mfaStep.mfaToken}
              onSuccess={onMfaVerifySuccess}
              onBack={() => setMfaStep({ type: "none" })}
            />
          )}

          {/* MFA Setup Step */}
          {mfaStep.type === "setup" && (
            <MfaSetupFlow
              mfaToken={mfaStep.mfaToken}
              onComplete={onMfaSetupComplete}
              isRequired
            />
          )}

          {/* Normal Login / Register */}
          {mfaStep.type === "none" && (
            <>
              {/* Brand mark on the form side — anchors the column so it doesn't
                  float in empty space, and mirrors the hero logo. Native logo is
                  two-tone gold + dark (reads on the light card); invert to white
                  in dark theme where the card surface goes dark. */}
              <div className="mb-9 flex justify-center md:justify-start">
                <img
                  src={`${BASE}/jabeen-logo.svg`}
                  alt="JABEEN"
                  className="h-12 w-auto dark:brightness-0 dark:invert"
                />
              </div>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6 h-12 p-1 bg-muted">
                <TabsTrigger value="login" className="text-sm font-semibold rounded-md h-full data-[state=active]:bg-background data-[state=active]:shadow-sm">{t("auth.tabSignIn")}</TabsTrigger>
                <TabsTrigger value="register" className="text-sm font-semibold rounded-md h-full data-[state=active]:bg-background data-[state=active]:shadow-sm">{t("auth.tabRegister")}</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("auth.welcomeBack")}</h2>
                  <p className="text-muted-foreground text-sm">{t("auth.welcomeBackDesc")}</p>
                </div>

                <DgaForm onSubmit={submitLogin} className="space-y-5">
                    {/* Phase 3: DGA text inputs (label + validation via the
                        component's own props). data-testid was DOM-only and the
                        web component doesn't forward it; tests are HTTP-level. */}
                    <DgaTextField
                      control={loginForm.control}
                      name="email"
                      label={t("auth.workEmail")}
                      placeholder="name@company.com"
                      required
                    />
                    <DgaTextField
                      control={loginForm.control}
                      name="password"
                      type="password"
                      label={t("auth.password")}
                      placeholder="••••••••"
                      required
                    />
                    {/* Forgot-password affordance. Logical text-end keeps it on
                        the trailing edge in both LTR and RTL. Colored via the
                        theme-split --text-primary token so it stays gold and AA
                        (gold-800 #826311 on the light card = 5.6:1; brand gold on
                        dark = 5.85:1) rather than the lighter utility gold. */}
                    <div className="-mt-3 text-end">
                      <button
                        type="button"
                        onClick={onForgotPassword}
                        className="text-sm font-medium hover:underline"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {t("auth.forgotPassword")}
                      </button>
                    </div>
                    <DgaSubmitButton
                      onSubmit={submitLogin}
                      size="lg"
                      fullWidth
                      loading={loginForm.formState.isSubmitting}
                      loadingLabel={t("auth.signingIn")}
                      label={t("auth.signInButton")}
                    />
                  </DgaForm>
              </TabsContent>

              <TabsContent value="register" className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("auth.investorRegistration")}</h2>
                  <p className="text-muted-foreground text-sm">{t("auth.investorRegistrationDesc")}</p>
                </div>

                <DgaForm onSubmit={submitRegister} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <DgaTextField
                        control={registerForm.control}
                        name="fullName"
                        label={t("auth.fullName")}
                        placeholder="John Doe"
                        required
                      />
                      <DgaTextField
                        control={registerForm.control}
                        name="companyName"
                        label={t("auth.company")}
                        placeholder="Acme Corp"
                        required
                      />
                    </div>

                    <DgaTextField
                      control={registerForm.control}
                      name="email"
                      label={t("auth.workEmail")}
                      placeholder="name@company.com"
                      required
                    />

                    <DgaTextField
                      control={registerForm.control}
                      name="password"
                      type="password"
                      label={t("auth.password")}
                      placeholder="••••••••"
                      required
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <DgaTextField
                        control={registerForm.control}
                        name="title"
                        label={`${t("auth.jobTitle")} ${t("auth.optional")}`}
                        placeholder="Project Manager"
                      />
                      <DgaTextField
                        control={registerForm.control}
                        name="phone"
                        label={`${t("auth.phone")} ${t("auth.optional")}`}
                        placeholder="+966…"
                      />
                    </div>

                    <DgaSubmitButton
                      onSubmit={submitRegister}
                      size="lg"
                      fullWidth
                      loading={registerForm.formState.isSubmitting}
                      loadingLabel={t("auth.creatingAccount")}
                      label={t("auth.registerButton")}
                    />
                  </DgaForm>
              </TabsContent>
            </Tabs>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
