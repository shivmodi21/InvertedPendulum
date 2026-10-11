#!/usr/bin/env python3
"""Generate response plots and optionally a GIF from the cart-pole simulation."""
import argparse
from pathlib import Path
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation, PillowWriter
from matplotlib.patches import Circle, Rectangle
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from inverted_pendulum.model import Parameters, simulate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="outputs")
    parser.add_argument("--gif", action="store_true")
    parser.add_argument("--duration", type=float, default=20.0)
    parser.add_argument("--dt", type=float, default=0.05)
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    result = simulate(Parameters(), duration=args.duration, sample_time=args.dt)
    t = np.asarray(result["time"])
    states = np.asarray(result["states"])
    control = np.asarray(result["control"])

    fig, axes = plt.subplots(2, 2, figsize=(12, 7), constrained_layout=True)
    labels = [("Cart position", "Position (m)"), ("Cart velocity", "Velocity (m/s)"),
              ("Pole angle", "Angle (rad)"), ("Pole angular velocity", "Angular velocity (rad/s)")]
    for i, ax in enumerate(axes.flat):
        ax.plot(t, states[:, i], label="Actual")
        ax.axhline(0, color="black", linestyle="--", linewidth=1, label="Target")
        ax.set_title(labels[i][0])
        ax.set_xlabel("Time (s)")
        ax.set_ylabel(labels[i][1])
        ax.grid(True, alpha=0.25)
        ax.legend()
    fig.savefig(output / "state_responses.png", dpi=160)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(10, 3.5), constrained_layout=True)
    ax.plot(t, control)
    ax.set(title="LQR control force", xlabel="Time (s)", ylabel="Force (N)")
    ax.grid(True, alpha=0.25)
    fig.savefig(output / "control_force.png", dpi=160)
    plt.close(fig)

    if args.gif:
        # Draw a compact animation with fixed camera bounds.
        fig, ax = plt.subplots(figsize=(10, 4), facecolor="#0b1220")
        ax.set_facecolor("#0b1220")
        ax.set_xlim(-6, 8)
        ax.set_ylim(-1.5, 7)
        ax.set_aspect("equal", adjustable="box")
        ax.tick_params(colors="#dce6f5")
        for spine in ax.spines.values():
            spine.set_color("#334155")
        ax.axhline(0, color="#64748b", linewidth=2)
        cart_w, cart_h, wheel_r, pole_len = 1.5, 0.55, 0.18, 2.6
        cart = Rectangle((states[0, 0] - cart_w/2, wheel_r*2), cart_w, cart_h,
                         facecolor="#fbbf24", edgecolor="#f8fafc", linewidth=1.5)
        ax.add_patch(cart)
        wheels = [Circle((states[0, 0] - cart_w*0.32, wheel_r), wheel_r, color="#94a3b8"),
                  Circle((states[0, 0] + cart_w*0.32, wheel_r), wheel_r, color="#94a3b8")]
        for wheel in wheels:
            ax.add_patch(wheel)
        pivot_y = wheel_r*2 + cart_h
        end_x = states[0, 0] + pole_len*np.sin(states[0, 2])
        end_y = pivot_y + pole_len*np.cos(states[0, 2])
        rod, = ax.plot([states[0, 0], end_x], [pivot_y, end_y], color="#38bdf8", linewidth=4)
        bob = Circle((end_x, end_y), 0.14, color="#38bdf8")
        ax.add_patch(bob)
        title = ax.set_title("LQR-stabilized inverted pendulum", color="#f8fafc")
        def update(i):
            x, _, theta, _ = states[i]
            cart.set_xy((x-cart_w/2, wheel_r*2))
            wheels[0].center = (x-cart_w*0.32, wheel_r)
            wheels[1].center = (x+cart_w*0.32, wheel_r)
            ex, ey = x+pole_len*np.sin(theta), pivot_y+pole_len*np.cos(theta)
            rod.set_data([x, ex], [pivot_y, ey])
            bob.center = (ex, ey)
            title.set_text(f"LQR-stabilized inverted pendulum · t = {t[i]:.2f} s")
            return cart, *wheels, rod, bob, title
        anim = FuncAnimation(fig, update, frames=range(0, len(t), max(1, len(t)//240)),
                             interval=35, blit=False)
        anim.save(output / "cart_pole.gif", writer=PillowWriter(fps=25))
        plt.close(fig)
    print(f"Plots saved to {output.resolve()}")


if __name__ == "__main__":
    main()
