"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useCurrency } from "@/lib/currency-context";
import type { User } from "@/types";
import Link from "next/link";

export default function SettingsPage() {
  const supabase = createBrowserClient();
  const { currencyCode, setCurrency, supportedCurrencies } = useCurrency();

  const [profile, setProfile] = useState<Partial<User>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfile(data);
        // Sync currency context with DB-stored preference
        if (data.preferred_currency) {
          setCurrency(data.preferred_currency);
        }
      }
      setLoading(false);
    }
    loadProfile();
  }, [supabase]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("users")
      .update({
        full_name: profile.full_name,
        phone: profile.phone,
        preferred_forwarder: profile.preferred_forwarder,
        forwarder_address: profile.forwarder_address,
        size_profile: profile.size_profile,
        preferred_currency: currencyCode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-sm text-gray-mid">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="flex items-center justify-between px-4 h-14 border-b border-gray-light bg-white/95 backdrop-blur-sm">
        <Link
          href="/chat"
          className="font-mono text-sm font-medium tracking-wide text-charcoal"
        >
          commercat
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/orders"
            className="text-xs text-gray-dark hover:text-charcoal transition-colors"
          >
            Orders
          </Link>
          <span className="text-xs font-medium text-charcoal">Settings</span>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <h1 className="text-lg font-medium">Settings</h1>

        {/* Profile */}
        <section className="bg-white border border-gray-light rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-medium">Profile</h2>
          <div>
            <label className="text-xs text-gray-dark block mb-1">
              Full name
            </label>
            <input
              value={profile.full_name ?? ""}
              onChange={(e) =>
                setProfile((p) => ({ ...p, full_name: e.target.value }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-light rounded-lg bg-white focus:outline-none focus:border-charcoal"
            />
          </div>
          <div>
            <label className="text-xs text-gray-dark block mb-1">Phone</label>
            <input
              value={profile.phone ?? ""}
              onChange={(e) =>
                setProfile((p) => ({ ...p, phone: e.target.value }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-light rounded-lg bg-white focus:outline-none focus:border-charcoal"
            />
          </div>
        </section>

        {/* Currency */}
        <section className="bg-white border border-gray-light rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-medium">Currency</h2>
          <p className="text-xs text-gray-dark">
            Prices will be displayed in your chosen currency. All payments are
            processed in GEL.
          </p>
          <select
            value={currencyCode}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-light rounded-lg bg-white focus:outline-none focus:border-charcoal"
          >
            {supportedCurrencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.symbol} {c.code} — {c.name}
              </option>
            ))}
          </select>
        </section>

        {/* Freight forwarder */}
        <section className="bg-white border border-gray-light rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-medium">Freight forwarder</h2>
          <div>
            <label className="text-xs text-gray-dark block mb-1">
              Preferred forwarder
            </label>
            <select
              value={profile.preferred_forwarder ?? ""}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  preferred_forwarder: (e.target.value || null) as User["preferred_forwarder"],
                }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-light rounded-lg bg-white focus:outline-none focus:border-charcoal"
            >
              <option value="">Select...</option>
              <option value="mygeo">MyGeo</option>
              <option value="express_georgia">Express Georgia</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-dark block mb-1">
              China warehouse address
            </label>
            <textarea
              value={profile.forwarder_address ?? ""}
              onChange={(e) =>
                setProfile((p) => ({ ...p, forwarder_address: e.target.value }))
              }
              placeholder="Your personal cabinet address at the forwarder's China warehouse"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-light rounded-lg bg-white resize-none focus:outline-none focus:border-charcoal"
            />
          </div>
        </section>

        {/* Size profile */}
        <section className="bg-white border border-gray-light rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-medium">Size profile</h2>
          <p className="text-xs text-gray-dark">
            Used by the AI for sizing recommendations.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-dark block mb-1">
                Clothing
              </label>
              <select
                value={profile.size_profile?.clothing ?? ""}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    size_profile: {
                      ...p.size_profile,
                      clothing: e.target.value,
                    },
                  }))
                }
                className="w-full px-3 py-2 text-sm border border-gray-light rounded-lg bg-white"
              >
                <option value="">-</option>
                {["XS", "S", "M", "L", "XL", "XXL", "3XL"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-dark block mb-1">
                Shoes (EU)
              </label>
              <select
                value={profile.size_profile?.shoes ?? ""}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    size_profile: {
                      ...p.size_profile,
                      shoes: e.target.value,
                    },
                  }))
                }
                className="w-full px-3 py-2 text-sm border border-gray-light rounded-lg bg-white"
              >
                <option value="">-</option>
                {Array.from({ length: 16 }, (_, i) => 35 + i).map((s) => (
                  <option key={s} value={String(s)}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Subscription info */}
        <section className="bg-white border border-gray-light rounded-lg p-4">
          <h2 className="text-sm font-medium mb-1">Subscription</h2>
          <p className="text-xs text-gray-dark">
            Current plan:{" "}
            <span className="font-medium text-charcoal capitalize">
              {profile.subscription_tier ?? "free"}
            </span>
          </p>
          {(profile.wallet_balance_gel ?? 0) > 0 && (
            <p className="text-xs text-gray-dark mt-1">
              Wallet balance:{" "}
              <span className="font-mono font-medium text-green">
                {profile.wallet_balance_gel?.toFixed(2)} GEL
              </span>
            </p>
          )}
        </section>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 text-sm font-medium bg-charcoal text-white rounded-lg hover:bg-charcoal/90 transition-colors disabled:opacity-40"
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
