import React, { useState } from "react";
import { ArrowRight, Laptop, Smartphone, Tablet, ShieldCheck, Zap, QrCode } from "lucide-react";
import { DeviceType } from "../types";

interface LoginProps {
  initialRoomCode?: string;
  defaultDeviceName: string;
  defaultDeviceType: DeviceType;
  onJoin: (roomCode: string, deviceName: string, deviceType: DeviceType) => void;
}

const generateRoomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

export const Login: React.FC<LoginProps> = ({
  initialRoomCode = "",
  defaultDeviceName,
  defaultDeviceType,
  onJoin,
}) => {
  const [roomCode, setRoomCode] = useState(
    initialRoomCode ? initialRoomCode.toUpperCase() : generateRoomCode()
  );
  const [deviceName, setDeviceName] = useState(defaultDeviceName);
  const [deviceType, setDeviceType] = useState<DeviceType>(defaultDeviceType);
  const [logoError, setLogoError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRoom = roomCode.trim().toUpperCase();
    const cleanName = deviceName.trim() || defaultDeviceName;
    if (!cleanRoom) return;
    onJoin(cleanRoom, cleanName, deviceType);
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col justify-between">
      {/* Minimal Header */}
      <header className="w-full max-w-6xl mx-auto px-6 py-5 flex items-center justify-between border-b border-slate-800/70">
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          {!logoError ? (
            <img
              src="/src/assets/images/maurishare_logo_1794638631634.jpg"
              alt="MauriShare"
              referrerPolicy="no-referrer"
              onError={() => setLogoError(true)}
              className="h-9 w-9 rounded-lg object-cover border border-slate-800"
            />
          ) : (
            <div className="h-9 w-9 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-sm">
              MS
            </div>
          )}
          <span className="text-lg font-semibold tracking-tight text-slate-100">
            MauriShare
          </span>
        </div>
        <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
          Transferencia directa entre dispositivos
        </span>
      </header>

      {/* Main Split Content */}
      <main className="w-full max-w-6xl mx-auto px-6 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left: Editorial Value Proposition */}
        <div className="lg:col-span-6 space-y-8">
          <div className="space-y-4">
            <p className="text-xs font-medium tracking-wider uppercase text-indigo-400">
              Red local y transferencia P2P
            </p>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-slate-50 leading-[1.1] text-balance">
              Comparte archivos entre tus dispositivos sin subir nada a la nube.
            </h1>
            <p className="text-base text-slate-400 leading-relaxed max-w-xl">
              Conecta tu computadora, teléfono o tablet en una misma sala mediante código o QR. Los archivos viajan directamente por WebRTC con respaldo automático por WebSocket.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-slate-800/80">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-slate-200 text-sm font-medium">
                <Zap className="h-4 w-4 text-indigo-400 shrink-0" />
                <span>Velocidad directa</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Conexión punto a punto sin límites artificiales ni compresión.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-slate-200 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-indigo-400 shrink-0" />
                <span>Sin almacenamiento</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Tus archivos nunca quedan guardados en servidores externos.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-slate-200 text-sm font-medium">
                <QrCode className="h-4 w-4 text-indigo-400 shrink-0" />
                <span>Emparejado QR</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Escanea el código desde tu móvil para entrar al instante.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Join / Create Room Form */}
        <div className="lg:col-span-6 lg:pl-8">
          <form
            onSubmit={handleSubmit}
            className="bg-[#111827] border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6"
          >
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-slate-100">
                Unirse o crear una sala
              </h2>
              <p className="text-sm text-slate-400">
                Usa el mismo código de sala en ambos dispositivos para enlazarlos.
              </p>
            </div>

            {/* Room Code */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="room-code-input"
                  className="text-xs font-medium text-slate-300"
                >
                  Código de sala
                </label>
                <button
                  type="button"
                  onClick={() => setRoomCode(generateRoomCode())}
                  className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                >
                  Generar nuevo código
                </button>
              </div>
              <input
                id="room-code-input"
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
                placeholder="EJ. X7K9M2"
                maxLength={16}
                required
                className="w-full px-4 py-3 bg-[#0B0F17] border border-slate-700/80 focus:border-indigo-500 focus:outline-none rounded-xl text-slate-100 font-mono text-lg tracking-widest uppercase tabular-nums transition-colors"
              />
            </div>

            {/* Device Name */}
            <div className="space-y-2">
              <label
                htmlFor="device-name-input"
                className="text-xs font-medium text-slate-300 block"
              >
                Nombre de este dispositivo
              </label>
              <input
                id="device-name-input"
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Ej. MacBook de Mauricio"
                maxLength={40}
                required
                className="w-full px-4 py-3 bg-[#0B0F17] border border-slate-700/80 focus:border-indigo-500 focus:outline-none rounded-xl text-slate-100 text-sm transition-colors"
              />
            </div>

            {/* Device Type */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-300 block">
                Tipo de dispositivo
              </span>
              <div className="grid grid-cols-3 gap-2.5">
                {(
                  [
                    { id: "desktop", label: "Escritorio", icon: Laptop },
                    { id: "mobile", label: "Móvil", icon: Smartphone },
                    { id: "tablet", label: "Tablet", icon: Tablet },
                  ] as const
                ).map(({ id, label, icon: Icon }) => {
                  const active = deviceType === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setDeviceType(id)}
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        active
                          ? "bg-indigo-600/15 border-indigo-500 text-indigo-300"
                          : "bg-[#0B0F17] border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>Entrar a la sala</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </main>

      {/* Quiet Footer */}
      <footer className="w-full max-w-6xl mx-auto px-6 py-5 border-t border-slate-800/70 flex items-center justify-between text-xs text-slate-500">
        <span>MauriShare</span>
        <span>WebRTC DataChannel · Respaldo WebSocket</span>
      </footer>
    </div>
  );
};
