import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BASE } from '../services/auth.service';

@Component({
  selector: 'app-reminders',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './reminders.html',
  styleUrls: ['./reminders.css'],
})
export class RemindersComponent implements OnInit {
  private http = inject(HttpClient);

  reminders    = signal<any[]>([]);
  loading      = signal(true);
  error        = signal('');
  showCreate   = signal(false);
  creating     = signal(false);
  createError  = signal('');
  filterStatus = signal<'pending' | 'sent' | ''>('pending');

  // Form fields
  text       = signal('');
  triggerAt  = signal('');

  ngOnInit() {
    this.setDefaultTime();
    this.load();
  }

  private setDefaultTime() {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    this.triggerAt.set(local.toISOString().slice(0, 16));
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const status = this.filterStatus();
      const url = `${BASE}/me/reminders${status ? `?status=${status}` : ''}`;
      const res = await firstValueFrom(
        this.http.get<{ data: { items: any[] } }>(url)
      );
      this.reminders.set(res?.data?.items ?? []);
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to load reminders');
    } finally {
      this.loading.set(false);
    }
  }

  async create() {
    if (!this.text().trim() || !this.triggerAt()) {
      this.createError.set('Text and time are required.');
      return;
    }
    this.creating.set(true);
    this.createError.set('');
    try {
      const res = await firstValueFrom(
        this.http.post<{ data: any }>(`${BASE}/me/reminders`, {
          text:      this.text().trim(),
          triggerAt: new Date(this.triggerAt()).toISOString(),
        })
      );
      if (res?.data) {
        if (!this.filterStatus() || this.filterStatus() === 'pending') {
          this.reminders.update(list =>
            [...list, res.data].sort((a, b) =>
              new Date(a.triggerAt).getTime() - new Date(b.triggerAt).getTime()
            )
          );
        }
      }
      this.text.set('');
      this.setDefaultTime();
      this.showCreate.set(false);
    } catch (err: any) {
      this.createError.set(err?.error?.message || 'Failed to create reminder');
    } finally {
      this.creating.set(false);
    }
  }

  async cancel(reminderId: string) {
    try {
      await firstValueFrom(this.http.delete(`${BASE}/me/reminders/${reminderId}`));
      this.reminders.update(list => list.filter(r => r._id !== reminderId));
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to cancel reminder');
    }
  }

  setFilter(status: 'pending' | 'sent' | '') {
    this.filterStatus.set(status);
    this.load();
  }

  isPast(r: any): boolean {
    return new Date(r.triggerAt) < new Date();
  }

  formatDateTime(dt: string): string {
    return new Date(dt).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  statusColor(status: string): string {
    const map: Record<string, string> = {
      Pending: '#6366f1', Sent: '#10b981', Cancelled: '#9ca3af',
    };
    return map[status] ?? '#9ca3af';
  }
}
