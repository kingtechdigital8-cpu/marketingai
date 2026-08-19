// Shared content source for both the homepage feature grid and each tool's
// dedicated SEO landing page (src/app/(marketing)/fitur/[slug]/page.tsx) —
// one place to keep copy accurate as real features change, instead of the
// homepage and article pages drifting out of sync with each other.

import {
  Search,
  Image as ImageIcon,
  Video,
  Radio,
  Scissors,
  type LucideIcon,
} from "lucide-react";

export interface ToolFaq {
  question: string;
  answer: string;
}

export interface ToolContent {
  slug: string;
  name: string;
  icon: LucideIcon;
  /** Short line used on card grids. */
  tagline: string;
  /** <title> — kept under ~60 chars, keyword-first. */
  seoTitle: string;
  /** <meta description> — kept under ~155 chars. */
  metaDescription: string;
  keywords: string[];
  /** Opening article paragraph(s) — what the tool is and who it's for. */
  intro: string[];
  /** Feature bullets with short explanations, rendered as a checklist. */
  highlights: { title: string; description: string }[];
  /** Numbered "how it works" steps specific to this tool. */
  steps: string[];
  faqs: ToolFaq[];
}

export const TOOLS_CONTENT: ToolContent[] = [
  {
    slug: "seo-otomatis",
    name: "SEO Otomatis",
    icon: Search,
    tagline: "Riset kata kunci, meta description, dan artikel SEO dibuat AI.",
    seoTitle: "SEO Otomatis Berbasis AI - Riset Kata Kunci & Artikel SEO",
    metaDescription:
      "Riset kata kunci lengkap dengan intent pencarian & data kompetitor, buat meta description, dan generate artikel SEO otomatis pakai AI dalam hitungan detik.",
    keywords: ["SEO otomatis", "riset kata kunci AI", "generator artikel SEO", "meta description AI", "tools SEO Indonesia"],
    intro: [
      "SEO Otomatis adalah tools riset dan penulisan SEO bertenaga AI untuk pemilik bisnis, content writer, dan digital marketer yang ingin konten mereka mudah ditemukan di Google tanpa harus riset manual berjam-jam.",
      "Cukup masukkan topik atau produk Anda, AI akan menganalisis kata kunci, intent pencarian, sampai data kompetitor, lalu membantu menulis meta description dan artikel SEO yang siap publish.",
    ],
    highlights: [
      {
        title: "Riset Kata Kunci + Intent Pencarian",
        description:
          "Dapatkan daftar kata kunci relevan lengkap dengan klasifikasi intent (informational, navigational, commercial, transactional) supaya konten yang dibuat tepat sasaran.",
      },
      {
        title: "Data Kompetitor",
        description: "Lihat siapa saja yang sudah rangking untuk kata kunci yang sama, ditenagai data pencarian real-time dari Serper.",
      },
      {
        title: "Meta Description Instan",
        description: "Generate meta description yang ringkas dan menarik klik, disesuaikan dengan kata kunci target.",
      },
      {
        title: "Artikel SEO Siap Publish",
        description: "AI menulis draf artikel lengkap terstruktur untuk kata kunci pilihan Anda, tinggal review dan publish.",
      },
    ],
    steps: [
      "Masukkan topik, produk, atau kata kunci awal yang ingin ditarget.",
      "Pilih kata kunci hasil riset AI sesuai intent yang paling relevan dengan bisnis Anda.",
      "Generate meta description atau artikel SEO lengkap, lalu unduh/salin hasilnya.",
    ],
    faqs: [
      {
        question: "Apakah artikel yang dihasilkan AI langsung bisa dipublish?",
        answer:
          "Artikel dari AI adalah draf berkualitas yang sudah terstruktur SEO. Tetap disarankan untuk direview dan disesuaikan gaya bahasanya sebelum publish, seperti draf dari penulis manapun.",
      },
      {
        question: "Dari mana data kompetitor didapat?",
        answer: "Dari hasil pencarian Google real-time lewat provider Serper, jadi datanya bukan perkiraan statis.",
      },
    ],
  },
  {
    slug: "generator-gambar",
    name: "Generator Gambar",
    icon: ImageIcon,
    tagline: "Visual iklan, banner, dan gambar promosi untuk berbagai platform.",
    seoTitle: "Generator Gambar Iklan AI - Visual & Banner Promosi Instan",
    metaDescription:
      "Buat visual iklan, banner, dan gambar promosi untuk Instagram, TikTok, dan marketplace langsung dari deskripsi teks, dengan berbagai preset ukuran & gaya visual AI.",
    keywords: ["generator gambar AI", "buat banner iklan", "visual promosi AI", "text to image marketing", "desain iklan otomatis"],
    intro: [
      "Generator Gambar mengubah deskripsi teks menjadi visual iklan siap pakai, tanpa perlu desainer atau software desain rumit.",
      "Cocok untuk UMKM dan tim marketing yang butuh banner promosi, gambar produk, atau konten visual media sosial secara cepat dan konsisten.",
    ],
    highlights: [
      { title: "Preset Ukuran Siap Pakai", description: "Pilih ukuran sesuai kebutuhan platform (feed, story, hingga banner) tanpa perlu crop manual." },
      { title: "Berbagai Gaya Visual", description: "Kombinasikan beberapa gaya visual sekaligus supaya hasil gambar sesuai identitas brand Anda." },
      { title: "Dari Teks ke Visual dalam Hitungan Detik", description: "Tulis deskripsi produk atau promosi, AI langsung merender visualnya." },
      { title: "Tersimpan di Galeri Aset", description: "Semua gambar yang pernah dibuat tersimpan rapi, tinggal unduh ulang kapan saja." },
    ],
    steps: [
      "Tulis deskripsi visual yang diinginkan: produk, suasana, atau pesan promosinya.",
      "Pilih preset ukuran dan gaya visual yang sesuai kebutuhan.",
      "Generate, lalu unduh gambar langsung dari galeri Aset Saya.",
    ],
    faqs: [
      {
        question: "Bisa untuk ukuran khusus marketplace seperti Shopee/Tokopedia?",
        answer: "Bisa, tinggal pilih preset ukuran yang sesuai kebutuhan platform Anda sebelum generate.",
      },
      {
        question: "Apakah gambar hasil generate bebas hak cipta untuk dipakai komersial?",
        answer: "Gambar dibuat baru oleh AI sesuai deskripsi Anda, bukan hasil scraping gambar orang lain, sehingga aman dipakai untuk keperluan promosi bisnis Anda.",
      },
    ],
  },
  {
    slug: "generator-video",
    name: "Generator Video",
    icon: Video,
    tagline: "Video iklan produk dan Voice Changer dalam satu tools.",
    seoTitle: "Generator Video Iklan AI - Video & Voice Changer",
    metaDescription:
      "Buat video iklan produk dari gambar dengan AI, atau ubah suara narasi dengan Voice Changer. Dua tools video dalam satu tempat.",
    keywords: ["generator video AI", "video iklan produk AI", "voice changer AI", "buat video promosi otomatis"],
    intro: [
      "Generator Video adalah dua tools video sekaligus: Generator Video untuk mengubah gambar produk jadi video iklan bergerak, dan Voice Changer untuk mengganti karakter suara narasi.",
      "Cocok untuk brand yang ingin membuat konten video promosi tanpa tim produksi, kamera, atau studio rekaman.",
    ],
    highlights: [
      { title: "Gambar Jadi Video Bergerak", description: "Unggah foto produk, objek, atau karakter, AI menganimasikannya jadi video iklan pendek." },
      { title: "Voice Changer", description: "Ubah karakter suara pada narasi video Anda tanpa perlu rekam ulang." },
      { title: "Riwayat Tersimpan Rapi", description: "Semua hasil dari kedua sub-tools tersimpan di galeri Aset Saya." },
    ],
    steps: [
      "Pilih sub-tools: Generator Video atau Voice Changer.",
      "Unggah gambar/audio sumber dan atur detail yang diinginkan.",
      "Generate dan unduh hasilnya dari galeri Aset Saya.",
    ],
    faqs: [
      {
        question: "Voice Changer bisa dipakai untuk video yang sudah ada?",
        answer: "Ya, Voice Changer mengubah karakter suara pada audio/video yang Anda unggah.",
      },
    ],
  },
  {
    slug: "auto-clip",
    name: "Auto Clip",
    icon: Scissors,
    tagline: "Video panjang jadi klip pendek otomatis, lengkap dengan caption & headline.",
    seoTitle: "Auto Clip AI - Ubah Video Panjang Jadi Klip Pendek Otomatis",
    metaDescription:
      "Unggah video atau tempel link YouTube, AI cari momen terbaik dan buatkan klip pendek otomatis lengkap dengan headline hook, caption animasi, dan crop mengikuti wajah yang bicara.",
    keywords: [
      "auto clip AI",
      "potong video otomatis",
      "AI video shorts",
      "generator caption otomatis",
      "video ke reels otomatis",
      "AI cari momen video",
    ],
    intro: [
      "Auto Clip mengubah video panjang (podcast, wawancara, seminar, sampai rekaman live) jadi kumpulan klip pendek siap posting ke TikTok, Reels, dan Shorts, sepenuhnya otomatis.",
      "AI membaca seluruh transkrip video, mencari momen yang paling relevan dan menarik, lalu merender klip lengkap dengan headline hook, caption animasi, dan crop cerdas yang mengikuti wajah orang yang sedang berbicara.",
    ],
    highlights: [
      {
        title: "AI Mencari Momen Terbaik",
        description: "Bukan asal potong per sekian detik. AI membaca isi pembicaraan penuh dan berhenti tepat setelah satu poin/argumen selesai, bukan di tengah kalimat.",
      },
      {
        title: "Headline Hook Otomatis",
        description: "AI menulis headline yang sesuai isi klip untuk menarik perhatian di detik pertama, posisi dan gayanya bisa diatur bebas.",
      },
      {
        title: "Caption Animasi Otomatis",
        description: "Auto-caption dari transkripsi AI dengan 8 pilihan animasi, termasuk mode karaoke highlight per kata.",
      },
      {
        title: "Smart Crop Mengikuti Wajah yang Bicara",
        description: "Saat mengubah ke format vertikal, crop otomatis mengikuti orang yang sedang berbicara supaya tidak terpotong, tanpa biaya tambahan.",
      },
      {
        title: "Dukung Upload & Link YouTube",
        description: "Unggah file video langsung atau cukup tempel link YouTube, mendukung durasi sumber sampai 2 jam.",
      },
      {
        title: "Output Fleksibel",
        description: "Pilih rasio vertikal 9:16 untuk TikTok/Reels/Shorts, kotak 1:1 untuk feed, atau rasio asli.",
      },
    ],
    steps: [
      "Unggah video atau tempel link YouTube, lalu jelaskan momen seperti apa yang Anda cari.",
      "AI menganalisis seluruh transkrip dan menampilkan daftar momen terbaik untuk dipilih.",
      "Pilih momen yang diinginkan, atur gaya headline & caption, lalu generate klip pendeknya.",
    ],
    faqs: [
      {
        question: "Berapa lama durasi video yang didukung Auto Clip?",
        answer: "Sampai 2 jam per video, baik dari file yang diunggah langsung maupun dari link YouTube. Cocok untuk podcast atau video panjang lainnya.",
      },
      {
        question: "Apakah crop mengikuti wajah bicara menambah biaya?",
        answer: "Tidak, fitur smart crop ini gratis dan tidak menambah biaya kredit per klip.",
      },
      {
        question: "Kalau proses AI gagal, kredit saya hangus?",
        answer: "Tidak. Kalau proses generate gagal di tengah jalan, kredit yang sudah terpotong otomatis dikembalikan ke saldo Anda.",
      },
      {
        question: "Video sumbernya harus dalam Bahasa Indonesia?",
        answer: "Transkripsi dan analisis momen bekerja optimal untuk video berbahasa Indonesia, sesuai fokus utama platform ini.",
      },
    ],
  },
  {
    slug: "live-tiktok-ai",
    name: "Live TikTok AI",
    icon: Radio,
    tagline: "Baca komentar live TikTok real-time dan balas otomatis pakai suara AI.",
    seoTitle: "Live TikTok AI - Auto Reply Komentar Live dengan Suara AI",
    metaDescription:
      "Baca komentar live TikTok secara real-time dan buatkan balasan AI untuk host secara otomatis, lengkap dengan suara AI, tanpa perlu standby terus di depan layar.",
    keywords: ["live TikTok AI", "auto reply live TikTok", "AI host live TikTok", "asisten live streaming AI", "bot komentar TikTok"],
    intro: [
      "Live TikTok AI membaca komentar yang masuk selama sesi live streaming secara real-time, lalu membuatkan balasan otomatis yang bisa dibacakan dengan suara AI untuk membantu host.",
      "Cocok untuk seller/host live TikTok yang sering kewalahan membalas ratusan komentar sekaligus saat siaran ramai.",
    ],
    highlights: [
      { title: "Baca Komentar Real-time", description: "Komentar yang masuk selama live langsung terbaca dan diproses AI tanpa jeda." },
      { title: "Balasan Otomatis dengan Suara AI", description: "AI menyusun balasan yang natural dan bisa dibacakan dengan suara AI (didukung ElevenLabs)." },
      { title: "Bisa Disesuaikan dengan Persona", description: "Gaya bicara AI bisa diatur mengikuti karakter/persona host Anda." },
    ],
    steps: [
      "Hubungkan sesi live TikTok Anda ke Live TikTok AI.",
      "Atur persona dan gaya balasan AI sesuai karakter brand/host.",
      "AI membaca komentar yang masuk dan membalas secara otomatis selama live berlangsung.",
    ],
    faqs: [
      {
        question: "Apakah AI membalas semua komentar yang masuk?",
        answer: "AI memproses komentar yang masuk secara real-time dan menyusun balasan otomatis untuk membantu host menjaga interaksi tetap ramai.",
      },
      {
        question: "Suara balasan AI bisa diganti?",
        answer: "Bisa, tersedia beberapa pilihan suara AI yang bisa disesuaikan dengan karakter live Anda.",
      },
    ],
  },
];

export function getToolBySlug(slug: string): ToolContent | undefined {
  return TOOLS_CONTENT.find((tool) => tool.slug === slug);
}
