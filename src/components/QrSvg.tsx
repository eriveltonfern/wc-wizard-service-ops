import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** QR desenhado no navegador (sem serviço externo). */
export function QrSvg({ value, label, className, style }: { value: string; label: string; className?: string; style?: React.CSSProperties }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    void QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then((s) => { if (alive) setSvg(s); });
    return () => { alive = false; };
  }, [value]);
  return <div role="img" aria-label={label} data-url={value} style={style} className={`[&>svg]:h-full [&>svg]:w-full ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
