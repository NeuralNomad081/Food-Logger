"use client";

import { Camera, Image as ImageIcon, History, Plus } from "lucide-react";
import Link from "next/link";

export default function Home() {
  const dailyCalories = 1250; // Mock data
  const targetCalories = 2000;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="p-6 bg-blue-600 text-white rounded-b-3xl shadow-lg">
        <h1 className="text-2xl font-bold">Good Morning!</h1>
        <div className="mt-6 flex justify-between items-end">
          <div>
            <p className="opacity-80 text-sm italic">Daily Progress</p>
            <p className="text-4xl font-black">
              {dailyCalories} <span className="text-lg font-normal">kcal</span>
            </p>
          </div>
          <p className="text-sm font-medium">Goal: {targetCalories} kcal</p>
        </div>
        {/* Progress bar */}
        <div className="mt-4 w-full h-2 bg-blue-400/50 rounded-full overflow-hidden">
          <div 
            className="h-full bg-white transition-all duration-1000"
            style={{ width: `${(dailyCalories / targetCalories) * 100}%` }}
          ></div>
        </div>
      </header>

      {/* Action Grid */}
      <section className="p-6 grid grid-cols-2 gap-4 -mt-4">
        <Link 
          href="/scan"
          className="flex flex-col items-center justify-center p-6 bg-white border border-slate-100 rounded-3xl shadow-sm hover:shadow-md transition-shadow aspect-square"
        >
          <div className="bg-orange-100 p-4 rounded-2xl mb-3">
            <Camera className="w-8 h-8 text-orange-600" />
          </div>
          <span className="font-bold text-slate-800">Scan Label</span>
        </Link>
        <Link
          href="/notebook"
          className="flex flex-col items-center justify-center p-6 bg-white border border-slate-100 rounded-3xl shadow-sm hover:shadow-md transition-shadow aspect-square"
        >
          <div className="bg-purple-100 p-4 rounded-2xl mb-3">
            <ImageIcon className="w-8 h-8 text-purple-600" />
          </div>
          <span className="font-bold text-slate-800">Parse Notes</span>
        </Link>
      </section>

      {/* Recent Activity */}
      <section className="flex-1 px-6 pb-20">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-800">Recent Logs</h2>
          <Link href="/history" className="text-sm text-blue-600 font-semibold flex items-center">
            View All <History className="ml-1 w-4 h-4" />
          </Link>
        </div>
        <div className="space-y-3">
          {[
            { name: "Greek Yogurt", kcal: 150, time: "8:30 AM" },
            { name: "Handful Almonds", kcal: 180, time: "11:00 AM" },
          ].map((item, i) => (
            <div key={i} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
              <div>
                <p className="font-bold text-slate-800">{item.name}</p>
                <p className="text-xs text-slate-500">{item.time}</p>
              </div>
              <p className="font-black text-slate-800">{item.kcal} kcal</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom FAB */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2">
        <Link 
          href="/add-manual"
          className="bg-blue-600 text-white p-4 rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
        >
          <Plus className="w-8 h-8" />
        </Link>
      </div>
    </div>
  );
}
