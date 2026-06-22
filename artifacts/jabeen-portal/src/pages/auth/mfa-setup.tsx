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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
      toast({ title: t("auth.mfa.setupErrorTitle"), description: t("auth.mfa.setupErrorDesc"), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const confirmSetup = async () => {
    if (!code || code.length !== 6) {
      toast({ title: t("auth.mfa.invalidSetupCodeTitle"), description: t("auth.mfa.invalidSetupCodeDesc"), variant: "destructive" });
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
        toast({ title: t("auth.mfa.invalidSetupCodeTitle"), description: t("auth.mfa.invalidSetupCodeVerifyDesc"), variant: "destructive" });
        setCode("");
        return;
      }
      const data = await res.json();
      setRecoveryData(data);
      setStep("recovery");
    } catch {
      toast({ title: t("auth.mfa.errorTitle"), description: t("auth.mfa.verifyErrorDesc"), variant: "destructive" });
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
          <h2 className="text-2xl font-bold">{t("auth.mfa.mfaEnabledTitle")}</h2>
          <p className="text-muted-foreground text-sm">{t("auth.mfa.saveRecoveryCodes")}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">{t("auth.mfa.neverShownAgain")}</p>
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
            {copied === "all" ? <Check className="h-4 w-4 me-2 text-emerald-500" /> : <Copy className="h-4 w-4 me-2" />}
            {t("auth.mfa.copyAll")}
          </Button>
          <Button variant="outline" className="flex-1" onClick={downloadRecoveryCodes}>
            <Download className="h-4 w-4 me-2" />
            {t("auth.mfa.download")}
          </Button>
        </div>
        <Button className="w-full" onClick={finish}>
          {t("auth.mfa.savedCodesButton")}
        </Button>
      </div>
    );
  }

  if (step === "confirm" && setupData) {
    return (
      <div className="space-y-6 max-w-lg w-full">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">{t("auth.mfa.confirmAuthenticator")}</h2>
          <p className="text-muted-foreground text-sm">{t("auth.mfa.confirmDesc")}</p>
        </div>
        <div className="space-y-3">
          <Label htmlFor="totp-code">{t("auth.mfa.sixDigitCode")}</Label>
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
            {t("common.back")}
          </Button>
          <Button className="flex-1" onClick={confirmSetup} disabled={isLoading || code.length !== 6}>
            {isLoading ? t("auth.mfa.verifying") : t("auth.mfa.verifyEnable")}
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
          {isRequired ? t("auth.mfa.setupEnrollmentRequired") : t("auth.mfa.setupTwoFactor")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {isRequired
            ? t("auth.mfa.setupRequiredDesc")
            : t("auth.mfa.setupOptionalDesc")}
        </p>
      </div>

      {!setupInitiated ? (
        <Button className="w-full h-11" onClick={initiateSetup} disabled={isLoading}>
          <Smartphone className="h-4 w-4 me-2" />
          {isLoading ? t("auth.mfa.generating") : t("auth.mfa.beginSetup")}
        </Button>
      ) : setupData ? (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-center text-muted-foreground">{t("auth.mfa.scanQr")}</p>
            <img src={setupData.qrCode} alt="MFA QR Code" className="w-56 h-56 rounded-lg border p-2 bg-white" />
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center">{t("auth.mfa.orEnterManually")}</p>
            <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
              <code className="flex-1 text-xs font-mono tracking-wider break-all">{setupData.secret}</code>
              <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => copyToClipboard(setupData.secret, "secret")}>
                {copied === "secret" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          <Button className="w-full h-11" onClick={() => setStep("confirm")}>
            {t("auth.mfa.addedAccountEnterCode")}
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
