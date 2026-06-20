import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Copy, Check, Download, AlertTriangle, Smartphone } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface MfaSetupProps {
  mfaToken: string;
  onComplete: (accessToken: string, user: any) => void;
  isRequired?: boolean;
}

type Step = "setup" | "confirm" | "recovery";

interface SetupData {
  otpauthUri: string;
  qrCode: string;
  secret: string;
}

interface RecoveryData {
  recoveryCodes: string[];
  accessToken: string;
  user: any;
}

export function MfaSetupFlow({ mfaToken, onComplete, isRequired }: MfaSetupProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("setup");
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [recoveryData, setRecoveryData] = useState<RecoveryData | null>(null);
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [setupInitiated, setSetupInitiated] = useState(false);

  const initiateSetup = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/mfa/setup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${mfaToken}` },
      });
      if (!res.ok) throw new Error("Failed to initiate MFA setup");
      const data = await res.json();
      setSetupData(data);
      setSetupInitiated(true);
    } catch {
      toast({ title: "Error", description: "Failed to start MFA setup", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const confirmSetup = async () => {
    if (!code || code.length !== 6) {
      toast({ title: "Invalid code", description: "Enter the 6-digit code from your authenticator app", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/mfa/verify-setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${mfaToken}` },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        toast({ title: "Invalid code", description: "The code was incorrect. Try again.", variant: "destructive" });
        setCode("");
        return;
      }
      const data = await res.json();
      setRecoveryData(data);
      setStep("recovery");
    } catch {
      toast({ title: "Error", description: "Failed to verify code", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadRecoveryCodes = () => {
    if (!recoveryData) return;
    const text = `JABEEN Portal — MFA Recovery Codes\n\nKeep these codes safe. Each code can only be used once.\n\n${recoveryData.recoveryCodes.join("\n")}`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "jabeen-mfa-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const finish = () => {
    if (recoveryData) {
      onComplete(recoveryData.accessToken, recoveryData.user);
    }
  };

  if (step === "recovery" && recoveryData) {
    return (
      <div className="space-y-6 max-w-lg w-full">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 mb-4">
            <Shield className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-bold">MFA Enabled Successfully</h2>
          <p className="text-muted-foreground text-sm">Save your recovery codes in a secure location. Each code can only be used once.</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">These codes will never be shown again. Store them somewhere safe.</p>
        </div>
        <div className="bg-muted rounded-lg p-4 space-y-1 font-mono text-sm">
          {recoveryData.recoveryCodes.map((code, i) => (
            <div key={i} className="flex items-center justify-between py-0.5">
              <span className="tracking-wider">{code}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => copyToClipboard(recoveryData.recoveryCodes.join("\n"), "all")}>
            {copied === "all" ? <Check className="h-4 w-4 mr-2 text-emerald-500" /> : <Copy className="h-4 w-4 mr-2" />}
            Copy All
          </Button>
          <Button variant="outline" className="flex-1" onClick={downloadRecoveryCodes}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
        <Button className="w-full" onClick={finish}>
          I've Saved My Codes — Continue to Portal
        </Button>
      </div>
    );
  }

  if (step === "confirm" && setupData) {
    return (
      <div className="space-y-6 max-w-lg w-full">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">Confirm Your Authenticator</h2>
          <p className="text-muted-foreground text-sm">Enter the 6-digit code from your authenticator app to complete enrollment.</p>
        </div>
        <div className="space-y-3">
          <Label htmlFor="totp-code">6-Digit Code</Label>
          <Input
            id="totp-code"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="text-center text-2xl tracking-widest font-mono h-14"
            onKeyDown={(e) => e.key === "Enter" && confirmSetup()}
            autoComplete="one-time-code"
            autoFocus
          />
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => { setStep("setup"); setCode(""); }} disabled={isLoading}>
            Back
          </Button>
          <Button className="flex-1" onClick={confirmSetup} disabled={isLoading || code.length !== 6}>
            {isLoading ? "Verifying..." : "Verify & Enable MFA"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg w-full">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary mb-4">
          <Shield className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold">
          {isRequired ? "MFA Enrollment Required" : "Set Up Two-Factor Authentication"}
        </h2>
        <p className="text-muted-foreground text-sm">
          {isRequired
            ? "Your account requires MFA enrollment before you can access the portal. Use an authenticator app like Google Authenticator or Authy."
            : "Secure your account with an authenticator app."}
        </p>
      </div>

      {!setupInitiated ? (
        <Button className="w-full h-11" onClick={initiateSetup} disabled={isLoading}>
          <Smartphone className="h-4 w-4 mr-2" />
          {isLoading ? "Generating..." : "Begin Setup"}
        </Button>
      ) : setupData ? (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-center text-muted-foreground">Scan this QR code with your authenticator app:</p>
            <img src={setupData.qrCode} alt="MFA QR Code" className="w-56 h-56 rounded-lg border p-2 bg-white" />
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center">Or enter this secret manually:</p>
            <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
              <code className="flex-1 text-xs font-mono tracking-wider break-all">{setupData.secret}</code>
              <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => copyToClipboard(setupData.secret, "secret")}>
                {copied === "secret" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          <Button className="w-full h-11" onClick={() => setStep("confirm")}>
            I've Added the Account — Enter Code
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default function MfaSetupPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();

  const searchParams = new URLSearchParams(window.location.search);
  const mfaToken = searchParams.get("token");
  const isRequired = searchParams.get("required") === "1";

  if (!mfaToken) {
    setLocation("/login");
    return null;
  }

  const handleComplete = (accessToken: string, user: any) => {
    localStorage.setItem("jabeen_access_token", accessToken);
    window.location.href = user.role === "investor" ? `${BASE}/my-projects` : `${BASE}/dashboard`;
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6">
      <div className="mb-8">
        <img src="/jabeen-logo.svg" alt="JABEEN" className="h-10 w-auto" />
      </div>
      <MfaSetupFlow mfaToken={mfaToken} onComplete={handleComplete} isRequired={isRequired} />
    </div>
  );
}
