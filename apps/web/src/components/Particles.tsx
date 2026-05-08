import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type ParticlesProps = {
  active: boolean;
  type: "confetti" | "shield";
  count?: number;
};

export function Particles({ active, type, count = 30 }: ParticlesProps) {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; color: string; delay: number }>>([]);

  useEffect(() => {
    if (active && type === "confetti") {
      const colors = ["#ff4a4a", "#58a6ff", "#77dd77", "#ffd08d", "#d7c2ff"];
      const newParticles = Array.from({ length: count }).map((_, i) => ({
        id: i,
        x: Math.random() * 100, // vw
        y: -10, // vh
        color: colors[Math.floor(Math.random() * colors.length)]!,
        delay: Math.random() * 0.5,
      }));
      setParticles(newParticles);
    } else {
      setParticles([]);
    }
  }, [active, type, count]);

  if (!active) return null;

  return (
    <div className="particle-layer">
      <AnimatePresence>
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="confetti-piece"
            initial={{ opacity: 1, x: `${p.x}vw`, y: "-10vh", rotate: 0 }}
            animate={{
              opacity: [1, 1, 0],
              y: "110vh",
              x: `${p.x + (Math.random() * 20 - 10)}vw`,
              rotate: 720,
            }}
            transition={{
              duration: 2 + Math.random() * 2,
              delay: p.delay,
              ease: "easeOut",
            }}
            style={{ backgroundColor: p.color }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
