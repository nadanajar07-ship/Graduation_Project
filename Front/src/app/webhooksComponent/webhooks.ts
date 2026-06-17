import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, BASE } from '../services/auth.service';

const SUPPORTED_EVENTS = [
  'task.created', 'task.updated', 'task.status_changed', 'task.assigned', 'task.deleted',
  'comment.added', 'sprint.started', 'sprint.closed',
  'org.member.join', 'org.member.remove',
  'team.member.add', 'team.member.remove',
  'chat.message.sent', 'call.started', 'call.ended',
];

@Component({
  selector: 'app-webhooks',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './webhooks.html',
  styleUrls: ['./webhooks.css'],
})
export class WebhooksComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  webhooks = signal<any[]>([]);
  loading  = signal(true);
  error    = signal('');

  // Create
  showCreate   = signal(false);
  creating     = signal(false);
  createError  = signal('');
  newName      = signal('');
  newUrl       = signal('');
  newEvents    = signal<string[]>([]);
  createdSecret = signal('');  // shown once after creation

  // Edit
  editingId  = signal<string | null>(null);
  editName   = signal('');
  editUrl    = signal('');
  editEvents = signal<string[]>([]);
  editActive = signal(true);
  saving     = signal(false);

  // Copy secret
  copiedSecret = signal(false);

  // Test
  testingId  = signal<string | null>(null);
  testResult = signal('');

  allEvents = SUPPORTED_EVENTS;
  private get orgId(): string { return this.auth.currentUser()?.orgId ?? ''; }

  ngOnInit() { this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(`${BASE}/org/${this.orgId}/webhooks`),
      );
      this.webhooks.set(res?.data?.items ?? []);
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to load webhooks');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Create ─────────────────────────────────────────────────
  async createWebhook() {
    if (!this.newUrl().trim() || !this.newName().trim() || this.newEvents().length === 0) {
      this.createError.set('Name, URL and at least one event are required.');
      return;
    }
    this.creating.set(true);
    this.createError.set('');
    try {
      const res = await firstValueFrom(
        this.http.post<{ data: any }>(`${BASE}/org/${this.orgId}/webhooks`, {
          name: this.newName().trim(),
          targetUrl: this.newUrl().trim(),
          events: this.newEvents(),
        }),
      );
      if (res?.data?.secret) this.createdSecret.set(res.data.secret);
      const hook = res?.data?.subscription;
      if (hook) this.webhooks.update(list => [...list, hook]);
      this.newName.set(''); this.newUrl.set(''); this.newEvents.set([]);
      this.showCreate.set(false);
    } catch (err: any) {
      this.createError.set(err?.error?.message || 'Failed to create webhook');
    } finally {
      this.creating.set(false);
    }
  }

  toggleNewEvent(ev: string) {
    const cur = this.newEvents();
    this.newEvents.set(cur.includes(ev) ? cur.filter(e => e !== ev) : [...cur, ev]);
  }
  toggleEditEvent(ev: string) {
    const cur = this.editEvents();
    this.editEvents.set(cur.includes(ev) ? cur.filter(e => e !== ev) : [...cur, ev]);
  }

  // ── Edit ───────────────────────────────────────────────────
  startEdit(wh: any) {
    this.editingId.set(wh._id);
    this.editName.set(wh.name ?? '');
    this.editUrl.set(wh.targetUrl ?? '');
    this.editEvents.set([...(wh.events ?? [])]);
    this.editActive.set(wh.isActive ?? true);
  }
  cancelEdit() { this.editingId.set(null); }

  async saveEdit(id: string) {
    this.saving.set(true);
    try {
      const res = await firstValueFrom(
        this.http.patch<{ data: any }>(`${BASE}/org/${this.orgId}/webhooks/${id}`, {
          name: this.editName().trim(),
          targetUrl: this.editUrl().trim(),
          events: this.editEvents(),
          isActive: this.editActive(),
        }),
      );
      const updated = res?.data;
      if (updated) this.webhooks.update(list => list.map(w => w._id === id ? { ...w, ...updated } : w));
      this.editingId.set(null);
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to update webhook');
    } finally {
      this.saving.set(false);
    }
  }

  async copySecret() {
    try {
      await navigator.clipboard.writeText(this.createdSecret());
      this.copiedSecret.set(true);
      setTimeout(() => this.copiedSecret.set(false), 2000);
    } catch {
      // clipboard not available — user can copy manually
    }
  }

  // ── Delete ─────────────────────────────────────────────────
  async deleteWebhook(id: string) {
    if (!confirm('Delete this webhook? This cannot be undone.')) return;
    try {
      await firstValueFrom(this.http.delete(`${BASE}/org/${this.orgId}/webhooks/${id}`));
      this.webhooks.update(list => list.filter(w => w._id !== id));
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to delete webhook');
    }
  }

  // ── Test ───────────────────────────────────────────────────
  async testWebhook(id: string) {
    this.testingId.set(id);
    this.testResult.set('');
    try {
      const res = await firstValueFrom(
        this.http.post<{ data: any; message?: string }>(`${BASE}/org/${this.orgId}/webhooks/${id}/test`, {}),
      );
      this.testResult.set(res?.message ?? res?.data?.message ?? 'Test sent successfully');
    } catch (err: any) {
      this.testResult.set(err?.error?.message || 'Test failed');
    } finally {
      this.testingId.set(null);
    }
  }

  // ── Rotate secret ──────────────────────────────────────────
  async rotateSecret(id: string) {
    if (!confirm('Rotate signing secret? Your current secret will stop working immediately.')) return;
    try {
      const res = await firstValueFrom(
        this.http.post<{ data: any }>(`${BASE}/org/${this.orgId}/webhooks/${id}/rotate`, {}),
      );
      if (res?.data?.secret) {
        this.copiedSecret.set(false);
        this.createdSecret.set(res.data.secret);
      }
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to rotate secret');
    }
  }
}
