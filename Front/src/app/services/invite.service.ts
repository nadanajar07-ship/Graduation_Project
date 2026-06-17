import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BASE, AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class InviteService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  async sendInvite(email: string, role: 'member' | 'admin' = 'member') {
    const orgId = this.auth.currentUser()?.orgId;
    if (!orgId) return { success: false, message: 'No organization selected' };
    try {
      const res = await firstValueFrom(
        this.http.post<{ message: string }>(`${BASE}/org/${orgId}/invitations`, { email, role }),
      );
      return { success: true, message: res.message || 'Invitation sent' };
    } catch (err: any) {
      return {
        success: false,
        message: err?.error?.message || 'Failed to send invitation',
      };
    }
  }
}
