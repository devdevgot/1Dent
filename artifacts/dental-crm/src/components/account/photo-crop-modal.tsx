import React, { useState, useRef, useEffect } from "react";
import { X, ZoomIn, ZoomOut, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PhotoCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  onCrop: (croppedBase64: string) => Promise<void> | void;
}

export default function PhotoCropModal({
  isOpen,
  onClose,
  imageSrc,
  onCrop,
}: PhotoCropModalProps) {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isSaving, setIsSaving] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const CROP_SIZE = 192; // 192px crop circle diameter on screen

  // Reset states when a new image is loaded
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPosition({ x: 0, y: 0 });
      setIsSaving(false);
    }
  }, [isOpen, imageSrc]);

  if (!isOpen) return null;

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    setIsDragging(true);
    setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    if (!touch) return;
    setPosition({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleSave = async () => {
    if (!imageRef.current) return;
    setIsSaving(true);

    try {
      const imgEl = imageRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        // Draw white background
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 200, 200);

        const img = new Image();
        img.src = imageSrc;
        
        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            // Scale factor between screen crop circle (CROP_SIZE) and output canvas (200px)
            const k = 200 / CROP_SIZE;

            // Scaled image dimensions on canvas
            const canvasImageWidth = imgEl.offsetWidth * zoom * k;
            const canvasImageHeight = imgEl.offsetHeight * zoom * k;

            // Center position relative to output canvas center (100, 100)
            const dx_canvas = 100 + position.x * k;
            const dy_canvas = 100 + position.y * k;

            // Top-left draw offset on canvas
            const x_canvas = dx_canvas - canvasImageWidth / 2;
            const y_canvas = dy_canvas - canvasImageHeight / 2;

            ctx.drawImage(img, x_canvas, y_canvas, canvasImageWidth, canvasImageHeight);
            resolve();
          };
          img.onerror = reject;
        });

        const base64 = canvas.toDataURL("image/jpeg", 0.95);
        await onCrop(base64);
        onClose();
      }
    } catch (err) {
      console.error("Failed to crop image", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-[360px] rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
          <span className="font-semibold text-gray-900 text-[16px]">{t("settingsPage.cropPhoto", "Обрезка фото")}</span>
          <button 
            onClick={onClose} 
            disabled={isSaving}
            className="p-1 rounded-full text-gray-400 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Crop Viewport */}
        <div 
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="relative w-full aspect-square bg-[#0c0f1d] overflow-hidden flex items-center justify-center cursor-move select-none touch-none"
        >
          <img
            ref={imageRef}
            src={imageSrc}
            alt="Source"
            className="max-w-none max-h-none pointer-events-none transition-transform duration-75 ease-out"
            style={{
              width: "80%",
              height: "auto",
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
            }}
          />

          {/* Circle Mask Overlay */}
          <div 
            className="rounded-full border-2 border-white/80 absolute pointer-events-none shadow-[0_0_0_9999px_rgba(15,23,42,0.65)]"
            style={{
              width: `${CROP_SIZE}px`,
              height: `${CROP_SIZE}px`,
            }}
          />
        </div>

        {/* Zoom Controls */}
        <div className="p-4 space-y-4 bg-slate-50/50 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <ZoomOut className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              type="range"
              min="1"
              max="4"
              step="0.01"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              disabled={isSaving}
              className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50"
            />
            <ZoomIn className="w-4 h-4 text-gray-400 shrink-0" />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-gray-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {t("common.cancel", "Отмена")}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 py-2.5 rounded-xl bg-primary text-sm font-semibold text-white hover:bg-primary/95 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("common.saving", "Сохранение...")}
                </>
              ) : (
                t("common.save", "Сохранить")
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
