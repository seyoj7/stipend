export function StatusPill({
  children,
  tone = "good",
}: {
  children: React.ReactNode;
  tone?: "good" | "neutral" | "warning" | "error";
}) {
  const classes = {
    good: "",
    neutral: "neutral",
    warning: "warning",
    error: "error",
  };
  return <span className={`pill ${classes[tone]}`}>{children}</span>;
}
