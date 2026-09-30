"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AvatarImageError,
  loadAvatarImage,
  renderAvatarBlob,
} from "@/lib/avatar-image";

/** Side of the round viewport, in CSS pixels. */
const VIEWPORT = 288;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

type AvatarCropDialogProps = {
  file: File;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: (image: Blob) => void;
  /** Called when the file turns out not to be a picture we can read. */
  onUnreadable: () => void;
};

type Frame = {
  /** Viewport pixels per source pixel, at zoom 1. */
  base: number;
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Pick the part of the picture that becomes the avatar: drag to move it, the
 * slider or the wheel to zoom.
 *
 * The square is measured against the source image at its own resolution, and
 * only that square is ever rendered, so zooming in costs no sharpness until
 * the reader passes the picture's real size.
 */
export function AvatarCropDialog({
  file,
  isSaving,
  onCancel,
  onConfirm,
  onUnreadable,
}: AvatarCropDialogProps) {
  const t = useTranslations("settings.account");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  // Read by the wheel listener, which is attached once and would otherwise
  // keep zooming from whatever the zoom was when it was attached.
  const zoomRef = useRef(1);

  useEffect(() => {
    let isMounted = true;

    loadAvatarImage(file)
      .then((loaded) => {
        if (!isMounted) return;
        // At zoom 1 the picture exactly covers the circle along its shorter
        // side; the rest hangs outside and can be dragged into view.
        const base =
          VIEWPORT / Math.min(loaded.naturalWidth, loaded.naturalHeight);
        const width = loaded.naturalWidth * base;
        const height = loaded.naturalHeight * base;
        setImage(loaded);
        setFrame({ base, width, height });
        setZoom(1);
        setOffset({ x: (VIEWPORT - width) / 2, y: (VIEWPORT - height) / 2 });
      })
      .catch((error) => {
        if (!isMounted) return;
        if (error instanceof AvatarImageError) onUnreadable();
      });

    return () => {
      isMounted = false;
    };
  }, [file, onUnreadable]);

  const clampOffset = useCallback(
    (next: { x: number; y: number }, currentZoom: number) => {
      if (!frame) return next;
      const width = frame.width * currentZoom;
      const height = frame.height * currentZoom;
      return {
        x: clamp(next.x, VIEWPORT - width, 0),
        y: clamp(next.y, VIEWPORT - height, 0),
      };
    },
    [frame],
  );

  const applyZoom = useCallback(
    (nextZoom: number) => {
      const target = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      setZoom((currentZoom) => {
        // Zoom around the middle of the circle, so what the reader centred
        // stays centred instead of drifting towards a corner.
        setOffset((currentOffset) => {
          const ratio = target / currentZoom;
          const centre = VIEWPORT / 2;
          return clampOffset(
            {
              x: centre - (centre - currentOffset.x) * ratio,
              y: centre - (centre - currentOffset.y) * ratio,
            },
            target,
          );
        });
        return target;
      });
    },
    [clampOffset],
  );

  // The picture is held as an object URL for as long as it is on screen.
  useEffect(() => {
    if (!image) return;
    return () => URL.revokeObjectURL(image.src);
  }, [image]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // The page behind must hold still while a dialog is open over it.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Attached by hand rather than through onWheel: React listens passively, so
  // the scroll cannot be called off there and the page slides away under the
  // reader while they are zooming.
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      applyZoom(zoomRef.current - event.deltaY * 0.002);
    }

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [applyZoom]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) onCancel();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isSaving, onCancel]);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!frame || isSaving) return;
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragRef.current;
    if (!start) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    dragRef.current = { x: event.clientX, y: event.clientY };
    setOffset((current) =>
      clampOffset({ x: current.x + deltaX, y: current.y + deltaY }, zoom),
    );
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function handleConfirm() {
    if (!image || !frame || isSaving) return;

    // Back from viewport pixels to the picture's own pixels.
    const sourcePerViewport = 1 / (frame.base * zoom);
    try {
      onConfirm(
        await renderAvatarBlob(
          image,
          -offset.x * sourcePerViewport,
          -offset.y * sourcePerViewport,
          VIEWPORT * sourcePerViewport,
        ),
      );
    } catch {
      // A canvas that refuses to give up its bytes leaves nothing to send.
      onUnreadable();
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-content/50 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-crop-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSaving) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-subtle bg-surface p-6 shadow-2xl shadow-black/20">
        <h2
          id="avatar-crop-title"
          className="font-serif text-2xl font-semibold leading-tight text-content"
        >
          {t("avatarCropTitle")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          {t("avatarCropHint")}
        </p>

        <div
          ref={viewportRef}
          className="relative mx-auto mt-5 touch-none overflow-hidden rounded-full border border-subtle bg-app"
          style={{ width: VIEWPORT, height: VIEWPORT, maxWidth: "100%" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {image && frame ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.src}
              alt=""
              draggable={false}
              className="absolute max-w-none cursor-grab select-none active:cursor-grabbing"
              style={{
                width: frame.width * zoom,
                height: frame.height * zoom,
                left: offset.x,
                top: offset.y,
              }}
            />
          ) : (
            <span className="absolute inset-0 animate-pulse bg-surface-hover" />
          )}
        </div>

        <label className="mt-5 flex items-center gap-3">
          <span className="text-xs font-black uppercase tracking-[0.12em] text-muted">
            {t("avatarZoom")}
          </span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!image || isSaving}
            onChange={(event) => applyZoom(Number(event.target.value))}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-subtle accent-action"
          />
        </label>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!image || isSaving}
            className="min-h-11 flex-1 cursor-pointer rounded-md bg-action px-5 py-2.5 text-center text-sm font-black text-on-action transition hover:bg-action-hover disabled:cursor-wait disabled:opacity-60"
          >
            {isSaving ? t("avatarSaving") : t("avatarCropSave")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="min-h-11 flex-1 cursor-pointer rounded-md border border-subtle bg-surface px-5 py-2.5 text-center text-sm font-black text-content transition hover:bg-surface-hover disabled:opacity-60"
          >
            {t("avatarCropCancel")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
