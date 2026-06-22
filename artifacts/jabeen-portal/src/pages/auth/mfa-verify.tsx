import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, KeyRound } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface MfaVerifyStepProps {
  mfaToken: string;
  onSuccess: (accessToken: string, user: any) => void;
  onBack: () => void;
}

export function MfaVerifyStep({ mfaToken, onSuccess, onBack }: MfaVerifyStepProps) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const verify = async () => {
    setIsLoading(true);
    try {
      const body = useRecovery ? { recoveryCode } : { code };
      const res = await fetch(`${BASE}/api/auth/mfa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${mfaToken}` },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) {
        toast({ title: "Invalid code", description: "The code was incorrect. Try again.", variant: "destructive" });
        if (useRecovery) setRecoveryCode(""); else setCode("");
        return;
      }
      const data = await res.json();
      onSuccess(data.accessToken, data.user);
    } catch {
      toast({ title: "Error", description: "Verification failed", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 w-full">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Two-Factor Authentication</h2>
        <p className="text-muted-foreground text-sm">
          {useRecovery
            ? "Enter one of your recovery codes."
            : "Enter the 6-digit code from your authenticator app."}
        </p>
      </div>

      {!useRecovery ? (
        <div className="space-y-2">
          <Label htmlFor="mfa-code">Authenticator Code</Label>
          <Input
            id="mfa-code"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="text-center text-2xl tracking-widest font-mono h-14"
            onKeyDown={(e) => e.key === "Enter" && verify()}
            autoComplete="one-time-code"
            autoFocus
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="recovery-code">Recovery Code</Label>
          <Input
            id="recovery-code"
            placeholder="xxxx-xxxx-xxxx-xxxx"
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value)}
            className="font-mono h-12"
            onKeyDown={(e) => e.key === "Enter" && verify()}
            autoFocus
          />
        </div>
      )}

      <Button
        className="w-full h-11 text-base font-semibold"
        onClick={verify}
        disabled={isLoading || (useRecovery ? !recoveryCode : code.length !== 6)}
      >
        {isLoading ? "Verifying..." : "Verify"}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          onClick={onBack}
        >
          <ArrowLeft className="h-3.5 w-3.5 rtl-flip" />
          Back to Sign In
        </button>
        <button
          type="button"
          className="text-primary hover:underline flex items-center gap-1 transition-colors"
          onClick={() => { setUseRecovery(!useRecovery); setCode(""); setRecoveryCode(""); }}
        >
          <KeyRound className="h-3.5 w-3.5" />
          {useRecovery ? "Use authenticator app" : "Use recovery code"}
        </button>
      </div>
    </div>
  );
}
