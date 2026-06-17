import {
  Component, inject, signal, effect, ElementRef, ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CallService }   from '../services/call.service';
import { SocketService } from '../services/socket.service';
import { AudioService }  from '../services/audio.service';

/**
 * Global call overlay — mounted once in the dashboard shell so an incoming
 * call can be answered, and an active call controlled, from ANY page.
 *
 * Call lifecycle (join / hangup) lives in SocketService; this component is the
 * single owner of the call *UI* and of binding the LiveKit video elements.
 */
@Component({
  selector: 'app-call-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './call-overlay.html',
  styleUrls: ['./call-overlay.css'],
})
export class CallOverlayComponent {
  @ViewChild('localVideoEl',  { static: true }) private localVideoElRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideosEl', { static: true }) private remoteVideosElRef!: ElementRef<HTMLDivElement>;

  callService   = inject(CallService);
  socketService = inject(SocketService);
  private audio = inject(AudioService);

  minimized = signal(false);
  chatOpen  = signal(false);
  chatDraft = signal('');

  get incomingCall() { return this.socketService.incomingCall; }

  constructor() {
    // Whenever a call becomes active (we initiated, accepted, or were joined),
    // bind the always-present video elements to the LiveKit tracks. The panel
    // uses [hidden] (not @if) so the refs exist before the call connects.
    effect(() => {
      const active = this.callService.activeCall();
      if (active) {
        this.minimized.set(false);
        this._bindVideo();
        setTimeout(() => this._bindVideo(), 500);
      }
    });
  }

  private _bindVideo(): void {
    this.callService.bindVideoEls(
      this.localVideoElRef?.nativeElement ?? null,
      this.remoteVideosElRef?.nativeElement ?? null,
    );
  }

  accept(): void {
    this.audio.unlock();
    this.socketService.acceptIncomingCall();
  }

  decline(): void {
    this.socketService.rejectIncomingCall();
  }

  end(): void {
    this.socketService.endCall();
    this.minimized.set(false);
  }

  toggleHand(): void {
    this.socketService.toggleRaiseHand();
  }

  toggleChat(): void {
    const open = !this.chatOpen();
    this.chatOpen.set(open);
    if (open) this.callService.unreadChat.set(0);
  }

  sendChat(): void {
    const text = this.chatDraft().trim();
    if (!text) return;
    this.socketService.sendCallChat(text);
    this.chatDraft.set('');
  }

  onChatInput(ev: Event): void {
    this.chatDraft.set((ev.target as HTMLInputElement).value);
  }
}
