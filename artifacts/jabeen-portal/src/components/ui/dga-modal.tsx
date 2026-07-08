import * as React from "react";
import { DgaModalV2, DgaModalHeader, DgaModalBody, DgaModalActions } from "platformscode-new-react";

/**
 * Controlled dialog backed by DgaModalV2 — shadcn-Dialog-shaped ergonomics.
 *
 * Why this is imperative (verified against core@0.0.50 + live DOM):
 * - DgaModalV2's `open` @Prop does NOT propagate to its inner shadow <dialog> on
 *   change — setting it leaves the dialog `hidden`/`display:none`. The shipped
 *   `ShowModal(name)` helper is broken too (it does `document.querySelector('#'+
 *   name).showModal()`, but the <dialog> lives in shadow DOM so the query never
 *   finds it) and isn't even re-exported by the React wrapper.
 * - So we drive the shadow <dialog> directly through a host ref:
 *   `showModal()`/`close()` — which also gives a real native ::backdrop, top
 *   layer and ESC-to-close for free. We sync React state back on the dialog's
 *   native `close` event and on backdrop click.
 *
 * Content still flows through the THREE named slots (modal-header/body/actions,
 * no default slot) via the auto-slotted sub-components — render them as direct
 * children, never a bare <div> (same trap as DgaCardV2).
 */
export function DgaModal({
  open,
  onOpenChange,
  title,
  showClose = true,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Header title; omit to render no header. */
  title?: string;
  showClose?: boolean;
  children: React.ReactNode;
  /** Footer actions (e.g. DgaButton/DgaBrandButton); omit for no action row. */
  footer?: React.ReactNode;
}) {
  // useId is unique + stable; strip non-alphanumerics (React 19 yields «r0»).
  const name = "modal-" + React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const hostRef = React.useRef<HTMLElement | null>(null);
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);

  // Locate the inner shadow <dialog>, retrying until Stencil has rendered it.
  const withDialog = React.useCallback((cb: (d: HTMLDialogElement) => void) => {
    let raf = 0;
    const tick = (n: number) => {
      const d = hostRef.current?.shadowRoot?.querySelector("dialog") as HTMLDialogElement | null;
      if (d) cb(d);
      else if (n < 30) raf = requestAnimationFrame(() => tick(n + 1));
    };
    tick(0);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Drive open/close imperatively. NOTE: the inline `display` must be cleared on
  // close — `.close()` only drops the [open] attribute, but our inline
  // display:flex would otherwise beat the UA `dialog:not([open]){display:none}`
  // and leave the (invisible-but-laid-out) overlay swallowing clicks.
  React.useEffect(() => {
    return withDialog((d) => {
      if (open) {
        d.removeAttribute("hidden");
        d.style.display = "flex";
        if (!d.open) {
          try { d.showModal(); } catch { try { d.show(); } catch { /* noop */ } }
        }
      } else {
        if (d.open) d.close();
        d.style.display = "";
        d.setAttribute("hidden", "");
      }
    });
  }, [open, withDialog]);

  // Sync React state when the user dismisses the dialog itself: native `close`
  // (ESC) and backdrop click (native <dialog> doesn't close on backdrop alone).
  React.useEffect(() => {
    let d: HTMLDialogElement | null = null;
    const onClose = () => onOpenChange(false);
    const onClick = (e: MouseEvent) => { if (d && e.target === d) d.close(); };
    const stop = withDialog((dlg) => {
      d = dlg;
      dlg.addEventListener("close", onClose);
      dlg.addEventListener("click", onClick);
    });
    return () => {
      stop();
      d?.removeEventListener("close", onClose);
      d?.removeEventListener("click", onClick);
    };
  }, [withDialog, onOpenChange]);

  return (
    <DgaModalV2 ref={hostRef as never} name={name} showCloseButton={showClose} onClose={close}>
      {title != null && (
        <DgaModalHeader>
          {/* DgaModalTitle hardcodes a black label (invisible on the dark modal
              surface), so use a theme-aware heading instead. */}
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        </DgaModalHeader>
      )}
      <DgaModalBody>{children}</DgaModalBody>
      {footer != null && <DgaModalActions>{footer}</DgaModalActions>}
    </DgaModalV2>
  );
}
