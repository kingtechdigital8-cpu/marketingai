"use client";

import { Fragment, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  FileText,
  Sparkles,
  History,
  ExternalLink,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { ToolLayout } from "@/components/ui/ToolLayout";
import { LoadingResult } from "@/components/ui/LoadingResult";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { CopyButton } from "@/components/ui/CopyButton";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { CreditCostBadge } from "@/components/credits/CreditCostBadge";
import { useCreditCosts } from "@/lib/use-credit-costs";
import { COUNTRIES } from "@/lib/countries";
import { LANGUAGES } from "@/lib/languages";
import { usePagination } from "@/lib/use-pagination";
import { toggleListValue } from "@/lib/toggle-list";

type Tool = "keywords" | "meta" | "article";

interface Competitor {
  domain: string;
  title: string;
  link: string;
}

interface KeywordResult {
  keyword: string;
  intent: string;
  difficulty: string;
  competitors: Competitor[];
}

interface HistoryItem {
  id: string;
  type: "SEO_KEYWORDS" | "SEO_META" | "SEO_ARTICLE";
  title: string;
  content: string;
  creditCost: number;
  createdAt: string;
}

const TABS = [
  { id: "keywords" as Tool, label: "Riset Kata Kunci", icon: Search },
  { id: "meta" as Tool, label: "Meta Description", icon: Sparkles },
  { id: "article" as Tool, label: "Artikel SEO", icon: FileText },
];

const countryOptions = COUNTRIES.map((c) => ({ value: c.code, label: c.label }));
const languageOptions = LANGUAGES.map((l) => ({ value: l.code, label: l.label }));

const TONE_PRESETS = [
  "100% Unik",
  "Santai & Gaul",
  "Profesional",
  "Baku/Formal",
  "Persuasif",
  "Storytelling",
  "Humoris",
  "Edukatif",
];

const TYPE_LABEL: Record<HistoryItem["type"], string> = {
  SEO_KEYWORDS: "Kata Kunci",
  SEO_META: "Meta Description",
  SEO_ARTICLE: "Artikel",
};

const INTENT_VARIANT: Record<string, "teal" | "violet" | "magenta" | "orange"> = {
  informational: "teal",
  navigational: "violet",
  commercial: "magenta",
  transactional: "orange",
};

const DIFFICULTY_VARIANT: Record<string, "success" | "warning" | "danger"> = {
  rendah: "success",
  sedang: "warning",
  tinggi: "danger",
};


function KeywordResultTable({ keywords }: { keywords: KeywordResult[] }) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-surface-2 text-xs uppercase text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Kata Kunci</th>
            <th className="px-4 py-2 font-medium">Intent</th>
            <th className="px-4 py-2 font-medium">Kesulitan</th>
            <th className="px-4 py-2 font-medium">Kompetitor</th>
          </tr>
        </thead>
        <tbody>
          {keywords.map((row, i) => {
            const extraCount = row.competitors ? row.competitors.length - 3 : 0;
            const isExpanded = expandedRow === i;
            return (
              <Fragment key={i}>
                <tr className="border-b border-border last:border-0 align-top">
                  <td className="px-4 py-2 font-medium text-foreground">{row.keyword}</td>
                  <td className="px-4 py-2">
                    <Badge variant={INTENT_VARIANT[row.intent.toLowerCase()] ?? "neutral"} className="capitalize">
                      {row.intent}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    <Badge
                      variant={DIFFICULTY_VARIANT[row.difficulty.toLowerCase()] ?? "neutral"}
                      className="capitalize"
                    >
                      {row.difficulty}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    {row.competitors && row.competitors.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {row.competitors.slice(0, 3).map((c, ci) => (
                          <a
                            key={ci}
                            href={c.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                          >
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            {c.domain}
                          </a>
                        ))}
                        {extraCount > 0 && (
                          <button
                            onClick={() => setExpandedRow(isExpanded ? null : i)}
                            className="mt-1 flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
                          >
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            {isExpanded ? "Sembunyikan" : `Lihat lengkap (${row.competitors.length})`}
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted">-</span>
                    )}
                  </td>
                </tr>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.tr
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <td colSpan={4} className="border-b border-border bg-surface-2 px-4 py-3">
                        <p className="mb-2 text-xs font-medium uppercase text-muted">
                          Semua kompetitor untuk &quot;{row.keyword}&quot;
                        </p>
                        <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                          {row.competitors.map((c, ci) => (
                            <a
                              key={ci}
                              href={c.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              <span className="truncate">{c.domain}</span>
                            </a>
                          ))}
                        </div>
                      </td>
                    </motion.tr>
                  )}
                </AnimatePresence>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MetaResultView({ metaTitle, metaDescription }: { metaTitle: string; metaDescription: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border p-3">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-medium uppercase text-muted">Meta Title ({metaTitle.length}/60)</p>
          <CopyButton text={metaTitle} />
        </div>
        <p className="text-sm text-foreground">{metaTitle}</p>
      </div>
      <div className="rounded-lg border border-border p-3">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-medium uppercase text-muted">
            Meta Description ({metaDescription.length}/160)
          </p>
          <CopyButton text={metaDescription} />
        </div>
        <p className="text-sm text-foreground">{metaDescription}</p>
      </div>
    </div>
  );
}

function UniquenessBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <Info className="h-3.5 w-3.5" />
        Keunikan: tidak tersedia (aktifkan provider Serper)
      </span>
    );
  }
  const variant = score >= 80 ? "success" : score >= 50 ? "warning" : "danger";
  return (
    <Badge variant={variant}>
      <Sparkles className="h-3 w-3" />
      Keunikan: {score}%
    </Badge>
  );
}

function ArticleResultView({ article, uniquenessScore }: { article: string; uniquenessScore: number | null }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <UniquenessBadge score={uniquenessScore} />
        <CopyButton text={article} />
      </div>
      <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-black/20 p-4 text-sm text-foreground">
        {article}
      </pre>
    </div>
  );
}

function HistoryDetail({ item }: { item: HistoryItem }) {
  let parsed: {
    keywords?: KeywordResult[];
    metaTitle?: string;
    metaDescription?: string;
    article?: string;
    uniquenessScore?: number | null;
  } | null = null;
  try {
    parsed = JSON.parse(item.content);
  } catch {
    parsed = null;
  }

  if (parsed && item.type === "SEO_KEYWORDS") {
    return <KeywordResultTable keywords={parsed.keywords ?? []} />;
  }
  if (parsed && item.type === "SEO_META") {
    return <MetaResultView metaTitle={parsed.metaTitle ?? ""} metaDescription={parsed.metaDescription ?? ""} />;
  }
  if (parsed && item.type === "SEO_ARTICLE" && typeof parsed.article === "string") {
    return <ArticleResultView article={parsed.article} uniquenessScore={parsed.uniquenessScore ?? null} />;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <CopyButton text={item.content} />
      </div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-black/20 p-3 text-sm text-foreground">
        {item.content}
      </pre>
    </div>
  );
}

export default function SeoPage() {
  const { update } = useSession();
  const [tab, setTab] = useState<Tool>("keywords");
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [viewing, setViewing] = useState<HistoryItem | null>(null);
  const { page, setPage, pageCount, pageItems: historyPage } = usePagination(history ?? [], 5);

  function loadHistory() {
    fetch("/api/seo/history")
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        setHistory(data.generations ?? []);
        setHistoryError(false);
      })
      .catch(() => {
        setHistory([]);
        setHistoryError(true);
      });
  }

  useEffect(loadHistory, []);

  async function refreshBalance(creditBalance: number) {
    await update({ creditBalance });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tools SEO"
        description="Riset kata kunci, meta description, dan artikel SEO dibuat AI."
        icon={Search}
      />

      <Tabs items={TABS} value={tab} onChange={(id) => setTab(id as Tool)} />

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {tab === "keywords" && <KeywordsTool onDone={refreshBalance} onSaved={loadHistory} />}
          {tab === "meta" && <MetaTool onDone={refreshBalance} onSaved={loadHistory} />}
          {tab === "article" && <ArticleTool onDone={refreshBalance} onSaved={loadHistory} />}
        </motion.div>
      </AnimatePresence>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-brand" />
            Riwayat SEO
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!history ? (
            <div className="flex flex-col gap-2 p-5">
              <div className="h-3 w-2/3 animate-pulse rounded bg-white/[.06]" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-white/[.06]" />
            </div>
          ) : historyError ? (
            <div className="p-5">
              <ErrorNotice message="Gagal memuat riwayat. Coba muat ulang halaman." />
            </div>
          ) : history.length === 0 ? (
            <EmptyState icon={History} title="Belum ada riwayat" />
          ) : (
            <>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">Judul</th>
                    <th className="px-5 py-3 font-medium">Tipe</th>
                    <th className="px-5 py-3 font-medium">Kredit</th>
                    <th className="px-5 py-3 font-medium">Tanggal</th>
                    <th className="px-5 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {historyPage.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0 hover:bg-white/[.02]">
                      <td className="max-w-xs truncate px-5 py-3 font-medium text-foreground">{item.title}</td>
                      <td className="px-5 py-3">
                        <Badge variant="brand">{TYPE_LABEL[item.type]}</Badge>
                      </td>
                      <td className="px-5 py-3 text-muted">{item.creditCost}</td>
                      <td className="px-5 py-3 text-muted">
                        {new Date(item.createdAt).toLocaleDateString("id-ID")}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => setViewing(item)}
                          className="text-sm font-medium text-brand hover:underline"
                        >
                          Lihat
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={viewing !== null} onClose={() => setViewing(null)} title={viewing?.title} size="xl">
        {viewing && <HistoryDetail item={viewing} />}
      </Modal>
    </div>
  );
}

