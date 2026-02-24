import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useOrgRole } from "@/hooks/useOrgRole";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Check, X, Trash2, Send, ArrowLeft, Copy, RefreshCw } from "lucide-react";

interface Member {
  id: string;
  user_id: string | null;
  invited_email: string | null;
  role: string;
  accepted: boolean | null;
  email: string | null;
}

const TeamManagement = () => {
  const navigate = useNavigate();
  const { role: myRole, orgId, loading: roleLoading } = useOrgRole();

  const [orgName, setOrgName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showRegenDialog, setShowRegenDialog] = useState(false);

  const canManage = myRole === "owner" || myRole === "admin";

  // Fetch org info + members (using RPC for real emails)
  const fetchData = useCallback(async () => {
    if (!orgId) return;
    const [orgRes, membersRes] = await Promise.all([
      supabase.from("organizations").select("name, invite_code").eq("id", orgId).single(),
      supabase.rpc("get_org_members", { _organization_id: orgId }),
    ]);
    if (orgRes.data) {
      setOrgName(orgRes.data.name);
      setInviteCode(orgRes.data.invite_code ?? "");
    }
    if (membersRes.data) setMembers(membersRes.data as Member[]);
  }, [orgId]);

  useEffect(() => {
    if (!roleLoading && orgId) fetchData();
  }, [roleLoading, orgId, fetchData]);

  // Rename org
  const saveOrgName = async () => {
    if (!nameDraft.trim() || !orgId) return;
    const { error } = await supabase
      .from("organizations")
      .update({ name: nameDraft.trim() })
      .eq("id", orgId);
    if (error) {
      toast({ title: "Could not rename", description: error.message, variant: "destructive" });
    } else {
      setOrgName(nameDraft.trim());
      setEditingName(false);
      toast({ title: "Organization renamed" });
    }
  };

  // Change role
  const changeRole = async (memberId: string, newRole: string) => {
    const { error } = await supabase
      .from("organization_members")
      .update({ role: newRole })
      .eq("id", memberId);
    if (error) {
      toast({ title: "Could not change role", description: error.message, variant: "destructive" });
    } else {
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
      );
      toast({ title: "Role updated" });
    }
  };

  // Remove member
  const removeMember = async (memberId: string, memberRole: string) => {
    if (memberRole === "owner" && myRole !== "owner") {
      toast({ title: "Cannot remove owner", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("organization_members")
      .delete()
      .eq("id", memberId);
    if (error) {
      toast({ title: "Could not remove member", description: error.message, variant: "destructive" });
    } else {
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast({ title: "Member removed" });
    }
  };

  // Copy invite code
  const copyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      toast({ title: "Invite code copied to clipboard" });
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  // Regenerate invite code (owner only)
  const regenerateInviteCode = async () => {
    if (!orgId) return;
    setRegenerating(true);
    const newCode = crypto.randomUUID().slice(0, 8);
    const { error } = await supabase
      .from("organizations")
      .update({ invite_code: newCode })
      .eq("id", orgId);
    setRegenerating(false);
    if (error) {
      toast({ title: "Could not regenerate code", description: error.message, variant: "destructive" });
    } else {
      setInviteCode(newCode);
      toast({ title: "Invite code regenerated" });
    }
  };

  // Invite member (with try/catch for unreachable function)
  const handleInvite = async () => {
    if (!inviteEmail.trim() || !orgId) return;
    setSending(true);

    try {
      const res = await supabase.functions.invoke("invite-member", {
        body: { email: inviteEmail.trim(), organization_id: orgId, org_name: orgName, redirect_url: window.location.origin },
      });

      setSending(false);
      if (res.error || res.data?.error) {
        toast({
          title: "Invite failed",
          description: res.data?.error || res.error?.message,
          variant: "destructive",
        });
      } else {
        toast({ title: `Invitation sent to ${inviteEmail.trim()}` });
        setInviteEmail("");
        fetchData();
      }
    } catch {
      setSending(false);
      toast({
        title: "Invite failed",
        description: "Invitation service unavailable — please try again shortly.",
        variant: "destructive",
      });
    }
  };

  if (roleLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #0D0F35 0%, #1F1B6B 50%, #0B7B6E 100%)" }}
      >
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-8">
        {/* Back */}
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </button>

        {/* Org Name */}
        <div className="flex items-center gap-3">
          {editingName ? (
            <>
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="max-w-xs"
                autoFocus
              />
              <button onClick={saveOrgName} className="text-primary hover:text-primary/80">
                <Check className="h-5 w-5" />
              </button>
              <button
                onClick={() => setEditingName(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-foreground">{orgName}</h2>
              {myRole === "owner" && (
                <button
                  onClick={() => {
                    setNameDraft(orgName);
                    setEditingName(true);
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Invite code */}
        {canManage && inviteCode && (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Organization Invite Code</p>
            <div className="flex items-center gap-2">
              <p className="font-mono text-sm text-foreground select-all">{inviteCode}</p>
              <button
                onClick={copyInviteCode}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Copy invite code"
              >
                <Copy className="h-4 w-4" />
              </button>
              {myRole === "owner" && (
                <button
                  onClick={() => setShowRegenDialog(true)}
                  disabled={regenerating}
                  className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  title="Regenerate invite code"
                >
                  <RefreshCw className={`h-4 w-4 ${regenerating ? "animate-spin" : ""}`} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Members table */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const isOwner = m.role === "owner";
                const displayEmail = m.email || m.invited_email || m.user_id || "—";

                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium truncate max-w-[200px]">
                      {displayEmail}
                    </TableCell>
                    <TableCell>
                      <span className="capitalize text-sm">{m.role}</span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          m.accepted
                            ? "bg-green-500/10 text-green-500"
                            : "bg-yellow-500/10 text-yellow-500"
                        }`}
                      >
                        {m.accepted ? "Active" : "Pending"}
                      </span>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!(myRole === "admin" && isOwner) && (
                            <Select
                              value={m.role}
                              onValueChange={(val) => changeRole(m.id, val)}
                            >
                              <SelectTrigger className="w-28 h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {myRole === "owner" && (
                                  <SelectItem value="owner">Owner</SelectItem>
                                )}
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="member">Member</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                          {!(myRole === "admin" && isOwner) && (
                            <button
                              onClick={() => removeMember(m.id, m.role)}
                              className="text-destructive hover:text-destructive/80 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 4 : 3} className="text-center text-muted-foreground py-8">
                    No members yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Invite section */}
        {canManage && (
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Invite a Member</h3>
            <div className="flex gap-2">
              <Input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                type="email"
                className="flex-1"
              />
              <Button
                disabled={sending || !inviteEmail.trim()}
                onClick={handleInvite}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                {sending ? "Sending…" : "Invite"}
              </Button>
            </div>
          </div>
        )}
        {/* Regenerate confirmation dialog */}
        <AlertDialog open={showRegenDialog} onOpenChange={setShowRegenDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Regenerate Invite Code?</AlertDialogTitle>
              <AlertDialogDescription>
                Regenerating the invite code will invalidate the current one. Anyone with the old code will not be able to join. Continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setShowRegenDialog(false); regenerateInviteCode(); }}>
                Regenerate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
};

export default TeamManagement;
