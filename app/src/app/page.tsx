import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 h-14 border-b border-gray-light bg-white/95 backdrop-blur-sm">
        <span className="font-mono text-sm font-medium tracking-wide text-charcoal">
          commercat
        </span>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-xs text-gray-dark hover:text-charcoal transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="text-xs px-4 py-1.5 bg-charcoal text-white rounded-lg hover:bg-charcoal/90 transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <div className="max-w-xl text-center">
          <h1 className="text-4xl md:text-5xl font-light tracking-tight text-charcoal leading-tight mb-6">
            Shop Taobao, Tmall &amp; 1688
            <br />
            <span className="font-medium">with AI.</span>
          </h1>
          <p className="text-base text-gray-dark leading-relaxed mb-8 max-w-md mx-auto">
            Describe what you want or upload a photo. Commercat finds it on
            Chinese marketplaces, shows prices in your currency, and purchases it
            in your name.
          </p>
          <Link
            href="/signup"
            className="inline-block px-8 py-3 text-sm font-medium bg-charcoal text-white rounded-lg hover:bg-charcoal/90 transition-colors"
          >
            Start shopping
          </Link>
        </div>

        {/* How it works */}
        <div className="mt-20 w-full max-w-3xl">
          <h2 className="text-center text-xs font-medium text-gray-mid tracking-widest uppercase mb-8">
            How it works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              {
                step: "01",
                title: "Describe or upload",
                desc: "Tell the AI what you want, or upload a photo to find similar items.",
              },
              {
                step: "02",
                title: "Browse results",
                desc: "See products from Taobao, 1688, Tmall and Pinduoduo with prices in your currency.",
              },
              {
                step: "03",
                title: "Pay securely",
                desc: "Choose size and colour, then pay. We purchase the item in your name.",
              },
              {
                step: "04",
                title: "Track delivery",
                desc: "Follow your order to your freight forwarder\u2019s China warehouse.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center md:text-left">
                <span className="font-mono text-xs text-accent font-medium">
                  {item.step}
                </span>
                <h3 className="text-sm font-medium text-charcoal mt-1 mb-1">
                  {item.title}
                </h3>
                <p className="text-xs text-gray-dark leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="mt-20 w-full max-w-2xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                title: "30+ currencies",
                desc: "Prices auto-detected in your local currency",
              },
              {
                title: "Photo search",
                desc: "Upload any image to find similar products",
              },
              {
                title: "Agency model",
                desc: "Every order placed in your name to your forwarder",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="bg-white border border-gray-light rounded-lg p-4 text-center"
              >
                <h3 className="text-sm font-medium text-charcoal mb-1">
                  {feature.title}
                </h3>
                <p className="text-xs text-gray-dark">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-light px-6 py-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <span className="font-mono text-xs text-gray-mid">
            commercat
          </span>
          <span className="text-xs text-gray-mid">
            Your purchasing agent for Chinese marketplaces
          </span>
        </div>
      </footer>
    </div>
  );
}
