export type DeviceType = "desktop" | "mobile" | "tablet";

export interface ConnectedDevice {
  socketId: string;
  deviceName: string;
  deviceType: DeviceType;
  joinedAt: number;
}

export type TransferStatus =
  | "waiting"
  | "sending"
  | "receiving"
  | "completed"
  | "failed"
  | "cancelled";

export type TransferChannel = "webrtc" | "websocket";

export interface TransferState {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  progress: number;
  status: TransferStatus;
  isIncoming: boolean;
  peerSocketId: string;
  peerName: string;
  channel: TransferChannel;
  speedBytesPerSec?: number;
  downloadUrl?: string;
  error?: string;
  createdAt: number;
}
