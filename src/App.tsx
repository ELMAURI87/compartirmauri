import React, { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { QrCode, LogOut, Copy, Check } from "lucide-react";
import { ConnectedDevice, DeviceType, TransferState } from "./types";
import { Login } from "./components/Login";
import { QRModal } from "./components/QRModal";
import { DevicePresence } from "./components/DevicePresence";
import { TransferArea } from "./components/TransferArea";

const CHUNK_SIZE_WEBRTC = 64 * 1024; // 64KB chunks
const CHUNK_SIZE_WS = 256 * 1024; // 256KB chunks for WS relay
const MAX_BUFFERED_AMOUNT = 4 * 1024 * 1024; // 4MB backpressure threshold

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function detectDefaultDevice(): { name: string; type: DeviceType } {
  const ua = navigator.userAgent || "";
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) {
    return { name: "Tablet", type: "tablet" };
  }
  if (/Mobile|Android|iPhone|iPod/i.test(ua)) {
    if (/iPhone/i.test(ua)) return { name: "iPhone", type: "mobile" };
    if (/Android/i.test(ua)) return { name: "Android", type: "mobile" };
    return { name: "Móvil", type: "mobile" };
  }
  if (/Mac/i.test(ua)) return { name: "Mac", type: "desktop" };
  if (/Win/i.test(ua)) return { name: "Windows PC", type: "desktop" };
  if (/Linux/i.test(ua)) return { name: "Linux PC", type: "desktop" };
  return { name: "Escritorio", type: "desktop" };
}

function encodeBinaryChunk(transferId: string, chunk: ArrayBuffer): ArrayBuffer {
  const idBytes = new TextEncoder().encode(transferId);
  const out = new Uint8Array(1 + idBytes.length + chunk.byteLength);
  out[0] = idBytes.length;
  out.set(idBytes, 1);
  out.set(new Uint8Array(chunk), 1 + idBytes.length);
  return out.buffer;
}

function decodeBinaryChunk(buffer: ArrayBuffer): { transferId: string; data: ArrayBuffer } | null {
  const view = new Uint8Array(buffer);
  if (view.length < 2) return null;
  const idLen = view[0];
  if (view.length < 1 + idLen) return null;
  const transferId = new TextDecoder().decode(view.slice(1, 1 + idLen));
  const data = buffer.slice(1 + idLen);
  return { transferId, data };
}

