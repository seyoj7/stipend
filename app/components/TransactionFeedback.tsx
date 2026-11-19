import type { TransactionState } from "@/app/hooks/useTransaction";

export function TransactionFeedback({ state }: { state: TransactionState }) {
  if (state.status === "idle") return null;
  return (
    <div className={`tx-feedback ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
      <span className="tx-symbol" aria-hidden="true">
        {state.status === "pending" ? "◌" : state.status === "success" ? "✓" : "!"}
      </span>
      <span>{state.message}</span>
      {state.hash && (
        <a href={`https://explorer-test.qday.info/tx/${state.hash}`} target="_blank" rel="noreferrer">
          View transaction ↗
        </a>
      )}
    </div>
  );
}
