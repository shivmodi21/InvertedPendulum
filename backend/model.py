"""Nonlinear cart-pole model with passive fall, energy swing-up, and LQR capture."""
from dataclasses import dataclass, asdict
import numpy as np
from scipy.integrate import solve_ivp
from scipy.linalg import solve_continuous_are


@dataclass
class Parameters:
    pole_mass: float = 2.0
    cart_mass: float = 5.0
    pole_length: float = 1.5
    gravity: float = 9.81
    damping: float = 0.15
    q_position: float = 1.0
    q_velocity: float = 1.0
    q_angle: float = 18.0
    q_angular_velocity: float = 2.0
    r_control: float = 0.8
    max_force: float = 45.0
    rail_limit: float = 3.5

    def validate(self) -> None:
        for name in ("pole_mass", "cart_mass", "pole_length", "gravity", "r_control", "max_force", "rail_limit"):
            if not np.isfinite(getattr(self, name)) or getattr(self, name) <= 0:
                raise ValueError(f"{name} must be a finite number greater than zero.")
        if not np.isfinite(self.damping) or self.damping < 0:
            raise ValueError("damping must be a finite non-negative number.")
        for name in ("q_position", "q_velocity", "q_angle", "q_angular_velocity"):
            if not np.isfinite(getattr(self, name)) or getattr(self, name) < 0:
                raise ValueError(f"{name} must be a finite non-negative number.")

    def to_dict(self):
        return asdict(self)


def wrap_angle(angle: float) -> float:
    """Map an angle to [-pi, pi), where zero is the upright position."""
    return (float(angle) + np.pi) % (2.0 * np.pi) - np.pi


def linearized_matrices(p: Parameters):
    """Linearized state-space model around theta=0 (upright)."""
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
    """Nonlinear dynamics for [cart position, cart velocity, angle, angular velocity].

    Angle convention: theta=0 is upright and theta=pi (or -pi) is hanging down.
    """
    x, x_dot, theta, theta_dot = np.asarray(state, dtype=float)
    m, M, L, b, g = p.pole_mass, p.cart_mass, p.pole_length, p.damping, p.gravity
    s, c = np.sin(theta), np.cos(theta)
    denominator = M + m * s**2
    x_ddot = (force + m * L * s * theta_dot**2 - m * g * s * c - b * x_dot) / denominator
    theta_ddot = (
        force * c - (M + m) * g * s + m * L * s * c * theta_dot**2 - b * x_dot * c
    ) / (-L * denominator)
    return np.array([x_dot, x_ddot, theta_dot, theta_ddot], dtype=float)


