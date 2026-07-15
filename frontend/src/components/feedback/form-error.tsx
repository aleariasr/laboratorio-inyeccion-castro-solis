type FormErrorProps = {
  message: string;
};

export function FormError({
  message,
}: FormErrorProps) {
  return (
    <div
      className="motion-fade rounded-[var(--radius-md)] border border-[rgb(215_0_21_/_18%)] bg-[var(--color-danger-soft)] px-4 py-3 text-sm font-medium text-danger"
      role="alert"
      aria-live="assertive"
    >
      {message}
    </div>
  );
}