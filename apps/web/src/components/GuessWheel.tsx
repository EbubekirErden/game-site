import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LoveLetterMode } from "@game-site/shared";
import { cardNamesByValue } from "../lib/gamePresentation.js";

type GuessWheelProps = {
  values: number[];
  selectedValue: string;
  onSelect: (value: string) => void;
  mode: LoveLetterMode;
};

export function GuessWheel({ values, selectedValue, onSelect, mode }: GuessWheelProps) {
  return (
    <AnimatePresence>
      <motion.div
        className="guess-wheel"
        initial={{ opacity: 0, y: 12, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.95 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="guess-wheel-label">Guess their card:</span>
        <div className="guess-wheel-chips">
          {values.map((val) => {
            const names = cardNamesByValue(val, mode);
            const label = names[0] ?? val.toString();
            return (
              <motion.button
                key={val}
                type="button"
                className={`guess-chip ${selectedValue === val.toString() ? "is-selected" : ""}`}
                onClick={() => onSelect(val.toString())}
                whileHover={{ y: -2, scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.14 }}
              >
                <span className="guess-chip-value">{val}</span>
                <span className="guess-chip-name">{label}</span>
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
