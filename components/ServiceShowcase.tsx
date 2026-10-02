"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { barlow } from "@/lib/fonts";

interface WaveConfig {
  frequency: number;
  amplitude: number;
  speed: number;
  layers: number;
}

export type ShowcaseSlide = {
  key: string;
  overline: string;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  videoSrc?: string;
  /** Product shots shown beside the copy when the slide has no video. */
  images: { src: string; alt: string }[];
};

const WAVE_CONFIGS: WaveConfig[] = [
  { frequency: 0.006, amplitude: 70, speed: 0.017, layers: 3 },
  { frequency: 0.018, amplitude: 55, speed: 0.022, layers: 3 },
  { frequency: 0.012, amplitude: 38, speed: 0.013, layers: 3 },
];

function WaveformCanvas({ config }: { config: WaveConfig }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const timeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const layerOpacities = [0.15, 0.09, 0.05];
    const layerPhases = [0, Math.PI * 0.6, Math.PI * 1.2];
    const layerAmplMult = [1, 0.65, 0.4];

    const draw = () => {
      timeRef.current += config.speed;
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      for (let l = 0; l < config.layers; l++) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255,255,255,${layerOpacities[l]})`;
        ctx.lineWidth = l === 0 ? 2 : 1;

        for (let x = 0; x <= width; x += 2) {
          const y =
            height / 2 +
            Math.sin(x * config.frequency + timeRef.current + layerPhases[l]) *
              config.amplitude *
              layerAmplMult[l] +
            Math.sin(
              x * config.frequency * 2.3 +
                timeRef.current * 1.4 +
                layerPhases[l]
            ) *
              config.amplitude *
              layerAmplMult[l] *
              0.4;

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [config]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}

const contentVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1], staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function ServiceShowcase({ slides }: { slides: ShowcaseSlide[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  const prev = () => setCurrentIndex((i) => (i - 1 + slides.length) % slides.length);
  const next = () => setCurrentIndex((i) => (i + 1) % slides.length);

  // Play active video, pause others
  useEffect(() => {
    slides.forEach((svc, i) => {
      if (!svc.videoSrc) return;
      const video = videoRefs.current[i];
      if (!video) return;
      if (i === currentIndex) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [currentIndex, slides]);

  return (
    <div className="relative bg-black" style={{ minHeight: "80vh" }}>
      {/* Section label — always visible at top */}
      <div className="absolute top-8 left-0 right-0 z-20 mx-auto w-full max-w-6xl px-16 sm:px-24 lg:px-28">
        <p className={`${barlow.className} text-3xl font-extrabold uppercase tracking-wide text-white sm:text-4xl`}>
          Robot Types
        </p>
      </div>

      {/* Panels — all mounted, crossfade via opacity */}
      {slides.map((service, i) => (
        <motion.div
          key={service.key}
          animate={{ opacity: i === currentIndex ? 1 : 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="absolute inset-0 flex items-center overflow-hidden"
          aria-hidden={i !== currentIndex}
        >
          {/* Background */}
          {service.videoSrc ? (
            <video
              ref={(el) => { videoRefs.current[i] = el; }}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            >
              <source src={service.videoSrc} type="video/mp4" />
            </video>
          ) : (
            <WaveformCanvas config={WAVE_CONFIGS[i % WAVE_CONFIGS.length]} />
          )}
          <div className="absolute inset-0 bg-black/70" />

          {/* Content */}
          <div className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-12 px-16 py-20 sm:px-24 lg:px-28">
            <motion.div
              variants={contentVariants}
              initial="hidden"
              animate={i === currentIndex ? "visible" : "hidden"}
              className="flex min-w-0 max-w-xl flex-1 flex-col gap-6"
            >
              <motion.p
                variants={itemVariants}
                className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400"
              >
                {service.overline}
              </motion.p>

              <motion.h2
                variants={itemVariants}
                className={`${barlow.className} text-5xl font-extrabold uppercase leading-none text-white sm:text-6xl`}
              >
                {service.title}
              </motion.h2>

              <motion.p
                variants={itemVariants}
                className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500"
              >
                {service.subtitle}
              </motion.p>

              <motion.div variants={itemVariants} className="h-px w-16 bg-white/30" />

              <motion.p variants={itemVariants} className="text-lg leading-relaxed text-gray-300">
                {service.description}
              </motion.p>

              <motion.div variants={itemVariants}>
                <Link
                  href={service.href}
                  className="inline-flex items-center gap-2 rounded-full border border-white px-7 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white hover:text-black"
                >
                  Explore
                  <span aria-hidden="true">→</span>
                </Link>
              </motion.div>
            </motion.div>

            {!service.videoSrc && service.images.length > 0 && (
              <div className="hidden shrink-0 items-start gap-4 lg:flex">
                {service.images.map((image, imageIndex) => (
                  <figure
                    key={image.src}
                    className={`${imageIndex > 1 ? "hidden xl:flex" : "flex"} w-36 flex-col gap-3 xl:w-40`}
                  >
                    {/* White tiles even out catalog shots that ship with and without a background. */}
                    <div className="relative h-48 w-full overflow-hidden rounded-2xl bg-white xl:h-52">
                      <Image
                        src={image.src}
                        alt={image.alt}
                        fill
                        sizes="192px"
                        className="object-contain p-4"
                      />
                    </div>
                    <figcaption className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                      {image.alt}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      ))}

      {/* Spacer so the container has height */}
      <div style={{ minHeight: "80vh" }} aria-hidden="true" />

      {/* Left arrow */}
      <button
        onClick={prev}
        aria-label="Previous robot type"
        className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 z-20 text-white/50 hover:text-white transition-colors duration-200"
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      {/* Right arrow */}
      <button
        onClick={next}
        aria-label="Next robot type"
        className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 z-20 text-white/50 hover:text-white transition-colors duration-200"
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      {/* Dot indicators */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentIndex(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`h-[2px] rounded-full transition-all duration-500 ${
              i === currentIndex ? "w-8 bg-white" : "w-3 bg-white/35 hover:bg-white/60"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
