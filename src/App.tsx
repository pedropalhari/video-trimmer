import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import "./App.css";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms
    .toString()
    .padStart(3, "0")}`;
}

function parseTime(timeStr: string): number {
  const [minsStr, secsStr] = timeStr.split(":");
  const [secs, ms = "0"] = secsStr.split(".");
  return (
    parseInt(minsStr) * 60 + parseInt(secs) + parseInt(ms.padEnd(3, "0")) / 1000
  );
}

function App() {
  const [video, setVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [trimValues, setTrimValues] = useState([0, 100]);
  const [loading, setLoading] = useState(false);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ffmpegRef = useRef(new FFmpeg());
  const [progress, setProgress] = useState(0);
  const [processingModalOpen, setProcessingModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const totalDurationRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDropping, setIsDropping] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);

      if (isPreviewing) {
        const startTime = (trimValues[0] / 100) * duration;
        const endTime = (trimValues[1] / 100) * duration;
        if (time < startTime) {
          videoRef.current.currentTime = startTime;
        } else if (time > endTime) {
          videoRef.current.currentTime = startTime;
        }
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleTimeInputChange = (index: number, timeStr: string) => {
    try {
      const newTime = parseTime(timeStr);
      if (newTime >= 0 && newTime <= duration) {
        const newPercentage = (newTime / duration) * 100;
        const newValues = [...trimValues];
        newValues[index] = newPercentage;
        setTrimValues(newValues);
      }
    } catch (error) {
      console.error("Invalid time format");
    }
  };

  const load = async () => {
    try {
      const ffmpeg = ffmpegRef.current;
      console.log("Loading FFmpeg...");
      ffmpeg.on("log", ({ message }) => {
        console.log("FFmpeg log:", message);
      });

      await ffmpeg.load();

      console.log("FFmpeg loaded successfully");
      setFfmpegLoaded(true);
    } catch (error) {
      console.error("Error loading FFmpeg:", error);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) {
      setIsDropping(true);
      setTimeout(() => {
        setVideo(file);
        setVideoUrl(URL.createObjectURL(file));
        setTimeout(() => setIsDropping(false), 50);
      }, 300);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const cancelProcessing = () => {
    setProcessingModalOpen(false);
    setLoading(false);
    setProgress(0);
    setIsProcessing(false);
  };

  const trimVideo = async () => {
    if (!video || !videoRef.current) return;

    try {
      setIsProcessing(true);
      setLoading(true);
      setProgress(0);
      setProcessingModalOpen(true);

      const ffmpeg = ffmpegRef.current;
      const inputFileName = "input.mp4";
      const outputFileName = "output.mp4";

      const duration = videoRef.current.duration;
      const startTime = (trimValues[0] / 100) * duration;
      const endTime = (trimValues[1] / 100) * duration;
      totalDurationRef.current = endTime - startTime;

      console.log("Writing input file...");
      await ffmpeg.writeFile(inputFileName, await fetchFile(video));
      setProgress(20);
      console.log("Input file written successfully");

      // Add progress tracking
      ffmpeg.on("log", ({ message }) => {
        console.log("FFmpeg log:", message);
        const timeMatch = message.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (timeMatch) {
          const [_, hours, minutes, seconds] = timeMatch;
          const currentTime =
            parseFloat(hours) * 3600 +
            parseFloat(minutes) * 60 +
            parseFloat(seconds);

          // Calculate progress between 20% and 80%
          const processProgress = Math.min(
            (currentTime / totalDurationRef.current) * 60 + 20,
            80
          );
          setProgress(processProgress);
        }
      });

      const command = [
        "-ss",
        startTime.toString(),
        "-i",
        inputFileName,
        "-t",
        (endTime - startTime).toString(),
        "-c",
        "copy",
        "-progress",
        "pipe:1",
        outputFileName,
      ];
      console.log("Executing FFmpeg command:", command.join(" "));

      await ffmpeg.exec(command);
      setProgress(80);
      console.log("FFmpeg command executed successfully");

      console.log("Reading output file...");
      const data = await ffmpeg.readFile(outputFileName);
      setProgress(90);
      console.log("Output file read successfully");

      const blob = new Blob([data], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);

      console.log("Initiating download...");
      const a = document.createElement("a");
      a.href = url;
      a.download = "trimmed-video.mp4";
      a.click();
      setProgress(100);
      console.log("Download initiated");
    } catch (error: any) {
      console.error("Error trimming video:", error);
    } finally {
      setIsProcessing(false);
      setTimeout(() => {
        setLoading(false);
        setProcessingModalOpen(false);
        setProgress(0);
      }, 1000);
    }
  };

  const startPreview = () => {
    if (videoRef.current) {
      const startTime = (trimValues[0] / 100) * duration;
      videoRef.current.currentTime = startTime;
      videoRef.current.play();
      setIsPreviewing(true);
    }
  };

  const stopPreview = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPreviewing(false);
    }
  };

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black text-foreground dark">
      {/* Background patterns */}
      <div className="fixed -inset-[100px] w-[calc(100vw+200px)] h-[calc(100vh+200px)] bg-[linear-gradient(45deg,transparent_25%,rgba(148,163,184,0.05)_25%,rgba(148,163,184,0.05)_50%,transparent_50%,transparent_75%,rgba(148,163,184,0.05)_75%)] bg-[length:128px_128px] rotate-12 blur-[0.5px]" />

      {/* Gradient accents */}
      <div className="fixed -inset-1/4 w-[150vw] h-[150vh] bg-slate-900/30 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
      <div className="fixed -inset-1/4 w-[150vw] h-[150vh] bg-slate-900/30 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2" />

      <div className="absolute inset-0 flex flex-col items-center p-6">
        <h1 className="text-4xl font-bold mb-8 text-white tracking-tight">
          Video Trimmer
        </h1>
        <Card className="max-w-4xl w-full backdrop-blur-sm bg-black/50 shadow-2xl border-white/10 relative">
          <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-slate-500/5 to-transparent pointer-events-none" />

          <div className="p-6 relative">
            <div 
              className="relative transition-[height] duration-300 ease-in-out" 
              style={{ height: video ? '690px' : '480px' }}
            >
              <div
                className={`absolute inset-0 transition-all duration-300 ease-in-out ${
                  isDropping || isClearing ? "scale-95 opacity-0" : "scale-100 opacity-100"
                }`}
              >
                {!video ? (
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={`h-full relative w-full aspect-video border-2 border-dashed rounded-lg overflow-hidden transition-all duration-300 ease-in-out ${
                      isDragging
                        ? "border-white scale-[1.02] bg-slate-800/40"
                        : "border-muted-foreground/25 hover:border-muted-foreground/50 group"
                    }`}
                  >
                    <div className={`absolute inset-0 transition-colors duration-300 ${
                      isDragging ? "bg-slate-800/40" : "bg-slate-800/20 group-hover:bg-slate-800/30"
                    }`} />
                    <div className={`absolute inset-0 flex flex-col items-center justify-center space-y-4 transition-transform duration-300 ${
                      isDragging ? "scale-110" : "scale-100"
                    }`}>
                      <div className={`w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center transition-transform duration-300 ${
                        isDragging ? "scale-110" : "scale-100"
                      }`}>
                        <svg 
                          className="w-8 h-8 text-slate-400" 
                          fill="none" 
                          viewBox="0 0 24 24" 
                          stroke="currentColor"
                        >
                          <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeWidth={2} 
                            d="M7 4v16M17 4v16M3 8h18M3 16h18" 
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-lg font-medium">
                          {isDragging ? "Release to Upload" : "Drag and drop your video here"}
                        </p>
                        <p className="text-muted-foreground/70 text-sm text-center mt-1">
                          MP4, WebM, and other video formats
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col">
                    <div className="space-y-6">
                      <div className="relative aspect-video">
                        <video
                          ref={videoRef}
                          src={videoUrl}
                          controls
                          className="w-full h-full rounded-lg bg-muted/50 shadow-lg"
                          onTimeUpdate={handleTimeUpdate}
                          onLoadedMetadata={handleLoadedMetadata}
                          onEnded={() => isPreviewing && startPreview()}
                        />
                        {isPreviewing && (
                          <div className="absolute top-4 right-4 bg-black/80 text-white px-3 py-1 rounded-full text-sm">
                            Preview Mode
                          </div>
                        )}
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between mb-8">
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-muted-foreground">
                              Start Time
                            </p>
                            <Input
                              value={formatTime((trimValues[0] / 100) * duration)}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                handleTimeInputChange(0, e.target.value)
                              }
                              className="w-44 text-lg font-medium"
                            />
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-muted-foreground">
                              End Time
                            </p>
                            <Input
                              value={formatTime((trimValues[1] / 100) * duration)}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                handleTimeInputChange(1, e.target.value)
                              }
                              className="w-44 text-lg font-medium"
                            />
                          </div>
                        </div>
                        <div className="relative">
                          <div className="absolute inset-0 h-8 bg-slate-800/50 rounded-full">
                            <div
                              className="absolute h-8 bg-slate-600 rounded-full"
                              style={{
                                left: `${trimValues[0]}%`,
                                width: `${trimValues[1] - trimValues[0]}%`,
                              }}
                            />
                          </div>
                          <Slider
                            defaultValue={[0, 100]}
                            max={100}
                            step={0.1}
                            value={trimValues}
                            onValueChange={(newValues) => {
                              setTrimValues(newValues);
                              if (videoRef.current && !isPreviewing) {
                                const startTime = (newValues[0] / 100) * duration;
                                videoRef.current.currentTime = startTime;
                              }
                            }}
                            className="relative z-10"
                          />
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <Button
                          variant="outline"
                          onClick={isPreviewing ? stopPreview : startPreview}
                          className="bg-slate-800/50 hover:bg-slate-700/50"
                        >
                          {isPreviewing ? "Stop Preview" : "Preview Trim"}
                        </Button>

                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              stopPreview();
                              setIsClearing(true);
                              setTimeout(() => {
                                setVideo(null);
                                setVideoUrl("");
                                setTrimValues([0, 100]);
                                setTimeout(() => setIsClearing(false), 50);
                              }, 300);
                            }}
                          >
                            Clear
                          </Button>
                          <Button
                            onClick={trimVideo}
                            disabled={loading || !ffmpegLoaded}
                            className="bg-slate-700 hover:bg-slate-600"
                          >
                            {loading
                              ? "Processing..."
                              : !ffmpegLoaded
                              ? "Loading FFmpeg..."
                              : "Trim Video"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Dialog
        open={processingModalOpen}
        onOpenChange={(open) => !open && cancelProcessing()}
      >
        <DialogContent className="bg-black/90 border-white/10 max-w-md">
          <div className="flex flex-col items-center justify-center p-6 space-y-6">
            <div className="relative w-32 h-32">
              {/* Track */}
              <div className="absolute inset-0 rounded-full border-4 border-slate-800" />
              {/* Progress */}
              <svg
                className="absolute inset-0 w-full h-full rotate-[-90deg]"
                viewBox="0 0 100 100"
              >
                <circle
                  className="transition-all duration-300 ease-in-out"
                  cx="50"
                  cy="50"
                  r="46"
                  stroke="white"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={`${progress * 2.89}, 289`}
                  strokeLinecap="round"
                />
              </svg>
              {/* Percentage */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold">
                  {Math.round(progress)}%
                </span>
              </div>
            </div>
            <div className="space-y-2 text-center">
              <h3 className="text-lg font-semibold">Processing Video</h3>
              <p className="text-sm text-slate-400">
                This might take a few moments...
              </p>
            </div>
            <Button
              variant="outline"
              className="mt-4"
              onClick={cancelProcessing}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
