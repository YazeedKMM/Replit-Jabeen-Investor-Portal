import { useEffect, useRef } from "react";
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";
import { DgaTextInput } from "platformscode-new-react";

/**
 * react-hook-form adapter for the DGA `DgaTextInput` web component.
 *
 * Why an adapter (verified against the rendered DOM, core@0.0.50):
 *  - DgaTextInput renders in LIGHT DOM with a real inner <input class="input__field">.
 *  - Its React wrapper exposes NO mapped events (DgaTextInputEvents = unknown);
 *    `value` is a one-way @Prop (a @Watch reflects it to the inner input), and
 *    typing does NOT update `value`. So we can't spread {...field} onto it.
 *  - Native `input`/`change`/`focusout` events DO bubble through the host with
 *    `e.target.value`, so we wire them via a ref.
 *
 * Cursor-safety: we do NOT pass `value` as a reactive prop (that would re-reflect
 * and reset the caret on every keystroke). Instead we set the element's value
 * imperatively, and only when the field is NOT focused — so RHF resets/programmatic
 * changes flow in, but active typing is never clobbered.
 */
interface DgaTextFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label?: string;
  placeholder?: string;
  type?: "text" | "number" | "password";
  required?: boolean;
  disabled?: boolean;
}

export function DgaTextField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  type = "text",
  required,
  disabled,
}: DgaTextFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <DgaTextInputControlled
          value={(field.value as string) ?? ""}
          onValueChange={field.onChange}
          onFieldBlur={field.onBlur}
          name={field.name}
          label={label}
          placeholder={placeholder}
          type={type}
          required={required}
          disabled={disabled}
          error={!!fieldState.error}
          helperText={fieldState.error?.message}
        />
      )}
    />
  );
}

type ControlledProps = {
  value: string;
  onValueChange: (value: string) => void;
  onFieldBlur: () => void;
  name: string;
  label?: string;
  placeholder?: string;
  type: "text" | "number" | "password";
  required?: boolean;
  disabled?: boolean;
  error: boolean;
  helperText?: string;
};

function DgaTextInputControlled({
  value,
  onValueChange,
  onFieldBlur,
  ...rest
}: ControlledProps) {
  // @lit/react forwards `ref` to the host element.
  const ref = useRef<(HTMLElement & { value?: string }) | null>(null);

  // Wire native bubbling events (input -> value out, focusout -> blur/touched).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleInput = (e: Event) =>
      onValueChange((e.target as HTMLInputElement).value);
    const handleFocusOut = () => onFieldBlur();
    el.addEventListener("input", handleInput);
    el.addEventListener("focusout", handleFocusOut);
    return () => {
      el.removeEventListener("input", handleInput);
      el.removeEventListener("focusout", handleFocusOut);
    };
  }, [onValueChange, onFieldBlur]);

  // Push value INTO the element, but never while it's being edited (cursor-safe).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const editing =
      document.activeElement === el ||
      (el.contains(document.activeElement) ?? false);
    if (!editing && el.value !== value) {
      el.value = value;
    }
  }, [value]);

  return <DgaTextInput ref={ref as never} fullwidth {...rest} />;
}
