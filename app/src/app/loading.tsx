export default function Loading() {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="flex gap-1">
        <span className="w-2 h-2 bg-gray-mid rounded-full animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 bg-gray-mid rounded-full animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 bg-gray-mid rounded-full animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}
