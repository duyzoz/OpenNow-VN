import {
  INPUT_MOUSE_ABS,
  INPUT_MOUSE_REL,
  isPartiallyReliableHidTransferEligible,
  partiallyReliableHidMaskForInputType,
} from "../inputProtocol";

const MAX_PARTIALLY_RELIABLE_MOUSE_BUFFER_BYTES = 32 * 1024;
const PARTIALLY_RELIABLE_MOUSE_LOW_WATERMARK_BYTES = 16 * 1024;

function isMouseMotionInput(inputType: number): boolean {
  return inputType === INPUT_MOUSE_REL || inputType === INPUT_MOUSE_ABS;
}

export interface RiInputCapabilities {
  partialReliableThresholdMs: number | null;
  hidDeviceMask: number;
  enablePartiallyReliableTransferGamepad: number;
  enablePartiallyReliableTransferHid: number;
}

export function canUsePartiallyReliableGamepad(
  channelOpen: boolean,
  capabilities: RiInputCapabilities,
  controllerId: number,
): boolean {
  const mask = 1 << (controllerId & 0x1f);
  return channelOpen
    && (capabilities.enablePartiallyReliableTransferGamepad & mask) !== 0;
}

export function canUsePartiallyReliableInput(
  channelOpen: boolean,
  capabilities: RiInputCapabilities,
  inputType: number,
): boolean {
  if (!channelOpen || !isPartiallyReliableHidTransferEligible(inputType)) {
    return false;
  }
  const hidMask = partiallyReliableHidMaskForInputType(inputType);
  if (hidMask === 0 || (capabilities.hidDeviceMask & hidMask) === 0) {
    return false;
  }
  return (capabilities.enablePartiallyReliableTransferHid & hidMask) !== 0;
}

interface InputChannelPolicyControllerDependencies {
  getPartiallyReliableChannel: () => RTCDataChannel | null;
  sendReliable: (payload: Uint8Array) => void;
}

export class InputChannelPolicyController {
  private capabilities: RiInputCapabilities;
  private pendingMouseMotion: Uint8Array | null = null;
  private lowWatermarkChannel: RTCDataChannel | null = null;

  private readonly handleBufferedAmountLow = (): void => {
    const channel = this.lowWatermarkChannel;
    if (
      !channel
      || channel.readyState !== "open"
      || this.dependencies.getPartiallyReliableChannel() !== channel
    ) {
      this.pendingMouseMotion = null;
      return;
    }
    if (channel.bufferedAmount > PARTIALLY_RELIABLE_MOUSE_LOW_WATERMARK_BYTES) {
      return;
    }
    const pending = this.pendingMouseMotion;
    this.pendingMouseMotion = null;
    if (!pending) {
      return;
    }
    try {
      channel.send(pending as unknown as ArrayBufferView<ArrayBuffer>);
    } catch {
      // Keep the newest motion for the next low-watermark event if the channel
      // transitions during the flush.
      this.pendingMouseMotion = pending;
    }
  };

  private syncLowWatermarkChannel(channel: RTCDataChannel | null): void {
    if (channel === this.lowWatermarkChannel) {
      return;
    }
    if (this.lowWatermarkChannel) {
      this.lowWatermarkChannel.removeEventListener(
        "bufferedamountlow",
        this.handleBufferedAmountLow,
      );
    }
    this.lowWatermarkChannel = channel;
    if (!channel) {
      this.pendingMouseMotion = null;
      return;
    }
    channel.bufferedAmountLowThreshold = PARTIALLY_RELIABLE_MOUSE_LOW_WATERMARK_BYTES;
    channel.addEventListener("bufferedamountlow", this.handleBufferedAmountLow);
  }

  constructor(
    capabilities: RiInputCapabilities,
    private readonly dependencies: InputChannelPolicyControllerDependencies,
  ) {
    this.capabilities = { ...capabilities };
  }

  updateCapabilities(capabilities: RiInputCapabilities): void {
    this.capabilities = { ...capabilities };
  }

  isPartiallyReliableOpen(): boolean {
    return this.dependencies.getPartiallyReliableChannel()?.readyState === "open";
  }

  canSendGamepad(controllerId: number): boolean {
    return canUsePartiallyReliableGamepad(
      this.isPartiallyReliableOpen(),
      this.capabilities,
      controllerId,
    );
  }

  canSendInput(inputType: number): boolean {
    return canUsePartiallyReliableInput(
      this.isPartiallyReliableOpen(),
      this.capabilities,
      inputType,
    );
  }

  sendPartiallyReliable(payload: Uint8Array): void {
    const channel = this.dependencies.getPartiallyReliableChannel();
    if (channel?.readyState === "open") {
      const view = payload.byteOffset === 0 && payload.byteLength === payload.buffer.byteLength
        ? payload
        : payload.slice();
      channel.send(view as unknown as ArrayBufferView<ArrayBuffer>);
      return;
    }
    this.dependencies.sendReliable(payload);
  }

  sendInput(payload: Uint8Array, inputType: number): void {
    const channel = this.dependencies.getPartiallyReliableChannel();
    this.syncLowWatermarkChannel(channel);

    if (this.canSendInput(inputType)) {
      // A partially-reliable channel should never be allowed to accumulate
      // stale relative motion. Keep the newest motion until the browser queue
      // reaches its low watermark; clicks, wheel, keyboard and gamepad state
      // remain reliable and are never dropped by this guard.
      if (
        isMouseMotionInput(inputType)
        && channel?.readyState === "open"
        && channel.bufferedAmount > MAX_PARTIALLY_RELIABLE_MOUSE_BUFFER_BYTES
      ) {
        this.pendingMouseMotion = payload.slice();
        return;
      }

      this.sendPartiallyReliable(payload);
      return;
    }
    this.dependencies.sendReliable(payload);
  }
}
