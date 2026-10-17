const $ = (id) => document.getElementById(id);
const defaults = {
    cart_mass: 5,
    pole_mass: 2,
    pole_length: 1.5,
    damping: 0.15,
    initial_position: 0,
    initial_angle_deg: 5.7,
    q_position: 1,
    q_angle: 18,
    r_control: 0.8,
    controller_enabled: true
};
let result = null;
let frame = 0;
let playing = false;
let animationHandle = null;
let stateChart = null;
let controlChart = null;
let lastTick = 0;

$("year").textContent = new Date().getFullYear();
const rangeIds = Object.keys(defaults).filter(id => id !== "controller_enabled");
const units = {
    cart_mass: " kg",
    pole_mass: " kg",
    pole_length: " m",
    damping: "",
    initial_position: " m",
    initial_angle_deg: "°",
    q_position: "",
    q_angle: "",
    r_control: ""
};
const dotSep = '<span class="dot-sep" aria-hidden="true"></span>';
const metaJoin = (...parts) => parts.join(dotSep);
const phaseLabels = {
    fall: {
        label: metaJoin("01", "NATURAL FALL"),
        className: "phase-fall"
    },
    swingup: {
        label: metaJoin("02", "SWING-UP / JERK"),
        className: "phase-swingup"
    },
    balance: {
        label: metaJoin("03", "LQR BALANCE"),
        className: "phase-balance"
    },
    free: {
        label: "FREE MOTION",
        className: "phase-fall"
    }
};
const fa = (name) => `<i class="fa-solid fa-${name}" aria-hidden="true"></i>`;
const emptyMetricHtml = (unit) => `${fa("minus")} <em>${unit}</em>`;
const emptyMetrics = {
    "metric-position": emptyMetricHtml("m"),
    "metric-angle": emptyMetricHtml("°"),
    "metric-force": emptyMetricHtml("N"),
    "metric-error": emptyMetricHtml("°")
};

function setPlayButton(mode) {
    const labels = {
        play: `${fa("play")} Play`,
        playing: `${fa("play")} Playing`,
        replay: `${fa("rotate-right")} Replay`
    };
    $("play").innerHTML = labels[mode] || labels.play;
}

function readForm() {
    const payload = {};
    rangeIds.forEach(id => payload[id] = Number($(id).value));
    payload.controller_enabled = $("controller_enabled").checked;
    payload.duration = 20;
    payload.sample_time = 0.05;
    return payload;
}

function updateLabels() {
    rangeIds.forEach(id => {
        const digits = 1;
        $(id + "_val").textContent = Number($(id).value).toFixed(digits) + (units[id] || "");
    });
}
rangeIds.forEach(id => $(id).addEventListener("input", updateLabels));
updateLabels();

function chartOptions(yTitle, min, max) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
            mode: "index",
            intersect: false
        },
        plugins: {
            legend: {
                labels: {
                    color: "#aab8cd",
                    boxWidth: 10,
                    font: {
                        size: 10
                    }
                }
            }
        },
        scales: {
            x: {
                ticks: {
                    color: "#71819a",
                    maxTicksLimit: 7
                },
                grid: {
                    color: "#233149"
                },
                title: {
                    display: true,
                    text: "Time (s)",
                    color: "#8d9bb2"
                }
            },
            y: {
                ticks: {
                    color: "#71819a"
                },
                grid: {
                    color: "#233149"
                },
                title: {
                    display: true,
                    text: yTitle,
                    color: "#8d9bb2"
                },
                ...(min !== undefined ? {
                    suggestedMin: min
                } : {}),
                ...(max !== undefined ? {
                    suggestedMax: max
                } : {})
            }
        }
    };
}

