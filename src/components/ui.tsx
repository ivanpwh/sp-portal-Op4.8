import {
  Component,
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- Button
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  // Warna dipilih agar teks putih lolos kontras AA (brand-700/red-700).
  const variants: Record<string, string> = {
    primary:
      'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 shadow-sm hover:shadow-md hover:-translate-y-0.5',
    secondary:
      'bg-slate-800 text-white hover:bg-slate-900 active:bg-slate-900 shadow-sm hover:shadow-md hover:-translate-y-0.5',
    outline: 'border border-slate-400 bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100',
    ghost: 'text-slate-800 hover:bg-slate-100 active:bg-slate-200',
    danger:
      'bg-red-700 text-white hover:bg-red-800 active:bg-red-900 shadow-sm hover:shadow-md hover:-translate-y-0.5',
  };
  const sizes: Record<string, string> = {
    sm: 'px-3.5 py-2.5 text-sm rounded-lg',
    md: 'px-5 py-3 text-base rounded-xl',
    lg: 'px-6 py-4 text-lg rounded-2xl',
  };
  return (
    <button
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 font-semibold transition-[background-color,box-shadow,transform] duration-200 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0 disabled:hover:translate-y-0',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx('h-5 w-5 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ---------------------------------------------------------------- Field wrapper
export function Field({
  label,
  htmlFor,
  required,
  hint,
  tooltip,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  tooltip?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="field-label">
        {label}
        {required && (
          <>
            {' '}
            <span className="text-red-600" aria-hidden="true">
              *
            </span>
            <span className="sr-only">(wajib diisi)</span>
          </>
        )}
        {tooltip && (
          <span
            className="relative ml-1.5 inline-flex cursor-help group"
            aria-label={tooltip}
          >
            <svg
              className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                clipRule="evenodd"
              />
            </svg>
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-normal text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {tooltip}
              <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
            </span>
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Inputs
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input ref={ref} className={cx('input-base', className)} {...rest} />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...rest }, ref) => (
    <textarea ref={ref} className={cx('input-base min-h-[96px]', className)} {...rest} />
  ),
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...rest }, ref) => (
    <div className="relative">
      <select ref={ref} className={cx('input-base appearance-none pr-11', className)} {...rest}>
        {children}
      </select>
      {/* Penanda dropdown yang terlihat jelas (sebelumnya tidak ada) */}
      <svg
        className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  ),
);
Select.displayName = 'Select';

// ---------------------------------------------------------------- Card
export function Card({
  className,
  children,
  interactive = false,
}: {
  className?: string;
  children: ReactNode;
  /** Mengangkat kartu sedikit saat di-hover (untuk kartu yang bisa diklik). */
  interactive?: boolean;
}) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6',
        interactive && 'card-interactive',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- Badge
export function Badge({
  children,
  color = 'slate',
}: {
  children: ReactNode;
  color?: 'slate' | 'green' | 'red' | 'amber' | 'blue';
}) {
  const colors: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-brand-100 text-brand-800',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-800',
    blue: 'bg-blue-100 text-blue-700',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold',
        colors[color],
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- Alert
export function Alert({
  variant = 'info',
  title,
  children,
}: {
  variant?: 'info' | 'success' | 'error' | 'warning';
  title?: string;
  children?: ReactNode;
}) {
  const styles: Record<string, string> = {
    info: 'bg-blue-50 border-blue-200 text-blue-900',
    success: 'bg-brand-50 border-brand-300 text-brand-900',
    error: 'bg-red-50 border-red-200 text-red-900',
    warning: 'bg-amber-50 border-amber-300 text-amber-900',
  };
  const icons: Record<string, ReactNode> = {
    info: (
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
        clipRule="evenodd"
      />
    ),
    success: (
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    ),
    error: (
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
        clipRule="evenodd"
      />
    ),
    warning: (
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    ),
  };
  return (
    <div
      className={cx('flex gap-3 rounded-xl border p-4 text-base', styles[variant])}
      role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}
    >
      <svg
        className="mt-0.5 h-5 w-5 shrink-0"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        {icons[variant]}
      </svg>
      <div className="min-w-0">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Modal
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Simpan onClose di ref agar efek di bawah tidak perlu bergantung padanya
  // (onClose sering berupa arrow baru tiap render → bila jadi dependency, efek
  // re-run tiap ketik dan mencuri fokus dari input).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Tutup dengan Escape + kunci scroll latar. Hanya bergantung pada `open`.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Fokuskan panel sekali saja saat dibuka — bukan tiap render.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;
  // Render via portal ke <body> agar tidak terpengaruh ancestor yang ber-transform
  // (mis. animasi entrance) yang membuat position:fixed salah posisi/terpotong.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="max-h-[90dvh] w-full max-w-lg animate-scale-in overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-5 shadow-xl outline-none sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 id={titleId} className="text-lg font-bold text-slate-900">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="-mr-1 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Tutup"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Misc
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2 font-extrabold tracking-tight', className)}>
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm text-white shadow-sm ring-1 ring-black/5">
        SP
      </span>
      <span>SP Portal</span>
    </span>
  );
}

export function PageLoader({ label = 'Memuat…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-600">
      <Spinner className="h-8 w-8 text-brand-700" />
      <p>{label}</p>
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent = 'brand',
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: 'brand' | 'blue' | 'amber' | 'slate';
}) {
  const accents: Record<string, string> = {
    brand: 'text-brand-700',
    blue: 'text-blue-700',
    amber: 'text-amber-700',
    slate: 'text-slate-800',
  };
  return (
    <Card className="!p-4">
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <p className={cx('mt-1 text-3xl font-extrabold', accents[accent])}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </Card>
  );
}

// ---------------------------------------------------------------- Reduced motion
/** Mendeteksi preferensi "kurangi gerakan" pengguna (aksesibilitas). */
export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduce(mq.matches);
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduce;
}

// ---------------------------------------------------------------- CountUp
/**
 * Angka yang menghitung naik dari 0 ke nilai akhir saat muncul.
 * Menghormati prefers-reduced-motion (langsung menampilkan nilai akhir).
 */
export function CountUp({
  value,
  duration = 1100,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const reduce = usePrefersReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic — melambat di akhir
      setDisplay(Math.round(eased * value));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduce]);

  return <span className={className}>{display.toLocaleString('id-ID')}</span>;
}

// ---------------------------------------------------------------- Error boundary
/**
 * Pembatas error sederhana — jika anak gagal dirender (mis. animasi Lottie
 * bermasalah), tampilkan fallback alih-alih merusak seluruh halaman.
 */
export class SafeBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback ?? null : this.props.children;
  }
}
