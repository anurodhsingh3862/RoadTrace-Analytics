"""Streamlit dashboard: add one or more camera videos, see counts, speed
distribution, and direction split, aggregated by hour. Deployable free on
Streamlit Community Cloud. Run locally with: streamlit run dashboard/app.py
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from tempfile import NamedTemporaryFile

import pandas as pd
import streamlit as st

from core.speed_estimator import Calibration
from dashboard.aggregator import CameraRun, hourly_summary
from dashboard.pipeline import analyze_video

st.set_page_config(page_title="RoadTrace Analytics", layout="wide")

if "camera_runs" not in st.session_state:
    st.session_state.camera_runs: list[CameraRun] = []

st.title("RoadTrace Analytics")
st.caption(
    "Vehicle counts, speed, and direction from traffic video. "
    "No plates, no identity data, no registration lookups."
)

with st.sidebar:
    st.header("Add a camera")
    with st.form("add_camera", clear_on_submit=True):
        label = st.text_input("Camera label", placeholder="e.g. Main St at 5th")
        video_file = st.file_uploader("Video file", type=["mp4", "mov", "avi", "mkv"])
        st.caption("Speed needs calibration: two points a known real-world distance apart.")
        calibrate = st.checkbox("I have calibration measurements")
        point1_x = point1_y = point2_x = point2_y = distance_m = None
        if calibrate:
            c1, c2 = st.columns(2)
            point1_x = c1.number_input("Point 1 x (px)", min_value=0, value=0)
            point1_y = c2.number_input("Point 1 y (px)", min_value=0, value=0)
            point2_x = c1.number_input("Point 2 x (px)", min_value=0, value=100)
            point2_y = c2.number_input("Point 2 y (px)", min_value=0, value=0)
            distance_m = st.number_input("Real-world distance between the points (m)", min_value=0.1, value=10.0)
        dir_a = st.text_input("Direction A label", value="direction A")
        dir_b = st.text_input("Direction B label", value="direction B")
        started_date = st.date_input("Recording start date", value=datetime.now().date())
        started_time = st.time_input("Recording start time", value=datetime.now().time())
        submitted = st.form_submit_button("Process camera")

    if submitted:
        if not video_file:
            st.error("Attach a video file first.")
        else:
            calibration = None
            if calibrate:
                calibration = Calibration(
                    point1=(float(point1_x), float(point1_y)),
                    point2=(float(point2_x), float(point2_y)),
                    distance_m=float(distance_m),
                )
            with NamedTemporaryFile(suffix=Path(video_file.name).suffix, delete=False) as tmp:
                tmp.write(video_file.read())
                tmp_path = tmp.name
            with st.spinner(f"Processing {label or video_file.name}..."):
                try:
                    analytics = analyze_video(tmp_path, calibration=calibration)
                except (OSError, ValueError, RuntimeError) as exc:
                    st.error(f"Could not process this video: {exc}")
                else:
                    camera_id = f"cam-{len(st.session_state.camera_runs) + 1}"
                    started_at = datetime.combine(started_date, started_time)
                    st.session_state.camera_runs.append(CameraRun(
                        camera_id=camera_id,
                        label=label or video_file.name,
                        started_at=started_at,
                        analytics=analytics,
                        direction_labels=(dir_a or "direction A", dir_b or "direction B"),
                    ))
                    st.success(f"Added {label or video_file.name}.")
            Path(tmp_path).unlink(missing_ok=True)

    if st.session_state.camera_runs:
        st.divider()
        st.subheader("Cameras")
        for i, run in enumerate(st.session_state.camera_runs):
            cols = st.columns([4, 1])
            cols[0].write(f"**{run.label}** — {run.started_at:%Y-%m-%d %H:%M}")
            if cols[1].button("Remove", key=f"remove-{i}"):
                st.session_state.camera_runs.pop(i)
                st.rerun()

runs = st.session_state.camera_runs
if not runs:
    st.info("Add a camera in the sidebar to see the dashboard.")
    st.stop()

summary = hourly_summary(runs)

total_vehicles = int(summary["vehicle_count"].sum()) if not summary.empty else 0
avg_speed = summary["avg_speed_mph"].dropna()
avg_speed_display = f"{avg_speed.mean():.0f} mph" if not avg_speed.empty else "unavailable"

kpi1, kpi2, kpi3 = st.columns(3)
kpi1.metric("Vehicles tracked", total_vehicles)
kpi2.metric("Average speed", avg_speed_display)
kpi3.metric("Cameras", len(runs))

if summary.empty:
    st.warning("No vehicles were tracked in the videos added so far.")
    st.stop()

st.subheader("Vehicles per hour, by class")
by_hour_class = summary.pivot_table(
    index="hour_start", columns="vehicle_class", values="vehicle_count", aggfunc="sum", fill_value=0
)
st.bar_chart(by_hour_class)

col_a, col_b = st.columns(2)
with col_a:
    st.subheader("Direction split")
    by_direction = summary.groupby("direction")["vehicle_count"].sum()
    st.bar_chart(by_direction)
with col_b:
    st.subheader("Average speed per hour")
    by_hour_speed = summary.dropna(subset=["avg_speed_mph"]).groupby("hour_start")["avg_speed_mph"].mean()
    if by_hour_speed.empty:
        st.caption("No calibrated speed data in these videos yet.")
    else:
        st.bar_chart(by_hour_speed)

st.subheader("Hourly summary")
st.dataframe(summary, use_container_width=True)
