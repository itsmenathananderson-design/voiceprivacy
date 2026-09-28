"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function format(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function CountdownTimer({ expiresAt, prefix = "Expires in" }: { expiresAt: string; prefix?: string }) {
  const router = useRouter();
  const target = new Date(expiresAt).getTime();
  const [left, setLeft] = useState(() => target - Date.now());

  useEffect(() => {
    const tick = () => {
      const remaining = target - Date.now();
      setLeft(remaining);
      if (remaining <= 0) { clearInterval(id); router.refresh(); }
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [target, router]);

  if (left <= 0) return <span className="timer">Expired</span>;
  return <span className="timer" role="timer">{prefix} {format(left)}</span>;
}
