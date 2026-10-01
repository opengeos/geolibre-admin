import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

/** Join class names, skipping falsy values. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-text hover:bg-accent-hover border-transparent",
  secondary: "bg-surface text-text border-border hover:bg-surface-2",
  ghost: "bg-transparent text-text border-transparent hover:bg-surface-2",
  danger: "bg-surface text-danger border-border hover:bg-danger-soft",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        VARIANTS[variant],
        className,
      )}
    />
  );
}

/**
 * A destructive button that needs a second click within a few seconds,
 * instead of a blocking browser confirm dialog.
 */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = "Click again to confirm",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  onConfirm: () => void;
  confirmLabel?: string;
  size?: "sm" | "md";
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Button
      variant="danger"
      {...props}
      onClick={() => {
        if (armed) {
          clearTimeout(timer.current);
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), 4000);
        }
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}

const CONTROL =
  "w-full rounded-md border border-border bg-surface px-2.5 text-sm text-text placeholder:text-muted disabled:opacity-60";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(CONTROL, "h-9", className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(CONTROL, "py-2 font-mono text-xs", className)} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(CONTROL, "h-9 pe-8", className)} />;
}

/** A labelled form control; `children` receives the generated input id. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={cx("flex items-start gap-2.5", disabled ? "opacity-60" : "cursor-pointer")}>
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="flex flex-col">
        <span className="text-sm">{label}</span>
        {description ? <span className="text-xs text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-lg border border-border bg-surface", className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

type Tone = "neutral" | "accent" | "danger" | "warning" | "ok";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  ok: "bg-ok-soft text-ok",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", TONES[tone])}>
      {children}
    </span>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-md px-3 py-2 text-sm", TONES[tone])}>
      {children}
    </div>
  );
}

/** Copy text to the clipboard, showing a short confirmation. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked (insecure context); the text is still selectable.
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

/**
 * Offer text as a file download.
 *
 * @param name - The suggested file name.
 * @param content - The file content.
 */
export function downloadText(name: string, content: string): void {
  const type = name.endsWith(".json") ? "application/json" : "text/plain";
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Spinner() {
  return (
    <span
      aria-label="Loading"
      className="inline-block size-4 animate-spin rounded-full border-2 border-border border-t-accent"
    />
  );
}

/** A list of string values edited as chips plus an add box. */
export function TagInput({
  values,
  onChange,
  placeholder,
  id,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter((part) => part && !values.includes(part));
    if (parts.length) onChange([...values, ...parts]);
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-2">
      {values.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <li key={value} className="inline-flex items-center gap-1 rounded bg-surface-2 py-0.5 ps-2 pe-1 text-xs">
              <span className="font-mono break-all">{value}</span>
              <button
                type="button"
                aria-label={`Remove ${value}`}
                className="rounded px-1 text-muted hover:text-danger"
                onClick={() => onChange(values.filter((item) => item !== value))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button onClick={add} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}
