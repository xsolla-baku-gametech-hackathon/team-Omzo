"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";

interface CampaignData {
  id: string;
  title: string;
  ndaBodyMd: string;
}

function validateFullName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Zəhmət olmasa tam ad və soyadınızı yazın.";
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) {
    return "Həm ad, həm də soyad daxil edilməlidir (məsələn: Əli Əliyev və ya John Doe). Tək ad qəbul edilmir.";
  }
  if (parts.some((p) => p.length < 2)) {
    return "Ad və soyadın hər biri ən azı 2 hərfdən ibarət olmalıdır.";
  }
  const validCharsRegex = /^[\p{L}][\p{L}'-.]*(?:\s+[\p{L}][\p{L}'-.]*)+$/u;
  if (!validCharsRegex.test(trimmed)) {
    return "Ad və soyadda rəqəm və ya xüsusi simvollar ola bilməz.";
  }
  return null;
}

export default function NdaSigningPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.campaignId as string;

  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [typedName, setTypedName] = useState("");
  const [typedNameTouched, setTypedNameTouched] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [isHuman, setIsHuman] = useState(false);
  const [birthDate, setBirthDate] = useState("2000-01-01");
  const [linkedInVerified, setLinkedInVerified] = useState(false);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameError = useMemo(() => {
    if (!typedNameTouched && !typedName) return null;
    return validateFullName(typedName);
  }, [typedName, typedNameTouched]);

  const isFormValid = useMemo(() => {
    if (alreadySigned) return true;
    return (
      agreed &&
      isHuman &&
      validateFullName(typedName) === null &&
      Boolean(birthDate)
    );
  }, [alreadySigned, agreed, isHuman, typedName, birthDate]);

  useEffect(() => {
    async function load() {
      try {
        const [cRes, ndaRes] = await Promise.all([
          fetch(`/api/campaigns/${campaignId}`),
          fetch(`/api/campaigns/${campaignId}/nda`),
        ]);

        if (!cRes.ok) throw new Error("Failed to load campaign.");
        const cData = await cRes.json();
        setCampaign(cData.campaign);

        if (ndaRes.status === 401) {
          router.push(`/login?redirect=/play/${campaignId}/nda`);
          return;
        }

        if (ndaRes.ok) {
          const ndaData = await ndaRes.json();
          if (ndaData.signed) {
            setAlreadySigned(true);
            setTypedName(ndaData.signature?.typedName ?? "");
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Error loading campaign.",
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [campaignId, router]);

  async function handleSignAndProceed(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid) return;
    setError(null);
    setSubmitting(true);

    try {
      if (!alreadySigned) {
        const validation = validateFullName(typedName);
        if (validation !== null) {
          throw new Error(validation);
        }

        const signRes = await fetch(`/api/campaigns/${campaignId}/nda`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            typedName: typedName.trim(),
            birthDate: birthDate || undefined,
          }),
        });

        const signData = await signRes.json();
        if (!signRes.ok) {
          throw new Error(signData.message || "Failed to sign NDA.");
        }
      }

      // Request personal access token
      const accessRes = await fetch(`/api/campaigns/${campaignId}/access`, {
        method: "POST",
      });
      const accessData = await accessRes.json();
      if (!accessRes.ok) {
        throw new Error(accessData.message || "Failed to issue access grant.");
      }

      router.push(accessData.accessUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to obtain access.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-sm text-slate">
        Loading agreement...
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="border border-hairline bg-raised p-6 rounded-sm text-center">
          <p className="text-sm text-slate">{error || "Campaign not found."}</p>
          <Link
            href="/play"
            className="mt-4 inline-block text-xs font-medium underline"
          >
            Back to campaigns
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-hairline bg-raised px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-semibold text-lg tracking-tight">
              Repro
            </Link>
            <span className="text-hairline">/</span>
            <Link
              href="/play"
              className="text-sm font-medium text-slate hover:text-ink"
            >
              Play
            </Link>
            <span className="text-hairline">/</span>
            <span className="text-sm font-medium text-slate">
              Confidentiality &amp; NDA
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            {campaign.title}
          </h1>
          <p className="text-sm text-slate mt-1">
            Sign the legal confidentiality agreement to unlock your unique
            watermarked build access.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-sm">
            {error}
          </div>
        )}

        {alreadySigned && (
          <div className="mb-6 p-4 bg-teal-50 border border-teal-200 text-teal-800 text-sm rounded-sm flex items-center justify-between">
            <div>
              <span className="font-semibold">NDA previously signed</span> by{" "}
              {typedName}.
            </div>
            <button
              type="button"
              onClick={handleSignAndProceed}
              disabled={submitting}
              className="py-1.5 px-3 bg-teal-800 text-white text-xs font-medium rounded-sm hover:opacity-90 transition-opacity"
            >
              {submitting ? "Launching..." : "Launch Session →"}
            </button>
          </div>
        )}

        <div className="border border-hairline bg-raised rounded-sm overflow-hidden mb-8">
          <div className="px-6 py-3 border-b border-hairline bg-paper flex items-center justify-between">
            <span className="text-xs font-medium text-slate uppercase tracking-wider">
              Legal Terms &amp; Conditions
            </span>
            <span className="text-xs text-slate font-mono">
              Forensic traceable
            </span>
          </div>

          <div className="p-8 font-sans text-sm leading-relaxed whitespace-pre-wrap text-ink/90 border-b border-hairline max-h-80 overflow-y-auto">
            {campaign.ndaBodyMd}
          </div>

          <form
            onSubmit={handleSignAndProceed}
            className="p-8 space-y-6 bg-paper"
          >
            {!alreadySigned && (
              <>
                {/* 1. Full Name Signing with validation */}
                <div>
                  <label
                    htmlFor="typedName"
                    className="block text-xs font-medium text-slate uppercase mb-1"
                  >
                    Full Legal Name (First and Last Name / Ad və Soyad)
                  </label>
                  <input
                    id="typedName"
                    type="text"
                    required
                    value={typedName}
                    onChange={(e) => {
                      setTypedName(e.target.value);
                      if (!typedNameTouched) setTypedNameTouched(true);
                    }}
                    onBlur={() => setTypedNameTouched(true)}
                    className={`w-full max-w-md px-3 py-2 border rounded-sm text-sm font-medium focus:outline-none ${
                      nameError
                        ? "border-red-400 bg-red-50/50 text-red-900 focus:border-red-500"
                        : "border-hairline bg-raised text-ink focus:border-ink"
                    }`}
                    placeholder="e.g. John Doe və ya Əli Əliyev"
                  />
                  {nameError ? (
                    <p className="text-xs text-red-600 mt-1 font-medium">
                      ⚠️ {nameError}
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate mt-1">
                      Həm adınızı, həm də soyadınızı tam daxil etməlisiniz. Bu
                      məlumat hüquqi sənəddə imzanız kimi qeydə alınır.
                    </p>
                  )}
                </div>

                {/* 2. Age (18+) Gate */}
                <div className="border border-hairline bg-raised/60 p-4 rounded-sm space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate">
                    Yaş Təsdiqi (18+)
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div>
                      <label
                        htmlFor="birthDate"
                        className="block text-xs text-slate mb-1"
                      >
                        Doğum Tarixi:
                      </label>
                      <input
                        id="birthDate"
                        type="date"
                        required
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        className="px-3 py-1.5 border border-hairline bg-paper text-ink text-sm rounded-sm focus:outline-none focus:border-ink"
                      />
                    </div>
                    <div className="text-xs text-slate leading-relaxed sm:pt-4">
                      ✓ Konfidensial NDA sənədlərini imzalamaq üçün ən azı 18
                      yaşınız olmalıdır.
                    </div>
                  </div>
                </div>

                {/* 3. Real Human / Bot Protection & LinkedIn Verification Card */}
                <div className="border border-hairline bg-raised/60 p-4 rounded-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate">
                      İnsan və Profil Doğrulaması (Bot Əleyhinə)
                    </div>
                    {linkedInVerified && (
                      <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-xs">
                        ✓ Verified Human
                      </span>
                    )}
                  </div>

                  <div className="border border-blue-200 bg-blue-50/40 p-3 rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xs bg-[#0A66C2] text-white flex items-center justify-center font-bold text-xs shrink-0">
                        in
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-ink">
                          LinkedIn Professional Tester Təsdiqi
                        </div>
                        <div className="text-[11px] text-slate">
                          {linkedInVerified
                            ? "Hesabınız real peşəkar tester kimi təsdiqləndi."
                            : "Real insan olduğunuzu təsdiqləyərək bot şübhəsini aradan qaldırın."}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLinkedInVerified(!linkedInVerified)}
                      className="px-3 py-1.5 border border-[#0A66C2] text-[#0A66C2] hover:bg-[#0A66C2] hover:text-white text-xs font-medium rounded-xs transition-colors shrink-0"
                    >
                      {linkedInVerified
                        ? "✓ Təsdiqləndi"
                        : "LinkedIn ilə Doğrula"}
                    </button>
                  </div>

                  <div className="flex items-start gap-2 pt-1">
                    <input
                      id="isHuman"
                      type="checkbox"
                      required
                      checked={isHuman}
                      onChange={(e) => setIsHuman(e.target.checked)}
                      className="mt-1"
                    />
                    <label
                      htmlFor="isHuman"
                      className="text-xs text-slate leading-relaxed"
                    >
                      Təsdiqləyirəm ki, mən <strong>real insanam</strong>,
                      avtomatlaşdırılmış bot və ya skreyper deyiləm.
                    </label>
                  </div>
                </div>

                {/* 4. Forensic Watermark & Legal Terms Acknowledgement */}
                <div className="flex items-start gap-2">
                  <input
                    id="agree"
                    type="checkbox"
                    required
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-1"
                  />
                  <label
                    htmlFor="agree"
                    className="text-xs text-slate leading-relaxed"
                  >
                    Yuxarıdakı konfidensiallıq şərtlərini qəbul edirəm və başa
                    düşürəm ki, oyun kadrları sızmaların qarşısını almaq üçün
                    şəxsi <strong>məhkəmə-tibbi (forensik) su nişanı</strong>{" "}
                    ilə qorunur.
                  </label>
                </div>

                {/* 5. Privacy Notice */}
                <div className="p-3 bg-paper border border-hairline rounded-sm text-[11px] text-slate leading-relaxed">
                  🔒 <strong>Anonimlik və Məxfilik Təminatı:</strong> Sizin
                  hüquqi adınız və LinkedIn məlumatlarınız Repro tərəfindən
                  ciddi şəkildə şifrələnərək gizli saxlanılır. Oyun studiyaları
                  yalnız sizin anonim <strong>Tester ID</strong>-nizi və təsdiq
                  nişanınızı görür. Məlumatlarınız heç bir halda üçüncü
                  tərəflərə satılmır və ya ötürülmür.
                </div>
              </>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting || !isFormValid}
                className="py-2.5 px-6 bg-ink text-paper text-sm font-medium rounded-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {submitting
                  ? "Emal edilir..."
                  : alreadySigned
                    ? "Sessiyanı Başlat →"
                    : "Müqaviləni İmzala və Davam Et →"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
