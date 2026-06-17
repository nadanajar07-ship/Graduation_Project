import { Component, inject, signal, input, output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { TaskService, WorkType, TaskPriority } from '../services/task.service';
import { SpaceService, Space } from '../services/space.service';
import { AuthService, BASE } from '../services/auth.service';

const LABELS = ['frontend','backend','auth','design','testing','devops','docs','security','database','realtime','setup','ui'];

@Component({
  selector: 'app-create-task',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-task.html',
  styleUrls: ['./create-task.css'],
})
export class CreateTaskComponent implements OnInit {
  private taskService  = inject(TaskService);
  private spaceService = inject(SpaceService);
  private auth         = inject(AuthService);
  private http         = inject(HttpClient);
  private fb           = inject(FormBuilder);

  spaceId = input<string>('');
  close   = output<void>();

  user           = this.auth.currentUser;
  allLabels      = LABELS;
  selectedLabels = signal<string[]>([]);
  isSubmitting   = signal(false);
  errorMsg       = signal<string | null>(null);

  // Space selector (shown when no spaceId is provided)
  availableSpaces  = signal<Space[]>([]);
  selectedSpaceId  = signal<string>('');
  needsSpaceSelect = signal(false);

  // Org members for assignee dropdown
  orgMembers        = signal<{ _id: string; name: string }[]>([]);
  selectedAssigneeId = signal<string>('');

  // Sprint dropdown (loaded from backend)
  sprintOptions     = signal<{ _id: string; name: string }[]>([]);
  selectedSprintId  = signal<string>('');

  workTypes: { value: WorkType; label: string; icon: string; color: string }[] = [
    { value: 'task',    label: 'Task',    icon: '✓',  color: '#6366f1' },
    { value: 'feature', label: 'Feature', icon: '★',  color: '#f59e0b' },
    { value: 'bug',     label: 'Bug',     icon: '🐛', color: '#ef4444' },
    { value: 'epic',    label: 'Epic',    icon: '⚡', color: '#8b5cf6' },
  ];

  priorities: { value: TaskPriority; label: string; color: string }[] = [
    { value: 'highest', label: 'Highest', color: '#ef4444' },
    { value: 'high',    label: 'High',    color: '#f97316' },
    { value: 'medium',  label: 'Medium',  color: '#f59e0b' },
    { value: 'low',     label: 'Low',     color: '#10b981' },
    { value: 'lowest',  label: 'Lowest',  color: '#06b6d4' },
  ];

  form = this.fb.group({
    title:       ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
    workType:    ['task' as WorkType],
    priority:    ['medium' as TaskPriority],
    assignee:    [''],
    sprint:      [''],
    dueDate:     [''],
    estimated:   [0],
    component:   [''],
    parentId:    [''],
  });

  get title() { return this.form.get('title')!; }

  ngOnInit() {
    const sid = this.spaceId();
    const isValidId = sid && sid.length >= 20;

    if (!isValidId) {
      this.needsSpaceSelect.set(true);
      this.spaceService.loadSpaces().then(() => {
        this.availableSpaces.set(this.spaceService.spaces());
        if (this.availableSpaces().length > 0) {
          this.selectedSpaceId.set(this.availableSpaces()[0].id);
          this.loadSprints(this.availableSpaces()[0].id);
        }
      });
    } else {
      this.selectedSpaceId.set(sid);
      this.loadSprints(sid);
    }
    this.loadOrgMembers();
  }

  private async loadOrgMembers(): Promise<void> {
    const orgId = this.auth.currentUser()?.orgId;
    if (!orgId) return;
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: { members: any[] } }>(
          `${BASE}/org/${orgId}/members?page=1&limit=100`
        )
      );
      const members = (res?.data?.members ?? [])
        .map((m: any) => ({
          _id:  m.userId?._id ?? m.userId,
          name: m.userId?.username ?? m.userId?.fullName ?? m.userId?.email ?? 'Unknown',
        }))
        .filter((m: any) => m._id && m._id.length >= 20);
      this.orgMembers.set(members);
    } catch { /* non-critical */ }
  }

  private async loadSprints(spaceId: string): Promise<void> {
    const orgId = this.auth.currentUser()?.orgId;
    if (!orgId || !spaceId) return;
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(
          `${BASE}/org/${orgId}/spaces/${spaceId}/sprints`
        )
      );
      const items: any[] = res?.data?.items ?? res?.data?.sprints ?? [];
      this.sprintOptions.set(items.map((s: any) => ({ _id: s._id, name: s.name })));
    } catch { /* non-critical */ }
  }

  onAssigneeChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this.selectedAssigneeId.set(id);
    const member = this.orgMembers().find(m => m._id === id);
    this.form.patchValue({ assignee: member?.name ?? '' });
  }

  onSprintDropdownChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this.selectedSprintId.set(id);
    const sprint = this.sprintOptions().find(s => s._id === id);
    this.form.patchValue({ sprint: sprint?.name ?? '' });
  }

  assignToMe() {
    const me = this.auth.currentUser();
    this.selectedAssigneeId.set(me?._id ?? '');
    this.form.patchValue({ assignee: me?.fullName ?? me?.username ?? '' });
  }

  toggleLabel(label: string) {
    this.selectedLabels.update(l =>
      l.includes(label) ? l.filter(x => x !== label) : [...l, label]
    );
  }

  onSpaceChange(event: Event) {
    const id = (event.target as HTMLSelectElement).value;
    this.selectedSpaceId.set(id);
    this.sprintOptions.set([]);
    this.selectedSprintId.set('');
    this.loadSprints(id);
  }

  async onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    // Validate spaceId
    const targetSpaceId = this.selectedSpaceId();
    if (!targetSpaceId || targetSpaceId.length < 20) {
      this.errorMsg.set('Please select a space first.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMsg.set(null);

    const v = this.form.value;
    const assigneeName = v.assignee ?? '';
    const taskData = {
      title:           v.title!,
      description:     v.description ?? '',
      status:          'todo' as const,
      priority:        v.priority as TaskPriority,
      workType:        v.workType as WorkType,
      assignee:        assigneeName,
      assigneeId:      this.selectedAssigneeId() || undefined,
      assigneeInitial: (assigneeName || '?').charAt(0).toUpperCase(),
      assigneeColor:   '#6366f1',
      reporter:        this.user()?.fullName ?? '',
      spaceId:         targetSpaceId,
      sprint:          v.sprint ?? '',
      sprintId:        this.selectedSprintId() || undefined,
      dueDate:         v.dueDate ?? '',
      startDate:       new Date().toISOString(),
      estimated:       v.estimated ?? 0,
      logged:          0,
      progress:        0,
      labels:          this.selectedLabels(),
      parentId:        v.parentId ?? undefined,
      component:       v.component ?? '',
    };

    const result = await this.taskService.createTask(targetSpaceId, taskData);
    this.isSubmitting.set(false);

    if (result) {
      this.close.emit();
    } else {
      this.errorMsg.set('Failed to create task. Please try again.');
    }
  }
}