import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BASE, AuthService } from '../services/auth.service';

interface ActivityItem {
  _id?: string;
  actorId?: { _id?: string; username?: string; fullName?: string; avatar?: string };
  spaceId?: string;
  entityType?: string;
  entityId?: any;
  action?: string;
  meta?: any;
  createdAt: string;
}
interface ActivityGroup { date: string; activities: ActivityItem[]; }

@Component({
  selector: 'app-activity',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './activity.html',
  styleUrls: ['./activity.css'],
})
export class ActivityComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  groups   = signal<ActivityGroup[]>([]);
  loading  = signal(true);
  error    = signal('');
  page     = signal(1);
  total    = signal(0);
  loaded   = signal(0);
  hasMore  = computed(() => this.loaded() < this.total());

  readonly filters = [
    { key: '',        label: 'All' },
    { key: 'task',    label: 'Tasks' },
    { key: 'sprint',  label: 'Sprints' },
    { key: 'comment', label: 'Comments' },
    { key: 'member',  label: 'Members' },
    { key: 'space',   label: 'Spaces' },
  ];
  activeFilter = signal('');

  get orgId(): string | undefined { return this.auth.currentUser()?.orgId; }

  ngOnInit() { this.load(); }

  setFilter(key: string) {
    if (this.activeFilter() === key) return;
    this.activeFilter.set(key);
    this.page.set(1);
    this.load();
  }

  async load(append = false) {
    if (!this.orgId) { this.loading.set(false); this.error.set('You must belong to an organization to view activity.'); return; }
    if (!append) this.loading.set(true);
    this.error.set('');
    try {
      const params: any = { page: String(this.page()), limit: '20' };
      if (this.activeFilter()) params.entityType = this.activeFilter();
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(`${BASE}/org/${this.orgId}/activity`, { params }),
      );
      const incoming: ActivityGroup[] = res?.data?.groupedByDate ?? [];
      const items: ActivityItem[] = res?.data?.items ?? [];
      if (append) {
        this.groups.update(prev => this.mergeGroups(prev, incoming));
      } else {
        this.groups.set(incoming);
      }
      this.total.set(res?.data?.total ?? items.length);
      this.loaded.update(n => append ? n + items.length : items.length);
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to load activity.');
    } finally {
      this.loading.set(false);
    }
  }

  loadMore() {
    this.page.update(p => p + 1);
    this.load(true);
  }

  private mergeGroups(prev: ActivityGroup[], next: ActivityGroup[]): ActivityGroup[] {
    const map = new Map<string, ActivityItem[]>();
    for (const g of prev) map.set(g.date, [...g.activities]);
    for (const g of next) {
      const existing = map.get(g.date);
      if (existing) existing.push(...g.activities);
      else map.set(g.date, [...g.activities]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([date, activities]) => ({ date, activities }));
  }

  // ── Display helpers ────────────────────────────────────────
  actorName(it: ActivityItem): string {
    const a = it.actorId ?? {};
    return a.fullName || a.username || 'Someone';
  }
  actorInitial(it: ActivityItem): string {
    return this.actorName(it).charAt(0).toUpperCase();
  }
  actionVerb(it: ActivityItem): string {
    return (it.action ?? '').replace(/_/g, ' ');
  }
  entityLabel(it: ActivityItem): string {
    const e = it.entityId;
    if (e && typeof e === 'object') return e.title ?? e.name ?? '';
    return it.meta?.title ?? it.meta?.name ?? '';
  }
  icon(it: ActivityItem): string {
    const a = it.action ?? '';
    if (a.includes('created') || a.includes('added'))  return 'M12 4.5v15m7.5-7.5h-15';
    if (a.includes('deleted') || a.includes('removed')) return 'M6 18 18 6M6 6l12 12';
    if (a.includes('closed') || a.includes('completed') || a.includes('done'))
      return 'M4.5 12.75l6 6 9-13.5';
    if (a.includes('comment')) return 'M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z';
    if (a.includes('sprint')) return 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z';
    return 'M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z';
  }
  iconClass(it: ActivityItem): string {
    const a = it.action ?? '';
    if (a.includes('created') || a.includes('added'))  return 'act-icon-add';
    if (a.includes('deleted') || a.includes('removed')) return 'act-icon-del';
    if (a.includes('closed') || a.includes('completed') || a.includes('done')) return 'act-icon-done';
    return 'act-icon-neutral';
  }
  dayLabel(date: string): string {
    const d = new Date(date + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yest = new Date(today); yest.setDate(yest.getDate() - 1);
    if (d.getTime() === today.getTime()) return 'Today';
    if (d.getTime() === yest.getTime()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  }
  time(dt: string): string {
    return new Date(dt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
}