def simulate(
    params: Parameters | None = None,
    initial_state=(0.0, 0.0, np.deg2rad(5.7), 0.0),
    duration=20.0,
    sample_time=0.05,
    use_controller=True,
):
    """Simulate the three-stage experiment and return JSON-friendly time series."""
    p = params or Parameters()
    p.validate()
    if not np.isfinite(duration) or duration <= 0 or duration > 120:
        raise ValueError("duration must be between 0 and 120 seconds.")
    if not np.isfinite(sample_time) or sample_time < 0.01 or sample_time > 0.2:
        raise ValueError("sample_time must be between 0.01 and 0.2 seconds.")
    state = np.asarray(initial_state, dtype=float)
    if state.shape != (4,) or not np.all(np.isfinite(state)):
        raise ValueError("initial_state must contain four finite numbers.")
    if abs(wrap_angle(state[2])) > np.deg2rad(80):
        raise ValueError("Initial angle must be within ±80 degrees of upright.")

    K = lqr_gain(p) if use_controller else np.zeros((1, 4))
    times = np.arange(0.0, duration + sample_time * 0.5, sample_time)
    times = times[times <= duration + 1e-9]
    if times.size == 0 or times[-1] < duration - 1e-8:
        times = np.append(times, duration)

    states = [state.copy()]
    controls = [0.0]
    phases = ["fall"]
    phase = "fall" if use_controller else "free"
    swingup_started = None
    jerk_duration = 0.24
    jerk_force = 38.0
    # Mirror the initial kick for mirrored starting conditions. This keeps the
    # swing-up trajectory symmetric for positive and negative initial angles.
    initial_angle = wrap_angle(state[2])
    initial_angular_velocity = float(state[3])
    if abs(initial_angle) > 1e-6:
        jerk_direction = float(np.sign(initial_angle))
    elif abs(initial_angular_velocity) > 1e-6:
        jerk_direction = float(np.sign(initial_angular_velocity))
    else:
        jerk_direction = 1.0
    capture_angle = np.deg2rad(35.0)
    capture_speed = 2.8
    target_energy = p.pole_mass * p.gravity * p.pole_length

    def control_for(current, t, current_phase):
        x, x_dot, theta, theta_dot = current
        angle = wrap_angle(theta)
        if not use_controller:
            return 0.0
        if current_phase == "fall":
            return 0.0
        if current_phase == "swingup":
            if swingup_started is not None and t - swingup_started < jerk_duration:
                # A deliberate, short impulse makes the swing-up visibly legible.
                return float(np.clip(jerk_direction * jerk_force, -p.max_force, p.max_force))
            energy = 0.5 * p.pole_mass * (p.pole_length * theta_dot) ** 2 + target_energy * np.cos(theta)
            energy_error = energy - target_energy
            # Energy shaping, with cart-centering feedback and a hard actuator limit.
            force = 0.10 * energy_error * theta_dot * np.cos(theta) - 2.2 * x - 3.2 * x_dot
            if abs(np.cos(theta) * theta_dot) < 0.04:
                force += -5.0 * x - 4.0 * x_dot
            return float(np.clip(force, -p.max_force, p.max_force))
        # LQR is local to upright; always use the wrapped angle error.
        feedback_state = np.array([x, x_dot, angle, theta_dot])
        force = float((-K @ feedback_state).item())
        return float(np.clip(force, -p.max_force, p.max_force))

    for i in range(1, len(times)):
        t0, t1 = float(times[i - 1]), float(times[i])
        angle = wrap_angle(state[2])
        if phase == "fall" and (abs(angle) >= 2.45 or t0 >= min(4.0, duration * 0.35)):
            phase = "swingup"
            swingup_started = t0
        elif phase == "swingup" and swingup_started is not None:
            if (t0 - swingup_started > jerk_duration and abs(angle) < capture_angle
                    and abs(state[3]) < capture_speed and abs(state[0]) < p.rail_limit * 0.85):
                phase = "balance"

        def rhs(t, y):
            force = control_for(y, t, phase)
            return dynamics(y, p, force)

        integrated = solve_ivp(rhs, (t0, t1), state, method="RK45", rtol=2e-6, atol=1e-8,
                               max_step=max(sample_time / 4.0, 0.002))
        if not integrated.success or not np.all(np.isfinite(integrated.y[:, -1])):
            raise RuntimeError("Numerical integration failed while simulating the pendulum.")
        state = integrated.y[:, -1]
        # Keep the cart inside the rail envelope using a soft boundary response.
        if abs(state[0]) > p.rail_limit:
            state[0] = np.sign(state[0]) * p.rail_limit
            state[1] = 0.0
            if phase == "balance":
                phase = "swingup"
                swingup_started = t1
        states.append(state.copy())
        controls.append(control_for(state, t1, phase))
        phases.append(phase)

    states_array = np.asarray(states)
    return {
        "time": times.tolist(),
        "states": states_array.tolist(),
        "control": np.asarray(controls, dtype=float).tolist(),
        "phase": phases,
        "gain": K.reshape(-1).tolist(),
        "parameters": p.to_dict(),
        "controller_enabled": bool(use_controller),
        "angle_convention": "0 degrees = upright; ±180 degrees = hanging down",
    }
