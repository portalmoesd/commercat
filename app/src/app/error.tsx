"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <h2 className="text-lg font-medium text-charcoal mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-gray-dark mb-6">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="px-6 py-2 text-sm font-medium bg-charcoal text-white rounded-lg hover:bg-charcoal/90 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
