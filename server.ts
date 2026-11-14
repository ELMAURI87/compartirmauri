import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RoomDevice {
  socketId: string;
  deviceName: string;
  deviceType: "desktop" | "mobile" | "tablet";
  joinedAt: number;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    maxHttpBufferSize: 10 * 1024 * 1024, // 10MB buffer for WS relay chunks
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Authoritative server-side room presence map
  const rooms = new Map<string, Map<string, RoomDevice>>();
  const socketToRoom = new Map<string, string>();

  const broadcastRoomDevices = (roomCode: string) => {
    const roomMap = rooms.get(roomCode);
    const devices = roomMap ? Array.from(roomMap.values()) : [];
    io.to(roomCode).emit("room-devices", devices);
  };

  io.on("connection", (socket) => {
    socket.on("join-room", (payload: { roomCode: string; deviceName: string; deviceType: "desktop" | "mobile" | "tablet" }) => {
      const normalizedRoom = (payload.roomCode || "").trim().toUpperCase();
      const deviceName = (payload.deviceName || "Dispositivo").trim().slice(0, 48);
      const deviceType = payload.deviceType || "desktop";

      if (!normalizedRoom) return;

      // Leave previous room if any
      const prevRoom = socketToRoom.get(socket.id);
      if (prevRoom && prevRoom !== normalizedRoom) {
        socket.leave(prevRoom);
        const prevMap = rooms.get(prevRoom);
        if (prevMap) {
          prevMap.delete(socket.id);
          if (prevMap.size === 0) rooms.delete(prevRoom);
          else broadcastRoomDevices(prevRoom);
        }
      }

      socket.join(normalizedRoom);
      socketToRoom.set(socket.id, normalizedRoom);

      if (!rooms.has(normalizedRoom)) {
        rooms.set(normalizedRoom, new Map());
      }

      const roomMap = rooms.get(normalizedRoom)!;
      roomMap.set(socket.id, {
        socketId: socket.id,
        deviceName,
        deviceType,
        joinedAt: Date.now(),
      });

      socket.emit("joined-room", {
        roomCode: normalizedRoom,
        socketId: socket.id,
      });

      broadcastRoomDevices(normalizedRoom);
    });

    socket.on("leave-room", () => {
      const roomCode = socketToRoom.get(socket.id);
      if (!roomCode) return;

      socket.leave(roomCode);
      socketToRoom.delete(socket.id);

      const roomMap = rooms.get(roomCode);
      if (roomMap) {
        roomMap.delete(socket.id);
        if (roomMap.size === 0) rooms.delete(roomCode);
        else broadcastRoomDevices(roomCode);
      }
    });

    // WebRTC Signaling Relay
    socket.on("webrtc-offer", ({ to, offer }) => {
      if (!to || !offer) return;
      io.to(to).emit("webrtc-offer", { from: socket.id, offer });
    });

    socket.on("webrtc-answer", ({ to, answer }) => {
      if (!to || !answer) return;
      io.to(to).emit("webrtc-answer", { from: socket.id, answer });
    });

    socket.on("webrtc-ice-candidate", ({ to, candidate }) => {
      if (!to || !candidate) return;
      io.to(to).emit("webrtc-ice-candidate", { from: socket.id, candidate });
    });

    // WebSocket Fallback File Transfer Relay
    socket.on("ws-transfer-start", ({ to, transferId, fileName, fileSize, fileType, totalChunks }) => {
      if (!to) return;
      io.to(to).emit("ws-transfer-start", {
        from: socket.id,
        transferId,
        fileName,
        fileSize,
        fileType,
        totalChunks,
      });
    });

    socket.on("ws-transfer-chunk", ({ to, transferId, chunkIndex, data }) => {
      if (!to) return;
      io.to(to).emit("ws-transfer-chunk", {
        from: socket.id,
        transferId,
        chunkIndex,
        data,
      });
    });

    socket.on("ws-transfer-ack", ({ to, transferId, chunkIndex }) => {
      if (!to) return;
      io.to(to).emit("ws-transfer-ack", {
        from: socket.id,
        transferId,
        chunkIndex,
      });
    });

    socket.on("ws-transfer-complete", ({ to, transferId }) => {
      if (!to) return;
      io.to(to).emit("ws-transfer-complete", {
        from: socket.id,
        transferId,
      });
    });

    socket.on("ws-transfer-cancel", ({ to, transferId }) => {
      if (!to) return;
      io.to(to).emit("ws-transfer-cancel", {
        from: socket.id,
        transferId,
      });
    });

    socket.on("disconnect", () => {
      const roomCode = socketToRoom.get(socket.id);
      if (roomCode) {
        socketToRoom.delete(socket.id);
        const roomMap = rooms.get(roomCode);
        if (roomMap) {
          roomMap.delete(socket.id);
          if (roomMap.size === 0) rooms.delete(roomCode);
          else broadcastRoomDevices(roomCode);
        }
      }
    });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`MauriShare server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
