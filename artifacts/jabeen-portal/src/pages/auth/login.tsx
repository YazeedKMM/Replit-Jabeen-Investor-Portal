import { useState } from "react";
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
import { Building2, ArrowRight } from "lucide-react";

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

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login, register, user, isLoading } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const searchParams = new URLSearchParams(window.location.search);
  const redirect = searchParams.get("redirect");

  // Redirect if already logged in
  if (user && !isLoading) {
    if (redirect) {
      setLocation(redirect);
    } else if (user.role === "investor") {
      setLocation("/my-projects");
    } else {
      setLocation("/dashboard");
    }
    return null;
  }

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

  const onLoginSubmit = async (data: z.infer<typeof loginSchema>) => {
    try {
      const result = await login(data);
      toast({ title: "Welcome back", description: "Successfully signed in." });
      if (redirect) {
        setLocation(redirect);
      } else if (result.user.role === "investor") {
        setLocation("/my-projects");
      } else {
        setLocation("/dashboard");
      }
    } catch (error: any) {
      toast({
        title: "Sign in failed",
        description: error.data?.message || "Invalid credentials",
        variant: "destructive",
      });
    }
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
      <div className="w-full md:w-1/2 lg:w-[60%] bg-primary flex flex-col p-8 md:p-12 text-primary-foreground justify-between relative overflow-hidden">
        {/* Subtle geometric pattern overlay */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 font-bold text-2xl tracking-tight">
            <div className="h-10 w-10 bg-white text-primary rounded flex items-center justify-center">
              J
            </div>
            JABEEN
          </div>
        </div>
        
        <div className="relative z-10 max-w-xl mt-12 md:mt-0">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] mb-6">
            Industrial Project Lifecycle Tracking
          </h1>
          <p className="text-primary-foreground/80 text-lg md:text-xl font-medium max-w-md">
            The authoritative portal for Jubail Industrial City investors to track construction and operational milestones.
          </p>
        </div>
        
        <div className="relative z-10 mt-12 md:mt-0">
          <p className="text-sm font-medium text-primary-foreground/60">
            © {new Date().getFullYear()} Royal Commission for Jubail and Yanbu
          </p>
        </div>
      </div>

      {/* Form Side */}
      <div className="w-full md:w-1/2 lg:w-[40%] flex items-center justify-center p-8 bg-card relative">
        <div className="w-full max-w-[420px]">
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
                          <Input placeholder="name@company.com" {...field} className="h-11" data-testid="input-email" />
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
                          <Input type="password" placeholder="••••••••" {...field} className="h-11" data-testid="input-password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full h-11 text-base font-semibold mt-2" disabled={loginForm.formState.isSubmitting} data-testid="button-submit-login">
                    {loginForm.formState.isSubmitting ? "Signing in..." : "Sign in to portal"}
                    {!loginForm.formState.isSubmitting && <ArrowRight className="ml-2 h-4 w-4" />}
                  </Button>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="register" className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Investor Registration</h2>
                <p className="text-muted-foreground text-sm">Create an account to track your industrial project</p>
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
                            <Input placeholder="John Doe" {...field} className="h-10" />
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
                            <Input placeholder="Acme Corp" {...field} className="h-10" />
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
                          <Input placeholder="name@company.com" {...field} className="h-10" />
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
                          <Input type="password" placeholder="••••••••" {...field} className="h-10" />
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
                            <Input placeholder="Project Manager" {...field} className="h-10" />
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
                            <Input placeholder="+966..." {...field} className="h-10" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button type="submit" className="w-full h-11 text-base font-semibold mt-4" disabled={registerForm.formState.isSubmitting} data-testid="button-submit-register">
                    {registerForm.formState.isSubmitting ? "Creating account..." : "Register Account"}
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
