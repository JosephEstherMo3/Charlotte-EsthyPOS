"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Mail, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useApp } from "@/components/app-context";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Modal, PageHeader, SelectField, Skeleton, TextField, useToast } from "@/components/ui";
import { ApiError, apiFetch, useApi } from "@/lib/client";
import { PERMISSION_LABELS, PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_PERMISSIONS, type Role } from "@/lib/permissions";

interface Member {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: Role;
  status: "active" | "disabled";
  isActivated: boolean;
  createdAt: string;
  isYou: boolean;
}

interface AddMemberResult {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isRetry: boolean;
  emailSent: boolean;
  emailError?: string;
  activationLink: string;
}

function AddMember({
  allowedRoles,
  onClose,
  onSaved,
}: {
  allowedRoles: Role[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [v, setV] = useState({
    fullName: "",
    email: "",
    password: "",
    role: allowedRoles[allowedRoles.length - 1] as Role,
  });
  const [manualPassword, setManualPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AddMemberResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function save() {
    setBusy(true);
    setErr("");
    setFields({});
    try {
      const payload: Record<string, unknown> = {
        fullName: v.fullName,
        email: v.email,
        role: v.role,
      };
      if (manualPassword && v.password) {
        payload.password = v.password;
      }

      const res = await apiFetch<AddMemberResult>("/api/team", {
        method: "POST",
        body: payload,
      });

      onSaved();

      if (res.emailSent) {
        toast.success(`Invitation sent to ${res.email}`);
        onClose();
      } else {
        // Keep modal open to display failure & provide copyable activation link
        setResult(res);
      }
    } catch (e) {
      setErr((e as ApiError).message);
      setFields((e as ApiError).fieldErrors ?? {});
    } finally {
      setBusy(false);
    }
  }

  const copyLink = () => {
    if (!result?.activationLink) return;
    navigator.clipboard.writeText(result.activationLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (result) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Staff Account Created"
        description={`Account for ${result.fullName} (${result.email}) has been provisioned.`}
        size="sm"
        footer={
          <Button onClick={onClose} variant="primary">
            Done
          </Button>
        }
      >
        <div className="space-y-4">
          <Alert tone="warning">
            <p className="font-semibold">Invitation Email Notice</p>
            <p className="mt-1 text-xs leading-relaxed">
              {result.emailError ||
                "Email delivery could not be completed. You can copy the secure activation link below and share it with the team member directly."}
            </p>
          </Alert>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2">
            <p className="text-xs font-semibold text-slate-800">Secure Activation Link</p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={result.activationLink}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:outline-none"
              />
              <Button size="sm" variant="secondary" onClick={copyLink}>
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </Button>
            </div>
            <p className="text-[11px] text-slate-500">
              The cashier can open this link to set their own password and activate their account.
            </p>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title="Add team member"
      description="Invite a cashier or manager to your store. They will choose their own password via email."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={save}
            loading={busy}
            disabled={!v.fullName.trim() || !v.email.trim() || (manualPassword && v.password.length < 8)}
          >
            Send invitation
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        <TextField
          label="Full name"
          value={v.fullName}
          onChange={(e) => setV({ ...v, fullName: e.target.value })}
          error={fields.fullName}
          required
          autoFocus
        />
        <TextField
          label="Email address"
          type="email"
          value={v.email}
          onChange={(e) => setV({ ...v, email: e.target.value })}
          error={fields.email}
          required
        />
        <SelectField
          label="Store role"
          value={v.role}
          onChange={(e) => setV({ ...v, role: e.target.value as Role })}
          hint={ROLE_DESCRIPTIONS[v.role]}
        >
          {allowedRoles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </SelectField>

        <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-900 leading-relaxed">
          <p className="font-semibold flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-blue-600" />
            Automatic Email Invitation
          </p>
          <p className="mt-1 text-blue-800">
            A secure activation link will be sent to <strong>{v.email || "their email address"}</strong> so they can
            create their password safely without plain-text sharing.
          </p>
        </div>

        <div className="pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600">
            <input
              type="checkbox"
              checked={manualPassword}
              onChange={(e) => setManualPassword(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Set temporary password manually instead</span>
          </label>
        </div>

        {manualPassword && (
          <TextField
            label="Temporary password"
            type="text"
            autoComplete="off"
            value={v.password}
            onChange={(e) => setV({ ...v, password: e.target.value })}
            error={fields.password}
            hint="At least 8 characters. Must be communicated securely."
            required
          />
        )}
      </div>
    </Modal>
  );
}

function EditMember({
  member,
  allowedRoles,
  onClose,
  onSaved,
}: {
  member: Member;
  allowedRoles: Role[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [role, setRole] = useState<Role>(member.role);
  const [status, setStatus] = useState(member.status);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    setBusy(true);
    setErr("");
    const body: Record<string, unknown> = {};
    if (role !== member.role) body.role = role;
    if (status !== member.status) body.status = status;
    if (password) body.password = password;
    try {
      await apiFetch(`/api/team/${member.id}`, { method: "PATCH", body });
      toast.success("Team member updated");
      onSaved();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteMember() {
    setDeleting(true);
    setErr("");
    try {
      await apiFetch(`/api/team/${member.id}`, { method: "DELETE" });
      toast.success("Team member deleted successfully");
      onSaved();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  const changed = role !== member.role || status !== member.status || password.length > 0;

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={member.fullName}
      description={member.email}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={save}
            loading={busy}
            disabled={!changed || (password.length > 0 && password.length < 8)}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        <SelectField
          label="Role"
          value={role}
          disabled={member.isYou}
          onChange={(e) => setRole(e.target.value as Role)}
          hint={member.isYou ? "You can't change your own role." : ROLE_DESCRIPTIONS[role]}
        >
          {allowedRoles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Account status"
          value={status}
          disabled={member.isYou}
          onChange={(e) => setStatus(e.target.value as "active" | "disabled")}
          hint="Disabled members are signed out immediately and cannot sign in."
        >
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </SelectField>
        {!member.isYou && (
          <>
            <TextField
              label="Set new password (optional)"
              type="text"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              hint="Signs them out of all devices and forces them to sign in again."
            />

            <div className="pt-4 border-t border-slate-200">
              {confirmDelete ? (
                <div className="rounded-xl border border-red-200 bg-red-50/60 p-3.5 space-y-3">
                  <p className="text-xs font-semibold text-red-900">
                    Are you sure you want to delete {member.fullName}?
                  </p>
                  <p className="text-xs text-red-700 leading-relaxed">
                    This will permanently remove this account from your store. If they have no recorded transactions, their profile will be completely erased.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="danger"
                      size="sm"
                      loading={deleting}
                      onClick={deleteMember}
                    >
                      Yes, Delete Member
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={deleting}
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-800">Remove member</p>
                    <p className="text-xs text-slate-500">Permanently delete from team</p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                    disabled={busy || deleting}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5 inline" />
                    Delete Member
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default function TeamPage() {
  const app = useApp();
  const { data, error, reload } = useApi<{ members: Member[] }>("/api/team");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [manualInviteModal, setManualInviteModal] = useState<{
    email: string;
    fullName: string;
    link: string;
    error?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const isOwner = app.role === "owner";
  const allowedRoles: Role[] = isOwner ? ["owner", "manager", "cashier"] : ["cashier"];
  const canManage = (m: Member) => app.can("team.manage") && (isOwner || m.role === "cashier");

  const resendInvite = async (m: Member) => {
    setResendingId(m.id);
    try {
      const res = await apiFetch<{
        ok: boolean;
        emailSent: boolean;
        emailError?: string;
        activationLink: string;
      }>(`/api/team/${m.id}/resend`, { method: "POST" });

      if (res.emailSent) {
        toast.success(`Invitation email resent to ${m.email}`);
      } else {
        setManualInviteModal({
          email: m.email,
          fullName: m.fullName,
          link: res.activationLink,
          error: res.emailError,
        });
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to resend invitation.");
    } finally {
      setResendingId(null);
    }
  };

  const copyModalLink = () => {
    if (!manualInviteModal?.link) return;
    navigator.clipboard.writeText(manualInviteModal.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div>
      <PageHeader
        title="Team & permissions"
        description="Control who can do what in your store."
        actions={
          app.can("team.manage") && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add member
            </Button>
          )
        }
      />

      {!isOwner && (
        <div className="mb-5">
          <Alert tone="info">
            Only the store owner can add users or change roles. You can view the team here.
          </Alert>
        </div>
      )}

      <Card>
        <CardHeader title="Store Members" />
        {error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : data.members.length === 0 ? (
          <EmptyState title="No team members" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-900 text-sm font-semibold text-white">
                  {m.fullName
                    .split(/\s+/)
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {m.fullName}
                    {m.isYou && <span className="ml-2 text-xs font-normal text-slate-500">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">{m.email}</p>
                </div>

                <Badge tone={m.role === "owner" ? "navy" : m.role === "manager" ? "emerald" : "slate"}>
                  {ROLE_LABELS[m.role]}
                </Badge>

                {!m.isActivated && <Badge tone="gold">Pending Activation</Badge>}

                {m.status === "disabled" && <Badge tone="red">Disabled</Badge>}

                {canManage(m) && !m.isActivated && !m.isYou && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={resendingId === m.id}
                    onClick={() => resendInvite(m)}
                    title="Resend activation email"
                  >
                    <Mail className="h-3.5 w-3.5 text-blue-600" />
                    <span className="hidden sm:inline">Resend invite</span>
                  </Button>
                )}

                {canManage(m) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(m)}
                    aria-label={`Manage ${m.fullName}`}
                  >
                    {m.isYou ? <KeyRound className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                    <span className="hidden sm:inline">Manage</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Role permissions"
          description="Enforced securely on every action — not just hidden in the interface."
          action={<ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden />}
        />
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          {(["owner", "manager", "cashier"] as Role[]).map((r) => (
            <div key={r} className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-navy-900">{ROLE_LABELS[r]}</p>
              <p className="mt-1 text-xs text-slate-600">{ROLE_DESCRIPTIONS[r]}</p>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">
                  Permission
                </th>
                {(["owner", "manager", "cashier"] as Role[]).map((r) => (
                  <th key={r} scope="col" className="px-5 py-3 text-center font-medium">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PERMISSIONS.map((p) => (
                <tr key={p}>
                  <th scope="row" className="px-5 py-2.5 font-normal text-slate-700">
                    {PERMISSION_LABELS[p]}
                  </th>
                  {(["owner", "manager", "cashier"] as Role[]).map((r) => (
                    <td key={r} className="px-5 py-2.5 text-center">
                      {ROLE_PERMISSIONS[r].includes(p) ? (
                        <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Allowed" />
                      ) : (
                        <span className="text-slate-300" aria-label="Not allowed">
                          —
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {adding && (
        <AddMember
          allowedRoles={allowedRoles}
          onClose={() => setAdding(false)}
          onSaved={reload}
        />
      )}

      {editing && (
        <EditMember
          member={editing}
          allowedRoles={allowedRoles}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}

      {manualInviteModal && (
        <Modal
          open
          onClose={() => setManualInviteModal(null)}
          title="Invitation Link"
          description={`Activation link for ${manualInviteModal.fullName} (${manualInviteModal.email})`}
          size="sm"
          footer={
            <Button onClick={() => setManualInviteModal(null)} variant="primary">
              Close
            </Button>
          }
        >
          <div className="space-y-4">
            {manualInviteModal.error && (
              <Alert tone="warning">
                <p className="font-semibold">Email Delivery Notice</p>
                <p className="mt-1 text-xs leading-relaxed">{manualInviteModal.error}</p>
              </Alert>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2">
              <p className="text-xs font-semibold text-slate-800">Direct Activation Link</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={manualInviteModal.link}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:outline-none"
                />
                <Button size="sm" variant="secondary" onClick={copyModalLink}>
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">
                You can copy and send this link directly to the member so they can set their password.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