function KeywordsTool({ onDone, onSaved }: { onDone: (balance: number) => void; onSaved: () => void }) {
  const creditCosts = useCreditCosts();
  const [topic, setTopic] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [country, setCountry] = useState("id");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KeywordResult[] | null>(null);
  const [competitorsEnabled, setCompetitorsEnabled] = useState(true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const res = await fetch("/api/ai/seo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "keywords", topic, businessDescription, country }),
    });
    const data = await res.json();
    setIsLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Gagal generate.");
      return;
    }
    setResult(data.keywords);
    setCompetitorsEnabled(data.competitorsEnabled ?? true);
    onDone(data.creditBalance);
    onSaved();
  }

  return (
    <ToolLayout
      formTitle="Riset Kata Kunci"
      formIcon={Search}
      resultTitle="Hasil Riset"
      result={
        isLoading ? (
          <LoadingResult />
        ) : result ? (
          <div className="flex flex-col gap-3">
            {!competitorsEnabled && (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Data kompetitor nonaktif. Aktifkan provider &quot;Serper (Data Kompetitor)&quot; di Provider AI
                  untuk menampilkan domain pesaing asli.
                </span>
              </div>
            )}
            <KeywordResultTable keywords={result} />
          </div>
        ) : (
          <EmptyState icon={Search} title="Belum ada hasil" />
        )
      }
      form={
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Topik / Niche Bisnis"
            placeholder="mis. kopi kekinian, jasa desain interior"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            required
          />
          <Input
            label="Deskripsi Bisnis (opsional)"
            placeholder="Konteks tambahan tentang bisnis Anda"
            value={businessDescription}
            onChange={(e) => setBusinessDescription(e.target.value)}
          />
          <SearchableSelect
            label="Target Negara"
            options={countryOptions}
            value={country}
            onChange={setCountry}
            placeholder="Cari negara..."
          />
          {error && <ErrorNotice message={error} />}
          <div className="flex items-center justify-between pt-1">
            <CreditCostBadge cost={creditCosts.SEO_KEYWORDS} />
            <Button type="submit" isLoading={isLoading}>
              Cari Kata Kunci
            </Button>
          </div>
        </form>
      }
    />
  );
}

