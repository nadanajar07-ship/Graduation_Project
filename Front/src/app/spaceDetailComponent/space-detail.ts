import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe, TitleCasePipe, SlicePipe , DatePipe } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { TaskService, Task, TaskStatus } from '../services/task.service';
import { SpaceService } from '../services/space.service';
import { AuthService, BASE } from '../services/auth.service';
import { CreateTaskComponent } from '../createTaskComponent/create-task';
import { CreateSprintComponent } from '../createSprintComponent/create-sprint';

@Component({
  selector: 'app-space-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    CreateTaskComponent,
    CreateSprintComponent,
    DecimalPipe,
    TitleCasePipe,
    SlicePipe,
    DatePipe,
  ],
  templateUrl: './space-detail.html',
  styleUrls: ['./space-detail.css'],
})
export class SpaceDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private spaceService = inject(SpaceService);
  taskService = inject(TaskService);

  space = signal<any>(null);
  activeTab = signal<'summary' | 'timeline' | 'backlog' | 'board' | 'calendar' | 'activity'>('summary');
  createTaskOpen = signal(false);
  createSprintOpen = signal(false);

  // Backend summary data (loaded from summary endpoints)
  summaryStatus = signal<any>(null);
  summaryPriority = signal<any>(null);
  summaryWorkload = signal<any>(null);
  summaryWorkType = signal<any>(null);

  private get orgId(): string {
    return this.auth.currentUser()?.orgId ?? '';
  }

  allTasks = computed(() => {
    const id = this.space()?.id;
    return id ? this.taskService.tasks().filter((t) => t.spaceId === id) : [];
  });

  todoTasks = computed(() => this.allTasks().filter((t) => t.status === 'todo'));
  inProgressTasks = computed(() => this.allTasks().filter((t) => t.status === 'inprogress'));
  inReviewTasks = computed(() => this.allTasks().filter((t) => t.status === 'inreview'));
  doneTasks = computed(() => this.allTasks().filter((t) => t.status === 'done'));

  backlogSearch = signal('');
  backlogSort = signal<'priority' | 'date' | 'title'>('priority');
  backlogFilter = signal<'all' | TaskStatus>('all');

  backlogItems = computed(() => {
    let items = this.allTasks();
    const q = this.backlogSearch().toLowerCase();
    if (q)
      items = items.filter(
        (t) => t.title.toLowerCase().includes(q) || t.labels.some((l) => l.includes(q)),
      );
    if (this.backlogFilter() !== 'all')
      items = items.filter((t) => t.status === this.backlogFilter());
    if (this.backlogSort() === 'priority') {
      const order: Record<string, number> = { highest: 0, high: 1, medium: 2, low: 3, lowest: 4 };
      items = [...items].sort((a, b) => (order[a.priority] ?? 5) - (order[b.priority] ?? 5));
    } else if (this.backlogSort() === 'title') {
      items = [...items].sort((a, b) => a.title.localeCompare(b.title));
    }
    return items;
  });

  sprints = computed(() => this.taskService.getSprints(this.space()?.id ?? ''));

  // ── Sprint objects (loaded from backend for CRUD operations) ──
  sprintObjects = signal<any[]>([]);

  getSprintObject(sprintName: string): any {
    return this.sprintObjects().find(s => s.name === sprintName) ?? null;
  }

  // ── Sprint Edit ───────────────────────────────────────────────
  editingSprintId = signal<string | null>(null);
  editSprintName  = signal('');
  editSprintGoal  = signal('');
  editSprintStart = signal('');
  editSprintEnd   = signal('');
  sprintEditError = signal('');
  savingSprint    = signal(false);

  startEditSprint(sprint: any): void {
    this.editingSprintId.set(sprint._id);
    this.editSprintName.set(sprint.name ?? '');
    this.editSprintGoal.set(sprint.goal ?? '');
    this.editSprintStart.set(sprint.startDate ? sprint.startDate.slice(0, 10) : '');
    this.editSprintEnd.set(sprint.endDate ? sprint.endDate.slice(0, 10) : '');
    this.sprintEditError.set('');
  }

  cancelEditSprint(): void {
    this.editingSprintId.set(null);
    this.sprintEditError.set('');
  }

  async saveSprintEdit(): Promise<void> {
    const id = this.editingSprintId();
    const spaceId = this.space()?.id;
    if (!id || !spaceId || !this.orgId) return;
    if (!this.editSprintName().trim()) {
      this.sprintEditError.set('Sprint name is required.');
      return;
    }
    this.savingSprint.set(true);
    this.sprintEditError.set('');
    try {
      const res = await firstValueFrom(
        this.http.patch<{ data: any }>(
          `${BASE}/org/${this.orgId}/spaces/${spaceId}/sprints/${id}`,
          {
            name:      this.editSprintName().trim(),
            goal:      this.editSprintGoal().trim() || undefined,
            startDate: this.editSprintStart() || undefined,
            endDate:   this.editSprintEnd() || undefined,
          }
        )
      );
      const updated = res?.data?.sprint ?? res?.data;
      if (updated) {
        this.sprintObjects.update(list => list.map(s => s._id === id ? { ...s, ...updated } : s));
      }
      this.editingSprintId.set(null);
    } catch (err: any) {
      this.sprintEditError.set(err?.error?.message || 'Failed to save sprint.');
    } finally {
      this.savingSprint.set(false);
    }
  }

  // ── Sprint Delete ─────────────────────────────────────────────
  deletingSprint = signal<string | null>(null);

  async deleteSprint(sprintId: string): Promise<void> {
    const spaceId = this.space()?.id;
    if (!spaceId || !this.orgId) return;
    if (!confirm('Delete this sprint? Tasks will move to backlog.')) return;
    this.deletingSprint.set(sprintId);
    try {
      await firstValueFrom(
        this.http.delete(`${BASE}/org/${this.orgId}/spaces/${spaceId}/sprints/${sprintId}`)
      );
      this.sprintObjects.update(list => list.filter(s => s._id !== sprintId));
    } catch (err: any) {
      console.error('[SpaceDetail] deleteSprint:', err?.error?.message);
    } finally {
      this.deletingSprint.set(null);
    }
  }

  // ── Sprint Status Update ──────────────────────────────────────
  async updateSprintStatus(sprintId: string, status: 'Active' | 'Closed'): Promise<void> {
    if (!this.orgId) return;
    try {
      // Status changes go through the dedicated endpoint so the backend's
      // lifecycle side-effects run (auto-closing other Active sprints in the
      // space + sprint_started/closed notification fan-out + activity log).
      const res = await firstValueFrom(
        this.http.patch<{ data: any }>(
          `${BASE}/sprints/${sprintId}/status`,
          { status }
        )
      );
      const updated = res?.data?.sprint ?? res?.data;
      if (updated) {
        this.sprintObjects.update(list => list.map(s => s._id === sprintId ? { ...s, ...updated } : s));
      }
      // Activating a sprint auto-closes the other Active sprint in this space
      // on the backend, so reload to reflect that demotion locally.
      if (status === 'Active') {
        const spaceId = this.space()?.id;
        if (spaceId) await this.loadSprintObjects(spaceId);
      }
    } catch (err: any) {
      console.error('[SpaceDetail] updateSprintStatus:', err?.error?.message);
    }
  }

  // ── Called after creating a new sprint ───────────────────────
  onSprintCreated(): void {
    const spaceId = this.space()?.id;
    if (!spaceId) return;
    // Reload tasks (which brings in the new sprint name) and sprint objects
    this.taskService.loadTasks(spaceId);
    this.loadSprintObjects(spaceId);
  }

  private async loadSprintObjects(spaceId: string): Promise<void> {
    if (!this.orgId) return;
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(
          `${BASE}/org/${this.orgId}/spaces/${spaceId}/sprints?limit=50`
        )
      );
      const items: any[] = res?.data?.items ?? res?.data?.sprints ?? res?.data ?? [];
      this.sprintObjects.set(Array.isArray(items) ? items : []);
    } catch { /* non-critical */ }
  }

  timelineAssignee = signal('all');
  assignees = computed(() => {
    const all = this.allTasks().map((t) => t.assignee);
    return ['all', ...new Set(all)];
  });
  timelineTasks = computed(() => {
    const a = this.timelineAssignee();
    return a === 'all' ? this.allTasks() : this.allTasks().filter((t) => t.assignee === a);
  });
  timelineSearch = signal('');
  filteredTimeline = computed(() => {
    const q = this.timelineSearch().toLowerCase();
    return q
      ? this.timelineTasks().filter((t) => t.title.toLowerCase().includes(q))
      : this.timelineTasks();
  });

  // Use backend summary data if available, fall back to client-side
  statusCounts = computed(() => {
    const s = this.summaryStatus();
    if (s) {
      return {
        todo: s.byStatus?.Todo ?? 0,
        inprogress: s.byStatus?.InProgress ?? 0,
        inreview: 0,
        done: s.byStatus?.Done ?? 0,
        total: s.totalTasks ?? 0,
      };
    }
    return {
      todo: this.todoTasks().length,
      inprogress: this.inProgressTasks().length,
      inreview: this.inReviewTasks().length,
      done: this.doneTasks().length,
      total: this.allTasks().length,
    };
  });

  priorityCounts = computed(() => {
    const p = this.summaryPriority();
    if (p) {
      return {
        highest: p.byPriority?.Urgent ?? 0,
        high: p.byPriority?.High ?? 0,
        medium: p.byPriority?.Medium ?? 0,
        low: p.byPriority?.Low ?? 0,
        lowest: 0,
      };
    }
    const tasks = this.allTasks();
    return {
      highest: tasks.filter((t) => t.priority === 'highest').length,
      high: tasks.filter((t) => t.priority === 'high').length,
      medium: tasks.filter((t) => t.priority === 'medium').length,
      low: tasks.filter((t) => t.priority === 'low').length,
      lowest: tasks.filter((t) => t.priority === 'lowest').length,
    };
  });

  workTypeCounts = computed(() => {
    const w = this.summaryWorkType();
    if (w) {
      return {
        task: w.byType?.Task ?? 0,
        feature: w.byType?.Story ?? 0,
        bug: w.byType?.Bug ?? 0,
        epic: w.byType?.Epic ?? 0,
      };
    }
    const tasks = this.allTasks();
    return {
      task: tasks.filter((t) => t.workType === 'task').length,
      feature: tasks.filter((t) => t.workType === 'feature').length,
      bug: tasks.filter((t) => t.workType === 'bug').length,
      epic: tasks.filter((t) => t.workType === 'epic').length,
    };
  });

  componentCounts = computed(() => {
    const map: Record<string, number> = {};
    this.allTasks().forEach((t) => {
      map[t.component] = (map[t.component] ?? 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  });

  recentActivity = computed(() =>
    [...this.allTasks()].sort((a, b) => b.logged - a.logged).slice(0, 5),
  );

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    const tryLoad = () => {
      const s = this.spaceService.getById(id);
      if (s) {
        this.space.set(s);
        this.spaceService.visitSpace(id);
        this.taskService.loadTasks(id);
        this.loadSummaries(id);
        this.loadSprintObjects(id);
        return true;
      }
      return false;
    };

    if (!tryLoad()) {
      // Spaces not loaded yet — load them first, then retry
      this.spaceService.loadSpaces().then(() => {
        if (!tryLoad()) {
          this.router.navigate(['/dashboard/spaces']);
        }
      });
    }
  }

  // ── Load backend summaries for the Summary tab ────────────
  private async loadSummaries(spaceId: string) {
    if (!this.orgId) return;
    const base = `${BASE}/org/${this.orgId}/spaces/${spaceId}/summary`;

    try {
      const [statusRes, priorityRes, workTypeRes] = await Promise.all([
        firstValueFrom(this.http.get<{ data: any }>(`${base}/status`)).catch(() => null),
        firstValueFrom(this.http.get<{ data: any }>(`${base}/priority`)).catch(() => null),
        firstValueFrom(this.http.get<{ data: any }>(`${base}/work-type`)).catch(() => null),
      ]);

      if (statusRes?.data) this.summaryStatus.set(statusRes.data);
      if (priorityRes?.data) this.summaryPriority.set(priorityRes.data);
      if (workTypeRes?.data) this.summaryWorkType.set(workTypeRes.data);
    } catch {
      // Summaries are optional — fall back to client-side computation
    }
    this.loadExtraSummaries(spaceId);
    this.loadActivity(spaceId, false);
  }

  toggleStar() {
    if (!this.space()) return;
    this.spaceService.toggleStar(this.space()!.id);
    this.space.set(this.spaceService.getById(this.space()!.id) ?? null);
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
  statusLabel(s: string): string {
    const map: Record<string, string> = {
      todo: 'To Do',
      inprogress: 'In Progress',
      inreview: 'In Review',
      done: 'Done',
    };
    return map[s] ?? s;
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
  getPriorityCount(priority: string): number {
    return (this.priorityCounts() as any)[priority] ?? 0;
  }
  workTypeIcon(w: string): string {
    const map: Record<string, string> = { task: '✓', feature: '★', bug: '🐛', epic: '⚡' };
    return map[w] ?? '•';
  }
  getAssigneeTaskCount(a: string): number {
    return this.allTasks().filter((t) => t.assignee === a).length;
  }
  getAssigneeTaskPercent(a: string): string {
    return (this.getAssigneeTaskCount(a) / (this.statusCounts().total || 1)) * 100 + '%';
  }
  getTimelineBySprintCount(sprint: string): number {
    return this.filteredTimeline().filter((t) => t.sprint === sprint).length;
  }
  getTimelineBySprintTasks(sprint: string) {
    return this.filteredTimeline().filter((t) => t.sprint === sprint);
  }
  getSprintTasks(sprint: string) {
    return this.backlogItems().filter((t) => t.sprint === sprint);
  }

  // ── Board ──────────────────────────────────────────────────
  activeBoardSprint = signal('');
  boardDraggedId = signal<string | null>(null);
  boardDragOverCol = signal<TaskStatus | null>(null);

  currentBoardSprint = computed(
    () => this.activeBoardSprint() || (this.sprints()[this.sprints().length - 1] ?? ''),
  );
  boardTasks = computed(() =>
    this.allTasks().filter((t) => t.sprint === this.currentBoardSprint()),
  );

  getBoardColTasks(status: TaskStatus): Task[] {
    return this.boardTasks().filter((t) => t.status === status);
  }
  onBoardDragStart(id: string, e: DragEvent) {
    this.boardDraggedId.set(id);
    e.dataTransfer?.setData('text/plain', id);
  }
  onBoardDragEnd() {
    this.boardDraggedId.set(null);
    this.boardDragOverCol.set(null);
  }
  onBoardDragOver(status: TaskStatus, e: DragEvent) {
    e.preventDefault();
    this.boardDragOverCol.set(status);
  }
  onBoardDrop(status: TaskStatus, e: DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer?.getData('text/plain') ?? this.boardDraggedId();
    if (id) this.taskService.updateStatus(id, status);
    this.boardDraggedId.set(null);
    this.boardDragOverCol.set(null);
  }

  // ── Calendar ───────────────────────────────────────────────
  calendarDate = signal(new Date());
  calendarFilter = signal<{ assignee: string; type: string; status: string }>({
    assignee: 'all',
    type: 'all',
    status: 'all',
  });
  selectedDay = signal<Date | null>(null);
  draggedCalTask = signal<string | null>(null);

  calendarYear = computed(() => this.calendarDate().getFullYear());
  calendarMonth = computed(() => this.calendarDate().getMonth());
  calendarMonthLabel = computed(() =>
    this.calendarDate().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  );
  calendarDays = computed(() => {
    const year = this.calendarYear(),
      month = this.calendarMonth();
    const first = new Date(year, month, 1).getDay();
    const total = new Date(year, month + 1, 0).getDate();
    const days: (Date | null)[] = [];
    for (let i = 0; i < first; i++) days.push(null);
    for (let d = 1; d <= total; d++) days.push(new Date(year, month, d));
    while (days.length % 7 !== 0) days.push(null);
    return days;
  });
  calendarTasks = computed(() => {
    let tasks = this.allTasks();
    const f = this.calendarFilter();
    if (f.assignee !== 'all') tasks = tasks.filter((t) => t.assignee === f.assignee);
    if (f.type !== 'all') tasks = tasks.filter((t) => t.workType === f.type);
    if (f.status !== 'all') tasks = tasks.filter((t) => t.status === f.status);
    return tasks;
  });
  unscheduledTasks = computed(() =>
    this.calendarTasks().filter((t) => !t.dueDate || t.dueDate.trim() === ''),
  );
  getTasksForDay(day: Date): Task[] {
    return this.calendarTasks().filter((t) => {
      if (!t.dueDate) return false;

      // ✅ FIX: dueDate بعد الـ mapping بييجي كـ "Jan 5" أو ISO string
      // بنحاول نعمل parse بطريقتين
      let parsed: Date;

      // لو ISO format
      if (t.dueDate.includes('T') || t.dueDate.includes('-')) {
        parsed = new Date(t.dueDate);
      } else {
        // لو "Jan 5" format — بنضيف السنة الحالية
        parsed = new Date(`${t.dueDate} ${this.calendarYear()}`);
      }

      if (isNaN(parsed.getTime())) return false;

      return (
        parsed.getFullYear() === day.getFullYear() &&
        parsed.getMonth() === day.getMonth() &&
        parsed.getDate() === day.getDate()
      );
    });
  }

  isToday(day: Date): boolean {
    const t = new Date();
    return (
      day.getFullYear() === t.getFullYear() &&
      day.getMonth() === t.getMonth() &&
      day.getDate() === t.getDate()
    );
  }
  prevMonth() {
    const d = this.calendarDate();
    this.calendarDate.set(new Date(d.getFullYear(), d.getMonth() - 1, 1));
    this.selectedDay.set(null);
  }
  nextMonth() {
    const d = this.calendarDate();
    this.calendarDate.set(new Date(d.getFullYear(), d.getMonth() + 1, 1));
    this.selectedDay.set(null);
  }
  selectDay(day: Date | null) {
    if (!day) return;
    this.selectedDay.set(this.selectedDay()?.toDateString() === day.toDateString() ? null : day);
  }
  onCalDragStart(taskId: string) {
    this.draggedCalTask.set(taskId);
  }
  onCalDrop(day: Date, event: DragEvent) {
    event.preventDefault();
    const id = this.draggedCalTask();
    if (!id) return;
    this.taskService.updateDueDate(id, day.toISOString());
    this.draggedCalTask.set(null);
  }

  // ── Extra Summary Data ─────────────────────────────────────────
  summaryEpicProgress = signal<any>(null);
  summaryBacklog      = signal<any>(null);

  private async loadExtraSummaries(spaceId: string): Promise<void> {
    if (!this.orgId) return;
    const base = `${BASE}/org/${this.orgId}/spaces/${spaceId}/summary`;
    const [epicRes, backlogRes] = await Promise.allSettled([
      firstValueFrom(this.http.get<{ data: any }>(`${base}/epics`)).catch(() => null),
      firstValueFrom(this.http.get<{ data: any }>(`${base}/backlog`)).catch(() => null),
    ]);
    if (epicRes.status === 'fulfilled' && epicRes.value?.data)
      this.summaryEpicProgress.set(epicRes.value.data);
    if (backlogRes.status === 'fulfilled' && backlogRes.value?.data)
      this.summaryBacklog.set(backlogRes.value.data);
  }

  // ── Activity Tab ───────────────────────────────────────────────
  activityLoading = signal(false);
  activityItems   = signal<any[]>([]);
  activityHasMore = signal(false);
  private activityPage = 1;

  openActivityTab(): void {
    this.activeTab.set('summary');
    const spaceId = this.space()?.id;
    if (spaceId && this.activityItems().length === 0) {
      this.loadActivity(spaceId, false);
    }
  }

  async loadActivity(spaceId: string, loadMore = false): Promise<void> {
    if (!this.orgId || this.activityLoading()) return;
    if (!loadMore) { this.activityPage = 1; this.activityItems.set([]); }
    this.activityLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(
          `${BASE}/org/${this.orgId}/activity`,
          { params: { spaceId, page: String(this.activityPage), limit: '20' } }
        )
      );
      const items: any[] = res?.data?.items ?? res?.data ?? [];
      if (loadMore) {
        this.activityItems.update(prev => [...prev, ...items]);
      } else {
        this.activityItems.set(items);
      }
      this.activityHasMore.set(this.activityItems().length < (res?.data?.total ?? items.length));
      this.activityPage++;
    } catch { /* optional */ }
    finally { this.activityLoading.set(false); }
  }

  activityIcon(action: string): string {
    const map: Record<string, string> = {
      task_created: '✓', task_updated: '✏', task_deleted: '🗑',
      sprint_created: '⚡', sprint_started: '▶', sprint_closed: '✅',
      comment_added: '💬', member_added: '👤',
    };
    return map[action] ?? '•';
  }

  activityLabel(item: any): string {
    const user   = item.user?.username ?? item.userId?.username ?? 'Someone';
    const entity = item.entity?.title  ?? item.entityId?.title  ?? '';
    const action = (item.action ?? '').replace(/_/g, ' ');
    return entity ? `${user} ${action}: ${entity}` : `${user} ${action}`;
  }

  // ── Workflow ───────────────────────────────────────────────────
  workflowLoading   = signal(false);
  workflowLoaded    = signal(false);
  showWorkflowPanel = signal(false);
  spaceWorkflow     = signal<any>(null);

  async loadWorkflow(): Promise<void> {
    const spaceId = this.space()?.id;
    if (!spaceId || !this.orgId || this.workflowLoaded()) return;
    this.workflowLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(
          `${BASE}/org/${this.orgId}/spaces/${spaceId}/workflow`
        )
      );
      this.spaceWorkflow.set(res?.data?.workflow ?? res?.data ?? null);
      this.workflowLoaded.set(true);
    } catch { /* optional */ }
    finally { this.workflowLoading.set(false); }
  }

  async deleteWorkflow(): Promise<void> {
    const spaceId = this.space()?.id;
    if (!spaceId || !this.orgId) return;
    if (!confirm('Reset workflow to default?')) return;
    try {
      await firstValueFrom(
        this.http.delete(`${BASE}/org/${this.orgId}/spaces/${spaceId}/workflow`)
      );
      this.spaceWorkflow.set(null);
      this.workflowLoaded.set(false);
      this.showWorkflowPanel.set(false);
    } catch { /* ignore */ }
  }

  workflowCategoryColor(category: string): string {
    const map: Record<string, string> = {
      'not-started': '#9ca3af', 'active': '#6366f1',
      'done': '#10b981',        'cancelled': '#ef4444',
    };
    return map[(category ?? '').toLowerCase()] ?? '#6b7280';
  }

  // ── Space Views ────────────────────────────────────────────────
  viewsLoaded = signal(false);
  spaceViews  = signal<any[]>([]);

  async loadSpaceViews(): Promise<void> {
    const spaceId = this.space()?.id;
    if (!spaceId || !this.orgId || this.viewsLoaded()) return;
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(
          `${BASE}/org/${this.orgId}/spaces/${spaceId}/views`
        )
      );
      const items: any[] = res?.data?.items ?? res?.data ?? [];
      this.spaceViews.set(Array.isArray(items) ? items : []);
      this.viewsLoaded.set(true);
    } catch { /* optional */ }
  }
}
