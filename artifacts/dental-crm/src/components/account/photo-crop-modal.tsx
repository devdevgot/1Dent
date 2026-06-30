import React, { useState, useRef, useEffect, useCallback } from "react";
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
  const [minZoom, setMinZoom] = useState(0.1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartZoom = useRef(1);

  const CROP_SIZE = 192;
  const MAX_ZOOM = 5;

  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setMinZoom(0.1);
      setPosition({ x: 0, y: 0 });
      setIsSaving(false);
      setImageLoaded(false);
    }
  }, [isOpen, imageSrc]);

  const handleImageLoad = useCallback(() => {
    const imgEl = imageRef.current;
    if (!imgEl) return;
    setImageLoaded(true);

    const imgDisplayW = imgEl.offsetWidth;
    const imgDisplayH = imgEl.offsetHeight;
    const smaller = Math.min(imgDisplayW, imgDisplayH);

    if (smaller > 0) {
      const fitZoom = Math.max(0.1, CROP_SIZE / smaller);
      setMinZoom(Math.min(fitZoom * 0.5, 0.8));
      setZoom(Math.max(fitZoom, 0.5));
    }
  }, []);

  if (!isOpen) return null;

  const clampZoom = (v: number) => Math.min(MAX_ZOOM, Math.max(minZoom, v));

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

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist.current = Math.hypot(dx, dy);
      pinchStartZoom.current = zoom;
      setIsDragging(false);
      return;
    }

    const touch = e.touches[0];
    if (!touch) return;
    setIsDragging(true);
    setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDist.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / pinchStartDist.current;
      setZoom(clampZoom(pinchStartZoom.current * scale));
      return;
    }

    if (!isDragging) return;
    const touch = e.touches[0];
    if (!touch) return;
    setPosition({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    pinchStartDist.current = null;
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    setZoom((prev) => clampZoom(prev + delta));
  };

  const handleSave = async () => {
    if (!imageRef.current) return;
    setIsSaving(true);

    try {
      const imgEl = imageRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 400, 400);

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imageSrc;

        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            const k = 400 / CROP_SIZE;
            const canvasImageWidth = imgEl.offsetWidth * zoom * k;
            const canvasImageHeight = imgEl.offsetHeight * zoom * k;
            const dx_canvas = 200 + position.x * k;
            const dy_canvas = 200 + position.y * k;
            const x_canvas = dx_canvas - canvasImageWidth / 2;
            const y_canvas = dy_canvas - canvasImageHeight / 2;

            ctx.drawImage(img, x_canvas, y_canvas, canvasImageWidth, canvasImageHeight);
            resolve();
          };
          img.onerror = reject;
        });

        const base64 = canvas.toDataURL("image/jpeg", 0.92);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-[360px] rounded-2xl overflow-hidden shadow-xl flex flex-col border border-[#e8e3d9] animate-in fade-in zoom-in-95 duration-150">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#e8e3d9]">
          <span className="font-semibold text-foreground text-[16px]">{t("settingsPage.cropPhoto", "Обрезка фото")}</span>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="p-1 rounded-full text-muted-foreground hover:bg-[#f1ede4] transition-colors disabled:opacity-50"
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
          onWheel={handleWheel}
          className="relative w-full aspect-square bg-[#0c0f1d] overflow-hidden flex items-center justify-center cursor-move select-none touch-none"
        >
          <img
            ref={imageRef}
            src={imageSrc}
            alt="Source"
            onLoad={handleImageLoad}
            className="max-w-none max-h-none pointer-events-none"
            style={{
              width: "80%",
              height: "auto",
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              opacity: imageLoaded ? 1 : 0,
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
        <div className="p-4 space-y-4 bg-[#faf8f4] border-t border-[#e8e3d9]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setZoom((z) => clampZoom(z - 0.2))}
              disabled={isSaving}
              className="p-1 rounded-lg hover:bg-[#f1ede4] transition-colors disabled:opacity-50"
            >
              <ZoomOut className="w-4 h-4 text-muted-foreground" />
            </button>
            <input
              type="range"
              min={minZoom}
              max={MAX_ZOOM}
              step="0.01"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              disabled={isSaving}
              className="flex-1 h-1.5 bg-[#e8e3d9] rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => clampZoom(z + 0.2))}
              disabled={isSaving}
              className="p-1 rounded-lg hover:bg-[#f1ede4] transition-colors disabled:opacity-50"
            >
              <ZoomIn className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            {Math.round(zoom * 100)}%
          </p>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 py-2.5 rounded-xl border border-[#e8e3d9] bg-white text-sm font-semibold text-muted-foreground hover:bg-[#faf8f4] transition-colors disabled:opacity-50"
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
