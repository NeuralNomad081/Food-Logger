"use client";

import { useState, useRef, useCallback } from "react";
import { Camera, X, Check, Upload, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import axios from "axios";

export default function ScanPage() {
  const [image, setImage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streamActive, setStreamActive] = useState(false);
  const router = useRouter();

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setStreamActive(true);
      }
    } catch (err) {
      console.error("Camera error:", err);
      alert("Please allow camera access to scan labels.");
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext("2d");
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context?.drawImage(videoRef.current, 0, 0);
      
      const dataUrl = canvasRef.current.toDataURL("image/jpeg");
      setImage(dataUrl);
      
      // Stop stream
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      setStreamActive(false);
      
      // Convert to file for upload
      canvasRef.current.toBlob((blob) => {
        if (blob) setFile(new File([blob], "label.jpg", { type: "image/jpeg" }));
      }, "image/jpeg");
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setScanning(true);
    const formData = new FormData();
    formData.append("image", file);

    try {
      // Assuming backend runs on 8000
      const response = await axios.post("http://localhost:8000/scan-label", formData);
      // Store in local storage to pass to review screen
      localStorage.setItem("lastScan", JSON.stringify(response.data.parsed_nutrition));
      router.push("/review");
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to scan label. Try again.");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black">
      {/* Header */}
      <div className="p-4 flex justify-between items-center bg-black text-white">
        <button onClick={() => router.back()}><X className="w-6 h-6" /></button>
        <h2 className="text-lg font-bold">Scan Label</h2>
        <div className="w-6"></div>
      </div>

      {/* Main View */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {image ? (
          <img src={image} className="max-w-full max-h-full object-contain" alt="Captured" />
        ) : streamActive ? (
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
        ) : (
          <div className="text-center text-slate-400">
            <Camera className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p>Ready to scan nutrition label</p>
          </div>
        )}

        {scanning && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white">
            <RefreshCw className="w-12 h-12 animate-spin mb-4 text-blue-400" />
            <p className="font-bold">Analyzing Nutrition Data...</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-8 bg-black/90 flex justify-around items-center">
        {!image && !streamActive && (
          <button 
            onClick={startCamera}
            className="w-20 h-20 bg-white rounded-full flex items-center justify-center"
          >
            <Camera className="w-8 h-8 text-black" />
          </button>
        )}

        {streamActive && (
          <button 
            onClick={capturePhoto}
            className="w-20 h-20 bg-white rounded-full p-1 border-4 border-slate-500"
          >
            <div className="w-full h-full bg-white rounded-full border border-black"></div>
          </button>
        )}

        {image && !scanning && (
          <>
            <button 
              onClick={() => { setImage(null); startCamera(); }}
              className="p-4 rounded-full bg-slate-800 text-white"
            >
              <RefreshCw className="w-6 h-6" />
            </button>
            <button 
              onClick={handleUpload}
              className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center"
            >
              <Check className="w-10 h-10 text-white" />
            </button>
          </>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
