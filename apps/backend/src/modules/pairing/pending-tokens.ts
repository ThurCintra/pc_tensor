interface PendingAgentToken {
  computerId: string;
  agentToken: string;
}

const pending = new Map<string, PendingAgentToken>();

export function storePendingToken(
  pairingId: string,
  value: PendingAgentToken,
): void {
  pending.set(pairingId, value);
}

export function takePendingToken(pairingId: string): PendingAgentToken | undefined {
  const value = pending.get(pairingId);
  if (value !== undefined) {
    pending.delete(pairingId);
  }
  return value;
}
