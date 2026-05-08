import React from "react";

export type CardZoneName =
  | "deck"
  | `player:${string}:hand`
  | `player:${string}:discard`
  | "stage:played"
  | "stage:reveal"
  | "stage:clash-left"
  | "stage:clash-right";

type ZoneRegistry = Map<string, React.RefObject<HTMLElement | null>>;

interface CardZoneRegistry {
  registerZone: (name: string) => React.RefCallback<HTMLElement>;
  getZoneRect: (name: string) => DOMRect | null;
}

export function useCardZoneRegistry(): CardZoneRegistry {
  const registry = React.useRef<ZoneRegistry>(new Map());

  const registerZone = React.useCallback((name: string): React.RefCallback<HTMLElement> => {
    return (el: HTMLElement | null) => {
      if (el) {
        // Store element directly in a WeakRef-like map
        if (!registry.current.has(name)) {
          registry.current.set(name, { current: el });
        } else {
          const ref = registry.current.get(name)!;
          (ref as React.MutableRefObject<HTMLElement | null>).current = el;
        }
      }
    };
  }, []);

  const getZoneRect = React.useCallback((name: string): DOMRect | null => {
    const ref = registry.current.get(name);
    if (!ref?.current) return null;
    return ref.current.getBoundingClientRect();
  }, []);

  return { registerZone, getZoneRect };
}
