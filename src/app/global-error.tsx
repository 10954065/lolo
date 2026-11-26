"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-GH">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1.5rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>The election platform is temporarily unavailable</h1>
        <p style={{ color: "#555", marginBottom: "1.5rem" }}>
          Please try again in a moment. If you were voting, your ballot is only recorded when you see the
          confirmation page.
        </p>
        {error.digest ? <p style={{ fontFamily: "monospace" }}>Reference: {error.digest}</p> : null}
        <button
          type="button"
          onClick={reset}
          style={{ background: "#B5171E", color: "#fff", border: 0, borderRadius: 8, padding: "0.6rem 1.2rem" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
