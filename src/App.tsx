import React, { useState, useEffect } from "react";
import { Button } from "./components/ui/button";
import { Input, Textarea } from "./components/ui/form-components";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { BrainCircuit, Download, FileText, History, Printer, RefreshCw, Trash2, BookOpen, Image } from "lucide-react";
import { exportToWord } from "./lib/export";

type Question = {
  id: string;
  type: string;
  difficulty: string;
  stimulus: string;
  imagePrompt?: string;
  imageVersion?: number;
  question: string;
  options?: string[];
  answer: string;
  explanation: string;
};

type Assessment = {
  id: string;
  date: string;
  materiUtama: string;
  subMateri: string;
  tingkat: string;
  kelas: string;
  questions: Question[];
};

export default function App() {
  const [activeTab, setActiveTab] = useState("generator");
  const [history, setHistory] = useState<Assessment[]>([]);
  
  // Form State
  const [materiUtama, setMateriUtama] = useState("");
  const [subMateri, setSubMateri] = useState("");
  const [tingkat, setTingkat] = useState("");
  const [kelas, setKelas] = useState("");
  const [jumlahMudah, setJumlahMudah] = useState(5);
  const [jumlahSedang, setJumlahSedang] = useState(5);
  const [jumlahSukar, setJumlahSukar] = useState(5);
  const [bentukSoal, setBentukSoal] = useState<string[]>(["Pilihan Ganda"]);
  const [stimulusOptions, setStimulusOptions] = useState<string[]>([]);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState<Record<string, boolean>>({});
  const [currentAssessment, setCurrentAssessment] = useState<Assessment | null>(null);
  const [revisionInputs, setRevisionInputs] = useState<Record<string, string>>({});
  
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [customApiKey, setCustomApiKey] = useState("");

  const [generateMode, setGenerateMode] = useState<"manual" | "file">("manual");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("asesmenHistory");
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {}
    }
    const savedApiKey = localStorage.getItem("customGeminiApiKey");
    if (savedApiKey) {
      setCustomApiKey(savedApiKey);
    }
  }, []);

  const saveHistory = (data: Assessment[]) => {
    setHistory(data);
    localStorage.setItem("asesmenHistory", JSON.stringify(data));
  };

  const handleGenerate = async () => {
    if (generateMode === "manual") {
      if (!materiUtama || !subMateri || !tingkat || !kelas) {
        alert("Mohon lengkapi semua field utama!");
        return;
      }
      if (bentukSoal.length === 0) {
        alert("Pilih minimal satu bentuk soal!");
        return;
      }
    } else {
      if (!uploadFile) {
        alert("Mohon unggah file kisi-kisi (PDF/Gambar/Teks) terlebih dahulu!");
        return;
      }
    }

    setIsGenerating(true);
    
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (customApiKey) headers["x-gemini-api-key"] = customApiKey;

    let fileBase64 = "";
    let fileMimeType = "";
    let fileName = "";
    if (generateMode === "file" && uploadFile) {
      fileMimeType = uploadFile.type;
      fileName = uploadFile.name;
      const buffer = await uploadFile.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
      }
      fileBase64 = window.btoa(binary);
    }

    try {
      const res = await fetch("/api/generate-assessment", {
        method: "POST",
        headers,
        body: JSON.stringify({
          materiUtama,
          subMateri,
          tingkat,
          kelas,
          jumlahMudah,
          jumlahSedang,
          jumlahSukar,
          bentukSoal,
          stimulus: stimulusOptions,
          fileBase64,
          fileMimeType,
          fileName
        })
      });
      const data = await res.json();
      if (res.status === 429 || data.isQuotaError) {
        setShowApiKeyDialog(true);
        throw new Error("Limit gratis Gemini API tercapai. Masukkan API Key sendiri untuk melanjutkan.");
      }
      if (data.error) throw new Error(data.error);

      const meta = data.meta || {};
      const newMateri = meta.materiUtama || materiUtama || fileName || "Asesmen";
      const newSubMateri = meta.subMateri || subMateri || "Berdasarkan Kisi-kisi";
      const newTingkat = meta.tingkat || tingkat || "-";
      const newKelas = meta.kelas || kelas || "-";

      const newAssessment: Assessment = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        materiUtama: newMateri,
        subMateri: newSubMateri,
        tingkat: newTingkat,
        kelas: newKelas,
        questions: data.questions || []
      };

      setCurrentAssessment(newAssessment);
      saveHistory([newAssessment, ...history]);
      setActiveTab("result");
    } catch (err: any) {
      alert("Gagal menggenerate: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const loadFromHistory = (item: Assessment) => {
    setCurrentAssessment(item);
    setActiveTab("result");
  };

  const handleRegenerateQuestion = async (qId: string, action: "full" | "stimulus" | "image" | "custom", customPrompt?: string) => {
    if (!currentAssessment) return;
    const qIndex = currentAssessment.questions.findIndex(q => q.id === qId);
    if (qIndex === -1) return;
    const question = currentAssessment.questions[qIndex];

    setIsRegenerating({ ...isRegenerating, [qId]: true });
    
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (customApiKey) headers["x-gemini-api-key"] = customApiKey;

    try {
      const res = await fetch("/api/regenerate-question", {
        method: "POST",
        headers,
        body: JSON.stringify({ question, action, customPrompt })
      });
      const data = await res.json();
      if (res.status === 429 || data.isQuotaError) {
        setShowApiKeyDialog(true);
        throw new Error("Limit gratis Gemini API tercapai. Masukkan API Key sendiri untuk melanjutkan.");
      }
      if (data.error) throw new Error(data.error);

      if (action === "image" && data.question) {
        data.question.imageVersion = Date.now(); // update image seed/version
      }

      const newQuestions = [...currentAssessment.questions];
      newQuestions[qIndex] = data.question;
      const updated = { ...currentAssessment, questions: newQuestions };
      setCurrentAssessment(updated);
      
      // Update history
      const newHistory = history.map(h => h.id === updated.id ? updated : h);
      saveHistory(newHistory);
      
      if (action === "custom") {
        setRevisionInputs({ ...revisionInputs, [qId]: "" });
      }
    } catch(e) {
      alert("Gagal merubah soal.");
    } finally {
      setIsRegenerating({ ...isRegenerating, [qId]: false });
    }
  };

  const handleRemoveStimulus = (qId: string) => {
    if (!currentAssessment) return;
    const newQuestions = currentAssessment.questions.map(q => 
      q.id === qId ? { ...q, stimulus: "" } : q
    );
    const updated = { ...currentAssessment, questions: newQuestions };
    setCurrentAssessment(updated);
    saveHistory(history.map(h => h.id === updated.id ? updated : h));
  };

  const handleRemoveImage = (qId: string) => {
    if (!currentAssessment) return;
    const newQuestions = currentAssessment.questions.map(q => 
      q.id === qId ? { ...q, imagePrompt: "" } : q
    );
    const updated = { ...currentAssessment, questions: newQuestions };
    setCurrentAssessment(updated);
    saveHistory(history.map(h => h.id === updated.id ? updated : h));
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans print:bg-white print:text-black">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 print:hidden shadow-sm shadow-gray-100">
        <div className="flex items-center gap-3">
          <img src="https://hanyauntukmu.my.id/media_library/images/a4f17d1b2769221d4cd184db08c7df7c.PNG" alt="AsesmenAI Logo" className="w-8 h-8 rounded" />
          <h1 className="text-xl font-bold tracking-tight text-blue-900">AsesmenAI</h1>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="hidden sm:block">
          <TabsList>
            <TabsTrigger value="generator">Buat Baru</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="result" disabled={!currentAssessment}>Preview Soal</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* TAB GENERATOR */}
        {activeTab === "generator" && (
          <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <h2 className="text-2xl font-bold tracking-tight mb-2 text-gray-800">Buat Asesmen Baru</h2>
              <div className="text-gray-600 mt-2 leading-relaxed">
                AsesmenAI adalah asisten pintar untuk guru profesional dalam menyusun soal ujian berkualitas tinggi. 
                Sistem ini menghasilkan bank soal otomatis dengan stimulus berbasis cerita realistis (konteks dunia nyata) untuk mengasah nalar siswa. 
                Aplikasi generator soal asesmen cerdas bertenaga AI untuk guru profesional- dibuat oleh @faisalrohman jangan lupa kunjungi channel YT @hanyauntukmu dan website https://hanyauntukmu.my.id
                <div className="mt-3 font-semibold text-gray-700">Fitur Unggulan:</div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 text-sm">
                  <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></div> Dukungan soal berorientasi AKM dengan paragraf bercerita.</li>
                  <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></div> Proporsi kesukaran & ragam bentuk soal (PG, Benar Salah, Isian).</li>
                  <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></div> Regenerasi instan: ganti cerita, ganti gambar, atau revisi spesifik satu soal.</li>
                  <li className="flex items-start gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></div> Export ke Word / PDF dengan layout kunci jawaban & pembahasan terpisah.</li>
                </ul>
              </div>
            </div>
            
            {/* Mode Selection */}
            <div className="flex gap-4 p-1 bg-gray-200/50 rounded-lg w-full max-w-sm mx-auto mb-6">
              <button 
                onClick={() => setGenerateMode('manual')}
                className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${generateMode === 'manual' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Formulir Manual
              </button>
              <button 
                onClick={() => setGenerateMode('file')}
                className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${generateMode === 'file' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Upload Kisi-Kisi
              </button>
            </div>

            {generateMode === 'manual' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Kolom 1: Informasi Dasar */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2 border-b pb-2"><BookOpen className="w-5 h-5"/> Informasi Dasar</h3>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Materi Utama</label>
                    <Input value={materiUtama} onChange={e => setMateriUtama(e.target.value)} placeholder="Contoh: Sistem Tata Surya" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Sub Materi</label>
                    <Input value={subMateri} onChange={e => setSubMateri(e.target.value)} placeholder="Contoh: Karakteristik Planet" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Tingkat</label>
                      <Input value={tingkat} onChange={e => setTingkat(e.target.value)} placeholder="SD / SMP / SMA" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Kelas</label>
                      <Input value={kelas} onChange={e => setKelas(e.target.value)} placeholder="Contoh: 10" />
                    </div>
                  </div>
                </div>

                {/* Kolom 2: Parameter Soal */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2 border-b pb-2"><FileText className="w-5 h-5"/> Parameter Soal</h3>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">Komposisi Kesukaran</label>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <label className="text-xs text-gray-500 mb-1 block">Mudah</label>
                        <Input type="number" min="0" value={jumlahMudah} onChange={e => setJumlahMudah(Number(e.target.value))} />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-blue-500 mb-1 block">Sedang</label>
                        <Input type="number" min="0" value={jumlahSedang} onChange={e => setJumlahSedang(Number(e.target.value))} />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-red-500 mb-1 block">Sukar</label>
                        <Input type="number" min="0" value={jumlahSukar} onChange={e => setJumlahSukar(Number(e.target.value))} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Bentuk Soal</label>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {["Pilihan Ganda", "Pilihan Ganda Kompleks", "Benar Salah", "Isian Singkat", "Essay"].map(tipe => (
                        <label key={tipe} className="flex items-center gap-2">
                          <input type="checkbox" checked={bentukSoal.includes(tipe)} onChange={(e) => {
                            if (e.target.checked) setBentukSoal([...bentukSoal, tipe]);
                            else setBentukSoal(bentukSoal.filter(t => t !== tipe));
                          }} className="rounded text-blue-600" />
                          {tipe}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Opsi Stimulus</label>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {["Teks Bacaan", "Gambar", "Tabel Data", "Grafik"].map(stim => (
                        <label key={stim} className="flex items-center gap-2">
                          <input type="checkbox" checked={stimulusOptions.includes(stim)} onChange={(e) => {
                            if (e.target.checked) setStimulusOptions([...stimulusOptions, stim]);
                            else setStimulusOptions(stimulusOptions.filter(t => t !== stim));
                          }} className="rounded text-blue-600" />
                          {stim}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center space-y-4 max-w-2xl mx-auto text-center">
                 <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-2">
                   <FileText className="w-8 h-8" />
                 </div>
                 <h3 className="text-xl font-bold text-gray-800">Upload Dokumen Kisi-Kisi</h3>
                 <p className="text-gray-600 text-sm leading-relaxed max-w-lg">
                   Ajaib! AI akan membaca file PDF / Teks / Gambar kisi-kisi (blueprint) Anda dan membuatkan soal 
                   persis sesuai spesifikasi materi, bentuk soal, dan kesukaran yang ada di dalamnya secara instan.
                 </p>
                 <Input 
                   type="file" 
                   accept=".pdf,image/*,.txt"
                   onChange={e => setUploadFile(e.target.files?.[0] || null)}
                   className="max-w-xs mt-4"
                 />
                 {uploadFile && <div className="text-sm text-green-600 font-medium mt-2">File siap diunggah: {uploadFile.name}</div>}
              </div>
            )}

            <Button size="lg" className="w-full text-lg h-14 bg-blue-600 hover:bg-blue-700 mt-8" onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? <><RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Menggenerasi Soal...</> : <><BrainCircuit className="mr-2 h-5 w-5" /> Generate Asesmen</>}
            </Button>
          </div>
        )}

        {/* TAB HISTORY */}
        {activeTab === "history" && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight">History Asesmen</h2>
            {history.length === 0 ? (
              <p className="text-gray-500 bg-white p-8 rounded-xl text-center border border-gray-200">Belum ada history. Silakan buat asesmen baru.</p>
            ) : (
              <div className="grid gap-4">
                {history.map((item) => (
                  <div key={item.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <h3 className="font-semibold text-lg">{item.materiUtama}</h3>
                      <p className="text-sm text-gray-500">{item.tingkat} Kelas {item.kelas} • {item.questions.length} Soal • {new Date(item.date).toLocaleDateString("id-ID")}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => {
                        setHistory(history.filter(h => h.id !== item.id));
                        localStorage.setItem("asesmenHistory", JSON.stringify(history.filter(h => h.id !== item.id)));
                        if (currentAssessment?.id === item.id) setCurrentAssessment(null);
                      }}>Hapus</Button>
                      <Button onClick={() => loadFromHistory(item)}>Buka</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB RESULT */}
        {activeTab === "result" && currentAssessment && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Toolbar print hidden */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap gap-4 justify-between items-center print:hidden">
              <div>
                <h2 className="font-bold text-lg">{currentAssessment.materiUtama}</h2>
                <p className="text-sm text-gray-500">{currentAssessment.tingkat} Kelas {currentAssessment.kelas}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => exportToWord(currentAssessment, false)}>
                  <Download className="w-4 h-4 mr-2" /> Word (Soal Saja)
                </Button>
                <Button variant="outline" onClick={() => exportToWord(currentAssessment, true)}>
                  <Download className="w-4 h-4 mr-2" /> Word (+Kunci)
                </Button>
                <Button onClick={handlePrintPdf}>
                  <Printer className="w-4 h-4 mr-2" /> Print / PDF
                </Button>
              </div>
            </div>

            <Tabs defaultValue="soal" className="w-full">
              <TabsList className="print:hidden mb-6">
                <TabsTrigger value="soal">Lembar Soal</TabsTrigger>
                <TabsTrigger value="kunci">Kunci Jawaban</TabsTrigger>
                <TabsTrigger value="pembahasan">Pembahasan</TabsTrigger>
              </TabsList>

              {/* View Lembar Soal */}
              <TabsContent value="soal" className="space-y-8">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 print:p-0 print:border-none print:shadow-none">
                  <div className="text-center mb-8 pb-4 border-b">
                    <h1 className="text-2xl font-bold uppercase tracking-wider">LEMBAR Asesmen</h1>
                    <h2 className="text-lg font-semibold mt-1">{currentAssessment.materiUtama} - {currentAssessment.subMateri}</h2>
                    <p className="text-sm mt-1">Tingkat: {currentAssessment.tingkat} | Kelas: {currentAssessment.kelas}</p>
                  </div>

                  <div className="space-y-8">
                    {currentAssessment.questions.map((q, idx) => (
                      <div key={q.id} className="group relative border border-transparent hover:border-blue-100 rounded-xl p-2 -mx-2 transition-colors">
                        
                        {isRegenerating[q.id] && (
                          <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center rounded-xl">
                            <div className="bg-white px-4 py-2 rounded-full shadow-md border border-gray-200 flex items-center gap-2 text-blue-600 font-medium">
                              <RefreshCw className="w-5 h-5 animate-spin" /> Memproses AI...
                            </div>
                          </div>
                        )}

                        <div className="flex gap-4">
                          <div className="font-bold flex-shrink-0 w-6 text-gray-700 mt-1">{idx + 1}.</div>
                          <div className="w-full space-y-3">
                            {q.imagePrompt && (
                              <div className="mb-4">
                                <img 
                                  loading="lazy"
                                  src={`https://image.pollinations.ai/prompt/${encodeURIComponent(q.imagePrompt.replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'illustration')}?width=600&height=400&nologo=true&seed=${q.imageVersion || (Date.now() + idx)}`} 
                                  alt={q.imagePrompt} 
                                  className="w-full max-w-md rounded-lg object-contain bg-gray-50 border border-gray-200 min-h-[200px]"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = "https://placehold.co/600x400/f8fafc/94a3b8?text=Gambar+Gagal+Dimuat";
                                  }}
                                />
                              </div>
                            )}
                            {q.stimulus && (
                              <div className="bg-slate-50 p-5 rounded-xl text-sm border border-slate-200 text-slate-800 mb-3 whitespace-pre-wrap leading-relaxed shadow-sm">
                                {q.stimulus}
                              </div>
                            )}
                            
                            {q.type === 'Benar Salah' ? (
                              <table className="w-full mt-3 border-collapse border border-gray-300 text-sm">
                                <thead>
                                  <tr className="bg-gray-100">
                                    <th className="border border-gray-300 p-2 text-left">Pernyataan</th>
                                    <th className="border border-gray-300 p-2 w-20 text-center">Benar</th>
                                    <th className="border border-gray-300 p-2 w-20 text-center">Salah</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <td className="border border-gray-300 p-2">{q.question}</td>
                                    <td className="border border-gray-300 p-2"><div className="w-4 h-4 rounded-full border border-gray-400 mx-auto"></div></td>
                                    <td className="border border-gray-300 p-2"><div className="w-4 h-4 rounded-full border border-gray-400 mx-auto"></div></td>
                                  </tr>
                                </tbody>
                              </table>
                            ) : (
                              <p className="font-medium">{q.question}</p>
                            )}
                            
                            {/* Opsi untuk Pilihan Ganda */}
                            {q.options && q.options.length > 0 && (
                              <div className="flex flex-col gap-2 mt-3 text-sm">
                                {q.options.map((opt, i) => (
                                  <div key={i} className="pl-4">{opt}</div>
                                ))}
                              </div>
                            )}

                            {/* Ruang jawaban tulis */}
                            {!q.options?.length && q.type !== 'Benar Salah' && (
                              <div className="mt-4 border-b border-dashed border-gray-400 h-8 w-full max-w-md"></div>
                            )}

                            {/* Input Revisi Soal */}
                            <div className="mt-4 flex gap-2 print:hidden items-center">
                              <Input 
                                placeholder="Revisi custom (misal: buat lebih mudah, ubah ke essay...)" 
                                value={revisionInputs[q.id] || ''}
                                onChange={(e) => setRevisionInputs({...revisionInputs, [q.id]: e.target.value})}
                                className="text-xs h-8"
                              />
                              <Button 
                                size="sm" 
                                className="h-8 shrink-0"
                                onClick={() => handleRegenerateQuestion(q.id, "custom", revisionInputs[q.id])}
                                disabled={!revisionInputs[q.id]}
                              >
                                Revisi
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Menu Aksi per soal (hanya di web, hilang saat print) */}
                        <div className="absolute -top-3 right-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 backdrop-blur border border-gray-200 rounded-md shadow-sm p-1 flex gap-1 print:hidden z-10">
                          {q.stimulus && (
                            <>
                              <button onClick={() => handleRegenerateQuestion(q.id, "stimulus")} className="p-1.5 hover:bg-gray-100 rounded text-gray-600 flex items-center gap-1 text-xs" title="Regenerate Stimulus"><RefreshCw className="w-3 h-3"/> Teks</button>
                              <button onClick={() => handleRemoveStimulus(q.id)} className="p-1.5 hover:bg-red-50 text-red-600 rounded" title="Hapus Teks Stimulus"><Trash2 className="w-3 h-3"/></button>
                            </>
                          )}
                          {q.imagePrompt && (
                            <button onClick={() => handleRemoveImage(q.id)} className="p-1.5 hover:bg-red-50 text-red-600 rounded flex items-center gap-1 text-xs" title="Hapus Gambar"><Trash2 className="w-3 h-3"/> Gbr</button>
                          )}
                          <button onClick={() => handleRegenerateQuestion(q.id, "image")} className="p-1.5 hover:bg-gray-100 rounded text-gray-600 flex items-center gap-1 text-xs" title="Regen Gambar"><Image className="w-3 h-3"/> Regen Gbr</button>
                          <div className="w-px h-6 bg-gray-200 mx-1"></div>
                          <button onClick={() => handleRegenerateQuestion(q.id, "full")} className="px-2 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 rounded" title="Regenerate Soal Keseluruhan">Regen Soal</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* View Kunci Jawaban */}
              <TabsContent value="kunci">
                 <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 print:p-0 print:border-none print:shadow-none break-before-page">
                    <h1 className="text-xl font-bold uppercase tracking-wider mb-6 pb-4 border-b">Kunci Jawaban</h1>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                      {currentAssessment.questions.map((q, idx) => (
                        <div key={q.id} className="flex gap-4 border-b pb-2">
                           <div className="font-bold flex-shrink-0 w-8">{idx + 1}.</div>
                           <div>
                              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600 mb-1 inline-block">{q.type}</span>
                              <div className="font-semibold text-green-700">{q.answer}</div>
                           </div>
                        </div>
                      ))}
                    </div>
                 </div>
              </TabsContent>

              {/* View Pembahasan */}
              <TabsContent value="pembahasan">
                 <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 print:p-0 print:border-none print:shadow-none break-before-page">
                    <h1 className="text-xl font-bold uppercase tracking-wider mb-6 pb-4 border-b">Pembahasan Soal</h1>
                    <div className="space-y-8">
                      {currentAssessment.questions.map((q, idx) => (
                        <div key={q.id} className="flex gap-4">
                           <div className="font-bold flex-shrink-0 w-8 text-xl text-blue-600">{idx + 1}.</div>
                           <div className="space-y-2">
                              <p className="text-gray-600 text-sm italic">Soal: {q.question}</p>
                              <div className="bg-green-50 text-green-900 px-3 py-1 rounded-md text-sm inline-block font-medium">Kunci: {q.answer}</div>
                              <div className="text-sm leading-relaxed whitespace-pre-wrap">{q.explanation}</div>
                           </div>
                        </div>
                      ))}
                    </div>
                 </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>

      {/* API Key Modal Overlay */}
      {showApiKeyDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold mb-2">Limit API Sistem Tercapai</h3>
            <p className="text-sm text-gray-600 mb-4">
              Aplikasi ini menggunakan API Gemini untuk menghasilkan soal. Limit gratis dari sistem kami saat ini telah habis. 
              Untuk melanjutkan, Anda dapat memasukkan API Key Gemini Anda sendiri. Key akan disimpan dengan aman di browser Anda dan tidak akan diteruskan ke pihak lain.
            </p>
            <div className="space-y-3">
              <Input 
                type="password"
                placeholder="Paste Gemini API Key Anda (AIza...)" 
                value={customApiKey}
                onChange={e => setCustomApiKey(e.target.value)}
              />
              <div className="text-xs text-gray-500">
                Belum punya? Dapatkan secara gratis di <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-600 underline">Google AI Studio</a>.
              </div>
            </div>
            <div className="mt-6 flex gap-3 justify-end">
               <Button variant="outline" onClick={() => setShowApiKeyDialog(false)}>Batal</Button>
               <Button onClick={() => {
                 if (customApiKey) {
                   localStorage.setItem("customGeminiApiKey", customApiKey);
                   setShowApiKeyDialog(false);
                   // Bisa beri notif berhasil
                 } else {
                   alert("API Key tidak boleh kosong");
                 }
               }}>Simpan & Lanjutkan</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