function MetaTool({ onDone, onSaved }: { onDone: (balance: number) => void; onSaved: () => void }) {
  const creditCosts = useCreditCosts();
  const [topic, setTopic] = useState("");
  const [targetKeyword, setTargetKeyword] = useState("");
  const [language, setLanguage] = useState("id");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ metaTitle: string; metaDescription: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const res = await fetch("/api/ai/seo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "meta", topic, targetKeyword, language }),
    });
    const data = await res.json();
    setIsLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Gagal generate.");
      return;
    }
    setResult({ metaTitle: data.metaTitle, metaDescription: data.metaDescription });
    onDone(data.creditBalance);
    onSaved();
  }

  return (
    <ToolLayout
      formTitle="Meta Description"
      formIcon={Sparkles}
      resultTitle="Hasil Meta Tag"
      result={
        isLoading ? (
          <LoadingResult />
        ) : result ? (
          <MetaResultView metaTitle={result.metaTitle} metaDescription={result.metaDescription} />
        ) : (
          <EmptyState icon={Sparkles} title="Belum ada hasil" />
        )
      }
      form={
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Topik Halaman"
            placeholder="mis. jasa cuci sepatu premium Jakarta"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            required
          />
          <Input
            label="Kata Kunci Utama (opsional)"
            placeholder="mis. cuci sepatu jakarta"
            value={targetKeyword}
            onChange={(e) => setTargetKeyword(e.target.value)}
          />
          <SearchableSelect
            label="Bahasa"
            options={languageOptions}
            value={language}
            onChange={setLanguage}
            placeholder="Cari bahasa..."
          />
          {error && <ErrorNotice message={error} />}
          <div className="flex items-center justify-between pt-1">
            <CreditCostBadge cost={creditCosts.SEO_META} />
            <Button type="submit" isLoading={isLoading}>
              Buat Meta Description
            </Button>
          </div>
        </form>
      }
    />
  );
}

