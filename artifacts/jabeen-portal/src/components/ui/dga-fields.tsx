import { useEffect, useRef } from "react";
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";
import {
  DgaTextarea,
  DgaCheckbox,
  DgaSwitch,
  DgaRadioButton,
  DgaDropdown,
} from "platformscode-new-react";

/* ============================================================================
   react-hook-form adapters for the remaining DGA field components.

   Verified against the rendered DOM (core@0.0.50) via the Chrome MCP:
   - DgaTextarea / DgaCheckbox / DgaSwitch / DgaDropdown render in SHADOW DOM;
     DgaRadioButton renders in LIGHT DOM.
   - `value` / `checked` are one-way props (setting reflects to the inner control;
     user input does NOT update the prop), so each field is controlled from RHF.
   - The components invoke this.onInput/onChange/onBlur UNCONDITIONALLY, so those
     props must be functions or the component throws.
   - Shadow-DOM change events bubble out `composed` but are retargeted to the host
     (e.target = host, stale), so value-out reads the inner control from the host's
     shadowRoot on the bubbled event. Light-DOM (radio) reads the native event.
   ============================================================================ */

const noop = () => {};

function readShadowInput(
  host: (HTMLElement & { shadowRoot?: ShadowRoot | null }) | null,
): HTMLInputElement | HTMLTextAreaElement | null {
  return (
    host?.shadowRoot?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea",
    ) ?? null
  );
}

/* ----------------------------------- Textarea ----------------------------- */

interface DgaTextareaFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label?: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  disabled?: boolean;
}

export function DgaTextareaField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  rows = 4,
  required,
  disabled,
}: DgaTextareaFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <DgaTextareaControlled
          value={(field.value as string) ?? ""}
          onValueChange={field.onChange}
          onFieldBlur={field.onBlur}
          name={field.name}
          label={label}
          placeholder={placeholder}
          rows={rows}
          required={required}
          disabled={disabled}
          error={!!fieldState.error}
          helperText={fieldState.error?.message}
        />
      )}
    />
  );
}

function DgaTextareaControlled({
  value,
  onValueChange,
  onFieldBlur,
  ...rest
}: {
  value: string;
  onValueChange: (v: string) => void;
  onFieldBlur: () => void;
  [key: string]: unknown;
}) {
  const ref = useRef<(HTMLElement & { value?: string }) | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onInput = () => onValueChange(readShadowInput(el)?.value ?? "");
    el.addEventListener("input", onInput);
    return () => el.removeEventListener("input", onInput);
  }, [onValueChange]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const editing = document.activeElement === el;
    if (!editing && el.value !== value) el.value = value;
  }, [value]);

  return (
    <DgaTextarea
      ref={ref as never}
      fullwidth
      {...rest}
      onInput={noop}
      onChange={noop}
    />
  );
}

/* --------------------------------- Checkbox / Switch ---------------------- */

interface BooleanFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label?: string;
  helperText?: string;
  disabled?: boolean;
}

function useShadowChecked(
  onCheckedChange: (checked: boolean) => void,
  checked: boolean,
) {
  const ref = useRef<(HTMLElement & { checked?: boolean }) | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // DgaCheckbox/DgaSwitch emit `input` (not `change`) on toggle; listen to both.
    const sync = () => {
      const inner = el.shadowRoot?.querySelector<HTMLInputElement>("input");
      onCheckedChange(inner?.checked ?? false);
    };
    el.addEventListener("input", sync);
    el.addEventListener("change", sync);
    return () => {
      el.removeEventListener("input", sync);
      el.removeEventListener("change", sync);
    };
  }, [onCheckedChange]);

  useEffect(() => {
    const el = ref.current;
    if (el && el.checked !== checked) el.checked = checked;
  }, [checked]);

  return ref;
}

// Shared controlled wrapper for the boolean (shadow-DOM) toggles. A separate
// component so the hook isn't called inside the Controller render callback.
function DgaBooleanControlled({
  Component,
  checked,
  onCheckedChange,
  ...rest
}: {
  Component: typeof DgaCheckbox | typeof DgaSwitch;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  [key: string]: unknown;
}) {
  const ref = useShadowChecked(onCheckedChange, checked);
  return (
    <Component
      ref={ref as never}
      checked={checked}
      {...rest}
      onChange={noop}
      onInput={noop}
    />
  );
}

export function DgaCheckboxField<T extends FieldValues>({
  control,
  name,
  label,
  helperText,
  disabled,
}: BooleanFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <DgaBooleanControlled
          Component={DgaCheckbox}
          checked={!!field.value}
          onCheckedChange={field.onChange}
          label={label}
          helperText={helperText}
          disabled={disabled}
        />
      )}
    />
  );
}

export function DgaSwitchField<T extends FieldValues>({
  control,
  name,
  label,
  helperText,
  disabled,
}: BooleanFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <DgaBooleanControlled
          Component={DgaSwitch}
          checked={!!field.value}
          onCheckedChange={field.onChange}
          label={label}
          helperText={helperText}
          disabled={disabled}
        />
      )}
    />
  );
}

/* ----------------------------------- Radio group -------------------------- */

interface DgaRadioFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  options: { label: string; value: string }[];
  disabled?: boolean;
}

export function DgaRadioField<T extends FieldValues>({
  control,
  name,
  options,
  disabled,
}: DgaRadioFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
          onChange={(e) => {
            // DgaRadioButton is light DOM — the native change carries value.
            const target = e.target as HTMLInputElement;
            if (target?.value != null) field.onChange(target.value);
          }}
        >
          {options.map((opt) => (
            <DgaRadioButton
              key={opt.value}
              name={field.name}
              value={opt.value}
              label={opt.label}
              checked={field.value === opt.value}
              disabled={disabled}
              onChange={noop}
              onInput={noop}
            />
          ))}
        </div>
      )}
    />
  );
}

/* ----------------------------------- Dropdown ----------------------------- */

interface DgaDropdownFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label?: string;
  placeholder?: string;
  options: { label: string; value: string }[];
  disabled?: boolean;
}

export function DgaDropdownField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  options,
  disabled,
}: DgaDropdownFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div>
          <DgaDropdown
            label={label}
            placeholder={placeholder}
            options={options}
            optionLabel="label"
            trackBy="value"
            value={(field.value as string) ?? ""}
            disabled={disabled}
            error={!!fieldState.error}
            // DgaDropdown's onChange receives the selected value directly at
            // runtime; its declared type is a DOM ChangeEventHandler, so the
            // accurate handler needs a cast to pass the (wrong) declared type.
            onChange={((v: string | string[]) => field.onChange(v)) as never}
          />
          {fieldState.error?.message && (
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 12,
                color: "var(--text-error)",
              }}
            >
              {fieldState.error.message}
            </p>
          )}
        </div>
      )}
    />
  );
}
