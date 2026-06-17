import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService, BASE } from './auth.service';
import { firstValueFrom } from 'rxjs';

/**
 * Notification service — connects to backend notification endpoints.
 *
 * Backend endpoints:
 *   GET    /notifications?limit=…    → list notifications
 *   PATCH  /notifications/read-all   → mark all as read
 *   PATCH  /notifications/:id/read   → mark single as read
 *   DELETE /notifications/:id        → delete notification
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  async getNotifications(): Promise<{ data: { notifications: any[] } }> {
    return await firstValueFrom(
      this.http.get<{ data: { notifications: any[] } }>(
        `${BASE}/notifications`,
        { params: { limit: '50' } }
      )
    );
  }

  async markAllRead(): Promise<any> {
    return await firstValueFrom(
      this.http.patch(`${BASE}/notifications/read-all`, {})
    );
  }

  async markRead(id: string): Promise<any> {
    return await firstValueFrom(
      this.http.patch(`${BASE}/notifications/${id}/read`, {})
    );
  }

  async deleteNotification(id: string): Promise<any> {
    return await firstValueFrom(
      this.http.delete(`${BASE}/notifications/${id}`)
    );
  }

  async clearAll(): Promise<any> {
    return await firstValueFrom(
      this.http.delete(`${BASE}/notifications`)
    );
  }

  async getUnreadCount(): Promise<number> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: { count: number } }>(`${BASE}/notifications/unread-count`)
      );
      return res?.data?.count ?? 0;
    } catch {
      return 0;
    }
  }
}