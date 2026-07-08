import { useState } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { ArrowLeft, KeyRound, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface MfaVerifyStepProps {
  mfaToken: string;
  onSuccess: (accessToken: string, user: any) => void;
  onBack: () => void;
}

/**
 * Embedded MFA verification step — rendered by the login page after a
 * `mfaRequired` login result (there is no /mfa/verify route).
 */
export function MfaVerifyStep({ mfaToken, onSuccess, onBack }: MfaVerifyStepProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useRecovery ? recoveryCode.length > 0 : code.length === 6;

  const verify = async () => {
    if (!canSubmit || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const body = useRecovery ? { recoveryCode } : { code };
      const res = await fetch(`${BASE}/api/auth/mfa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${mfaToken}` },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) {
        setError(t("auth.mfa.invalidCodeDesc"));
        if (useRecovery) setRecoveryCode("");
        else setCode("");
        return;
      }
      const data = await res.json();
      onSuccess(data.accessToken, data.user);
    } catch {
      setError(t("auth.mfa.verificationFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setUseRecovery(!useRecovery);
    setCode("");
    setRecoveryCode("");
    setError(null);
  };

  return (
    <form
      className="w-full space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        verify();
      }}
    >
      <div className="space-y-1.5">
        <h2 className="font-display text-2xl font-semibold text-foreground">
          {t("auth.mfa.twoFactorTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {useRecovery ? t("auth.mfa.enterRecoveryCode") : t("auth.mfa.enterCodeAuthApp")}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!useRecovery ? (
        <div className="space-y-2">
          <Label htmlFor="mfa-code">{t("auth.mfa.authenticatorCode")}</Label>
          {/* Codes are numerals — always LTR, even in the Arabic UI. */}
          <div dir="ltr" className="flex justify-center">
            <InputOTP
              id="mfa-code"
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
      ) : (
        <div className="space-y-2">
          <Label htmlFor="recovery-code">{t("auth.mfa.recoveryCode")}</Label>
          <Input
            id="recovery-code"
            dir="ltr"
            placeholder="xxxx-xxxx-xxxx-xxxx"
            value={recoveryCode}
            onChange={(e) => {
              setRecoveryCode(e.target.value);
              setError(null);
            }}
            className="h-11 font-mono"
            autoFocus
          />
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={isLoading || !canSubmit}>
        {isLoading && <Spinner aria-hidden="true" />}
        {isLoading ? t("auth.mfa.verifying") : t("auth.mfa.verify")}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors duration-150 hover:text-foreground"
          onClick={onBack}
        >
          <ArrowLeft className="h-3.5 w-3.5 rtl-flip" aria-hidden="true" />
          {t("auth.mfa.backToSignIn")}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-secondary transition-colors duration-150 hover:underline"
          onClick={toggleMode}
        >
          <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
          {useRecovery ? t("auth.mfa.useAuthApp") : t("auth.mfa.useRecoveryCode")}
        </button>
      </div>
    </form>
  );
}
