#!/usr/bin/env python3
"""Run a cart-pole simulation from the command line."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from inverted_pendulum.model import Parameters, simulate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--duration", type=float, default=20.0)
    parser.add_argument("--dt", type=float, default=0.05)
    parser.add_argument("--initial-position", type=float, default=1.0)
    parser.add_argument("--initial-velocity", type=float, default=0.0)
    parser.add_argument("--initial-angle-deg", type=float, default=5.72957795)
    parser.add_argument("--initial-angular-velocity", type=float, default=0.0)
    parser.add_argument("--open-loop", action="store_true", help="Disable LQR feedback.")
    parser.add_argument("--output", default="outputs/simulation.json")
    args = parser.parse_args()
    initial = [
        args.initial_position, args.initial_velocity,
        args.initial_angle_deg * 3.141592653589793 / 180,
        args.initial_angular_velocity,
    ]
    result = simulate(Parameters(), initial, args.duration, args.dt, not args.open_loop)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"Saved {len(result['time'])} samples to {out}")
    print(f"LQR gain: {result['gain']}")
    print(f"Final state: {result['states'][-1]}")


if __name__ == "__main__":
    main()
