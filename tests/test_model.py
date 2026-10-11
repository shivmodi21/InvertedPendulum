import numpy as np
from inverted_pendulum.model import Parameters, dynamics, lqr_gain, simulate


def test_upright_equilibrium_is_stationary():
    assert np.allclose(dynamics([0, 0, 0, 0], Parameters(), 0), np.zeros(4))


def test_lqr_gain_shape_and_finite():
    gain = lqr_gain(Parameters())
    assert gain.shape == (1, 4)
    assert np.isfinite(gain).all()


def test_simulation_returns_expected_shapes():
    result = simulate(duration=1.0, sample_time=0.05)
    assert len(result["time"]) == len(result["states"]) == len(result["control"])
    assert len(result["states"][0]) == 4
    assert np.isfinite(np.asarray(result["states"])).all()


def test_validation_rejects_negative_mass():
    try:
        simulate(Parameters(cart_mass=-1), duration=1)
    except ValueError:
        return
    raise AssertionError("Expected ValueError for invalid mass")
