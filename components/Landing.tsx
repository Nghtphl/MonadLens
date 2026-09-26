"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import LensVisual from "./LensVisual";

/** Scene centres on the 0..1 scroll progress of the story section. */
const SCENE_CENTERS = [0, 0.5, 1];
const PLATEAU = 0.14;
const FADE = 0.1;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// Scroll-linked scenes only when there is room and the user allows motion.
const MOTION_QUERY = "(min-width: 768px) and (prefers-reduced-motion: no-preference)";

export default function Landing({ onStart }: { onStart: () => void }) {
  const storyRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const story = storyRef.current;
    if (!story) return;
    const scenes = Array.from(story.querySelectorAll<HTMLElement>("[data-scene]"));
    const media = window.matchMedia(MOTION_QUERY);
    let frame = 0;

    const clear = () => {
      for (const prop of ["--conflict", "--fix", "--hint"]) story.style.removeProperty(prop);
      for (const scene of scenes) {
        scene.style.removeProperty("opacity");
        scene.style.removeProperty("transform");
        scene.style.removeProperty("pointer-events");
      }
    };

    const progress = () => {
      const rect = story.getBoundingClientRect();
      const range = rect.height - window.innerHeight;
      return range > 0 ? clamp01(-rect.top / range) : 0;
    };

    const update = () => {
      frame = 0;
      if (!media.matches) return clear();
      const p = progress();
      scenes.forEach((scene, i) => {
        const c = SCENE_CENTERS[i] ?? 0;
        const o = clamp01(1 - (Math.abs(p - c) - PLATEAU) / FADE);
        const y = (1 - o) * 28 * Math.sign(c - p);
        scene.style.opacity = o.toFixed(3);
        scene.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
        scene.style.pointerEvents = o > 0.5 ? "auto" : "none";
      });
      const conflict = clamp01((p - 0.24) / 0.12) * clamp01((0.78 - p) / 0.08);
      const fix = clamp01((p - 0.7) / 0.12);
      story.style.setProperty("--conflict", conflict.toFixed(3));
      story.style.setProperty("--fix", fix.toFixed(3));
      story.style.setProperty("--hint", clamp01(1 - p * 8).toFixed(3));
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    // A keyboard user tabbing into a faded scene is scrolled to it.
    const onFocusIn = (event: FocusEvent) => {
      if (!media.matches) return;
      const index = scenes.findIndex((s) => s.contains(event.target as Node));
      if (index < 0) return;
      const range = story.offsetHeight - window.innerHeight;
      window.scrollTo({ top: story.offsetTop + range * (SCENE_CENTERS[index] ?? 0) });
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    media.addEventListener("change", schedule);
    story.addEventListener("focusin", onFocusIn);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      media.removeEventListener("change", schedule);
      story.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  return (
    <div className="landing">
      <header className="intro-nav">
        <span className="wordmark-sm" aria-label="MonadLens">
          Monad<span>Lens</span>
        </span>
        <nav aria-label="Primary" className="intro-nav-links">
          <Link href="/findings" className="nav-link">
            Findings
          </Link>
          <button type="button" className="btn btn-primary btn-sm" onClick={onStart}>
            Test your contract
          </button>
        </nav>
      </header>

      <section ref={storyRef} className="story" aria-label="What MonadLens does">
        <div className="story-stage">
          <div className="story-copy">
            <div className="scene scene-hero" data-scene="0">
              <p className="eyebrow">Solidity → Monad</p>
              <h1 className="wordmark">
                Monad<span>Lens</span>
              </h1>
              <p className="hero-headline">See what slows your contract down.</p>
              <p className="hero-lead">Find shared-state bottlenecks. Measure contention. Compare fixes.</p>
              <div className="cta-row">
                <button type="button" className="btn btn-primary btn-lg" onClick={onStart}>
                  Test your contract
                  <span aria-hidden="true">→</span>
                </button>
                <Link href="/findings" className="text-link">
                  Explore real-contract findings
                </Link>
              </div>
            </div>

            <div className="scene" data-scene="1">
              <div className="scene-text">
                <p className="eyebrow">Contention</p>
                <h2 className="scene-title">
                  Different users.
                  <br />
                  One shared bottleneck.
                </h2>
                <p className="scene-body">
                  When calls write to the same storage, parallel execution can become dependent.
                </p>
              </div>
              <LensVisual state="conflict" decorative className="scene-visual" />
            </div>

            <div className="scene" data-scene="2">
              <div className="scene-text">
                <p className="eyebrow">Workflow</p>
                <h2 className="scene-title">Inspect. Measure. Improve.</h2>
                <p className="scene-body">Compare the original and the fix using traced transactions.</p>
                <div className="cta-row">
                  <button type="button" className="btn btn-primary btn-lg" onClick={onStart}>
                    Test your contract
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
              <LensVisual state="fix" decorative className="scene-visual" />
            </div>
          </div>

          <div className="story-visual">
            <LensVisual />
          </div>

          <div className="scroll-hint" aria-hidden="true">
            <span>Scroll</span>
            <i />
          </div>
        </div>
      </section>

      <footer className="intro-footer">
        <p>
          Scores are heuristic. Measured numbers come from traced transactions in a local Anvil block, not from
          Monad mainnet.
        </p>
        <Link href="/findings" className="text-link">
          Real-contract findings
        </Link>
      </footer>
    </div>
  );
}
