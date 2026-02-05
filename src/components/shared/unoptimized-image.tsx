/* eslint-disable @next/next/no-img-element */

import * as React from "react";

export type UnoptimizedImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "alt"> & {
  alt: string;
};

export function UnoptimizedImage({ alt, ...props }: UnoptimizedImageProps) {
  return <img alt={alt} {...props} />;
}
