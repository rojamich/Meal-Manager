import { useCallback, useEffect, useState } from "react";
import {
  createHousehold,
  getActiveHouseholdId,
  getActiveInviteCode,
  HOUSEHOLD_CHANGED_EVENT,
  joinHousehold,
  leaveHousehold,
  removeMember,
  rotateInviteCode,
  subscribeToHousehold
} from "../../sync/householdRepo";
import { syncEngine, SyncStatus } from "../../sync/syncEngine";
import { isFirebaseConfigured } from "../../sync/firebase";
import { useSyncAuth } from "../../sync/auth";
import { useConfirmChoiceModal } from "../../components/useConfirmChoiceModal";
import { useToast } from "../../components/useToast";

function statusLabel(status: SyncStatus) {
  switch (status) {
    case "off":
      return "Local only";
    case "starting":
      return "Connecting…";
    case "syncing":
      return "Syncing…";
    case "synced":
      return "Synced";
    case "error":
      return "Error";
  }
}

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const sec = Math.max(Math.round(diffMs / 1000), 0);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

function statusClass(status: SyncStatus) {
  switch (status) {
    case "synced":
      return "sync-pill sync-pill-synced";
    case "syncing":
    case "starting":
      return "sync-pill sync-pill-syncing";
    case "error":
      return "sync-pill sync-pill-error";
    default:
      return "sync-pill";
  }
}

