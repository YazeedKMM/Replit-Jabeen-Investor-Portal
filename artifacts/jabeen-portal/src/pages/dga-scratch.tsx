import { DgaButton, DgaTextInput } from "platformscode-new-react";

/**
 * Phase 0 scratch route — proves the DGA "Platforms Code" wiring is live:
 *   - JABEEN gold primary button (variant="primary-brand")
 *   - DGA dark/light surfaces (--background-body / --background-card)
 *   - RTL + Arabic (dir/lang) and IBM Plex Sans Arabic
 *   - Gold brand text via --text-primary (darkens to gold-800 in light mode)
 *
 * Reachable at /dga-scratch, not linked in nav. Safe to delete after sign-off.
 * Component props verified against @platformscode/core@0.0.50 type defs:
 *   DgaButton  -> { variant, label, size, ... }  (NO "primary" variant; use "primary-brand")
 *   DgaTextInput -> { label, placeholder, fullwidth, type, value, ... }
 */
export default function DgaScratchPage() {
  return (
    <div
      dir="rtl"
      lang="ar"
      style={{
        minHeight: "100vh",
        background: "var(--background-body)",
        color: "var(--text-default)",
        padding: "48px 24px",
        fontFamily: '"IBM Plex Sans Arabic", system-ui, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto",
          padding: 32,
          borderRadius: 12,
          background: "var(--background-card)",
          border: "1px solid var(--border-neutral-primary)",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24, color: "var(--text-primary)" }}>
          بوابة جابين — اختبار نظام DGA
        </h1>
        <p style={{ margin: 0, lineHeight: 1.7 }}>
          تأكيد المرحلة 0: اللون الذهبي الأساسي، الأسطح الداكنة/الفاتحة، الاتجاه من
          اليمين إلى اليسار، وخط IBM Plex Sans Arabic.
        </p>

        <DgaTextInput
          label="البريد الإلكتروني"
          placeholder="name@example.com"
          fullwidth
        />

        <DgaButton variant="primary-brand" label="إرسال" />
      </div>
    </div>
  );
}
