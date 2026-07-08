import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { ShieldCheck, Copy, Check, Download, TriangleAlert, AlertCircle, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { User } from "@workspace/api-client-react";
import { useBranding } from "@/theme/theme-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { LanguageSwitcher } from "@/components/language-switcher";
import { BrandMark } from "./login";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface MfaSetupProps {
  mfaToken: string;
  onComplete: (accessToken: string, user: User) => void;
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
  user: User;
}

/**
 * True when a 401 response is the short-lived mfaToken being invalid/expired
 * (requireMfaStepToken: "Invalid or expired token" / "Unauthorized"), as
 * opposed to a wrong-code 401 ("Invalid TOTP code").
 */
async function isMfaTokenExpiry(res: Response): Promise<boolean> {
  try {
    const data = (await res.json()) as { error?: unknown };
    const msg = typeof data.error === "string" ? data.error : "";
    return /expired token|unauthorized/i.test(msg);
  } catch {
    return false;
  }
}

/**
 * MFA enrollment flow (QR → confirm code → recovery codes). Bare component —
 * embedded by MfaSetupPage below and by the profile page (voluntary
 * enrollment), which supply their own surface/card around it.
 */
export function MfaSetupFlow({ mfaToken, onComplete, isRequired }: MfaSetupProps) {
  const { t } = useTranslation();
  const { branding } = useBranding();
  const [step, setStep] = useState<Step>("setup");
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [recoveryData, setRecoveryData] = useState<RecoveryData | null>(null);
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [setupInitiated, setSetupInitiated] = useState(false);
  const otpRef = useRef<HTMLInputElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the pending copied-state reset on unmount.
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const initiateSetup = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/auth/mfa/setup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${mfaToken}` },
      });
      if (!res.ok) {
        // 401 = the short-lived mfaToken is invalid or expired
        setError(res.status === 401 ? t("auth.mfa.sessionExpired") : t("auth.mfa.setupErrorDesc"));
        return;
      }
      const data = (await res.json()) as SetupData;
      setSetupData(data);
      setSetupInitiated(true);
    } catch {
      setError(t("auth.mfa.setupErrorDesc"));
    } finally {
      setIsLoading(false);
    }
  };

  const confirmSetup = async () => {
    if (!code || code.length !== 6 || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/auth/mfa/verify-setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${mfaToken}` },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        // 401 can mean either a wrong code ("Invalid TOTP code") or an
        // expired mfaToken ("Invalid or expired token") — disambiguate via
        // the body so a mistyped code doesn't read as a dead session.
        const expired = res.status === 401 && (await isMfaTokenExpiry(res));
        setError(expired ? t("auth.mfa.sessionExpired") : t("auth.mfa.invalidSetupCodeVerifyDesc"));
        setCode("");
        otpRef.current?.focus();
        return;
      }
      const data = (await res.json()) as RecoveryData;
      setRecoveryData(data);
      setStep("recovery");
    } catch {
      setError(t("auth.mfa.verifyErrorDesc"));
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return; // clipboard unavailable/denied — don't show a false success
    }
    setCopied(key);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), 2000);
  };

  const downloadRecoveryCodes = () => {
    if (!recoveryData) return;
    const text = `${branding.name} Portal — MFA Recovery Codes\n\nKeep these codes safe. Each code can only be used once.\n\n${recoveryData.recoveryCodes.join("\n")}`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mfa-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const finish = () => {
    if (recoveryData) {
      onComplete(recoveryData.accessToken, recoveryData.user);
    }
  };

  const errorAlert = error ? (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" aria-hidden="true" />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;

  if (step === "recovery" && recoveryData) {
    return (
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-1.5 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="font-display text-2xl font-semibold text-foreground">
            {t("auth.mfa.mfaEnabledTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("auth.mfa.saveRecoveryCodes")}</p>
        </div>

        <Alert className="border-warning/50 bg-warning/10 text-foreground [&>svg]:text-warning">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{t("auth.mfa.neverShownAgain")}</AlertDescription>
        </Alert>

        {/* Recovery codes are Latin code strings — always LTR. */}
        <div dir="ltr" className="rounded-lg border border-border bg-muted p-4">
          <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 font-mono text-sm text-foreground sm:grid-cols-2">
            {recoveryData.recoveryCodes.map((c) => (
              <span key={c} className="whitespace-nowrap">
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => copyToClipboard(recoveryData.recoveryCodes.join("\n"), "all")}
          >
            {copied === "all" ? (
              <Check className="h-4 w-4 text-success" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            {t("auth.mfa.copyAll")}
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={downloadRecoveryCodes}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {t("auth.mfa.download")}
          </Button>
        </div>

        <Button type="button" size="lg" className="w-full" onClick={finish}>
          {t("auth.mfa.savedCodesButton")}
        </Button>
      </div>
    );
  }

  if (step === "confirm" && setupData) {
    return (
      <form
        className="w-full max-w-lg space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          confirmSetup();
        }}
      >
        <div className="space-y-1.5 text-center">
          <h2 className="font-display text-2xl font-semibold text-foreground">
            {t("auth.mfa.confirmAuthenticator")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("auth.mfa.confirmDesc")}</p>
        </div>

        {errorAlert}

        <div className="space-y-2">
          <Label htmlFor="totp-code">{t("auth.mfa.sixDigitCode")}</Label>
          {/* Codes are numerals — always LTR, even in the Arabic UI. */}
          <div dir="ltr" className="flex justify-center">
            <InputOTP
              id="totp-code"
              ref={otpRef}
              maxLength={6}
              pattern={REGEXP_ONLY_DIGITS}
              value={code}
              onChange={(v) => {
                setCode(v);
                setError(null);
              }}
              autoComplete="one-time-code"
              autoFocus
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} className="h-12 w-10 font-mono text-lg" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setStep("setup");
              setCode("");
              setError(null);
            }}
            disabled={isLoading}
          >
            {t("common.back")}
          </Button>
          <Button type="submit" className="flex-1" disabled={isLoading || code.length !== 6}>
            {isLoading && <Spinner aria-hidden="true" />}
            {isLoading ? t("auth.mfa.verifying") : t("auth.mfa.verifyEnable")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="w-full max-w-lg space-y-6">
      <div className="space-y-1.5 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="font-display text-2xl font-semibold text-foreground">
          {isRequired ? t("auth.mfa.setupEnrollmentRequired") : t("auth.mfa.setupTwoFactor")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isRequired ? t("auth.mfa.setupRequiredDesc") : t("auth.mfa.setupOptionalDesc")}
        </p>
      </div>

      {errorAlert}

      {!setupInitiated ? (
        <Button type="button" size="lg" className="w-full" onClick={initiateSetup} disabled={isLoading}>
          {isLoading && <Spinner aria-hidden="true" />}
          {isLoading ? t("auth.mfa.generating") : t("auth.mfa.beginSetup")}
        </Button>
      ) : setupData ? (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-3">
            <p className="text-center text-sm text-muted-foreground">{t("auth.mfa.scanQr")}</p>
            <img
              src={setupData.qrCode}
              alt={t("auth.mfa.qrAlt")}
              className="h-52 w-52 rounded-lg border border-border"
            />
          </div>

          <div className="space-y-2">
            <p className="text-center text-xs text-muted-foreground">{t("auth.mfa.orEnterManually")}</p>
            {/* TOTP secrets are Latin base32 strings — always LTR. */}
            <div dir="ltr" className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
              <code className="flex-1 break-all font-mono text-xs tracking-wide text-foreground">
                {setupData.secret}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => copyToClipboard(setupData.secret, "secret")}
                aria-label={t("auth.mfa.copySecret")}
              >
                {copied === "secret" ? (
                  <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>

          <Button type="button" size="lg" className="w-full" onClick={() => setStep("confirm")}>
            {t("auth.mfa.addedAccountEnterCode")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Standalone /mfa/setup page. Reached from a `mfaSetupRequired` login result
 * with the short-lived mfaToken in the query string.
 */
export default function MfaSetupPage() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  const searchParams = new URLSearchParams(window.location.search);
  const mfaToken = searchParams.get("token");
  const isRequired = searchParams.get("required") === "1";

  useEffect(() => {
    if (!mfaToken) setLocation("/login");
  }, [mfaToken, setLocation]);

  if (!mfaToken) {
    return null;
  }

  const handleComplete = (accessToken: string, user: User) => {
    localStorage.setItem("jabeen_access_token", accessToken);
    window.location.href = user.role === "investor" ? `${BASE}/my-projects` : `${BASE}/dashboard`;
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="flex items-center justify-end p-4 sm:px-6">
        <LanguageSwitcher />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-10 pt-4 sm:items-center sm:pb-24 sm:pt-0">
        <div className="flex w-full max-w-md flex-col items-center">
          <div className="mb-8">
            <BrandMark />
          </div>

          <div className="w-full rounded-xl border border-card-border bg-card p-6 shadow-sm sm:p-8">
            <MfaSetupFlow mfaToken={mfaToken} onComplete={handleComplete} isRequired={isRequired} />
          </div>

          <Link
            href="/login"
            className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl-flip" aria-hidden="true" />
            {t("auth.mfa.backToSignIn")}
          </Link>
        </div>
      </main>
    </div>
  );
}
