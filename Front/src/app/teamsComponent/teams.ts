import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, BASE } from '../services/auth.service';
import { RoleService } from '../services/role.service';

@Component({
  selector: 'app-teams',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './teams.html',
  styleUrls: ['./teams.css'],
})
export class TeamsComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private roleService = inject(RoleService);

  /** Only org owner/admin may create teams — mirrors the backend rule. */
  get canManage(): boolean { return this.roleService.isAdmin(); }

  teams      = signal<any[]>([]);
  orgMembers = signal<any[]>([]);
  loading    = signal(true);
  error      = signal('');

  // Selected team for detail panel
  activeTeam = signal<any | null>(null);

  // Create team form
  showCreate   = signal(false);
  creating     = signal(false);
  createError  = signal('');
  newName      = signal('');
  newDesc      = signal('');

  // Edit team
  editingId    = signal<string | null>(null);
  editName     = signal('');
  editDesc     = signal('');

  // Add member/manager
  addingMember  = signal(false);
  selectedUserId = signal('');

  private get orgId(): string {
    return this.auth.currentUser()?.orgId ?? '';
  }

  ngOnInit() { this.load(); }

  async load() {
    if (!this.orgId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const [teamsRes, membersRes] = await Promise.allSettled([
        firstValueFrom(
          this.http.get<{ data: any }>(`${BASE}/teams?organizationId=${this.orgId}`)
        ),
        firstValueFrom(
          this.http.get<{ data: { members: any[] } }>(`${BASE}/org/${this.orgId}/members?limit=100`)
        ),
      ]);
      if (teamsRes.status === 'fulfilled') {
        this.teams.set(teamsRes.value?.data?.teams ?? teamsRes.value?.data ?? []);
      }
      if (membersRes.status === 'fulfilled') {
        this.orgMembers.set(membersRes.value?.data?.members ?? []);
      }
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to load teams');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Create ─────────────────────────────────────────────
  async createTeam() {
    if (!this.newName().trim()) { this.createError.set('Name is required.'); return; }
    this.creating.set(true);
    this.createError.set('');
    try {
      const res = await firstValueFrom(
        this.http.post<{ data: any }>(`${BASE}/teams`, {
          organizationId: this.orgId,
          name: this.newName().trim(),
          description: this.newDesc().trim() || undefined,
        })
      );
      const created = res?.data?.team ?? res?.data;
      if (created) this.teams.update(list => [...list, created]);
      this.newName.set(''); this.newDesc.set('');
      this.showCreate.set(false);
    } catch (err: any) {
      this.createError.set(err?.error?.message || 'Failed to create team');
    } finally {
      this.creating.set(false);
    }
  }

  // ── Edit ───────────────────────────────────────────────
  startEdit(team: any) {
    this.editingId.set(team._id);
    this.editName.set(team.name);
    this.editDesc.set(team.description ?? '');
  }

  async saveEdit(teamId: string) {
    try {
      const res = await firstValueFrom(
        this.http.patch<{ data: any }>(`${BASE}/teams/${teamId}`, {
          name: this.editName().trim(),
          description: this.editDesc().trim() || undefined,
        })
      );
      const updated = res?.data?.team ?? res?.data;
      if (updated) {
        this.teams.update(list => list.map(t => t._id === teamId ? { ...t, ...updated } : t));
        if (this.activeTeam()?._id === teamId) this.activeTeam.update(t => ({ ...t, ...updated }));
      }
      this.editingId.set(null);
    } catch (err: any) { this.error.set(err?.error?.message || 'Failed to update team'); }
  }

  cancelEdit() { this.editingId.set(null); }

  // ── Delete ─────────────────────────────────────────────
  async deleteTeam(teamId: string) {
    try {
      await firstValueFrom(this.http.delete(`${BASE}/teams/${teamId}`));
      this.teams.update(list => list.filter(t => t._id !== teamId));
      if (this.activeTeam()?._id === teamId) this.activeTeam.set(null);
    } catch (err: any) { this.error.set(err?.error?.message || 'Failed to delete team'); }
  }

  // ── Select team (open detail) ──────────────────────────
  async selectTeam(team: any) {
    this.activeTeam.set(team);
    this.selectedUserId.set('');
    // Refresh team detail
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(`${BASE}/teams/${team._id}`)
      );
      const fresh = res?.data?.team ?? res?.data;
      if (fresh) this.activeTeam.set(fresh);
    } catch { /* keep existing */ }
  }

  // ── Add member ─────────────────────────────────────────
  async addMember(teamId: string) {
    const uid = this.selectedUserId();
    if (!uid) return;
    this.addingMember.set(true);
    try {
      await firstValueFrom(
        this.http.post(`${BASE}/teams/${teamId}/members/${uid}`, {})
      );
      await this.selectTeam(this.activeTeam());
      this.selectedUserId.set('');
    } catch (err: any) { this.error.set(err?.error?.message || 'Failed to add member'); }
    finally { this.addingMember.set(false); }
  }

  // ── Remove member ──────────────────────────────────────
  async removeMember(teamId: string, userId: string) {
    try {
      await firstValueFrom(
        this.http.delete(`${BASE}/teams/${teamId}/members/${userId}`)
      );
      this.activeTeam.update(t => t ? {
        ...t,
        members: (t.members ?? []).filter((m: any) => (m._id ?? m) !== userId),
      } : t);
    } catch (err: any) { this.error.set(err?.error?.message || 'Failed to remove member'); }
  }

  // ── Promote/demote manager ─────────────────────────────
  isManager(team: any, userId: string): boolean {
    return (team?.managers ?? []).some((m: any) => (m._id ?? m) === userId);
  }

  async toggleManager(teamId: string, userId: string) {
    const team = this.activeTeam();
    if (!team) return;
    try {
      if (this.isManager(team, userId)) {
        await firstValueFrom(this.http.delete(`${BASE}/teams/${teamId}/managers/${userId}`));
        this.activeTeam.update(t => t ? {
          ...t,
          managers: (t.managers ?? []).filter((m: any) => (m._id ?? m) !== userId),
        } : t);
      } else {
        await firstValueFrom(this.http.post(`${BASE}/teams/${teamId}/managers/${userId}`, {}));
        await this.selectTeam(team);
      }
    } catch (err: any) { this.error.set(err?.error?.message || 'Failed to update manager'); }
  }

  // ── Helpers ────────────────────────────────────────────
  memberName(m: any): string {
    const u = m.userId ?? m;
    return u.username ?? u.email?.split('@')[0] ?? 'Unknown';
  }

  memberId(m: any): string {
    return m.userId?._id ?? m._id ?? m;
  }

  nonMemberUsers(): any[] {
    const team = this.activeTeam();
    if (!team) return [];
    const memberIds = new Set((team.members ?? []).map((m: any) => this.memberId(m)));
    return this.orgMembers().filter(m => !memberIds.has(this.memberId(m)));
  }
}
