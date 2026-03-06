import { useCallback, useRef, useState } from "react";
import ConfirmChoiceModal, { ConfirmChoiceModalProps } from "./ConfirmChoiceModal";

type ConfirmChoiceRequest = Omit<ConfirmChoiceModalProps, "open" | "onSelect" | "onCancel">;

export function useConfirmChoiceModal() {
  const [request, setRequest] = useState<ConfirmChoiceRequest | null>(null);
  const resolverRef = useRef<((value: string | null) => void) | null>(null);

  const close = useCallback((value: string | null) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  const requestChoice = useCallback((nextRequest: ConfirmChoiceRequest) => {
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
      setRequest(nextRequest);
    });
  }, []);

  const modal = (
    <ConfirmChoiceModal
      open={Boolean(request)}
      title={request?.title || ""}
      message={request?.message || ""}
      detail={request?.detail}
      choices={request?.choices || []}
      onSelect={(value) => close(value)}
      onCancel={() => close(null)}
    />
  );

  return { requestChoice, modal };
}
