import {
  INPUT_MOUSE_ABS,
  INPUT_MOUSE_REL,
  isPartiallyReliableHidTransferEligible,
  partiallyReliableHidMaskForInputType,
} from "../inputProtocol";

const MAX_PARTIALLY_RELIABLE_MOUSE_BUFFER_BYTES = 32 * 1024;

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
  isNativeInputActive: () => boolean;
  getPartiallyReliableChannel: () => RTCDataChannel | null;
  sendNativeInput: (payload: Uint8Array, partiallyReliable: boolean) => void;
  sendReliable: (payload: Uint8Array) => void;
}

export class InputChannelPolicyController {
  private capabilities: RiInputCapabilities;

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
    if (this.dependencies.isNativeInputActive()) {
      return true;
    }
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
    if (this.dependencies.isNativeInputActive()) {
      this.dependencies.sendNativeInput(payload, true);
      return;
    }

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
    if (this.canSendInput(inputType)) {
      const channel = this.dependencies.isNativeInputActive()
        ? null
        : this.dependencies.getPartiallyReliableChannel();

      // A partially-reliable channel should never be allowed to accumulate
      // stale relative motion. Drop only mouse movement while its browser
      // send queue is high; the next sample carries the latest position
      // delta, while clicks, wheel, keyboard and gamepad state remain reliable.
      if (
        isMouseMotionInput(inputType)
        && channel?.readyState === "open"
        && channel.bufferedAmount > MAX_PARTIALLY_RELIABLE_MOUSE_BUFFER_BYTES
      ) {
        return;
      }

      this.sendPartiallyReliable(payload);
      return;
    }
    this.dependencies.sendReliable(payload);
  }
}
