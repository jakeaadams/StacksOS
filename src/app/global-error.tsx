"use client";

import { useEffect } from "react";
import Link from "next/link";
import { clientLogger } from "@/lib/client-logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    clientLogger.error("Global application error:", error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          backgroundColor: "#fafafa",
          padding: "2rem",
        }}>
          <div style={{ textAlign: "center", maxWidth: "400px" }}>
            <div style={{
              fontSize: "4rem",
              marginBottom: "1rem",
            }}>
              ⚠️
            </div>
            
            <h1 style={{
              fontSize: "1.5rem",
              fontWeight: "bold",
              marginBottom: "0.5rem",
              color: "#1a1a1a",
            }}>
              Critical Error
            </h1>
            
            <p style={{
              color: "#666",
              marginBottom: "1.5rem",
            }}>
              A critical error has occurred. Please try refreshing the page.
            </p>

            {error.digest && (
              <p style={{
                fontSize: "0.75rem",
                color: "#999",
                fontFamily: "monospace",
                marginBottom: "1.5rem",
              }}>
                Error ID: {error.digest}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button
                onClick={reset}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#0070f3",
                  color: "white",
                  border: "none",
                  borderRadius: "0.375rem",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
	              >
	                Try Again
	              </button>
	              <Link
	                href="/"
	                style={{
	                  padding: "0.5rem 1rem",
	                  backgroundColor: "white",
	                  color: "#333",
	                  border: "1px solid #ddd",
	                  borderRadius: "0.375rem",
	                  textDecoration: "none",
	                  fontWeight: 500,
	                }}
	              >
	                Go Home
	              </Link>
	            </div>
	          </div>
	        </div>
	      </body>
    </html>
  );
}
