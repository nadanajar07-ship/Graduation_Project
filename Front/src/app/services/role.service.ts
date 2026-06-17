import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, BASE } from './auth.service';

export type Role = 'owner' | 'admin' | 'member';

export interface OrgMember {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  image?: any;
  role: Role;
  joinedAt: string;
  status: 'active' | 'invited' | 'inactive';
}

@Injectable({ providedIn: 'root' })
export class RoleService {
  private auth = inject(AuthService);
  private http = inject(HttpClient);

  members = signal<OrgMember[]>([]);
  loading = signal(false);

  private _myOrgRole = signal<Role>(
  this.auth.currentUser()?.role as Role || 'member'
);

  readonly role = computed<Role>(() => this._myOrgRole());

  setMyRole(role: Role) {
    this._myOrgRole.set(role);
  }

  // ── Role helpers ─────────────────────────────
  isOwner(): boolean {
    return this.role() === 'owner';
  }

  isAdmin(): boolean {
    return this.role() === 'owner' || this.role() === 'admin';
  }

  isManager(): boolean {
    return this.isAdmin();
  }

  isMember(): boolean {
    return true;
  }

  // ── ✅ FIX: مفيش API (منع 404) ───────────────
  loadMyRole(): void {
    const user = this.auth.currentUser();

    if (user?.role) {
      this._myOrgRole.set(user.role as Role);
    }
  }

  async loadMembers(): Promise<void> {
    const orgId = this.auth.currentUser()?.orgId;
    if (!orgId) return;
    this.loading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: { members: any[] } }>(`${BASE}/org/${orgId}/members?page=1&limit=100`)
      );
      const mapped: OrgMember[] = (res?.data?.members ?? [])
        .filter((m: any) => m.userId)
        .map((m: any) => ({
          id:       m._id,
          userId:   m.userId._id ?? m.userId,
          fullName: m.userId.fullName ?? m.userId.username ?? m.userId.email?.split('@')[0] ?? 'Unknown',
          email:    m.userId.email ?? '',
          image:    m.userId.image ?? undefined,
          role:     (m.role?.toLowerCase() ?? 'member') as Role,
          joinedAt: m.joinedAt ?? m.createdAt ?? '',
          status:   m.isActive === false ? 'inactive' : 'active',
        }));
      this.members.set(mapped);
    } catch (err: any) {
      console.error('[RoleService] loadMembers:', err?.error?.message ?? err);
    } finally {
      this.loading.set(false);
    }
  }

  // ── APIs (سيبهم عادي لو الباك هيشتغل بعدين) ──
  async updateMemberRole(
    memberId: string,
    role: Role,
    orgId?: string,
  ): Promise<{ success: boolean; message: string }> {
    const resolvedOrgId = orgId || this.auth.currentUser()?.orgId;
    if (!resolvedOrgId) return { success: false, message: 'No org selected' };

    try {
      await firstValueFrom(
        this.http.patch(`${BASE}/org/${resolvedOrgId}/members/${memberId}/role`, { role }),
      );

      this.members.update((list) =>
        list.map((m) => (m.userId === memberId ? { ...m, role } : m))
      );

      return { success: true, message: 'Role updated' };
    } catch (err: any) {
      return { success: false, message: err?.error?.message || 'Failed to update role' };
    }
  }

  async removeMember(
    memberUserId: string,
    orgId?: string,
  ): Promise<{ success: boolean; message: string }> {
    const resolvedOrgId = orgId || this.auth.currentUser()?.orgId;
    if (!resolvedOrgId) return { success: false, message: 'No org selected' };

    try {
      await firstValueFrom(
        this.http.delete(`${BASE}/org/${resolvedOrgId}/members/${memberUserId}`),
      );

      this.members.update((list) =>
        list.filter((m) => m.userId !== memberUserId)
      );

      return { success: true, message: 'Member removed' };
    } catch (err: any) {
      return { success: false, message: err?.error?.message || 'Failed to remove member' };
    }
  }

  async inviteMember(
    email: string,
    role: Role,
    orgId?: string,
  ): Promise<{ success: boolean; message: string }> {
    const resolvedOrgId = orgId || this.auth.currentUser()?.orgId;
    if (!resolvedOrgId) return { success: false, message: 'No org selected' };

    try {
      await firstValueFrom(
        this.http.post(`${BASE}/org/${resolvedOrgId}/invitations`, { email, role }),
      );

      return { success: true, message: `Invitation sent to ${email}` };
    } catch (err: any) {
      return { success: false, message: err?.error?.message || 'Failed to send invitation' };
    }
  }

  private formatDate(dateStr: string): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }
}