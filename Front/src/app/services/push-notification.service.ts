import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BASE } from './auth.service';

export interface DeviceToken {
  _id: string;
  token: string;
  platform: 'web' | 'ios' | 'android';
  label: string | null;
  createdAt: string;
  lastSeenAt: string;
  isActive: boolean;
}

const DEVICE_KEY = 'rms_browser_device_id';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private http = inject(HttpClient);

  // ── List registered devices for current user ────────────
  async listDevices(): Promise<DeviceToken[]> {
    const res = await firstValueFrom(
      this.http.get<{ data: { devices: DeviceToken[] } }>(`${BASE}/me/devices`),
    );
    return res?.data?.devices ?? [];
  }

  // ── Register this browser as a device ───────────────────
  async registerBrowser(label?: string): Promise<DeviceToken | null> {
    const token = this.getBrowserToken();
    const res = await firstValueFrom(
      this.http.post<{ data: { device: DeviceToken } }>(`${BASE}/me/devices`, {
        token,
        platform: 'web',
        label: label ?? this.browserLabel(),
      }),
    );
    return res?.data?.device ?? null;
  }

  // ── Unregister a specific token ──────────────────────────
  async unregisterDevice(token: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${BASE}/me/devices`, { body: { token } }),
    );
  }

  // ── Unregister this browser specifically ─────────────────
  async unregisterBrowser(): Promise<void> {
    await this.unregisterDevice(this.getBrowserToken());
  }

  // ── Check/request notification permission ────────────────
  async requestNotificationPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    return Notification.requestPermission();
  }

  get notificationPermission(): NotificationPermission {
    if (!('Notification' in window)) return 'denied';
    return Notification.permission;
  }

  // ── Stable per-browser token stored in localStorage ──────
  getBrowserToken(): string {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = 'web-' + (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2));
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  private browserLabel(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome Browser';
    if (ua.includes('Firefox')) return 'Firefox Browser';
    if (ua.includes('Safari')) return 'Safari Browser';
    if (ua.includes('Edge')) return 'Edge Browser';
    return 'Web Browser';
  }
}