function setupCharts(data) {
    if (!window.Chart) {
        $("message").textContent = "Chart.js could not load. Check your internet connection and reload.";
        return;
    }
    const labels = data.time.map(t => Number(t.toFixed(2)));
    const states = data.states;
    if (stateChart) stateChart.destroy();
    if (controlChart) controlChart.destroy();
    stateChart = new Chart($("stateChart"), {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "Cart position (m)",
                data: states.map(s => s[0]),
                borderColor: "#ffc857",
                borderWidth: 2,
                pointRadius: 0,
                tension: .12,
                yAxisID: "y",
                spanGaps: false
            }, {
                label: "Pole angle (°)",
                data: states.map(s => wrapAngle(s[2]) * 180 / Math.PI),
                borderColor: "#45d7e8",
                borderWidth: 2,
                pointRadius: 0,
                tension: .12,
                yAxisID: "y1",
                spanGaps: false
            }, {
                label: "Upright target",
                data: labels.map(() => 0),
                borderColor: "#67e8a5",
                borderDash: [5, 5],
                borderWidth: 1,
                pointRadius: 0,
                yAxisID: "y1",
                spanGaps: false
            }]
        },
        options: {
            ...chartOptions("Cart position (m)"),
            scales: {
                ...chartOptions("Cart position (m)").scales,
                y: {
                    ...chartOptions("Cart position (m)").scales.y,
                    position: "left"
                },
                y1: {
                    position: "right",
                    ticks: {
                        color: "#71819a"
                    },
                    grid: {
                        drawOnChartArea: false
                    },
                    title: {
                        display: true,
                        text: "Angle (°)",
                        color: "#8d9bb2"
                    }
                }
            }
        }
    });
    controlChart = new Chart($("controlChart"), {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "Control force (N)",
                data: data.control,
                borderColor: "#6c8cff",
                backgroundColor: "#6c8cff18",
                fill: true,
                borderWidth: 2,
                pointRadius: 0,
                tension: .08,
                spanGaps: false
            }]
        },
        options: chartOptions("Force (N)")
    });
    // Keep future samples hidden. showFrame() reveals them in sync with the animation.
    [stateChart, controlChart].forEach(chart => {
        chart.data.datasets.forEach(dataset => {
            dataset._fullData = [...dataset.data];
            dataset.data = dataset.data.map(() => null);
        });
        chart.update("none");
    });
}

function updateLiveCharts(index) {
    if (!result || !stateChart || !controlChart) return;
    const angleData = result.states.map(s => wrapAngle(s[2]) * 180 / Math.PI);
    const positionData = result.states.map(s => s[0]);
    stateChart.data.datasets[0].data = positionData.map((v, i) => i <= index ? v : null);
    stateChart.data.datasets[1].data = angleData.map((v, i) => i <= index ? v : null);
    stateChart.data.datasets[2].data = result.time.map((_, i) => i <= index ? 0 : null);
    controlChart.data.datasets[0].data = result.control.map((v, i) => i <= index ? v : null);
    stateChart.update("none");
    controlChart.update("none");
}

