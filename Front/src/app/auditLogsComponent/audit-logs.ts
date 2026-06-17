import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BASE, AuthService } from '../services/auth.service';

interface AuditActor {
  _id?: string;
  username?: string;
  fullName?: string;
  avatar?: string;
  email?: string;
}
interface AuditLog {
  _id: string;
  actorId?: AuditActor | null;
  orgId?: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
  outcome: 'success' | 'failure' | 'denied';
  createdAt: string;
}

@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './audit-logs.html',
  styleUrls: ['./audit-logs.css'],
})
export class AuditLogsComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  logs    = signal<AuditLog[]>([]);
  loading = signal(true);
  error   = signal('');
  page    = signal(1);
  pages   = signal(1);
  total   = signal(0);

  // Filters
  readonly actionFilters = [
    { key: '',     label: 'All' },
    { key: 'auth', label: 'Auth' },
    { key: 'org',  label: 'Organization' },
    { key: 'team', label: 'Teams' },
  ];
  activeAction = signal('');
  outcome      = signal('');
  search       = signal('');
  fromDate     = signal('');
  toDate       = signal('');

  hasFilters = computed(() =>
    !!(this.activeAction() || this.outcome() || this.search() || this.fromDate() || this.toDate()),
  );

  get orgId(): string | undefined { return this.auth.currentUser()?.orgId; }

  ngOnInit() { this.load(); }

  setAction(key: string) {
    if (this.activeAction() === key) return;
    this.activeAction.set(key);
    this.page.set(1);
    this.load();
  }

  setOutcome(val: string) {
    this.outcome.set(val);
    this.page.set(1);
    this.load();
  }

  applyFilters() {
    this.page.set(1);
    this.load();
  }

  clearFilters() {
    this.activeAction.set('');
    this.outcome.set('');
    this.search.set('');
    this.fromDate.set('');
    this.toDate.set('');
    this.page.set(1);
    this.load();
  }

  async load() {
    if (!this.orgId) {
      this.loading.set(false);
      this.error.set('You must belong to an organization to view audit logs.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const params: any = { orgId: this.orgId, page: String(this.page()), limit: '20' };
      if (this.activeAction()) params.action = this.activeAction();
      if (this.outcome())      params.outcome = this.outcome();
      if (this.search().trim()) params.search = this.search().trim();
      if (this.fromDate())     params.from = new Date(this.fromDate()).toISOString();
      if (this.toDate())       params.to = new Date(this.toDate() + 'T23:59:59').toISOString();

      const res = await firstValueFrom(
        this.http.get<{ data: any }>(`${BASE}/audit-logs`, { params }),
      );
      this.logs.set(res?.data?.items ?? []);
      this.total.set(res?.data?.total ?? 0);
      this.pages.set(res?.data?.pages ?? 1);
    } catch (err: any) {
      this.error.set(
        err?.status === 403
          ? 'Only organization owners and admins can view audit logs.'
          : err?.error?.message || 'Failed to load audit logs.',
      );
      this.logs.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  prevPage() { if (this.page() > 1) { this.page.update(p => p - 1); this.load(); } }
  nextPage() { if (this.page() < this.pages()) { this.page.update(p => p + 1); this.load(); } }

  // ── Display helpers ───────────────────────────────────────────
  actorName(l: AuditLog): string {
    const a = l.actorId;
    if (!a) return 'System';
    return a.fullName || a.username || a.email || 'Unknown user';
  }
  actorInitial(l: AuditLog): string {
    const n = this.actorName(l);
    return n === 'System' ? '⚙' : n.charAt(0).toUpperCase();
  }
  /** Human-readable action: "org.member.role_change" → "Member role change" */
  actionLabel(l: AuditLog): string {
    const parts = (l.action || '').split('.');
    const tail = parts.slice(1).join(' ') || l.action;
    return tail.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
  }
  /** Top-level domain for the colored category badge. */
  domain(l: AuditLog): string {
    return (l.action || '').split('.')[0] || 'event';
  }
  domainClass(l: AuditLog): string {
    return `aud-dom-${this.domain(l)}`;
  }
  outcomeClass(l: AuditLog): string {
    return `aud-out-${l.outcome}`;
  }
  target(l: AuditLog): string {
    if (!l.targetType) return '';
    const name = l.meta?.name || l.meta?.title || l.meta?.slug;
    return name ? `${l.targetType}: ${name}` : l.targetType;
  }
  when(dt: string): string {
    return new Date(dt).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
}
