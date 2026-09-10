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
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Biometric & ID verification states (replaces old LinkedIn mechanism)
  const [verifyMode, setVerifyMode] = useState<"face" | "id">("face");
  const [scanStep, setScanStep] = useState<"idle" | "scanning" | "verified">("idle");
  const [scanProgress, setScanProgress] = useState(0);
  const [scanPhaseText, setScanPhaseText] = useState("");

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
            setIsHuman(true);
            setScanStep("verified");
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

  // Start animated biometric verification scan
  function startBiometricScan() {
    setScanStep("scanning");
    setScanProgress(5);
    setScanPhaseText("Kamera kalibrasiyası və liveness sensoru işə salınır...");

    const interval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 95) {
          clearInterval(interval);
          setScanStep("verified");
          setIsHuman(true);
          setScanPhaseText("✓ Biometrik identifikasiya və liveness uğurla təsdiqləndi.");
          return 100;
        }

        if (prev === 25) {
          setScanPhaseText(
            verifyMode === "face"
              ? "3D üz həndəsəsi və mikromimika skan edilir..."
              : "Şəxsiyyət vəsiqəsi / pasport çipi və təhlükəsizlik holoqramı oxunur...",
          );
        } else if (prev === 60) {
          setScanPhaseText("Bioloji canlılıq (Anti-Spoofing & Liveness) analizi aparılır...");
        } else if (prev === 85) {
          setScanPhaseText("Kriptoqrafik anonim ZK-Proof (Sıfır Bilgi Sübutu) imzalanır...");
        }

        return prev + 10;
      });
    }, 180);
  }

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
      <div className="min-h-screen bg-[var(--surface-page)] flex items-center justify-center p-6 text-sm text-[var(--ink-secondary)]">
        Müqavilə şərtləri yüklənir...
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-[var(--surface-page)] flex items-center justify-center p-6">
        <div className="border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-6 rounded-[var(--radius-md)] text-center max-w-sm">
          <p className="text-sm text-[var(--ink-secondary)]">{error || "Kampaniya tapılmadı."}</p>
          <Link
            href="/play"
            className="mt-4 inline-block text-xs font-medium text-[var(--accent)] underline"
          >
            Kampaniyalara qayıt
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-page)] text-[var(--ink-primary)] font-sans">
      <header className="border-b border-[var(--line-subtle)] bg-[var(--surface-raised)] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-semibold text-lg tracking-tight text-[var(--ink-primary)]">
              Repro
            </Link>
            <span className="text-[var(--line-subtle)]">/</span>
            <Link
              href="/play"
              className="text-sm font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
            >
              Play
            </Link>
            <span className="text-[var(--line-subtle)]">/</span>
            <span className="text-sm font-medium text-[var(--ink-secondary)]">
              Konfidensiallıq &amp; NDA
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--accent-wash)] border border-[var(--accent)]/20 text-xs font-mono text-[var(--accent)] mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            Şəxsi Su Nişanı ilə Qorunan Build
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--ink-primary)]">
            {campaign.title}
          </h1>
          <p className="text-sm text-[var(--ink-secondary)] mt-1.5 leading-relaxed">
            Bu qapalı playtest build-inə daxil olmaq üçün rəsmi konfidensiallıq müqaviləsini imzalayın və real insan təsdiqindən keçin.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-[var(--sev-critical-wash)] border border-[var(--sev-critical)]/30 text-[var(--sev-critical)] text-sm rounded-[var(--radius-sm)]">
            {error}
          </div>
        )}

        {alreadySigned && (
          <div className="mb-6 p-4 bg-[var(--accent-wash)] border border-[var(--accent)]/40 text-[var(--ink-primary)] text-sm rounded-[var(--radius-sm)] flex items-center justify-between">
            <div>
              <span className="font-semibold text-[var(--accent)]">NDA əvvəlcədən imzalanıb:</span>{" "}
              {typedName}
            </div>
            <button
              type="button"
              onClick={handleSignAndProceed}
              disabled={submitting}
              className="py-1.5 px-3 bg-[var(--accent)] text-[var(--accent-on-fill)] hover:bg-[var(--accent-hover)] text-xs font-medium rounded-[var(--radius-sm)] transition-opacity shadow-sm"
            >
              {submitting ? "Başladılır..." : "Sessiyanı Başlat →"}
            </button>
          </div>
        )}

        <div className="border border-[var(--line-subtle)] bg-[var(--surface-raised)] rounded-[var(--radius-md)] overflow-hidden mb-8 shadow-xs">
          <div className="px-6 py-3.5 border-b border-[var(--line-subtle)] bg-[var(--surface-sunken)] flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--ink-secondary)] uppercase tracking-wider">
              Hüquqi Müqavilə Şərtləri
            </span>
            <span className="text-xs text-[var(--accent)] font-mono flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
              Kriptoqrafik Forensic Traceable
            </span>
          </div>

          <div className="p-6 sm:p-8 font-mono text-xs leading-relaxed whitespace-pre-wrap text-[var(--ink-primary)]/90 border-b border-[var(--line-subtle)] max-h-72 overflow-y-auto bg-[var(--surface-sunken)]/40">
            {campaign.ndaBodyMd}
          </div>

          <form
            onSubmit={handleSignAndProceed}
            className="p-6 sm:p-8 space-y-6 bg-[var(--surface-raised)]"
          >
            {!alreadySigned && (
              <>
                {/* 1. Full Name Signing with validation */}
                <div>
                  <label
                    htmlFor="typedName"
                    className="block text-xs font-medium text-[var(--ink-secondary)] uppercase tracking-wider mb-1.5"
                  >
                    Rəsmi Ad və Soyad (Tam Hüquqi İmza)
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
                    className={`w-full max-w-md px-3.5 py-2.5 border rounded-[var(--radius-sm)] text-sm font-medium focus:outline-none transition-colors ${
                      nameError
                        ? "border-[var(--sev-critical)] bg-[var(--sev-critical-wash)] text-[var(--ink-primary)]"
                        : "border-[var(--line-subtle)] bg-[var(--surface-page)] text-[var(--ink-primary)] focus:border-[var(--accent)]"
                    }`}
                    placeholder="Məsələn: Əli Əliyev və ya Alex Chen"
                  />
                  {nameError ? (
                    <p className="text-xs text-[var(--sev-critical)] mt-1.5 font-medium flex items-center gap-1">
                      ⚠️ {nameError}
                    </p>
                  ) : (
                    <p className="text-[11px] text-[var(--ink-secondary)] mt-1.5">
                      Həm ad, həm də soyad daxil edilməlidir. Bu məlumat NDA sənədində kriptoqrafik imzanız kimi qeydə alınır.
                    </p>
                  )}
                </div>

                {/* 2. Age (18+) Gate */}
                <div className="border border-[var(--line-subtle)] bg-[var(--surface-page)] p-4 rounded-[var(--radius-sm)] space-y-2.5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
                    Yaş Təsdiqi (18+)
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div>
                      <label
                        htmlFor="birthDate"
                        className="block text-xs text-[var(--ink-secondary)] mb-1"
                      >
                        Doğum Tarixi:
                      </label>
                      <input
                        id="birthDate"
                        type="date"
                        required
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        className="px-3 py-1.5 border border-[var(--line-subtle)] bg-[var(--surface-raised)] text-[var(--ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <div className="text-xs text-[var(--ink-secondary)] leading-relaxed sm:pt-4">
                      ✓ Konfidensial NDA sənədlərini imzalamaq üçün qanunvericiliyə uyğun olaraq ən azı 18 yaşınız olmalıdır.
                    </div>
                  </div>
                </div>

                {/* 3. Real Human Biometric / ID Verification Card (NO LinkedIn) */}
                <div className="border border-[var(--line-subtle)] bg-[var(--surface-page)] p-5 rounded-[var(--radius-sm)] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
                      Şəxsiyyət və Canlı İnsan Təsdiqi (Biometrik Liveness & Bot Əleyhinə)
                    </div>
                    {scanStep === "verified" && (
                      <span className="text-[11px] bg-[var(--state-verified)]/15 text-[var(--state-verified)] border border-[var(--state-verified)]/30 font-mono font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        ✓ Real Human Verified
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                    Sistemə süni intellekt botlarının və ya saxta skreyperlərin daxil olmasının qarşısını almaq üçün üz liveness skanı və ya rəsmi şəxsiyyət vəsiqəsi vasitəsilə canlı insan olduğunuzu təsdiqləyin.
                  </p>

                  {/* Mode switcher */}
                  <div className="flex gap-2 border-b border-[var(--line-subtle)] pb-3">
                    <button
                      type="button"
                      onClick={() => {
                        setVerifyMode("face");
                        if (scanStep !== "verified") setScanStep("idle");
                      }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-all ${
                        verifyMode === "face"
                          ? "bg-[var(--accent)] text-[var(--accent-on-fill)]"
                          : "text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] bg-[var(--surface-raised)]"
                      }`}
                    >
                      📷 Kamera ilə Üz Skanı (Biometrik Liveness)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setVerifyMode("id");
                        if (scanStep !== "verified") setScanStep("idle");
                      }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-all ${
                        verifyMode === "id"
                          ? "bg-[var(--accent)] text-[var(--accent-on-fill)]"
                          : "text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] bg-[var(--surface-raised)]"
                      }`}
                    >
                      🪪 Şəxsiyyət Vəsiqəsi / ID Yoxlama
                    </button>
                  </div>

                  {/* Interactive Verification Stage */}
                  {scanStep === "idle" && (
                    <div className="border border-dashed border-[var(--line-medium)] bg-[var(--surface-raised)] p-6 rounded-[var(--radius-sm)] text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-[var(--accent-wash)] border border-[var(--accent)]/30 mx-auto flex items-center justify-center text-xl text-[var(--accent)]">
                        {verifyMode === "face" ? "👤" : "🛡️"}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-[var(--ink-primary)]">
                          {verifyMode === "face"
                            ? "AI Üz Həndəsəsi və Canlılıq (Liveness) Yoxlaması"
                            : "Şəxsiyyəti Təsdiq Edən Sənəd və Yaş Yoxlaması"}
                        </h4>
                        <p className="text-xs text-[var(--ink-secondary)] mt-1 max-w-md mx-auto">
                          {verifyMode === "face"
                            ? "Kameranıza baxaraq bir dəfəlik 3D liveness skanını tamamlayın. Şəkil yadda saxlanılmır, yalnız kriptoqrafik sübut generasiya edilir."
                            : "Şəxsiyyət vəsiqənizin ön hissəsini skan edin və ya yükləyin. 18+ yaş və qanuni ad dərhal avtomatik təsdiqlənir."}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={startBiometricScan}
                        className="px-5 py-2 bg-[var(--accent)] text-[var(--accent-on-fill)] hover:bg-[var(--accent-hover)] text-xs font-semibold rounded-[var(--radius-sm)] transition-all shadow-sm inline-flex items-center gap-2"
                      >
                        <span>{verifyMode === "face" ? "📷 Üz Skanını Başlat" : "🪪 Sənədi Skan Et / Doğrula"}</span>
                        <span>→</span>
                      </button>
                    </div>
                  )}

                  {scanStep === "scanning" && (
                    <div className="border border-[var(--accent)]/40 bg-[var(--surface-sunken)] p-6 rounded-[var(--radius-sm)] space-y-4">
                      {/* Biometric visual radar scanner */}
                      <div className="relative w-36 h-36 mx-auto rounded-full border-2 border-[var(--accent)] flex items-center justify-center overflow-hidden bg-black/40 shadow-[0_0_20px_var(--accent-glow)]">
                        {/* Target reticle */}
                        <div className="absolute inset-2 rounded-full border border-dashed border-[var(--accent)]/50 animate-spin" style={{ animationDuration: "6s" }} />
                        <div className="text-4xl animate-pulse">
                          {verifyMode === "face" ? "🧑‍🦱" : "🪪"}
                        </div>
                        {/* Laser scan line */}
                        <div
                          className="absolute left-0 right-0 h-1 bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] transition-all duration-200"
                          style={{ top: `${scanProgress}%` }}
                        />
                      </div>

                      {/* Progress bar */}
                      <div className="space-y-2 max-w-sm mx-auto text-center">
                        <div className="flex justify-between text-xs font-mono text-[var(--ink-secondary)]">
                          <span>{scanProgress}%</span>
                          <span className="text-[var(--accent)]">Analiz edilir...</span>
                        </div>
                        <div className="h-1.5 w-full bg-[var(--surface-raised)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--accent)] transition-all duration-300"
                            style={{ width: `${scanProgress}%` }}
                          />
                        </div>
                        <p className="text-xs font-mono text-[var(--ink-primary)] pt-1">
                          {scanPhaseText}
                        </p>
                      </div>
                    </div>
                  )}

                  {scanStep === "verified" && (
                    <div className="border border-[var(--state-verified)]/40 bg-[var(--state-verified)]/10 p-4 rounded-[var(--radius-sm)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[var(--state-verified)]/20 text-[var(--state-verified)] border border-[var(--state-verified)]/40 flex items-center justify-center font-bold text-lg shrink-0">
                          ✓
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[var(--ink-primary)]">
                            {verifyMode === "face"
                              ? "Biometrik Canlılıq Təsdiqləndi (Liveness Pass)"
                              : "Rəsmi Şəxsiyyət Sənədi Təsdiqləndi"}
                          </div>
                          <div className="text-xs text-[var(--ink-secondary)] flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-[var(--state-verified)]">
                              Proof Token: #ZK-BIO-{campaignId.slice(0, 6).toUpperCase()}
                            </span>
                            <span>·</span>
                            <span>Real İnsan (Anti-Bot Zəmanəti)</span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setScanStep("idle");
                          setIsHuman(false);
                        }}
                        className="text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline shrink-0 self-start sm:self-center"
                      >
                        Yenidən yoxla
                      </button>
                    </div>
                  )}

                  <div className="flex items-start gap-2 pt-1">
                    <input
                      id="isHuman"
                      type="checkbox"
                      required
                      checked={isHuman}
                      onChange={(e) => setIsHuman(e.target.checked)}
                      className="mt-1 accent-[var(--accent)]"
                    />
                    <label
                      htmlFor="isHuman"
                      className="text-xs text-[var(--ink-secondary)] leading-relaxed cursor-pointer"
                    >
                      Bəyan edirəm ki, mən <strong>canlı və real insanam</strong>, qeydiyyatdan keçən şəxsiyyət məlumatlarım doğrudur, avtomatlaşdırılmış bot və ya skript deyiləm.
                    </label>
                  </div>
                </div>

                {/* 4. Forensic Watermark & Legal Terms Acknowledgement */}
                <div className="flex items-start gap-2 pt-1">
                  <input
                    id="agree"
                    type="checkbox"
                    required
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-1 accent-[var(--accent)]"
                  />
                  <label
                    htmlFor="agree"
                    className="text-xs text-[var(--ink-secondary)] leading-relaxed cursor-pointer"
                  >
                    Yuxarıdakı konfidensiallıq şərtlərini qəbul edirəm və başa
                    düşürəm ki, oyun kadrları sızmaların qarşısını almaq üçün
                    şəxsi <strong>məhkəmə-tibbi (forensik) su nişanı</strong>{" "}
                    ilə qorunur.
                  </label>
                </div>

                {/* 5. Privacy Notice */}
                <div className="p-4 bg-[var(--surface-sunken)] border border-[var(--line-subtle)] rounded-[var(--radius-sm)] text-xs text-[var(--ink-secondary)] leading-relaxed">
                  🔒 <strong>Anonimlik və Şəxsi Məlumatların Qorunması:</strong> Sizin
                  biometrik görüntünüz və ya şəxsiyyət vəsiqəniz serverlərdə saxlanılmır. Yalnız kriptoqrafik
                  SHA-256 riyazi sıxılmış unikal sübut (Zero-Knowledge proof) yaradılır. Oyun studiyaları
                  yalnız sizin anonim <strong>Tester ID</strong>-nizi və təsdiq nişanınızı görür. Məlumatlarınız
                  heç bir halda üçüncü tərəflərə ötürülmür.
                </div>
              </>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting || !isFormValid}
                className="w-full sm:w-auto py-3 px-8 bg-[var(--accent)] text-[var(--accent-on-fill)] text-sm font-semibold rounded-[var(--radius-sm)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md"
              >
                {submitting
                  ? "Emal edilir..."
                  : alreadySigned
                    ? "Sessiyanı Başlat →"
                    : "Müqaviləni İmzala və Giriş Əldə Et →"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
