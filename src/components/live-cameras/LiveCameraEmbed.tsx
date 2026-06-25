"use client";

import type { ArgusLiveCamera } from "@/types/liveCamera";

interface Props {
  camera: ArgusLiveCamera;
}

export default function LiveCameraEmbed({ camera }: Props) {
  const canEmbed = camera.embedAllowed && Boolean(camera.embedUrl);

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black">
      <div className="aspect-video">
        {canEmbed ? (
          <iframe
            src={camera.embedUrl}
            title={`Camara publica sin audio: ${camera.title}`}
            className="h-full w-full"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-violet-300/30 bg-violet-400/10 font-mono text-sm font-bold text-violet-100">
              C
            </span>
            <p className="mt-4 text-sm font-bold uppercase text-white">
              Embed restringido
            </p>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
              Esta fuente publica no permite reproduccion interna o requiere
              abrirse en el sitio de origen.
            </p>
          </div>
        )}
      </div>
      <p className="border-t border-white/10 px-3 py-2 text-xs leading-5 text-slate-400">
        Audio apagado por defecto. Si el video no carga, abra la fuente original.
      </p>
    </div>
  );
}
