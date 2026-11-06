"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Mail, Pencil, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { useApp } from "@/components/app-context";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  SelectField,
  Skeleton,
  TextField,
  useToast,
} from "@/components/ui";
import { ApiError, apiFetch, useApi } from "@/lib/client";
import {
  PERMISSION_LABELS,
  PERMISSIONS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type Role,
} from "@/lib/permissions";

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
  password?: string;
  isRetry: boolean;
  emailSent: boolean;
  emailError?: string;
  activationLink: string;
  loginLink?: string;
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AddMemberResult | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  function formatRoleEmail(name: string, role: Role) {
    const clean = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, ".");
    const prefix = clean || "staff";
    const roleSlug = role === "owner" ? "admin" : role === "manager" ? "manager" : "cashier";
    return `${prefix}.${roleSlug}@charlotteesthy.com`;
  }

  function generateDefaultPassword() {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const special = "@#$%&*!";
    let randomPart = "";
    for (let i = 0; i < 5; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const spec = special.charAt(Math.floor(Math.random() * special.length));
    const rolePrefix = v.role === "cashier" ? "Cashier" : v.role === "manager" ? "Manager" : "Admin";
    const generated = `${rolePrefix}${spec}${randomPart}`;
    setV((prev) => ({ ...prev, password: generated }));
    toast.info(`Generated default ${rolePrefix.toLowerCase()} password`);
  }

  async function save() {
    setBusy(true);
    setErr("");
    setFields({});
    try {
      const payload: Record<string, unknown> = {
        fullName: v.fullName,
        email: v.email,
        password: v.password,
        role: v.role,
      };

      const res = await apiFetch<AddMemberResult>("/api/team", {
        method: "POST",
        body: payload,
      });

      onSaved();
      setResult(res);
      if (res.emailSent) {
        toast.success(`Account created & invitation email sent to ${res.email}`);
      } else {
        toast.success(`Account created for ${res.fullName}`);
      }
    } catch (e) {
      setErr((e as ApiError).message);
      setFields((e as ApiError).fieldErrors ?? {});
    } finally {
      setBusy(false);
    }
  }

  const copyPassword = () => {
    const pwd = result?.password || v.password;
    if (!pwd) return;
    navigator.clipboard.writeText(pwd);
    setCopiedPassword(true);
    toast.success("Password copied to clipboard!");
    setTimeout(() => setCopiedPassword(false), 2500);
  };

  const copyLoginLink = () => {
    const link = result?.loginLink || (typeof window !== "undefined" ? `${window.location.origin}/login` : "/login");
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    toast.success("Login link copied!");
    setTimeout(() => setCopiedLink(false), 2500);
  };

  if (result) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Staff Account Created & Activated"
        description={`Account for ${result.fullName} (${result.email}) has been provisioned and is active.`}
        size="sm"
        footer={
          <Button onClick={onClose} variant="primary">
            Done
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 border border-slate-200">
            <div>
              <p className="text-xs font-semibold text-slate-800">{result.fullName}</p>
              <p className="text-xs text-slate-500">{result.email}</p>
            </div>
            <Badge tone={result.role === "owner" ? "navy" : result.role === "manager" ? "emerald" : "slate"}>
              {ROLE_LABELS[result.role]}
            </Badge>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-blue-900">Default Password</p>
              <span className="text-[11px] text-blue-700 font-medium">Keep this for admin sign-in</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={result.password || v.password}
                className="flex-1 rounded-lg border border-blue-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800 focus:outline-none"
              />
              <Button size="sm" variant="secondary" onClick={copyPassword}>
                {copiedPassword ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedPassword ? "Copied" : "Copy"}</span>
              </Button>
            </div>
            <p className="text-[11px] text-blue-800 leading-relaxed">
              As admin, you can log in to this account at any time using this default password.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2">
            <p className="text-xs font-semibold text-slate-800">Sign-in Link</p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={result.loginLink || (typeof window !== "undefined" ? `${window.location.origin}/login` : "/login")}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:outline-none"
              />
              <Button size="sm" variant="secondary" onClick={copyLoginLink}>
                {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedLink ? "Copied" : "Copy"}</span>
              </Button>
            </div>
            <p className="text-[11px] text-slate-500">
              The staff member can open this link directly to sign in with their email and password.
            </p>
          </div>

          {result.emailSent ? (
            <Alert tone="success">
              <p className="font-semibold text-xs">Notification Email Delivered</p>
              <p className="mt-0.5 text-xs">A welcome notification was sent to {result.email}.</p>
            </Alert>
          ) : (
            <Alert tone="warning">
              <p className="font-semibold text-xs">Email Delivery Notice</p>
              <p className="mt-0.5 text-xs">
                {result.emailError || "Email could not be delivered. Please share the credentials above directly with the staff member."}
              </p>
            </Alert>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title="Add team member"
      description="Create a cashier or manager account and set their default password."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={save}
            loading={busy}
            disabled={!v.fullName.trim() || !v.email.trim() || v.password.length < 8}
          >
            Create member
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
        <div>
          <TextField
            label="Email address"
            type="email"
            value={v.email}
            onChange={(e) => setV({ ...v, email: e.target.value })}
            error={fields.email}
            placeholder={`e.g. ${v.fullName ? formatRoleEmail(v.fullName, v.role) : `staff.${v.role === "owner" ? "admin" : v.role === "manager" ? "manager" : "cashier"}@charlotteesthy.com`}`}
            hint="Sign-in email address. Enter a personal email or generate an official store email."
            required
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                const generated = formatRoleEmail(v.fullName, v.role);
                setV((prev) => ({ ...prev, email: generated }));
                toast.info(`Generated store email: ${generated}`);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0c4a9e] hover:text-[#093a7d] hover:underline"
            >
              <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              Generate official {v.role === "owner" ? ".admin" : v.role === "manager" ? ".manager" : ".cashier"} email
            </button>
          </div>
        </div>

        <SelectField
          label="Store role"
          value={v.role}
          onChange={(e) => {
            const newRole = e.target.value as Role;
            setV((prev) => {
              const isStoreEmail = prev.email.endsWith("@charlotteesthy.com");
              return {
                ...prev,
                role: newRole,
                email: isStoreEmail || !prev.email ? formatRoleEmail(prev.fullName, newRole) : prev.email,
              };
            });
          }}
          hint={ROLE_DESCRIPTIONS[v.role]}
        >
          {allowedRoles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </SelectField>

        <div>
          <TextField
            label="Default password"
            type="text"
            autoComplete="off"
            value={v.password}
            onChange={(e) => setV({ ...v, password: e.target.value })}
            error={fields.password}
            placeholder={`e.g. ${v.role === "cashier" ? "Cashier" : v.role === "manager" ? "Manager" : "Admin"}@9x4k2`}
            hint="Set the default password for this staff member (min 8 characters). Admin can use this to sign in."
            required
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={generateDefaultPassword}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0c4a9e] hover:text-[#093a7d] hover:underline"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              Generate default password
            </button>
            {v.password && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(v.password);
                  toast.success("Password copied to clipboard!");
                }}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-900 leading-relaxed">
          <p className="font-semibold flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-blue-600" />
            Official Notification Sender
          </p>
          <p className="mt-1 text-blue-800">
            Sender: <strong>{v.role === "owner" ? "Charlotte Esthy Admin" : v.role === "manager" ? "Charlotte Esthy Manager" : "Charlotte Esthy Team"}</strong>.
            Delivery destination: <strong>{v.email || "their email address"}</strong>.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function EditMember({
  member,
  allowedRoles,
  onClose,
  onSaved,
  onDeleted,
}: {
  member: Member;
  allowedRoles: Role[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: (memberId: string) => void;
}) {
  const toast = useToast();
  const [role, setRole] = useState<Role>(member.role);
  const [status, setStatus] = useState(member.status);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [deleteErr, setDeleteErr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function generateNewPassword() {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const special = "@#$%&*!";
    let randomPart = "";
    for (let i = 0; i < 5; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const spec = special.charAt(Math.floor(Math.random() * special.length));
    const rolePrefix = role === "cashier" ? "Cashier" : role === "manager" ? "Manager" : "Admin";
    const generated = `${rolePrefix}${spec}${randomPart}`;
    setPassword(generated);
    toast.info(`Generated new ${rolePrefix.toLowerCase()} password`);
  }

  async function save() {
    setBusy(true);
    setErr("");
    const body: Record<string, unknown> = {};
    if (role !== member.role) body.role = role;
    if (status !== member.status) body.status = status;
    if (password) body.password = password;
    try {
      await apiFetch(`/api/team/${member.id}`, { method: "PATCH", body });
      toast.success("Team member updated successfully");
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message || "Failed to update member");
    } finally {
      setBusy(false);
    }
  }

  async function deleteMember() {
    setDeleting(true);
    setDeleteErr("");
    try {
      await apiFetch(`/api/team/${member.id}`, { method: "DELETE" });
      toast.success(`${member.fullName} was deleted from the team.`);
      onDeleted?.(member.id);
      onSaved();
      onClose();
    } catch (e: any) {
      const msg = e.message || "Failed to delete team member.";
      setDeleteErr(msg);
      toast.error(msg);
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
            <div>
              <TextField
                label="Set new password (optional)"
                type="text"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`e.g. ${role === "cashier" ? "Cashier" : role === "manager" ? "Manager" : "Admin"}@9x4k2`}
                hint="Changes password immediately and signs them out of all devices. Min 8 characters."
              />
              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={generateNewPassword}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0c4a9e] hover:text-[#093a7d] hover:underline"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  Generate new password
                </button>
                {password && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(password);
                      toast.success("Password copied to clipboard!");
                    }}
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200">
              {confirmDelete ? (
                <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 space-y-3">
                  {deleteErr && <Alert tone="error">{deleteErr}</Alert>}
                  <p className="text-xs font-semibold text-red-900">
                    Are you sure you want to delete {member.fullName}?
                  </p>
                  <p className="text-xs text-red-700 leading-relaxed">
                    This will permanently remove this account from your store. They will no longer be able to sign in.
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
                      onClick={() => {
                        setConfirmDelete(false);
                        setDeleteErr("");
                      }}
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
                    onClick={() => {
                      setConfirmDelete(true);
                      setDeleteErr("");
                    }}
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
  const [localMembers, setLocalMembers] = useState<Member[] | null>(null);
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
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (data?.members) {
      setLocalMembers(data.members);
    }
  }, [data?.members]);

  const members = localMembers ?? data?.members ?? [];

  const isOwner = app.role === "owner";
  const allowedRoles: Role[] = isOwner ? ["owner", "manager", "cashier"] : ["cashier"];
  const canManage = (m: Member) => app.can("team.manage") && (isOwner || m.role === "cashier");

  const handleDeleteMember = async () => {
    if (!deletingMember) return;
    const target = deletingMember;
    setIsDeleting(true);
    try {
      await apiFetch(`/api/team/${target.id}`, { method: "DELETE" });
      setLocalMembers((prev) => (prev ? prev.filter((m) => m.id !== target.id) : []));
      toast.success(`${target.fullName} was deleted from the team.`);
      setDeletingMember(null);
      reload();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete team member.");
    } finally {
      setIsDeleting(false);
    }
  };

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
        ) : members.length === 0 ? (
          <EmptyState title="No team members" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {members.map((m) => (
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

                {canManage(m) && !m.isYou && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeletingMember(m)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    title={`Delete ${m.fullName}`}
                    aria-label={`Delete ${m.fullName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Delete</span>
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
          onDeleted={(id) => {
            setLocalMembers((prev) => (prev ? prev.filter((m) => m.id !== id) : []));
          }}
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

      {deletingMember && (
        <ConfirmDialog
          open
          danger
          title="Delete Team Member"
          message={`Are you sure you want to permanently delete ${deletingMember.fullName} (${deletingMember.email}) from your team? This action cannot be undone.`}
          confirmLabel="Yes, Delete Member"
          loading={isDeleting}
          onConfirm={handleDeleteMember}
          onClose={() => !isDeleting && setDeletingMember(null)}
        />
      )}
    </div>
  );
}