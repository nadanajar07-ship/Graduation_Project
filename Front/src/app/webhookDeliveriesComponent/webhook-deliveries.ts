import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BASE, AuthService } from '../services/auth.service';

interface Subscription { _id: string; name?: string; targetUrl?: string; isActive?: boolean; }
interface Delivery {
  _id: string;
  subscriptionId?: Subscription | string | null;
  organizationId?: string;
  event: string;
  payload?: any;
  status: 'pending' | 'delivered' | 'failed' | 'dead';
  attempts: number;
  lastStatusCode?: number | null;
  lastError?: string | null;
  deliveredAt?: string | null;
  nextAttemptAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}
interface StatusCounts { pending: number; delivered: number; failed: number; dead: number; }

@Component({
  selector: 'app-webhook-deliveries',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './webhook-deliveries.html',
  styleUrls: ['./webhook-deliveries.css'],
})
export class WebhookDeliveriesComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  deliveries   = signal<Delivery[]>([]);
  loading      = signal(true);
  error        = signal('');
  page         = signal(1);
  pages        = signal(1);
  total        = signal(0);
  statusCounts = signal<StatusCounts>({ pending: 0, delivered: 0, failed: 0, dead: 0 });

  // Webhook (subscription) filter — populated from the org's webhooks
  subscriptions = signal<Subscription[]>([]);
  activeSub     = signal('');

  readonly statusTabs = [
    { key: '',          label: 'All' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'failed',    label: 'Failed' },
    { key: 'pending',   label: 'Pending' },
    { key: 'dead',      label: 'Dead' },
  ];
  activeStatus = signal('');

  // Expanded delivery (to show payload / error details)
  expandedId = signal<string | null>(null);

  get orgId(): string | undefined { return this.auth.currentUser()?.orgId; }

  countFor = computed(() => (key: string) => {
    const c = this.statusCounts();
    if (!key) return this.total();
    return (c as any)[key] ?? 0;
  });

  ngOnInit() {
    this.loadSubscriptions();
    this.load();
  }

  setStatus(key: string) {
    if (this.activeStatus() === key) return;
    this.activeStatus.set(key);
    this.page.set(1);
    this.load();
  }

  setSub(id: string) {
    this.activeSub.set(id);
    this.page.set(1);
    this.load();
  }

  async loadSubscriptions() {
    if (!this.orgId) return;
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(`${BASE}/org/${this.orgId}/webhooks`),
      );
      this.subscriptions.set(res?.data?.items ?? []);
    } catch {
      // Non-fatal — the webhook filter dropdown just stays empty.
    }
  }

  async load() {
    if (!this.orgId) {
      this.loading.set(false);
      this.error.set('You must belong to an organization to view webhook deliveries.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const params: any = { page: String(this.page()), limit: '20' };
      if (this.activeStatus()) params.status = this.activeStatus();
      if (this.activeSub())    params.subscriptionId = this.activeSub();

      const res = await firstValueFrom(
        this.http.get<{ data: any }>(`${BASE}/org/${this.orgId}/webhooks/deliveries`, { params }),
      );
      this.deliveries.set(res?.data?.items ?? []);
      this.total.set(res?.data?.total ?? 0);
      this.pages.set(res?.data?.pages ?? 1);
      if (res?.data?.statusCounts) this.statusCounts.set(res.data.statusCounts);
    } catch (err: any) {
      this.error.set(
        err?.status === 403
          ? 'Only organization owners and admins can view webhook deliveries.'
          : err?.error?.message || 'Failed to load webhook deliveries.',
      );
      this.deliveries.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  prevPage() { if (this.page() > 1) { this.page.update(p => p - 1); this.load(); } }
  nextPage() { if (this.page() < this.pages()) { this.page.update(p => p + 1); this.load(); } }

  toggleExpand(id: string) {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  // ── Display helpers ───────────────────────────────────────────
  subName(d: Delivery): string {
    const s = d.subscriptionId;
    if (s && typeof s === 'object') return s.name || 'Webhook';
    return 'Webhook';
  }
  subUrl(d: Delivery): string {
    const s = d.subscriptionId;
    return s && typeof s === 'object' ? (s.targetUrl || '') : '';
  }
  statusClass(d: Delivery): string { return `wd-st-${d.status}`; }
  when(dt?: string | null): string {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
  payloadJson(d: Delivery): string {
    try { return JSON.stringify(d.payload ?? {}, null, 2); }
    catch { return String(d.payload ?? ''); }
  }
}
