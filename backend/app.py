"""Flask API and static frontend server for the inverted pendulum demo."""
import os
import sys
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import BadRequest
from backend.model import Parameters, simulate

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"

app = Flask(__name__, static_folder=None)

@app.get("/")
def index():
    return send_from_directory(FRONTEND, "index.html")


@app.get("/<path:filename>")
def static_files(filename):
    allowed = {"styles.css", "app.js"}
    if filename not in allowed:
        return jsonify(error="Not found"), 404
    return send_from_directory(FRONTEND, filename)


@app.get("/api/health")
def health():
    return jsonify(status="ok", service="inverted-pendulum")


@app.post("/api/simulate")
def run_simulation():
    try:
        payload = request.get_json(force=True)
        params = Parameters(
            pole_mass=float(payload.get("pole_mass", 2.0)),
            cart_mass=float(payload.get("cart_mass", 5.0)),
            pole_length=float(payload.get("pole_length", 1.5)),
            gravity=float(payload.get("gravity", 9.81)),
            damping=float(payload.get("damping", 0.15)),
            q_position=float(payload.get("q_position", 1.0)),
            q_velocity=float(payload.get("q_velocity", 1.0)),
            q_angle=float(payload.get("q_angle", 18.0)),
            q_angular_velocity=float(payload.get("q_angular_velocity", 2.0)),
            r_control=float(payload.get("r_control", 0.8)),
            max_force=float(payload.get("max_force", 45.0)),
            rail_limit=float(payload.get("rail_limit", 3.5)),
        )
        initial = [
            float(payload.get("initial_position", 0.0)),
            float(payload.get("initial_velocity", 0.0)),
            float(payload.get("initial_angle_deg", 5.72957795)) * 3.141592653589793 / 180,
            float(payload.get("initial_angular_velocity", 0.0)),
        ]
        result = simulate(
            params=params,
            initial_state=initial,
            duration=float(payload.get("duration", 20.0)),
            sample_time=float(payload.get("sample_time", 0.05)),
            use_controller=bool(payload.get("controller_enabled", True)),
        )
        return jsonify(result)
    except (ValueError, TypeError, BadRequest) as exc:
        return jsonify(error=str(exc)), 400
    except Exception:
        app.logger.exception("Simulation failed")
        return jsonify(error="Simulation failed. Try different parameters or initial conditions."), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
