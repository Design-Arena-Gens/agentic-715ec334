'use client';

import { useState, useRef, useEffect } from 'react';

export default function Home() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [outputUrl, setOutputUrl] = useState<string>('');
  const [watermarkRegion, setWatermarkRegion] = useState({ x: 0, y: 0, width: 100, height: 100 });
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ffmpegRef = useRef<any>(null);

  useEffect(() => {
    loadFFmpeg();
  }, []);

  const loadFFmpeg = async () => {
    try {
      setProgress('Loading FFmpeg...');
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { toBlobURL } = await import('@ffmpeg/util');

      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      ffmpeg.on('log', ({ message }) => {
        console.log(message);
      });

      ffmpeg.on('progress', ({ progress: prog }) => {
        setProgress(`Processing: ${Math.round(prog * 100)}%`);
      });

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      setFfmpegLoaded(true);
      setProgress('FFmpeg loaded successfully');
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      setProgress('Failed to load FFmpeg. Please refresh the page.');
    }
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setOutputUrl('');
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
    }
  };

  const processVideo = async () => {
    if (!videoFile || !ffmpegLoaded || !ffmpegRef.current) {
      setProgress('Please upload a video and wait for FFmpeg to load');
      return;
    }

    setProcessing(true);
    setProgress('Starting video processing...');

    try {
      const ffmpeg = ffmpegRef.current;

      // Write video file to FFmpeg filesystem
      const videoData = await videoFile.arrayBuffer();
      await ffmpeg.writeFile('input.mp4', new Uint8Array(videoData));

      let filterComplex = '';

      // Apply watermark removal using delogo filter
      if (watermarkRegion.width > 0 && watermarkRegion.height > 0) {
        filterComplex = `[0:v]delogo=x=${watermarkRegion.x}:y=${watermarkRegion.y}:w=${watermarkRegion.width}:h=${watermarkRegion.height}[v]`;
      } else {
        filterComplex = '[0:v]copy[v]';
      }

      let args = [];

      if (audioFile) {
        // Add voiceover audio
        const audioData = await audioFile.arrayBuffer();
        await ffmpeg.writeFile('audio.mp3', new Uint8Array(audioData));

        if (watermarkRegion.width > 0 && watermarkRegion.height > 0) {
          args = [
            '-i', 'input.mp4',
            '-i', 'audio.mp3',
            '-filter_complex', `${filterComplex};[1:a]volume=1.0[a]`,
            '-map', '[v]',
            '-map', '[a]',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-c:a', 'aac',
            '-shortest',
            'output.mp4'
          ];
        } else {
          args = [
            '-i', 'input.mp4',
            '-i', 'audio.mp3',
            '-c:v', 'copy',
            '-map', '0:v',
            '-map', '1:a',
            '-c:a', 'aac',
            '-shortest',
            'output.mp4'
          ];
        }
      } else {
        // Only remove watermark
        if (watermarkRegion.width > 0 && watermarkRegion.height > 0) {
          args = [
            '-i', 'input.mp4',
            '-filter_complex', filterComplex,
            '-map', '[v]',
            '-map', '0:a?',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-c:a', 'copy',
            'output.mp4'
          ];
        } else {
          setProgress('Please select a watermark region or upload audio');
          setProcessing(false);
          return;
        }
      }

      setProgress('Processing video...');
      await ffmpeg.exec(args);

      // Read output file
      const data = await ffmpeg.readFile('output.mp4');
      const blob = new Blob([data], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      setOutputUrl(url);
      setProgress('Video processed successfully!');
    } catch (error) {
      console.error('Processing error:', error);
      setProgress(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setProcessing(false);
    }
  };

  const selectWatermarkRegion = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    let startX = 0, startY = 0;
    let isDrawing = false;

    canvas.style.display = 'block';
    canvas.style.cursor = 'crosshair';

    const handleMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      startX = (e.clientX - rect.left) * scaleX;
      startY = (e.clientY - rect.top) * scaleY;
      isDrawing = true;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawing) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const currentX = (e.clientX - rect.left) * scaleX;
      const currentY = (e.clientY - rect.top) * scaleY;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0);

      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 3;
      ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDrawing) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const endX = (e.clientX - rect.left) * scaleX;
      const endY = (e.clientY - rect.top) * scaleY;

      setWatermarkRegion({
        x: Math.min(startX, endX),
        y: Math.min(startY, endY),
        width: Math.abs(endX - startX),
        height: Math.abs(endY - startY)
      });

      isDrawing = false;
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);

      setTimeout(() => {
        canvas.style.display = 'none';
      }, 1000);
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="min-h-screen p-8 pb-20 sm:p-20 bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <main className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8 text-gray-900 dark:text-white">
          Video Watermark Remover & Voiceover
        </h1>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 mb-6">
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Upload Video
            </label>
            <input
              type="file"
              accept="video/*"
              onChange={handleVideoUpload}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              disabled={processing}
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Upload Voiceover Audio (Optional)
            </label>
            <input
              type="file"
              accept="audio/*"
              onChange={handleAudioUpload}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              disabled={processing}
            />
          </div>

          {videoUrl && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Original Video</h3>
              <div className="relative">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  className="w-full rounded-lg"
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 w-full h-full hidden"
                  style={{ display: 'none' }}
                />
              </div>

              <div className="mt-4 space-y-3">
                <button
                  onClick={selectWatermarkRegion}
                  disabled={processing}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  Select Watermark Region
                </button>

                {watermarkRegion.width > 0 && (
                  <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 p-3 rounded">
                    Selected region: {Math.round(watermarkRegion.x)}, {Math.round(watermarkRegion.y)} -
                    {Math.round(watermarkRegion.width)}x{Math.round(watermarkRegion.height)}px
                  </div>
                )}

                <button
                  onClick={processVideo}
                  disabled={processing || !ffmpegLoaded}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {processing ? 'Processing...' : 'Process Video'}
                </button>
              </div>
            </div>
          )}

          {progress && (
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">{progress}</p>
            </div>
          )}

          {outputUrl && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Processed Video</h3>
              <video
                src={outputUrl}
                controls
                className="w-full rounded-lg mb-4"
              />
              <a
                href={outputUrl}
                download="processed_video.mp4"
                className="block w-full text-center bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
              >
                Download Processed Video
              </a>
            </div>
          )}
        </div>

        <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">How to use:</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
            <li>Upload your video file</li>
            <li>Click "Select Watermark Region" and draw a box around the watermark</li>
            <li>Optionally upload an audio file to add as voiceover</li>
            <li>Click "Process Video" to remove the watermark and/or add voiceover</li>
            <li>Download your processed video</li>
          </ol>
        </div>
      </main>
    </div>
  );
}
