"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .then((registration) => {
            // Check for updates periodically (every 60 minutes)
            setInterval(
              () => {
                registration.update();
              },
              60 * 60 * 1000
            );
          })
          .catch(() => {
            // SW registration failed silently
          });
      });
    }
  }, []);

  return null;
}
