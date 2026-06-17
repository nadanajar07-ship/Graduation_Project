import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BASE } from '../services/auth.service';

@Component({
  selector: 'app-mentions',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './mentions.html',
  styleUrls: ['./mentions.css'],
})
export class MentionsComponent implements OnInit {
  private http = inject(HttpClient);

  mentions = signal<any[]>([]);
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
        this.http.get<{ data: any }>(`${BASE}/me/mentions?page=${this.page()}&limit=20`)
      );
      const items = res?.data?.items ?? res?.data ?? [];
      if (append) {
        this.mentions.update(list => [...list, ...items]);
      } else {
        this.mentions.set(items);
      }
      this.hasMore.set(items.length === 20);
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to load mentions');
    } finally {
      this.loading.set(false);
    }
  }

  loadMore() {
    this.page.update(p => p + 1);
    this.load(true);
  }

  formatDate(dt: string): string {
    return new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatTime(dt: string): string {
    return new Date(dt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  senderName(msg: any): string {
    const s = msg.senderId ?? msg.sender ?? {};
    return s.username ?? s.email?.split('@')[0] ?? 'Unknown';
  }

  senderInitial(msg: any): string {
    return this.senderName(msg).charAt(0).toUpperCase();
  }

  roomName(msg: any): string {
    return msg.chatRoomId?.name ?? msg.roomName ?? 'Direct Message';
  }

  highlightMentions(content: string): string {
    return (content ?? '').replace(/@[\w.-]+/g, (m) => `<strong style="color:#6366f1">${m}</strong>`);
  }
}