function drawScene(state) {
    const canvas = $("scene"),
        ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1,
        rect = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width,
        h = rect.height;
    ctx.clearRect(0, 0, w, h);
    const ground = h * (w <= 650 ? .66 : .70),
        scale = Math.min(w / 9, h / 4.8),
        center = w / 2;
    ctx.strokeStyle = "#1b2b40";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    for (let y = 0; y < h; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    ctx.strokeStyle = "#60728b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, ground + 18);
    ctx.lineTo(w, ground + 18);
    ctx.stroke();
    const cartX = center + state[0] * scale,
        cartW = Math.min(84, scale * 1.65),
        cartH = 27,
        cartY = ground - cartH;
    ctx.strokeStyle = "#67e8a5";
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(center, ground - 45);
    ctx.lineTo(center, ground + 17);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#67e8a520";
    ctx.fillRect(center - 3, ground + 2, 6, 15);
    for (const dx of [-cartW * .32, cartW * .32]) {
        ctx.beginPath();
        ctx.arc(cartX + dx, ground + 5, 8, 0, Math.PI * 2);
        ctx.fillStyle = "#8393aa";
        ctx.fill();
        ctx.strokeStyle = "#d1d9e6";
        ctx.stroke();
    }
    ctx.fillStyle = "#ffc857";
    ctx.strokeStyle = "#fff0c2";
    ctx.lineWidth = 1.5;
    roundRect(ctx, cartX - cartW / 2, cartY, cartW, cartH, 5);
    ctx.fill();
    ctx.stroke();
    const poleLen = Math.min(145, scale * 1.5 * 2.7, h - cartY - 14),
        endX = cartX + poleLen * Math.sin(state[2]),
        endY = cartY - poleLen * Math.cos(state[2]);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cartX, cartY);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = "#45d7e8";
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(endX, endY, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#45d7e8";
    ctx.fill();
    ctx.strokeStyle = "#d7fbff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cartX, cartY, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#f8fafc";
    ctx.fill();
    ctx.fillStyle = "#8496af";
    ctx.font = "10px ui-monospace,monospace";
    ctx.fillText("UPRIGHT TARGET", Math.max(8, center - 37), ground + 34);
    ctx.fillStyle = "#eaf2ff";
    ctx.font = "11px ui-monospace,monospace";
    ctx.fillText(`x = ${state[0].toFixed(2)} m`, Math.min(w - 85, Math.max(8, cartX - cartW / 2)), Math.max(15, cartY - 10));
}

function wrapAngle(angle) {
    const wrapped = (angle + Math.PI) % (2 * Math.PI);
    return (wrapped < 0 ? wrapped + 2 * Math.PI : wrapped) - Math.PI;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function showFrame(index) {
    if (!result) return;
    frame = Math.max(0, Math.min(index, result.time.length - 1));
    const state = result.states[frame],
        t = result.time[frame],
        force = result.control[frame];
    drawScene(state);
    updateLiveCharts(frame);
    $("sim-time").textContent = `t = ${t.toFixed(2)} s`;
    $("metric-position").innerHTML = `${state[0].toFixed(3)} <em>m</em>`;
    $("metric-angle").innerHTML = `${(wrapAngle(state[2]) * 180 / Math.PI).toFixed(2)} <em>°</em>`;
    $("metric-force").innerHTML = `${force.toFixed(2)} <em>N</em>`;
    $("metric-error").innerHTML = `${Math.abs(wrapAngle(state[2]) * 180 / Math.PI).toFixed(3)} <em>°</em>`;
    $("frame-count").textContent = `Frame ${frame + 1} / ${result.time.length}`;
    const phaseInfo = phaseLabels[result.phase?.[frame] || "free"];
    $("phase-pill").innerHTML = phaseInfo.label;
    $("phase-pill").className = `phase-pill ${phaseInfo.className}`;
}

function tick(now) {
    if (!playing || !result) return;
    const interval = 35 / (Number($("speed").value) || 1);
    if (now - lastTick >= interval) {
        lastTick = now;
        if (frame >= result.time.length - 1) {
            playing = false;
            setPlayButton("replay");
            $("message").textContent = "Experiment complete. The traces show the full response.";
            return;
        }
        showFrame(frame + 1);
    }
    animationHandle = requestAnimationFrame(tick);
}

function pause() {
    playing = false;
    if (animationHandle) cancelAnimationFrame(animationHandle);
    animationHandle = null;
}

function startPlayback() {
    if (!result) return;
    if (frame >= result.time.length - 1) showFrame(0);
    pause();
    playing = true;
    lastTick = 0;
    setPlayButton("playing");
    animationHandle = requestAnimationFrame(tick);
}

$("play").addEventListener("click", startPlayback);
$("pause").addEventListener("click", () => {
    pause();
    setPlayButton("play");
});
$("run").addEventListener("click", async () => {
    pause();
    $("run").disabled = true;
    $("play").disabled = true;
    $("pause").disabled = true;
    $("message").classList.remove("error");
    $("message").textContent = "Simulating natural fall, swing-up impulse, and LQR capture…";
    try {
        const response = await fetch("/api/simulate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(readForm())
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to run simulation.");
        result = data;
        setupCharts(data);
        showFrame(0);
        $("play").disabled = false;
        $("pause").disabled = false;
        $("message").innerHTML = `${metaJoin("Ready", `${data.time.length} samples`, data.controller_enabled ? "hybrid swing-up + LQR" : "controller disabled")}.`;
        setPlayButton("play");
        startPlayback();
    } catch (err) {
        $("message").textContent = err.message;
        $("message").classList.add("error");
    } finally {
        $("run").disabled = false;
    }
});
$("reset").addEventListener("click", () => {
    pause();
    Object.entries(defaults).forEach(([id, value]) => {
        if (id === "controller_enabled") $(id).checked = value;
        else $(id).value = value;
    });
    updateLabels();
    result = null;
    frame = 0;
    if (stateChart) {
        stateChart.destroy();
        stateChart = null;
    }
    if (controlChart) {
        controlChart.destroy();
        controlChart = null;
    }
    drawScene([0, 0, 0, 0]);
    Object.entries(emptyMetrics).forEach(([id, html]) => $(id).innerHTML = html);
    $("sim-time").textContent = "t = 0.00 s";
    $("phase-pill").textContent = "READY TO RUN";
    $("phase-pill").className = "phase-pill phase-fall";
    $("frame-count").textContent = "Awaiting simulation";
    $("play").disabled = true;
    $("pause").disabled = true;
    $("message").textContent = "Parameters reset. Run a new experiment.";
});
$("controller_enabled").addEventListener("change", () => {
    $("message").textContent = "Controller setting changed. Run a new experiment to apply it.";
});
window.addEventListener("resize", () => drawScene(result ? result.states[frame] : [0, 0, 0, 0]));
drawScene([0, 0, 0, 0]);
