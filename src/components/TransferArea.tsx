import React, { useRef, useState } from "react";
import {
  UploadCloud,
  File,
  FileText,
  ImageIcon,
  Video,
  Music,
  FileCode,
  FileArchive,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  XCircle,
  Trash2,
  Download,
} from "lucide-react";
import { ConnectedDevice, TransferState } from "../types";
import { motion, AnimatePresence } from "motion/react";

interface TransferAreaProps {
  selectedDevice?: ConnectedDevice;
  transfers: TransferState[];
  onSendFiles: (files: FileList | File[]) => void;
  onCancelTransfer: (transferId: string) => void;
  onClearHistory: () => void;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
};

const getFileIcon = (fileType: string, fileName: string) => {
  const lower = fileName.toLowerCase();
  if (fileType.startsWith("image/")) return ImageIcon;
  if (fileType.startsWith("video/")) return Video;
  if (fileType.startsWith("audio/")) return Music;
  if (
    fileType.includes("zip") ||
    fileType.includes("compressed") ||
    /\.(zip|rar|7z|tar|gz)$/.test(lower)
  ) {
    return FileArchive;
  }
  if (
    fileType.includes("json") ||
    fileType.includes("javascript") ||
    /\.(ts|tsx|js|jsx|py|html|css|json|md)$/.test(lower)
  ) {
    return FileCode;
  }
  if (fileType.includes("pdf") || fileType.includes("text")) {
    return FileText;
  }
  return File;
};

export const TransferArea: React.FC<TransferAreaProps> = ({
  selectedDevice,
  transfers,
  onSendFiles,
  onCancelTransfer,
  onClearHistory,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!selectedDevice) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!selectedDevice) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onSendFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onSendFiles(e.target.files);
      e.target.value = "";
    }
  };

  const hasInactiveTransfers = transfers.some(
    (t) => !["waiting", "sending", "receiving"].includes(t.status)
  );

  return (
    <section className="bg-[#111827] border border-slate-800 rounded-2xl p-6 flex flex-col gap-6 h-full">
      {/* Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => selectedDevice && fileInputRef.current?.click()}
        className={`relative rounded-xl border border-dashed p-8 sm:p-10 text-center transition-colors ${
          !selectedDevice
            ? "border-slate-800 bg-[#0B0F17]/60 cursor-not-allowed opacity-70"
            : isDragging
            ? "border-indigo-400 bg-indigo-600/10 cursor-pointer"
            : "border-slate-700 bg-[#0B0F17] hover:border-indigo-500/70 cursor-pointer"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          disabled={!selectedDevice}
          className="hidden"
        />

        <div className="max-w-md mx-auto space-y-3">
          <div
            className={`h-12 w-12 mx-auto rounded-xl flex items-center justify-center transition-colors ${
              selectedDevice
                ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/30"
                : "bg-slate-800/70 text-slate-500 border border-slate-800"
            }`}
          >
            <UploadCloud className="h-6 w-6" />
          </div>

          {selectedDevice ? (
            <>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-slate-100">
                  Enviar archivos a {selectedDevice.deviceName}
                </h3>
                <p className="text-xs text-slate-400">
                  Arrastra uno o varios archivos aquí, o haz clic para seleccionarlos desde tu equipo.
                </p>
              </div>
              <div className="pt-1">
                <span className="inline-flex items-center px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors">
                  Seleccionar archivos
                </span>
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-slate-300">
                Selecciona un dispositivo destinatario
              </h3>
              <p className="text-xs text-slate-500">
                Elige un dispositivo conectado en el panel lateral para habilitar el envío de archivos.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Transfers List */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-200">
              Actividad de transferencias
            </h3>
            <span className="text-xs text-slate-500 tabular-nums">
              {transfers.length > 0 ? `· ${transfers.length}` : ""}
            </span>
          </div>

          {hasInactiveTransfers && (
            <button
              type="button"
              onClick={onClearHistory}
              className="text-xs font-medium text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Limpiar historial</span>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto pt-3 space-y-2.5">
          {transfers.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Las transferencias enviadas y recibidas aparecerán aquí en tiempo real.
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {transfers.map((t) => {
                const FileIcon = getFileIcon(t.fileType, t.fileName);
                const isActive =
                  t.status === "waiting" ||
                  t.status === "sending" ||
                  t.status === "receiving";
                const isCompleted = t.status === "completed";

                const statusText =
                  t.status === "waiting"
                    ? "Preparando"
                    : t.status === "sending"
                    ? "Enviando"
                    : t.status === "receiving"
                    ? "Recibiendo"
                    : t.status === "completed"
                    ? t.isIncoming
                      ? "Recibido"
                      : "Enviado"
                    : t.status === "cancelled"
                    ? "Cancelado"
                    : "Error";

                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16 }}
                    className="p-3.5 rounded-xl bg-[#0B0F17] border border-slate-800/90 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-lg bg-slate-800/80 flex items-center justify-center text-slate-300 shrink-0">
                          <FileIcon className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-100 truncate">
                            {t.fileName}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-slate-400 tabular-nums mt-0.5">
                            <span>{formatBytes(t.fileSize)}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {t.isIncoming ? `De ${t.peerName}` : `Para ${t.peerName}`}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {t.channel === "webrtc" ? "P2P" : "WebSocket"}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={
                                isCompleted
                                  ? "text-emerald-400"
                                  : isActive
                                  ? "text-indigo-400"
                                  : "text-rose-400"
                              }
                            >
                              {statusText}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        {isActive && (
                          <span className="text-xs font-mono text-slate-300 tabular-nums flex items-center gap-1.5">
                            <RefreshCw className="h-3 w-3 animate-spin text-indigo-400" />
                            {Math.round(t.progress)}%
                          </span>
                        )}

                        {isActive ? (
                          <button
                            type="button"
                            onClick={() => onCancelTransfer(t.id)}
                            title="Cancelar transferencia"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <XCircle className="h-4.5 w-4.5" />
                          </button>
                        ) : isCompleted ? (
                          <div className="flex items-center gap-2">
                            {t.isIncoming && t.downloadUrl && (
                              <a
                                href={t.downloadUrl}
                                download={t.fileName}
                                className="px-3 py-1.5 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/25 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0"
                                title="Descargar archivo manualmente"
                                id={`manual-download-btn-${t.id}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Download className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Guardar</span>
                              </a>
                            )}
                            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 flex-shrink-0" />
                          </div>
                        ) : (
                          <AlertCircle className="h-4.5 w-4.5 text-rose-500 flex-shrink-0" />
                        )}
                      </div>
                    </div>

                    {isActive && (
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 transition-[width] duration-150"
                          style={{ width: `${Math.min(100, Math.max(0, t.progress))}%` }}
                        />
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </div>
    </section>
  );
};
