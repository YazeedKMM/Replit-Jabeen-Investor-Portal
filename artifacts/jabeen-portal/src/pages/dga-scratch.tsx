import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DgaButton } from "platformscode-new-react";
import { DgaBrandButton, DgaSubmitButton } from "@/components/ui/dga-brand-button";
import { DgaModal } from "@/components/ui/dga-modal";
import { DgaForm } from "@/components/ui/dga-form";
import { DgaTextField } from "@/components/ui/dga-text-field";
import {
  DgaTextareaField,
  DgaDropdownField,
  DgaCheckboxField,
  DgaSwitchField,
  DgaRadioField,
} from "@/components/ui/dga-fields";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Scratch route (/dga-scratch, public, unlinked) — proves the DGA wiring and the
 * react-hook-form field adapters. Remove after the Phase 3 rollout is signed off.
 */
const schema = z.object({
  email: z.string().email("بريد إلكتروني غير صالح"),
  notes: z.string().min(1, "حقل مطلوب"),
  city: z.string().min(1, "اختر مدينة"),
  agree: z.boolean().refine((v) => v, "يجب الموافقة"),
  notify: z.boolean(),
  plan: z.string().min(1, "اختر خياراً"),
});
type Demo = z.infer<typeof schema>;

export default function DgaScratchPage() {
  const [result, setResult] = useState<Demo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const form = useForm<Demo>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", notes: "", city: "", agree: false, notify: false, plan: "" },
  });
  const submit = form.handleSubmit(setResult);

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
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24, color: "var(--text-primary)" }}>
            بوابة جابين — اختبار حقول DGA
          </h1>
          <ThemeToggle />
        </div>

        <DgaForm onSubmit={submit} className="space-y-5">
          <DgaTextField control={form.control} name="email" label="البريد الإلكتروني" placeholder="name@example.com" required />
          <DgaTextareaField control={form.control} name="notes" label="ملاحظات" placeholder="اكتب هنا" rows={3} required />
          <DgaDropdownField
            control={form.control}
            name="city"
            label="المدينة"
            placeholder="اختر مدينة"
            options={[
              { label: "الجبيل", value: "JUB" },
              { label: "ينبع", value: "YNB" },
              { label: "رأس الخير", value: "RAS" },
            ]}
          />
          <DgaCheckboxField control={form.control} name="agree" label="أوافق على الشروط" />
          <DgaSwitchField control={form.control} name="notify" label="تفعيل الإشعارات" />
          <DgaRadioField
            control={form.control}
            name="plan"
            options={[
              { label: "خطة شهرية", value: "monthly" },
              { label: "خطة سنوية", value: "yearly" },
            ]}
          />
          <DgaSubmitButton onSubmit={submit} fullWidth size="lg" label="إرسال" />
        </DgaForm>

        {result && (
          <pre
            id="demo-result"
            style={{ marginTop: 24, padding: 16, borderRadius: 8, background: "var(--background-body)", color: "var(--text-default)", fontSize: 13, overflow: "auto" }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        )}

        <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
          <DgaBrandButton label="زر ذهبي" />
          <DgaButton id="open-modal-btn" variant="secondary" label="افتح النافذة" onOnClick={() => setModalOpen(true)} />
        </div>
      </div>

      <DgaModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="نافذة اختبار DGA"
        footer={
          <div id="modal-footer" style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <DgaButton variant="secondary-outline" label="إلغاء" onOnClick={() => setModalOpen(false)} />
            <DgaBrandButton label="تأكيد" onOnClick={() => setModalOpen(false)} />
          </div>
        }
      >
        <div id="modal-body-content" style={{ color: "var(--text-default)", fontSize: 14, lineHeight: 1.6 }}>
          هذا محتوى النافذة. نتحقق من فتح/إغلاق النافذة، والعنوان، والمحتوى،
          وأزرار التذييل، والخلفية المعتمة في كلا الوضعين.
        </div>
      </DgaModal>
    </div>
  );
}
