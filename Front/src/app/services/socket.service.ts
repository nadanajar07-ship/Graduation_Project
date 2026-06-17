import { Injectable, inject, signal, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { AuthService, BASE, SOCKET_BASE } from './auth.service';
import { ToastService } from './toast.service';
import { AudioService } from './audio.service';
import { CallService } from './call.service';

export interface IncomingCall {
  callId: string;
  roomId: string;
  type: 'voice' | 'video';
  callerName: string;
  callerImage?: any;
  roomType?: string;
}

@Injectable({ providedIn: 'root' })
export class SocketService {
  private auth   = inject(AuthService);
  private toast  = inject(ToastService);
  private http   = inject(HttpClient);
  private audio  = inject(AudioService);
  private call   = inject(CallService);

  private chatSocket: Socket | null = null;
  private callSocket: Socket | null = null;

  unreadCount   = signal<number>(0);
  lastNotif     = signal<any>(null);

  // Room the user is currently viewing — set by MessagesComponent so we
  // suppress the global ding/toast for the open conversation.
  activeRoomId  = signal<string | null>(null);

  // Global call state — visible from anywhere in the app
  incomingCall  = signal<IncomingCall | null>(null);
  activeCall    = signal<{ callId: string; roomId: string } | null>(null);

  constructor() {
    effect(() => {
      const token = this.auth.token();
      if (token) {
        this.connectChat(token);
        this.connectCall(token);
      } else {
        this.disconnect();
      }
    });
  }

  // ── Chat namespace (/chat) ──────────────────────────────
  private connectChat(token: string): void {
    if (this.chatSocket?.connected) return;

    this.chatSocket = io(`${SOCKET_BASE}/chat`, {
      auth: { authorization: `Bearer ${token}` },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    this.chatSocket.on('connect', () => {
      this.loadUnreadCount();
    });

    this.chatSocket.on('notification', (payload: { notification: any }) => {
      const notif = payload?.notification;
      if (!notif) return;
      this.unreadCount.update(c => c + 1);
      this.lastNotif.set(notif);
      this.toast.info(notif.title ?? 'New notification');
    });

    // Global message notification — the backend auto-joins every room the
    // user belongs to, so this socket receives messages for all rooms. Ding +
    // toast + unread bump, suppressed for our own messages and the room the
    // user is currently viewing.
    this.chatSocket.on('receive_message', (payload: { message: any }) => {
      const msg = payload?.message;
      if (!msg) return;
      const myId = this.auth.currentUser()?._id;
      if (msg.senderId?._id === myId) return;          // don't notify on own messages
      if (msg.chatRoomId === this.activeRoomId()) return; // already looking at it

      this.unreadCount.update(c => c + 1);
      this.audio.playMessage();
      const who = msg.senderId?.username ?? 'New message';
      const preview = (msg.content ?? '').toString().slice(0, 60);
      this.toast.info(preview ? `${who}: ${preview}` : `New message from ${who}`);
    });

    this.chatSocket.on('socket_Error', (err: any) => {
      console.warn('[SocketService] chat error:', err?.message);
    });
  }

  // ── Call namespace (/call) — GLOBAL so call banner shows everywhere ──
  private connectCall(token: string): void {
    if (this.callSocket?.connected) return;

    this.callSocket = io(`${SOCKET_BASE}/call`, {
      auth: { authorization: `Bearer ${token}` },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    this.callSocket.on('connect', () => {
      console.log('[SocketService] Call namespace connected globally');
    });

    // Incoming call from another user
    this.callSocket.on('call:incoming', (data: any) => {
      const callerName = data.caller?.username ?? data.caller?.email ?? 'Someone';
      const incoming: IncomingCall = {
        callId: data.callId,
        roomId: data.roomId,
        type:   data.type ?? 'voice',
        callerName,
        callerImage: data.caller?.image,
        roomType: data.roomType,
      };
      this.incomingCall.set(incoming);
      this.audio.startRingtone();
      // Also show toast so the user notices even if the banner isn't visible yet
      this.toast.info(`📞 Incoming ${incoming.type} call from ${callerName}`);
    });

    // We initiated a call → backend confirms with the callId. Join the
    // LiveKit room globally so the call overlay (mounted in the dashboard
    // shell) can render the video panel from anywhere in the app.
    this.callSocket.on('call:initiated', (data: any) => {
      this.activeCall.set({ callId: data.callId, roomId: data.roomId });
      this.call.joinCall(data.roomId, data.callId);
    });

    // Call ended remotely
    this.callSocket.on('call:ended', (data: any) => {
      if (this.activeCall()?.callId === data.callId || !data.callId) {
        this.activeCall.set(null);
        this.call.hangUp();
      }
      this.incomingCall.set(null);
      this.audio.stopRingtone();
    });

    // Caller rejected / timed out
    this.callSocket.on('call:rejected', () => {
      this.incomingCall.set(null);
      this.audio.stopRingtone();
      this.call.callError.set('Call was declined.');
    });

    this.callSocket.on('call:missed', () => {
      this.incomingCall.set(null);
      this.audio.stopRingtone();
      this.toast.info('📞 Missed call');
    });

    // ── Roster (for @mentions & presence) ───────────────────
    this.callSocket.on('call:user-joined', (data: any) => {
      if (!data?.userId) return;
      this.call.roster.update(list =>
        list.some(r => r.userId === data.userId)
          ? list
          : [...list, { userId: data.userId, username: data.username ?? 'Participant' }]
      );
    });
    this.callSocket.on('call:user-left', (data: any) => {
      if (!data?.userId) return;
      this.call.roster.update(list => list.filter(r => r.userId !== data.userId));
    });

    // ── Teams-style raise hand ──────────────────────────────
    this.callSocket.on('call:hand-raised', (data: any) => {
      const myId = this.auth.currentUser()?._id;
      this.call.raisedHands.update(list =>
        list.some(h => h.userId === data.userId)
          ? list
          : [...list, { userId: data.userId, username: data.username ?? 'Someone' }]
      );
      if (data.userId === myId) this.call.myHandRaised.set(true);
      else this.toast.info(`✋ ${data.username ?? 'Someone'} raised their hand`);
    });

    this.callSocket.on('call:hand-lowered', (data: any) => {
      const myId = this.auth.currentUser()?._id;
      this.call.raisedHands.update(list => list.filter(h => h.userId !== data.userId));
      if (data.userId === myId) this.call.myHandRaised.set(false);
    });

    // ── In-call chat (ephemeral, not persisted) ─────────────
    this.callSocket.on('call:chat:message', (data: any) => {
      const myId = this.auth.currentUser()?._id;
      const mine = data.fromUserId === myId;
      this.call.inCallChat.update(list => [...list, {
        fromUserId: data.fromUserId,
        fromUsername: data.fromUsername ?? 'Someone',
        text: data.text ?? '',
        at: data.at ?? new Date().toISOString(),
        mine,
      }]);
      if (!mine) {
        this.call.unreadChat.update(c => c + 1);
        this.audio.playMessage();
      }
    });

    // ── In-call @mention ────────────────────────────────────
    this.callSocket.on('call:mentioned', (data: any) => {
      const myId = this.auth.currentUser()?._id;
      if (data.targetUserId === myId) {
        this.audio.playMessage();
        this.toast.info(`@ ${data.fromUsername ?? 'Someone'} mentioned you in the call`);
      }
    });

    this.callSocket.on('call:error', (err: any) => {
      console.warn('[SocketService] call error:', err?.message);
    });

    this.callSocket.on('disconnect', () => {
      console.log('[SocketService] Call namespace disconnected');
    });
  }

  // ── Public API for MessagesComponent ────────────────────
  /** Emits on the global call socket — used by MessagesComponent to avoid a second connection */
  emitCall(event: string, data: any): void {
    this.callSocket?.emit(event, data);
  }

  // ── In-call controls (raise hand / chat / mention) ──────
  toggleRaiseHand(): void {
    const callId = this.activeCall()?.callId;
    if (!callId) return;
    if (this.call.myHandRaised()) {
      this.callSocket?.emit('call:lower-hand', { callId });
    } else {
      this.callSocket?.emit('call:raise-hand', { callId });
    }
  }

  /** Caller can lower another participant's hand (give them the floor). */
  lowerHandFor(targetUserId: string): void {
    const callId = this.activeCall()?.callId;
    if (!callId) return;
    this.callSocket?.emit('call:lower-hand', { callId, targetUserId });
  }

  sendCallChat(text: string): void {
    const callId = this.activeCall()?.callId;
    const trimmed = text.trim();
    if (!callId || !trimmed) return;
    this.callSocket?.emit('call:chat:send', { callId, text: trimmed });

    // Parse @mentions against the call roster and ping matched users.
    const tokens = trimmed.match(/@([\w.-]+)/g);
    if (tokens) {
      const roster = this.call.roster();
      const seen = new Set<string>();
      for (const tok of tokens) {
        const name = tok.slice(1).toLowerCase();
        const hit = roster.find(r => r.username.toLowerCase() === name);
        if (hit && !seen.has(hit.userId)) {
          seen.add(hit.userId);
          this.mentionInCall(hit.userId, trimmed);
        }
      }
    }
  }

  mentionInCall(targetUserId: string, text = ''): void {
    const callId = this.activeCall()?.callId;
    if (!callId || !targetUserId) return;
    this.callSocket?.emit('call:mention', { callId, targetUserId, text });
  }

  /** Accept the incoming call: notify backend, join LiveKit, clear banner */
  acceptIncomingCall(): void {
    const inc = this.incomingCall();
    if (!inc) return;
    this.audio.stopRingtone();
    this.callSocket?.emit('call:accept', { callId: inc.callId });
    this.activeCall.set({ callId: inc.callId, roomId: inc.roomId });
    this.incomingCall.set(null);
    this.call.joinCall(inc.roomId, inc.callId);
  }

  /** Reject the incoming call */
  rejectIncomingCall(): void {
    const inc = this.incomingCall();
    if (!inc) return;
    this.audio.stopRingtone();
    this.callSocket?.emit('call:reject', { callId: inc.callId });
    this.incomingCall.set(null);
  }

  /** Hang up the active call: notify the room, tear down LiveKit, clear state */
  endCall(): void {
    const active = this.activeCall();
    if (active?.callId) {
      this.callSocket?.emit('call:end', { callId: active.callId });
    }
    this.call.hangUp();
    this.activeCall.set(null);
    this.audio.stopRingtone();
  }

  markAllRead(): void {
    this.unreadCount.set(0);
  }

  private async loadUnreadCount(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: { count: number } }>(`${BASE}/notifications/unread-count`)
      );
      this.unreadCount.set(res?.data?.count ?? 0);
    } catch { /* ignore */ }
  }

  private disconnect(): void {
    this.chatSocket?.disconnect();
    this.chatSocket = null;
    this.callSocket?.disconnect();
    this.callSocket = null;
    this.unreadCount.set(0);
    this.lastNotif.set(null);
    this.incomingCall.set(null);
    this.activeCall.set(null);
  }
}
