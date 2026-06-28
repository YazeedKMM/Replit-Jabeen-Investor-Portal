import type { FormHTMLAttributes, KeyboardEvent, ReactNode } from "react";

/**
 * Form wrapper for screens built from DGA components.
 *
 * DGA field/button web components can't drive native form submission: the
 * DgaButton's submit <button> is in shadow DOM, and DgaTextInput puts HTML5
 * `required` on its inner input (blocking native requestSubmit/Enter). So this
 * wrapper routes both the native submit event and Enter-in-a-text-input to the
 * react-hook-form submit handler directly.
 *
 * Usage:
 *   const submit = form.handleSubmit(onValid);
 *   <DgaForm onSubmit={submit} className="space-y-5"> … <DgaSubmitButton onSubmit={submit} …/> </DgaForm>
 */
interface DgaFormProps
  extends Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit"> {
  /** The react-hook-form handler, i.e. `form.handleSubmit(onValid)`. */
  onSubmit: () => void;
  children: ReactNode;
}

export function DgaForm({
  onSubmit,
  onKeyDown,
  children,
  ...props
}: DgaFormProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onKeyDown={(e: KeyboardEvent<HTMLFormElement>) => {
        if (
          e.key === "Enter" &&
          (e.target as HTMLElement).tagName === "INPUT"
        ) {
          e.preventDefault();
          onSubmit();
        }
        onKeyDown?.(e);
      }}
      {...props}
    >
      {children}
    </form>
  );
}
