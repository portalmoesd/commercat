import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <h2 className="text-lg font-medium text-charcoal mb-2">
          Page not found
        </h2>
        <p className="text-sm text-gray-dark mb-6">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="px-6 py-2 text-sm font-medium bg-charcoal text-white rounded-lg hover:bg-charcoal/90 transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
