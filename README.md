# Inverted Pendulum — Simulation & Control

An interactive cart-pole simulation based on the uploaded MATLAB scripts, rebuilt in Python with a continuous-time LQR controller, SciPy integration, Matplotlib visualizations, and a Flask-powered portfolio website.

## Features
- Nonlinear cart-pole dynamics from `pendcart_Shiv.m`
- Continuous-time LQR feedback based on the supplied A/B matrices and Q/R weights
- Adjustable physical parameters, initial conditions, simulation duration, and controller weights in the web UI
- Animated cart-pole, state-response charts, control-force chart, and CSV export
- Local Python CLI for simulation, plotting, and animation
- Render-ready Flask deployment

## Project structure
```text
inverted-pendulum-portfolio/
├── backend/
│   └── app.py
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── inverted_pendulum/
│   ├── __init__.py
│   └── model.py
├── scripts/
│   ├── simulate.py
│   └── visualize.py
├── tests/
│   └── test_model.py
├── requirements.txt
├── runtime.txt
└── render.yaml
```

## Run locally
Python 3.11 is recommended.

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

python -m pip install -r requirements.txt
python scripts/simulate.py
```

Create static response plots:
```bash
python scripts/visualize.py --output outputs
```

Save a GIF animation (requires Pillow):
```bash
python scripts/visualize.py --output outputs --gif
```

Run the website:
```bash
python -m backend.app
```
Then open http://127.0.0.1:5000.

## Deploy to Render
1. Push the project folder to a GitHub repository.
2. In Render, create a **Web Service** connected to that repository.
3. Keep **Root Directory** empty (repository root).
4. Build command: `pip install -r requirements.txt`
5. Start command: `gunicorn --chdir backend app:app --bind 0.0.0.0:$PORT`
6. Deploy.

`render.yaml` provides the same configuration for a Blueprint deployment.

## Model notes
The state vector is `x = [cart position, cart velocity, pole angle, pole angular velocity]`. The angle is measured from the upright vertical; zero means upright. The default initial state is `[1, 0, 0.1, 0]`, and the target is `[0, 0, 0, 0]`.

The nonlinear dynamics preserve the equations in the supplied `pendcart_Shiv.m`. The LQR gain is computed from the same linearized A and B matrices in `sim_pendcart_Shiv.m` using SciPy's continuous algebraic Riccati solver. This reproduces the structure of the original workflow without requiring MATLAB or the Control System Toolbox.

## Limitations
This is an idealized, friction-damped model. It does not include actuator saturation, sensor noise, rail limits, or a full mechanical CAD model. The controller uses a local linearization, so large initial angles may not stabilize.
