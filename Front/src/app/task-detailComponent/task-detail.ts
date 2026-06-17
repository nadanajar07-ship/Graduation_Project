import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, BASE } from '../services/auth.service';
import { mapTask, TaskService, Task } from '../services/task.service';

@Component({
  selector: 'app-task-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './task-detail.html',
  styleUrls: ['./task-detail.css'],
})
export class TaskDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private taskService = inject(TaskService);

  task = signal<Task | null>(null);
  loading = signal(true);
  errorMsg = signal<string | null>(null);

  // Comments
  comments = signal<any[]>([]);
  commentsLoading = signal(false);
  newComment = signal('');
  submittingComment = signal(false);
  commentError = signal('');
  editingCommentId = signal<string | null>(null);
  editCommentText = signal('');
  savingComment = signal(false);

  // Assignee
  orgMembers = signal<any[]>([]);
  showAssigneeSelect = signal(false);
  assigningUser = signal(false);

  // Sprint assignment
  sprintOptions     = signal<{ _id: string; name: string }[]>([]);
  showSprintSelect  = signal(false);
  changingSprintId  = signal(false);

  // Dependencies
  dependencies = signal<any[]>([]);
  depsLoading  = signal(false);
  showAddDep   = signal(false);
  selectedBlockerId = signal('');
  addingDep    = signal(false);

  // Due date
  editingDueDate = signal(false);
  dueDateValue   = signal('');
  savingDueDate  = signal(false);

  // Subtasks
  subtasks = signal<any[]>([]);
  subtasksLoading = signal(false);
  newSubtaskTitle = signal('');
  addingSubtask   = signal(false);

  spaceTasks = computed(() => {
    const t = this.task();
    if (!t?.spaceId) return [];
    return this.taskService.tasks().filter(tk => tk.spaceId === t.spaceId && tk.id !== t.id);
  });

  currentUser = this.auth.currentUser;
  private taskId = '';

  private get orgId(): string {
    return this.auth.currentUser()?.orgId ?? '';
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/dashboard/tasks']);
      return;
    }
    this.taskId = id;

    // Try local cache first
    const cached = this.taskService.getById(id);
    if (cached) {
      this.task.set(cached);
      this.loading.set(false);
      this.loadSubtasks(id);
      this.loadDependencies(id);
      if (cached.spaceId) this.loadSprintsForTask(cached.spaceId);
    } else {
      this.loadTaskFromBackend(id).then(() => {
        this.loadSubtasks(id);
        this.loadDependencies(id);
        const spaceId = this.task()?.spaceId;
        if (spaceId) this.loadSprintsForTask(spaceId);
      });
    }

    this.loadComments(id);
    if (this.orgId) this.loadOrgMembers();
  }

  // ── Load from backend ─────────────────────────────────────
  private async loadTaskFromBackend(taskId: string) {
    if (!this.orgId) {
      this.loading.set(false);
      return;
    }
    try {
      // Need spaceId — scan spaces
      const spacesRes = await firstValueFrom(
        this.http.get<{ data: { items: any[] } }>(`${BASE}/org/${this.orgId}/spaces?limit=100`),
      );

      for (const space of spacesRes?.data?.items ?? []) {
        try {
          const res = await firstValueFrom(
            this.http.get<{ data: any }>(
              `${BASE}/org/${this.orgId}/spaces/${space._id}/tasks/${taskId}`,
            ),
          );
          const payload = res?.data?.task ?? res?.data;
          if (payload) {
            const task = mapTask(payload);
            task.spaceId = space._id;
            this.task.set(task);
            break;
          }
        } catch {
          /* try next space */
        }
      }
    } catch {
      this.errorMsg.set('Failed to load task.');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Comments ─────────────────────────────────────────────
  async loadComments(taskId: string) {
    this.commentsLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(`${BASE}/tasks/${taskId}/comments?limit=50`),
      );
      const raw = res?.data?.comments ?? res?.data ?? [];
      this.comments.set(Array.isArray(raw) ? raw : []);
    } catch {
      /* comments optional */
    } finally {
      this.commentsLoading.set(false);
    }
  }

  async addComment() {
    const content = this.newComment().trim();
    if (!content) return;
    this.submittingComment.set(true);
    this.commentError.set('');
    try {
      const res = await firstValueFrom(
        this.http.post<{ data: any }>(`${BASE}/tasks/${this.taskId}/comments`, { content }),
      );
      const created = res?.data?.comment ?? res?.data;
      if (created) {
        this.comments.update(list => [...list, created]);
      }
      this.newComment.set('');
    } catch (err: any) {
      this.commentError.set(err?.error?.message || 'Failed to post comment');
    } finally {
      this.submittingComment.set(false);
    }
  }

  async deleteComment(commentId: string) {
    try {
      await firstValueFrom(
        this.http.delete(`${BASE}/tasks/${this.taskId}/comments/${commentId}`),
      );
      this.comments.update(list => list.filter(c => c._id !== commentId));
    } catch { /* ignore */ }
  }

  startEditComment(comment: any) {
    this.editingCommentId.set(comment._id);
    this.editCommentText.set(comment.content);
  }
  cancelEditComment() { this.editingCommentId.set(null); this.editCommentText.set(''); }

  async saveEditComment(commentId: string) {
    const content = this.editCommentText().trim();
    if (!content) return;
    this.savingComment.set(true);
    try {
      const res = await firstValueFrom(
        this.http.patch<{ data: any }>(`${BASE}/tasks/${this.taskId}/comments/${commentId}`, { content }),
      );
      this.comments.update(list => list.map(c => c._id === commentId ? { ...c, content: res?.data?.content ?? content } : c));
      this.editingCommentId.set(null);
    } catch { /* ignore */ }
    finally { this.savingComment.set(false); }
  }

  // ── Assignee ─────────────────────────────────────────────
  private async loadOrgMembers() {
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(`${BASE}/org/${this.orgId}/members?limit=100`),
      );
      this.orgMembers.set(res?.data?.members ?? []);
    } catch { /* ignore */ }
  }

  // ── Sprint ────────────────────────────────────────────────
  async loadSprintsForTask(spaceId: string): Promise<void> {
    if (!this.orgId || !spaceId) return;
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(
          `${BASE}/org/${this.orgId}/spaces/${spaceId}/sprints?limit=50`
        )
      );
      const items: any[] = res?.data?.items ?? res?.data?.sprints ?? [];
      this.sprintOptions.set(items.map((s: any) => ({ _id: s._id, name: s.name })));
    } catch { /* non-critical */ }
  }

  async changeSprint(sprintId: string | null): Promise<void> {
    const t = this.task();
    if (!t?.spaceId) return;
    this.changingSprintId.set(true);
    this.showSprintSelect.set(false);
    try {
      await firstValueFrom(
        this.http.patch(
          `${BASE}/org/${this.orgId}/spaces/${t.spaceId}/tasks/${this.taskId}`,
          { sprintId: sprintId || null },
        )
      );
      const sprint = sprintId ? (this.sprintOptions().find(s => s._id === sprintId)?.name ?? '') : '';
      this.task.update(tk => tk ? { ...tk, sprint, sprintId: sprintId ?? '' } : tk);
    } catch { /* ignore */ }
    finally { this.changingSprintId.set(false); }
  }

  // ── Due date ─────────────────────────────────────────────
  startEditDueDate() {
    const t = this.task();
    const iso = t?.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : '';
    this.dueDateValue.set(iso);
    this.editingDueDate.set(true);
  }
  cancelEditDueDate() { this.editingDueDate.set(false); }

  async saveDueDate() {
    const t = this.task();
    if (!t?.spaceId) return;
    this.savingDueDate.set(true);
    try {
      await firstValueFrom(
        this.http.patch(
          `${BASE}/org/${this.orgId}/spaces/${t.spaceId}/tasks/${this.taskId}/due-date`,
          { dueDate: this.dueDateValue() ? new Date(this.dueDateValue()).toISOString() : null },
        ),
      );
      const isoDate = this.dueDateValue() ? new Date(this.dueDateValue()).toISOString() : '';
      this.task.update(tk => tk ? { ...tk, dueDate: isoDate } : tk);
      this.editingDueDate.set(false);
    } catch { /* ignore */ }
    finally { this.savingDueDate.set(false); }
  }

  async changeAssignee(userId: string | null) {
    const t = this.task();
    if (!t?.spaceId) return;
    this.assigningUser.set(true);
    this.showAssigneeSelect.set(false);
    try {
      const res = await firstValueFrom(
        this.http.patch<{ data: any }>(
          `${BASE}/org/${this.orgId}/spaces/${t.spaceId}/tasks/${this.taskId}/assign`,
          { assigneeId: userId ?? null },
        ),
      );
      const updated = res?.data?.task ?? res?.data;
      if (updated) {
        const { mapTask } = await import('../services/task.service');
        this.task.set(mapTask({ ...updated, spaceId: t.spaceId }));
      } else {
        // Optimistic update
        const member = userId ? this.orgMembers().find((m: any) => (m.userId?._id ?? m._id) === userId) : null;
        const name = member ? (member.userId?.username ?? member.username ?? '') : '';
        this.task.update(tk => tk ? { ...tk, assignee: name, assigneeId: userId ?? '' } : tk);
      }
    } catch { /* ignore */ }
    finally { this.assigningUser.set(false); }
  }

  memberName(m: any): string {
    const u = m.userId ?? m;
    return u.username ?? u.email?.split('@')[0] ?? 'Unknown';
  }
  memberId(m: any): string {
    return m.userId?._id ?? m._id ?? m;
  }

  // ── Dependencies ─────────────────────────────────────────
  private depBase(): string | null {
    const t = this.task();
    if (!t?.spaceId || !this.orgId) return null;
    return `${BASE}/org/${this.orgId}/spaces/${t.spaceId}/tasks/${this.taskId}`;
  }

  async loadDependencies(taskId: string) {
    const t = this.task();
    if (!t?.spaceId || !this.orgId) return;
    this.depsLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(
          `${BASE}/org/${this.orgId}/spaces/${t.spaceId}/tasks/${taskId}/dependencies`
        ),
      );
      const raw = res?.data?.blockedBy ?? res?.data?.blockers ?? res?.data?.dependencies ?? res?.data ?? [];
      this.dependencies.set(Array.isArray(raw) ? raw : []);
    } catch { /* optional */ }
    finally { this.depsLoading.set(false); }
  }

  async addDependency() {
    const blockerId = this.selectedBlockerId();
    const base = this.depBase();
    if (!blockerId || !base) return;
    this.addingDep.set(true);
    try {
      await firstValueFrom(
        this.http.post(`${base}/dependencies`, { blockerId }),
      );
      await this.loadDependencies(this.taskId);
      this.selectedBlockerId.set('');
      this.showAddDep.set(false);
    } catch { /* ignore */ }
    finally { this.addingDep.set(false); }
  }

  async removeDependency(blockerId: string) {
    const base = this.depBase();
    if (!base) return;
    try {
      await firstValueFrom(
        this.http.delete(`${base}/dependencies/${blockerId}`),
      );
      this.dependencies.update(list => list.filter(d => (d._id ?? d.taskId?._id ?? d.taskId) !== blockerId));
    } catch { /* ignore */ }
  }

  depTitle(d: any): string {
    return d.title ?? d.taskId?.title ?? d.blocker?.title ?? 'Unknown task';
  }
  depId(d: any): string {
    return d._id ?? d.taskId?._id ?? d.taskId ?? d.blocker?._id ?? '';
  }

  // ── Subtasks ─────────────────────────────────────────────
  async loadSubtasks(taskId: string) {
    const t = this.task();
    if (!t?.spaceId || !this.orgId) return;
    this.subtasksLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(
          `${BASE}/org/${this.orgId}/spaces/${t.spaceId}/tasks/${taskId}/children`
        ),
      );
      const raw = res?.data?.tasks ?? res?.data?.children ?? res?.data ?? [];
      this.subtasks.set(Array.isArray(raw) ? raw : []);
    } catch { /* optional */ }
    finally { this.subtasksLoading.set(false); }
  }

  async addSubtask() {
    const title = this.newSubtaskTitle().trim();
    const t = this.task();
    if (!title || !t?.spaceId) return;
    this.addingSubtask.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{ data: any }>(
          `${BASE}/org/${this.orgId}/spaces/${t.spaceId}/tasks`,
          { title, parentTaskId: this.taskId },
        ),
      );
      const subtask = res?.data?.task ?? res?.data;
      if (subtask) this.subtasks.update(list => [...list, subtask]);
      this.newSubtaskTitle.set('');
    } catch { /* ignore */ }
    finally { this.addingSubtask.set(false); }
  }

  subtaskTitle(s: any): string { return s.title ?? 'Untitled'; }
  subtaskStatus(s: any): string { return s.status ?? 'todo'; }

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'yesterday';
    return `${days}d ago`;
  }

  priorityColor(p: string): string {
    const map: Record<string, string> = {
      highest: '#ef4444',
      high: '#f97316',
      medium: '#f59e0b',
      low: '#10b981',
      lowest: '#06b6d4',
    };
    return map[p] ?? '#6b7280';
  }
  statusColor(s: string): string {
    const map: Record<string, string> = {
      todo: '#9ca3af',
      inprogress: '#6366f1',
      inreview: '#f59e0b',
      done: '#10b981',
    };
    return map[s] ?? '#9ca3af';
  }
  statusLabel(s: string): string {
    const map: Record<string, string> = {
      todo: 'To Do',
      inprogress: 'In Progress',
      inreview: 'In Review',
      done: 'Done',
    };
    return map[s] ?? s;
  }
  workTypeIcon(w: string): string {
    const map: Record<string, string> = { task: '✓', feature: '★', bug: '🐛', epic: '⚡' };
    return map[w] ?? '•';
  }
}
