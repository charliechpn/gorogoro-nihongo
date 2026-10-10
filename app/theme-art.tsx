import type { ImgHTMLAttributes } from 'react';

type ThemeArtProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  darkSrc: string;
};

export default function ThemeArt({ src, darkSrc, className = '', alt = '', ...props }: ThemeArtProps) {
  return <>
    <img {...props} className={`${className} theme-art-light`.trim()} src={src} alt={alt} />
    <img {...props} className={`${className} theme-art-dark`.trim()} src={darkSrc} alt={alt} />
  </>;
}