export default function SyncSection({ embedded = false }: { embedded?: boolean } = {}) {
  const auth = useSyncAuth();
  const configured = isFirebaseConfigured();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("off");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastIncomingAt, setLastIncomingAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  const [householdId, setHouseholdId] = useState<string>(() => getActiveHouseholdId());
  const [inviteCode, setInviteCode] = useState<string>(() => getActiveInviteCode());
  const [members, setMembers] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState<string>("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [householdName, setHouseholdName] = useState("");
  const { requestChoice, modal } = useConfirmChoiceModal();
  const { notify, toast } = useToast();

  useEffect(() => {
    const unsub = syncEngine.subscribe((next, err) => {
      setSyncStatus(next);
      setSyncError(err || null);
      setLastIncomingAt(syncEngine.getLastIncomingAt());
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!lastIncomingAt) return;
    const id = window.setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [lastIncomingAt]);

  useEffect(() => {
    const handler = () => {
      setHouseholdId(getActiveHouseholdId());
      setInviteCode(getActiveInviteCode());
    };
    window.addEventListener(HOUSEHOLD_CHANGED_EVENT, handler);
    return () => window.removeEventListener(HOUSEHOLD_CHANGED_EVENT, handler);
  }, []);

  useEffect(() => {
    if (!householdId) {
      setMembers([]);
      setOwnerId("");
      return;
    }
    const unsub = subscribeToHousehold(householdId, (household) => {
      setMembers(household?.memberIds || []);
      setOwnerId(household?.ownerId || "");
    });
    return unsub;
  }, [householdId]);

  const handleCreate = useCallback(async () => {
    setBusy(true);
    try {
      const { householdId: hid } = await createHousehold(householdName.trim() || undefined);
      await syncEngine.start(hid, "create");
      notify("Household created. Share the invite code with your partner.", "success");
    } catch (err: any) {
      notify(err?.message || "Could not create household.", "error");
    } finally {
      setBusy(false);
    }
  }, [householdName, notify]);

  const handleJoin = useCallback(async () => {
    if (!joinCode.trim()) return;
    const choice = await requestChoice({
      title: "Replace local data?",
      message: "Joining replaces this device's data with the household's.",
      detail: "Export a JSON backup first if anything on this device matters.",
      choices: [
        { label: "Join & replace local", value: "confirm-join", tone: "primary" },
        { label: "Cancel", value: "cancel", tone: "neutral" }
      ]
    });
    if (choice !== "confirm-join") return;
    setBusy(true);
    try {
      const { householdId: hid } = await joinHousehold(joinCode);
      await syncEngine.start(hid, "join");
      setJoinCode("");
      notify("Joined household. Pulling shared data…", "success");
    } catch (err: any) {
      notify(err?.message || "Could not join household.", "error");
    } finally {
      setBusy(false);
    }
  }, [joinCode, notify, requestChoice]);

  const handleDisconnect = useCallback(async () => {
    const choice = await requestChoice({
      title: "Disconnect from household?",
      message: "This device will go back to local-only. Existing local data stays.",
      detail: "Other members keep using the household. To rejoin later, use the invite code.",
      choices: [
        { label: "Disconnect", value: "confirm-leave", tone: "danger" },
        { label: "Cancel", value: "cancel", tone: "neutral" }
      ]
    });
    if (choice !== "confirm-leave") return;
    setBusy(true);
    try {
      await syncEngine.stop();
      await leaveHousehold();
      notify("Disconnected. App is back to local-only.", "info");
    } catch (err: any) {
      notify(err?.message || "Disconnect failed.", "error");
    } finally {
      setBusy(false);
    }
  }, [notify, requestChoice]);

  const handleRotateCode = useCallback(async () => {
    setBusy(true);
    try {
      const next = await rotateInviteCode();
      notify(`New invite code: ${next}`, "success");
    } catch (err: any) {
      notify(err?.message || "Could not rotate code.", "error");
    } finally {
      setBusy(false);
    }
  }, [notify]);

  const handleRetry = useCallback(async () => {
    const hid = getActiveHouseholdId();
    if (!hid) return;
    setBusy(true);
    try {
      await syncEngine.start(hid, "reconnect");
    } catch (err: any) {
      notify(err?.message || "Could not reconnect.", "error");
    } finally {
      setBusy(false);
    }
  }, [notify]);

  const handleRemoveMember = useCallback(
    async (uid: string) => {
      const choice = await requestChoice({
        title: "Remove this device from the household?",
        message: "It stops receiving updates immediately and can't read the household's data again.",
        detail: "Its own copy of the data stays on that device. Rotate the invite code too if the code itself leaked.",
        choices: [
          { label: "Remove", value: "confirm-remove", tone: "danger" },
          { label: "Cancel", value: "cancel", tone: "neutral" }
        ]
      });
      if (choice !== "confirm-remove") return;
      setBusy(true);
      try {
        await removeMember(uid);
        notify("Member removed.", "success");
      } catch (err: any) {
        notify(err?.message || "Could not remove that member.", "error");
      } finally {
        setBusy(false);
      }
    },
    [notify, requestChoice]
  );

  const handleCopyCode = useCallback(async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      notify("Invite code copied.", "success");
    } catch {
      notify("Could not copy — long-press to copy manually.", "info");
    }
  }, [inviteCode, notify]);

  if (!configured) {
    const body = (
      <>
        {!embedded && <h3>Sync</h3>}
        <p className="muted">
          Cloud sync is disabled because Firebase isn't configured. Add the <code>VITE_FIREBASE_*</code> values
          to <code>.env.local</code> and reload to enable it. See the README for setup steps.
        </p>
      </>
    );
    return embedded ? <div>{body}</div> : <div className="panel">{body}</div>;
  }

  const body = (
    <>
      {!embedded && <h3>Sync</h3>}
      <div className="row" style={{ alignItems: "center" }}>
        <span className={statusClass(syncStatus)}>{statusLabel(syncStatus)}</span>
        {auth.status === "signing-in" && <span className="muted">Signing in…</span>}
        {auth.status === "error" && <span className="muted">Sign-in error: {auth.error}</span>}
        {householdId && (
          <span className="muted">
            {members.length} member{members.length === 1 ? "" : "s"}
          </span>
        )}
        {householdId && lastIncomingAt && (
          <span className="muted" title="Most recent change from another device">
            • Last update from another device: {relativeTime(lastIncomingAt)}
          </span>
        )}
      </div>
      {syncError && (
        <div className="row" style={{ alignItems: "center", gap: 10 }}>
          <p style={{ color: "var(--danger-text)", fontSize: 13, margin: 0 }}>{syncError}</p>
          {householdId && (
            <button type="button" className="secondary" disabled={busy} onClick={() => void handleRetry()}>
              {busy ? "Reconnecting…" : "Retry sync"}
            </button>
          )}
        </div>
      )}

      {!householdId && (
        <>
          <p className="muted">
            Create a household on this device to share data with another phone. Or join an existing household
            using its 6-character invite code.
          </p>
          <div className="row">
            <input
              placeholder="Household name (optional)"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
            />
            <button type="button" disabled={busy || auth.status !== "signed-in"} onClick={() => void handleCreate()}>
              Create household
            </button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input
              placeholder="Invite code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={12}
              style={{ textTransform: "uppercase", letterSpacing: 2 }}
            />
            <button
              type="button"
              disabled={busy || auth.status !== "signed-in" || !joinCode.trim()}
              onClick={() => void handleJoin()}
            >
              Join household
            </button>
          </div>
        </>
      )}

      {householdId && (
        <>
          <p className="muted">
            You're connected to a household. Changes sync automatically. The app keeps working offline and catches up
            when you reconnect.
          </p>
          {inviteCode && (
            <div className="row" style={{ alignItems: "center", gap: 12 }}>
              <span style={{ fontFamily: "monospace", fontSize: 20, letterSpacing: 3 }}>{inviteCode}</span>
              <button type="button" className="secondary" onClick={() => void handleCopyCode()}>
                Copy code
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => void handleRotateCode()}>
                Rotate code
              </button>
            </div>
          )}
          {inviteCode && (
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              This code works for 24 hours. Rotate it any time to invalidate the old one.
            </p>
          )}
          {members.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="field-stack">
                <span>Devices in this household</span>
              </div>
              <ul className="member-list">
                {members.map((uid) => {
                  const isSelf = uid === auth.uid;
                  const isOwner = uid === ownerId;
                  return (
                    <li key={uid} className="member-row">
                      <span className="member-id" title={uid}>
                        {uid.slice(0, 8)}…
                      </span>
                      <span className="row" style={{ gap: 6 }}>
                        {isOwner && <span className="tag">Owner</span>}
                        {isSelf && <span className="tag">This device</span>}
                      </span>
                      {auth.uid === ownerId && !isSelf && (
                        <button
                          type="button"
                          className="danger"
                          disabled={busy}
                          onClick={() => void handleRemoveMember(uid)}
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {auth.uid !== ownerId && (
                <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Only the device that created the household can remove members.
                </p>
              )}
            </div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="danger" disabled={busy} onClick={() => void handleDisconnect()}>
              Disconnect this device
            </button>
          </div>
        </>
      )}

      {modal}
      {toast}
    </>
  );

  return embedded ? <div>{body}</div> : <div className="panel">{body}</div>;
}
