"""Nonlinear cart-pole model and continuous-time LQR simulation."""
from __future__ import annotations

from dataclasses import dataclass, asdict
import numpy as np
from scipy.integrate import solve_ivp
from scipy.linalg import solve_continuous_are


@dataclass
class Parameters:
    pole_mass: float = 2.0       # m (kg)
    cart_mass: float = 5.0       # M (kg)
    pole_length: float = 4.0     # L (m), as used by the supplied equations
    gravity: float = 10.0        # g (m/s^2)
    damping: float = 1.0         # b
    q_position: float = 1.0
    q_velocity: float = 1.0
    q_angle: float = 1.0
    q_angular_velocity: float = 1.0
    r_control: float = 1.0

    def validate(self) -> None:
        for name in ("pole_mass", "cart_mass", "pole_length", "gravity", "r_control"):
            if getattr(self, name) <= 0:
                raise ValueError(f"{name} must be greater than zero.")
        if self.damping < 0:
            raise ValueError("damping cannot be negative.")
        for name in ("q_position", "q_velocity", "q_angle", "q_angular_velocity"):
            if getattr(self, name) < 0:
                raise ValueError(f"{name} cannot be negative.")

    def to_dict(self):
        return asdict(self)


def linearized_matrices(p: Parameters):
    """Return the A/B matrices used in the original MATLAB script."""
    p.validate()
    m, M, L, b, g = p.pole_mass, p.cart_mass, p.pole_length, p.damping, p.gravity
    A = np.array([
        [0, 1, 0, 0],
        [0, -b / M, -m * g / M, 0],
        [0, 0, 0, 1],
        [0, b / (M * L), (m + M) * g / (M * L), 0],
    ], dtype=float)
    B = np.array([[0], [1 / M], [0], [-1 / (M * L)]], dtype=float)
    Q = np.diag([p.q_position, p.q_velocity, p.q_angle, p.q_angular_velocity])
    R = np.array([[p.r_control]], dtype=float)
    return A, B, Q, R


def lqr_gain(p: Parameters):
    A, B, Q, R = linearized_matrices(p)
    P = solve_continuous_are(A, B, Q, R)
    return np.linalg.solve(R, B.T @ P)


def dynamics(state, p: Parameters, force: float):
    """Nonlinear state derivative for state [position, velocity, angle, angular_velocity]."""
    x, x_dot, theta, theta_dot = np.asarray(state, dtype=float)
    m, M, L, b, g = p.pole_mass, p.cart_mass, p.pole_length, p.damping, p.gravity
    s, c = np.sin(theta), np.cos(theta)
    denominator_cart = M + m * s**2
    denominator_pole = m * L * c**2 - (M + m) * L
    # Equations retained from pendcart_Shiv.m.
    x_ddot = (force + m * L * s * theta_dot**2 - m * g * s * c - b * x_dot) / denominator_cart
    theta_ddot = (
        force * c - (M + m) * g * s + m * L * s * c * theta_dot**2 - b * x_dot * c
    ) / denominator_pole
    return np.array([x_dot, x_ddot, theta_dot, theta_ddot], dtype=float)


def simulate(
    params: Parameters | None = None,
    initial_state=(1.0, 0.0, 0.1, 0.0),
    duration=20.0,
    sample_time=0.05,
    use_controller=True,
):
    """Simulate the nonlinear system with LQR feedback, returning JSON-friendly arrays."""
    p = params or Parameters()
    p.validate()
    if duration <= 0 or duration > 120:
        raise ValueError("duration must be between 0 and 120 seconds.")
    if sample_time < 0.01 or sample_time > 0.2:
        raise ValueError("sample_time must be between 0.01 and 0.2 seconds.")
    initial_state = np.asarray(initial_state, dtype=float)
    if initial_state.shape != (4,) or not np.all(np.isfinite(initial_state)):
        raise ValueError("initial_state must contain four finite numbers.")
    if abs(initial_state[2]) > np.deg2rad(80):
        raise ValueError("Initial angle must be within ±80 degrees for this controller.")
    K = lqr_gain(p) if use_controller else np.zeros((1, 4))
    target = np.zeros(4)

    def rhs(_t, state):
        force = float((-K @ (state - target)).item())
        return dynamics(state, p, force)

    t_eval = np.arange(0.0, duration + sample_time * 0.5, sample_time)
    t_eval = t_eval[t_eval <= duration + 1e-9]
    if t_eval.size == 0 or t_eval[-1] < duration - 1e-8:
        t_eval = np.append(t_eval, duration)
    result = solve_ivp(rhs, (0.0, duration), initial_state, t_eval=t_eval, rtol=1e-7, atol=1e-9)
    if not result.success:
        raise RuntimeError(result.message)
    states = result.y.T
    controls = (-states @ K.T).reshape(-1) if use_controller else np.zeros(len(states))
    return {
        "time": result.t.tolist(),
        "states": states.tolist(),
        "control": controls.tolist(),
        "gain": K.reshape(-1).tolist(),
        "parameters": p.to_dict(),
        "controller_enabled": bool(use_controller),
    }
