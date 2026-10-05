"""Streamlit dashboard: add one or more camera videos, see counts, speed
distribution, and direction split, aggregated by hour. Deployable free on
Streamlit Community Cloud. Run locally with: streamlit run dashboard/app.py
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta
from pathlib import Path
from tempfile import NamedTemporaryFile

import pandas as pd
import streamlit as st

from core.speed_estimator import Calibration
from dashboard.aggregator import CameraRun, hourly_summary
from dashboard.i18n import DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, t
from dashboard.pipeline import analyze_video

# The live-camera tab (streamlit-webrtc + its native aiortc/av dependencies)
# is the newest, least battle-tested part of this app on free hosting. If it
# fails to import for any reason (a missing system library on the host, a
# dependency version mismatch, etc.), that must not take the whole dashboard
# down with it - uploaded-video analysis is the app's core feature and has
# to keep working regardless. So this import is isolated and checked, and
# the rest of the app only offers the live-camera tab when it actually
# succeeded.
try:
    from streamlit_webrtc import WebRtcMode, webrtc_streamer

    from dashboard.live import LiveTrafficProcessor, ManualCalibration

    LIVE_CAMERA_AVAILABLE = True
    LIVE_CAMERA_IMPORT_ERROR = None
except Exception as exc:  # noqa: BLE001 - deliberately broad, see comment above
    LIVE_CAMERA_AVAILABLE = False
    LIVE_CAMERA_IMPORT_ERROR = str(exc)

# Free STUN server so the browser-to-Streamlit-Cloud video connection can
# traverse NAT at all (streamlit-webrtc's own docs: this is required for any
# non-localhost deployment, Streamlit Community Cloud explicitly included).
# This is Google's public STUN server - free, no signup. STUN alone still
# cannot always get through carrier-grade NAT on mobile data connections;
# that needs a TURN relay too, which every free option is either unstable
# (Open Relay) or requires its own account (Cloudflare, Twilio) - not added
# here to keep this zero-cost and zero-signup. The on-screen caption says
# this plainly rather than implying the live feed will always connect.
LIVE_CAMERA_RTC_CONFIG = {"iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]}
from dashboard.units import DEFAULT_UNIT, SUPPORTED_UNITS, convert_speed, format_speed
from data_layers import get_country_context, get_county_fatal_crashes, get_nearby_speed_limit
from data_layers.weather import get_hourly_weather, representative_conditions
from dashboard.weather_correlation import has_enough_for_a_trend_note, speed_weather_table
from dashboard.risk_context import build_risk_context
from dashboard.export import build_export_payload
import json

st.set_page_config(page_title="RoadTrace Analytics", layout="wide")


@st.cache_data(ttl=24 * 3600, show_spinner=False)
def _cached_country_context(country_iso2: str):
    return get_country_context(country_iso2)


@st.cache_data(ttl=24 * 3600, show_spinner=False)
def _cached_speed_limit(latitude: float, longitude: float):
    return get_nearby_speed_limit(latitude, longitude)


@st.cache_data(ttl=3 * 3600, show_spinner=False)
def _cached_weather(latitude: float, longitude: float, start, end):
    return get_hourly_weather(latitude, longitude, start, end)


@st.cache_data(ttl=24 * 3600, show_spinner=False)
def _cached_county_crash_stats(state_fips: str, county_fips: str, year: int):
    return get_county_fatal_crashes(state_fips, county_fips, year)

if "camera_runs" not in st.session_state:
    st.session_state.camera_runs: list[CameraRun] = []
if "language" not in st.session_state:
    st.session_state.language = DEFAULT_LANGUAGE
if "unit" not in st.session_state:
    st.session_state.unit = DEFAULT_UNIT

top_left, top_right = st.columns([5, 2])
with top_right:
    lang_col, unit_col = st.columns(2)
    st.session_state.language = lang_col.selectbox(
        t("label_language", st.session_state.language),
        options=list(SUPPORTED_LANGUAGES),
        format_func=lambda code: SUPPORTED_LANGUAGES[code],
        index=list(SUPPORTED_LANGUAGES).index(st.session_state.language),
    )
    st.session_state.unit = unit_col.selectbox(
        t("label_units", st.session_state.language),
        options=SUPPORTED_UNITS,
        index=SUPPORTED_UNITS.index(st.session_state.unit),
    )

lang = st.session_state.language
unit = st.session_state.unit

with top_left:
    st.title(t("app_title", lang))
    st.caption(t("app_caption", lang))
    st.markdown(f"[{t('text_try_on_device', lang)}](https://anurodhsingh3862.github.io/RoadTrace-Analytics/)")

with st.expander(t("expander_live_camera", lang), expanded=False):
    if not LIVE_CAMERA_AVAILABLE:
        st.warning(t("warning_live_camera_unavailable", lang))
        st.caption(f"({LIVE_CAMERA_IMPORT_ERROR})")
    else:
        st.caption(t("caption_live_camera", lang))
        st.caption(t("caption_live_network_note", lang))
        live_calibrate = st.checkbox(t("checkbox_live_calibrate", lang), key="live_calibrate")
        live_calibration = None
        if live_calibrate:
            lc1, lc2 = st.columns(2)
            with lc1:
                live_p1x = st.number_input("Point 1 x", min_value=0, value=0, key="live_p1x")
                live_p1y = st.number_input("Point 1 y", min_value=0, value=0, key="live_p1y")
            with lc2:
                live_p2x = st.number_input("Point 2 x", min_value=0, value=100, key="live_p2x")
                live_p2y = st.number_input("Point 2 y", min_value=0, value=0, key="live_p2y")
            st.caption(t("label_live_point1", lang) + " / " + t("label_live_point2", lang))
            live_distance_m = st.number_input(t("label_live_distance", lang), min_value=0.1, value=10.0, key="live_distance")
            try:
                live_calibration = ManualCalibration(
                    point1=(float(live_p1x), float(live_p1y)),
                    point2=(float(live_p2x), float(live_p2y)),
                    distance_m=float(live_distance_m),
                )
            except ValueError as exc:
                st.error(str(exc))
                live_calibration = None

        webrtc_ctx = webrtc_streamer(
            key="live-traffic",
            mode=WebRtcMode.SENDRECV,
            rtc_configuration=LIVE_CAMERA_RTC_CONFIG,
            video_processor_factory=lambda: LiveTrafficProcessor(live_calibration),
            media_stream_constraints={"video": True, "audio": False},
        )

        if webrtc_ctx.video_processor:
            live_stats_placeholder = st.empty()
            while webrtc_ctx.state.playing:
                snapshot = webrtc_ctx.video_processor.stats.snapshot()
                with live_stats_placeholder.container():
                    st.metric(t("metric_live_vehicles", lang), snapshot["total_vehicles"])
                    if snapshot["counts_by_class"]:
                        st.write(snapshot["counts_by_class"])
                    if snapshot["live_speeds_mph"]:
                        speeds_text = ", ".join(
                            format_speed(s, unit) for s in snapshot["live_speeds_mph"]
                        )
                        st.write(t("text_live_speeds", lang, speeds=speeds_text))
                time.sleep(1)

with st.sidebar:
    st.header(t("sidebar_header", lang))
    with st.form("add_camera", clear_on_submit=True):
        label = st.text_input(t("label_camera_label", lang), placeholder=t("placeholder_camera_label", lang))
        video_file = st.file_uploader(t("label_video_file", lang), type=["mp4", "mov", "avi", "mkv"])
        st.caption(t("caption_calibration", lang))
        calibrate = st.checkbox(t("checkbox_calibrate", lang))
        point1_x = point1_y = point2_x = point2_y = distance_m = None
        if calibrate:
            c1, c2 = st.columns(2)
            point1_x = c1.number_input(t("label_point1_x", lang), min_value=0, value=0)
            point1_y = c2.number_input(t("label_point1_y", lang), min_value=0, value=0)
            point2_x = c1.number_input(t("label_point2_x", lang), min_value=0, value=100)
            point2_y = c2.number_input(t("label_point2_y", lang), min_value=0, value=0)
            distance_m = st.number_input(t("label_distance_m", lang), min_value=0.1, value=10.0)
        dir_a = st.text_input(t("label_dir_a", lang), value="direction A")
        dir_b = st.text_input(t("label_dir_b", lang), value="direction B")
        started_date = st.date_input(t("label_start_date", lang), value=datetime.now().date())
        started_time = st.time_input(t("label_start_time", lang), value=datetime.now().time())

        st.caption(t("caption_location", lang))
        add_location = st.checkbox(t("checkbox_add_location", lang))
        country_code = latitude = longitude = us_county_fips = None
        if add_location:
            country_code = st.text_input(t("label_country_code", lang), max_chars=2)
            loc_c1, loc_c2 = st.columns(2)
            latitude = loc_c1.number_input(t("label_latitude", lang), value=0.0, format="%.6f")
            longitude = loc_c2.number_input(t("label_longitude", lang), value=0.0, format="%.6f")
            us_county_fips = st.text_input(t("label_us_county_fips", lang), max_chars=5)
            st.caption(t("caption_us_county_fips", lang))

        submitted = st.form_submit_button(t("button_process", lang))

    if submitted:
        if not video_file:
            st.error(t("error_no_video", lang))
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
            with st.spinner(t("spinner_processing", lang, name=label or video_file.name)):
                try:
                    analytics = analyze_video(tmp_path, calibration=calibration)
                except (OSError, ValueError, RuntimeError) as exc:
                    st.error(t("error_processing", lang, error=exc))
                else:
                    camera_id = f"cam-{len(st.session_state.camera_runs) + 1}"
                    started_at = datetime.combine(started_date, started_time)
                    st.session_state.camera_runs.append(CameraRun(
                        camera_id=camera_id,
                        label=label or video_file.name,
                        started_at=started_at,
                        analytics=analytics,
                        direction_labels=(dir_a or "direction A", dir_b or "direction B"),
                        country_iso2=(country_code or "").strip().upper() or None,
                        latitude=float(latitude) if add_location and latitude else None,
                        longitude=float(longitude) if add_location and longitude else None,
                        us_county_fips=(us_county_fips or "").strip() or None,
                    ))
                    st.success(t("success_added", lang, name=label or video_file.name))
            Path(tmp_path).unlink(missing_ok=True)

    if st.session_state.camera_runs:
        st.divider()
        st.subheader(t("subheader_cameras", lang))
        for i, run in enumerate(st.session_state.camera_runs):
            cols = st.columns([4, 1])
            cols[0].write(f"**{run.label}** — {run.started_at:%Y-%m-%d %H:%M}")
            if cols[1].button(t("button_remove", lang), key=f"remove-{i}"):
                st.session_state.camera_runs.pop(i)
                st.rerun()

runs = st.session_state.camera_runs
if not runs:
    st.info(t("info_add_camera", lang))
    st.stop()

summary = hourly_summary(runs)

total_vehicles = int(summary["vehicle_count"].sum()) if not summary.empty else 0
avg_speed_mph = summary["avg_speed_mph"].dropna()
avg_speed_display = (
    format_speed(float(avg_speed_mph.mean()), unit) if not avg_speed_mph.empty else t("unavailable", lang)
)

kpi1, kpi2, kpi3 = st.columns(3)
kpi1.metric(t("metric_vehicles_tracked", lang), total_vehicles)
kpi2.metric(t("metric_avg_speed", lang), avg_speed_display)
kpi3.metric(t("metric_cameras", lang), len(runs))

risk_contexts = []
weather_table = pd.DataFrame()

located_runs = [r for r in runs if r.country_iso2 or (r.latitude and r.longitude) or r.us_county_fips]
if located_runs:
    st.subheader(t("subheader_road_safety_context", lang))
    for run in located_runs:
        with st.expander(run.label):
            context = None
            speed_limit = None
            conditions = None
            crash_stats = None
            if run.country_iso2:
                context = _cached_country_context(run.country_iso2)
                if context.world_bank:
                    st.write(t(
                        "text_wb_rate", lang,
                        rate=context.world_bank.deaths_per_100k, year=context.world_bank.year,
                    ))
                if context.who:
                    st.write(t("text_who_rate", lang, rate=context.who.deaths_per_100k, year=context.who.year))
                if not context.has_any_data:
                    st.caption(t("text_no_country_data", lang))
            if run.latitude and run.longitude:
                speed_limit = _cached_speed_limit(run.latitude, run.longitude)
                if speed_limit and speed_limit.maxspeed_raw:
                    st.write(t(
                        "text_speed_limit", lang,
                        limit=speed_limit.maxspeed_raw, highway=speed_limit.highway_type or t("unavailable", lang),
                    ))
                else:
                    st.caption(t("text_speed_limit_unknown", lang))

                run_df = run.analytics.dataframe()
                duration_s = float(run_df["timestamp_s"].max()) if not run_df.empty else 0.0
                window_end = run.started_at + timedelta(seconds=duration_s)
                weather_hours = _cached_weather(run.latitude, run.longitude, run.started_at, window_end)
                conditions = representative_conditions(weather_hours) if weather_hours else None
                if conditions:
                    st.write(t(
                        "text_weather", lang,
                        temp=round(conditions.temperature_c), precip=conditions.precipitation_mm,
                        wind=round(conditions.windspeed_kmh),
                    ))
                else:
                    st.caption(t("text_weather_unavailable", lang))

            if run.us_county_fips and len(run.us_county_fips) == 5:
                state_fips, county_fips = run.us_county_fips[:2], run.us_county_fips[2:]
                crash_stats = _cached_county_crash_stats(state_fips, county_fips, run.started_at.year)
                if crash_stats:
                    st.write(t(
                        "text_county_crashes", lang,
                        count=crash_stats.fatal_crash_count, year=crash_stats.year,
                    ))
                else:
                    st.caption(t("text_county_crashes_unavailable", lang))

            risk = build_risk_context(
                run, summary, speed_limit=speed_limit, country_context=context, weather=conditions,
                county_crash_stats=crash_stats,
            )
            if risk.percent_hours_over_limit is not None:
                st.write(t(
                    "text_percent_over_limit", lang,
                    percent=round(risk.percent_hours_over_limit),
                    avg=round(risk.avg_speed_kmh), limit=round(risk.posted_limit_kmh),
                ))
            st.caption(t("text_context_disclaimer", lang))
            st.caption(t("text_no_risk_score", lang))
            risk_contexts.append(risk)

located_with_coords = [r for r in runs if r.latitude and r.longitude]
if located_with_coords:
    weather_table = speed_weather_table(located_with_coords, summary)
    if not weather_table.empty:
        st.subheader(t("subheader_speed_vs_weather", lang))
        display_weather = weather_table.copy()
        display_weather["avg_speed"] = display_weather["avg_speed_mph"].apply(lambda v: convert_speed(v, unit))
        st.dataframe(
            display_weather.drop(columns=["avg_speed_mph"]).rename(columns={"avg_speed": f"avg_speed_{unit}"}),
            use_container_width=True,
        )
        if not has_enough_for_a_trend_note(weather_table):
            st.caption(t("caption_weather_sample_too_small", lang))

st.divider()
export_payload = build_export_payload(
    runs, summary, risk_contexts=risk_contexts,
    speed_weather_table=weather_table if not weather_table.empty else None,
    unit=unit,
)
st.download_button(
    label=t("button_export_results", lang),
    data=json.dumps(export_payload, indent=2),
    file_name="roadtrace-export.json",
    mime="application/json",
    help=t("caption_export_results", lang),
)

if summary.empty:
    st.warning(t("warning_no_vehicles", lang))
    st.stop()

display = summary.copy()
display["avg_speed"] = display["avg_speed_mph"].apply(lambda v: convert_speed(v, unit) if pd.notna(v) else v)
display["median_speed"] = display["median_speed_mph"].apply(lambda v: convert_speed(v, unit) if pd.notna(v) else v)

st.subheader(t("subheader_vehicles_per_hour", lang))
by_hour_class = display.pivot_table(
    index="hour_start", columns="vehicle_class", values="vehicle_count", aggfunc="sum", fill_value=0
)
st.bar_chart(by_hour_class)

col_a, col_b = st.columns(2)
with col_a:
    st.subheader(t("subheader_direction_split", lang))
    by_direction = display.groupby("direction")["vehicle_count"].sum()
    st.bar_chart(by_direction)
with col_b:
    st.subheader(t("subheader_avg_speed_per_hour", lang))
    by_hour_speed = display.dropna(subset=["avg_speed"]).groupby("hour_start")["avg_speed"].mean()
    if by_hour_speed.empty:
        st.caption(t("caption_no_speed_data", lang))
    else:
        st.bar_chart(by_hour_speed)

st.subheader(t("subheader_hourly_summary", lang))
table = display.drop(columns=["avg_speed_mph", "median_speed_mph"]).rename(columns={
    "avg_speed": f"avg_speed_{unit}", "median_speed": f"median_speed_{unit}",
})
st.dataframe(table, use_container_width=True)
