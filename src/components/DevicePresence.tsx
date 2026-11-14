import React from "react";
import { Laptop, Smartphone, Tablet, QrCode, Wifi } from "lucide-react";
import { ConnectedDevice, DeviceType } from "../types";

interface DevicePresenceProps {
  devices: ConnectedDevice[];
  mySocketId: string | null;
  selectedDeviceSocketId: string | null;
  peerStates: Record<string, "p2p" | "relay" | "connecting">;
  onSelectDevice: (socketId: string) => void;
  onOpenQR: () => void;
}

const getDeviceIcon = (type: DeviceType) => {
  switch (type) {
    case "mobile":
      return Smartphone;
    case "tablet":
      return Tablet;
    default:
      return Laptop;
  }
};

const getDeviceLabel = (type: DeviceType) => {
  switch (type) {
    case "mobile":
      return "Móvil";
    case "tablet":
      return "Tablet";
    default:
      return "Escritorio";
  }
};

export const DevicePresence: React.FC<DevicePresenceProps> = ({
  devices,
  mySocketId,
  selectedDeviceSocketId,
  peerStates,
  onSelectDevice,
  onOpenQR,
}) => {
  const otherDevices = devices.filter((d) => d.socketId !== mySocketId);
  const myDevice = devices.find((d) => d.socketId === mySocketId);

  return (
    <aside className="bg-[#111827] border border-slate-800 rounded-2xl p-5 flex flex-col gap-5 h-full">
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Dispositivos en la sala
          </h2>
          <p className="text-xs text-slate-400 tabular-nums mt-0.5">
            {otherDevices.length === 0
              ? "Esperando otro dispositivo"
              : `${otherDevices.length} ${otherDevices.length === 1 ? "destinatario disponible" : "destinatarios disponibles"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenQR}
          className="px-3 py-2 bg-[#0B0F17] hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <QrCode className="h-3.5 w-3.5 text-indigo-400" />
          <span>Vincular</span>
        </button>
      </div>

      {/* Current Device Summary */}
      {myDevice && (
        <div className="pb-4 border-b border-slate-800/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-300 shrink-0">
              {React.createElement(getDeviceIcon(myDevice.deviceType), {
                className: "h-4 w-4",
              })}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-100 truncate">
                {myDevice.deviceName}
              </p>
              <p className="text-xs text-slate-400">
                Este dispositivo · {getDeviceLabel(myDevice.deviceType)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Peer List */}
      <div className="flex-1 space-y-2.5 overflow-y-auto">
        {otherDevices.length === 0 ? (
          <div className="py-10 px-4 text-center space-y-4">
            <div className="h-11 w-11 mx-auto rounded-xl bg-[#0B0F17] border border-slate-800 flex items-center justify-center text-slate-400">
              <Wifi className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-200">
                No hay otros dispositivos conectados
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Abre MauriShare en tu otro equipo e ingresa el mismo código de sala o escanea el código QR.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenQR}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl transition-colors cursor-pointer"
            >
              Mostrar código QR
            </button>
          </div>
        ) : (
          otherDevices.map((device) => {
            const Icon = getDeviceIcon(device.deviceType);
            const isSelected = device.socketId === selectedDeviceSocketId;
            const mode = peerStates[device.socketId] || "connecting";
            const modeLabel =
              mode === "p2p"
                ? "WebRTC P2P"
                : mode === "relay"
                ? "WebSocket Seguro"
                : "Conectando";

            return (
              <button
                key={device.socketId}
                type="button"
                onClick={() => onSelectDevice(device.socketId)}
                className={`w-full text-left p-3.5 rounded-xl border transition-colors cursor-pointer flex items-center gap-3 ${
                  isSelected
                    ? "bg-indigo-600/15 border-indigo-500"
                    : "bg-[#0B0F17] border-slate-800 hover:border-slate-700"
                }`}
              >
                <div
                  className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isSelected
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-800/80 text-slate-300"
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-100 truncate">
                    {device.deviceName}
                  </p>
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {getDeviceLabel(device.deviceType)} · {modeLabel}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
};
