import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BASE } from '../services/auth.service';

@Component({
  selector: 'app-saved-messages',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './saved-messages.html',
  styleUrls: ['./saved-messages.css'],
})
export class SavedMessagesComponent implements OnInit {
  private http = inject(HttpClient);

  messages = signal<any[]>([]);
  loading  = signal(true);
  error    = signal('');
  page     = signal(1);
  hasMore  = signal(false);

  ngOnInit() {
    this.load();
  }

  async load(append = false) {
    if (!append) this.loading.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(`${BASE}/me/saved-messages?page=${this.page()}&limit=20`)
      );
      const items = res?.data?.messages ?? res?.data?.items ?? res?.data ?? [];
      if (append) {
        this.messages.update(list => [...list, ...items]);
      } else {
        this.messages.set(items);
      }
      this.hasMore.set(items.length === 20);
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to load saved messages');
    } finally {
      this.loading.set(false);
    }
  }

  loadMore() {
    this.page.update(p => p + 1);
    this.load(true);
  }

  formatDate(dt: string): string {
    const d = new Date(dt);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatTime(dt: string): string {
    return new Date(dt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  /** Backend wraps saved items as { messageId: <actualMsg>, ... }.
   *  Fall back to flat structure in case it changes. */
  private actual(msg: any): any {
    return msg.messageId ?? msg;
  }

  senderName(msg: any): string {
    const a = this.actual(msg);
    const s = a.senderId ?? a.sender ?? {};
    return s.username ?? s.email?.split('@')[0] ?? 'Unknown';
  }

  senderInitial(msg: any): string {
    return this.senderName(msg).charAt(0).toUpperCase();
  }

  roomName(msg: any): string {
    const a = this.actual(msg);
    return a.chatRoomId?.name ?? a.roomName ?? 'Direct Message';
  }

  content(msg: any): string {
    return this.actual(msg).content ?? '';
  }

  createdAt(msg: any): string {
    return this.actual(msg).createdAt ?? msg.createdAt ?? '';
  }
}
