"use client";

import { useState } from "react";
import { apiUrl } from "@/lib/api-client";

// What fills a dish's photo slot wherever the kiosk pictures it (menu rows, the item
// sheet, the basket, checkout): the product's photo when it has one, otherwise its icon.
// If the photo can't be loaded (say the connection drops), the icon takes its place
// rather than a broken-image box. The slot itself supplies the category colour behind
// the icon and the size; the photo covers it, cropped to fill.
//
// The photo is decorative (alt=""): the dish's name is always written right beside it.
interface ProductPhotoProps {
  imageUrl: string | null | undefined;
  icon: string | null;
  /** Size of the icon, for when there's no photo. */
  iconClassName: string;
  /** Load at once instead of when scrolled near: for a photo that's on screen right away. */
  eager?: boolean;
}

export function ProductPhoto({ imageUrl, icon, iconClassName, eager = false }: ProductPhotoProps) {
  // Remembers which photo failed, so a new photo (a new URL) gets its own try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (imageUrl && imageUrl !== failedUrl) {
    return (
      // A small WebP the API already sized (apps/web/src/lib/imageResize.ts), from another
      // origin; next/image's resizing would add nothing.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={apiUrl(imageUrl)}
        alt=""
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        onError={() => setFailedUrl(imageUrl)}
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <span aria-hidden="true" className={`flex h-full w-full items-center justify-center ${iconClassName}`}>
      {icon}
    </span>
  );
}
