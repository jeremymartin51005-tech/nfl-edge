"""Design tokens, global CSS and the Plotly template."""
from __future__ import annotations

import plotly.graph_objects as go
import plotly.io as pio
import streamlit as st

# Surfaces & ink
BG = "#0c0d10"
SURFACE = "#14161b"
SURFACE_2 = "#1a1d23"
BORDER = "#262a32"
GRID = "#22262d"
TEXT = "#eef0f3"
TEXT_2 = "#a3a9b4"
MUTED = "#6c727d"

# Series (validated dark-mode categorical slots) + status accents
BLUE = "#3987e5"      # series 1: home / favorite / primary
ORANGE = "#d95926"    # series 2: away / underdog / comparison
AQUA = "#199e70"      # series 3
GREEN = "#2fb46e"     # win / cover / positive
RED = "#e05a5a"       # loss / no cover / negative
GRAY = "#5b616b"      # push / neutral

FONT = "Inter, -apple-system, Segoe UI, Roboto, sans-serif"

CSS = f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

html, body, [class*="css"], .stApp {{ font-family: {FONT}; }}
.stApp {{ background: {BG}; }}
[data-testid="stSidebar"] {{ background: #101216; border-right: 1px solid {BORDER}; }}
[data-testid="stHeader"] {{ background: transparent; }}
.block-container {{ padding: 1.4rem 2.2rem 3rem 2.2rem; max-width: 1560px; }}
[data-testid="stSidebarHeader"] {{ padding-bottom: .4rem; }}
[data-testid="stLogo"] {{ height: 2.1rem; }}
h1, h2, h3 {{ letter-spacing: -0.01em; }}
h1 {{ font-size: 1.55rem !important; font-weight: 650 !important; margin-bottom: 0 !important; }}
h3 {{ font-size: 1.02rem !important; font-weight: 600 !important; color: {TEXT}; }}
[data-testid="stCaptionContainer"] {{ color: {MUTED}; }}

/* page header */
.ne-head {{ display:flex; align-items:baseline; gap:14px; margin-bottom:2px; }}
.ne-head h1 {{ margin:0; }}
.ne-sub {{ color:{TEXT_2}; font-size:0.86rem; margin: 2px 0 12px 0; }}

/* filter chips */
.ne-chips {{ display:flex; flex-wrap:wrap; gap:6px; margin: 4px 0 16px 0; align-items:center; }}
.ne-chip {{ font-size:0.74rem; color:{TEXT_2}; background:{SURFACE}; border:1px solid {BORDER};
            border-radius:999px; padding:3px 10px; white-space:nowrap; }}
.ne-chip b {{ color:{TEXT}; font-weight:600; }}
.ne-chip.n {{ border-color:#2b4a72; color:#cfe1f7; background:#132033; }}

/* KPI cards */
.ne-kpis {{ display:grid; grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr)); gap:10px; margin: 2px 0 14px 0; }}
@media (max-width: 1250px) {{ .ne-kpis {{ grid-template-columns: repeat(4, minmax(0,1fr)); }} }}
@media (max-width: 760px) {{ .ne-kpis {{ grid-template-columns: repeat(2, minmax(0,1fr)); }} }}
.ne-kpi {{ background:{SURFACE}; border:1px solid {BORDER}; border-radius:10px; padding:11px 13px 10px; position:relative; }}
.ne-kpi .lab {{ color:{TEXT_2}; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.06em; font-weight:500;
               display:flex; align-items:center; gap:5px; }}
.ne-kpi .val {{ color:{TEXT}; font-size:1.36rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:650; margin-top:4px; font-variant-numeric: tabular-nums; line-height:1.15; }}
.ne-kpi .sub {{ color:{MUTED}; font-size:0.74rem; margin-top:3px; font-variant-numeric: tabular-nums; }}
.ne-kpi .sub .up {{ color:{GREEN}; }} .ne-kpi .sub .dn {{ color:{RED}; }}
.ne-kpi .bar {{ position:absolute; left:0; top:10px; bottom:10px; width:2px; border-radius:2px; }}

/* tooltip */
.ne-tip {{ position:relative; display:inline-flex; cursor:help; color:{MUTED}; font-size:0.72rem;
          border:1px solid {BORDER}; border-radius:50%; width:14px; height:14px; align-items:center; justify-content:center;
          text-transform:none; letter-spacing:0; }}
.ne-tip .txt {{ visibility:hidden; opacity:0; position:absolute; z-index:50; left:-8px; top:20px; width:250px;
               background:#1e2229; color:{TEXT}; border:1px solid {BORDER}; border-radius:8px; padding:8px 10px;
               font-size:0.76rem; line-height:1.4; font-weight:400; box-shadow: 0 8px 24px rgba(0,0,0,.45);
               transition: opacity .12s ease; }}
.ne-tip:hover .txt {{ visibility:visible; opacity:1; }}

/* section heading */
.ne-sec {{ display:flex; align-items:center; gap:8px; margin: 18px 0 6px 0; }}
.ne-sec .t {{ font-size:0.95rem; font-weight:600; color:{TEXT}; }}
.ne-sec .d {{ font-size:0.78rem; color:{MUTED}; }}

/* notes / callouts */
.ne-note {{ background:{SURFACE}; border:1px solid {BORDER}; border-left:2px solid {BLUE}; border-radius:8px;
           padding:9px 12px; font-size:0.82rem; color:{TEXT_2}; margin: 6px 0 12px 0; line-height:1.5; }}
.ne-note b {{ color:{TEXT}; font-weight:600; }}
.ne-note.warn {{ border-left-color:#c98500; }}
.ne-note.red {{ border-left-color:{RED}; }}
.ne-insights {{ display:grid; grid-template-columns: repeat(auto-fill, minmax(280px,1fr)); gap:10px; margin-bottom:8px; }}
.ne-insight {{ background:{SURFACE}; border:1px solid {BORDER}; border-radius:8px; padding:10px 12px; font-size:0.82rem; color:{TEXT_2}; line-height:1.45; }}
.ne-insight .k {{ font-size:0.7rem; text-transform:uppercase; letter-spacing:.06em; color:{MUTED}; margin-bottom:3px; }}
.ne-insight b {{ color:{TEXT}; }}

/* chart card */
[data-testid="stPlotlyChart"] {{ background:{SURFACE}; border:1px solid {BORDER}; border-radius:10px; overflow:hidden; box-sizing:border-box; }}

/* detail panel */
.ne-panel {{ background:{SURFACE}; border:1px solid {BORDER}; border-radius:10px; padding:14px 16px; }}
.ne-panel .meta {{ color:{MUTED}; font-size:0.75rem; text-transform:uppercase; letter-spacing:.06em; }}
.ne-score {{ display:grid; grid-template-columns: 1fr auto; row-gap:4px; margin:10px 0 12px; font-variant-numeric: tabular-nums; }}
.ne-score .tm {{ font-size:1.05rem; color:{TEXT_2}; }} .ne-score .tm.w {{ color:{TEXT}; font-weight:650; }}
.ne-score .pts {{ font-size:1.25rem; color:{TEXT_2}; text-align:right; font-weight:600; }} .ne-score .pts.w {{ color:{TEXT}; }}
.ne-kv {{ display:grid; grid-template-columns: auto 1fr; column-gap:14px; row-gap:5px; font-size:0.82rem; }}
.ne-kv .k {{ color:{MUTED}; }} .ne-kv .v {{ color:{TEXT}; text-align:right; font-variant-numeric: tabular-nums; }}
.ne-hr {{ border-top:1px solid {BORDER}; margin:11px 0; }}
.ne-pill {{ display:inline-block; font-size:0.72rem; padding:1px 8px; border-radius:999px; font-weight:600; }}
.ne-pill.g {{ background:rgba(47,180,110,.14); color:{GREEN}; }}
.ne-pill.r {{ background:rgba(224,90,90,.14); color:{RED}; }}
.ne-pill.n {{ background:rgba(140,146,156,.16); color:{TEXT_2}; }}
.ne-pill.b {{ background:rgba(57,135,229,.16); color:#8dbbf2; }}


/* tables */
[data-testid="stDataFrame"] {{ border:1px solid {BORDER}; border-radius:10px; }}
div[data-baseweb="tab-list"] {{ gap: 4px; }}
button[data-baseweb="tab"] {{ font-size:0.86rem; }}
.stDownloadButton button, .stButton button {{ border-radius:8px; font-size:0.82rem; }}
</style>
"""


def inject_css() -> None:
    st.markdown(CSS, unsafe_allow_html=True)


def _template() -> go.layout.Template:
    t = go.layout.Template()
    t.layout = go.Layout(
        font=dict(family=FONT, color=TEXT_2, size=12),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        colorway=[BLUE, ORANGE, AQUA, "#c98500", "#d55181", "#9085e9"],
        title=dict(font=dict(size=14, color=TEXT), x=0.012, xanchor="left", yref="container", y=0.975, yanchor="top"),
        margin=dict(l=52, r=18, t=72, b=44),
        hoverlabel=dict(bgcolor="#1e2229", bordercolor=BORDER, font=dict(color=TEXT, family=FONT, size=12)),
        legend=dict(orientation="h", y=1.03, yanchor="bottom", x=0, xanchor="left",
                    bgcolor="rgba(0,0,0,0)", font=dict(size=11, color=TEXT_2)),
        xaxis=dict(gridcolor=GRID, zeroline=False, linecolor=BORDER, tickcolor=BORDER,
                   showgrid=False, title=dict(font=dict(size=11, color=MUTED))),
        yaxis=dict(gridcolor=GRID, zeroline=False, linecolor=BORDER, showline=False,
                   title=dict(font=dict(size=11, color=MUTED))),
        bargap=0.28,
        bargroupgap=0.06,
        hovermode="closest",
    )
    return t


pio.templates["nfl_edge"] = _template()
pio.templates.default = "nfl_edge"