export function App() {
  const initialParams = new URLSearchParams(window.location.search);
  const urlRoom = initialParams.get("room") || "";
  const defaultDevice = detectDefaultDevice();

  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [mySocketId, setMySocketId] = useState<string | null>(null);
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>([]);
  const [selectedDeviceSocketId, setSelectedDeviceSocketId] = useState<string | null>(null);
  const [peerStates, setPeerStates] = useState<Record<string, "p2p" | "relay" | "connecting">>({});
  const [transfers, setTransfers] = useState<TransferState[]>([]);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [roomCopied, setRoomCopied] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<{ [socketId: string]: RTCPeerConnection }>({});
  const dataChannelsRef = useRef<{ [socketId: string]: RTCDataChannel }>({});
  const activeTransfersRef = useRef<{ [transferId: string]: TransferState }>({});
  const cancelledTransfersRef = useRef<Set<string>>(new Set());
  const receivedChunksRef = useRef<{ [transferId: string]: ArrayBuffer[] }>({});
  const transferBytesRef = useRef<{ [transferId: string]: number }>({});
  const lastProgressUpdateRef = useRef<{ [transferId: string]: number }>({});
  const nextChunkIndexRef = useRef<{ [transferId: string]: number }>({});
  const ackedChunkIndexRef = useRef<{ [transferId: string]: number }>({});
  const websocketChunkSizesRef = useRef<{ [transferId: string]: number }>({});
  const downloadQueueRef = useRef<{ url: string; fileName: string }[]>([]);
  const isDownloadingRef = useRef(false);
  const devicesRef = useRef<ConnectedDevice[]>([]);

  useEffect(() => {
    devicesRef.current = connectedDevices;
  }, [connectedDevices]);

  const cleanupPeer = useCallback((peerId: string) => {
    if (dataChannelsRef.current[peerId]) {
      try {
        dataChannelsRef.current[peerId].close();
      } catch {
        // ignore
      }
      delete dataChannelsRef.current[peerId];
    }
    if (peersRef.current[peerId]) {
      try {
        peersRef.current[peerId].close();
      } catch {
        // ignore
      }
      delete peersRef.current[peerId];
    }
  }, []);

  // Clean up WebRTC and ObjectURLs on unmount
  useEffect(() => {
    return () => {
      Object.keys(peersRef.current).forEach(cleanupPeer);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      Object.values(activeTransfersRef.current).forEach((t) => {
        if (t.downloadUrl) {
          try {
            URL.revokeObjectURL(t.downloadUrl);
          } catch {
            // ignore
          }
        }
      });
    };
  }, [cleanupPeer]);

  const processDownloadQueue = useCallback(() => {
    if (isDownloadingRef.current || downloadQueueRef.current.length === 0) return;
    isDownloadingRef.current = true;

    const next = downloadQueueRef.current.shift();
    if (next) {
      const { url, fileName } = next;
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();

      // Staggered delay (800ms) to bypass browser simultaneous download blockers
      setTimeout(() => {
        if (a.parentNode) {
          document.body.removeChild(a);
        }
        isDownloadingRef.current = false;
        processDownloadQueue();
      }, 800);
    } else {
      isDownloadingRef.current = false;
    }
  }, []);

  const completeTransfer = useCallback(
    (transferId: string) => {
      const t = activeTransfersRef.current[transferId];
      if (!t) return;

      const chunks = receivedChunksRef.current[transferId];
      if (!chunks || chunks.length === 0) return;

      const blob = new Blob(chunks, { type: t.fileType || "application/octet-stream" });
      const url = URL.createObjectURL(blob);

      downloadQueueRef.current.push({ url, fileName: t.fileName });
      processDownloadQueue();

      delete receivedChunksRef.current[transferId];
      delete lastProgressUpdateRef.current[transferId];
      delete transferBytesRef.current[transferId];
      delete nextChunkIndexRef.current[transferId];
      delete ackedChunkIndexRef.current[transferId];
      delete websocketChunkSizesRef.current[transferId];

      const completedState: TransferState = {
        ...t,
        progress: 100,
        status: "completed",
        downloadUrl: url,
      };
      activeTransfersRef.current[transferId] = completedState;

      setTransfers((prev) =>
        prev.map((item) => (item.id === transferId ? completedState : item))
      );
    },
    [processDownloadQueue]
  );

  const updateIncomingProgress = useCallback((transferId: string, bytesReceived: number) => {
    const t = activeTransfersRef.current[transferId];
    if (!t) return;

    const totalReceived = (transferBytesRef.current[transferId] || 0) + bytesReceived;
    transferBytesRef.current[transferId] = totalReceived;

    const now = Date.now();
    const lastUpdate = lastProgressUpdateRef.current[transferId] || 0;
    const progress = t.fileSize > 0 ? Math.min(99, (totalReceived / t.fileSize) * 100) : 99;

    if (now - lastUpdate > 80 || totalReceived >= t.fileSize) {
      lastProgressUpdateRef.current[transferId] = now;
      setTransfers((prev) =>
        prev.map((item) =>
          item.id === transferId
            ? { ...item, progress, status: "receiving" }
            : item
        )
      );
    }
  }, []);

  const setupDataChannel = useCallback(
    (peerId: string, channel: RTCDataChannel) => {
      channel.binaryType = "arraybuffer";
      dataChannelsRef.current[peerId] = channel;

      channel.onopen = () => {
        setPeerStates((prev) => ({ ...prev, [peerId]: "p2p" }));
      };

      channel.onclose = () => {
        setPeerStates((prev) => ({ ...prev, [peerId]: "relay" }));
      };

      channel.onerror = () => {
        setPeerStates((prev) => ({ ...prev, [peerId]: "relay" }));
      };

      channel.onmessage = (event) => {
        if (typeof event.data === "string") {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "meta") {
              const peer = devicesRef.current.find((d) => d.socketId === peerId);
              const newTransfer: TransferState = {
                id: msg.transferId,
                fileName: msg.fileName,
                fileSize: msg.fileSize,
                fileType: msg.fileType || "application/octet-stream",
                progress: 0,
                status: "receiving",
                isIncoming: true,
                peerSocketId: peerId,
                peerName: peer?.deviceName || "Dispositivo",
                channel: "webrtc",
                createdAt: Date.now(),
              };
              activeTransfersRef.current[msg.transferId] = newTransfer;
              receivedChunksRef.current[msg.transferId] = [];
              transferBytesRef.current[msg.transferId] = 0;
              setTransfers((prev) => [newTransfer, ...prev]);
            } else if (msg.type === "end") {
              completeTransfer(msg.transferId);
            } else if (msg.type === "cancel") {
              cancelledTransfersRef.current.add(msg.transferId);
              delete receivedChunksRef.current[msg.transferId];
              delete transferBytesRef.current[msg.transferId];
              setTransfers((prev) =>
                prev.map((item) =>
                  item.id === msg.transferId ? { ...item, status: "cancelled" } : item
                )
              );
            }
          } catch {
            // ignore malformed JSON
          }
        } else if (event.data instanceof ArrayBuffer) {
          const decoded = decodeBinaryChunk(event.data);
          if (!decoded) return;
          const { transferId, data } = decoded;
          if (cancelledTransfersRef.current.has(transferId)) return;
          if (!receivedChunksRef.current[transferId]) return;
          receivedChunksRef.current[transferId].push(data);
          updateIncomingProgress(transferId, data.byteLength);
        }
      };
    },
    [completeTransfer, updateIncomingProgress]
  );

  const createPeerConnection = useCallback(
    (peerId: string, isInitiator: boolean) => {
      cleanupPeer(peerId);
      setPeerStates((prev) => ({ ...prev, [peerId]: "connecting" }));

      const pc = new RTCPeerConnection(ICE_CONFIG);
      peersRef.current[peerId] = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit("webrtc-ice-candidate", {
            to: peerId,
            candidate: event.candidate,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setPeerStates((prev) => ({ ...prev, [peerId]: "relay" }));
        }
      };

      if (isInitiator) {
        const dc = pc.createDataChannel("maurishare-files", { ordered: true });
        setupDataChannel(peerId, dc);

        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            if (socketRef.current && pc.localDescription) {
              socketRef.current.emit("webrtc-offer", {
                to: peerId,
                offer: pc.localDescription,
              });
            }
          })
          .catch(() => {
            setPeerStates((prev) => ({ ...prev, [peerId]: "relay" }));
          });
      } else {
        pc.ondatachannel = (event) => {
          setupDataChannel(peerId, event.channel);
        };
      }

      // If WebRTC doesn't open within 3s, mark peer as WebSocket relay ready
      setTimeout(() => {
        const dc = dataChannelsRef.current[peerId];
        if (!dc || dc.readyState !== "open") {
          setPeerStates((prev) =>
            prev[peerId] === "p2p" ? prev : { ...prev, [peerId]: "relay" }
          );
        }
      }, 3000);

      return pc;
    },
    [cleanupPeer, setupDataChannel]
  );

  const handleJoinRoom = (code: string, deviceName: string, deviceType: DeviceType) => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const socket = io({
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setMySocketId(socket.id || null);
      socket.emit("join-room", {
        roomCode: code,
        deviceName,
        deviceType,
      });
    });

    socket.on("joined-room", ({ roomCode: joinedCode, socketId }) => {
      setRoomCode(joinedCode);
      setMySocketId(socketId);
    });

    socket.on("room-devices", (devices: ConnectedDevice[]) => {
      setConnectedDevices(devices);
      const selfId = socket.id;

      // Clean up peers that left
      const activeIds = new Set(devices.map((d) => d.socketId));
      Object.keys(peersRef.current).forEach((pid) => {
        if (!activeIds.has(pid)) {
          cleanupPeer(pid);
          setPeerStates((prev) => {
            const copy = { ...prev };
            delete copy[pid];
            return copy;
          });
        }
      });

      // Auto-select first available peer if none selected or selected left
      const others = devices.filter((d) => d.socketId !== selfId);
      setSelectedDeviceSocketId((prevSelected) => {
        if (prevSelected && others.some((d) => d.socketId === prevSelected)) {
          return prevSelected;
        }
        return others.length > 0 ? others[0].socketId : null;
      });

      // Initiate WebRTC deterministically with peers where selfId < peer.socketId
      if (selfId) {
        others.forEach((peer) => {
          if (!peersRef.current[peer.socketId] && selfId < peer.socketId) {
            createPeerConnection(peer.socketId, true);
          }
        });
      }
    });

    socket.on("webrtc-offer", async ({ from, offer }) => {
      try {
        const pc = createPeerConnection(from, false);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc-answer", { to: from, answer: pc.localDescription });
      } catch {
        setPeerStates((prev) => ({ ...prev, [from]: "relay" }));
      }
    });

    socket.on("webrtc-answer", async ({ from, answer }) => {
      const pc = peersRef.current[from];
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch {
        // ignore
      }
    });

    socket.on("webrtc-ice-candidate", async ({ from, candidate }) => {
      const pc = peersRef.current[from];
      if (!pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // ignore
      }
    });

    // WebSocket Fallback Handlers
    socket.on(
      "ws-transfer-start",
      ({ from, transferId, fileName, fileSize, fileType }) => {
        const peer = devicesRef.current.find((d) => d.socketId === from);
        const newTransfer: TransferState = {
          id: transferId,
          fileName,
          fileSize,
          fileType: fileType || "application/octet-stream",
          progress: 0,
          status: "receiving",
          isIncoming: true,
          peerSocketId: from,
          peerName: peer?.deviceName || "Dispositivo",
          channel: "websocket",
          createdAt: Date.now(),
        };
        activeTransfersRef.current[transferId] = newTransfer;
        receivedChunksRef.current[transferId] = [];
        transferBytesRef.current[transferId] = 0;
        setTransfers((prev) => [newTransfer, ...prev]);
      }
    );

    socket.on("ws-transfer-chunk", ({ from, transferId, chunkIndex, data }) => {
      if (cancelledTransfersRef.current.has(transferId)) return;
      if (!receivedChunksRef.current[transferId]) return;

      let arrayBuffer: ArrayBuffer;
      if (data instanceof ArrayBuffer) {
        arrayBuffer = data;
      } else if (ArrayBuffer.isView(data)) {
        arrayBuffer = data.buffer.slice(
          data.byteOffset,
          data.byteOffset + data.byteLength
        ) as ArrayBuffer;
      } else {
        arrayBuffer = new Uint8Array(data).buffer;
      }

      receivedChunksRef.current[transferId].push(arrayBuffer);
      updateIncomingProgress(transferId, arrayBuffer.byteLength);

      socket.emit("ws-transfer-ack", {
        to: from,
        transferId,
        chunkIndex,
      });
    });

    socket.on("ws-transfer-ack", ({ transferId, chunkIndex }) => {
      ackedChunkIndexRef.current[transferId] = chunkIndex;
    });

    socket.on("ws-transfer-complete", ({ transferId }) => {
      completeTransfer(transferId);
    });

    socket.on("ws-transfer-cancel", ({ transferId }) => {
      cancelledTransfersRef.current.add(transferId);
      delete receivedChunksRef.current[transferId];
      delete transferBytesRef.current[transferId];
      setTransfers((prev) =>
        prev.map((item) =>
          item.id === transferId ? { ...item, status: "cancelled" } : item
        )
      );
    });
  };

  const handleLeaveRoom = () => {
    Object.keys(peersRef.current).forEach(cleanupPeer);
    if (socketRef.current) {
      socketRef.current.emit("leave-room");
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setRoomCode(null);
    setMySocketId(null);
    setConnectedDevices([]);
    setSelectedDeviceSocketId(null);
    setPeerStates({});
  };

  const sendViaWebRTC = async (
    file: File,
    transferId: string,
    peerId: string,
    dc: RTCDataChannel
  ) => {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE_WEBRTC) || 1;
    dc.send(
      JSON.stringify({
        type: "meta",
        transferId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        totalChunks,
      })
    );

    let offset = 0;
    while (offset < file.size) {
      if (cancelledTransfersRef.current.has(transferId)) {
        dc.send(JSON.stringify({ type: "cancel", transferId }));
        return;
      }
      if (dc.readyState !== "open") {
        throw new Error("DataChannel closed");
      }

      // Backpressure wait
      if (dc.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        await new Promise<void>((resolve) => {
          const check = () => {
            if (
              dc.bufferedAmount < MAX_BUFFERED_AMOUNT / 2 ||
              dc.readyState !== "open" ||
              cancelledTransfersRef.current.has(transferId)
            ) {
              resolve();
            } else {
              setTimeout(check, 20);
            }
          };
          check();
        });
      }

      const slice = file.slice(offset, offset + CHUNK_SIZE_WEBRTC);
      const buf = await slice.arrayBuffer();
      const packet = encodeBinaryChunk(transferId, buf);
      dc.send(packet);

      offset += buf.byteLength;
      const progress = file.size > 0 ? Math.min(99, (offset / file.size) * 100) : 100;
      const now = Date.now();
      if (now - (lastProgressUpdateRef.current[transferId] || 0) > 80 || offset >= file.size) {
        lastProgressUpdateRef.current[transferId] = now;
        setTransfers((prev) =>
          prev.map((item) =>
            item.id === transferId
              ? { ...item, progress, status: "sending" }
              : item
          )
        );
      }
    }

    if (!cancelledTransfersRef.current.has(transferId)) {
      dc.send(JSON.stringify({ type: "end", transferId }));
      setTransfers((prev) =>
        prev.map((item) =>
          item.id === transferId
            ? { ...item, progress: 100, status: "completed" }
            : item
        )
      );
    }
  };

  const sendViaWebSocket = async (
    file: File,
    transferId: string,
    peerId: string
  ) => {
    const socket = socketRef.current;
    if (!socket) throw new Error("No socket");

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE_WS) || 1;
    websocketChunkSizesRef.current[transferId] = CHUNK_SIZE_WS;
    nextChunkIndexRef.current[transferId] = 0;
    ackedChunkIndexRef.current[transferId] = -1;

    socket.emit("ws-transfer-start", {
      to: peerId,
      transferId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      totalChunks,
    });

    let offset = 0;
    let chunkIndex = 0;

    while (offset < file.size) {
      if (cancelledTransfersRef.current.has(transferId)) {
        socket.emit("ws-transfer-cancel", { to: peerId, transferId });
        return;
      }

      // Windowed flow control (allow up to 4 unacked chunks in flight)
      while (chunkIndex - (ackedChunkIndexRef.current[transferId] ?? -1) > 4) {
        if (cancelledTransfersRef.current.has(transferId) || !socket.connected) {
          return;
        }
        await new Promise((r) => setTimeout(r, 15));
      }

      const slice = file.slice(offset, offset + CHUNK_SIZE_WS);
      const buf = await slice.arrayBuffer();

      socket.emit("ws-transfer-chunk", {
        to: peerId,
        transferId,
        chunkIndex,
        data: buf,
      });

      offset += buf.byteLength;
      chunkIndex += 1;
      nextChunkIndexRef.current[transferId] = chunkIndex;

      const progress = file.size > 0 ? Math.min(99, (offset / file.size) * 100) : 100;
      const now = Date.now();
      if (now - (lastProgressUpdateRef.current[transferId] || 0) > 80 || offset >= file.size) {
        lastProgressUpdateRef.current[transferId] = now;
        setTransfers((prev) =>
          prev.map((item) =>
            item.id === transferId
              ? { ...item, progress, status: "sending" }
              : item
          )
        );
      }
    }

    if (!cancelledTransfersRef.current.has(transferId)) {
      socket.emit("ws-transfer-complete", { to: peerId, transferId });
      setTransfers((prev) =>
        prev.map((item) =>
          item.id === transferId
            ? { ...item, progress: 100, status: "completed" }
            : item
        )
      );
    }
  };

  const handleSendFiles = (fileList: FileList | File[]) => {
    const selectedDevice = connectedDevices.find(
      (d) => d.socketId === selectedDeviceSocketId
    );
    if (!selectedDevice) return;

    const files = Array.from(fileList);
    files.forEach(async (file) => {
      const transferId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const dc = dataChannelsRef.current[selectedDevice.socketId];
      const useWebRTC = Boolean(dc && dc.readyState === "open");

      const newTransfer: TransferState = {
        id: transferId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || "application/octet-stream",
        progress: 0,
        status: "sending",
        isIncoming: false,
        peerSocketId: selectedDevice.socketId,
        peerName: selectedDevice.deviceName,
        channel: useWebRTC ? "webrtc" : "websocket",
        createdAt: Date.now(),
      };

      activeTransfersRef.current[transferId] = newTransfer;
      setTransfers((prev) => [newTransfer, ...prev]);

      try {
        if (useWebRTC && dc) {
          await sendViaWebRTC(file, transferId, selectedDevice.socketId, dc);
        } else {
          await sendViaWebSocket(file, transferId, selectedDevice.socketId);
        }
      } catch {
        setTransfers((prev) =>
          prev.map((item) =>
            item.id === transferId ? { ...item, status: "failed" } : item
          )
        );
      }
    });
  };

  const handleCancelTransfer = (transferId: string) => {
    cancelledTransfersRef.current.add(transferId);
    const t = activeTransfersRef.current[transferId];
    if (t) {
      const dc = dataChannelsRef.current[t.peerSocketId];
      if (t.channel === "webrtc" && dc && dc.readyState === "open") {
        dc.send(JSON.stringify({ type: "cancel", transferId }));
      } else if (socketRef.current) {
        socketRef.current.emit("ws-transfer-cancel", {
          to: t.peerSocketId,
          transferId,
        });
      }
    }
    delete receivedChunksRef.current[transferId];
    setTransfers((prev) =>
      prev.map((item) =>
        item.id === transferId ? { ...item, status: "cancelled" } : item
      )
    );
  };

  const handleClearHistory = () => {
    setTransfers((prev) => {
      const activeStatus = ["waiting", "sending", "receiving"];
      const toRemove = prev.filter((t) => !activeStatus.includes(t.status));
      toRemove.forEach((t) => {
        if (t.downloadUrl) {
          try {
            URL.revokeObjectURL(t.downloadUrl);
          } catch {
            // ignore
          }
        }
      });
      return prev.filter((t) => activeStatus.includes(t.status));
    });
  };

  const handleCopyRoomCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setRoomCopied(true);
      setTimeout(() => setRoomCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  if (!roomCode) {
    return (
      <Login
        initialRoomCode={urlRoom}
        defaultDeviceName={defaultDevice.name}
        defaultDeviceType={defaultDevice.type}
        onJoin={handleJoinRoom}
      />
    );
  }

  const selectedDevice = connectedDevices.find(
    (d) => d.socketId === selectedDeviceSocketId
  );

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col">
      {/* 3-Zone Top Bar */}
      <header className="w-full border-b border-slate-800/80 bg-[#0B0F17]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
            {!logoError ? (
              <img
                src="/src/assets/images/maurishare_logo_1794638631634.jpg"
                alt="MauriShare"
                referrerPolicy="no-referrer"
                onError={() => setLogoError(true)}
                className="h-8 w-8 rounded-lg object-cover border border-slate-800"
              />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xs">
                MS
              </div>
            )}
            <span className="text-lg font-semibold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
              MauriShare
            </span>
          </div>

          {/* Zone 2: Concise Room Actions */}
          <nav className="flex items-center gap-6 text-sm font-medium text-slate-300">
            <button
              type="button"
              onClick={handleCopyRoomCode}
              className="hover:text-white transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
              title="Copiar código de sala"
            >
              <span>Sala</span>
              <span className="font-mono text-indigo-400 tabular-nums">
                {roomCode}
              </span>
              {roomCopied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-slate-500" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsQRModalOpen(true)}
              className="hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <QrCode className="h-4 w-4 text-slate-400" />
              <span>Código QR</span>
            </button>
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={handleLeaveRoom}
              className="px-4 py-2 text-xs font-medium text-slate-200 bg-[#111827] hover:bg-slate-800 border border-slate-800 rounded-xl flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-4">
          <DevicePresence
            devices={connectedDevices}
            mySocketId={mySocketId}
            selectedDeviceSocketId={selectedDeviceSocketId}
            peerStates={peerStates}
            onSelectDevice={setSelectedDeviceSocketId}
            onOpenQR={() => setIsQRModalOpen(true)}
          />
        </div>

        <div className="lg:col-span-8">
          <TransferArea
            selectedDevice={selectedDevice}
            transfers={transfers}
            onSendFiles={handleSendFiles}
            onCancelTransfer={handleCancelTransfer}
            onClearHistory={handleClearHistory}
          />
        </div>
      </main>

      <QRModal
        isOpen={isQRModalOpen}
        onClose={() => setIsQRModalOpen(false)}
        roomCode={roomCode}
      />
    </div>
  );
}

export default App;
