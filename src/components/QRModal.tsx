import React, { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { X, Copy, Check } from "lucide-react";

interface QRModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
}

export const QRModal: React.FC<QRModalProps> = ({ isOpen, onClose, roomCode }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const shareUrl = `${window.location.origin}/?room=${encodeURIComponent(roomCode)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-[#111827] border border-slate-800 rounded-2xl p-6 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-slate-100">
              Conectar otro dispositivo
            </h3>
            <p className="text-xs text-slate-400">
              Escanea este código QR para abrir la sala{" "}
              <span className="font-mono text-slate-200">{roomCode}</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-center bg-white p-5 rounded-xl">
          <QRCodeSVG
            value={shareUrl}
            size={200}
            level="M"
            bgColor="#FFFFFF"
            fgColor="#0B0F17"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 bg-[#0B0F17] border border-slate-800 rounded-xl px-3 py-2.5">
            <span className="text-xs font-mono text-slate-300 truncate flex-1">
              {shareUrl}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copiar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