function ArticleTool({ onDone, onSaved }: { onDone: (balance: number) => void; onSaved: () => void }) {
  const creditCosts = useCreditCosts();
  const [topic, setTopic] = useState("");
  const [targetKeyword, setTargetKeyword] = useState("");
  const [tone, setTone] = useState("");
  const [length, setLength] = useState("sedang");
  const [language, setLanguage] = useState("id");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ article: string; uniquenessScore: number | null } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const res = await fetch("/api/ai/seo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "article", topic, targetKeyword, tone, length, language }),
    });
    const data = await res.json();
    setIsLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Gagal generate.");
      return;
    }
    setResult({ article: data.article, uniquenessScore: data.uniquenessScore ?? null });
    onDone(data.creditBalance);
    onSaved();
  }

  return (
    <ToolLayout
      formTitle="Artikel SEO"
      formIcon={FileText}
      resultTitle="Hasil Artikel"
      result={
        isLoading ? (
          <LoadingResult />
        ) : result ? (
          <ArticleResultView article={result.article} uniquenessScore={result.uniquenessScore} />
        ) : (
          <EmptyState icon={FileText} title="Belum ada hasil" />
        )
      }
      form={
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Topik Artikel"
            placeholder="mis. tips memilih kopi arabika untuk pemula"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            required
          />
          <Input
            label="Kata Kunci Utama (opsional)"
            placeholder="mis. kopi arabika"
            value={targetKeyword}
            onChange={(e) => setTargetKeyword(e.target.value)}
          />
          <SearchableSelect
            label="Bahasa Artikel"
            options={languageOptions}
            value={language}
            onChange={setLanguage}
            placeholder="Cari bahasa..."
          />
          <div className="flex flex-col gap-2">
            <Input
              label="Gaya Penulisan (opsional)"
              placeholder="mis. santai, profesional"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5">
              {TONE_PRESETS.map((preset) => (
                <ToggleChip
                  key={preset}
                  label={preset}
                  active={tone
                    .split(",")
                    .map((s) => s.trim())
                    .includes(preset)}
                  onClick={() => setTone((current) => toggleListValue(current, preset))}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Panjang Artikel</label>
            <select
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
            >
              <option value="pendek">Pendek (~300-400 kata)</option>
              <option value="sedang">Sedang (~600-800 kata)</option>
              <option value="panjang">Panjang (~1000-1200 kata)</option>
            </select>
          </div>
          {error && <ErrorNotice message={error} />}
          <div className="flex items-center justify-between pt-1">
            <CreditCostBadge cost={creditCosts.SEO_ARTICLE} />
            <Button type="submit" isLoading={isLoading}>
              Tulis Artikel
            </Button>
          </div>
        </form>
      }
    />
  );
}
