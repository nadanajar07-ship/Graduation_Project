import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BASE } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

interface Prefs {
  inApp: boolean;
  push: boolean;
  email: boolean;
  muted: boolean;
}

@Component({
  selector: 'app-notif-prefs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notif-prefs.html',
  styleUrls: ['./notif-prefs.css'],
})
export class NotifPrefsComponent implements OnInit {
  private http  = inject(HttpClient);
  private toast = inject(ToastService);

  loading = signal(true);
  saving  = signal(false);
  prefs   = signal<Prefs>({ inApp: true, push: true, email: false, muted: false });

  async ngOnInit() {
    try {
      const res: any = await firstValueFrom(
        this.http.get(`${BASE}/me/notification-preferences`)
      );
      const p = res?.data?.preferences ?? res?.data ?? {};
      this.prefs.set({
        inApp: p.inApp  ?? true,
        push:  p.push   ?? true,
        email: p.email  ?? false,
        muted: p.muted  ?? false,
      });
    } catch { /* use defaults */ }
    finally { this.loading.set(false); }
  }

  toggle(key: keyof Prefs): void {
    this.prefs.update(p => ({ ...p, [key]: !p[key] }));
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.http.patch(`${BASE}/me/notification-preferences`, this.prefs())
      );
      this.toast.success('Notification preferences saved');
    } catch (err: any) {
      this.toast.error(err?.error?.message || 'Failed to save preferences');
    } finally {
      this.saving.set(false);
    }
  }
}
