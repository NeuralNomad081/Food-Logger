"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, Trash2, Check, RefreshCw, FileText } from "lucide-react";
import axios from "axios";

export default function NotebookPage() {
  const [image, setImage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const router = useRouter();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      const reader = new FileReader();
      reader.onload = (ev) => setImage(ev.target?.result as string);
      reader.readAsDataURL(f);
    }
  };

  const startParse = async () => {
    if (!file) return;
    setParsing(true);
    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await axios.post("http://localhost:8000/parse-notebook", formData);
      setItems(response.data.parsed_items || []);
    } catch (err) {
      alert("Error parsing handwriting. Try again.");
    } finally {
      setParsing(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <header className="p-4 bg-white border-b flex justify-between items-center fixed top-0 w-full z-10 max-w-md">
        <button onClick={() => router.back()}><X className="w-6 h-6 text-slate-400" /></button>
        <h2 className="text-xl font-bold text-slate-800">Notebook Parser</h2>
        <div className="w-6"></div>
      </header>

      <main className="p-6 pt-20 space-y-6 pb-24">
        {/* Step 1: Upload */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
           <p className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-widest text-center">Step 1: Upload handwritten log</p>
           {!image ? (
               <label className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 rounded-2xl hover:bg-slate-50 cursor-pointer transition-colors">
                  <Upload className="w-12 h-12 text-blue-500 mb-2 opacity-50" />
                  <p className="text-slate-600 font-medium">Select photo</p>
                  <input type="file" className="hidden" accept="image/*" onChange={handleFile} />
               </label>
           ) : (
               <div className="relative group">
                  <img src={image} className="w-full h-48 object-cover rounded-xl shadow-sm" alt="Notebook" />
                  <button onClick={() => setImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white p-2 rounded-full shadow-lg">
                      <Trash2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={startParse}
                    disabled={parsing}
                    className="w-full mt-4 bg-blue-600 text-white font-bold py-3 rounded-xl shadow-md flex items-center justify-center disabled:opacity-50"
                  >
                    {parsing ? <RefreshCw className="animate-spin mr-2" /> : <Check className="mr-2" />}
                    {parsing ? "Parsing..." : "Start Parsing"}
                  </button>
               </div>
           )}
        </div>

        {/* Step 2: Items List */}
        {items.length > 0 && (
            <div className="space-y-4">
               <p className="text-sm font-bold text-slate-400 uppercase tracking-widest px-2">Extracted Items</p>
               <div className="space-y-3">
                  {items.map((item, idx) => (
                      <div key={idx} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group">
                          <div className="flex items-center">
                             <div className="bg-purple-100 p-3 rounded-xl mr-4 group-hover:scale-110 transition-transform">
                                <FileText className="w-5 h-5 text-purple-600" />
                             </div>
                             <div>
                                <p className="font-bold text-slate-800 capitalize leading-tight">{item.food}</p>
                                <p className="text-xs text-slate-500">{item.quantity} {item.unit || "units"}</p>
                             </div>
                          </div>
                          <button className="text-blue-600 font-bold text-sm">Log</button>
                      </div>
                  ))}
               </div>
            </div>
        )}
      </main>

      {items.length > 0 && (
          <footer className="p-6 fixed bottom-0 w-full z-10 max-w-md bg-white border-t border-slate-100 shadow-xl rounded-t-3xl">
              <button 
                onClick={() => router.push("/")}
                className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-transform"
              >
                  <Check className="w-6 h-6 mr-2" />
                  Log All Items
              </button>
          </footer>
      )}
    </div>
  );
}
