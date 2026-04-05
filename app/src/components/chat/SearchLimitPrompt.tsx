"use client";

interface SearchLimitPromptProps {
  limit: number;
  trialClaimed: boolean;
  onStartTrial?: () => void;
}

export function SearchLimitPrompt({
  limit,
  trialClaimed,
  onStartTrial,
}: SearchLimitPromptProps) {
  return (
    <div className="bg-accent-light border border-accent/20 rounded-lg p-4 max-w-sm">
      <p className="text-sm text-charcoal mb-2">
        You&apos;ve used your {limit} free searches for today. Your searches
        reset at midnight.
      </p>

      {!trialClaimed ? (
        <>
          <p className="text-sm text-gray-dark mb-3">
            Want more? Pro gives you 50 searches/day, 1.2% cashback, and price
            drop alerts — $5/month after a free 30-day trial.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onStartTrial}
              className="px-4 py-2 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
            >
              Start free trial
            </button>
            <button className="px-4 py-2 text-xs font-medium text-gray-dark hover:text-charcoal transition-colors">
              Maybe later
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-dark mb-3">
            Upgrade to Pro for 50 searches/day, 1.2% cashback, and price drop
            alerts — just $5/month.
          </p>
          <button className="px-4 py-2 text-xs font-medium bg-charcoal text-white rounded-lg hover:bg-charcoal/90 transition-colors">
            Upgrade to Pro
          </button>
        </>
      )}
    </div>
  );
}
