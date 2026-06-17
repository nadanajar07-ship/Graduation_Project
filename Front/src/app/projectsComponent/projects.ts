import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, BASE } from '../services/auth.service';
import { RoleService } from '../services/role.service';

type ProjectStatus = 'Active' | 'Completed' | 'Archived';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './projects.html',
  styleUrls: ['./projects.css'],
})
export class ProjectsComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private roleService = inject(RoleService);

  projects   = signal<any[]>([]);
  teams      = signal<any[]>([]);
  orgMembers = signal<any[]>([]);
  loading    = signal(true);
  error      = signal('');

  activeProject = signal<any | null>(null);
  filterTab     = signal<'All' | ProjectStatus>('All');

  // Create
  showCreate  = signal(false);
  creating    = signal(false);
  createError = signal('');
  newTitle     = signal('');
  newDesc      = signal('');
  newTeamId    = signal('');
  newStatus    = signal<ProjectStatus>('Active');
  newStart     = signal('');
  newEnd       = signal('');

  // Edit
  editingId   = signal<string | null>(null);
  editTitle   = signal('');
  editDesc    = signal('');
  editStatus  = signal<ProjectStatus>('Active');
  editStart   = signal('');
  editEnd     = signal('');
  savingEdit  = signal(false);

  // Member
  addingMember    = signal(false);
  selectedMemberId = signal('');

  private get orgId(): string { return this.auth.currentUser()?.orgId ?? ''; }

  statuses: ProjectStatus[] = ['Active', 'Completed', 'Archived'];

  filtered = computed(() => {
    const tab = this.filterTab();
    return tab === 'All' ? this.projects() : this.projects().filter(p => p.status === tab);
  });

  /**
   * Who may create a project — mirrors the backend rule exactly:
   * an org owner/admin, OR a manager of at least one team.
   */
  canCreateProject = computed<boolean>(() => {
    if (this.roleService.isAdmin()) return true;
    const uid = this.auth.currentUser()?._id;
    if (!uid) return false;
    return this.teams().some((t: any) =>
      (t?.managers ?? []).some((m: any) => (m?._id ?? m) === uid),
    );
  });

  ngOnInit() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const [projRes, teamsRes, membersRes] = await Promise.allSettled([
        firstValueFrom(this.http.get<{ data: any }>(`${BASE}/org/${this.orgId}/projects?limit=100`)),
        firstValueFrom(this.http.get<{ data: any }>(`${BASE}/teams?organizationId=${this.orgId}`)),
        firstValueFrom(this.http.get<{ data: any }>(`${BASE}/org/${this.orgId}/members?limit=100`)),
      ]);
      if (projRes.status === 'fulfilled') {
        this.projects.set(projRes.value?.data?.projects ?? projRes.value?.data ?? []);
      }
      if (teamsRes.status === 'fulfilled') {
        this.teams.set(teamsRes.value?.data?.teams ?? teamsRes.value?.data ?? []);
      }
      if (membersRes.status === 'fulfilled') {
        this.orgMembers.set(membersRes.value?.data?.members ?? []);
      }
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to load projects');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Create ─────────────────────────────────────────────────
  async createProject() {
    if (!this.newTitle().trim() || !this.newTeamId()) {
      this.createError.set('Title and team are required.');
      return;
    }
    this.creating.set(true);
    this.createError.set('');
    try {
      const body: any = {
        title: this.newTitle().trim(),
        teamId: this.newTeamId(),
        status: this.newStatus(),
      };
      if (this.newDesc().trim()) body.description = this.newDesc().trim();
      if (this.newStart()) body.startDate = new Date(this.newStart()).toISOString();
      if (this.newEnd()) body.endDate = new Date(this.newEnd()).toISOString();

      const res = await firstValueFrom(
        this.http.post<{ data: any }>(`${BASE}/org/${this.orgId}/projects`, body),
      );
      if (res?.data) this.projects.update(list => [...list, res.data]);
      this.resetCreate();
      this.showCreate.set(false);
    } catch (err: any) {
      this.createError.set(err?.error?.message || 'Failed to create project');
    } finally {
      this.creating.set(false);
    }
  }

  private resetCreate() {
    this.newTitle.set(''); this.newDesc.set(''); this.newTeamId.set('');
    this.newStatus.set('Active'); this.newStart.set(''); this.newEnd.set('');
  }

  // ── Select ─────────────────────────────────────────────────
  async selectProject(project: any) {
    this.activeProject.set(project);
    this.selectedMemberId.set('');
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(`${BASE}/org/${this.orgId}/projects/${project._id}`),
      );
      const fresh = res?.data?.project ?? res?.data;
      if (fresh) this.activeProject.set(fresh);
    } catch { /* keep existing */ }
  }

  // ── Edit ───────────────────────────────────────────────────
  startEdit(p: any) {
    this.editingId.set(p._id);
    this.editTitle.set(p.title ?? '');
    this.editDesc.set(p.description ?? '');
    this.editStatus.set(p.status ?? 'Active');
    this.editStart.set(p.startDate ? p.startDate.substring(0, 10) : '');
    this.editEnd.set(p.endDate ? p.endDate.substring(0, 10) : '');
  }
  cancelEdit() { this.editingId.set(null); }

  async saveEdit(projectId: string) {
    if (!this.editTitle().trim()) return;
    this.savingEdit.set(true);
    try {
      const body: any = { title: this.editTitle().trim(), status: this.editStatus() };
      if (this.editDesc().trim()) body.description = this.editDesc().trim();
      if (this.editStart()) body.startDate = new Date(this.editStart()).toISOString();
      if (this.editEnd()) body.endDate = new Date(this.editEnd()).toISOString();

      const res = await firstValueFrom(
        this.http.patch<{ data: any }>(`${BASE}/org/${this.orgId}/projects/${projectId}`, body),
      );
      const updated = res?.data?.project ?? res?.data;
      if (updated) {
        this.projects.update(list => list.map(p => p._id === projectId ? { ...p, ...updated } : p));
        if (this.activeProject()?._id === projectId) this.activeProject.update(p => ({ ...p, ...updated }));
      }
      this.editingId.set(null);
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to update project');
    } finally {
      this.savingEdit.set(false);
    }
  }

  // ── Status quick-change ────────────────────────────────────
  async updateStatus(projectId: string, status: ProjectStatus) {
    try {
      await firstValueFrom(
        this.http.patch(`${BASE}/org/${this.orgId}/projects/${projectId}/status`, { status }),
      );
      this.projects.update(list => list.map(p => p._id === projectId ? { ...p, status } : p));
      if (this.activeProject()?._id === projectId) this.activeProject.update(p => ({ ...p, status }));
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to update status');
    }
  }

  // ── Delete ─────────────────────────────────────────────────
  async deleteProject(projectId: string) {
    try {
      await firstValueFrom(this.http.delete(`${BASE}/org/${this.orgId}/projects/${projectId}`));
      this.projects.update(list => list.filter(p => p._id !== projectId));
      if (this.activeProject()?._id === projectId) this.activeProject.set(null);
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to delete project');
    }
  }

  // ── Members ────────────────────────────────────────────────
  async addMember(projectId: string) {
    const uid = this.selectedMemberId();
    if (!uid) return;
    this.addingMember.set(true);
    try {
      await firstValueFrom(
        this.http.post(`${BASE}/org/${this.orgId}/projects/${projectId}/members/${uid}`, {}),
      );
      await this.selectProject(this.activeProject());
      this.selectedMemberId.set('');
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to add member');
    } finally {
      this.addingMember.set(false); }
  }

  async removeMember(projectId: string, userId: string) {
    try {
      await firstValueFrom(
        this.http.delete(`${BASE}/org/${this.orgId}/projects/${projectId}/members/${userId}`),
      );
      this.activeProject.update(p => p ? {
        ...p,
        members: (p.members ?? []).filter((m: any) => (m._id ?? m) !== userId),
      } : p);
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to remove member');
    }
  }

  // ── Helpers ────────────────────────────────────────────────
  memberName(m: any): string {
    const u = m.userId ?? m;
    return u.username ?? u.email?.split('@')[0] ?? 'Unknown';
  }
  memberId(m: any): string { return m.userId?._id ?? m._id ?? m; }

  nonMemberUsers(): any[] {
    const p = this.activeProject();
    if (!p) return [];
    const ids = new Set((p.members ?? []).map((m: any) => this.memberId(m)));
    return this.orgMembers().filter(m => !ids.has(this.memberId(m)));
  }

  statusColor(s: string): string {
    const map: Record<string, string> = {
      Active: '#10b981', Completed: '#6366f1', Archived: '#9ca3af',
    };
    return map[s] ?? '#9ca3af';
  }

  teamName(teamId: any): string {
    const id = teamId?._id ?? teamId;
    return this.teams().find(t => t._id === id)?.name ?? 'Unknown Team';
  }
}
