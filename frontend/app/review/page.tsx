"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Calculator, Edit3, Trash2 } from "lucide-react";

export default function ReviewPage() {
  const [data, setData] = useState<any>(null);
  const [consumed, setConsumed] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const scan = localStorage.getItem("lastScan");
    if (scan) {
      const parsed = JSON.parse(scan);
      setData(parsed);
      setConsumed(parsed.serving_size || 0);
    }
  }, []);

  if (!data) return <div className="p-8 text-center">Loading scan results...</div>;

  const ratio = data.serving_size > 0 ? (consumed / data.serving_size) : 1;
  const scaled = {
    calories: Math.round(data.calories * ratio),
    protein: (data.protein_g * ratio).toFixed(1),
    carbs: (data.carbs_g * ratio).toFixed(1),
    fat: (data.fat_g * ratio).toFixed(1),
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <header className="p-4 bg-white border-b flex justify-between items-center shadow-sm">
        <button onClick={() => router.back()}><X className="w-6 h-6" /></button>
        <h2 className="text-xl font-bold">Review Food</h2>
        <div className="w-6"></div>
      </header>

      <main className="p-6 space-y-6">
        {/* Food Name Card */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <p className="text-xs text-blue-600 font-bold uppercase tracking-wider mb-1">Detected Food</p>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-black text-slate-800">{data.food_name || "Unknown Item"}</h1>
              <p className="text-slate-500">{data.brand || "Detected from Label"}</p>
            </div>
            <button className="p-2 bg-slate-100 rounded-full text-slate-400">
              <Edit3 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Serving Size Calculator */}
        <div className="bg-blue-600 p-6 rounded-3xl shadow-lg relative overflow-hidden">
          <Calculator className="absolute -right-4 -top-4 w-24 h-24 text-white/10 rotate-12" />
          <p className="text-white/80 text-sm font-bold mb-4">How much did you eat?</p>
          <div className="flex items-center space-x-4">
            <input 
              type="number"
              value={consumed}
              onChange={(e) => setConsumed(Number(e.target.value))}
              className="bg-white/20 border border-white/30 text-white text-3xl font-black w-28 p-2 rounded-xl focus:outline-none placeholder-white/50"
            />
            <span className="text-2xl font-bold text-white">{data.serving_unit}</span>
          </div>
          <p className="mt-2 text-xs text-white/60">Label serving: {data.serving_size} {data.serving_unit}</p>
        </div>

        {/* Scaled Nutrients */}
        <div className="grid grid-cols-2 gap-4">
           <NutrientCard label="Calories" value={scaled.calories} unit="kcal" color="blue" />
           <NutrientCard label="Protein" value={scaled.protein} unit="g" color="orange" />
           <NutrientCard label="Carbs" value={scaled.carbs} unit="g" color="purple" />
           <NutrientCard label="Fat" value={scaled.fat} unit="g" color="yellow" />
        </div>
      </main>

      <footer className="p-6 mt-auto">
        <button 
          onClick={() => {
            // Mock API call simulation
            alert("Food logged successfully!");
            router.push("/");
          }}
          className="w-full bg-blue-600 text-white font-black py-4 rounded-3xl shadow-xl flex items-center justify-center space-x-2 text-lg active:scale-95 transition-transform"
        >
          <Check className="w-6 h-6" />
          <span>Confirm & Log</span>
        </button>
      </footer>
    </div>
  );
}

function NutrientCard({ label, value, unit, color }: { label: string, value: string | number, unit: string, color: string }) {
    const colors: any = {
        blue: "text-blue-600 bg-blue-50",
        orange: "text-orange-600 bg-orange-50",
        purple: "text-purple-600 bg-purple-50",
        yellow: "text-yellow-600 bg-yellow-50",
    }
    return (
        <div className={`p-4 rounded-2xl border border-slate-100 ${colors[color]} shadow-sm`}>
            <p className="text-xs font-bold uppercase tracking-widest opacity-60 mb-1">{label}</p>
            <p className="text-xl font-black">{value} <span className="text-sm font-normal">{unit}</span></p>
        </div>
    )
}
