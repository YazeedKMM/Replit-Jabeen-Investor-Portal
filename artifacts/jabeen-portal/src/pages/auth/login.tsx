import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, ShieldCheck, Activity, MapPin } from "lucide-react";
import { MfaVerifyStep } from "./mfa-verify";
import { MfaSetupFlow } from "./mfa-setup";
import { LanguageSwitcher } from "@/components/language-switcher";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  companyName: z.string().min(2, "Company name is required"),
  title: z.string().optional(),
  phone: z.string().optional(),
});

type MfaStepState =
  | { type: "none" }
  | { type: "verify"; mfaToken: string }
  | { type: "setup"; mfaToken: string };

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login, register, user, isLoading, handleAuthResult } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [mfaStep, setMfaStep] = useState<MfaStepState>({ type: "none" });
  const searchParams = new URLSearchParams(window.location.search);
  const redirect = searchParams.get("redirect");

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
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
        toast({ title: "Welcome back", description: "Successfully signed in." });
        navigateAfterLogin(result.user.role);
      }
    } catch (error: any) {
      toast({
        title: "Sign in failed",
        description: error.data?.message || "Invalid credentials",
        variant: "destructive",
      });
    }
  };

  const onMfaVerifySuccess = (accessToken: string, user: any) => {
    handleAuthResult({ accessToken, user });
    toast({ title: "Welcome back", description: "Signed in with MFA." });
    navigateAfterLogin(user.role);
  };

  const onMfaSetupComplete = (accessToken: string, user: any) => {
    handleAuthResult({ accessToken, user });
    toast({ title: "MFA Enabled", description: "Your account is now protected with two-factor authentication." });
    navigateAfterLogin(user.role);
  };

  const onRegisterSubmit = async (data: z.infer<typeof registerSchema>) => {
    try {
      await register(data);
      toast({ title: "Account created", description: "Welcome to JABEEN." });
      setLocation("/my-projects");
    } catch (error: any) {
      toast({
        title: "Registration failed",
        description: error.data?.message || "Could not create account",
        variant: "destructive",
      });
    }
  };

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
          style={{ background: 'linear-gradient(105deg, rgba(7,5,3,0.86) 0%, rgba(7,5,3,0.62) 34%, rgba(7,5,3,0.18) 64%, rgba(7,5,3,0.08) 100%)' }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(0deg, rgba(7,5,3,0.72) 0%, rgba(7,5,3,0) 32%)' }}
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
            Royal Commission Industrial Cities
          </span>
          <h1
            className="login-rise text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.08] mt-5 mb-5"
            style={{ ['--rise-delay' as any]: '140ms', textShadow: '0 2px 24px rgba(0,0,0,0.45)' }}
          >
            JABEEN Project<br className="hidden lg:block" /> Lifecycle Tracking
          </h1>
          <p
            className="login-rise text-white/85 text-lg md:text-xl font-medium max-w-md"
            style={{ ['--rise-delay' as any]: '210ms', textShadow: '0 1px 16px rgba(0,0,0,0.4)' }}
          >
            The authoritative portal for investors to track all JABEEN projects across the Royal Commission's cities.
          </p>

          <div
            className="login-rise mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-white/80"
            style={{ ['--rise-delay' as any]: '280ms' }}
          >
            <span className="inline-flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary-foreground/90" aria-hidden="true" />
              Real-time milestones
            </span>
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary-foreground/90" aria-hidden="true" />
              Secure investor access
            </span>
          </div>
        </div>

        <div
          className="relative z-10 mt-12 md:mt-0 login-rise"
          style={{ ['--rise-delay' as any]: '340ms' }}
        >
          <p className="text-sm font-medium text-white/55">
            © {new Date().getFullYear()} Jubail and Yanbu Industrial Cities Services Company (JABEEN)
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
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-8 h-12 p-1 bg-muted">
                <TabsTrigger value="login" className="text-sm font-semibold rounded-md h-full data-[state=active]:bg-background data-[state=active]:shadow-sm">Sign In</TabsTrigger>
                <TabsTrigger value="register" className="text-sm font-semibold rounded-md h-full data-[state=active]:bg-background data-[state=active]:shadow-sm">Register</TabsTrigger>
              </TabsList>
              
              <TabsContent value="login" className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h2>
                  <p className="text-muted-foreground text-sm">Enter your credentials to access the portal</p>
                </div>
                
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-5">
                    <FormField
                      control={loginForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Work Email</FormLabel>
                          <FormControl>
                            <Input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="name@company.com" {...field} className="h-11" data-testid="input-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" autoComplete="current-password" placeholder="••••••••" {...field} className="h-11" data-testid="input-password" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="login-press w-full h-11 text-base font-semibold mt-2" disabled={loginForm.formState.isSubmitting} data-testid="button-submit-login">
                      {loginForm.formState.isSubmitting ? "Signing in…" : "Sign in to portal"}
                      {!loginForm.formState.isSubmitting && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="register" className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">Investor Registration</h2>
                  <p className="text-muted-foreground text-sm">Create an account to track your JABEEN projects</p>
                </div>

                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={registerForm.control}
                        name="fullName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Name</FormLabel>
                            <FormControl>
                              <Input autoComplete="name" placeholder="John Doe" {...field} className="h-10" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="companyName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Company</FormLabel>
                            <FormControl>
                              <Input autoComplete="organization" placeholder="Acme Corp" {...field} className="h-10" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <FormField
                      control={registerForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Work Email</FormLabel>
                          <FormControl>
                            <Input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="name@company.com" {...field} className="h-10" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={registerForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" autoComplete="new-password" placeholder="••••••••" {...field} className="h-10" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={registerForm.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Job Title <span className="text-muted-foreground font-normal">(Optional)</span></FormLabel>
                            <FormControl>
                              <Input autoComplete="organization-title" placeholder="Project Manager" {...field} className="h-10" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone <span className="text-muted-foreground font-normal">(Optional)</span></FormLabel>
                            <FormControl>
                              <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="+966…" {...field} className="h-10" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <Button type="submit" className="login-press w-full h-11 text-base font-semibold mt-4" disabled={registerForm.formState.isSubmitting} data-testid="button-submit-register">
                      {registerForm.formState.isSubmitting ? "Creating account…" : "Register Account"}
                    </Button>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
