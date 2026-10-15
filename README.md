# Inverted Pendulum Lab

An interactive web-based simulation demonstrating how an inverted pendulum can be swung back to its upright position and stabilized using feedback control.

**[Live Demo ↗](https://inverted-pendulum.onrender.com/)**

## Overview

The simulation models the nonlinear dynamics of a cart-pole system. The pendulum falls under gravity, swings back up through controlled cart movement, and transitions to LQR-based stabilization. A live animation and synchronized graphs visualize the system's response.

## Project Structure

```text
├── backend/
│   ├── __init__.py
│   ├── main.py
│   └── model.py
├── frontend/
│   ├── index.html
│   ├── script.js
│   └── styles.css
├── .gitignore
├── .python-version
├── README.md
└── requirements.txt
```

### Backend

- **`main.py`** — Flask application that serves the frontend, exposes the simulation API, processes simulation parameters, and returns results to the client.
- **`model.py`** — Implements the nonlinear cart-pole dynamics, energy-based swing-up control, LQR stabilization, and numerical simulation.
- **`__init__.py`** — Marks the backend directory as a Python package.

### Frontend

- **`index.html`** — Defines the application layout and simulation interface.
- **`script.js`** — Handles API communication, pendulum animation, interactive controls, and synchronized live graphs.
- **`styles.css`** — Provides the responsive layout and visual styling.

## Tech Stack

`Python` · `NumPy` · `SciPy` · `Flask` · `JavaScript` · `Chart.js`

