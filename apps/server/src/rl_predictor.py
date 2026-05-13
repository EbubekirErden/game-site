import json
import os
import sys

import numpy as np

try:
    from sb3_contrib import MaskablePPO
except ImportError as exc:
    raise SystemExit(
        "sb3-contrib is required for the Love Letter RL bot. "
        "Set RL_BOT_PYTHON to the Python executable from the RL virtualenv."
    ) from exc


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: rl_predictor.py <model_path>")

    model_path = sys.argv[1]
    if not os.path.exists(model_path):
        raise SystemExit(f"RL model not found: {model_path}")

    model = MaskablePPO.load(model_path, device="cpu")
    deterministic = os.getenv("RL_BOT_DETERMINISTIC", "1").strip().lower() not in {
        "0",
        "false",
        "no",
    }

    for line in sys.stdin:
        try:
            payload = json.loads(line)
            obs = np.asarray(payload["obs"], dtype=np.float32)
            action_mask = np.asarray(payload["actionMask"], dtype=bool)
            action, _states = model.predict(
                obs,
                deterministic=deterministic,
                action_masks=action_mask,
            )
            print(json.dumps({"ok": True, "action": int(action)}), flush=True)
        except Exception as exc:
            print(json.dumps({"ok": False, "error": str(exc)}), flush=True)


if __name__ == "__main__":
    main()
